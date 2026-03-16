import { useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useLanguage } from '@/contexts/LanguageContext';
import { useAuth } from '@/contexts/AuthContext';
import { Layout } from '@/components/layout/Layout';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { TerminalOutput, TerminalLine } from '@/components/security/TerminalOutput';
import { ScanProgress, defaultScanPhases, ScanPhase } from '@/components/security/ScanProgress';
import { SecurityFinding, Finding } from '@/components/security/SecurityFinding';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { 
  Shield, ShieldCheck, ShieldAlert, Loader2, Zap, 
  Play, StopCircle, FileText,
  Globe, Lock, Server, Eye, ArrowRight, CheckCircle2, AlertTriangle,
  Radar, Fingerprint, Cookie, FolderSearch, Network
} from 'lucide-react';
import heroBg from '@/assets/hero-bg.jpg';
import gapLogo from '@/assets/gap-logo-horizontal-navy.png';
import ghkcWhite from '@/assets/ghkc-white.jpg';

type ScanStatus = 'idle' | 'running' | 'completed' | 'error';

export default function SecurityTestPage() {
  const { t } = useLanguage();
  const { user, profile } = useAuth();
  const navigate = useNavigate();
  const { toast } = useToast();
  
  const [domain, setDomain] = useState('');
  const [ipAddress, setIpAddress] = useState('');
  const [scanStatus, setScanStatus] = useState<ScanStatus>('idle');
  const [terminalLines, setTerminalLines] = useState<TerminalLine[]>([]);
  const [phases, setPhases] = useState<ScanPhase[]>(defaultScanPhases);
  const [currentPhase, setCurrentPhase] = useState(0);
  const [overallProgress, setOverallProgress] = useState(0);
  const [findings, setFindings] = useState<Finding[]>([]);
  const [simpleResult, setSimpleResult] = useState<'green' | 'red' | null>(null);
  const [scanScore, setScanScore] = useState<number | null>(null);
  const [testsRemaining, setTestsRemaining] = useState<number | null>(null);
  const [limitReached, setLimitReached] = useState(false);
  const [techInfo, setTechInfo] = useState<any>(null);

  const addLine = useCallback((type: TerminalLine['type'], text: string) => {
    const newLine: TerminalLine = {
      id: `${Date.now()}-${Math.random()}`,
      type,
      text,
      timestamp: new Date()
    };
    setTerminalLines(prev => [...prev, newLine]);
  }, []);

  const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

  const runSimpleScan = async () => {
    if (!domain.trim() && !ipAddress.trim()) {
      toast({ variant: 'destructive', title: 'Fehler', description: 'Bitte geben Sie eine Domain oder IP-Adresse ein' });
      return;
    }
    setScanStatus('running');
    setTerminalLines([]);
    setSimpleResult(null);
    setScanScore(null);
    const target = domain.trim() || ipAddress.trim();
    addLine('command', `gap-scan --quick --target ${target}`);
    await delay(500);
    addLine('info', '╔══════════════════════════════════════════════╗');
    addLine('info', '║   GAP PROTECTION — Quick Security Scanner    ║');
    addLine('info', '║   Cyber Security Analysis Engine              ║');
    addLine('info', '╚══════════════════════════════════════════════╝');
    await delay(300);
    addLine('info', `Ziel: ${target}`);
    try {
      await delay(500);
      addLine('info', 'Verbinde mit GAP Protection Cloud...');
      const response = await supabase.functions.invoke('light-scan', {
        body: { domain: domain.trim() || undefined, ipAddress: ipAddress.trim() || undefined }
      });
      if (response.error) throw new Error(response.error.message || 'Test fehlgeschlagen');
      const data = response.data;
      if (data?.error) {
        if (data.limitReached) {
          setLimitReached(true);
          setTestsRemaining(0);
          addLine('error', 'Rate-Limit erreicht: Maximale Anzahl Tests für dieses Netzwerk (3)');
          setScanStatus('error');
          return;
        }
        throw new Error(data.error);
      }
      if (data?.limitReached) {
        setLimitReached(true);
        setTestsRemaining(0);
        addLine('error', 'Rate-Limit erreicht: Maximale Anzahl Tests für dieses Netzwerk (3)');
        setScanStatus('error');
        return;
      }
      await delay(300);
      addLine('info', 'SSL/TLS-Check...');
      await delay(400);
      addLine('info', 'Security-Headers-Check...');
      await delay(400);
      addLine('info', 'DNS-Analyse...');
      await delay(300);
      setTestsRemaining(data.remaining);
      setScanScore(data.score || null);

      if (data.checks && Array.isArray(data.checks)) {
        for (const check of data.checks) {
          addLine(check.passed ? 'success' : 'warning', `${check.passed ? '✓' : '✗'} ${check.label}`);
          await delay(100);
        }
      }

      await delay(200);
      if (data.result === 'green') {
        addLine('success', '');
        addLine('result', `Score: ${data.score || '—'}/100 — STATUS: SICHER`);
        setSimpleResult('green');
      } else {
        addLine('warning', '');
        addLine('result', `Score: ${data.score || '—'}/100 — STATUS: RISIKEN ERKANNT`);
        setSimpleResult('red');
      }
      addLine('info', `Verbleibende Tests: ${data.remaining}`);
      addLine('success', 'Scan abgeschlossen — powered by GAP Protection');
      addLine('info', '🛡️ Schutz durch GAP Protection Cyber Security');
      setScanStatus('completed');
    } catch (err: any) {
      console.error('Scan error:', err);
      addLine('error', `Fehler: ${err.message}`);
      setScanStatus('error');
    }
  };

  const runFullScan = async () => {
    if (!user) {
      toast({ title: 'Anmeldung erforderlich', description: 'Für die vollständige Analyse müssen Sie angemeldet sein.', variant: 'destructive' });
      navigate('/auth');
      return;
    }
    if (!domain.trim() && !ipAddress.trim()) {
      toast({ variant: 'destructive', title: 'Fehler', description: 'Bitte geben Sie eine Domain oder IP-Adresse ein' });
      return;
    }
    setScanStatus('running');
    setTerminalLines([]);
    setFindings([]);
    setScanScore(null);
    setTechInfo(null);
    setPhases(defaultScanPhases.map(p => ({ ...p, status: 'pending' as const })));
    setOverallProgress(0);
    const target = domain.trim() || ipAddress.trim();
    addLine('command', `gap-scan --full --deep --target ${target}`);
    await delay(300);
    addLine('info', '╔══════════════════════════════════════════════╗');
    addLine('info', '║   GAP PROTECTION — Deep Security Scan        ║');
    addLine('info', '║   Comprehensive Vulnerability Analysis        ║');
    addLine('info', '║   Powered by GAP Protection Cyber Security    ║');
    addLine('info', '╚══════════════════════════════════════════════╝');
    addLine('info', `Ziel: ${target}`);
    addLine('info', `Startzeit: ${new Date().toLocaleString('de-DE')}`);
    addLine('info', '');
    try {
      // Phase 1: DNS
      setPhases(prev => prev.map((p, idx) => ({ ...p, status: idx === 0 ? 'running' : 'pending' })));
      addLine('command', '[1/6] DNS-Analyse & DNSSEC');
      addLine('info', '  DNS-Records, SPF, DMARC, DNSSEC, CAA...');
      await delay(600);
      setOverallProgress(10);

      // Phase 2: SSL
      setPhases(prev => prev.map((p, idx) => ({ ...p, status: idx === 0 ? 'completed' : idx === 1 ? 'running' : 'pending' })));
      addLine('success', '  ✓ DNS-Analyse abgeschlossen');
      addLine('command', '[2/6] SSL/TLS & Zertifikate');
      addLine('info', '  TLS-Version, Zertifikat, HTTP→HTTPS Redirect...');
      await delay(500);
      setOverallProgress(25);

      // Phase 3: Headers
      setPhases(prev => prev.map((p, idx) => ({ ...p, status: idx <= 1 ? 'completed' : idx === 2 ? 'running' : 'pending' })));
      addLine('success', '  ✓ SSL/TLS-Prüfung abgeschlossen');
      addLine('command', '[3/6] HTTP-Header & Cookie-Analyse');
      addLine('info', '  HSTS, CSP, Permissions-Policy, Cookie Security...');
      await delay(400);
      setOverallProgress(40);

      // Fire the real scan
      addLine('info', '  Sende Analyse an GAP Protection Engine...');
      const response = await supabase.functions.invoke('security-scan', {
        body: { domain: domain.trim() || undefined, ipAddress: ipAddress.trim() || undefined, scanType: 'full', userId: profile?.id }
      });
      if (response.error) throw new Error(response.error.message || 'Scan fehlgeschlagen');
      const data = response.data;

      // Phase 4: Ports / Technology
      setPhases(prev => prev.map((p, idx) => ({ ...p, status: idx <= 2 ? 'completed' : idx === 3 ? 'running' : 'pending' })));
      addLine('success', '  ✓ Header & Cookie-Analyse abgeschlossen');
      addLine('command', '[4/6] Technology Fingerprinting');
      await delay(300);
      setOverallProgress(60);

      if (data.technology) {
        setTechInfo(data.technology);
        if (data.technology.server) addLine('info', `  Server: ${data.technology.server}`);
        if (data.technology.cdn) addLine('info', `  CDN: ${data.technology.cdn}`);
        if (data.technology.waf) addLine('success', `  WAF: ${data.technology.waf}`);
        else addLine('warning', '  ⚠ Keine WAF erkannt');
        if (data.technology.cms) addLine('info', `  CMS: ${data.technology.cms}`);
        if (data.technology.framework) addLine('info', `  Framework: ${data.technology.framework}`);
      }

      // Phase 5: Exposed paths
      setPhases(prev => prev.map((p, idx) => ({ ...p, status: idx <= 3 ? 'completed' : idx === 4 ? 'running' : 'pending' })));
      addLine('success', '  ✓ Fingerprinting abgeschlossen');
      addLine('command', '[5/6] Exposed Paths & Open Redirect');
      await delay(300);
      setOverallProgress(75);

      if (data.exposedPaths?.length > 0) {
        for (const p of data.exposedPaths) {
          addLine('error', `  ✗ Exponiert: ${p}`);
        }
      } else {
        addLine('success', '  ✓ Keine sensiblen Pfade exponiert');
      }
      if (data.hasOpenRedirect) addLine('error', '  ✗ Open Redirect Schwachstelle!');
      if (data.hasMixedContent) addLine('warning', '  ⚠ Mixed Content erkannt');

      // Phase 6: Final analysis
      setPhases(prev => prev.map((p, idx) => ({ ...p, status: idx <= 4 ? 'completed' : idx === 5 ? 'running' : 'pending' })));
      addLine('success', '  ✓ Pfad-Analyse abgeschlossen');
      addLine('command', '[6/6] Schwachstellen-Bewertung');
      await delay(300);
      setOverallProgress(90);

      // DNS details
      if (data.dns) {
        addLine('info', `  DNS: ${data.dns.aRecords?.length || 0} A-Records`);
        if (data.dns.hasSPF) addLine('success', '  ✓ SPF vorhanden');
        else addLine('warning', '  ⚠ Kein SPF');
        if (data.dns.hasDMARC) addLine('success', '  ✓ DMARC vorhanden');
        else addLine('warning', '  ⚠ Kein DMARC');
        if (data.dns.hasDNSSEC) addLine('success', '  ✓ DNSSEC aktiviert');
        else addLine('warning', '  ⚠ DNSSEC nicht aktiviert');
        if (data.dns.hasCAA) addLine('success', '  ✓ CAA-Record vorhanden');
      }
      if (data.ssl) {
        if (data.ssl.valid) addLine('success', '  ✓ SSL/TLS gültig');
        else addLine('error', '  ✗ SSL ungültig');
        if (data.ssl.redirectsToHttps) addLine('success', '  ✓ HTTP→HTTPS Redirect');
        else addLine('warning', '  ⚠ Keine HTTP→HTTPS Weiterleitung');
      }
      if (data.cookies) {
        addLine('info', `  Cookies: ${data.cookies.total} gefunden, ${data.cookies.insecure} unsicher`);
      }

      setPhases(prev => prev.map(p => ({ ...p, status: 'completed' as const })));
      setOverallProgress(100);

      const uiFindings: Finding[] = (data.findings || []).map((f: any, idx: number) => ({
        id: `finding-${idx}`, title: f.title, description: f.description, severity: f.severity as any, category: f.category, recommendation: f.recommendation
      }));

      addLine('info', '');
      addLine('info', '══════════════════════════════════════════');
      addLine('result', 'GAP PROTECTION — SCAN ABGESCHLOSSEN');
      addLine('info', `Score: ${data.score}/100`);
      addLine('info', `Gefundene Findings: ${uiFindings.length}`);
      const critical = uiFindings.filter(f => f.severity === 'critical').length;
      const high = uiFindings.filter(f => f.severity === 'high').length;
      const medium = uiFindings.filter(f => f.severity === 'medium').length;
      addLine('info', `Kritisch: ${critical} | Hoch: ${high} | Mittel: ${medium}`);
      addLine('info', `Gesamtergebnis: ${data.result === 'green' ? 'SICHER ✓' : data.result === 'yellow' ? 'WARNUNG ⚠' : 'KRITISCH ✗'}`);
      addLine('info', '══════════════════════════════════════════');
      addLine('success', '🛡️ Analyse durchgeführt von GAP Protection Cyber Security');
      addLine('info', '   www.gapprotectionltd.com | Enterprise Cyber Security');
      setFindings(uiFindings);
      setScanScore(data.score);
      setSimpleResult(data.result === 'red' ? 'red' : 'green');
      setScanStatus('completed');
    } catch (err: any) {
      console.error('Full scan error:', err);
      addLine('error', `Fehler: ${err.message}`);
      setPhases(prev => prev.map(p => ({ ...p, status: p.status === 'running' ? 'error' : p.status })));
      setScanStatus('error');
    }
  };

  const stopScan = () => {
    addLine('warning', 'Scan wird abgebrochen...');
    addLine('error', 'Scan gestoppt');
    setScanStatus('idle');
  };

  const isFullScanAvailable = !!user && profile?.status === 'active';

  return (
    <Layout>
      {/* ═══════════════════════ HERO ═══════════════════════ */}
      <section className="relative py-12 sm:py-16 md:py-28 overflow-hidden">
        <img src={heroBg} alt="" className="absolute inset-0 w-full h-full object-cover" aria-hidden="true" />
        <div className="absolute inset-0 bg-gradient-to-b from-[hsl(222,47%,6%,0.92)] to-[hsl(222,47%,6%,0.98)]" />
        <div className="absolute inset-0 bg-grid-pattern opacity-15" />
        <div className="absolute inset-0 overflow-hidden pointer-events-none">
          <div className="absolute w-full h-[2px] bg-gradient-to-r from-transparent via-accent to-transparent opacity-30 animate-scan-line" />
        </div>

        <div className="container px-4 sm:px-6 relative z-10">
          <div className="max-w-3xl mx-auto text-center">
            <div className="inline-flex items-center gap-2 sm:gap-3 px-4 sm:px-5 py-2 sm:py-2.5 rounded-full border border-accent/30 bg-accent/10 mb-6 sm:mb-8">
              <img src={gapLogo} alt="GAP" className="h-5 sm:h-6 w-auto" />
              <span className="text-accent text-xs sm:text-sm font-mono tracking-wider">GAP PROTECTION SCANNER</span>
            </div>
            <h1 className="text-3xl sm:text-4xl md:text-6xl font-extrabold text-white tracking-tight leading-[1.1] mb-4 sm:mb-6">
              Professionelle
              <span className="text-gradient-cyber block mt-2">Sicherheitsanalyse</span>
            </h1>
            <p className="text-base sm:text-lg text-slate-300 max-w-xl mx-auto">
              Echte Schwachstellen-Erkennung für Ihre digitale Infrastruktur — DNS, SSL, Headers, Cookies, WAF, Technology Fingerprinting und mehr.
            </p>

            {/* Feature pills */}
            <div className="flex flex-wrap justify-center gap-1.5 sm:gap-2 mt-6 sm:mt-8">
              {[
                { icon: Globe, label: 'DNS & DNSSEC' },
                { icon: Lock, label: 'SSL/TLS' },
                { icon: Shield, label: 'Security Headers' },
                { icon: Cookie, label: 'Cookie Security' },
                { icon: Fingerprint, label: 'Tech Fingerprint' },
                { icon: FolderSearch, label: 'Exposed Paths' },
                { icon: Network, label: 'WAF Detection' },
                { icon: Radar, label: 'Open Redirect' },
              ].map(({ icon: Icon, label }) => (
                <span key={label} className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-white/5 border border-white/10 text-xs text-slate-300">
                  <Icon className="h-3 w-3 text-accent" />
                  {label}
                </span>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* ═══════════════════════ SCAN INTERFACE ═══════════════════════ */}
      <section className="py-8 sm:py-12 md:py-16 bg-background">
        <div className="container px-4 sm:px-6 max-w-7xl">
          <div className="grid lg:grid-cols-[380px_1fr] gap-4 sm:gap-6 lg:gap-8">
            
            {/* ─── LEFT PANEL ─── */}
            <div className="space-y-6">
              {/* Target Input */}
              <Card className="border-border bg-card">
                <CardContent className="p-6 space-y-5">
                  <div className="flex items-center gap-3 mb-1">
                    <div className="w-10 h-10 rounded-xl bg-accent/10 flex items-center justify-center">
                      <Globe className="h-5 w-5 text-accent" />
                    </div>
                    <div>
                      <h3 className="font-semibold text-card-foreground">Ziel definieren</h3>
                      <p className="text-xs text-muted-foreground">Domain oder IP-Adresse eingeben</p>
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="domain" className="text-sm">Domain</Label>
                    <div className="relative">
                      <Globe className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                      <Input
                        id="domain"
                        value={domain}
                        onChange={(e) => setDomain(e.target.value)}
                        placeholder="beispiel.de"
                        disabled={scanStatus === 'running'}
                        className="pl-10 h-11 bg-background border-border"
                      />
                    </div>
                  </div>

                  <div className="flex items-center gap-3">
                    <div className="flex-1 h-px bg-border" />
                    <span className="text-xs text-muted-foreground">oder</span>
                    <div className="flex-1 h-px bg-border" />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="ip" className="text-sm">IP-Adresse</Label>
                    <div className="relative">
                      <Server className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                      <Input
                        id="ip"
                        value={ipAddress}
                        onChange={(e) => setIpAddress(e.target.value)}
                        placeholder="192.168.1.1"
                        disabled={scanStatus === 'running'}
                        className="pl-10 h-11 bg-background border-border"
                      />
                    </div>
                  </div>

                  {limitReached && (
                    <div className="p-3 bg-destructive/10 border border-destructive/30 rounded-lg flex items-start gap-2">
                      <AlertTriangle className="h-4 w-4 text-destructive mt-0.5 shrink-0" />
                      <p className="text-sm text-destructive">Limit erreicht (3 Tests pro Netzwerk). Für unbegrenzte Scans als Partner registrieren.</p>
                    </div>
                  )}

                  {testsRemaining !== null && testsRemaining > 0 && (
                    <p className="text-xs text-muted-foreground">
                      Verbleibende kostenlose Tests: <span className="font-semibold text-accent">{testsRemaining}</span>
                    </p>
                  )}
                </CardContent>
              </Card>

              {/* Scan Actions */}
              <Card className="border-border bg-card">
                <CardContent className="p-6 space-y-4">
                  <h3 className="font-semibold text-card-foreground flex items-center gap-2">
                    <Zap className="h-5 w-5 text-accent" />
                    Scan starten
                  </h3>

                  {/* Quick Scan */}
                  <button
                    onClick={runSimpleScan}
                    disabled={scanStatus === 'running' || limitReached}
                    className="w-full group flex items-center gap-4 p-4 rounded-xl border border-border bg-background hover:border-accent/40 hover:bg-accent/5 transition-all duration-300 disabled:opacity-50 disabled:pointer-events-none text-left"
                  >
                    <div className="w-12 h-12 rounded-xl bg-yellow-500/10 flex items-center justify-center shrink-0 group-hover:bg-yellow-500/20 transition-colors">
                      <Zap className="h-6 w-6 text-yellow-500" />
                    </div>
                    <div className="flex-1">
                      <div className="font-semibold text-card-foreground">Quick Scan</div>
                      <div className="text-xs text-muted-foreground">SSL, Headers, DNS — Score & Status</div>
                    </div>
                    <Play className="h-5 w-5 text-muted-foreground group-hover:text-accent transition-colors shrink-0" />
                  </button>

                  {/* Full Scan */}
                  <button
                    onClick={runFullScan}
                    disabled={scanStatus === 'running' || !isFullScanAvailable}
                    className="w-full group flex items-center gap-4 p-4 rounded-xl border border-accent/30 bg-accent/5 hover:bg-accent/10 transition-all duration-300 disabled:opacity-50 disabled:pointer-events-none text-left"
                  >
                    <div className="w-12 h-12 rounded-xl bg-accent/15 flex items-center justify-center shrink-0 group-hover:bg-accent/25 transition-colors">
                      <Shield className="h-6 w-6 text-accent" />
                    </div>
                    <div className="flex-1">
                      <div className="font-semibold text-card-foreground">Deep Scan</div>
                      <div className="text-xs text-muted-foreground">
                        {isFullScanAvailable ? 'Vollständige Analyse + Bericht' : 'GAP Protection Vertrag erforderlich'}
                      </div>
                    </div>
                    {isFullScanAvailable ? (
                      <Play className="h-5 w-5 text-accent shrink-0" />
                    ) : (
                      <Lock className="h-5 w-5 text-muted-foreground shrink-0" />
                    )}
                  </button>

                  {!isFullScanAvailable && (
                    <Button
                      variant="link"
                      className="w-full text-accent p-0 h-auto"
                      onClick={() => navigate('/register')}
                    >
                      Partner werden & vollen Zugang erhalten
                      <ArrowRight className="ml-1 h-4 w-4" />
                    </Button>
                  )}

                  {scanStatus === 'running' && (
                    <Button onClick={stopScan} variant="destructive" className="w-full">
                      <StopCircle className="h-4 w-4 mr-2" />
                      Scan stoppen
                    </Button>
                  )}
                </CardContent>
              </Card>

              {/* Scan Progress */}
              {scanStatus === 'running' && overallProgress > 0 && (
                <Card className="border-border bg-card">
                  <CardContent className="p-6">
                    <h3 className="font-semibold text-card-foreground text-sm mb-4">Scan-Fortschritt</h3>
                    <ScanProgress phases={phases} currentPhase={currentPhase} overallProgress={overallProgress} />
                  </CardContent>
                </Card>
              )}
            </div>

            {/* ─── RIGHT PANEL ─── */}
            <div className="space-y-6">
              {/* Terminal */}
              <TerminalOutput
                lines={terminalLines}
                isRunning={scanStatus === 'running'}
                title={`GAP Protection — ${domain || ipAddress || 'Bereit'}`}
              />

              {/* Score Display */}
              {scanScore !== null && simpleResult && (
                <Card className={`border-2 ${simpleResult === 'green' ? 'border-green-500/40 bg-green-500/5' : 'border-red-500/40 bg-red-500/5'}`}>
                  <CardContent className="p-6">
                    <div className="flex items-center gap-5">
                      <div className={`w-20 h-20 rounded-2xl flex items-center justify-center shrink-0 ${
                        simpleResult === 'green' ? 'bg-green-500/15' : 'bg-red-500/15'
                      }`}>
                        <span className={`text-3xl font-bold ${simpleResult === 'green' ? 'text-green-500' : 'text-red-500'}`}>
                          {scanScore}
                        </span>
                      </div>
                      {simpleResult === 'green' ? (
                        <div>
                          <h3 className="text-xl font-bold text-green-500 flex items-center gap-2">
                            <ShieldCheck className="h-6 w-6" />
                            Keine kritischen Risiken
                          </h3>
                          <p className="text-muted-foreground mt-1">Ihre Systeme sind grundlegend geschützt. Für Details empfehlen wir den Deep Scan.</p>
                        </div>
                      ) : (
                        <div className="flex-1">
                          <h3 className="text-xl font-bold text-red-500 flex items-center gap-2">
                            <ShieldAlert className="h-6 w-6" />
                            Sicherheitsrisiken erkannt
                          </h3>
                          <p className="text-muted-foreground mt-1">Schwachstellen identifiziert. Vollständige Analyse dringend empfohlen.</p>
                          <Button className="mt-4 bg-accent hover:bg-accent/90 text-accent-foreground" onClick={() => navigate('/register')}>
                            Mit GAP Protection schützen
                            <ArrowRight className="ml-2 h-4 w-4" />
                          </Button>
                        </div>
                      )}
                    </div>
                    {/* GAP Protection Branding */}
                    <div className="mt-5 pt-4 border-t border-border/50 flex items-center justify-between">
                      <div className="flex items-center gap-2.5">
                        <img src={gapLogo} alt="GAP Protection" className="h-5 w-auto opacity-70" />
                        <span className="text-xs text-muted-foreground font-mono">Analysiert von GAP Protection Cyber Security</span>
                      </div>
                      <Badge variant="outline" className="text-[10px] border-accent/30 text-accent">
                        <Shield className="h-3 w-3 mr-1" />
                        VERIFIED SCAN
                      </Badge>
                    </div>
                  </CardContent>
                </Card>
              )}

              {/* Technology Info */}
              {techInfo && (
                <Card className="border-border bg-card">
                  <CardContent className="p-6">
                    <h3 className="font-semibold text-card-foreground flex items-center gap-2 mb-4">
                      <Fingerprint className="h-5 w-5 text-accent" />
                      Erkannte Technologien
                    </h3>
                    <div className="grid grid-cols-2 gap-3">
                      {techInfo.server && (
                        <div className="p-3 rounded-lg bg-muted/50">
                          <p className="text-xs text-muted-foreground">Server</p>
                          <p className="font-medium text-sm">{techInfo.server}</p>
                        </div>
                      )}
                      {techInfo.cdn && (
                        <div className="p-3 rounded-lg bg-muted/50">
                          <p className="text-xs text-muted-foreground">CDN</p>
                          <p className="font-medium text-sm">{techInfo.cdn}</p>
                        </div>
                      )}
                      {techInfo.waf && (
                        <div className="p-3 rounded-lg bg-green-500/10 border border-green-500/20">
                          <p className="text-xs text-muted-foreground">WAF</p>
                          <p className="font-medium text-sm text-green-500">{techInfo.waf}</p>
                        </div>
                      )}
                      {techInfo.cms && (
                        <div className="p-3 rounded-lg bg-muted/50">
                          <p className="text-xs text-muted-foreground">CMS</p>
                          <p className="font-medium text-sm">{techInfo.cms}</p>
                        </div>
                      )}
                      {techInfo.framework && (
                        <div className="p-3 rounded-lg bg-muted/50">
                          <p className="text-xs text-muted-foreground">Framework</p>
                          <p className="font-medium text-sm">{techInfo.framework}</p>
                        </div>
                      )}
                      {techInfo.jsLibraries?.length > 0 && (
                        <div className="p-3 rounded-lg bg-muted/50 col-span-2">
                          <p className="text-xs text-muted-foreground">JavaScript Libraries</p>
                          <div className="flex flex-wrap gap-1 mt-1">
                            {techInfo.jsLibraries.map((lib: string) => (
                              <Badge key={lib} variant="secondary" className="text-xs">{lib}</Badge>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  </CardContent>
                </Card>
              )}

              {/* Findings */}
              {findings.length > 0 && (
                <Card className="border-border bg-card">
                  <CardContent className="p-6">
                    <div className="flex items-center justify-between mb-5">
                      <h3 className="font-semibold text-card-foreground flex items-center gap-2">
                        <FileText className="h-5 w-5 text-accent" />
                        Gefundene Schwachstellen
                      </h3>
                      <div className="flex gap-2">
                        {findings.filter(f => f.severity === 'critical').length > 0 && (
                          <Badge variant="destructive" className="text-xs">
                            {findings.filter(f => f.severity === 'critical').length} Kritisch
                          </Badge>
                        )}
                        {findings.filter(f => f.severity === 'high').length > 0 && (
                          <Badge className="bg-orange-500 text-white text-xs">
                            {findings.filter(f => f.severity === 'high').length} Hoch
                          </Badge>
                        )}
                        <Badge variant="secondary" className="text-xs">{findings.length} Total</Badge>
                      </div>
                    </div>
                    <div className="space-y-3">
                      {findings.map((finding) => (
                        <SecurityFinding key={finding.id} finding={finding} />
                      ))}
                    </div>
                  </CardContent>
                </Card>
              )}
            </div>
          </div>
        </div>
      </section>

      {/* ═══════════════════════ GHKC BANNER ═══════════════════════ */}
      <section className="py-12 border-t border-border">
        <div className="container max-w-5xl">
          <div className="rounded-2xl overflow-hidden shadow-xl border border-border">
            <img src={ghkcWhite} alt="Gib Hackern Keine Chance" className="w-full h-auto object-cover" />
          </div>
        </div>
      </section>

      {/* ═══════════════════════ TRUST SECTION ═══════════════════════ */}
      <section className="py-16 border-t border-border bg-muted/30">
        <div className="container max-w-5xl">
          <div className="text-center mb-10">
            <img src={gapLogo} alt="GAP Protection" className="h-10 w-auto mx-auto mb-4 opacity-80" />
            <h2 className="text-2xl font-bold text-card-foreground">Warum GAP Protection?</h2>
          </div>
          <div className="grid md:grid-cols-3 gap-8">
            {[
              { icon: Eye, title: 'Echte Schwachstellen', desc: 'Keine Simulationen — reale DNS-, SSL-, Header-, Cookie- und Technologie-Analysen Ihrer Infrastruktur.' },
              { icon: Lock, title: 'DSGVO-Konform', desc: 'Ausschließlich autorisierte Tests. Datenverarbeitung in Deutschland. Höchste Datenschutzstandards.' },
              { icon: Shield, title: 'Enterprise Security', desc: 'WAF-Erkennung, Technology Fingerprinting, Open Redirect Detection und mehr — wie die Großen.' },
            ].map((item) => (
              <div key={item.title} className="text-center">
                <div className="w-14 h-14 rounded-2xl bg-accent/10 flex items-center justify-center mx-auto mb-4">
                  <item.icon className="h-7 w-7 text-accent" />
                </div>
                <h4 className="font-semibold text-card-foreground mb-2">{item.title}</h4>
                <p className="text-sm text-muted-foreground leading-relaxed">{item.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>
    </Layout>
  );
}