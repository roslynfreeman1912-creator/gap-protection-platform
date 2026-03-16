import { useEffect, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { Layout } from '@/components/layout/Layout';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { supabase } from '@/integrations/supabase/client';
import { 
  Building2, Users, Target, Euro, Ticket, TrendingUp, 
  Loader2, Shield, BarChart3, Phone, Mail, Copy, UserPlus
} from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

const LEAD_STATUSES: Record<string, { label: string; color: string }> = {
  new: { label: 'Neu', color: 'bg-blue-500' },
  contacted: { label: 'Kontaktiert', color: 'bg-yellow-500' },
  interested: { label: 'Interessiert', color: 'bg-green-500' },
  negotiation: { label: 'Verhandlung', color: 'bg-purple-500' },
  won: { label: 'Gewonnen', color: 'bg-emerald-500' },
  lost: { label: 'Verloren', color: 'bg-red-500' },
  callback: { label: 'Rückruf', color: 'bg-orange-500' },
};

interface DashboardData {
  role: string;
  centerInfo: any;
  allCenters: any[];
  stats: {
    totalLeads: number;
    leadsByStatus: Record<string, number>;
    totalEmployees: number;
    totalRevenue: number;
    totalPromoCodes: number;
    totalPromoUsage: number;
    totalTransactions: number;
  };
  leads: any[];
  promoCodes: any[];
  employees: any[];
  transactions: any[];
}

export default function CallCenterDashboard() {
  const { user, loading: authLoading } = useAuth();
  const navigate = useNavigate();
  const { toast } = useToast();

  const [data, setData] = useState<DashboardData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [selectedCenterId, setSelectedCenterId] = useState<string>('');
  const [createEmpOpen, setCreateEmpOpen] = useState(false);
  const [empForm, setEmpForm] = useState({ first_name: '', last_name: '', email: '', role: 'agent', commission_rate: '0' });
  const [creatingEmp, setCreatingEmp] = useState(false);

  useEffect(() => {
    if (!authLoading && !user) {
      navigate('/auth');
    }
  }, [user, authLoading, navigate]);

  useEffect(() => {
    if (user) loadDashboard();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, selectedCenterId]);

  const loadDashboard = useCallback(async () => {
    setIsLoading(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const params = new URLSearchParams();
      if (selectedCenterId) params.set('call_center_id', selectedCenterId);
      const url = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/callcenter-dashboard?${params.toString()}`;
      const res = await fetch(url, {
        headers: {
          'Authorization': `Bearer ${session?.access_token}`,
          'apikey': import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
          'Content-Type': 'application/json',
        },
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || 'Fehler beim Laden');
      }

      const result = await res.json();
      setData(result);

      // Auto-select first center for admins
      if (result.allCenters?.length > 0 && !selectedCenterId) {
        // Don't auto-select, show global view
      }
    } catch (error: any) {
      console.error('Dashboard load error:', error);
      toast({ variant: 'destructive', title: 'Fehler', description: error.message });
    } finally {
      setIsLoading(false);
    }
  }, [selectedCenterId, toast]);

  const copyCode = (code: string) => {
    navigator.clipboard.writeText(code);
    toast({ title: 'Code kopiert', description: code });
  };

  const createEmployee = async () => {
    if (!empForm.first_name || !empForm.last_name || !empForm.email) {
      toast({ variant: 'destructive', title: 'Fehler', description: 'Bitte alle Pflichtfelder ausfüllen' });
      return;
    }
    const centerId = selectedCenterId && selectedCenterId !== 'all' ? selectedCenterId : data?.centerInfo?.id;
    if (!centerId) {
      toast({ variant: 'destructive', title: 'Fehler', description: 'Bitte zuerst ein Call Center auswählen' });
      return;
    }
    setCreatingEmp(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const url = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/callcenter-dashboard`;
      const res = await fetch(url, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${session?.access_token}`,
          'apikey': import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          action: 'create_employee',
          call_center_id: centerId,
          ...empForm,
          commission_rate: parseFloat(empForm.commission_rate) || 0,
        }),
      });
      const result = await res.json();
      if (!res.ok) throw new Error(result.error || 'Fehler');
      toast({ title: 'Mitarbeiter angelegt', description: `Temp-Passwort: ${result.tempPassword}` });
      setCreateEmpOpen(false);
      setEmpForm({ first_name: '', last_name: '', email: '', role: 'agent', commission_rate: '0' });
      loadDashboard();
    } catch (e: any) {
      toast({ variant: 'destructive', title: 'Fehler', description: e.message });
    } finally {
      setCreatingEmp(false);
    }
  };

  if (authLoading || isLoading) {
    return (
      <Layout>
        <div className="container py-8 flex items-center justify-center min-h-[60vh]">
          <div className="text-center">
            <Loader2 className="h-8 w-8 animate-spin mx-auto mb-4 text-primary" />
            <p className="text-muted-foreground">Lade Call Center Dashboard...</p>
          </div>
        </div>
      </Layout>
    );
  }

  if (!data) {
    return (
      <Layout>
        <div className="container py-8">
          <Card>
            <CardContent className="py-12 text-center">
              <Shield className="h-12 w-12 mx-auto mb-4 text-muted-foreground" />
              <h2 className="text-xl font-bold mb-2">Kein Zugriff</h2>
              <p className="text-muted-foreground">Sie haben keinen Zugriff auf das Call Center Dashboard.</p>
            </CardContent>
          </Card>
        </div>
      </Layout>
    );
  }

  const isGlobal = data.role === 'super_admin' || data.role === 'admin';

  return (
    <Layout>
      <div className="container px-4 sm:px-6 py-6 sm:py-8 space-y-4 sm:space-y-6">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="min-w-0">
            <h1 className="text-xl sm:text-2xl md:text-3xl font-bold flex items-center gap-2 sm:gap-3">
              <Building2 className="h-6 w-6 sm:h-8 sm:w-8 text-primary shrink-0" />
              {data.centerInfo?.name || 'Call Center Dashboard'}
            </h1>
            <p className="text-muted-foreground mt-1">
              {isGlobal ? 'Globale Übersicht aller Call Center' : 'Ihr persönliches Call Center Dashboard'}
            </p>
          </div>
          <div className="flex items-center gap-3">
            <Badge variant="outline" className="text-sm px-3 py-1">
              {data.role === 'super_admin' ? 'Super Admin' : data.role === 'admin' ? 'Admin' : 'Call Center'}
            </Badge>
          </div>
        </div>

        {/* Center Selector for Admins */}
        {isGlobal && data.allCenters.length > 0 && (
          <Card>
            <CardContent className="py-4">
              <div className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-4">
                <span className="text-sm font-medium">Call Center auswählen:</span>
                <Select value={selectedCenterId} onValueChange={setSelectedCenterId}>
                  <SelectTrigger className="w-full sm:w-[300px]">
                    <SelectValue placeholder="Alle Call Center (Globalansicht)" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Alle Call Center</SelectItem>
                    {data.allCenters.map((c) => (
                      <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {selectedCenterId && selectedCenterId !== 'all' && (
                  <Button variant="ghost" size="sm" onClick={() => setSelectedCenterId('')}>
                    Zurück zur Globalansicht
                  </Button>
                )}
              </div>
            </CardContent>
          </Card>
        )}

        {/* Stats Cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">Leads</p>
                  <p className="text-3xl font-bold">{data.stats.totalLeads}</p>
                </div>
                <Target className="h-8 w-8 text-blue-500" />
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">Mitarbeiter</p>
                  <p className="text-3xl font-bold">{data.stats.totalEmployees}</p>
                </div>
                <Users className="h-8 w-8 text-green-500" />
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">Umsatz</p>
                  <p className="text-3xl font-bold">€{data.stats.totalRevenue.toLocaleString('de-DE')}</p>
                </div>
                <Euro className="h-8 w-8 text-yellow-500" />
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">Promo-Code Nutzungen</p>
                  <p className="text-3xl font-bold">{data.stats.totalPromoUsage}</p>
                </div>
                <Ticket className="h-8 w-8 text-purple-500" />
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Lead Status Breakdown */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <BarChart3 className="h-5 w-5" />
              Lead-Status Übersicht
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex flex-wrap gap-3">
              {Object.entries(data.stats.leadsByStatus).map(([status, count]) => {
                const s = LEAD_STATUSES[status];
                return (
                  <div key={status} className="flex items-center gap-2 px-4 py-2 rounded-lg border">
                    <div className={`w-3 h-3 rounded-full ${s?.color || 'bg-gray-400'}`} />
                    <span className="text-sm font-medium">{s?.label || status}</span>
                    <Badge variant="secondary">{count}</Badge>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>

        {/* Tabs */}
        <Tabs defaultValue="promo" className="space-y-4">
          <TabsList>
            <TabsTrigger value="promo" className="flex items-center gap-2">
              <Ticket className="h-4 w-4" />
              Promo-Codes ({data.promoCodes.length})
            </TabsTrigger>
            <TabsTrigger value="leads" className="flex items-center gap-2">
              <Target className="h-4 w-4" />
              Leads ({data.leads.length})
            </TabsTrigger>
            <TabsTrigger value="employees" className="flex items-center gap-2">
              <Users className="h-4 w-4" />
              Mitarbeiter ({data.employees.length})
            </TabsTrigger>
            <TabsTrigger value="transactions" className="flex items-center gap-2">
              <TrendingUp className="h-4 w-4" />
              Transaktionen ({data.transactions.length})
            </TabsTrigger>
          </TabsList>

          {/* Promo Codes */}
          <TabsContent value="promo">
            <Card>
              <CardHeader>
                <CardTitle>Promotion Codes</CardTitle>
                <CardDescription>Zugewiesene Promo-Codes und deren Nutzung</CardDescription>
              </CardHeader>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Code</TableHead>
                      <TableHead>Nutzungen</TableHead>
                      <TableHead>Max. Nutzungen</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Erstellt</TableHead>
                      <TableHead></TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {data.promoCodes.map((code: any) => (
                      <TableRow key={code.id}>
                        <TableCell className="font-mono font-bold">{code.code}</TableCell>
                        <TableCell>{code.usage_count || 0}</TableCell>
                        <TableCell>{code.max_uses || '∞'}</TableCell>
                        <TableCell>
                          <Badge variant={code.is_active ? 'default' : 'secondary'}>
                            {code.is_active ? 'Aktiv' : 'Inaktiv'}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-muted-foreground text-sm">
                          {new Date(code.created_at).toLocaleDateString('de-DE')}
                        </TableCell>
                        <TableCell>
                          <Button size="sm" variant="ghost" onClick={() => copyCode(code.code)}>
                            <Copy className="h-4 w-4" />
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                    {data.promoCodes.length === 0 && (
                      <TableRow>
                        <TableCell colSpan={6} className="text-center text-muted-foreground py-8">
                          Keine Promo-Codes zugewiesen
                        </TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Leads */}
          <TabsContent value="leads">
            <Card>
              <CardHeader>
                <CardTitle>Leads</CardTitle>
                <CardDescription>Ihre zugewiesenen Leads und deren Status</CardDescription>
              </CardHeader>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Firma</TableHead>
                      <TableHead>Kontakt</TableHead>
                      <TableHead>Domain</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Priorität</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {data.leads.map((lead: any) => {
                      const s = LEAD_STATUSES[lead.status];
                      return (
                        <TableRow key={lead.id}>
                          <TableCell className="font-medium">{lead.company_name || '-'}</TableCell>
                          <TableCell>
                            <div className="text-sm">
                              <div>{lead.contact_person}</div>
                              {lead.phone && (
                                <div className="text-muted-foreground flex items-center gap-1">
                                  <Phone className="h-3 w-3" /> {lead.phone}
                                </div>
                              )}
                              {lead.email && (
                                <div className="text-muted-foreground flex items-center gap-1">
                                  <Mail className="h-3 w-3" /> {lead.email}
                                </div>
                              )}
                            </div>
                          </TableCell>
                          <TableCell>{lead.domain || '-'}</TableCell>
                          <TableCell>
                            <Badge className={s?.color}>{s?.label || lead.status}</Badge>
                          </TableCell>
                          <TableCell>
                            <Badge variant="outline">{lead.priority || 0}</Badge>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                    {data.leads.length === 0 && (
                      <TableRow>
                        <TableCell colSpan={5} className="text-center text-muted-foreground py-8">
                          Keine Leads vorhanden
                        </TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Employees */}
          <TabsContent value="employees">
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle>Mitarbeiter</CardTitle>
                    <CardDescription>Call Center Mitarbeiter und deren Rollen</CardDescription>
                  </div>
                  <Dialog open={createEmpOpen} onOpenChange={setCreateEmpOpen}>
                    <DialogTrigger asChild>
                      <Button size="sm" className="flex items-center gap-2">
                        <UserPlus className="h-4 w-4" />
                        Mitarbeiter anlegen
                      </Button>
                    </DialogTrigger>
                    <DialogContent>
                      <DialogHeader>
                        <DialogTitle>Neuen Mitarbeiter anlegen</DialogTitle>
                      </DialogHeader>
                      <div className="space-y-4 pt-2">
                        <div className="grid grid-cols-2 gap-3">
                          <div>
                            <Label>Vorname *</Label>
                            <Input value={empForm.first_name} onChange={e => setEmpForm(f => ({ ...f, first_name: e.target.value }))} />
                          </div>
                          <div>
                            <Label>Nachname *</Label>
                            <Input value={empForm.last_name} onChange={e => setEmpForm(f => ({ ...f, last_name: e.target.value }))} />
                          </div>
                        </div>
                        <div>
                          <Label>E-Mail *</Label>
                          <Input type="email" value={empForm.email} onChange={e => setEmpForm(f => ({ ...f, email: e.target.value }))} />
                        </div>
                        <div className="grid grid-cols-2 gap-3">
                          <div>
                            <Label>Rolle</Label>
                            <Select value={empForm.role} onValueChange={v => setEmpForm(f => ({ ...f, role: v }))}>
                              <SelectTrigger><SelectValue /></SelectTrigger>
                              <SelectContent>
                                <SelectItem value="agent">Agent</SelectItem>
                                <SelectItem value="team_lead">Team Lead</SelectItem>
                                <SelectItem value="manager">Manager</SelectItem>
                              </SelectContent>
                            </Select>
                          </div>
                          <div>
                            <Label>Provision (%)</Label>
                            <Input type="number" min="0" max="100" value={empForm.commission_rate} onChange={e => setEmpForm(f => ({ ...f, commission_rate: e.target.value }))} />
                          </div>
                        </div>
                        <Button className="w-full" onClick={createEmployee} disabled={creatingEmp}>
                          {creatingEmp ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
                          Mitarbeiter anlegen
                        </Button>
                      </div>
                    </DialogContent>
                  </Dialog>
                </div>
              </CardHeader>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Name</TableHead>
                      <TableHead>E-Mail</TableHead>
                      <TableHead>Rolle</TableHead>
                      <TableHead>Provision</TableHead>
                      <TableHead>Verdienst</TableHead>
                      <TableHead>Status</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {data.employees.map((emp: any) => (
                      <TableRow key={emp.id}>
                        <TableCell className="font-medium">
                          {emp.profile?.first_name} {emp.profile?.last_name}
                        </TableCell>
                        <TableCell className="text-muted-foreground">{emp.profile?.email}</TableCell>
                        <TableCell>
                          <Badge variant="outline">{emp.role}</Badge>
                        </TableCell>
                        <TableCell>{emp.commission_rate}%</TableCell>
                        <TableCell className="font-semibold text-green-600">
                          €{(emp.total_commissions || 0).toLocaleString('de-DE', { minimumFractionDigits: 2 })}
                        </TableCell>
                        <TableCell>
                          <Badge variant={emp.is_active ? 'default' : 'secondary'}>
                            {emp.is_active ? 'Aktiv' : 'Inaktiv'}
                          </Badge>
                        </TableCell>
                      </TableRow>
                    ))}
                    {data.employees.length === 0 && (
                      <TableRow>
                        <TableCell colSpan={6} className="text-center text-muted-foreground py-8">
                          Keine Mitarbeiter
                        </TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Transactions */}
          <TabsContent value="transactions">
            <Card>
              <CardHeader>
                <CardTitle>Transaktionen</CardTitle>
                <CardDescription>Umsätze über Ihre Promo-Codes</CardDescription>
              </CardHeader>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>ID</TableHead>
                      <TableHead>Betrag</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Datum</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {data.transactions.map((tx: any) => (
                      <TableRow key={tx.id}>
                        <TableCell className="font-mono text-sm">{tx.id.substring(0, 8)}...</TableCell>
                        <TableCell className="font-bold">€{tx.amount?.toLocaleString('de-DE')}</TableCell>
                        <TableCell>
                          <Badge variant={tx.status === 'completed' ? 'default' : 'secondary'}>
                            {tx.status}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-muted-foreground text-sm">
                          {new Date(tx.created_at).toLocaleDateString('de-DE')}
                        </TableCell>
                      </TableRow>
                    ))}
                    {data.transactions.length === 0 && (
                      <TableRow>
                        <TableCell colSpan={4} className="text-center text-muted-foreground py-8">
                          Keine Transaktionen
                        </TableCell>
                      </TableRow>
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
