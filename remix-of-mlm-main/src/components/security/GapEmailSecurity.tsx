import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { securityApi } from '@/lib/securityApi';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { useToast } from '@/hooks/use-toast';
import { Loader2, Mail, Shield, CheckCircle, XCircle, AlertTriangle } from 'lucide-react';

interface EmailConfig {
  id: string; domain_id: string;
  spf_record: string | null; spf_status: string;
  dkim_enabled: boolean; dkim_selector: string | null;
  dmarc_policy: string; dmarc_rua: string | null; dmarc_percentage: number;
  dane_enabled: boolean; mta_sts_enabled: boolean; mta_sts_mode: string;
  bimi_enabled: boolean; bimi_logo_url: string | null;
  anti_phishing_enabled: boolean; quarantine_suspicious: boolean;
  scan_attachments: boolean; block_executables: boolean; spoofing_protection: boolean;
}

interface Props { domains: { id: string; domain: string }[] }

export function GapEmailSecurity({ domains }: Props) {
  const { toast } = useToast();
  const [configs, setConfigs] = useState<EmailConfig[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedDomain, setSelectedDomain] = useState('');

  const fetchConfigs = async () => {
    setLoading(true);
    const { data } = await supabase.from('email_security_config').select('*');
    setConfigs((data || []) as EmailConfig[]);
    setLoading(false);
  };

  useEffect(() => { fetchConfigs(); }, []);

  const initConfig = async (domainId: string) => {
    await securityApi.insert('email_security_config', { domain_id: domainId });
    toast({ title: '✓ E-Mail-Sicherheit initialisiert' });
    fetchConfigs();
  };

  const update = async (id: string, field: string, value: unknown) => {
    await securityApi.update('email_security_config', id, { [field]: value });
    fetchConfigs();
  };

  const config = selectedDomain ? configs.find(c => c.domain_id === selectedDomain) : null;
  const getDomain = (id: string) => domains.find(d => d.id === id)?.domain || id;

  const statusBadge = (status: string) => {
    switch (status) {
      case 'valid': return <Badge className="bg-green-500/15 text-green-600"><CheckCircle className="h-3 w-3 mr-1" />Gültig</Badge>;
      case 'invalid': return <Badge className="bg-red-500/15 text-red-600"><XCircle className="h-3 w-3 mr-1" />Ungültig</Badge>;
      case 'warning': return <Badge className="bg-yellow-500/15 text-yellow-600"><AlertTriangle className="h-3 w-3 mr-1" />Warnung</Badge>;
      default: return <Badge variant="outline">Nicht konfiguriert</Badge>;
    }
  };

  if (loading) return <div className="flex justify-center py-8"><Loader2 className="h-6 w-6 animate-spin" /></div>;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-bold flex items-center gap-2"><Mail className="h-5 w-5 text-primary" /> E-Mail-Sicherheit</h3>
          <p className="text-sm text-muted-foreground">SPF, DKIM, DMARC, Anti-Phishing & Spoofing-Schutz</p>
        </div>
        <Select value={selectedDomain} onValueChange={setSelectedDomain}>
          <SelectTrigger className="w-[220px]"><SelectValue placeholder="Domain wählen..." /></SelectTrigger>
          <SelectContent>{domains.map(d => <SelectItem key={d.id} value={d.id}>{d.domain}</SelectItem>)}</SelectContent>
        </Select>
      </div>

      {!selectedDomain ? (
        <Card><CardContent className="py-12 text-center text-muted-foreground"><Mail className="h-12 w-12 mx-auto mb-3 opacity-30" /><p>Wählen Sie eine Domain aus</p></CardContent></Card>
      ) : !config ? (
        <Card><CardContent className="py-12 text-center">
          <Mail className="h-12 w-12 mx-auto mb-3 opacity-30" />
          <p className="text-muted-foreground mb-4">E-Mail-Sicherheit nicht konfiguriert für {getDomain(selectedDomain)}</p>
          <Button onClick={() => initConfig(selectedDomain)}><Shield className="h-4 w-4 mr-2" /> Jetzt konfigurieren</Button>
        </CardContent></Card>
      ) : (
        <div className="grid md:grid-cols-2 gap-4">
          {/* SPF */}
          <Card>
            <CardHeader className="pb-3"><CardTitle className="text-sm">SPF (Sender Policy Framework)</CardTitle></CardHeader>
            <CardContent className="space-y-3">
              <div className="flex items-center justify-between">{statusBadge(config.spf_status)}</div>
              <div className="grid gap-2">
                <Label className="text-xs">SPF-Record</Label>
                <Input value={config.spf_record || ''} onChange={e => update(config.id, 'spf_record', e.target.value)} placeholder="v=spf1 include:_spf.google.com ~all" className="font-mono text-xs" />
              </div>
            </CardContent>
          </Card>

          {/* DKIM */}
          <Card>
            <CardHeader className="pb-3"><CardTitle className="text-sm">DKIM (DomainKeys)</CardTitle></CardHeader>
            <CardContent className="space-y-3">
              <div className="flex items-center justify-between">
                <Label>DKIM aktiviert</Label>
                <Switch checked={config.dkim_enabled} onCheckedChange={c => update(config.id, 'dkim_enabled', c)} />
              </div>
              <div className="grid gap-2">
                <Label className="text-xs">Selector</Label>
                <Input value={config.dkim_selector || ''} onChange={e => update(config.id, 'dkim_selector', e.target.value)} placeholder="default" className="text-sm" />
              </div>
            </CardContent>
          </Card>

          {/* DMARC */}
          <Card>
            <CardHeader className="pb-3"><CardTitle className="text-sm">DMARC</CardTitle></CardHeader>
            <CardContent className="space-y-3">
              <div className="grid gap-2">
                <Label className="text-xs">Policy</Label>
                <Select value={config.dmarc_policy} onValueChange={v => update(config.id, 'dmarc_policy', v)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">None (Monitoring)</SelectItem>
                    <SelectItem value="quarantine">Quarantine</SelectItem>
                    <SelectItem value="reject">Reject (empfohlen)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="grid gap-2">
                <Label className="text-xs">Report-Adresse (rua)</Label>
                <Input value={config.dmarc_rua || ''} onChange={e => update(config.id, 'dmarc_rua', e.target.value)} placeholder="mailto:dmarc@example.com" className="text-sm" />
              </div>
              <div className="grid gap-2">
                <Label className="text-xs">Prozentsatz (%)</Label>
                <Input type="number" min={0} max={100} value={config.dmarc_percentage} onChange={e => update(config.id, 'dmarc_percentage', Number(e.target.value))} />
              </div>
            </CardContent>
          </Card>

          {/* Advanced */}
          <Card>
            <CardHeader className="pb-3"><CardTitle className="text-sm">Erweiterte Protokolle</CardTitle></CardHeader>
            <CardContent className="space-y-3">
              {[
                { key: 'dane_enabled', label: 'DANE/TLSA', desc: 'DNS-Based Authentication of Named Entities' },
                { key: 'mta_sts_enabled', label: 'MTA-STS', desc: 'Mail Transfer Agent Strict Transport Security' },
                { key: 'bimi_enabled', label: 'BIMI', desc: 'Brand Indicators for Message Identification' },
              ].map(({ key, label, desc }) => (
                <div key={key} className="flex items-center justify-between">
                  <div><Label className="text-sm">{label}</Label><p className="text-xs text-muted-foreground">{desc}</p></div>
                  <Switch checked={Boolean((config as unknown as Record<string, unknown>)[key])} onCheckedChange={c => update(config.id, key, c)} />
                </div>
              ))}
            </CardContent>
          </Card>

          {/* Anti-Phishing */}
          <Card className="md:col-span-2">
            <CardHeader className="pb-3"><CardTitle className="text-sm">Anti-Phishing & Inhaltsfilterung</CardTitle></CardHeader>
            <CardContent>
              <div className="grid md:grid-cols-3 gap-4">
                {[
                  { key: 'anti_phishing_enabled', label: 'Anti-Phishing', desc: 'Phishing-E-Mails erkennen und blockieren' },
                  { key: 'quarantine_suspicious', label: 'Quarantäne', desc: 'Verdächtige E-Mails isolieren' },
                  { key: 'scan_attachments', label: 'Anhänge scannen', desc: 'Anhänge auf Malware prüfen' },
                  { key: 'block_executables', label: 'Ausführbare blockieren', desc: '.exe, .bat, .cmd blockieren' },
                  { key: 'spoofing_protection', label: 'Spoofing-Schutz', desc: 'Absender-Spoofing verhindern' },
                ].map(({ key, label, desc }) => (
                  <div key={key} className="flex items-center justify-between p-3 rounded-lg bg-muted/50">
                    <div><Label className="text-sm">{label}</Label><p className="text-xs text-muted-foreground">{desc}</p></div>
                    <Switch checked={Boolean((config as unknown as Record<string, unknown>)[key])} onCheckedChange={c => update(config.id, key, c)} />
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}
