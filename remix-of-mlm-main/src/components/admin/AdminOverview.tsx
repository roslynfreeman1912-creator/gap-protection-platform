import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Progress } from '@/components/ui/progress';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import {
  Users, Euro, Shield, Globe, TrendingUp, FileText,
  Loader2, RefreshCw, Clock, UserPlus, Activity,
  BarChart3, ArrowUpRight, ArrowDownRight, DollarSign, Zap
} from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, LineChart, Line, Area, AreaChart } from 'recharts';

interface OverviewStats {
  users: { total: number; active: number; pending: number; partners: number };
  commissions: { pending: number; approved: number; paid: number; total: number };
  domains: number;
  leads: number;
  recentAudit: unknown[];
  recentUsers: unknown[];
}

export function AdminOverview() {
  const { toast } = useToast();
  const [stats, setStats] = useState<OverviewStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [commissionHistory, setCommissionHistory] = useState<unknown[]>([]);
  const [transactionStats, setTransactionStats] = useState<unknown[]>([]);

  const loadStats = async () => {
    setLoading(true);
    try {
      const [overviewRes, commissionsRes, transactionsRes] = await Promise.all([
        supabase.functions.invoke('admin-users', { body: { action: 'overview_stats' } }),
        supabase.from('commissions').select('commission_amount, status, created_at').order('created_at', { ascending: false }).limit(500),
        supabase.from('transactions').select('amount, created_at, status').order('created_at', { ascending: false }).limit(200),
      ]);

      if (overviewRes.error) throw overviewRes.error;
      setStats(overviewRes.data);

      const monthlyComm: Record<string, { month: string; pending: number; paid: number; approved: number }> = {};
      (commissionsRes.data || []).forEach((c: any) => {
        const m = new Date(c.created_at).toLocaleDateString('de-DE', { month: 'short', year: '2-digit' });
        if (!monthlyComm[m]) monthlyComm[m] = { month: m, pending: 0, paid: 0, approved: 0 };
        const amt = Number(c.commission_amount);
        if (c.status === 'paid') monthlyComm[m].paid += amt;
        else if (c.status === 'approved') monthlyComm[m].approved += amt;
        else monthlyComm[m].pending += amt;
      });
      setCommissionHistory(Object.values(monthlyComm).reverse().slice(-6));

      const dailyTx: Record<string, { date: string; amount: number; count: number }> = {};
      (transactionsRes.data || []).forEach((t: any) => {
        const d = new Date(t.created_at).toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit' });
        if (!dailyTx[d]) dailyTx[d] = { date: d, amount: 0, count: 0 };
        dailyTx[d].amount += Number(t.amount || 0);
        dailyTx[d].count += 1;
      });
      setTransactionStats(Object.values(dailyTx).reverse().slice(-14));
    } catch (err: unknown) {
      const error = err as Error;
      toast({ variant: 'destructive', title: 'Fehler', description: error.message });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { 
    loadStats(); 
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const fmt = (n: number) => new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR' }).format(n);
  const fmtCompact = (n: number) => {
    if (n >= 1000000) return `${(n / 1000000).toFixed(1)}M €`;
    if (n >= 1000) return `${(n / 1000).toFixed(1)}K €`;
    return fmt(n);
  };
  const fmtDate = (d: string) => new Date(d).toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="text-center">
          <div className="relative inline-flex">
            <div className="absolute inset-0 rounded-full blur-lg bg-accent/20 animate-pulse" />
            <Loader2 className="h-8 w-8 animate-spin text-accent relative z-10" />
          </div>
          <p className="text-muted-foreground text-sm mt-4">Daten werden geladen...</p>
        </div>
      </div>
    );
  }

  if (!stats) return null;

  const totalCommissions = stats.commissions.total;
  const pieData = [
    { name: 'Ausstehend', value: stats.commissions.pending, color: 'hsl(45 93% 47%)' },
    { name: 'Genehmigt', value: stats.commissions.approved, color: 'hsl(186 80% 42%)' },
    { name: 'Ausgezahlt', value: stats.commissions.paid, color: 'hsl(142 71% 45%)' },
  ].filter(d => d.value > 0);

  const statCards = [
    {
      label: 'Benutzer gesamt',
      value: stats.users.total,
      change: stats.users.active,
      changeLabel: 'aktiv',
      icon: Users,
      gradient: 'from-blue-500/10 to-cyan-500/10',
      iconBg: 'bg-blue-500/10',
      iconColor: 'text-blue-500',
      borderAccent: 'border-l-blue-500',
    },
    {
      label: 'Vertriebspartner',
      value: stats.users.partners,
      change: stats.users.pending,
      changeLabel: 'ausstehend',
      icon: UserPlus,
      gradient: 'from-violet-500/10 to-purple-500/10',
      iconBg: 'bg-violet-500/10',
      iconColor: 'text-violet-500',
      borderAccent: 'border-l-violet-500',
    },
    {
      label: 'Offene Provisionen',
      value: fmtCompact(stats.commissions.pending + stats.commissions.approved),
      change: stats.commissions.paid,
      changeLabel: 'ausgezahlt',
      icon: Euro,
      isText: true,
      gradient: 'from-amber-500/10 to-orange-500/10',
      iconBg: 'bg-amber-500/10',
      iconColor: 'text-amber-500',
      borderAccent: 'border-l-amber-500',
    },
    {
      label: 'Geschützte Domains',
      value: stats.domains,
      change: stats.leads,
      changeLabel: 'Leads',
      icon: Shield,
      gradient: 'from-emerald-500/10 to-green-500/10',
      iconBg: 'bg-emerald-500/10',
      iconColor: 'text-emerald-500',
      borderAccent: 'border-l-emerald-500',
    },
  ];

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold tracking-tight">Dashboard</h2>
          <p className="text-sm text-muted-foreground mt-0.5">
            Echtzeit-Übersicht aller Systembereiche
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={loadStats} disabled={loading} className="gap-2">
          <RefreshCw className="h-3.5 w-3.5" /> Aktualisieren
        </Button>
      </div>

      {/* KPI Cards */}
      <div className="grid gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-4">
        {statCards.map(({ label, value, change, changeLabel, icon: Icon, isText, gradient, iconBg, iconColor, borderAccent }) => (
          <Card key={label} className={`relative overflow-hidden border-l-4 ${borderAccent} hover:shadow-lg transition-shadow duration-300`}>
            <div className={`absolute inset-0 bg-gradient-to-br ${gradient} opacity-50`} />
            <CardContent className="p-5 relative">
              <div className="flex items-start justify-between">
                <div className="space-y-1">
                  <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">{label}</p>
                  <p className="text-3xl font-bold tracking-tight">{isText ? value : value.toLocaleString('de-DE')}</p>
                  <div className="flex items-center gap-1.5 mt-2">
                    <Zap className="h-3 w-3 text-muted-foreground" />
                    <span className="text-xs text-muted-foreground">
                      {typeof change === 'number' ? change.toLocaleString('de-DE') : fmt(change as any)} {changeLabel}
                    </span>
                  </div>
                </div>
                <div className={`p-2.5 rounded-xl ${iconBg}`}>
                  <Icon className={`h-5 w-5 ${iconColor}`} />
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Financial Summary */}
      <div className="grid gap-4 grid-cols-1 md:grid-cols-3">
        {[
          { label: 'Ausstehend', amount: stats.commissions.pending, icon: Clock, color: 'text-amber-500', bg: 'bg-amber-500/10', ring: 'ring-amber-500/20' },
          { label: 'Genehmigt', amount: stats.commissions.approved, icon: TrendingUp, color: 'text-blue-500', bg: 'bg-blue-500/10', ring: 'ring-blue-500/20' },
          { label: 'Ausgezahlt', amount: stats.commissions.paid, icon: DollarSign, color: 'text-emerald-500', bg: 'bg-emerald-500/10', ring: 'ring-emerald-500/20' },
        ].map(({ label, amount, icon: Icon, color, bg, ring }) => (
          <Card key={label} className={`ring-1 ${ring} hover:shadow-md transition-all duration-300`}>
            <CardContent className="p-4 flex items-center gap-4">
              <div className={`p-3 rounded-xl ${bg}`}>
                <Icon className={`h-5 w-5 ${color}`} />
              </div>
              <div className="flex-1">
                <p className="text-xs text-muted-foreground font-medium">{label}</p>
                <p className="text-xl font-bold tracking-tight">{fmt(amount)}</p>
              </div>
              <ArrowUpRight className={`h-4 w-4 ${color} opacity-60`} />
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Charts */}
      <div className="grid gap-6 grid-cols-1 lg:grid-cols-2">
        {/* Revenue Trend */}
        <Card className="overflow-hidden">
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <CardTitle className="text-sm font-semibold flex items-center gap-2">
                <TrendingUp className="h-4 w-4 text-accent" /> Umsatz-Trend
              </CardTitle>
              <Badge variant="secondary" className="text-[10px]">Letzte 14 Tage</Badge>
            </div>
          </CardHeader>
          <CardContent className="pb-4">
            {transactionStats.length > 0 ? (
              <ResponsiveContainer width="100%" height={260}>
                <AreaChart data={transactionStats}>
                  <defs>
                    <linearGradient id="colorRevenue" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="hsl(186 80% 42%)" stopOpacity={0.3} />
                      <stop offset="95%" stopColor="hsl(186 80% 42%)" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-muted/30" />
                  <XAxis dataKey="date" className="text-[10px]" tick={{ fill: 'hsl(215 16% 47%)' }} />
                  <YAxis className="text-[10px]" tick={{ fill: 'hsl(215 16% 47%)' }} />
                  <Tooltip
                    formatter={(v: number) => fmt(v)}
                    contentStyle={{ borderRadius: '8px', border: '1px solid hsl(214 32% 91%)', fontSize: '12px' }}
                  />
                  <Area type="monotone" dataKey="amount" name="Umsatz" stroke="hsl(186 80% 42%)" strokeWidth={2} fill="url(#colorRevenue)" />
                </AreaChart>
              </ResponsiveContainer>
            ) : (
              <div className="flex flex-col items-center justify-center h-[260px] text-muted-foreground">
                <BarChart3 className="h-10 w-10 mb-2 opacity-20" />
                <p className="text-sm">Keine Transaktionen</p>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Commission Chart */}
        <Card className="overflow-hidden">
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <CardTitle className="text-sm font-semibold flex items-center gap-2">
                <BarChart3 className="h-4 w-4 text-accent" /> Provisionen nach Monat
              </CardTitle>
              <Badge variant="secondary" className="text-[10px]">6 Monate</Badge>
            </div>
          </CardHeader>
          <CardContent className="pb-4">
            {commissionHistory.length > 0 ? (
              <ResponsiveContainer width="100%" height={260}>
                <BarChart data={commissionHistory} barCategoryGap="20%">
                  <CartesianGrid strokeDasharray="3 3" className="stroke-muted/30" />
                  <XAxis dataKey="month" className="text-[10px]" tick={{ fill: 'hsl(215 16% 47%)' }} />
                  <YAxis className="text-[10px]" tick={{ fill: 'hsl(215 16% 47%)' }} />
                  <Tooltip
                    formatter={(v: number) => fmt(v)}
                    contentStyle={{ borderRadius: '8px', border: '1px solid hsl(214 32% 91%)', fontSize: '12px' }}
                  />
                  <Bar dataKey="paid" name="Ausgezahlt" fill="hsl(142 71% 45%)" radius={[4, 4, 0, 0]} />
                  <Bar dataKey="approved" name="Genehmigt" fill="hsl(186 80% 42%)" radius={[4, 4, 0, 0]} />
                  <Bar dataKey="pending" name="Ausstehend" fill="hsl(45 93% 47%)" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <div className="flex flex-col items-center justify-center h-[260px] text-muted-foreground">
                <BarChart3 className="h-10 w-10 mb-2 opacity-20" />
                <p className="text-sm">Keine Daten verfügbar</p>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Bottom Row: Distribution + Activity */}
      <div className="grid gap-6 grid-cols-1 lg:grid-cols-3">
        {/* User Distribution */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-semibold">Benutzer-Verteilung</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {[
              { name: 'Aktiv', value: stats.users.active, color: 'bg-emerald-500' },
              { name: 'Ausstehend', value: stats.users.pending, color: 'bg-amber-500' },
              { name: 'Partner', value: stats.users.partners, color: 'bg-violet-500' },
            ].map(({ name, value, color }) => (
              <div key={name}>
                <div className="flex justify-between text-sm mb-1.5">
                  <div className="flex items-center gap-2">
                    <div className={`w-2 h-2 rounded-full ${color}`} />
                    <span className="text-muted-foreground">{name}</span>
                  </div>
                  <span className="font-semibold">{value}</span>
                </div>
                <div className="h-1.5 rounded-full bg-muted overflow-hidden">
                  <div
                    className={`h-full rounded-full ${color} transition-all duration-700`}
                    style={{ width: `${stats.users.total > 0 ? (value / stats.users.total) * 100 : 0}%` }}
                  />
                </div>
              </div>
            ))}
          </CardContent>
        </Card>

        {/* Commission Pie */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-semibold">Provisions-Verteilung</CardTitle>
          </CardHeader>
          <CardContent>
            {pieData.length > 0 ? (
              <div className="flex items-center gap-6">
                <ResponsiveContainer width={130} height={130}>
                  <PieChart>
                    <Pie data={pieData} dataKey="value" cx="50%" cy="50%" innerRadius={35} outerRadius={60} strokeWidth={2} stroke="hsl(var(--card))">
                      {pieData.map((d, i) => <Cell key={i} fill={d.color} />)}
                    </Pie>
                  </PieChart>
                </ResponsiveContainer>
                <div className="space-y-3 text-sm">
                  {pieData.map(d => (
                    <div key={d.name} className="flex items-center gap-2.5">
                      <div className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: d.color }} />
                      <div>
                        <p className="text-muted-foreground text-xs">{d.name}</p>
                        <p className="font-semibold text-sm">{fmt(d.value)}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ) : (
              <p className="text-sm text-muted-foreground text-center py-8">Keine Provisionen</p>
            )}
          </CardContent>
        </Card>

        {/* System Status */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-semibold">System-Status</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {[
              { label: 'Provisionen gesamt', value: fmtCompact(totalCommissions), dotColor: 'bg-emerald-500' },
              { label: 'Domains geschützt', value: stats.domains.toString(), dotColor: 'bg-blue-500' },
              { label: 'Aktive Leads', value: stats.leads.toString(), dotColor: 'bg-violet-500' },
              { label: 'Partner aktiv', value: stats.users.partners.toString(), dotColor: 'bg-amber-500' },
            ].map(({ label, value, dotColor }) => (
              <div key={label} className="flex items-center justify-between p-2.5 rounded-lg bg-muted/50 hover:bg-muted transition-colors">
                <div className="flex items-center gap-2.5">
                  <div className={`w-2 h-2 rounded-full ${dotColor}`} />
                  <span className="text-sm text-muted-foreground">{label}</span>
                </div>
                <span className="text-sm font-bold">{value}</span>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>

      {/* Recent Activity */}
      <div className="grid gap-6 grid-cols-1 lg:grid-cols-2">
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-semibold flex items-center gap-2">
              <UserPlus className="h-4 w-4 text-accent" /> Neueste Registrierungen
            </CardTitle>
          </CardHeader>
          <CardContent>
            {stats.recentUsers.length > 0 ? (
              <div className="space-y-2">
                {stats.recentUsers.slice(0, 5).map((u: any) => (
                  <div key={u.id} className="flex items-center gap-3 p-2.5 rounded-lg hover:bg-muted/50 transition-colors">
                    <div className="h-8 w-8 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                      <span className="text-xs font-bold text-primary">
                        {u.first_name?.[0]}{u.last_name?.[0]}
                      </span>
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">{u.first_name} {u.last_name}</p>
                      <p className="text-[10px] text-muted-foreground">{fmtDate(u.created_at)}</p>
                    </div>
                    <Badge variant={u.status === 'active' ? 'default' : 'secondary'} className="text-[10px] shrink-0">
                      {u.status === 'active' ? 'Aktiv' : 'Ausstehend'}
                    </Badge>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground text-center py-6">Keine Registrierungen</p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-semibold flex items-center gap-2">
              <Activity className="h-4 w-4 text-accent" /> Letzte Aktivitäten
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2 max-h-[320px] overflow-y-auto">
              {stats.recentAudit.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-6">Keine Aktivitäten</p>
              ) : stats.recentAudit.slice(0, 8).map((log: any) => (
                <div key={log.id} className="flex items-start gap-3 p-2.5 rounded-lg hover:bg-muted/50 transition-colors">
                  <div className="h-7 w-7 rounded-lg bg-accent/10 flex items-center justify-center shrink-0 mt-0.5">
                    <Activity className="h-3.5 w-3.5 text-accent" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium truncate">{log.action}</p>
                    <p className="text-[10px] text-muted-foreground">{log.table_name} • {fmtDate(log.created_at)}</p>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
