import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { securityApi } from '@/lib/securityApi';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { Progress } from '@/components/ui/progress';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { toast } from 'sonner';
import {
  Shield, ShieldAlert, ShieldCheck, Server, Monitor, Smartphone, Wifi, Globe,
  AlertTriangle, Bug, Lock, Unlock, Eye, EyeOff, Activity, BarChart3,
  Plus, RefreshCw, Loader2, Brain, Zap, Target, FileWarning, Network,
  ArrowUpRight, ArrowDownRight, Minus, TrendingUp, Clock, CheckCircle2,
  XCircle, AlertCircle, Search, Filter, MoreVertical, Download, Bot
} from 'lucide-react';
import { AdminSecurityManager } from './AdminSecurityManager';
import { format } from 'date-fns';

// Severity color helpers
const severityColor = (s: string) => {
  switch (s) {
    case 'critical': return 'bg-red-500/20 text-red-400 border-red-500/30';
    case 'high': return 'bg-orange-500/20 text-orange-400 border-orange-500/30';
    case 'medium': return 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30';
    case 'low': return 'bg-blue-500/20 text-blue-400 border-blue-500/30';
    default: return 'bg-muted text-muted-foreground';
  }
};

const statusColor = (s: string) => {
  switch (s) {
    case 'active': case 'open': return 'bg-green-500/20 text-green-400';
    case 'offline': case 'dismissed': return 'bg-muted text-muted-foreground';
    case 'compromised': case 'escalated': return 'bg-red-500/20 text-red-400';
    case 'quarantined': case 'investigating': return 'bg-yellow-500/20 text-yellow-400';
    case 'resolved': return 'bg-cyan-500/20 text-cyan-400';
    default: return 'bg-muted text-muted-foreground';
  }
};

const assetIcon = (type: string) => {
  switch (type) {
    case 'endpoint': return Monitor;
    case 'server': return Server;
    case 'mobile': return Smartphone;
    case 'iot': return Wifi;
    case 'cloud': return Globe;
    case 'network': return Network;
    default: return Monitor;
  }
};

