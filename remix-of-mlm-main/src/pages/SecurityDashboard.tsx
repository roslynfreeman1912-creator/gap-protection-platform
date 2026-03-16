import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { Layout } from '@/components/layout/Layout';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Progress } from '@/components/ui/progress';
import { Switch } from '@/components/ui/switch';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { supabase } from '@/integrations/supabase/client';
import { securityApi } from '@/lib/securityApi';
import { VulnTemplateManager } from '@/components/security/VulnTemplateManager';
import { useToast } from '@/hooks/use-toast';
import gapLogoColor from '@/assets/gap-logo-horizontal-navy.png';
import { 
  Shield, Activity, Target, FileText, Calendar, Play, 
  Download, RefreshCw, Clock, CheckCircle, XCircle, AlertTriangle,
  Radar, Scan, Globe, ShieldAlert, ShieldCheck, Bug,
  Lock, Unlock, Zap, Eye, Server, Wifi, WifiOff,
  Search, BarChart3, TrendingUp, AlertCircle, ShieldOff,
  Loader2, ExternalLink, Ban, Fingerprint
} from 'lucide-react';

interface ProtectedDomain {
  id: string;
  domain: string;
  protection_status: string;
  waf_enabled: boolean;
  ddos_protection: boolean;
  ssl_managed: boolean;
  activated_at: string | null;
  expires_at: string | null;
}

interface ThreatLog {
  id: string;
  check_type: string;
  status: string;
  checked_at: string;
  details: any;
  response_time_ms: number | null;
}

interface ProtectionScanResult {
  domain: string;
  score: number;
  threatLevel: string;
  sslValid: boolean;
  ssl: { valid: boolean; protocol: string; hsts: boolean; hstsMaxAge: number; includeSubDomains: boolean; preload: boolean };
  headersScore: string;
  headerChecks: Record<string, boolean>;
  blacklist: { listed: boolean; lists: string[]; details: Record<string, boolean> };
  malware: { hasMalware: boolean; indicators: Array<{ type: string; detail: string; severity: string }> };
  ports: Array<{ port: number; service: string; open: boolean; risk: string }>;
  openDangerousPorts: Array<{ port: number; service: string; open: boolean; risk: string }>;
  dns: { spf: boolean; dmarc: boolean; dnssec: boolean; caa: boolean; records: string[]; ns: string[]; mx: string[] };
  technologies: string[];
}

