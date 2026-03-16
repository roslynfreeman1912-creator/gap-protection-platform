import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Progress } from '@/components/ui/progress';
import { toast } from 'sonner';
import {
  Activity, AlertTriangle, BarChart3, Brain, Eye, Globe, Loader2, Network,
  RefreshCw, Shield, ShieldAlert, Target, TrendingUp, Zap, AlertCircle, CheckCircle2
} from 'lucide-react';
import { format } from 'date-fns';

async function callSiemApi(action: string, data: Record<string, unknown> = {}) {
  const { data: result, error } = await supabase.functions.invoke('siem-engine', {
    body: { action, ...data },
  });
  if (error) throw new Error(error.message || 'API-Fehler');
  if (result?.error) throw new Error(result.error);
  return result;
}

const severityColor = (s: string) => {
  switch (s) {
    case 'critical': return 'bg-red-500/20 text-red-400 border-red-500/30';
    case 'high': return 'bg-orange-500/20 text-orange-400 border-orange-500/30';
    case 'medium': return 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30';
    case 'low': return 'bg-blue-500/20 text-blue-400 border-blue-500/30';
    default: return 'bg-muted text-muted-foreground';
  }
};

export function SIEMDashboard() {
  const [landscape, setLandscape] = useState<any>(null);
  const [alerts, setAlerts] = useState<any[]>([]);
  const [anomalies, setAnomalies] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [correlating, setCorrelating] = useState(false);
  const [detectingAnomalies, setDetectingAnomalies] = useState(false);
  const [activeTab, setActiveTab] = useState('landscape');

  const fetchLandscape = useCallback(async () => {
    setLoading(true);
    try {
      const data = await callSiemApi('get_threat_landscape');
      setLandscape(data);
    } catch (e: any) { toast.error(e.message); }
    setLoading(false);
  }, []);

  const fetchAlerts = useCallback(async () => {
    const { data } = await supabase.from('siem_correlated_alerts')
      .select('*').order('created_at', { ascending: false }).limit(100);
    setAlerts(data || []);
  }, []);

  useEffect(() => {
    fetchLandscape();
    fetchAlerts();
  }, [fetchLandscape, fetchAlerts]);

  const runCorrelation = async () => {
    setCorrelating(true);
    try {
      const data = await callSiemApi('correlate_events');
      toast.success(`Korrelation abgeschlossen — ${data.new_alerts || 0} neue Alarme`);
      fetchAlerts();
      fetchLandscape();
    } catch (e: any) { toast.error(e.message); }
    setCorrelating(false);
  };

  const runAnomalyDetection = async () => {
    setDetectingAnomalies(true);
    try {
      const data = await callSiemApi('run_anomaly_detection');
      setAnomalies(data);
      toast.success(`Anomalieerkennung: ${data.total_anomalies || 0} Anomalien gefunden`);
    } catch (e: any) { toast.error(e.message); }
    setDetectingAnomalies(false);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-8 w-8 animate-spin text-cyan-500" />
        <span className="ml-3 text-muted-foreground">SIEM-Daten werden geladen...</span>
      </div>
    );
  }

  const ls = landscape || {};
  const siemStats = ls.siem_alerts || {};
  const incidentStats = ls.incidents || {};
  const fraudDist = ls.fraud_distribution || {};
  const threatIntel = ls.threat_intel || {};
  const authEvents = ls.auth_events || {};

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Network className="h-7 w-7 text-cyan-500" />
            SIEM & Bedrohungskorrelation
          </h1>
          <p className="text-muted-foreground text-sm mt-1">Security Information & Event Management — Echtzeit-Korrelation</p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => { fetchLandscape(); fetchAlerts(); }}>
            <RefreshCw className="h-4 w-4 mr-1" /> Aktualisieren
          </Button>
          <Button size="sm" onClick={runCorrelation} disabled={correlating}
            className="bg-gradient-to-r from-cyan-600 to-blue-600 text-white">
            {correlating ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <Zap className="h-4 w-4 mr-1" />}
            Korrelation starten
          </Button>
          <Button size="sm" variant="outline" onClick={runAnomalyDetection} disabled={detectingAnomalies}
            className="border-purple-500/30 text-purple-400">
            {detectingAnomalies ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <Brain className="h-4 w-4 mr-1" />}
            Anomalieerkennung
          </Button>
        </div>
      </div>

      {/* Top Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-3">
        <StatCard icon={ShieldAlert} label="SIEM-Alarme" value={siemStats.total || 0} sub={`${siemStats.unresolved || 0} offen`} color="text-red-500" bg="bg-red-500/10" />
        <StatCard icon={AlertTriangle} label="Vorfälle" value={incidentStats.total || 0} sub={`${incidentStats.open || 0} offen`} color="text-orange-500" bg="bg-orange-500/10" />
        <StatCard icon={Target} label="Betrug Ø" value={`${fraudDist.avg_score || 0}`} sub={`${fraudDist.high_risk || 0} Hochrisiko`} color="text-yellow-500" bg="bg-yellow-500/10" />
        <StatCard icon={Eye} label="IOCs" value={threatIntel.total_iocs || 0} sub={`${threatIntel.active_iocs || 0} aktiv`} color="text-purple-500" bg="bg-purple-500/10" />
        <StatCard icon={Activity} label="Auth-Events" value={authEvents.total_24h || 0} sub={`${authEvents.failed_24h || 0} fehlgeschlagen`} color="text-cyan-500" bg="bg-cyan-500/10" />
        <StatCard icon={Globe} label="Blockierte IPs" value={threatIntel.blocked_ips || 0} sub="Geo-Blocking" color="text-green-500" bg="bg-green-500/10" />
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="grid w-full grid-cols-4">
          <TabsTrigger value="landscape">Bedrohungslage</TabsTrigger>
          <TabsTrigger value="alerts">Korrelierte Alarme</TabsTrigger>
          <TabsTrigger value="anomalies">Anomalieerkennung</TabsTrigger>
          <TabsTrigger value="intel">Threat Intel</TabsTrigger>
        </TabsList>

        {/* THREAT LANDSCAPE */}
        <TabsContent value="landscape" className="mt-4 space-y-4">
          <div className="grid md:grid-cols-2 gap-4">
            {/* SIEM Alert Distribution */}
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm flex items-center gap-2">
                  <ShieldAlert className="h-4 w-4 text-red-500" /> SIEM-Alarm Verteilung
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {[
                    { label: 'Kritisch', count: siemStats.critical || 0, color: 'bg-red-500', max: siemStats.total || 1 },
                    { label: 'Hoch', count: siemStats.high || 0, color: 'bg-orange-500', max: siemStats.total || 1 },
                    { label: 'Mittel', count: siemStats.medium || 0, color: 'bg-yellow-500', max: siemStats.total || 1 },
                    { label: 'Niedrig', count: siemStats.low || 0, color: 'bg-blue-500', max: siemStats.total || 1 },
                  ].map(item => (
                    <div key={item.label} className="space-y-1">
                      <div className="flex items-center justify-between text-xs">
                        <span>{item.label}</span>
                        <span className="font-bold">{item.count}</span>
                      </div>
                      <div className="h-2 bg-muted rounded-full overflow-hidden">
                        <div className={`h-full ${item.color} rounded-full transition-all`}
                          style={{ width: `${Math.min((item.count / item.max) * 100, 100)}%` }} />
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>

            {/* Incident Overview */}
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm flex items-center gap-2">
                  <AlertTriangle className="h-4 w-4 text-orange-500" /> Vorfall-Übersicht
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-2 gap-3">
                  {[
                    { label: 'Offen', value: incidentStats.open || 0, color: 'text-red-400' },
                    { label: 'Untersuchen', value: incidentStats.investigating || 0, color: 'text-yellow-400' },
                    { label: 'Eingedämmt', value: incidentStats.contained || 0, color: 'text-blue-400' },
                    { label: 'Gelöst', value: incidentStats.resolved || 0, color: 'text-green-400' },
                  ].map(item => (
                    <div key={item.label} className="p-3 rounded-lg bg-muted/50 text-center">
                      <p className={`text-2xl font-bold ${item.color}`}>{item.value}</p>
                      <p className="text-xs text-muted-foreground">{item.label}</p>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>

            {/* Fraud Score Distribution */}
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm flex items-center gap-2">
                  <Target className="h-4 w-4 text-yellow-500" /> Betrugs-Risikoverteilung
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  <div className="flex items-center justify-between text-xs">
                    <span>Durchschn. Score</span>
                    <span className={`font-bold ${(fraudDist.avg_score || 0) > 500 ? 'text-red-400' : (fraudDist.avg_score || 0) > 200 ? 'text-yellow-400' : 'text-green-400'}`}>
                      {fraudDist.avg_score || 0} / 1000
                    </span>
                  </div>
                  <Progress value={((fraudDist.avg_score || 0) / 1000) * 100} className="h-3" />
                  <div className="grid grid-cols-3 gap-2 mt-3">
                    <div className="bg-green-500/10 rounded p-2 text-center">
                      <p className="text-lg font-bold text-green-400">{fraudDist.low_risk || 0}</p>
                      <p className="text-[10px] text-muted-foreground">Niedrig</p>
                    </div>
                    <div className="bg-yellow-500/10 rounded p-2 text-center">
                      <p className="text-lg font-bold text-yellow-400">{fraudDist.medium_risk || 0}</p>
                      <p className="text-[10px] text-muted-foreground">Mittel</p>
                    </div>
                    <div className="bg-red-500/10 rounded p-2 text-center">
                      <p className="text-lg font-bold text-red-400">{fraudDist.high_risk || 0}</p>
                      <p className="text-[10px] text-muted-foreground">Hoch</p>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Auth Events */}
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm flex items-center gap-2">
                  <Activity className="h-4 w-4 text-cyan-500" /> Authentifizierung (24h)
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  <div className="grid grid-cols-2 gap-3">
                    <div className="bg-green-500/10 rounded-lg p-3 text-center">
                      <p className="text-xl font-bold text-green-400">{authEvents.successful_24h || 0}</p>
                      <p className="text-[10px] text-muted-foreground">Erfolgreich</p>
                    </div>
                    <div className="bg-red-500/10 rounded-lg p-3 text-center">
                      <p className="text-xl font-bold text-red-400">{authEvents.failed_24h || 0}</p>
                      <p className="text-[10px] text-muted-foreground">Fehlgeschlagen</p>
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="bg-orange-500/10 rounded-lg p-3 text-center">
                      <p className="text-xl font-bold text-orange-400">{authEvents.locked_accounts || 0}</p>
                      <p className="text-[10px] text-muted-foreground">Gesperrte Konten</p>
                    </div>
                    <div className="bg-purple-500/10 rounded-lg p-3 text-center">
                      <p className="text-xl font-bold text-purple-400">{authEvents.active_sessions || 0}</p>
                      <p className="text-[10px] text-muted-foreground">Aktive Sitzungen</p>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* CORRELATED ALERTS */}
        <TabsContent value="alerts" className="mt-4">
          <Card>
            <CardContent className="p-0">
              <ScrollArea className="h-[550px]">
                <div className="divide-y">
                  {alerts.map(alert => (
                    <div key={alert.id} className="p-4 hover:bg-muted/30 transition-colors">
                      <div className="flex items-center gap-3 mb-2">
                        <Badge variant="outline" className={severityColor(alert.severity)}>
                          {(alert.severity || 'unknown').toUpperCase()}
                        </Badge>
                        <span className="text-xs font-mono text-muted-foreground">{alert.rule_name}</span>
                        <span className="text-xs text-muted-foreground ml-auto">
                          {alert.created_at ? format(new Date(alert.created_at), 'dd.MM.yy HH:mm:ss') : ''}
                        </span>
                      </div>
                      <p className="text-sm font-medium">{alert.description || alert.rule_name}</p>
                      {alert.correlated_events && (
                        <div className="mt-2 flex items-center gap-2 text-xs text-muted-foreground">
                          <Network className="h-3 w-3" />
                          {Array.isArray(alert.correlated_events)
                            ? `${alert.correlated_events.length} korrelierte Events`
                            : 'Korrelierte Events vorhanden'}
                        </div>
                      )}
                      {alert.recommended_action && (
                        <div className="mt-2 bg-cyan-500/10 rounded p-2 text-xs text-cyan-400">
                          <strong>Empfehlung:</strong> {alert.recommended_action}
                        </div>
                      )}
                    </div>
                  ))}
                  {alerts.length === 0 && (
                    <div className="text-center py-16">
                      <Network className="h-10 w-10 mx-auto mb-3 text-muted-foreground/30" />
                      <p className="text-muted-foreground">Keine korrelierten Alarme</p>
                      <p className="text-xs text-muted-foreground mt-1">Starten Sie die Korrelation, um Muster zu erkennen</p>
                    </div>
                  )}
                </div>
              </ScrollArea>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ANOMALY DETECTION */}
        <TabsContent value="anomalies" className="mt-4 space-y-4">
          {anomalies ? (
            <>
              <div className="grid grid-cols-3 gap-3">
                <Card><CardContent className="p-4 text-center">
                  <p className="text-3xl font-bold text-red-400">{anomalies.total_anomalies || 0}</p>
                  <p className="text-xs text-muted-foreground">Anomalien gesamt</p>
                </CardContent></Card>
                <Card><CardContent className="p-4 text-center">
                  <p className="text-3xl font-bold text-yellow-400">
                    {(anomalies.commission_anomalies?.length || 0)}
                  </p>
                  <p className="text-xs text-muted-foreground">Provisions-Anomalien</p>
                </CardContent></Card>
                <Card><CardContent className="p-4 text-center">
                  <p className="text-3xl font-bold text-orange-400">
                    {(anomalies.withdrawal_anomalies?.length || 0)}
                  </p>
                  <p className="text-xs text-muted-foreground">Auszahlungs-Anomalien</p>
                </CardContent></Card>
              </div>

              {/* Commission Anomalies */}
              {anomalies.commission_anomalies?.length > 0 && (
                <Card>
                  <CardHeader className="pb-3">
                    <CardTitle className="text-sm flex items-center gap-2">
                      <TrendingUp className="h-4 w-4 text-yellow-500" /> Provisions-Anomalien
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <ScrollArea className="h-[300px]">
                      <div className="space-y-2">
                        {anomalies.commission_anomalies.map((a: any, i: number) => (
                          <div key={i} className="flex items-center gap-3 p-3 rounded-lg bg-muted/30">
                            <AlertCircle className={`h-4 w-4 ${a.z_score > 3 ? 'text-red-400' : 'text-yellow-400'}`} />
                            <div className="flex-1">
                              <p className="text-sm font-medium">Profil: {(a.profile_id || '').slice(0, 8)}...</p>
                              <p className="text-xs text-muted-foreground">
                                Betrag: €{a.amount?.toFixed(2)} • Z-Score: {a.z_score?.toFixed(2)} • σ {a.z_score > 3 ? '> 3' : '> 2'}
                              </p>
                            </div>
                            <Badge variant="outline" className={a.z_score > 3 ? 'bg-red-500/20 text-red-400' : 'bg-yellow-500/20 text-yellow-400'}>
                              {a.z_score > 3 ? 'Kritisch' : 'Auffällig'}
                            </Badge>
                          </div>
                        ))}
                      </div>
                    </ScrollArea>
                  </CardContent>
                </Card>
              )}

              {/* Withdrawal Anomalies */}
              {anomalies.withdrawal_anomalies?.length > 0 && (
                <Card>
                  <CardHeader className="pb-3">
                    <CardTitle className="text-sm flex items-center gap-2">
                      <BarChart3 className="h-4 w-4 text-orange-500" /> Auszahlungs-Anomalien
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <ScrollArea className="h-[300px]">
                      <div className="space-y-2">
                        {anomalies.withdrawal_anomalies.map((a: any, i: number) => (
                          <div key={i} className="flex items-center gap-3 p-3 rounded-lg bg-muted/30">
                            <AlertCircle className={`h-4 w-4 ${a.z_score > 3 ? 'text-red-400' : 'text-orange-400'}`} />
                            <div className="flex-1">
                              <p className="text-sm font-medium">Profil: {(a.profile_id || '').slice(0, 8)}...</p>
                              <p className="text-xs text-muted-foreground">
                                Betrag: €{a.amount?.toFixed(2)} • Z-Score: {a.z_score?.toFixed(2)}
                              </p>
                            </div>
                            <Badge variant="outline" className={a.z_score > 3 ? 'bg-red-500/20 text-red-400' : 'bg-orange-500/20 text-orange-400'}>
                              {a.z_score > 3 ? 'Kritisch' : 'Auffällig'}
                            </Badge>
                          </div>
                        ))}
                      </div>
                    </ScrollArea>
                  </CardContent>
                </Card>
              )}
            </>
          ) : (
            <div className="text-center py-16">
              <Brain className="h-12 w-12 mx-auto mb-4 text-muted-foreground/30" />
              <p className="text-muted-foreground">Anomalieerkennung noch nicht ausgeführt</p>
              <p className="text-xs text-muted-foreground mt-1">Klicken Sie oben auf "Anomalieerkennung" für eine statistische Analyse</p>
              <Button variant="outline" className="mt-4" onClick={runAnomalyDetection} disabled={detectingAnomalies}>
                {detectingAnomalies ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <Brain className="h-4 w-4 mr-1" />}
                Jetzt analysieren
              </Button>
            </div>
          )}
        </TabsContent>

        {/* THREAT INTEL */}
        <TabsContent value="intel" className="mt-4 space-y-4">
          <div className="grid md:grid-cols-2 gap-4">
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm flex items-center gap-2">
                  <Eye className="h-4 w-4 text-purple-500" /> Threat Intelligence Überblick
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-2 gap-3">
                  <div className="p-3 rounded-lg bg-muted/50 text-center">
                    <p className="text-2xl font-bold text-purple-400">{threatIntel.total_iocs || 0}</p>
                    <p className="text-xs text-muted-foreground">IOCs Gesamt</p>
                  </div>
                  <div className="p-3 rounded-lg bg-muted/50 text-center">
                    <p className="text-2xl font-bold text-green-400">{threatIntel.active_iocs || 0}</p>
                    <p className="text-xs text-muted-foreground">Aktive IOCs</p>
                  </div>
                  <div className="p-3 rounded-lg bg-muted/50 text-center">
                    <p className="text-2xl font-bold text-red-400">{threatIntel.blocked_ips || 0}</p>
                    <p className="text-xs text-muted-foreground">Blockierte IPs</p>
                  </div>
                  <div className="p-3 rounded-lg bg-muted/50 text-center">
                    <p className="text-2xl font-bold text-cyan-400">{threatIntel.geo_rules || 0}</p>
                    <p className="text-xs text-muted-foreground">Geo-Regeln</p>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm flex items-center gap-2">
                  <Globe className="h-4 w-4 text-cyan-500" /> IP-Reputation & Geo-Blocking
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-muted-foreground mb-3">
                  IP-Reputation und Geo-Blocking werden automatisch bei jedem Login geprüft.
                  IOCs werden bei der Korrelation abgeglichen.
                </p>
                <div className="space-y-2">
                  <div className="flex items-center gap-2 text-xs">
                    <CheckCircle2 className="h-3.5 w-3.5 text-green-400" />
                    <span>Automatische IOC-Prüfung bei Login</span>
                  </div>
                  <div className="flex items-center gap-2 text-xs">
                    <CheckCircle2 className="h-3.5 w-3.5 text-green-400" />
                    <span>TOR/VPN/Proxy-Erkennung</span>
                  </div>
                  <div className="flex items-center gap-2 text-xs">
                    <CheckCircle2 className="h-3.5 w-3.5 text-green-400" />
                    <span>Geo-Blocking mit Länderlisten</span>
                  </div>
                  <div className="flex items-center gap-2 text-xs">
                    <CheckCircle2 className="h-3.5 w-3.5 text-green-400" />
                    <span>Z-Score Anomalieerkennung</span>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}

function StatCard({ icon: Icon, label, value, sub, color, bg }: {
  icon: any; label: string; value: string | number; sub?: string; color: string; bg: string;
}) {
  return (
    <Card>
      <CardContent className="p-3 flex items-center gap-3">
        <div className={`p-2 rounded-lg ${bg}`}>
          <Icon className={`h-4 w-4 ${color}`} />
        </div>
        <div>
          <p className="text-lg font-bold leading-none">{value}</p>
          <p className="text-[10px] text-muted-foreground">{label}</p>
          {sub && <p className="text-[9px] text-muted-foreground/70">{sub}</p>}
        </div>
      </CardContent>
    </Card>
  );
}
