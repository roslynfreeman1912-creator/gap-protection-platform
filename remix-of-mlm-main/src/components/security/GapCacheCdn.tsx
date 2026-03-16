import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { securityApi } from '@/lib/securityApi';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';
import { Database, Zap, Loader2, Globe, Image, Code, RefreshCw, Gauge } from 'lucide-react';

interface CacheConfig {
  id: string;
  domain_id: string;
  cache_level: string;
  browser_ttl: number;
  edge_ttl: number;
  always_online: boolean;
  development_mode: boolean;
  minify_js: boolean;
  minify_css: boolean;
  minify_html: boolean;
  brotli: boolean;
  early_hints: boolean;
  rocket_loader: boolean;
  mirage: boolean;
  polish: string;
  webp: boolean;
  http2_push: boolean;
  http3: boolean;
  zero_rtt: boolean;
  websockets: boolean;
  response_buffering: boolean;
}

interface Props {
  domains: { id: string; domain: string }[];
}

export function GapCacheCdn({ domains }: Props) {
  const { toast } = useToast();
  const [configs, setConfigs] = useState<CacheConfig[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedDomain, setSelectedDomain] = useState('');

  const loadConfigs = async () => {
    setLoading(true);
    const { data } = await supabase.from('cache_settings').select('*');
    setConfigs((data || []) as CacheConfig[]);
    setLoading(false);
  };

  useEffect(() => { loadConfigs(); }, []);

  const initCache = async (domainId: string) => {
    try {
      await securityApi.insert('cache_settings', { domain_id: domainId });
      toast({ title: '✓ Cache-Einstellungen erstellt' }); loadConfigs();
    } catch (err) {
      toast({ variant: 'destructive', title: 'Fehler beim Erstellen der Cache-Einstellungen', description: err instanceof Error ? err.message : 'Unbekannter Fehler' });
    }
  };

  const update = async (id: string, field: string, value: unknown) => {
    await securityApi.update('cache_settings', id, { [field]: value });
    loadConfigs();
  };

  const config = selectedDomain ? configs.find(c => c.domain_id === selectedDomain) : null;

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                <Zap className="h-5 w-5 text-yellow-500" />
                Caching & CDN & Performance
              </CardTitle>
              <CardDescription>Cache-Einstellungen, Komprimierung und Performance-Optimierung</CardDescription>
            </div>
            <Select value={selectedDomain} onValueChange={setSelectedDomain}>
              <SelectTrigger className="w-[200px]"><SelectValue placeholder="Domain wählen..." /></SelectTrigger>
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
              <Zap className="h-12 w-12 mx-auto mb-2 opacity-30" />
              <p>Domain auswählen</p>
            </div>
          ) : !config ? (
            <div className="text-center py-8">
              <Database className="h-12 w-12 mx-auto mb-2 opacity-30 text-muted-foreground" />
              <p className="text-muted-foreground mb-4">Keine Cache-Einstellungen</p>
              <Button onClick={() => initCache(selectedDomain)}>
                <Zap className="h-4 w-4 mr-2" /> Cache aktivieren
              </Button>
            </div>
          ) : (
            <div className="grid gap-6">
              {/* Cache Level */}
              <div className="grid md:grid-cols-2 gap-4">
                <div>
                  <Label className="font-semibold">Cache-Stufe</Label>
                  <Select value={config.cache_level} onValueChange={v => update(config.id, 'cache_level', v)}>
                    <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="bypass">Kein Cache</SelectItem>
                      <SelectItem value="basic">Einfach</SelectItem>
                      <SelectItem value="standard">Standard (empfohlen)</SelectItem>
                      <SelectItem value="aggressive">Aggressiv</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label className="font-semibold">Bildoptimierung</Label>
                  <Select value={config.polish} onValueChange={v => update(config.id, 'polish', v)}>
                    <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="off">Aus</SelectItem>
                      <SelectItem value="lossless">Verlustfrei</SelectItem>
                      <SelectItem value="lossy">Komprimiert (empfohlen)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="grid md:grid-cols-2 gap-4">
                <div>
                  <Label className="font-semibold">Browser-Cache TTL</Label>
                  <Select value={String(config.browser_ttl)} onValueChange={v => update(config.id, 'browser_ttl', Number(v))}>
                    <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="1800">30 Min</SelectItem>
                      <SelectItem value="3600">1 Stunde</SelectItem>
                      <SelectItem value="14400">4 Stunden</SelectItem>
                      <SelectItem value="86400">1 Tag</SelectItem>
                      <SelectItem value="604800">1 Woche</SelectItem>
                      <SelectItem value="2592000">1 Monat</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label className="font-semibold">Edge-Cache TTL</Label>
                  <Select value={String(config.edge_ttl)} onValueChange={v => update(config.id, 'edge_ttl', Number(v))}>
                    <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="7200">2 Stunden</SelectItem>
                      <SelectItem value="14400">4 Stunden</SelectItem>
                      <SelectItem value="86400">1 Tag</SelectItem>
                      <SelectItem value="604800">1 Woche</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              {/* Minification */}
              <div className="border rounded-lg p-4 space-y-4">
                <h4 className="font-semibold text-sm flex items-center gap-2"><Code className="h-4 w-4" /> Minifizierung</h4>
                {[
                  { key: 'minify_js', label: 'JavaScript minifizieren' },
                  { key: 'minify_css', label: 'CSS minifizieren' },
                  { key: 'minify_html', label: 'HTML minifizieren' },
                ].map(({ key, label }) => (
                  <div key={key} className="flex items-center justify-between">
                    <Label>{label}</Label>
                    <Switch checked={Boolean((config as unknown as Record<string, unknown>)[key])} onCheckedChange={c => update(config.id, key, c)} />
                  </div>
                ))}
              </div>

              {/* Performance */}
              <div className="border rounded-lg p-4 space-y-4">
                <h4 className="font-semibold text-sm flex items-center gap-2"><Gauge className="h-4 w-4" /> Performance</h4>
                {[
                  { key: 'brotli', label: 'Brotli-Komprimierung', desc: 'Moderne Komprimierung für schnellere Ladezeiten' },
                  { key: 'early_hints', label: 'Early Hints (103)', desc: 'Browser kann Ressourcen vorab laden' },
                  { key: 'http2_push', label: 'HTTP/2 Server Push', desc: 'Ressourcen proaktiv senden' },
                  { key: 'http3', label: 'HTTP/3 (QUIC)', desc: 'Neuestes Protokoll mit geringerer Latenz' },
                  { key: 'zero_rtt', label: '0-RTT Connection Resume', desc: 'Schnellerer TLS-Handshake bei wiederkehrenden Besuchern' },
                  { key: 'webp', label: 'WebP-Konvertierung', desc: 'Bilder automatisch in WebP umwandeln' },
                  { key: 'websockets', label: 'WebSockets', desc: 'Echtzeit-Verbindungen unterstützen' },
                  { key: 'always_online', label: 'Always Online™', desc: 'Gecachte Version bei Origin-Ausfall anzeigen' },
                  { key: 'rocket_loader', label: 'Rocket Loader', desc: 'JavaScript-Laden optimieren' },
                  { key: 'response_buffering', label: 'Response Buffering', desc: 'Antworten puffern für schnellere Auslieferung' },
                ].map(({ key, label, desc }) => (
                  <div key={key} className="flex items-center justify-between">
                    <div>
                      <Label>{label}</Label>
                      <p className="text-xs text-muted-foreground">{desc}</p>
                    </div>
                    <Switch checked={Boolean((config as unknown as Record<string, unknown>)[key])} onCheckedChange={c => update(config.id, key, c)} />
                  </div>
                ))}
              </div>

              {/* Development Mode */}
              <div className="border rounded-lg p-4 border-yellow-500/30 bg-yellow-500/5">
                <div className="flex items-center justify-between">
                  <div>
                    <Label className="text-yellow-600 font-semibold">Entwicklungsmodus</Label>
                    <p className="text-xs text-muted-foreground">Cache für 3 Stunden deaktivieren — nur für Entwicklung</p>
                  </div>
                  <Switch
                    checked={config.development_mode}
                    onCheckedChange={c => update(config.id, 'development_mode', c)}
                  />
                </div>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
