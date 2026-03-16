import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';
import { Lock, ShieldCheck, Loader2, RefreshCw, CheckCircle, AlertTriangle } from 'lucide-react';

interface SslConfig {
  id: string;
  domain_id: string;
  certificate_type: string;
  status: string;
  issuer: string | null;
  expires_at: string | null;
  auto_renew: boolean;
  min_tls_version: string;
  always_use_https: boolean;
  hsts_enabled: boolean;
  hsts_max_age: number;
  hsts_include_subdomains: boolean;
  opportunistic_encryption: boolean;
  tls_1_3: boolean;
  automatic_https_rewrites: boolean;
}

interface Props {
  domains: { id: string; domain: string }[];
}

export function GapSslManager({ domains }: Props) {
  const { toast } = useToast();
  const [configs, setConfigs] = useState<SslConfig[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedDomain, setSelectedDomain] = useState('');

  const fetchConfigs = async () => {
    setLoading(true);
    const { data } = await supabase.from('ssl_certificates').select('*');
    setConfigs((data || []) as SslConfig[]);
    setLoading(false);
  };

  useEffect(() => { fetchConfigs(); }, []);

  const initSsl = async (domainId: string) => {
    const expires = new Date();
    expires.setFullYear(expires.getFullYear() + 1);
    const { error } = await supabase.from('ssl_certificates').insert({
      domain_id: domainId,
      expires_at: expires.toISOString(),
    });
    if (!error) { toast({ title: '✓ SSL-Zertifikat erstellt' }); fetchConfigs(); }
  };

  const updateConfig = async (id: string, field: string, value: unknown) => {
    await supabase.from('ssl_certificates').update({ [field]: value }).eq('id', id);
    fetchConfigs();
  };

  const getDomainName = (id: string) => domains.find(d => d.id === id)?.domain || id;

  const activeConfig = selectedDomain ? configs.find(c => c.domain_id === selectedDomain) : null;

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                <Lock className="h-5 w-5 text-green-500" />
                SSL/TLS-Verwaltung
              </CardTitle>
              <CardDescription>SSL-Zertifikate und TLS-Einstellungen — GAP Protection</CardDescription>
            </div>
            <Select value={selectedDomain} onValueChange={setSelectedDomain}>
              <SelectTrigger className="w-[200px]">
                <SelectValue placeholder="Domain wählen..." />
              </SelectTrigger>
              <SelectContent>
                {domains.map(d => <SelectItem key={d.id} value={d.id}>{d.domain}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex items-center justify-center py-8"><Loader2 className="h-6 w-6 animate-spin" /></div>
          ) : !selectedDomain ? (
            <div className="text-center py-8 text-muted-foreground">
              <Lock className="h-12 w-12 mx-auto mb-2 opacity-30" />
              <p>Wählen Sie eine Domain aus</p>
            </div>
          ) : !activeConfig ? (
            <div className="text-center py-8">
              <Lock className="h-12 w-12 mx-auto mb-2 opacity-30 text-muted-foreground" />
              <p className="text-muted-foreground mb-4">Kein SSL-Zertifikat konfiguriert</p>
              <Button onClick={() => initSsl(selectedDomain)}>
                <ShieldCheck className="h-4 w-4 mr-2" /> SSL aktivieren
              </Button>
            </div>
          ) : (
            <div className="space-y-6">
              {/* Certificate Status */}
              <div className="rounded-lg border p-4 bg-green-500/5 border-green-500/20">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <CheckCircle className="h-8 w-8 text-green-500" />
                    <div>
                      <p className="font-semibold">SSL-Zertifikat aktiv</p>
                      <p className="text-sm text-muted-foreground">
                        Aussteller: {activeConfig.issuer || 'GAP Protection CA'} — 
                        Typ: {activeConfig.certificate_type.replace('_', ' ').toUpperCase()}
                      </p>
                    </div>
                  </div>
                  <Badge className="bg-green-500/15 text-green-600">{activeConfig.status}</Badge>
                </div>
              </div>

              {/* SSL Mode */}
              <div className="grid gap-4">
                <div>
                  <Label className="text-sm font-semibold">Verschlüsselungsmodus</Label>
                  <p className="text-xs text-muted-foreground mb-2">Bestimmt wie der Traffic zwischen Client und Origin verschlüsselt wird</p>
                  <Select
                    value={activeConfig.certificate_type}
                    onValueChange={v => updateConfig(activeConfig.id, 'certificate_type', v)}
                  >
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="off">Aus — Keine Verschlüsselung</SelectItem>
                      <SelectItem value="flexible">Flexibel — Browser↔GAP verschlüsselt</SelectItem>
                      <SelectItem value="full">Voll — End-to-End verschlüsselt</SelectItem>
                      <SelectItem value="full_strict">Voll (Strikt) — End-to-End mit Zertifikatsvalidierung</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div>
                  <Label className="text-sm font-semibold">Minimale TLS-Version</Label>
                  <Select
                    value={activeConfig.min_tls_version}
                    onValueChange={v => updateConfig(activeConfig.id, 'min_tls_version', v)}
                  >
                    <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="1.0">TLS 1.0 (unsicher)</SelectItem>
                      <SelectItem value="1.1">TLS 1.1 (veraltet)</SelectItem>
                      <SelectItem value="1.2">TLS 1.2 (empfohlen)</SelectItem>
                      <SelectItem value="1.3">TLS 1.3 (modernst)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              {/* Toggle Settings */}
              <div className="border rounded-lg p-4 space-y-4">
                <h4 className="font-semibold text-sm">Sicherheitseinstellungen</h4>
                {[
                  { key: 'always_use_https', label: 'Immer HTTPS verwenden', desc: 'Leitet alle HTTP-Anfragen auf HTTPS um' },
                  { key: 'automatic_https_rewrites', label: 'Automatische HTTPS-Rewrites', desc: 'Mixed-Content-Probleme automatisch beheben' },
                  { key: 'hsts_enabled', label: 'HSTS (HTTP Strict Transport Security)', desc: 'Browser zwingen, nur HTTPS zu verwenden' },
                  { key: 'hsts_include_subdomains', label: 'HSTS Subdomains einschließen', desc: 'HSTS-Policy auf alle Subdomains anwenden' },
                  { key: 'tls_1_3', label: 'TLS 1.3', desc: 'Neuestes TLS-Protokoll mit verbesserter Sicherheit und Performance' },
                  { key: 'opportunistic_encryption', label: 'Opportunistische Verschlüsselung', desc: 'Verschlüsselung auch ohne Zertifikat anbieten' },
                  { key: 'auto_renew', label: 'Automatische Erneuerung', desc: 'Zertifikat automatisch vor Ablauf erneuern' },
                ].map(({ key, label, desc }) => (
                  <div key={key} className="flex items-center justify-between">
                    <div>
                      <Label>{label}</Label>
                      <p className="text-xs text-muted-foreground">{desc}</p>
                    </div>
                    <Switch
                      checked={Boolean((activeConfig as unknown as Record<string, unknown>)[key])}
                      onCheckedChange={c => updateConfig(activeConfig.id, key, c)}
                    />
                  </div>
                ))}
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