export function SecurityThreatDashboard() {
  const [activeTab, setActiveTab] = useState('overview');
  const [assets, setAssets] = useState<any[]>([]);
  const [threatEvents, setThreatEvents] = useState<any[]>([]);
  const [alerts, setAlerts] = useState<any[]>([]);
  const [threatIntel, setThreatIntel] = useState<any[]>([]);
  const [honeypotEvents, setHoneypotEvents] = useState<any[]>([]);
  const [aiAnalyses, setAiAnalyses] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [aiLoading, setAiLoading] = useState(false);
  const [showAddAsset, setShowAddAsset] = useState(false);
  const [showAddThreat, setShowAddThreat] = useState(false);
  const [showAddIntel, setShowAddIntel] = useState(false);

  // Auto-Protect state
  const [autoProtectUrl, setAutoProtectUrl] = useState('');
  const [autoProtecting, setAutoProtecting] = useState(false);
  const [protectionResult, setProtectionResult] = useState<any>(null);
  const [featureToggles, setFeatureToggles] = useState<Record<string, boolean>>({});

  // Form states
  const [newAsset, setNewAsset] = useState({ asset_name: '', asset_type: 'endpoint', os_type: '', ip_address: '', hostname: '', location: '', protection_level: 'standard' });
  const [newThreat, setNewThreat] = useState({ event_type: 'malware', severity: 'medium', title: '', description: '', source_ip: '', attack_vector: 'network', action_taken: 'detected' });
  const [newIntel, setNewIntel] = useState({ indicator_type: 'ip', indicator_value: '', threat_type: 'malware', severity: 'medium', description: '' });

  const fetchAll = async () => {
    setLoading(true);
    const [assetsRes, eventsRes, alertsRes, intelRes, honeypotRes, aiRes] = await Promise.all([
      supabase.from('security_assets').select('*').order('created_at', { ascending: false }),
      supabase.from('threat_events').select('*').order('created_at', { ascending: false }).limit(100),
      supabase.from('security_alerts').select('*').order('created_at', { ascending: false }).limit(50),
      supabase.from('threat_intel').select('*').order('created_at', { ascending: false }).limit(100),
      supabase.from('honeypot_events').select('*').order('created_at', { ascending: false }).limit(50),
      supabase.from('ai_threat_analyses').select('*').order('created_at', { ascending: false }).limit(20),
    ]);

    setAssets(assetsRes.data || []);
    setThreatEvents(eventsRes.data || []);
    setAlerts(alertsRes.data || []);
    setThreatIntel(intelRes.data || []);
    setHoneypotEvents(honeypotRes.data || []);
    setAiAnalyses(aiRes.data || []);
    setLoading(false);
  };

  useEffect(() => { fetchAll(); }, []);

  // Realtime subscriptions
  useEffect(() => {
    const channel = supabase
      .channel('security-realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'security_alerts' }, () => fetchAll())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'threat_events' }, () => fetchAll())
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, []);

  const addAsset = async () => {
    try {
      await securityApi.insert('security_assets', newAsset);
    } catch (error: any) { toast.error('Fehler: ' + error.message); return; }
    toast.success('Asset hinzugefügt');
    setShowAddAsset(false);
    setNewAsset({ asset_name: '', asset_type: 'endpoint', os_type: '', ip_address: '', hostname: '', location: '', protection_level: 'standard' });
    fetchAll();
  };

  const addThreatEvent = async () => {
    try {
      const data = await securityApi.insert('threat_events', newThreat);
      // Auto-create alert for high/critical
      if (['critical', 'high'].includes(newThreat.severity)) {
        await securityApi.insert('security_alerts', {
          threat_event_id: data.id,
          alert_type: 'threat',
          severity: newThreat.severity,
          title: newThreat.title,
          description: newThreat.description,
          priority: newThreat.severity === 'critical' ? 1 : 2,
        });
      }
    } catch (error: any) { toast.error('Fehler: ' + error.message); return; }
    toast.success('Bedrohung registriert');
    setShowAddThreat(false);
    setNewThreat({ event_type: 'malware', severity: 'medium', title: '', description: '', source_ip: '', attack_vector: 'network', action_taken: 'detected' });
    fetchAll();
  };

  const addThreatIntel = async () => {
    try {
      await securityApi.insert('threat_intel', newIntel);
    } catch (error: any) { toast.error('Fehler: ' + error.message); return; }
    toast.success('Threat Intelligence hinzugefügt');
    setShowAddIntel(false);
    setNewIntel({ indicator_type: 'ip', indicator_value: '', threat_type: 'malware', severity: 'medium', description: '' });
    fetchAll();
  };

  const runAIAnalysis = async (type: 'risk_assessment' | 'analyze_threat', eventData?: any) => {
    setAiLoading(true);
    try {
      const body = type === 'risk_assessment'
        ? { action: 'risk_assessment', data: { assets, recent_events: threatEvents.slice(0, 20) } }
        : { action: 'analyze_threat', data: { threat_event: eventData } };

      const { data, error } = await supabase.functions.invoke('ai-threat-analysis', { body });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      toast.success('KI-Analyse abgeschlossen');
      fetchAll();
    } catch (err: any) {
      toast.error('KI-Analyse fehlgeschlagen: ' + (err.message || 'Unbekannter Fehler'));
    }
    setAiLoading(false);
  };

  const resolveAlert = async (id: string) => {
    await securityApi.update('security_alerts', id, { status: 'resolved', resolved_at: new Date().toISOString() });
    toast.success('Alert aufgelöst');
    fetchAll();
  };

  // Auto-Protect: Protect entire site with one click
  const runAutoProtect = async () => {
    if (!autoProtectUrl.trim()) {
      toast.error('Bitte eine Domain/URL eingeben');
      return;
    }
    setAutoProtecting(true);
    setProtectionResult(null);
    try {
      const { data, error } = await supabase.functions.invoke('auto-protect', {
        body: { action: 'protect', domain: autoProtectUrl.trim() }
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      setProtectionResult(data);
      // Set initial feature toggles
      if (data?.domainId) {
        setFeatureToggles({
          waf: true, ddos: true, ssl: true, bot_management: true,
          cache: true, email_security: true, rate_limiting: true, zero_trust: true,
        });
      }
      toast.success(`✓ ${data?.domain} ist jetzt geschützt (${data?.protectionScore}%)`);
      fetchAll();
    } catch (err: any) {
      toast.error('Auto-Protect fehlgeschlagen: ' + (err.message || 'Unbekannter Fehler'));
    }
    setAutoProtecting(false);
  };

  // Toggle a protection feature on/off
  const toggleProtectionFeature = async (feature: string, enable: boolean) => {
    if (!protectionResult?.domainId) return;
    try {
      const { data, error } = await supabase.functions.invoke('auto-protect', {
        body: {
          action: enable ? 'enable_feature' : 'disable_feature',
          domainId: protectionResult.domainId,
          feature,
        }
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      setFeatureToggles(prev => ({ ...prev, [feature]: enable }));
      toast.success(`${feature} wurde ${enable ? 'aktiviert' : 'deaktiviert'}`);
    } catch (err: any) {
      toast.error('Feature-Toggle fehlgeschlagen: ' + (err.message || 'Fehler'));
    }
  };

  // Stats
  const criticalEvents = threatEvents.filter(e => e.severity === 'critical').length;
  const highEvents = threatEvents.filter(e => e.severity === 'high').length;
  const openAlerts = alerts.filter(a => a.status === 'open' || a.status === 'investigating').length;
  const activeAssets = assets.filter(a => a.status === 'active').length;
  const compromisedAssets = assets.filter(a => a.status === 'compromised').length;
  const blockedThreats = threatEvents.filter(e => e.action_taken === 'blocked').length;
  const avgRiskScore = assets.length > 0 ? Math.round(assets.reduce((s, a) => s + (a.risk_score || 0), 0) / assets.length) : 0;

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-8 w-8 animate-spin text-cyan-500" />
        <span className="ml-3 text-muted-foreground">Sicherheitsdaten werden geladen...</span>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Shield className="h-7 w-7 text-cyan-500" />
            Security Operations Center
          </h1>
          <p className="text-muted-foreground text-sm mt-1">GAP Protection — Echtzeit-Bedrohungsüberwachung & KI-Analyse</p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={fetchAll}>
            <RefreshCw className="h-4 w-4 mr-1" /> Aktualisieren
          </Button>
          <Button size="sm" onClick={() => runAIAnalysis('risk_assessment')} disabled={aiLoading}
            className="bg-gradient-to-r from-cyan-600 to-blue-600 hover:from-cyan-700 hover:to-blue-700 text-white">
            {aiLoading ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <Brain className="h-4 w-4 mr-1" />}
            KI-Risikoanalyse
          </Button>
        </div>
      </div>

      {/* ═══ AUTO-PROTECT: One-Click Full Protection ═══ */}
      <Card className="border-cyan-500/40 bg-gradient-to-r from-cyan-950/30 to-blue-950/30">
        <CardContent className="p-5">
          <div className="flex items-center gap-3 mb-4">
            <div className="p-2.5 rounded-xl bg-cyan-500/20">
              <ShieldCheck className="h-6 w-6 text-cyan-400" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-white">Auto-Protect</h2>
              <p className="text-xs text-muted-foreground">URL eingeben → Automatischer Vollschutz für die gesamte Website</p>
            </div>
          </div>
          <div className="flex gap-2">
            <Input
              placeholder="Domain eingeben (z.B. example.com oder https://example.com)"
              value={autoProtectUrl}
              onChange={e => setAutoProtectUrl(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && !autoProtecting && runAutoProtect()}
              className="flex-1 bg-background/60 border-cyan-500/30 focus:border-cyan-400"
              disabled={autoProtecting}
            />
            <Button
              onClick={runAutoProtect}
              disabled={autoProtecting || !autoProtectUrl.trim()}
              className="bg-gradient-to-r from-cyan-600 to-blue-600 hover:from-cyan-700 hover:to-blue-700 text-white px-6 min-w-[160px]"
            >
              {autoProtecting ? (
                <><Loader2 className="h-4 w-4 animate-spin mr-2" /> Schütze...</>
              ) : (
                <><ShieldCheck className="h-4 w-4 mr-2" /> Jetzt schützen</>
              )}
            </Button>
          </div>

          {/* Protection Result */}
          {protectionResult && (
            <div className="mt-5 space-y-4">
              {/* Score */}
              <div className="flex items-center gap-4">
                <div className="flex-1">
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-sm font-medium text-white">{protectionResult.domain}</span>
                    <span className={`text-sm font-bold ${protectionResult.protectionScore >= 80 ? 'text-green-400' : protectionResult.protectionScore >= 50 ? 'text-yellow-400' : 'text-red-400'}`}>
                      {protectionResult.protectionScore}% geschützt
                    </span>
                  </div>
                  <Progress
                    value={protectionResult.protectionScore}
                    className="h-2"
                  />
                </div>
                <Badge variant="outline" className={protectionResult.protectionScore >= 80 ? 'bg-green-500/20 text-green-400 border-green-500/30' : 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30'}>
                  {protectionResult.summary?.activeFeatures}/{protectionResult.summary?.totalFeatures} Features
                </Badge>
              </div>

              {/* Feature Toggles */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                {[
                  { key: 'waf', label: 'WAF', icon: Shield, step: 'waf' },
                  { key: 'ddos', label: 'DDoS-Schutz', icon: Zap, step: 'ddos' },
                  { key: 'ssl', label: 'SSL/TLS', icon: Lock, step: 'ssl' },
                  { key: 'bot_management', label: 'Bot-Schutz', icon: Bot, step: 'botManagement' },
                  { key: 'cache', label: 'Cache/CDN', icon: Globe, step: 'cache' },
                  { key: 'email_security', label: 'E-Mail-Sicherheit', icon: Lock, step: 'emailSecurity' },
                  { key: 'rate_limiting', label: 'Rate Limiting', icon: Activity, step: 'rateLimiting' },
                  { key: 'zero_trust', label: 'Zero Trust', icon: Network, step: 'zeroTrust' },
                ].map(f => {
                  const stepResult = protectionResult.steps?.[f.step];
                  const isActive = featureToggles[f.key] ?? (stepResult?.status === 'ok');
                  return (
                    <div key={f.key} className="flex items-center justify-between p-2.5 rounded-lg bg-background/40 border border-border/50">
                      <div className="flex items-center gap-2">
                        <f.icon className={`h-3.5 w-3.5 ${isActive ? 'text-cyan-400' : 'text-muted-foreground'}`} />
                        <span className="text-xs font-medium">{f.label}</span>
                      </div>
                      <Switch
                        checked={isActive}
                        onCheckedChange={(checked) => toggleProtectionFeature(f.key, checked)}
                        className="scale-75"
                      />
                    </div>
                  );
                })}
              </div>

              {/* Scan Results Summary */}
              {protectionResult.steps?.scan?.details && (
                <div className="grid grid-cols-2 md:grid-cols-5 gap-2">
                  {[
                    { label: 'Uptime', status: protectionResult.steps.scan.details.uptime?.status, detail: `${protectionResult.steps.scan.details.uptime?.responseTime}ms` },
                    { label: 'SSL', status: protectionResult.steps.scan.details.ssl?.status, detail: `${protectionResult.steps.scan.details.ssl?.daysRemaining}d` },
                    { label: 'DNS', status: protectionResult.steps.scan.details.dns?.status, detail: `${protectionResult.steps.scan.details.dns?.ips?.length || 0} IPs` },
                    { label: 'Headers', status: protectionResult.steps.scan.details.headers?.status, detail: `${protectionResult.steps.scan.details.headers?.passed}/${protectionResult.steps.scan.details.headers?.total}` },
                    { label: 'Vulns', status: protectionResult.steps.scan.details.vulnerabilities?.status, detail: `${protectionResult.steps.scan.details.vulnerabilities?.vulnerabilities?.length || 0}` },
                  ].map(item => (
                    <div key={item.label} className="flex items-center gap-2 p-2 rounded-lg bg-background/30 text-xs">
                      {item.status === 'ok' ? <CheckCircle2 className="h-3.5 w-3.5 text-green-400" /> :
                       item.status === 'warning' ? <AlertTriangle className="h-3.5 w-3.5 text-yellow-400" /> :
                       <XCircle className="h-3.5 w-3.5 text-red-400" />}
                      <span className="font-medium">{item.label}</span>
                      <span className="text-muted-foreground ml-auto">{item.detail}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Stats Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-3">
        <StatCard icon={ShieldAlert} label="Kritisch" value={criticalEvents} color="text-red-500" bgColor="bg-red-500/10" />
        <StatCard icon={AlertTriangle} label="Hoch" value={highEvents} color="text-orange-500" bgColor="bg-orange-500/10" />
        <StatCard icon={AlertCircle} label="Offene Alerts" value={openAlerts} color="text-yellow-500" bgColor="bg-yellow-500/10" />
        <StatCard icon={Monitor} label="Aktive Assets" value={activeAssets} color="text-green-500" bgColor="bg-green-500/10" />
        <StatCard icon={XCircle} label="Kompromittiert" value={compromisedAssets} color="text-red-500" bgColor="bg-red-500/10" />
        <StatCard icon={ShieldCheck} label="Blockiert" value={blockedThreats} color="text-cyan-500" bgColor="bg-cyan-500/10" />
        <StatCard icon={Target} label="Risiko Ø" value={avgRiskScore + '%'} color="text-purple-500" bgColor="bg-purple-500/10" />
      </div>

      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="grid w-full grid-cols-8 h-auto">
          <TabsTrigger value="overview" className="text-xs py-2">Übersicht</TabsTrigger>
          <TabsTrigger value="webprotection" className="text-xs py-2">Web-Schutz</TabsTrigger>
          <TabsTrigger value="threats" className="text-xs py-2">Bedrohungen</TabsTrigger>
          <TabsTrigger value="assets" className="text-xs py-2">Assets</TabsTrigger>
          <TabsTrigger value="alerts" className="text-xs py-2">Alerts</TabsTrigger>
          <TabsTrigger value="intel" className="text-xs py-2">Threat Intel</TabsTrigger>
          <TabsTrigger value="honeypot" className="text-xs py-2">Honeypot</TabsTrigger>
          <TabsTrigger value="ai" className="text-xs py-2">KI-Analyse</TabsTrigger>
        </TabsList>

        {/* OVERVIEW */}
        <TabsContent value="overview" className="space-y-4 mt-4">
          <div className="grid md:grid-cols-2 gap-4">
            {/* Recent Threats */}
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm flex items-center gap-2">
                  <Bug className="h-4 w-4 text-red-500" /> Neueste Bedrohungen
                </CardTitle>
              </CardHeader>
              <CardContent>
                <ScrollArea className="h-[300px]">
                  {threatEvents.length === 0 ? (
                    <p className="text-muted-foreground text-sm text-center py-8">Keine Bedrohungen erkannt</p>
                  ) : (
                    <div className="space-y-2">
                      {threatEvents.slice(0, 10).map(event => (
                        <div key={event.id} className="flex items-start gap-3 p-2 rounded-lg hover:bg-muted/50 transition-colors">
                          <Badge variant="outline" className={`${severityColor(event.severity)} text-[10px] shrink-0`}>
                            {event.severity.toUpperCase()}
                          </Badge>
                          <div className="min-w-0 flex-1">
                            <p className="text-sm font-medium truncate">{event.title}</p>
                            <p className="text-xs text-muted-foreground">
                              {event.event_type} • {event.action_taken} • {format(new Date(event.created_at), 'dd.MM HH:mm')}
                            </p>
                          </div>
                          <Button size="icon" variant="ghost" className="h-6 w-6 shrink-0" onClick={() => runAIAnalysis('analyze_threat', event)}>
                            <Brain className="h-3 w-3" />
                          </Button>
                        </div>
                      ))}
                    </div>
                  )}
                </ScrollArea>
              </CardContent>
            </Card>

            {/* Active Alerts */}
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm flex items-center gap-2">
                  <AlertTriangle className="h-4 w-4 text-yellow-500" /> Aktive Warnungen
                </CardTitle>
              </CardHeader>
              <CardContent>
                <ScrollArea className="h-[300px]">
                  {alerts.filter(a => a.status !== 'resolved' && a.status !== 'dismissed').length === 0 ? (
                    <p className="text-muted-foreground text-sm text-center py-8">Keine aktiven Warnungen</p>
                  ) : (
                    <div className="space-y-2">
                      {alerts.filter(a => a.status !== 'resolved' && a.status !== 'dismissed').slice(0, 10).map(alert => (
                        <div key={alert.id} className="flex items-start gap-3 p-2 rounded-lg hover:bg-muted/50">
                          <Badge variant="outline" className={`${severityColor(alert.severity)} text-[10px] shrink-0`}>
                            P{alert.priority}
                          </Badge>
                          <div className="min-w-0 flex-1">
                            <p className="text-sm font-medium truncate">{alert.title}</p>
                            <p className="text-xs text-muted-foreground">{alert.alert_type} • {alert.status}</p>
                          </div>
                          <Button size="sm" variant="outline" className="text-xs h-6 shrink-0" onClick={() => resolveAlert(alert.id)}>
                            Lösen
                          </Button>
                        </div>
                      ))}
                    </div>
                  )}
                </ScrollArea>
              </CardContent>
            </Card>

            {/* Threat Intel Summary */}
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm flex items-center gap-2">
                  <Eye className="h-4 w-4 text-purple-500" /> Threat Intelligence
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-2 gap-3">
                  {['ip', 'domain', 'hash_sha256', 'url'].map(type => {
                    const count = threatIntel.filter(t => t.indicator_type === type).length;
                    return (
                      <div key={type} className="p-3 rounded-lg bg-muted/50 text-center">
                        <p className="text-2xl font-bold">{count}</p>
                        <p className="text-xs text-muted-foreground uppercase">{type.replace('_', ' ')}</p>
                      </div>
                    );
                  })}
                </div>
              </CardContent>
            </Card>

            {/* Honeypot Activity */}
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm flex items-center gap-2">
                  <Target className="h-4 w-4 text-amber-500" /> Honeypot-Aktivität
                </CardTitle>
              </CardHeader>
              <CardContent>
                <ScrollArea className="h-[120px]">
                  {honeypotEvents.length === 0 ? (
                    <p className="text-muted-foreground text-sm text-center py-4">Keine Honeypot-Aktivität</p>
                  ) : (
                    <div className="space-y-2">
                      {honeypotEvents.slice(0, 5).map(hp => (
                        <div key={hp.id} className="flex items-center gap-2 text-xs">
                          <Badge variant="outline" className="bg-amber-500/10 text-amber-400 text-[10px]">{hp.honeypot_type}</Badge>
                          <span className="font-mono">{hp.attacker_ip}</span>
                          <span className="text-muted-foreground">{hp.attack_type}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </ScrollArea>
              </CardContent>
            </Card>
          </div>

          {/* Latest AI Analysis */}
          {aiAnalyses.length > 0 && (
            <Card className="border-cyan-500/30">
              <CardHeader className="pb-3">
                <CardTitle className="text-sm flex items-center gap-2">
                  <Bot className="h-4 w-4 text-cyan-500" /> Letzte KI-Analyse
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="bg-muted/30 rounded-lg p-4">
                  <p className="text-sm">{aiAnalyses[0].summary || JSON.stringify(aiAnalyses[0].analysis_result).slice(0, 300)}</p>
                  {aiAnalyses[0].recommendations && aiAnalyses[0].recommendations.length > 0 && (
                    <div className="mt-3 space-y-1">
                      <p className="text-xs font-semibold text-cyan-500">Empfehlungen:</p>
                      {aiAnalyses[0].recommendations.slice(0, 3).map((r: string, i: number) => (
                        <p key={i} className="text-xs text-muted-foreground">• {r}</p>
                      ))}
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        {/* WEB PROTECTION TAB */}
        <TabsContent value="webprotection" className="mt-4">
          <AdminSecurityManager />
        </TabsContent>

        {/* THREATS TAB */}
        <TabsContent value="threats" className="space-y-4 mt-4">
          <div className="flex justify-between items-center">
            <h3 className="font-semibold">Bedrohungsereignisse</h3>
            <Dialog open={showAddThreat} onOpenChange={setShowAddThreat}>
              <DialogTrigger asChild>
                <Button size="sm"><Plus className="h-4 w-4 mr-1" /> Bedrohung melden</Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader><DialogTitle>Bedrohung melden</DialogTitle></DialogHeader>
                <div className="space-y-3">
                  <Input placeholder="Titel" value={newThreat.title} onChange={e => setNewThreat({...newThreat, title: e.target.value})} />
                  <Textarea placeholder="Beschreibung" value={newThreat.description} onChange={e => setNewThreat({...newThreat, description: e.target.value})} />
                  <div className="grid grid-cols-2 gap-3">
                    <Select value={newThreat.event_type} onValueChange={v => setNewThreat({...newThreat, event_type: v})}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {['malware','ransomware','phishing','intrusion','ddos','xss','sqli','brute_force','data_exfil','zero_day','anomaly'].map(t => (
                          <SelectItem key={t} value={t}>{t.replace('_',' ').toUpperCase()}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <Select value={newThreat.severity} onValueChange={v => setNewThreat({...newThreat, severity: v})}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {['critical','high','medium','low','info'].map(s => (
                          <SelectItem key={s} value={s}>{s.toUpperCase()}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <Input placeholder="Quell-IP" value={newThreat.source_ip} onChange={e => setNewThreat({...newThreat, source_ip: e.target.value})} />
                  <div className="grid grid-cols-2 gap-3">
                    <Select value={newThreat.attack_vector} onValueChange={v => setNewThreat({...newThreat, attack_vector: v})}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {['email','web','network','usb','insider','supply_chain'].map(v => (
                          <SelectItem key={v} value={v}>{v.replace('_',' ').toUpperCase()}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <Select value={newThreat.action_taken} onValueChange={v => setNewThreat({...newThreat, action_taken: v})}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {['detected','blocked','quarantined','allowed','investigating'].map(a => (
                          <SelectItem key={a} value={a}>{a.toUpperCase()}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <Button className="w-full" onClick={addThreatEvent}>Bedrohung registrieren</Button>
                </div>
              </DialogContent>
            </Dialog>
          </div>
          <Card>
            <CardContent className="p-0">
              <ScrollArea className="h-[500px]">
                <div className="divide-y">
                  {threatEvents.map(event => (
                    <div key={event.id} className="flex items-center gap-4 p-4 hover:bg-muted/30 transition-colors">
                      <Badge variant="outline" className={`${severityColor(event.severity)} text-[10px] w-16 justify-center`}>
                        {event.severity.toUpperCase()}
                      </Badge>
                      <div className="flex-1 min-w-0">
                        <p className="font-medium text-sm truncate">{event.title}</p>
                        <p className="text-xs text-muted-foreground">
                          {event.event_type} • {event.attack_vector || 'N/A'} • {event.source_ip || 'Unbekannt'}
                        </p>
                      </div>
                      <Badge variant="outline" className={statusColor(event.action_taken === 'blocked' ? 'resolved' : 'open')}>
                        {event.action_taken}
                      </Badge>
                      <span className="text-xs text-muted-foreground whitespace-nowrap">
                        {format(new Date(event.created_at), 'dd.MM.yy HH:mm')}
                      </span>
                      <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => runAIAnalysis('analyze_threat', event)} disabled={aiLoading}>
                        <Brain className="h-3.5 w-3.5 text-cyan-500" />
                      </Button>
                    </div>
                  ))}
                  {threatEvents.length === 0 && (
                    <p className="text-center text-muted-foreground py-12">Keine Bedrohungen registriert</p>
                  )}
                </div>
              </ScrollArea>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ASSETS TAB */}
        <TabsContent value="assets" className="space-y-4 mt-4">
          <div className="flex justify-between items-center">
            <h3 className="font-semibold">Geschützte Assets</h3>
            <Dialog open={showAddAsset} onOpenChange={setShowAddAsset}>
              <DialogTrigger asChild>
                <Button size="sm"><Plus className="h-4 w-4 mr-1" /> Asset hinzufügen</Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader><DialogTitle>Neues Asset registrieren</DialogTitle></DialogHeader>
                <div className="space-y-3">
                  <Input placeholder="Asset-Name" value={newAsset.asset_name} onChange={e => setNewAsset({...newAsset, asset_name: e.target.value})} />
                  <div className="grid grid-cols-2 gap-3">
                    <Select value={newAsset.asset_type} onValueChange={v => setNewAsset({...newAsset, asset_type: v})}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {['endpoint','server','cloud','iot','mobile','network'].map(t => (
                          <SelectItem key={t} value={t}>{t.toUpperCase()}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <Select value={newAsset.os_type || ''} onValueChange={v => setNewAsset({...newAsset, os_type: v})}>
                      <SelectTrigger><SelectValue placeholder="Betriebssystem" /></SelectTrigger>
                      <SelectContent>
                        {['windows','linux','macos','android','ios','firmware'].map(o => (
                          <SelectItem key={o} value={o}>{o.toUpperCase()}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <Input placeholder="IP-Adresse" value={newAsset.ip_address} onChange={e => setNewAsset({...newAsset, ip_address: e.target.value})} />
                  <Input placeholder="Hostname" value={newAsset.hostname} onChange={e => setNewAsset({...newAsset, hostname: e.target.value})} />
                  <Input placeholder="Standort" value={newAsset.location} onChange={e => setNewAsset({...newAsset, location: e.target.value})} />
                  <Select value={newAsset.protection_level} onValueChange={v => setNewAsset({...newAsset, protection_level: v})}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {['basic','standard','advanced','enterprise'].map(l => (
                        <SelectItem key={l} value={l}>{l.toUpperCase()}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Button className="w-full" onClick={addAsset}>Asset registrieren</Button>
                </div>
              </DialogContent>
            </Dialog>
          </div>
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
            {assets.map(asset => {
              const Icon = assetIcon(asset.asset_type);
              return (
                <Card key={asset.id} className="hover:shadow-md transition-shadow">
                  <CardContent className="p-4">
                    <div className="flex items-start gap-3">
                      <div className="p-2 rounded-lg bg-muted">
                        <Icon className="h-5 w-5" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="font-medium text-sm truncate">{asset.asset_name}</p>
                        <p className="text-xs text-muted-foreground">{asset.hostname || asset.ip_address || 'N/A'}</p>
                      </div>
                      <Badge variant="outline" className={statusColor(asset.status)}>
                        {asset.status}
                      </Badge>
                    </div>
                    <div className="mt-3 grid grid-cols-3 gap-2 text-center">
                      <div className="bg-muted/50 rounded p-1">
                        <p className="text-[10px] text-muted-foreground">Typ</p>
                        <p className="text-xs font-medium">{asset.asset_type}</p>
                      </div>
                      <div className="bg-muted/50 rounded p-1">
                        <p className="text-[10px] text-muted-foreground">OS</p>
                        <p className="text-xs font-medium">{asset.os_type || '-'}</p>
                      </div>
                      <div className="bg-muted/50 rounded p-1">
                        <p className="text-[10px] text-muted-foreground">Risiko</p>
                        <p className={`text-xs font-bold ${asset.risk_score > 70 ? 'text-red-500' : asset.risk_score > 40 ? 'text-yellow-500' : 'text-green-500'}`}>
                          {asset.risk_score}%
                        </p>
                      </div>
                    </div>
                    <div className="mt-2 flex items-center justify-between text-[10px] text-muted-foreground">
                      <span>Schutz: {asset.protection_level}</span>
                      <span>Gesehen: {format(new Date(asset.last_seen_at), 'dd.MM HH:mm')}</span>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
            {assets.length === 0 && (
              <div className="col-span-full text-center py-12 text-muted-foreground">
                <Monitor className="h-10 w-10 mx-auto mb-3 opacity-30" />
                <p>Keine Assets registriert</p>
                <p className="text-xs mt-1">Fügen Sie Endpoints, Server und Geräte hinzu</p>
              </div>
            )}
          </div>
        </TabsContent>

        {/* ALERTS TAB */}
        <TabsContent value="alerts" className="space-y-4 mt-4">
          <h3 className="font-semibold">Sicherheitswarnungen</h3>
          <Card>
            <CardContent className="p-0">
              <ScrollArea className="h-[500px]">
                <div className="divide-y">
                  {alerts.map(alert => (
                    <div key={alert.id} className="flex items-center gap-4 p-4 hover:bg-muted/30">
                      <div className={`w-2 h-8 rounded-full shrink-0 ${
                        alert.severity === 'critical' ? 'bg-red-500' :
                        alert.severity === 'high' ? 'bg-orange-500' :
                        alert.severity === 'medium' ? 'bg-yellow-500' : 'bg-blue-500'
                      }`} />
                      <div className="flex-1 min-w-0">
                        <p className="font-medium text-sm truncate">{alert.title}</p>
                        <p className="text-xs text-muted-foreground">{alert.description?.slice(0, 80)}</p>
                      </div>
                      <Badge variant="outline" className={statusColor(alert.status)}>{alert.status}</Badge>
                      <span className="text-xs text-muted-foreground">{format(new Date(alert.created_at), 'dd.MM HH:mm')}</span>
                      {alert.status !== 'resolved' && (
                        <Button size="sm" variant="outline" className="text-xs" onClick={() => resolveAlert(alert.id)}>
                          <CheckCircle2 className="h-3 w-3 mr-1" /> Lösen
                        </Button>
                      )}
                    </div>
                  ))}
                  {alerts.length === 0 && <p className="text-center text-muted-foreground py-12">Keine Warnungen</p>}
                </div>
              </ScrollArea>
            </CardContent>
          </Card>
        </TabsContent>

        {/* THREAT INTEL TAB */}
        <TabsContent value="intel" className="space-y-4 mt-4">
          <div className="flex justify-between items-center">
            <h3 className="font-semibold">Threat Intelligence Datenbank</h3>
            <Dialog open={showAddIntel} onOpenChange={setShowAddIntel}>
              <DialogTrigger asChild>
                <Button size="sm"><Plus className="h-4 w-4 mr-1" /> IOC hinzufügen</Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader><DialogTitle>Threat Indicator hinzufügen</DialogTitle></DialogHeader>
                <div className="space-y-3">
                  <div className="grid grid-cols-2 gap-3">
                    <Select value={newIntel.indicator_type} onValueChange={v => setNewIntel({...newIntel, indicator_type: v})}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {['ip','domain','hash_md5','hash_sha256','url','email','cve'].map(t => (
                          <SelectItem key={t} value={t}>{t.toUpperCase()}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <Select value={newIntel.threat_type} onValueChange={v => setNewIntel({...newIntel, threat_type: v})}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {['malware','c2','phishing','exploit','botnet','spam','tor_exit'].map(t => (
                          <SelectItem key={t} value={t}>{t.toUpperCase()}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <Input placeholder="Indicator-Wert (IP, Domain, Hash...)" value={newIntel.indicator_value} onChange={e => setNewIntel({...newIntel, indicator_value: e.target.value})} />
                  <Select value={newIntel.severity} onValueChange={v => setNewIntel({...newIntel, severity: v})}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {['critical','high','medium','low'].map(s => (
                        <SelectItem key={s} value={s}>{s.toUpperCase()}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Textarea placeholder="Beschreibung" value={newIntel.description} onChange={e => setNewIntel({...newIntel, description: e.target.value})} />
                  <Button className="w-full" onClick={addThreatIntel}>IOC hinzufügen</Button>
                </div>
              </DialogContent>
            </Dialog>
          </div>
          <Card>
            <CardContent className="p-0">
              <ScrollArea className="h-[500px]">
                <div className="divide-y">
                  {threatIntel.map(intel => (
                    <div key={intel.id} className="flex items-center gap-4 p-4 hover:bg-muted/30">
                      <Badge variant="outline" className={severityColor(intel.severity)}>{intel.indicator_type.toUpperCase()}</Badge>
                      <code className="text-xs font-mono bg-muted px-2 py-1 rounded truncate max-w-[200px]">{intel.indicator_value}</code>
                      <span className="text-xs">{intel.threat_type}</span>
                      <span className="text-xs text-muted-foreground ml-auto">{intel.source}</span>
                      <Badge variant={intel.is_active ? 'default' : 'secondary'}>{intel.is_active ? 'Aktiv' : 'Inaktiv'}</Badge>
                    </div>
                  ))}
                  {threatIntel.length === 0 && <p className="text-center text-muted-foreground py-12">Keine Threat Intelligence Daten</p>}
                </div>
              </ScrollArea>
            </CardContent>
          </Card>
        </TabsContent>

        {/* HONEYPOT TAB */}
        <TabsContent value="honeypot" className="space-y-4 mt-4">
          <h3 className="font-semibold">Honeypot-Überwachung</h3>
          <div className="grid md:grid-cols-4 gap-3 mb-4">
            {['web', 'ssh', 'smtp', 'ftp'].map(type => {
              const count = honeypotEvents.filter(h => h.honeypot_type === type).length;
              return (
                <Card key={type}>
                  <CardContent className="p-4 text-center">
                    <p className="text-3xl font-bold">{count}</p>
                    <p className="text-xs text-muted-foreground uppercase">{type} Honeypot</p>
                  </CardContent>
                </Card>
              );
            })}
          </div>
          <Card>
            <CardContent className="p-0">
              <ScrollArea className="h-[400px]">
                <div className="divide-y">
                  {honeypotEvents.map(hp => (
                    <div key={hp.id} className="flex items-center gap-4 p-4 hover:bg-muted/30">
                      <Badge variant="outline" className="bg-amber-500/10 text-amber-400">{hp.honeypot_type}</Badge>
                      <code className="text-xs font-mono">{hp.attacker_ip}</code>
                      <span className="text-xs">Port {hp.target_port}</span>
                      <span className="text-xs">{hp.attack_type || 'scan'}</span>
                      <Badge variant={hp.is_automated ? 'secondary' : 'destructive'}>
                        {hp.is_automated ? 'Bot' : 'Mensch'}
                      </Badge>
                      <span className="text-xs text-muted-foreground ml-auto">
                        {format(new Date(hp.created_at), 'dd.MM HH:mm:ss')}
                      </span>
                    </div>
                  ))}
                  {honeypotEvents.length === 0 && <p className="text-center text-muted-foreground py-12">Keine Honeypot-Aktivität</p>}
                </div>
              </ScrollArea>
            </CardContent>
          </Card>
        </TabsContent>

        {/* AI ANALYSIS TAB */}
        <TabsContent value="ai" className="space-y-4 mt-4">
          <div className="flex justify-between items-center">
            <h3 className="font-semibold flex items-center gap-2">
              <Brain className="h-5 w-5 text-cyan-500" /> KI-gestützte Bedrohungsanalyse
            </h3>
            <Button onClick={() => runAIAnalysis('risk_assessment')} disabled={aiLoading}
              className="bg-gradient-to-r from-cyan-600 to-blue-600 text-white">
              {aiLoading ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <Zap className="h-4 w-4 mr-1" />}
              Neue Risikoanalyse starten
            </Button>
          </div>
          <div className="space-y-4">
            {aiAnalyses.map(analysis => (
              <Card key={analysis.id} className="border-cyan-500/20">
                <CardHeader className="pb-3">
                  <div className="flex items-center justify-between">
                    <CardTitle className="text-sm flex items-center gap-2">
                      <Bot className="h-4 w-4 text-cyan-500" />
                      {analysis.analysis_type === 'risk_assessment' ? 'Risikobewertung' : 'Bedrohungsanalyse'}
                    </CardTitle>
                    <div className="flex items-center gap-2">
                      {analysis.risk_score != null && (
                        <Badge variant="outline" className={`${
                          analysis.risk_score > 70 ? 'bg-red-500/20 text-red-400' :
                          analysis.risk_score > 40 ? 'bg-yellow-500/20 text-yellow-400' :
                          'bg-green-500/20 text-green-400'
                        }`}>
                          Risiko: {analysis.risk_score}%
                        </Badge>
                      )}
                      <span className="text-xs text-muted-foreground">
                        {format(new Date(analysis.created_at), 'dd.MM.yy HH:mm')}
                      </span>
                    </div>
                  </div>
                </CardHeader>
                <CardContent>
                  {analysis.summary && <p className="text-sm mb-3">{analysis.summary}</p>}
                  {analysis.recommendations && analysis.recommendations.length > 0 && (
                    <div className="bg-muted/30 rounded-lg p-3 space-y-1">
                      <p className="text-xs font-semibold text-cyan-500 mb-2">Empfehlungen:</p>
                      {analysis.recommendations.map((r: string, i: number) => (
                        <p key={i} className="text-xs text-muted-foreground flex items-start gap-2">
                          <CheckCircle2 className="h-3 w-3 text-cyan-500 mt-0.5 shrink-0" /> {r}
                        </p>
                      ))}
                    </div>
                  )}
                  {analysis.analysis_result && typeof analysis.analysis_result === 'object' && (
                    <details className="mt-3">
                      <summary className="text-xs text-muted-foreground cursor-pointer">Vollständige Analyse anzeigen</summary>
                      <pre className="text-xs mt-2 bg-muted/30 p-3 rounded-lg overflow-auto max-h-[300px]">
                        {JSON.stringify(analysis.analysis_result, null, 2)}
                      </pre>
                    </details>
                  )}
                </CardContent>
              </Card>
            ))}
            {aiAnalyses.length === 0 && (
              <div className="text-center py-16">
                <Brain className="h-12 w-12 mx-auto mb-4 text-muted-foreground/30" />
                <p className="text-muted-foreground">Keine KI-Analysen durchgeführt</p>
                <p className="text-xs text-muted-foreground mt-1">Starten Sie eine Risikoanalyse oder analysieren Sie einzelne Bedrohungen</p>
              </div>
            )}
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}

// Stat Card Component
function StatCard({ icon: Icon, label, value, color, bgColor }: { icon: any; label: string; value: string | number; color: string; bgColor: string }) {
  return (
    <Card>
      <CardContent className="p-3 flex items-center gap-3">
        <div className={`p-2 rounded-lg ${bgColor}`}>
          <Icon className={`h-4 w-4 ${color}`} />
        </div>
        <div>
          <p className="text-lg font-bold leading-none">{value}</p>
          <p className="text-[10px] text-muted-foreground">{label}</p>
        </div>
      </CardContent>
    </Card>
  );
}
