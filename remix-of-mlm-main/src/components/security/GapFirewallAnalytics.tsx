import { useState, useEffect, useMemo, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { securityApi } from '@/lib/securityApi';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';
import { BarChart3, Loader2, Globe, Shield, TrendingUp, Eye, Ban, Zap, Users, HardDrive } from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, AreaChart, Area, Legend } from 'recharts';

interface Analytics {
  id: string;
  domain_id: string;
  date: string;
  total_requests: number;
  blocked_requests: number;
  challenged_requests: number;
  allowed_requests: number;
  threats_by_type: Record<string, number>;
  bandwidth_bytes: number;
  cached_bytes: number;
  unique_visitors: number;
  page_views: number;
  avg_response_time_ms: number | null;
}

interface Props {
  domains: { id: string; domain: string }[];
}

const COLORS = ['#06b6d4', '#8b5cf6', '#f59e0b', '#ef4444', '#22c55e', '#ec4899', '#3b82f6', '#f97316'];

export function GapFirewallAnalytics({ domains }: Props) {
  const { toast } = useToast();
  const [analytics, setAnalytics] = useState<Analytics[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedDomain, setSelectedDomain] = useState('all');

  const fetchAnalytics = useCallback(async () => {
    setLoading(true);
    let query = supabase.from('firewall_analytics').select('*').order('date', { ascending: false }).limit(30);
    if (selectedDomain && selectedDomain !== 'all') query = query.eq('domain_id', selectedDomain);
    const { data } = await query;
    setAnalytics((data || []) as Analytics[]);
    setLoading(false);
  }, [selectedDomain]);

  useEffect(() => { fetchAnalytics(); }, [fetchAnalytics]);

  // Generate sample data for demo
  const generateSampleData = async (domainId: string) => {
    const entries = [];
    for (let i = 0; i < 14; i++) {
      const date = new Date();
      date.setDate(date.getDate() - i);
      const totalReqs = Math.floor(Math.random() * 50000) + 10000;
      const blocked = Math.floor(totalReqs * (Math.random() * 0.05 + 0.01));
      const challenged = Math.floor(totalReqs * (Math.random() * 0.02));
      entries.push({
        domain_id: domainId,
        date: date.toISOString().split('T')[0],
        total_requests: totalReqs,
        blocked_requests: blocked,
        challenged_requests: challenged,
        allowed_requests: totalReqs - blocked - challenged,
        threats_by_type: { sqli: Math.floor(Math.random() * 50), xss: Math.floor(Math.random() * 30), bot: Math.floor(Math.random() * 100), ddos: Math.floor(Math.random() * 10) },
        bandwidth_bytes: Math.floor(Math.random() * 5000000000) + 500000000,
        cached_bytes: Math.floor(Math.random() * 3000000000) + 200000000,
        unique_visitors: Math.floor(Math.random() * 5000) + 500,
        page_views: Math.floor(Math.random() * 20000) + 2000,
        avg_response_time_ms: Math.floor(Math.random() * 200) + 50,
      });
    }
    try {
      for (const entry of entries) {
        await securityApi.upsert('firewall_analytics', entry);
      }
      toast({ title: '✓ Analysedaten generiert' }); fetchAnalytics();
    } catch (err) {
      toast({ variant: 'destructive', title: 'Fehler beim Generieren der Analysedaten', description: err instanceof Error ? err.message : 'Unbekannter Fehler' });
    }
  };

  const getDomainName = (id: string) => domains.find(d => d.id === id)?.domain || id;

  // Aggregated stats — memoized to avoid recomputing on every render
  const { totalReqs, totalBlocked, totalVisitors, totalBandwidth, totalCached, cacheRate } = useMemo(() => {
    const totalReqs = analytics.reduce((s, a) => s + a.total_requests, 0);
    const totalBlocked = analytics.reduce((s, a) => s + a.blocked_requests, 0);
    const totalVisitors = analytics.reduce((s, a) => s + a.unique_visitors, 0);
    const totalBandwidth = analytics.reduce((s, a) => s + a.bandwidth_bytes, 0);
    const totalCached = analytics.reduce((s, a) => s + a.cached_bytes, 0);
    const cacheRate = totalBandwidth > 0 ? Math.round((totalCached / totalBandwidth) * 100) : 0;
    return { totalReqs, totalBlocked, totalVisitors, totalBandwidth, totalCached, cacheRate };
  }, [analytics]);

  const formatBytes = (bytes: number) => {
    if (bytes >= 1e9) return (bytes / 1e9).toFixed(1) + ' GB';
    if (bytes >= 1e6) return (bytes / 1e6).toFixed(1) + ' MB';
    return (bytes / 1e3).toFixed(0) + ' KB';
  };

  const formatNum = (n: number) => n >= 1000 ? (n / 1000).toFixed(1) + 'k' : String(n);

  // Chart data — memoized
  const chartData = useMemo(() => [...analytics].reverse().map(a => ({
    date: a.date.substring(5),
    Anfragen: a.total_requests,
    Blockiert: a.blocked_requests,
    Challenged: a.challenged_requests,
  })), [analytics]);

  const trafficData = useMemo(() => [...analytics].reverse().map(a => ({
    date: a.date.substring(5),
    Besucher: a.unique_visitors,
    Seitenaufrufe: a.page_views,
  })), [analytics]);

  // Threat types aggregated — memoized
  const threatPieData = useMemo(() => {
    const threatAgg: Record<string, number> = {};
    analytics.forEach(a => {
      Object.entries(a.threats_by_type || {}).forEach(([k, v]) => {
        threatAgg[k] = (threatAgg[k] || 0) + (typeof v === 'number' ? v : 0);
      });
    });
    return Object.entries(threatAgg).map(([name, value]) => ({ name, value }));
  }, [analytics]);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-bold flex items-center gap-2"><BarChart3 className="h-5 w-5 text-cyan-500" /> Firewall-Analytics & Traffic</h3>
          <p className="text-sm text-muted-foreground">Übersicht über Anfragen, Bedrohungen und Performance</p>
        </div>
        <div className="flex gap-2">
          <Select value={selectedDomain} onValueChange={setSelectedDomain}>
            <SelectTrigger className="w-[200px]"><SelectValue placeholder="Alle Domains" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Alle Domains</SelectItem>
              {domains.map(d => <SelectItem key={d.id} value={d.id}>{d.domain}</SelectItem>)}
            </SelectContent>
          </Select>
          {selectedDomain && selectedDomain !== 'all' && (
            <Button variant="outline" size="sm" onClick={() => generateSampleData(selectedDomain)}>
              <Zap className="h-4 w-4 mr-1" /> Demo-Daten
            </Button>
          )}
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-8"><Loader2 className="h-6 w-6 animate-spin" /></div>
      ) : analytics.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground">
            <BarChart3 className="h-12 w-12 mx-auto mb-2 opacity-30" />
            <p>Keine Analysedaten vorhanden</p>
            {selectedDomain && <p className="text-sm mt-2">Klicken Sie auf "Demo-Daten" um Beispieldaten zu generieren</p>}
          </CardContent>
        </Card>
      ) : (
        <>
          {/* Summary Cards */}
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
            {[
              { icon: Globe, label: 'Anfragen', value: formatNum(totalReqs), color: 'text-cyan-500' },
              { icon: Ban, label: 'Blockiert', value: formatNum(totalBlocked), color: 'text-red-500' },
              { icon: Users, label: 'Besucher', value: formatNum(totalVisitors), color: 'text-green-500' },
              { icon: HardDrive, label: 'Bandbreite', value: formatBytes(totalBandwidth), color: 'text-blue-500' },
              { icon: Zap, label: 'Gecached', value: formatBytes(totalCached), color: 'text-yellow-500' },
              { icon: Shield, label: 'Cache-Rate', value: cacheRate + '%', color: 'text-purple-500' },
            ].map(({ icon: Icon, label, value, color }) => (
              <Card key={label}>
                <CardContent className="p-3">
                  <div className="flex items-center gap-2">
                    <Icon className={`h-4 w-4 ${color}`} />
                    <div>
                      <p className="text-xs text-muted-foreground">{label}</p>
                      <p className={`text-lg font-bold ${color}`}>{value}</p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>

          {/* Charts */}
          <div className="grid md:grid-cols-2 gap-4">
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm">Anfragen & Blockierungen</CardTitle>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={250}>
                  <BarChart data={chartData}>
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                    <XAxis dataKey="date" tick={{ fontSize: 11 }} />
                    <YAxis tick={{ fontSize: 11 }} />
                    <Tooltip />
                    <Legend />
                    <Bar dataKey="Anfragen" fill="hsl(var(--primary))" opacity={0.3} />
                    <Bar dataKey="Blockiert" fill="#ef4444" />
                    <Bar dataKey="Challenged" fill="#f59e0b" />
                  </BarChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm">Bedrohungstypen</CardTitle>
              </CardHeader>
              <CardContent>
                {threatPieData.length > 0 ? (
                  <ResponsiveContainer width="100%" height={250}>
                    <PieChart>
                      <Pie data={threatPieData} cx="50%" cy="50%" outerRadius={80} dataKey="value" label={({ name, value }) => `${name}: ${value}`}>
                        {threatPieData.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                      </Pie>
                      <Tooltip />
                    </PieChart>
                  </ResponsiveContainer>
                ) : (
                  <p className="text-center text-muted-foreground py-12">Keine Bedrohungsdaten</p>
                )}
              </CardContent>
            </Card>

            <Card className="md:col-span-2">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm">Traffic-Verlauf</CardTitle>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={200}>
                  <AreaChart data={trafficData}>
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                    <XAxis dataKey="date" tick={{ fontSize: 11 }} />
                    <YAxis tick={{ fontSize: 11 }} />
                    <Tooltip />
                    <Legend />
                    <Area type="monotone" dataKey="Seitenaufrufe" stroke="#8b5cf6" fill="#8b5cf6" fillOpacity={0.2} />
                    <Area type="monotone" dataKey="Besucher" stroke="#06b6d4" fill="#06b6d4" fillOpacity={0.2} />
                  </AreaChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
          </div>
        </>
      )}
    </div>
  );
}