export default function SecurityDashboard() {
  const { user, profile } = useAuth();
  const navigate = useNavigate();
  const { toast } = useToast();
  
  const [loading, setLoading] = useState(true);
  const [domains, setDomains] = useState<ProtectedDomain[]>([]);
  const [threats, setThreats] = useState<ThreatLog[]>([]);
  const [scanResult, setScanResult] = useState<ProtectionScanResult | null>(null);
  const [scanning, setScanning] = useState(false);
  const [selectedDomain, setSelectedDomain] = useState<ProtectedDomain | null>(null);
  const [addDomainOpen, setAddDomainOpen] = useState(false);
  const [newDomain, setNewDomain] = useState('');
  const [addingDomain, setAddingDomain] = useState(false);

  const loadData = useCallback(async () => {
    if (!profile?.id) return;
    setLoading(true);
    try {
      const { data: domainsData } = await supabase
        .from('protected_domains')
        .select('*')
        .eq('profile_id', profile.id);
      
      setDomains(domainsData || []);
      if (domainsData && domainsData.length > 0) {
        setSelectedDomain(prev => prev || domainsData[0]);
      }
    } catch (error) {
      console.error('Error loading data:', error);
    }
    setLoading(false);
  }, [profile]);

  useEffect(() => {
    if (!user) { navigate('/auth'); return; }
    loadData();
  }, [user, profile, navigate, loadData]);

  const loadThreats = useCallback(async (domainId: string) => {
    const { data } = await supabase
      .from('domain_monitoring_logs')
      .select('*')
      .eq('domain_id', domainId)
      .order('checked_at', { ascending: false })
      .limit(50);
    setThreats(data || []);
  }, []);

  useEffect(() => {
    if (selectedDomain) loadThreats(selectedDomain.id);
  }, [selectedDomain, loadThreats]);

  const toggleWaf = async (domainId: string, enabled: boolean) => {
    try {
      const { error } = await supabase.functions.invoke('waf-protection', {
        body: { action: 'toggle_waf', domainId, enabled }
      });
      if (error) throw error;
      setDomains(prev => prev.map(d => d.id === domainId ? { ...d, waf_enabled: enabled } : d));
      if (selectedDomain?.id === domainId) setSelectedDomain(prev => prev ? { ...prev, waf_enabled: enabled } : null);
      toast({ title: enabled ? 'WAF aktiviert' : 'WAF deaktiviert', description: `Firewall ${enabled ? 'aktiviert' : 'deaktiviert'} für die Domain.` });
    } catch (e: any) {
      toast({ variant: 'destructive', title: 'Fehler', description: e.message });
    }
  };

  const toggleDdos = async (domainId: string, enabled: boolean) => {
    try {
      const { error } = await supabase.functions.invoke('waf-protection', {
        body: { action: 'toggle_ddos', domainId, enabled }
      });
      if (error) throw error;
      setDomains(prev => prev.map(d => d.id === domainId ? { ...d, ddos_protection: enabled } : d));
      if (selectedDomain?.id === domainId) setSelectedDomain(prev => prev ? { ...prev, ddos_protection: enabled } : null);
      toast({ title: enabled ? 'DDoS-Schutz aktiviert' : 'DDoS-Schutz deaktiviert' });
    } catch (e: any) {
      toast({ variant: 'destructive', title: 'Fehler', description: e.message });
    }
  };

  const runFullProtectionScan = async (domain: ProtectedDomain) => {
    setScanning(true);
    setScanResult(null);
    try {
      const { data, error } = await supabase.functions.invoke('waf-protection', {
        body: { action: 'full_protection_scan', domain: domain.domain, domainId: domain.id }
      });
      if (error) throw error;
      setScanResult(data);
      loadThreats(domain.id);
      toast({ title: 'Scan abgeschlossen', description: `Score: ${data.score}/100 — Bedrohungsstufe: ${data.threatLevel}` });
    } catch (e: any) {
      toast({ variant: 'destructive', title: 'Scan fehlgeschlagen', description: e.message });
    }
    setScanning(false);
  };

  const runDomainMonitor = async (domain: ProtectedDomain) => {
    try {
      const { data, error } = await supabase.functions.invoke('domain-monitor', {
        body: { action: 'check_domain', domainId: domain.id }
      });
      if (error) throw error;
      loadThreats(domain.id);
      toast({ title: 'Monitoring abgeschlossen', description: `${domain.domain} wurde überprüft.` });
    } catch (e: any) {
      toast({ variant: 'destructive', title: 'Fehler', description: e.message });
    }
  };

  const addDomain = async () => {
    if (!newDomain.trim() || !profile?.id) return;
    setAddingDomain(true);
    try {
      const cleanDomain = newDomain.trim().toLowerCase().replace(/^https?:\/\//, '').replace(/\/.*$/, '');
      await securityApi.insert('protected_domains', {
        domain: cleanDomain,
        profile_id: profile.id,
        protection_status: 'active',
        waf_enabled: true,
        ddos_protection: true,
        ssl_managed: true,
        activated_at: new Date().toISOString(),
      });
      setNewDomain('');
      setAddDomainOpen(false);
      loadData();
      toast({ title: 'Domain hinzugefügt', description: `${cleanDomain} wird jetzt geschützt.` });
    } catch (e: any) {
      toast({ variant: 'destructive', title: 'Fehler', description: e.message });
    }
    setAddingDomain(false);
  };

  const getThreatLevelColor = (level: string) => {
    switch (level) {
      case 'low': return 'text-green-500';
      case 'medium': return 'text-yellow-500';
      case 'high': return 'text-orange-500';
      case 'critical': return 'text-red-500';
      default: return 'text-muted-foreground';
    }
  };

  const getScoreColor = (score: number) => {
    if (score >= 80) return 'text-green-500';
    if (score >= 50) return 'text-yellow-500';
    if (score >= 30) return 'text-orange-500';
    return 'text-red-500';
  };

  if (loading) {
    return (
      <Layout>
        <div className="container py-8 flex items-center justify-center min-h-[400px]">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      </Layout>
    );
  }

  return (
    <Layout>
      <div className="container px-4 sm:px-6 max-w-7xl py-6 sm:py-8">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between mb-6 sm:mb-8 gap-4">
          <div className="flex items-center gap-3 sm:gap-4 min-w-0">
            <img src={gapLogoColor} alt="GAP Protection" className="h-8 sm:h-10 hidden sm:block" />
            <div>
              <h1 className="text-xl sm:text-2xl md:text-3xl font-bold flex items-center gap-2 sm:gap-3">
                <Shield className="h-6 w-6 sm:h-8 sm:w-8 text-primary shrink-0" />
                Security Dashboard
              </h1>
              <p className="text-sm sm:text-base text-muted-foreground mt-1">
                Echtzeit-Schutz & Überwachung Ihrer Infrastruktur
              </p>
            </div>
          </div>
          <div className="flex gap-2 sm:gap-3 shrink-0">
            <Button variant="outline" size="sm" onClick={loadData}>
              <RefreshCw className="h-4 w-4 sm:mr-2" /> <span className="hidden sm:inline">Aktualisieren</span>
            </Button>
            <Button size="sm" onClick={() => setAddDomainOpen(true)}>
              <Globe className="h-4 w-4 sm:mr-2" /> <span className="hidden sm:inline">Domain hinzufügen</span>
            </Button>
          </div>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-3 sm:gap-4 mb-6 sm:mb-8">
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">Geschützte Domains</p>
                  <p className="text-3xl font-bold">{domains.length}</p>
                </div>
                <Globe className="h-10 w-10 text-primary opacity-50" />
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">WAF Aktiv</p>
                  <p className="text-3xl font-bold">{domains.filter(d => d.waf_enabled).length}</p>
                </div>
                <ShieldCheck className="h-10 w-10 text-green-500 opacity-50" />
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">DDoS-Schutz</p>
                  <p className="text-3xl font-bold">{domains.filter(d => d.ddos_protection).length}</p>
                </div>
                <Zap className="h-10 w-10 text-blue-500 opacity-50" />
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">Bedrohungen</p>
                  <p className="text-3xl font-bold">{threats.filter(t => t.status === 'critical').length}</p>
                </div>
                <AlertTriangle className="h-10 w-10 text-red-500 opacity-50" />
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">SSL-Zertifikate</p>
                  <p className="text-3xl font-bold">{domains.filter(d => d.ssl_managed).length}</p>
                </div>
                <Lock className="h-10 w-10 text-green-500 opacity-50" />
              </div>
            </CardContent>
          </Card>
        </div>

        {domains.length === 0 ? (
          <Card className="py-20 text-center">
            <CardContent>
              <ShieldOff className="h-16 w-16 text-muted-foreground mx-auto mb-4" />
              <h2 className="text-2xl font-bold mb-2">Keine geschützten Domains</h2>
              <p className="text-muted-foreground mb-6">Fügen Sie Ihre erste Domain hinzu, um den Schutz zu aktivieren.</p>
              <Button onClick={() => setAddDomainOpen(true)} size="lg">
                <Globe className="h-5 w-5 mr-2" /> Domain hinzufügen
              </Button>
            </CardContent>
          </Card>
        ) : (
          <Tabs defaultValue="protection" className="space-y-6">
            <TabsList className="flex-wrap">
              <TabsTrigger value="protection" className="gap-2">
                <Shield className="h-4 w-4" /> WAF & Schutz
              </TabsTrigger>
              <TabsTrigger value="scan" className="gap-2">
                <Scan className="h-4 w-4" /> Deep Scan
              </TabsTrigger>
              <TabsTrigger value="threats" className="gap-2">
                <AlertTriangle className="h-4 w-4" /> Bedrohungen
              </TabsTrigger>
              <TabsTrigger value="monitoring" className="gap-2">
                <Activity className="h-4 w-4" /> 24/7 Monitoring
              </TabsTrigger>
              <TabsTrigger value="simulations" className="gap-2">
                <Target className="h-4 w-4" /> Adversary Sim
              </TabsTrigger>
              <TabsTrigger value="auto-scan" className="gap-2">
                <Radar className="h-4 w-4" /> Auto-Erkennung
              </TabsTrigger>
              <TabsTrigger value="vuln-templates" className="gap-2">
                <Bug className="h-4 w-4" /> Vuln Templates
              </TabsTrigger>
            </TabsList>

            {/* ═══ WAF & Protection ═══ */}
            <TabsContent value="protection" className="space-y-6">
              <div className="grid gap-6">
                {domains.map((domain) => (
                  <Card key={domain.id} className={`border-2 ${selectedDomain?.id === domain.id ? 'border-primary' : 'border-border'}`}>
                    <CardHeader>
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3 cursor-pointer" onClick={() => setSelectedDomain(domain)}>
                          <div className={`w-3 h-3 rounded-full ${domain.protection_status === 'active' ? 'bg-green-500 animate-pulse' : 'bg-red-500'}`} />
                          <div>
                            <CardTitle className="text-lg">{domain.domain}</CardTitle>
                            <CardDescription>
                              {domain.protection_status === 'active' ? 'Aktiv geschützt' : 'Inaktiv'} 
                              {domain.activated_at ? ` seit ${new Date(domain.activated_at).toLocaleDateString('de-DE')}` : ''}
                            </CardDescription>
                          </div>
                        </div>
                        <div className="flex items-center gap-4">
                          <Button variant="outline" size="sm" onClick={() => runDomainMonitor(domain)}>
                            <Activity className="h-4 w-4 mr-1" /> Monitor
                          </Button>
                          <Button size="sm" onClick={() => { setSelectedDomain(domain); runFullProtectionScan(domain); }}>
                            <Scan className="h-4 w-4 mr-1" /> Scan
                          </Button>
                        </div>
                      </div>
                    </CardHeader>
                    <CardContent>
                      <div className="grid md:grid-cols-4 gap-6">
                        {/* WAF Toggle */}
                        <div className="flex items-center justify-between p-4 rounded-lg bg-muted/50">
                          <div className="flex items-center gap-3">
                            <Shield className="h-5 w-5 text-primary" />
                            <div>
                              <p className="font-medium text-sm">Web Application Firewall</p>
                              <p className="text-xs text-muted-foreground">SQL Injection, XSS, CSRF Schutz</p>
                            </div>
                          </div>
                          <Switch checked={domain.waf_enabled} onCheckedChange={(v) => toggleWaf(domain.id, v)} />
                        </div>
                        {/* DDoS Toggle */}
                        <div className="flex items-center justify-between p-4 rounded-lg bg-muted/50">
                          <div className="flex items-center gap-3">
                            <Zap className="h-5 w-5 text-blue-500" />
                            <div>
                              <p className="font-medium text-sm">DDoS-Schutz</p>
                              <p className="text-xs text-muted-foreground">Layer 3/4/7 Protection</p>
                            </div>
                          </div>
                          <Switch checked={domain.ddos_protection} onCheckedChange={(v) => toggleDdos(domain.id, v)} />
                        </div>
                        {/* SSL */}
                        <div className="flex items-center gap-3 p-4 rounded-lg bg-muted/50">
                          <Lock className="h-5 w-5 text-green-500" />
                          <div>
                            <p className="font-medium text-sm">SSL/TLS</p>
                            <p className="text-xs text-muted-foreground">
                              {domain.ssl_managed ? 'Managed & Aktiv' : 'Nicht verwaltet'}
                            </p>
                          </div>
                          {domain.ssl_managed && <CheckCircle className="h-4 w-4 text-green-500 ml-auto" />}
                        </div>
                        {/* Status */}
                        <div className="flex items-center gap-3 p-4 rounded-lg bg-muted/50">
                          <Eye className="h-5 w-5 text-accent" />
                          <div>
                            <p className="font-medium text-sm">Überwachung</p>
                            <p className="text-xs text-muted-foreground">24/7 aktiv</p>
                          </div>
                          <div className="w-2 h-2 rounded-full bg-green-500 animate-pulse ml-auto" />
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </TabsContent>

            {/* ═══ Deep Scan ═══ */}
            <TabsContent value="scan" className="space-y-6">
              <Card>
                <CardHeader>
                  <div className="flex items-center justify-between">
                    <div>
                      <CardTitle className="flex items-center gap-2">
                        <Scan className="h-5 w-5" /> Deep Protection Scan
                      </CardTitle>
                      <CardDescription>
                        Blacklist-Prüfung, Malware-Erkennung, Port-Scan, Header-Analyse
                      </CardDescription>
                    </div>
                    {selectedDomain && (
                      <Button onClick={() => runFullProtectionScan(selectedDomain)} disabled={scanning}>
                        {scanning ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Play className="h-4 w-4 mr-2" />}
                        {scanning ? 'Scannt...' : 'Scan starten'}
                      </Button>
                    )}
                  </div>
                </CardHeader>
                <CardContent>
                  {/* Domain selector */}
                  <div className="mb-6">
                    <Select
                      value={selectedDomain?.id || ''}
                      onValueChange={(v) => setSelectedDomain(domains.find(d => d.id === v) || null)}
                    >
                      <SelectTrigger className="w-full max-w-md">
                        <SelectValue placeholder="Domain auswählen" />
                      </SelectTrigger>
                      <SelectContent>
                        {domains.map(d => (
                          <SelectItem key={d.id} value={d.id}>{d.domain}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  {scanning && (
                    <div className="py-12 text-center">
                      <Loader2 className="h-12 w-12 animate-spin mx-auto mb-4 text-primary" />
                      <p className="text-lg font-medium">Führe umfassenden Sicherheitsscan durch...</p>
                      <p className="text-sm text-muted-foreground mt-1">Blacklists, Malware, Ports, Headers werden geprüft</p>
                    </div>
                  )}

                  {scanResult && !scanning && (
                    <div className="space-y-6">
                      {/* Score Overview */}
                      <div className="grid md:grid-cols-3 gap-4">
                        <Card className="border-2">
                          <CardContent className="pt-6 text-center">
                            <p className={`text-5xl font-bold ${getScoreColor(scanResult.score)}`}>{scanResult.score}</p>
                            <p className="text-sm text-muted-foreground mt-1">/ 100 Score</p>
                            <Badge className={`mt-2 ${scanResult.threatLevel === 'low' ? 'bg-green-500' : scanResult.threatLevel === 'medium' ? 'bg-yellow-500' : scanResult.threatLevel === 'high' ? 'bg-orange-500' : 'bg-red-500'}`}>
                              Bedrohungsstufe: {scanResult.threatLevel.toUpperCase()}
                            </Badge>
                          </CardContent>
                        </Card>
                        <Card className="border-2">
                          <CardContent className="pt-6">
                            <h4 className="font-semibold flex items-center gap-2 mb-3">
                              <Ban className="h-4 w-4" /> Blacklist-Status
                            </h4>
                            {scanResult.blacklist.listed ? (
                              <div>
                                <Badge variant="destructive" className="mb-2">GELISTET</Badge>
                                <p className="text-sm text-red-500">{scanResult.blacklist.lists.join(', ')}</p>
                              </div>
                            ) : (
                              <div className="flex items-center gap-2">
                                <CheckCircle className="h-5 w-5 text-green-500" />
                                <span className="text-green-500 font-medium">Nicht gelistet</span>
                              </div>
                            )}
                            <div className="mt-3 space-y-1">
                              {Object.entries(scanResult.blacklist.details).map(([name, listed]) => (
                                <div key={name} className="flex items-center justify-between text-xs">
                                  <span>{name}</span>
                                  {listed ? <XCircle className="h-3 w-3 text-red-500" /> : <CheckCircle className="h-3 w-3 text-green-500" />}
                                </div>
                              ))}
                            </div>
                          </CardContent>
                        </Card>
                        <Card className="border-2">
                          <CardContent className="pt-6">
                            <h4 className="font-semibold flex items-center gap-2 mb-3">
                              <Bug className="h-4 w-4" /> Malware-Check
                            </h4>
                            {scanResult.malware.hasMalware ? (
                              <div>
                                <Badge variant="destructive" className="mb-2">MALWARE ERKANNT</Badge>
                                {scanResult.malware.indicators.map((ind, i) => (
                                  <div key={i} className="text-xs mt-1 p-2 bg-red-500/10 rounded">
                                    <span className="font-medium">{ind.type}</span>
                                    <p className="text-muted-foreground">{ind.detail.substring(0, 80)}</p>
                                  </div>
                                ))}
                              </div>
                            ) : (
                              <div className="flex items-center gap-2">
                                <CheckCircle className="h-5 w-5 text-green-500" />
                                <span className="text-green-500 font-medium">Keine Malware gefunden</span>
                              </div>
                            )}
                          </CardContent>
                        </Card>
                      </div>

                      {/* Security Headers */}
                      <Card>
                        <CardHeader>
                          <CardTitle className="text-base">Security Headers ({scanResult.headersScore})</CardTitle>
                        </CardHeader>
                        <CardContent>
                          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                            {Object.entries(scanResult.headerChecks).map(([header, present]) => (
                              <div key={header} className={`p-3 rounded-lg border ${present ? 'border-green-500/30 bg-green-500/5' : 'border-red-500/30 bg-red-500/5'}`}>
                                <div className="flex items-center gap-2">
                                  {present ? <CheckCircle className="h-4 w-4 text-green-500" /> : <XCircle className="h-4 w-4 text-red-500" />}
                                  <span className="text-xs font-mono">{header}</span>
                                </div>
                              </div>
                            ))}
                          </div>
                        </CardContent>
                      </Card>

                      {/* Port Scan */}
                      <Card>
                        <CardHeader>
                          <CardTitle className="text-base flex items-center gap-2">
                            <Server className="h-4 w-4" /> Port-Scan Ergebnisse
                          </CardTitle>
                        </CardHeader>
                        <CardContent>
                          <Table>
                            <TableHeader>
                              <TableRow>
                                <TableHead>Port</TableHead>
                                <TableHead>Service</TableHead>
                                <TableHead>Status</TableHead>
                                <TableHead>Risiko</TableHead>
                              </TableRow>
                            </TableHeader>
                            <TableBody>
                              {scanResult.ports.map((port) => (
                                <TableRow key={port.port} className={port.open && port.risk !== 'low' ? 'bg-red-500/5' : ''}>
                                  <TableCell className="font-mono">{port.port}</TableCell>
                                  <TableCell>{port.service}</TableCell>
                                  <TableCell>
                                    {port.open ? (
                                      <Badge variant="destructive" className="text-xs">OFFEN</Badge>
                                    ) : (
                                      <Badge variant="secondary" className="text-xs">Geschlossen</Badge>
                                    )}
                                  </TableCell>
                                  <TableCell>
                                    <Badge variant="outline" className={
                                      port.risk === 'critical' ? 'border-red-500 text-red-500' :
                                      port.risk === 'high' ? 'border-orange-500 text-orange-500' :
                                      port.risk === 'medium' ? 'border-yellow-500 text-yellow-500' :
                                      'border-green-500 text-green-500'
                                    }>{port.risk}</Badge>
                                  </TableCell>
                                </TableRow>
                              ))}
                            </TableBody>
                          </Table>
                        </CardContent>
                      </Card>

                      {/* DNS Security */}
                      {scanResult.dns && (
                        <Card>
                          <CardHeader>
                            <CardTitle className="text-base flex items-center gap-2">
                              <Fingerprint className="h-4 w-4" /> DNS-Sicherheit & E-Mail-Authentifizierung
                            </CardTitle>
                          </CardHeader>
                          <CardContent>
                            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                              {[
                                { name: 'SPF Record', ok: scanResult.dns.spf, desc: 'Sender Policy Framework' },
                                { name: 'DMARC', ok: scanResult.dns.dmarc, desc: 'Domain-based Message Auth' },
                                { name: 'DNSSEC', ok: scanResult.dns.dnssec, desc: 'DNS Security Extensions' },
                                { name: 'CAA Record', ok: scanResult.dns.caa, desc: 'Certificate Authority Auth' },
                              ].map(({ name, ok, desc }) => (
                                <div key={name} className={`p-3 rounded-lg border ${ok ? 'border-green-500/30 bg-green-500/5' : 'border-red-500/30 bg-red-500/5'}`}>
                                  <div className="flex items-center gap-2 mb-1">
                                    {ok ? <CheckCircle className="h-4 w-4 text-green-500" /> : <XCircle className="h-4 w-4 text-red-500" />}
                                    <span className="text-sm font-medium">{name}</span>
                                  </div>
                                  <p className="text-xs text-muted-foreground">{desc}</p>
                                </div>
                              ))}
                            </div>
                            {scanResult.dns.records.length > 0 && (
                              <div className="mt-4">
                                <p className="text-xs text-muted-foreground mb-1">A Records: {scanResult.dns.records.join(', ')}</p>
                                {scanResult.dns.ns.length > 0 && <p className="text-xs text-muted-foreground">NS: {scanResult.dns.ns.join(', ')}</p>}
                              </div>
                            )}
                          </CardContent>
                        </Card>
                      )}

                      {/* SSL Details */}
                      {scanResult.ssl && (
                        <Card>
                          <CardHeader>
                            <CardTitle className="text-base flex items-center gap-2">
                              <Lock className="h-4 w-4" /> SSL/TLS Analyse
                            </CardTitle>
                          </CardHeader>
                          <CardContent>
                            <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
                              {[
                                { name: 'SSL Gültig', ok: scanResult.ssl.valid },
                                { name: 'HSTS', ok: scanResult.ssl.hsts },
                                { name: 'IncludeSubDomains', ok: scanResult.ssl.includeSubDomains },
                                { name: 'Preload', ok: scanResult.ssl.preload },
                                { name: 'Protokoll', ok: true, text: scanResult.ssl.protocol },
                              ].map(({ name, ok, text }) => (
                                <div key={name} className={`p-3 rounded-lg border ${ok ? 'border-green-500/30 bg-green-500/5' : 'border-red-500/30 bg-red-500/5'}`}>
                                  <div className="flex items-center gap-2">
                                    {ok ? <CheckCircle className="h-4 w-4 text-green-500" /> : <XCircle className="h-4 w-4 text-red-500" />}
                                    <span className="text-xs font-medium">{text || name}</span>
                                  </div>
                                </div>
                              ))}
                            </div>
                            {scanResult.ssl.hsts && scanResult.ssl.hstsMaxAge > 0 && (
                              <p className="text-xs text-muted-foreground mt-2">HSTS Max-Age: {Math.floor(scanResult.ssl.hstsMaxAge / 86400)} Tage</p>
                            )}
                          </CardContent>
                        </Card>
                      )}

                      {/* Technologies */}
                      {scanResult.technologies && scanResult.technologies.length > 0 && (
                        <Card>
                          <CardHeader>
                            <CardTitle className="text-base flex items-center gap-2">
                              <Globe className="h-4 w-4" /> Erkannte Technologien
                            </CardTitle>
                          </CardHeader>
                          <CardContent>
                            <div className="flex flex-wrap gap-2">
                              {scanResult.technologies.map((tech, i) => (
                                <Badge key={i} variant="outline" className="text-sm">{tech}</Badge>
                              ))}
                            </div>
                          </CardContent>
                        </Card>
                      )}
                    </div>
                  )}

                  {!scanResult && !scanning && (
                    <div className="text-center py-16 text-muted-foreground">
                      <Scan className="h-16 w-16 mx-auto mb-4 opacity-50" />
                      <p className="text-lg">Wählen Sie eine Domain und starten Sie den Deep Scan</p>
                      <p className="text-sm mt-1">Blacklists, Malware, offene Ports, Security Headers</p>
                    </div>
                  )}
                </CardContent>
              </Card>
            </TabsContent>

            {/* ═══ Threats ═══ */}
            <TabsContent value="threats" className="space-y-6">
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <AlertTriangle className="h-5 w-5 text-red-500" /> Erkannte Bedrohungen
                  </CardTitle>
                  <CardDescription>Alle Sicherheitsvorfälle und Warnungen</CardDescription>
                </CardHeader>
                <CardContent>
                  {threats.length === 0 ? (
                    <div className="text-center py-12 text-muted-foreground">
                      <ShieldCheck className="h-12 w-12 mx-auto mb-4 opacity-50" />
                      <p>Keine Bedrohungen erkannt</p>
                    </div>
                  ) : (
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Zeit</TableHead>
                          <TableHead>Typ</TableHead>
                          <TableHead>Status</TableHead>
                          <TableHead>Antwortzeit</TableHead>
                          <TableHead>Details</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {threats.map((threat) => (
                          <TableRow key={threat.id}>
                            <TableCell className="text-xs">{new Date(threat.checked_at).toLocaleString('de-DE')}</TableCell>
                            <TableCell>
                              <Badge variant="outline">{threat.check_type}</Badge>
                            </TableCell>
                            <TableCell>
                              <Badge className={
                                threat.status === 'ok' ? 'bg-green-500' :
                                threat.status === 'warning' ? 'bg-yellow-500' :
                                'bg-red-500'
                              }>{threat.status}</Badge>
                            </TableCell>
                            <TableCell>{threat.response_time_ms ? `${threat.response_time_ms}ms` : '—'}</TableCell>
                            <TableCell className="text-xs max-w-xs truncate">
                              {threat.details ? JSON.stringify(threat.details).substring(0, 80) : '—'}
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  )}
                </CardContent>
              </Card>
            </TabsContent>

            {/* ═══ 24/7 Monitoring ═══ */}
            <TabsContent value="monitoring" className="space-y-6">
              <Card>
                <CardHeader>
                  <div className="flex items-center justify-between">
                    <div>
                      <CardTitle className="flex items-center gap-2">
                        <Radar className="h-5 w-5" /> Kontinuierliche Überwachung
                      </CardTitle>
                      <CardDescription>Uptime, SSL, DNS, Security Headers</CardDescription>
                    </div>
                    {selectedDomain && (
                      <Button onClick={() => runDomainMonitor(selectedDomain)}>
                        <Activity className="h-4 w-4 mr-2" /> Jetzt prüfen
                      </Button>
                    )}
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="mb-4">
                    <Select
                      value={selectedDomain?.id || ''}
                      onValueChange={(v) => setSelectedDomain(domains.find(d => d.id === v) || null)}
                    >
                      <SelectTrigger className="w-full max-w-md">
                        <SelectValue placeholder="Domain auswählen" />
                      </SelectTrigger>
                      <SelectContent>
                        {domains.map(d => (
                          <SelectItem key={d.id} value={d.id}>{d.domain}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  {threats.filter(t => ['uptime', 'ssl_expiry', 'dns_check', 'security_headers'].includes(t.check_type)).length === 0 ? (
                    <div className="text-center py-12 text-muted-foreground">
                      <Activity className="h-12 w-12 mx-auto mb-4 opacity-50" />
                      <p>Noch keine Monitoring-Daten</p>
                      <p className="text-sm">Klicken Sie auf "Jetzt prüfen"</p>
                    </div>
                  ) : (
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Zeit</TableHead>
                          <TableHead>Check</TableHead>
                          <TableHead>Status</TableHead>
                          <TableHead>Antwortzeit</TableHead>
                          <TableHead>SSL Tage</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {threats
                          .filter(t => ['uptime', 'ssl_expiry', 'dns_check', 'security_headers', 'vulnerability'].includes(t.check_type))
                          .map((log) => (
                            <TableRow key={log.id}>
                              <TableCell className="text-xs">{new Date(log.checked_at).toLocaleString('de-DE')}</TableCell>
                              <TableCell><Badge variant="outline">{log.check_type}</Badge></TableCell>
                              <TableCell>
                                <Badge className={log.status === 'ok' ? 'bg-green-500' : log.status === 'warning' ? 'bg-yellow-500' : 'bg-red-500'}>
                                  {log.status}
                                </Badge>
                              </TableCell>
                              <TableCell>{log.response_time_ms ? `${log.response_time_ms}ms` : '—'}</TableCell>
                              <TableCell>{(log as any).ssl_days_remaining ?? '—'}</TableCell>
                            </TableRow>
                          ))}
                      </TableBody>
                    </Table>
                  )}
                </CardContent>
              </Card>
            </TabsContent>

            {/* ═══ Adversary Simulation ═══ */}
            <TabsContent value="simulations" className="space-y-6">
              <SimulationTab domains={domains} profileId={profile?.id || ''} />
            </TabsContent>

            {/* ═══ Auto-Vulnerability Detection ═══ */}
            <TabsContent value="auto-scan" className="space-y-6">
              <AutoVulnDetection domains={domains} profileId={profile?.id || ''} />
            </TabsContent>

            {/* ═══ Vulnerability Templates ═══ */}
            <TabsContent value="vuln-templates" className="space-y-6">
              <VulnTemplateManager />
            </TabsContent>
          </Tabs>
        )}

        {/* Add Domain Dialog */}
        <Dialog open={addDomainOpen} onOpenChange={setAddDomainOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Domain hinzufügen</DialogTitle>
              <DialogDescription>Geben Sie die Domain ein, die Sie schützen möchten.</DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <label className="text-sm font-medium">Domain</label>
                <Input
                  value={newDomain}
                  onChange={(e) => setNewDomain(e.target.value)}
                  placeholder="beispiel.de"
                />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setAddDomainOpen(false)}>Abbrechen</Button>
              <Button onClick={addDomain} disabled={addingDomain || !newDomain.trim()}>
                {addingDomain ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Shield className="h-4 w-4 mr-2" />}
                Schutz aktivieren
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </Layout>
  );
}

// Simulation sub-component
function SimulationTab({ domains, profileId }: { domains: ProtectedDomain[]; profileId: string }) {
  const { toast } = useToast();
  const [simulations, setSimulations] = useState<any[]>([]);
  const [running, setRunning] = useState(false);
  const [selectedDomain, setSelectedDomain] = useState('');
  const [simType, setSimType] = useState('full');

  const loadSimulations = useCallback(async () => {
    if (!profileId) return;
    const { data } = await supabase
      .from('adversary_simulations')
      .select('*')
      .eq('profile_id', profileId)
      .order('started_at', { ascending: false })
      .limit(10);
    setSimulations(data || []);
  }, [profileId]);

  useEffect(() => {
    loadSimulations();
  }, [loadSimulations]);

  const runSimulation = async () => {
    const domain = domains.find(d => d.id === selectedDomain);
    if (!domain) return;
    setRunning(true);
    try {
      const { data, error } = await supabase.functions.invoke('adversary-simulation', {
        body: { domain: domain.domain, profileId, simulationType: simType }
      });
      if (error) throw error;
      toast({ title: 'Simulation abgeschlossen', description: `${data.summary.passed}/${data.summary.total} Tests bestanden` });
      loadSimulations();
    } catch (e: any) {
      toast({ variant: 'destructive', title: 'Fehler', description: e.message });
    }
    setRunning(false);
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              <Target className="h-5 w-5" /> Adversary Simulation
            </CardTitle>
            <CardDescription>Kontrollierte Angriffs-Simulationen (Reconnaissance, XSS, SQL Injection, Brute-Force)</CardDescription>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <div className="grid md:grid-cols-3 gap-4 mb-6">
          <Card className="border-2">
            <CardContent className="pt-6 text-center">
              <Radar className="h-8 w-8 mx-auto mb-2 text-blue-500" />
              <h4 className="font-semibold">Reconnaissance</h4>
              <p className="text-xs text-muted-foreground">Exponierte Pfade & Info Disclosure</p>
            </CardContent>
          </Card>
          <Card className="border-2">
            <CardContent className="pt-6 text-center">
              <Shield className="h-8 w-8 mx-auto mb-2 text-orange-500" />
              <h4 className="font-semibold">Brute-Force Test</h4>
              <p className="text-xs text-muted-foreground">Rate-Limiting & Auth-Schutz</p>
            </CardContent>
          </Card>
          <Card className="border-2">
            <CardContent className="pt-6 text-center">
              <AlertTriangle className="h-8 w-8 mx-auto mb-2 text-red-500" />
              <h4 className="font-semibold">Injection Tests</h4>
              <p className="text-xs text-muted-foreground">XSS & SQL Injection</p>
            </CardContent>
          </Card>
        </div>

        <div className="flex gap-4 mb-6">
          <Select value={selectedDomain} onValueChange={setSelectedDomain}>
            <SelectTrigger className="flex-1">
              <SelectValue placeholder="Domain auswählen" />
            </SelectTrigger>
            <SelectContent>
              {domains.map(d => (
                <SelectItem key={d.id} value={d.id}>{d.domain}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={simType} onValueChange={setSimType}>
            <SelectTrigger className="w-48">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="full">Vollständig</SelectItem>
              <SelectItem value="reconnaissance">Reconnaissance</SelectItem>
              <SelectItem value="injection-test">Injection Tests</SelectItem>
              <SelectItem value="brute-force-detection">Brute-Force</SelectItem>
            </SelectContent>
          </Select>
          <Button onClick={runSimulation} disabled={running || !selectedDomain}>
            {running ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Play className="h-4 w-4 mr-2" />}
            Starten
          </Button>
        </div>

        {simulations.length > 0 && (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Domain</TableHead>
                <TableHead>Typ</TableHead>
                <TableHead>Ergebnis</TableHead>
                <TableHead>Tests</TableHead>
                <TableHead>Datum</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {simulations.map((sim) => (
                <TableRow key={sim.id}>
                  <TableCell className="font-medium">{sim.domain}</TableCell>
                  <TableCell><Badge variant="outline">{sim.simulation_type}</Badge></TableCell>
                  <TableCell>
                    <Badge className={
                      sim.overall_status === 'passed' ? 'bg-green-500' :
                      sim.overall_status === 'warning' ? 'bg-yellow-500' :
                      'bg-red-500'
                    }>{sim.overall_status || 'N/A'}</Badge>
                  </TableCell>
                  <TableCell>{sim.tests_passed}/{sim.tests_total}</TableCell>
                  <TableCell className="text-xs">{sim.started_at ? new Date(sim.started_at).toLocaleString('de-DE') : '—'}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  );
}

// Auto Vulnerability Detection sub-component
function AutoVulnDetection({ domains, profileId }: { domains: ProtectedDomain[]; profileId: string }) {
  const { toast } = useToast();
  const [scheduledScans, setScheduledScans] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedDomain, setSelectedDomain] = useState<ProtectedDomain | null>(null);
  const [schedule, setSchedule] = useState<string>('daily');
  const [creating, setCreating] = useState(false);
  const [scanAllRunning, setScanAllRunning] = useState(false);
  const [scanAllProgress, setScanAllProgress] = useState(0);
  const [scanResults, setScanResults] = useState<any[]>([]);

  const loadScheduledScans = useCallback(async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke('scheduled-scan', {
        body: { action: 'list', profileId }
      });
      if (!error && data?.scans) setScheduledScans(data.scans);
    } catch (e: any) { console.error('Load scheduled scans error:', e); }
    setLoading(false);
  }, [profileId]);

  useEffect(() => { loadScheduledScans(); }, [loadScheduledScans]);

  const createScheduledScan = async () => {
    if (!selectedDomain) return;
    setCreating(true);
    try {
      const { data, error } = await supabase.functions.invoke('scheduled-scan', {
        body: { action: 'create', profileId, domainId: selectedDomain.id, schedule }
      });
      if (error) throw error;
      toast({ title: 'Geplanter Scan erstellt', description: data.message });
      loadScheduledScans();
    } catch (e: any) { toast({ variant: 'destructive', title: 'Fehler', description: e.message }); }
    setCreating(false);
  };

  const deleteScheduledScan = async (scanId: string) => {
    try {
      await supabase.functions.invoke('scheduled-scan', { body: { action: 'delete', scanId } });
      toast({ title: 'Gelöscht' });
      loadScheduledScans();
    } catch (e: any) { toast({ variant: 'destructive', title: 'Fehler', description: e.message }); }
  };

  const scanAllDomains = async () => {
    if (domains.length === 0) return;
    setScanAllRunning(true);
    setScanAllProgress(0);
    setScanResults([]);
    
    for (let i = 0; i < domains.length; i++) {
      const domain = domains[i];
      try {
        const { data, error } = await supabase.functions.invoke('waf-protection', {
          body: { action: 'full_protection_scan', domain: domain.domain, domainId: domain.id }
        });
        if (!error && data) {
          setScanResults(prev => [...prev, { domain: domain.domain, ...data }]);
        }
      } catch (e) {
        setScanResults(prev => [...prev, { domain: domain.domain, error: true }]);
      }
      setScanAllProgress(Math.round(((i + 1) / domains.length) * 100));
    }
    
    setScanAllRunning(false);
    toast({ title: 'Automatischer Scan abgeschlossen', description: `${domains.length} Domains gescannt` });
  };

  return (
    <div className="space-y-6">
      {/* Quick Scan All */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Radar className="h-5 w-5 text-blue-500" />
            Automatische Schwachstellenerkennung
          </CardTitle>
          <CardDescription>
            Scannen Sie alle Domains automatisch auf Sicherheitslücken und planen Sie regelmäßige Scans.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center gap-4">
            <Button 
              onClick={scanAllDomains} 
              disabled={scanAllRunning || domains.length === 0}
              className="bg-blue-600 hover:bg-blue-700"
            >
              {scanAllRunning ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Scan className="h-4 w-4 mr-2" />}
              Alle {domains.length} Domains jetzt scannen
            </Button>
            <span className="text-sm text-muted-foreground">
              Führt einen vollständigen Sicherheitsscan auf allen registrierten Domains durch
            </span>
          </div>
          
          {scanAllRunning && (
            <div className="space-y-2">
              <Progress value={scanAllProgress} className="h-3" />
              <p className="text-sm text-muted-foreground">{scanAllProgress}% abgeschlossen...</p>
            </div>
          )}
          
          {scanResults.length > 0 && (
            <div className="space-y-3 mt-4">
              <h4 className="font-semibold flex items-center gap-2"><Bug className="h-4 w-4" /> Scan-Ergebnisse</h4>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Domain</TableHead>
                    <TableHead>Score</TableHead>
                    <TableHead>Bedrohungsstufe</TableHead>
                    <TableHead>SSL</TableHead>
                    <TableHead>Ports</TableHead>
                    <TableHead>Blacklist</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {scanResults.map((r, i) => (
                    <TableRow key={i}>
                      <TableCell className="font-medium">{r.domain}</TableCell>
                      <TableCell>
                        {r.error ? <Badge variant="destructive">Fehler</Badge> : (
                          <Badge className={
                            r.score >= 80 ? 'bg-green-500' : r.score >= 50 ? 'bg-yellow-500' : 'bg-red-500'
                          }>{r.score}/100</Badge>
                        )}
                      </TableCell>
                      <TableCell>
                        <Badge variant={r.threatLevel === 'low' ? 'default' : 'destructive'}>
                          {r.threatLevel || 'N/A'}
                        </Badge>
                      </TableCell>
                      <TableCell>{r.sslValid ? <CheckCircle className="h-4 w-4 text-green-500" /> : <XCircle className="h-4 w-4 text-red-500" />}</TableCell>
                      <TableCell>{r.openDangerousPorts?.length > 0 ? 
                        <Badge variant="destructive">{r.openDangerousPorts.length} gefährlich</Badge> : 
                        <Badge className="bg-green-500">Sicher</Badge>
                      }</TableCell>
                      <TableCell>{r.blacklist?.listed ? 
                        <Badge variant="destructive">Gelistet!</Badge> : 
                        <Badge className="bg-green-500">Sauber</Badge>
                      }</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Schedule Scans */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Calendar className="h-5 w-5 text-purple-500" />
            Geplante Scans
          </CardTitle>
          <CardDescription>
            Automatische Sicherheitsscans in regelmäßigen Intervallen.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center gap-3 flex-wrap">
            <Select value={selectedDomain?.id || ''} onValueChange={(v) => setSelectedDomain(domains.find(d => d.id === v) || null)}>
              <SelectTrigger className="w-[250px]">
                <SelectValue placeholder="Domain wählen..." />
              </SelectTrigger>
              <SelectContent>
                {domains.map(d => (
                  <SelectItem key={d.id} value={d.id}>{d.domain}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            
            <Select value={schedule} onValueChange={setSchedule}>
              <SelectTrigger className="w-[150px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="daily">Täglich</SelectItem>
                <SelectItem value="weekly">Wöchentlich</SelectItem>
                <SelectItem value="monthly">Monatlich</SelectItem>
              </SelectContent>
            </Select>
            
            <Button onClick={createScheduledScan} disabled={creating || !selectedDomain}>
              {creating ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Clock className="h-4 w-4 mr-2" />}
              Planen
            </Button>
          </div>

          {loading ? (
            <div className="flex items-center gap-2 py-4">
              <Loader2 className="h-4 w-4 animate-spin" />
              <span>Lade geplante Scans...</span>
            </div>
          ) : scheduledScans.length > 0 ? (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Domain</TableHead>
                  <TableHead>Intervall</TableHead>
                  <TableHead>Nächster Scan</TableHead>
                  <TableHead>Letzter Scan</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Aktion</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {scheduledScans.map((scan) => (
                  <TableRow key={scan.id}>
                    <TableCell className="font-medium">{scan.domain}</TableCell>
                    <TableCell><Badge variant="outline">{scan.schedule_type}</Badge></TableCell>
                    <TableCell className="text-xs">{scan.next_run_at ? new Date(scan.next_run_at).toLocaleString('de-DE') : '—'}</TableCell>
                    <TableCell className="text-xs">{scan.last_run_at ? new Date(scan.last_run_at).toLocaleString('de-DE') : 'Nie'}</TableCell>
                    <TableCell>
                      <Badge className={scan.is_active ? 'bg-green-500' : 'bg-gray-500'}>
                        {scan.is_active ? 'Aktiv' : 'Inaktiv'}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <Button variant="ghost" size="sm" onClick={() => deleteScheduledScan(scan.id)}>
                        <Ban className="h-4 w-4 text-red-500" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          ) : (
            <p className="text-sm text-muted-foreground py-2">Keine geplanten Scans konfiguriert.</p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
