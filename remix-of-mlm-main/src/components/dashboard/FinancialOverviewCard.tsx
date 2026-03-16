import { useState, useEffect, useCallback } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { supabase } from '@/integrations/supabase/client';
import { Euro, TrendingUp, Users, Calendar, Loader2 } from 'lucide-react';

interface FinancialOverviewCardProps {
  profileId: string;
  isAdmin?: boolean;
}

interface FinancialStats {
  commissions: {
    pending: { gross: number; vat: number; net: number };
    approved: { gross: number; vat: number; net: number };
    paid: { gross: number; vat: number; net: number };
    total: { gross: number; vat: number; net: number };
  };
  team: {
    totalRevenue: { gross: number; vat: number; net: number };
    totalContracts: number;
    activePartners: number;
  };
  levelBreakdown: Record<number, number>;
  monthlyTrend: { month: string; amount: number }[];
}

const VAT_RATE = 0.19;

export function FinancialOverviewCard({ profileId, isAdmin = false }: FinancialOverviewCardProps) {
  const [isLoading, setIsLoading] = useState(true);
  const [stats, setStats] = useState<FinancialStats | null>(null);

  const calculateWithVAT = useCallback((gross: number) => ({
    gross,
    vat: gross - gross / (1 + VAT_RATE),
    net: gross / (1 + VAT_RATE)
  }), []);

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('de-DE', {
      style: 'currency',
      currency: 'EUR',
    }).format(amount);
  };

  const loadFinancialData = useCallback(async () => {
    setIsLoading(true);
    try {
      // Get commissions
      const { data: commissions } = await supabase
        .from('commissions')
        .select('commission_amount, status, level_number, created_at')
        .eq('partner_id', profileId);

      // Get hierarchy for team stats
      const { data: hierarchy } = await supabase
        .from('user_hierarchy')
        .select('user_id, is_active_for_commission')
        .eq('ancestor_id', profileId);

      const teamUserIds = hierarchy?.map(h => h.user_id) || [];

      // Get team transactions
      const { data: transactions } = await supabase
        .from('transactions')
        .select('amount, status')
        .in('customer_id', [...teamUserIds, profileId])
        .eq('status', 'completed');

      // Calculate commission stats
      const commissionsArray = commissions || [];
      const pending = commissionsArray.filter(c => c.status === 'pending').reduce((sum, c) => sum + Number(c.commission_amount), 0);
      const approved = commissionsArray.filter(c => c.status === 'approved').reduce((sum, c) => sum + Number(c.commission_amount), 0);
      const paid = commissionsArray.filter(c => c.status === 'paid').reduce((sum, c) => sum + Number(c.commission_amount), 0);
      const total = pending + approved + paid;

      // Level breakdown
      const levelBreakdown: Record<number, number> = {};
      commissionsArray.forEach(c => {
        levelBreakdown[c.level_number] = (levelBreakdown[c.level_number] || 0) + Number(c.commission_amount);
      });

      // Team revenue
      const teamRevenue = (transactions || []).reduce((sum, t) => sum + Number(t.amount), 0);

      // Monthly trend (last 6 months)
      const monthlyTrend: { month: string; amount: number }[] = [];
      const now = new Date();
      for (let i = 5; i >= 0; i--) {
        const date = new Date(now.getFullYear(), now.getMonth() - i, 1);
        const monthKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
        const monthAmount = commissionsArray
          .filter(c => c.created_at?.startsWith(monthKey))
          .reduce((sum, c) => sum + Number(c.commission_amount), 0);
        monthlyTrend.push({
          month: date.toLocaleDateString('de-DE', { month: 'short' }),
          amount: monthAmount
        });
      }

      setStats({
        commissions: {
          pending: calculateWithVAT(pending),
          approved: calculateWithVAT(approved),
          paid: calculateWithVAT(paid),
          total: calculateWithVAT(total)
        },
        team: {
          totalRevenue: calculateWithVAT(teamRevenue),
          totalContracts: (transactions || []).length,
          activePartners: hierarchy?.filter(h => h.is_active_for_commission).length || 0
        },
        levelBreakdown,
        monthlyTrend
      });
    } catch (error) {
      console.error('Financial data error:', error);
    } finally {
      setIsLoading(false);
    }
  }, [profileId, calculateWithVAT]);

  useEffect(() => {
    if (profileId) {
      loadFinancialData();
    }
  }, [profileId, loadFinancialData]);

  if (isLoading) {
    return (
      <Card>
        <CardContent className="flex items-center justify-center py-12">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </CardContent>
      </Card>
    );
  }

  if (!stats) return null;

  const maxMonthlyAmount = Math.max(...stats.monthlyTrend.map(m => m.amount), 1);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Euro className="h-5 w-5" />
          Finanzübersicht
        </CardTitle>
        <CardDescription>Provisionen, Umsätze und Trends mit MwSt-Aufschlüsselung</CardDescription>
      </CardHeader>
      <CardContent>
        <Tabs defaultValue="commissions">
          <TabsList className="grid w-full grid-cols-3 mb-6">
            <TabsTrigger value="commissions">Provisionen</TabsTrigger>
            <TabsTrigger value="team">Team</TabsTrigger>
            <TabsTrigger value="trend">Trend</TabsTrigger>
          </TabsList>

          <TabsContent value="commissions" className="space-y-4">
            {/* Total Commission */}
            <Card className="border-primary/30 bg-primary/5">
              <CardContent className="pt-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-muted-foreground">Gesamt-Provisionen</p>
                    <p className="text-3xl font-bold">{formatCurrency(stats.commissions.total.gross)}</p>
                  </div>
                  <div className="text-right text-sm">
                    <p className="text-muted-foreground">Netto: {formatCurrency(stats.commissions.total.net)}</p>
                    <p className="text-muted-foreground">MwSt (19%): {formatCurrency(stats.commissions.total.vat)}</p>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Status Breakdown */}
            <div className="grid grid-cols-3 gap-4">
              <Card className="border-yellow-500/30">
                <CardContent className="pt-4">
                  <p className="text-xs text-yellow-600 mb-1">Ausstehend</p>
                  <p className="text-xl font-bold">{formatCurrency(stats.commissions.pending.gross)}</p>
                  <p className="text-xs text-muted-foreground">Netto: {formatCurrency(stats.commissions.pending.net)}</p>
                </CardContent>
              </Card>
              <Card className="border-blue-500/30">
                <CardContent className="pt-4">
                  <p className="text-xs text-blue-600 mb-1">Genehmigt</p>
                  <p className="text-xl font-bold">{formatCurrency(stats.commissions.approved.gross)}</p>
                  <p className="text-xs text-muted-foreground">Netto: {formatCurrency(stats.commissions.approved.net)}</p>
                </CardContent>
              </Card>
              <Card className="border-green-500/30">
                <CardContent className="pt-4">
                  <p className="text-xs text-green-600 mb-1">Ausgezahlt</p>
                  <p className="text-xl font-bold">{formatCurrency(stats.commissions.paid.gross)}</p>
                  <p className="text-xs text-muted-foreground">Netto: {formatCurrency(stats.commissions.paid.net)}</p>
                </CardContent>
              </Card>
            </div>

            {/* Level Breakdown */}
            <div>
              <h4 className="text-sm font-medium mb-3">Nach Stufe</h4>
              <div className="grid grid-cols-5 gap-2">
                {[1, 2, 3, 4, 5].map(level => (
                  <div key={level} className="p-3 rounded-lg bg-muted/50 text-center">
                    <p className="text-xs text-muted-foreground mb-1">Stufe {level}</p>
                    <p className="font-medium text-sm">
                      {formatCurrency(stats.levelBreakdown[level] || 0)}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          </TabsContent>

          <TabsContent value="team" className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <Card className="border-primary/30 bg-primary/5">
                <CardContent className="pt-4">
                  <div className="flex items-center gap-2 mb-2">
                    <TrendingUp className="h-4 w-4 text-primary" />
                    <span className="text-sm text-muted-foreground">Team-Umsatz</span>
                  </div>
                  <p className="text-2xl font-bold">{formatCurrency(stats.team.totalRevenue.gross)}</p>
                  <div className="text-xs text-muted-foreground mt-1 space-x-3">
                    <span>Netto: {formatCurrency(stats.team.totalRevenue.net)}</span>
                    <span>MwSt: {formatCurrency(stats.team.totalRevenue.vat)}</span>
                  </div>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="pt-4">
                  <div className="flex items-center gap-2 mb-2">
                    <Users className="h-4 w-4 text-blue-500" />
                    <span className="text-sm text-muted-foreground">Team</span>
                  </div>
                  <p className="text-2xl font-bold">{stats.team.activePartners}</p>
                  <p className="text-xs text-muted-foreground mt-1">
                    Aktive Partner | {stats.team.totalContracts} Verträge
                  </p>
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          <TabsContent value="trend" className="space-y-4">
            <div className="flex items-center gap-2 mb-4">
              <Calendar className="h-4 w-4 text-muted-foreground" />
              <span className="text-sm text-muted-foreground">Letzte 6 Monate</span>
            </div>
            <div className="space-y-3">
              {stats.monthlyTrend.map((m, i) => (
                <div key={i} className="flex items-center gap-4">
                  <span className="w-16 text-sm text-muted-foreground">{m.month}</span>
                  <div className="flex-1">
                    <Progress 
                      value={(m.amount / maxMonthlyAmount) * 100} 
                      className="h-6"
                    />
                  </div>
                  <span className="w-24 text-right font-medium">{formatCurrency(m.amount)}</span>
                </div>
              ))}
            </div>
          </TabsContent>
        </Tabs>
      </CardContent>
    </Card>
  );
}
