import { useState } from 'react';
import { useLanguage } from '@/contexts/LanguageContext';
import { Layout } from '@/components/layout/Layout';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useNavigate } from 'react-router-dom';
import { Shield, Lock, Eye, Zap, Server, Globe, ChevronRight, CheckCircle2, ArrowRight, Users, BarChart3, ShieldCheck, Search, Loader2, AlertTriangle, XCircle, ChevronDown } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import logoStackedWhite from '@/assets/logo-stacked-white.png';
import heroBg from '@/assets/hero-bg.jpg';
import werbekarteDark from '@/assets/werbekarte-dark.jpg';

const Index = () => {
  const { t } = useLanguage();
  const navigate = useNavigate();
  const [scanDomain, setScanDomain] = useState('');
  const [scanLoading, setScanLoading] = useState(false);
  const [scanResult, setScanResult] = useState<null | { result: string; message: string; score: number; totalChecks: number; passed: number; failed: number; checks: Array<{ label: string; passed: boolean }> }>(null);
  const [scanError, setScanError] = useState('');
  const [showDetails, setShowDetails] = useState(false);

  const handleQuickScan = async () => {
    const domain = scanDomain.trim().replace(/^https?:\/\//, '').replace(/\/.*$/, '');
    if (!domain) return;
    
    setScanLoading(true);
    setScanResult(null);
    setScanError('');

    try {
      const { data, error } = await supabase.functions.invoke('light-scan', {
        body: { domain },
      });

      if (error) throw error;
      if (data?.error) {
        setScanError(data.error);
      } else if (data?.limitReached) {
        setScanError(data.error || 'Limit erreicht');
      } else {
        setScanResult(data);
        setShowDetails(false);
      }
    } catch (err: any) {
      const detail = err?.message || err?.context?.message || '';
      setScanError(detail ? `Scan fehlgeschlagen: ${detail}` : 'Scan fehlgeschlagen. Bitte versuchen Sie es erneut.');
      console.error('Quick scan error:', err);
    } finally {
      setScanLoading(false);
    }
  };

  return (
    <Layout>
      {/* ═══════════════════════ QUICK SCAN BAR ═══════════════════════ */}
      <section className="relative bg-[hsl(222,47%,6%)] border-b border-white/10">
        <div className="container px-4 sm:px-6 py-4 sm:py-5">
          {/* Input row */}
          <div className="flex flex-col sm:flex-row items-center gap-3 max-w-3xl mx-auto">
            <div className="flex items-center gap-2 shrink-0">
              <Shield className="h-5 w-5 text-accent" />
              <span className="text-white font-semibold text-sm whitespace-nowrap">Security Check</span>
            </div>
            <div className="flex flex-1 w-full gap-2">
              <Input
                placeholder="z.B. ihre-domain.de"
                value={scanDomain}
                onChange={(e) => { setScanDomain(e.target.value); setScanResult(null); setScanError(''); }}
                onKeyDown={(e) => e.key === 'Enter' && handleQuickScan()}
                className="bg-white/10 border-white/20 text-white placeholder:text-slate-400 h-11"
                disabled={scanLoading}
              />
              <Button
                onClick={handleQuickScan}
                disabled={scanLoading || !scanDomain.trim()}
                className="bg-accent text-accent-foreground hover:bg-accent/90 h-11 px-6 shrink-0"
              >
                {scanLoading ? (
                  <><Loader2 className="h-4 w-4 animate-spin mr-2" />Analyse...</>
                ) : (
                  <><Search className="h-4 w-4 mr-1.5" />Prüfen</>
                )}
              </Button>
            </div>
          </div>

          {/* Professional Results Panel */}
          {scanResult && (
            <div className="max-w-3xl mx-auto mt-5 animate-in slide-in-from-top-2 fade-in duration-500">
              <div className={`rounded-xl border overflow-hidden ${
                scanResult.result === 'green'
                  ? 'border-emerald-500/30 bg-emerald-950/30'
                  : 'border-red-500/30 bg-red-950/30'
              }`}>
                {/* Score header */}
                <div className="flex flex-col sm:flex-row items-center gap-4 p-5">
                  {/* Score circle */}
                  <div className="relative w-20 h-20 shrink-0">
                    <svg className="w-20 h-20 -rotate-90" viewBox="0 0 80 80">
                      <circle cx="40" cy="40" r="34" fill="none" stroke="hsl(220,20%,20%)" strokeWidth="6" />
                      <circle
                        cx="40" cy="40" r="34" fill="none"
                        stroke={scanResult.result === 'green' ? 'hsl(152,69%,53%)' : 'hsl(0,72%,51%)'}
                        strokeWidth="6"
                        strokeLinecap="round"
                        strokeDasharray={`${(scanResult.score / 100) * 213.6} 213.6`}
                      />
                    </svg>
                    <div className="absolute inset-0 flex items-center justify-center">
                      <span className={`text-xl font-bold ${scanResult.result === 'green' ? 'text-emerald-400' : 'text-red-400'}`}>
                        {scanResult.score}%
                      </span>
                    </div>
                  </div>

                  {/* Summary */}
                  <div className="flex-1 text-center sm:text-left">
                    <div className="flex items-center gap-2 justify-center sm:justify-start mb-1">
                      {scanResult.result === 'green' ? (
                        <CheckCircle2 className="h-5 w-5 text-emerald-400" />
                      ) : (
                        <AlertTriangle className="h-5 w-5 text-red-400" />
                      )}
                      <span className={`text-lg font-bold ${scanResult.result === 'green' ? 'text-emerald-400' : 'text-red-400'}`}>
                        {scanResult.result === 'green' ? 'Guter Schutz' : 'Risiken erkannt'}
                      </span>
                    </div>
                    <p className="text-slate-400 text-sm">{scanResult.message}</p>
                  </div>

                  {/* Stats */}
                  <div className="flex gap-4 shrink-0">
                    <div className="text-center px-3">
                      <div className="text-2xl font-bold text-emerald-400">{scanResult.passed}</div>
                      <div className="text-xs text-slate-500 mt-0.5">Bestanden</div>
                    </div>
                    <div className="w-px bg-white/10" />
                    <div className="text-center px-3">
                      <div className="text-2xl font-bold text-red-400">{scanResult.failed}</div>
                      <div className="text-xs text-slate-500 mt-0.5">Risiken</div>
                    </div>
                    <div className="w-px bg-white/10" />
                    <div className="text-center px-3">
                      <div className="text-2xl font-bold text-slate-300">{scanResult.totalChecks}</div>
                      <div className="text-xs text-slate-500 mt-0.5">Checks</div>
                    </div>
                  </div>
                </div>

                {/* Progress bar */}
                <div className="px-5 pb-3">
                  <div className="flex gap-1 h-2 rounded-full overflow-hidden bg-white/5">
                    <div
                      className="bg-emerald-500 rounded-l-full transition-all duration-700"
                      style={{ width: `${scanResult.score}%` }}
                    />
                    <div
                      className="bg-red-500 rounded-r-full transition-all duration-700"
                      style={{ width: `${100 - scanResult.score}%` }}
                    />
                  </div>
                  <div className="flex justify-between mt-1">
                    <span className="text-[10px] text-emerald-400/70 font-mono">Schutz {scanResult.score}%</span>
                    <span className="text-[10px] text-red-400/70 font-mono">Risiko {100 - scanResult.score}%</span>
                  </div>
                </div>

                {/* Expandable details */}
                <button
                  onClick={() => setShowDetails(!showDetails)}
                  className="w-full flex items-center justify-center gap-1 py-2.5 text-xs text-slate-400 hover:text-white border-t border-white/5 transition-colors"
                >
                  Details anzeigen
                  <ChevronDown className={`h-3.5 w-3.5 transition-transform ${showDetails ? 'rotate-180' : ''}`} />
                </button>

                {showDetails && (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-px bg-white/5 border-t border-white/5">
                    {scanResult.checks.map((check, i) => (
                      <div key={i} className="flex items-center gap-2.5 px-4 py-2.5 bg-[hsl(222,47%,6%)]">
                        {check.passed ? (
                          <CheckCircle2 className="h-4 w-4 text-emerald-400 shrink-0" />
                        ) : (
                          <XCircle className="h-4 w-4 text-red-400 shrink-0" />
                        )}
                        <span className={`text-sm ${check.passed ? 'text-slate-300' : 'text-red-300'}`}>
                          {check.label}
                        </span>
                      </div>
                    ))}
                  </div>
                )}

                {/* CTA for red results */}
                {scanResult.result === 'red' && (
                  <div className="px-5 py-4 border-t border-white/5 flex flex-col sm:flex-row items-center gap-3 justify-between">
                    <p className="text-sm text-slate-400">
                      Sichern Sie Ihre Domain mit <span className="text-white font-semibold">GAP Protection</span>
                    </p>
                    <Button
                      size="sm"
                      className="bg-accent text-accent-foreground hover:bg-accent/90 shrink-0"
                      onClick={() => navigate('/contact')}
                    >
                      Beratung anfordern
                      <ArrowRight className="ml-1.5 h-3.5 w-3.5" />
                    </Button>
                  </div>
                )}
              </div>
            </div>
          )}

          {scanError && (
            <div className="max-w-3xl mx-auto mt-4">
              <div className="flex items-center gap-2 px-4 py-3 rounded-lg text-sm font-medium bg-amber-500/10 text-amber-400 border border-amber-500/30">
                <AlertTriangle className="h-4 w-4 shrink-0" />
                {scanError}
              </div>
            </div>
          )}
        </div>
      </section>

      {/* ═══════════════════════ HERO ═══════════════════════ */}
      <section className="relative min-h-[80vh] sm:min-h-[90vh] flex items-center overflow-hidden">
        {/* Background layers */}
        <img src={heroBg} alt="" className="absolute inset-0 w-full h-full object-cover" aria-hidden="true" />
        <div className="absolute inset-0 bg-gradient-to-r from-[hsl(222,47%,6%)] via-[hsl(222,47%,6%,0.85)] to-transparent" />
        <div className="absolute inset-0 bg-grid-pattern opacity-20" />

        {/* Animated scan line */}
        <div className="absolute inset-0 overflow-hidden pointer-events-none">
          <div className="absolute w-full h-[2px] bg-gradient-to-r from-transparent via-accent to-transparent opacity-40 animate-scan-line" />
        </div>

        <div className="container px-4 sm:px-6 relative z-10 py-12 sm:py-16 md:py-20">
          <div className="max-w-3xl">
            <div className="flex items-center gap-3 mb-6 sm:mb-8">
              <div className="h-px w-8 sm:w-12 bg-accent" />
              <span className="text-accent font-mono text-xs sm:text-sm tracking-[0.2em] sm:tracking-[0.3em] uppercase">Enterprise Cybersecurity</span>
            </div>

            <img src={logoStackedWhite} alt="GAP Protection" className="h-16 sm:h-20 md:h-28 mb-4 sm:mb-6 object-contain" />

            <h1 className="text-3xl sm:text-4xl md:text-5xl lg:text-7xl font-extrabold tracking-tight text-white leading-[1.1] mb-4 sm:mb-6">
              Kontinuierlicher Schutz
              <span className="block text-gradient-cyber mt-2">für Ihre IT-Systeme</span>
            </h1>

            <p className="text-base sm:text-lg md:text-xl text-slate-300 max-w-xl mb-8 sm:mb-10 leading-relaxed">
              Wir überwachen Ihre Systeme rund um die Uhr, erkennen neue Schwachstellen sofort und passen den Schutz in Echtzeit an — partnerschaftlich, nah und verständlich.
            </p>

            <div className="flex flex-col sm:flex-row gap-3 sm:gap-4">
              <Button
                size="lg"
                className="bg-accent text-accent-foreground hover:bg-accent/90 text-sm sm:text-base px-6 sm:px-8 h-12 sm:h-14 cyber-glow"
                onClick={() => navigate('/security-test')}
              >
                <Shield className="mr-2 h-4 w-4 sm:h-5 sm:w-5" />
                Kostenloser Sicherheitstest
                <ArrowRight className="ml-2 h-4 w-4 sm:h-5 sm:w-5" />
              </Button>
              <Button
                size="lg"
                variant="outline"
                className="border-slate-500 text-white bg-transparent hover:bg-white/10 text-sm sm:text-base px-6 sm:px-8 h-12 sm:h-14"
                onClick={() => navigate('/contact')}
              >
                Beratung anfordern
              </Button>
            </div>

            {/* Trust indicators */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 sm:gap-6 mt-8 sm:mt-12 pt-6 sm:pt-8 border-t border-white/10">
              {[
                { value: '500+', label: 'Geschützte Domains' },
                { value: '24/7', label: 'Monitoring' },
                { value: '99.9%', label: 'Uptime' },
                { value: '<1min', label: 'Reaktionszeit' },
              ].map((stat) => (
                <div key={stat.label} className="text-center">
                  <div className="text-xl sm:text-2xl font-bold text-accent">{stat.value}</div>
                  <div className="text-[11px] sm:text-xs text-slate-400 mt-1">{stat.label}</div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* ═══════════════════════ SERVICES ═══════════════════════ */}
      <section className="py-12 sm:py-16 md:py-24 bg-background relative">
        <div className="container px-4 sm:px-6">
          <div className="text-center max-w-2xl mx-auto mb-10 sm:mb-16">
            <span className="text-accent font-mono text-sm tracking-[0.2em] uppercase">Unsere Leistungen</span>
            <h2 className="text-3xl md:text-4xl font-bold mt-3 text-foreground">
              360° Cybersecurity für Ihr Unternehmen
            </h2>
            <p className="text-muted-foreground mt-4 text-lg">
              Ganzheitlicher Schutz durch modernste Technologien und erfahrene Sicherheitsexperten.
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-6 md:gap-8">
            {[
              {
                icon: Eye,
                title: 'Schwachstellen-Analyse',
                desc: 'Automatisierte und manuelle Penetrationstests identifizieren kritische Sicherheitslücken in Ihrer Infrastruktur.',
                color: 'text-accent',
                bgColor: 'bg-accent/10',
              },
              {
                icon: Shield,
                title: 'GAP SHIELD',
                desc: 'Aktive Schutzschicht mit IP-Maskierung, WAF, DDoS-Schutz und intelligenter Bedrohungsfilterung.',
                color: 'text-accent',
                bgColor: 'bg-accent/10',
              },
              {
                icon: Server,
                title: 'Infrastruktur-Härtung',
                desc: 'Konfigurationsanalyse und Best-Practice-Umsetzung für Server, Netzwerk und Cloud-Dienste.',
                color: 'text-accent',
                bgColor: 'bg-accent/10',
              },
              {
                icon: BarChart3,
                title: 'Security Monitoring',
                desc: '24/7 Echtzeit-Überwachung mit sofortiger Alarmierung bei verdächtigen Aktivitäten und Anomalien.',
                color: 'text-accent',
                bgColor: 'bg-accent/10',
              },
              {
                icon: Lock,
                title: 'Compliance & Audit',
                desc: 'DSGVO-konforme Sicherheitsberichte und Dokumentation für regulatorische Anforderungen.',
                color: 'text-accent',
                bgColor: 'bg-accent/10',
              },
              {
                icon: Zap,
                title: 'Incident Response',
                desc: 'Sofortige Reaktion bei Sicherheitsvorfällen mit forensischer Analyse und Schadensminimierung.',
                color: 'text-accent',
                bgColor: 'bg-accent/10',
              },
            ].map((service) => (
              <div
                key={service.title}
                className="group relative p-5 sm:p-6 md:p-8 rounded-2xl border border-border bg-card hover:border-accent/40 hover:shadow-[0_0_30px_hsl(186_80%_42%/0.08)] transition-all duration-500"
              >
                <div className={`w-14 h-14 rounded-xl ${service.bgColor} flex items-center justify-center mb-5 group-hover:scale-110 transition-transform duration-300`}>
                  <service.icon className={`h-7 w-7 ${service.color}`} />
                </div>
                <h3 className="text-xl font-semibold text-card-foreground mb-3">{service.title}</h3>
                <p className="text-muted-foreground leading-relaxed">{service.desc}</p>
                <ChevronRight className="absolute top-8 right-8 h-5 w-5 text-muted-foreground/30 group-hover:text-accent group-hover:translate-x-1 transition-all" />
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ═══════════════════════ CTA BANNER ═══════════════════════ */}
      <section className="relative py-12 sm:py-16 md:py-24 overflow-hidden">
        <img src={werbekarteDark} alt="" className="absolute inset-0 w-full h-full object-cover opacity-40" aria-hidden="true" />
        <div className="absolute inset-0 bg-gradient-to-r from-[hsl(222,47%,8%,0.85)] to-[hsl(222,60%,14%,0.85)]" />
        <div className="container px-4 sm:px-6 relative z-10">
          <div className="max-w-4xl mx-auto text-center">
            <h2 className="text-2xl sm:text-3xl md:text-5xl font-bold text-white mb-4 sm:mb-6">
              Bereit, Ihre Sicherheit auf das
              <span className="text-gradient-cyber"> nächste Level</span> zu bringen?
            </h2>
            <p className="text-slate-300 text-lg mb-10 max-w-2xl mx-auto">
              Starten Sie mit einem kostenlosen Sicherheitscheck und erfahren Sie, wo Ihre kritischen Schwachstellen liegen.
            </p>
            <div className="flex flex-col sm:flex-row gap-4 justify-center">
              <Button
                size="lg"
                className="bg-accent text-accent-foreground hover:bg-accent/90 text-base px-10 h-14 cyber-glow"
                onClick={() => navigate('/security-test')}
              >
                <ShieldCheck className="mr-2 h-5 w-5" />
                Jetzt testen – kostenlos
              </Button>
              <Button
                size="lg"
                variant="outline"
                className="border-slate-500 text-white bg-transparent hover:bg-white/10 text-base px-10 h-14"
                onClick={() => navigate('/register')}
              >
                Partner werden
                <ArrowRight className="ml-2 h-5 w-5" />
              </Button>
            </div>
          </div>
        </div>
      </section>

      {/* ═══════════════════════ USP – KONTINUIERLICHE ÜBERWACHUNG ═══════════════════════ */}
      <section className="py-12 sm:py-16 md:py-24 bg-muted/20 border-y border-border">
        <div className="container px-4 sm:px-6">
          <div className="text-center max-w-3xl mx-auto mb-10 sm:mb-16">
            <span className="text-accent font-mono text-sm tracking-[0.2em] uppercase">Unser Alleinstellungsmerkmal</span>
            <h2 className="text-3xl md:text-4xl font-bold mt-3 text-foreground">
              Nicht nur einmal testen —
              <span className="text-gradient-cyber"> fortlaufend schützen</span>
            </h2>
            <p className="text-muted-foreground mt-4 text-lg leading-relaxed">
              Während andere einmalige Penetrationstests anbieten, überwachen wir Ihre Systeme kontinuierlich.
              Neue Exploits? Wir passen den Schutz sofort an. Fehlende Updates? Wir informieren Sie proaktiv.
            </p>
          </div>

          <div className="grid sm:grid-cols-2 md:grid-cols-3 gap-4 sm:gap-6 md:gap-8 mb-10 sm:mb-16">
            {[
              {
                icon: Eye,
                title: 'Lücken erkennen',
                desc: 'Wir identifizieren potenzielle neue Schwachstellen in Ihren Systemen — bevor Angreifer sie finden.',
              },
              {
                icon: Zap,
                title: 'Sofort anpassen',
                desc: 'Bei neuen Exploits und Bedrohungen passen wir den Schutz in Echtzeit an — kein Warten, kein Risiko.',
              },
              {
                icon: BarChart3,
                title: 'Monatlich berichten',
                desc: 'Regelmäßige Reports über Schwachstellen, fehlende Updates und schwache Konfigurationen — klar und verständlich.',
              },
            ].map((item) => (
              <div key={item.title} className="relative p-8 rounded-2xl border border-border bg-card hover:border-accent/40 transition-all duration-300 group">
                <div className="w-14 h-14 rounded-xl bg-accent/10 flex items-center justify-center mb-5 group-hover:scale-110 transition-transform">
                  <item.icon className="h-7 w-7 text-accent" />
                </div>
                <h3 className="text-xl font-semibold text-card-foreground mb-3">{item.title}</h3>
                <p className="text-muted-foreground leading-relaxed">{item.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ═══════════════════════ WARUM GAP – DIFFERENZIERUNG ═══════════════════════ */}
      <section className="py-12 sm:py-16 md:py-24 bg-background">
        <div className="container px-4 sm:px-6">
          <div className="grid lg:grid-cols-2 gap-8 sm:gap-12 lg:gap-16 items-center">
            <div>
              <span className="text-accent font-mono text-sm tracking-[0.2em] uppercase">Warum GAP Protection</span>
              <h2 className="text-3xl md:text-4xl font-bold mt-3 mb-6 text-foreground">
                Partnerschaftliche Begleitung statt anonymer Service
              </h2>
              <p className="text-muted-foreground text-lg mb-4 leading-relaxed">
                Globale Konzerne wie IBM, Accenture oder Orange Cyberdefense bieten standardisierte Services in riesigen Maßstäben. 
                Wir setzen auf das Gegenteil: <strong className="text-foreground">direkten, persönlichen Dialog</strong> und individuell angepasste Betreuung.
              </p>
              <p className="text-muted-foreground text-lg mb-8 leading-relaxed">
                GAP Protection GmbH aus Berlin-Schönefeld bietet nicht nur Monitoring — sondern eine echte Partnerschaft. 
                Nah, anpassbar und verständlich. Speziell für den Mittelstand.
              </p>
              <div className="space-y-5">
                {[
                  'Kontinuierliche Überwachung — nicht nur punktuelle Tests',
                  'Monatliche Schwachstellenberichte — klar und verständlich',
                  'Proaktive Anpassung bei neuen Bedrohungen',
                  'Persönlicher Ansprechpartner — kein Bot-Service',
                  'Deutsche Datenhaltung — 100% DSGVO-konform',
                  'Aktiver Schutz — nicht nur Erkennung',
                ].map((point) => (
                  <div key={point} className="flex items-start gap-3">
                    <CheckCircle2 className="h-5 w-5 text-accent mt-0.5 shrink-0" />
                    <span className="text-card-foreground">{point}</span>
                  </div>
                ))}
              </div>
              <Button
                className="mt-10 bg-accent text-accent-foreground hover:bg-accent/90 px-8 h-12"
                onClick={() => navigate('/contact')}
              >
                Kostenlose Beratung
                <ArrowRight className="ml-2 h-4 w-4" />
              </Button>
            </div>

            {/* Stats block */}
            <div className="grid grid-cols-2 gap-3 sm:gap-4 md:gap-6">
              {[
                { icon: Shield, value: 'ab €399', label: 'Pro Monat / Netto', sub: 'Kontinuierlicher Schutz' },
                { icon: Globe, value: '24/7', label: 'Security Monitoring', sub: 'Rund um die Uhr überwacht' },
                { icon: Users, value: 'Mittelstand', label: 'Unser Fokus', sub: 'Persönlich & individuell' },
                { icon: Eye, value: '10k+', label: 'Scans durchgeführt', sub: 'Täglich neue Bedrohungen' },
              ].map((stat) => (
                <div
                  key={stat.label}
                  className="p-4 sm:p-5 md:p-6 rounded-2xl border border-border bg-card hover:border-accent/30 transition-all duration-300 text-center"
                >
                  <stat.icon className="h-6 w-6 sm:h-8 sm:w-8 text-accent mx-auto mb-2 sm:mb-3" />
                  <div className="text-lg sm:text-2xl font-bold text-card-foreground">{stat.value}</div>
                  <div className="text-sm font-medium text-card-foreground mt-1">{stat.label}</div>
                  <div className="text-xs text-muted-foreground mt-1">{stat.sub}</div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* ═══════════════════════ QUICK ACTIONS ═══════════════════════ */}
      <section className="py-10 sm:py-12 md:py-16 border-t border-border bg-muted/30">
        <div className="container px-4 sm:px-6">
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4 sm:gap-6">
            {[
              {
                icon: Shield,
                title: 'Sicherheitstest',
                desc: 'Kostenloser Scan Ihrer Domain in unter 60 Sekunden',
                action: 'Test starten',
                route: '/security-test',
              },
              {
                icon: Lock,
                title: 'Partner Login',
                desc: 'Zugang zu Dashboard, Berichten und Provisionen',
                action: 'Anmelden',
                route: '/auth',
              },
              {
                icon: Users,
                title: 'Partner werden',
                desc: 'Werden Sie Teil unseres Vertriebsnetzwerks',
                action: 'Registrieren',
                route: '/register',
              },
            ].map((item) => (
              <button
                key={item.title}
                onClick={() => navigate(item.route)}
                className="group flex items-center gap-4 sm:gap-5 p-4 sm:p-6 rounded-2xl border border-border bg-card hover:border-accent/40 hover:shadow-lg transition-all duration-300 text-left w-full"
              >
                <div className="w-14 h-14 rounded-xl bg-accent/10 flex items-center justify-center shrink-0 group-hover:bg-accent/20 transition-colors">
                  <item.icon className="h-7 w-7 text-accent" />
                </div>
                <div className="flex-1 min-w-0">
                  <h3 className="text-lg font-semibold text-card-foreground">{item.title}</h3>
                  <p className="text-sm text-muted-foreground mt-1">{item.desc}</p>
                </div>
                <ArrowRight className="h-5 w-5 text-muted-foreground group-hover:text-accent group-hover:translate-x-1 transition-all shrink-0" />
              </button>
            ))}
          </div>
        </div>
      </section>
    </Layout>
  );
};

export default Index;
