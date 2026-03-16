import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { Layout } from '@/components/layout/Layout';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import {
  Calculator, TrendingUp, Calendar,
  Euro, Users, Building2, ArrowUpRight,
  Loader2, Download, RefreshCw
} from 'lucide-react';

interface RevenueStats {
  today: { gross: number; net: number; vat: number; count: number };
  month: { gross: number; net: number; vat: number; count: number };
  year: { gross: number; net: number; vat: number; count: number };
}

interface LineRevenue {
  id: string;
  name: string;
  gross: number;
  net: number;
  vat: number;
  count: number;
  commissions: number;
}

interface CallCenterRevenue {
  id: string;
  name: string;
  gross: number;
  net: number;
  employeeCount: number;
  topEmployee?: { name: string; revenue: number };
}

const currencyFormatter = new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR' });

export default function AccountingDashboard() {
  const { user, loading } = useAuth();
  const navigate = useNavigate();
  const { toast } = useToast();
  
  const [isLoading, setIsLoading] = useState(true);
  const [stats, setStats] = useState<RevenueStats>({
    today: { gross: 0, net: 0, vat: 0, count: 0 },
    month: { gross: 0, net: 0, vat: 0, count: 0 },
    year: { gross: 0, net: 0, vat: 0, count: 0 }
  });
  const [lineRevenues, setLineRevenues] = useState<LineRevenue[]>([]);
  const [callCenterRevenues, setCallCenterRevenues] = useState<CallCenterRevenue[]>([]);
  const [selectedPeriod, setSelectedPeriod] = useState('month');
  const [vatRate, setVatRate] = useState(19);

  useEffect(() => {
    if (!loading && !user) {
      navigate('/auth');
      return;
    }
    // Server-side role check via RPC - do NOT rely on client profile.role alone
    if (user) {
      const checkAdminAndLoad = async () => {
        const { data: isAdmin } = await supabase.rpc('is_admin');
        if (!isAdmin) {
          navigate('/dashboard');
          return;
        }
        loadAllData();
      };
      checkAdminAndLoad();
    }
  }, [user, loading, navigate, loadAllData]);

  const loadAllData = useCallback(async () => {
    setIsLoading(true);
    // Load VAT rate first so subsequent calculations use the correct rate
    await loadVatRate();
    await Promise.all([
      loadRevenueStats(),
      loadLineRevenues(),
      loadCallCenterRevenues(),
    ]);
    setIsLoading(false);
  }, [loadVatRate, loadRevenueStats, loadLineRevenues, loadCallCenterRevenues]);

  const loadVatRate = useCallback(async () => {
    const { data, error } = await supabase
      .from('billing_config')
      .select('vat_rate')
      .eq('is_active', true)
      .maybeSingle();
    if (!error && data) setVatRate(data.vat_rate);
  }, []);

  const loadRevenueStats = useCallback(async () => {
    const now = new Date();
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const yearStart = new Date(now.getFullYear(), 0, 1);

    // Today's transactions
    const { data: todayTx } = await supabase
      .from('transactions')
      .select('amount')
      .gte('created_at', todayStart.toISOString())
      .eq('status', 'completed');

    // This month's transactions
    const { data: monthTx } = await supabase
      .from('transactions')
      .select('amount')
      .gte('created_at', monthStart.toISOString())
      .eq('status', 'completed');

    // This year's transactions
    const { data: yearTx } = await supabase
      .from('transactions')
      .select('amount')
      .gte('created_at', yearStart.toISOString())
      .eq('status', 'completed');

    const calcStats = (txs: { amount: number }[] | null) => {
      const gross = txs?.reduce((sum, t) => sum + Number(t.amount), 0) || 0;
      const net = gross / (1 + vatRate / 100);
      const vat = gross - net;
      return { gross, net, vat, count: txs?.length || 0 };
    };

    setStats({
      today: calcStats(todayTx),
      month: calcStats(monthTx),
      year: calcStats(yearTx)
    });
  }, [vatRate]);

  const loadLineRevenues = useCallback(async () => {
    // Fetch partners with transactions AND all commissions in parallel (eliminates N+1)
    const [{ data: partners }, { data: allCommissions }] = await Promise.all([
      supabase
        .from('profiles')
        .select(`
          id, first_name, last_name,
          transactions:transactions!customer_id(amount, status)
        `)
        .order('last_name'),
      supabase
        .from('commissions')
        .select('partner_id, commission_amount'),
    ]);

    // Index commissions by partner_id for O(1) lookup
    const commissionsByPartner = new Map<string, number>();
    for (const c of allCommissions || []) {
      commissionsByPartner.set(
        c.partner_id,
        (commissionsByPartner.get(c.partner_id) || 0) + Number(c.commission_amount)
      );
    }

    const lines: LineRevenue[] = [];

    for (const partner of partners || []) {
      const completedTx = partner.transactions?.filter((t: any) => t.status === 'completed') || [];
      const gross = completedTx.reduce((sum: number, t: any) => sum + Number(t.amount), 0);

      if (gross > 0) {
        const commissionTotal = commissionsByPartner.get(partner.id) || 0;
        const net = gross / (1 + vatRate / 100);

        lines.push({
          id: partner.id,
          name: `${partner.first_name} ${partner.last_name}`,
          gross,
          net,
          vat: gross - net,
          count: completedTx.length,
          commissions: commissionTotal
        });
      }
    }

    setLineRevenues(lines.sort((a, b) => b.gross - a.gross).slice(0, 20));
  }, [vatRate]);

  const loadCallCenterRevenues = useCallback(async () => {
    // Fetch centers with employees, and all completed transactions in parallel (eliminates N*M+1)
    const [{ data: centers }, { data: allTx }] = await Promise.all([
      supabase
        .from('call_centers')
        .select(`
          id, name,
          employees:call_center_employees(
            id, profile_id,
            profile:profiles!profile_id(first_name, last_name)
          )
        `),
      supabase
        .from('transactions')
        .select('customer_id, amount')
        .eq('status', 'completed'),
    ]);

    // Index transactions by customer_id for O(1) lookup
    const txByCustomer = new Map<string, number>();
    for (const tx of allTx || []) {
      txByCustomer.set(
        tx.customer_id,
        (txByCustomer.get(tx.customer_id) || 0) + Number(tx.amount)
      );
    }

    const revenues: CallCenterRevenue[] = [];

    for (const center of centers || []) {
      let totalGross = 0;
      let topEmployee = { name: '', revenue: 0 };

      for (const emp of center.employees || []) {
        const empRevenue = txByCustomer.get(emp.profile_id) || 0;
        totalGross += empRevenue;

        if (empRevenue > topEmployee.revenue) {
          topEmployee = {
            name: `${emp.profile?.first_name} ${emp.profile?.last_name}`,
            revenue: empRevenue
          };
        }
      }

      if (totalGross > 0 || center.employees?.length) {
        revenues.push({
          id: center.id,
          name: center.name,
          gross: totalGross,
          net: totalGross / (1 + vatRate / 100),
          employeeCount: center.employees?.length || 0,
          topEmployee: topEmployee.revenue > 0 ? topEmployee : undefined
        });
      }
    }

    setCallCenterRevenues(revenues.sort((a, b) => b.gross - a.gross));
  }, [vatRate]);

  const formatCurrency = useCallback((amount: number) => {
    return currencyFormatter.format(amount);
  }, []);

  const exportData = () => {
    const data = {
      exportDate: new Date().toISOString(),
      stats,
      lineRevenues,
      callCenterRevenues
    };
    
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `buchhaltung-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
    
    toast({ title: 'Export erfolgreich', description: 'Daten wurden exportiert.' });
  };

  if (loading || isLoading) {
    return (
      <Layout>
        <div className="container py-8 flex items-center justify-center min-h-[60vh]">
          <Loader2 className="h-8 w-8 animate-spin" />
        </div>
      </Layout>
    );
  }

  return (
    <Layout>
      <div className="container px-4 sm:px-6 py-6 sm:py-8">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between mb-6 sm:mb-8 gap-4">
          <div className="min-w-0">
            <h1 className="text-xl sm:text-2xl md:text-3xl font-bold flex items-center gap-2">
              <Calculator className="h-6 w-6 sm:h-8 sm:w-8 shrink-0" />
              Buchhaltungs-Dashboard
            </h1>
            <p className="text-sm sm:text-base text-muted-foreground">Vollständige Übersicht über alle Umsätze und Provisionen</p>
          </div>
          <div className="flex gap-2 shrink-0">
            <Button variant="outline" size="sm" onClick={loadAllData}>
              <RefreshCw className="h-4 w-4 sm:mr-2" />
              <span className="hidden sm:inline">Aktualisieren</span>
            </Button>
            <Button size="sm" onClick={exportData}>
              <Download className="h-4 w-4 sm:mr-2" />
              <span className="hidden sm:inline">Exportieren</span>
            </Button>
          </div>
        </div>

        {/* Revenue Overview Cards */}
        <div className="grid sm:grid-cols-2 md:grid-cols-3 gap-4 sm:gap-6 mb-6 sm:mb-8">
          {/* Today */}
          <Card className="border-l-4 border-l-blue-500">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                <Calendar className="h-4 w-4" />
                Heute
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold">{formatCurrency(stats.today.gross)}</div>
              <div className="grid grid-cols-2 gap-2 mt-4 text-sm">
                <div>
                  <span className="text-muted-foreground">Netto:</span>
                  <span className="ml-2 font-medium">{formatCurrency(stats.today.net)}</span>
                </div>
                <div>
                  <span className="text-muted-foreground">MwSt:</span>
                  <span className="ml-2 font-medium">{formatCurrency(stats.today.vat)}</span>
                </div>
              </div>
              <Badge variant="outline" className="mt-2">{stats.today.count} Transaktionen</Badge>
            </CardContent>
          </Card>

          {/* Month */}
          <Card className="border-l-4 border-l-green-500">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                <TrendingUp className="h-4 w-4" />
                Diesen Monat
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold">{formatCurrency(stats.month.gross)}</div>
              <div className="grid grid-cols-2 gap-2 mt-4 text-sm">
                <div>
                  <span className="text-muted-foreground">Netto:</span>
                  <span className="ml-2 font-medium">{formatCurrency(stats.month.net)}</span>
                </div>
                <div>
                  <span className="text-muted-foreground">MwSt:</span>
                  <span className="ml-2 font-medium">{formatCurrency(stats.month.vat)}</span>
                </div>
              </div>
              <Badge variant="outline" className="mt-2">{stats.month.count} Transaktionen</Badge>
            </CardContent>
          </Card>

          {/* Year */}
          <Card className="border-l-4 border-l-purple-500">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                <Euro className="h-4 w-4" />
                Dieses Jahr
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold">{formatCurrency(stats.year.gross)}</div>
              <div className="grid grid-cols-2 gap-2 mt-4 text-sm">
                <div>
                  <span className="text-muted-foreground">Netto:</span>
                  <span className="ml-2 font-medium">{formatCurrency(stats.year.net)}</span>
                </div>
                <div>
                  <span className="text-muted-foreground">MwSt:</span>
                  <span className="ml-2 font-medium">{formatCurrency(stats.year.vat)}</span>
                </div>
              </div>
              <Badge variant="outline" className="mt-2">{stats.year.count} Transaktionen</Badge>
            </CardContent>
          </Card>
        </div>

        <Tabs defaultValue="lines" className="space-y-6">
          <TabsList>
            <TabsTrigger value="lines" className="flex items-center gap-2">
              <Users className="h-4 w-4" />
              Umsatz nach Linien
            </TabsTrigger>
            <TabsTrigger value="callcenters" className="flex items-center gap-2">
              <Building2 className="h-4 w-4" />
              Call Center
            </TabsTrigger>
          </TabsList>

          {/* Lines/Partners Revenue */}
          <TabsContent value="lines">
            <Card>
              <CardHeader>
                <CardTitle>Umsatz nach Partner-Linien</CardTitle>
                <CardDescription>Top 20 Partner nach Umsatz mit Netto/Brutto/MwSt Aufschlüsselung</CardDescription>
              </CardHeader>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Partner</TableHead>
                      <TableHead className="text-right">Transaktionen</TableHead>
                      <TableHead className="text-right">Netto</TableHead>
                      <TableHead className="text-right">MwSt ({vatRate}%)</TableHead>
                      <TableHead className="text-right">Brutto</TableHead>
                      <TableHead className="text-right">Provisionen</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {lineRevenues.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={6} className="text-center py-8 text-muted-foreground">
                          Keine Umsatzdaten vorhanden
                        </TableCell>
                      </TableRow>
                    ) : (
                      lineRevenues.map((line, index) => (
                        <TableRow key={line.id}>
                          <TableCell className="font-medium">
                            <div className="flex items-center gap-2">
                              <Badge variant="outline" className="w-6 h-6 flex items-center justify-center rounded-full">
                                {index + 1}
                              </Badge>
                              {line.name}
                            </div>
                          </TableCell>
                          <TableCell className="text-right">
                            <Badge variant="secondary">{line.count}</Badge>
                          </TableCell>
                          <TableCell className="text-right">{formatCurrency(line.net)}</TableCell>
                          <TableCell className="text-right text-muted-foreground">{formatCurrency(line.vat)}</TableCell>
                          <TableCell className="text-right font-bold">{formatCurrency(line.gross)}</TableCell>
                          <TableCell className="text-right text-green-600">{formatCurrency(line.commissions)}</TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Call Centers */}
          <TabsContent value="callcenters">
            <Card>
              <CardHeader>
                <CardTitle>Call Center Umsätze</CardTitle>
                <CardDescription>Umsatz pro Call Center mit Top-Mitarbeiter</CardDescription>
              </CardHeader>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Call Center</TableHead>
                      <TableHead className="text-right">Mitarbeiter</TableHead>
                      <TableHead className="text-right">Netto</TableHead>
                      <TableHead className="text-right">Brutto</TableHead>
                      <TableHead>Top Mitarbeiter</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {callCenterRevenues.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={5} className="text-center py-8 text-muted-foreground">
                          Keine Call Center vorhanden
                        </TableCell>
                      </TableRow>
                    ) : (
                      callCenterRevenues.map((center) => (
                        <TableRow key={center.id}>
                          <TableCell className="font-medium">{center.name}</TableCell>
                          <TableCell className="text-right">
                            <Badge variant="outline">{center.employeeCount}</Badge>
                          </TableCell>
                          <TableCell className="text-right">{formatCurrency(center.net)}</TableCell>
                          <TableCell className="text-right font-bold">{formatCurrency(center.gross)}</TableCell>
                          <TableCell>
                            {center.topEmployee ? (
                              <div className="flex items-center gap-2">
                                <ArrowUpRight className="h-4 w-4 text-green-500" />
                                <span>{center.topEmployee.name}</span>
                                <span className="text-muted-foreground text-sm">
                                  ({formatCurrency(center.topEmployee.revenue)})
                                </span>
                              </div>
                            ) : (
                              <span className="text-muted-foreground">-</span>
                            )}
                          </TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </Layout>
  );
}
