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
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { useToast } from '@/hooks/use-toast';
import { Ban, ShieldCheck, Plus, Trash2, Loader2, Bot, Timer, Globe } from 'lucide-react';

interface IpRule {
  id: string;
  domain_id: string | null;
  ip_address: string;
  action: string;
  scope: string;
  note: string | null;
  hit_count: number;
  is_active: boolean;
  created_at: string;
}

interface RateLimitRule {
  id: string;
  domain_id: string;
  url_pattern: string;
  requests_per_period: number;
  period_seconds: number;
  action: string;
  action_timeout: number;
  description: string | null;
  is_active: boolean;
  triggered_count: number;
}

interface BotConfig {
  id: string;
  domain_id: string;
  bot_fight_mode: boolean;
  super_bot_fight_mode: boolean;
  javascript_detection: boolean;
  verified_bots_allowed: boolean;
  ai_bots_action: string;
  static_resource_protection: boolean;
  challenge_passage_ttl: number;
}

interface DdosConfig {
  id: string;
  domain_id: string;
  sensitivity_level: string;
  under_attack_mode: boolean;
  layer7_protection: boolean;
  layer3_4_protection: boolean;
  syn_flood_protection: boolean;
  udp_flood_protection: boolean;
  dns_amplification_protection: boolean;
  slowloris_protection: boolean;
  http_flood_threshold: number;
  auto_mitigation: boolean;
  alert_on_attack: boolean;
}

interface Props {
  domains: { id: string; domain: string }[];
}

export function GapAccessControl({ domains }: Props) {
  const { toast } = useToast();
  const [ipRules, setIpRules] = useState<IpRule[]>([]);
  const [rateLimits, setRateLimits] = useState<RateLimitRule[]>([]);
  const [botConfigs, setBotConfigs] = useState<BotConfig[]>([]);
  const [ddosConfigs, setDdosConfigs] = useState<DdosConfig[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedDomain, setSelectedDomain] = useState('all');

  // Dialogs
  const [ipDialogOpen, setIpDialogOpen] = useState(false);
  const [rlDialogOpen, setRlDialogOpen] = useState(false);
  const [ipForm, setIpForm] = useState({ ip_address: '', action: 'block', note: '', domain_id: 'all' });
  const [rlForm, setRlForm] = useState({ url_pattern: '*', requests_per_period: 100, period_seconds: 60, action: 'block', action_timeout: 60, description: '', domain_id: 'all' });

  const fetchAll = async () => {
    setLoading(true);
    const [ipRes, rlRes, botRes, ddosRes] = await Promise.all([
      supabase.from('ip_access_rules').select('*').order('created_at', { ascending: false }),
      supabase.from('rate_limit_rules').select('*').order('created_at', { ascending: false }),
      supabase.from('bot_management_config').select('*'),
      supabase.from('ddos_protection_config').select('*'),
    ]);
    setIpRules((ipRes.data || []) as IpRule[]);
    setRateLimits((rlRes.data || []) as RateLimitRule[]);
    setBotConfigs((botRes.data || []) as BotConfig[]);
    setDdosConfigs((ddosRes.data || []) as DdosConfig[]);
    setLoading(false);
  };

  useEffect(() => { fetchAll(); }, []);

  const getDomainName = (id: string | null) => domains.find(d => d.id === id)?.domain || 'Global';

  // IP Rules
  const addIpRule = async () => {
    if (!ipForm.ip_address) return;
    try {
      await securityApi.insert('ip_access_rules', {
        ip_address: ipForm.ip_address, action: ipForm.action, note: ipForm.note || null,
        domain_id: ipForm.domain_id !== 'all' ? ipForm.domain_id : null, scope: ipForm.domain_id !== 'all' ? 'domain' : 'global'
      });
      toast({ title: '✓ IP-Regel erstellt' }); setIpDialogOpen(false); fetchAll();
    } catch (err) {
      toast({ variant: 'destructive', title: 'Fehler beim Erstellen der IP-Regel', description: err instanceof Error ? err.message : 'Unbekannter Fehler' });
    }
  };

  const deleteIpRule = async (id: string) => {
    await securityApi.delete('ip_access_rules', id);
    fetchAll();
  };

  // Rate Limits
  const addRateLimit = async () => {
    if (!rlForm.domain_id || rlForm.domain_id === 'all') return;
    try {
      await securityApi.insert('rate_limit_rules', {
        domain_id: rlForm.domain_id, url_pattern: rlForm.url_pattern,
        requests_per_period: rlForm.requests_per_period, period_seconds: rlForm.period_seconds,
        action: rlForm.action, action_timeout: rlForm.action_timeout,
        description: rlForm.description || null,
      });
      toast({ title: '✓ Rate-Limit erstellt' }); setRlDialogOpen(false); fetchAll();
    } catch (err) {
      toast({ variant: 'destructive', title: 'Fehler beim Erstellen des Rate-Limits', description: err instanceof Error ? err.message : 'Unbekannter Fehler' });
    }
  };

  const deleteRateLimit = async (id: string) => {
    await securityApi.delete('rate_limit_rules', id);
    fetchAll();
  };

  // Bot Config
  const initBot = async (domainId: string) => {
    await securityApi.insert('bot_management_config', { domain_id: domainId });
    fetchAll();
  };

  const updateBot = async (id: string, field: string, value: unknown) => {
    await securityApi.update('bot_management_config', id, { [field]: value });
    fetchAll();
  };

  // DDoS Config
  const initDdos = async (domainId: string) => {
    await securityApi.insert('ddos_protection_config', { domain_id: domainId });
    fetchAll();
  };

  const updateDdos = async (id: string, field: string, value: unknown) => {
    await securityApi.update('ddos_protection_config', id, { [field]: value });
    fetchAll();
  };

  const botConfig = selectedDomain && selectedDomain !== 'all' ? botConfigs.find(b => b.domain_id === selectedDomain) : null;
  const ddosConfig = selectedDomain && selectedDomain !== 'all' ? ddosConfigs.find(d => d.domain_id === selectedDomain) : null;

  if (loading) return <div className="flex items-center justify-center py-8"><Loader2 className="h-6 w-6 animate-spin" /></div>;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-bold flex items-center gap-2"><Ban className="h-5 w-5 text-red-500" /> Zugriffskontrolle & Schutz</h3>
          <p className="text-sm text-muted-foreground">IP-Regeln, Rate Limiting, Bot-Management & DDoS-Schutz</p>
        </div>
        <Select value={selectedDomain} onValueChange={setSelectedDomain}>
          <SelectTrigger className="w-[200px]"><SelectValue placeholder="Domain wählen..." /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Alle</SelectItem>
            {domains.map(d => <SelectItem key={d.id} value={d.id}>{d.domain}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>

      <Tabs defaultValue="ip" className="space-y-4">
        <TabsList>
          <TabsTrigger value="ip">IP-Regeln</TabsTrigger>
          <TabsTrigger value="ratelimit">Rate Limiting</TabsTrigger>
          <TabsTrigger value="bots">Bot-Management</TabsTrigger>
          <TabsTrigger value="ddos">DDoS-Schutz</TabsTrigger>
        </TabsList>

        {/* IP ACCESS RULES */}
        <TabsContent value="ip">
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle className="text-sm">IP-Zugriffsregeln</CardTitle>
                <Button size="sm" onClick={() => setIpDialogOpen(true)}><Plus className="h-4 w-4 mr-1" /> IP-Regel</Button>
              </div>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>IP / CIDR</TableHead>
                    <TableHead>Aktion</TableHead>
                    <TableHead>Geltungsbereich</TableHead>
                    <TableHead>Notiz</TableHead>
                    <TableHead>Treffer</TableHead>
                    <TableHead>Aktionen</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {ipRules.filter(r => selectedDomain === 'all' || r.domain_id === selectedDomain).length === 0 ? (
                    <TableRow><TableCell colSpan={6} className="text-center text-muted-foreground py-6">Keine IP-Regeln</TableCell></TableRow>
                  ) : ipRules.filter(r => selectedDomain === 'all' || r.domain_id === selectedDomain).map(rule => (
                    <TableRow key={rule.id}>
                      <TableCell className="font-mono text-sm">{rule.ip_address}</TableCell>
                      <TableCell>
                        <Badge className={rule.action === 'block' ? 'bg-red-500/15 text-red-600' : rule.action === 'allow' ? 'bg-green-500/15 text-green-600' : 'bg-yellow-500/15 text-yellow-600'}>
                          {rule.action === 'block' ? 'Blockieren' : rule.action === 'allow' ? 'Erlauben' : 'Challenge'}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-sm">{getDomainName(rule.domain_id)}</TableCell>
                      <TableCell className="text-sm text-muted-foreground">{rule.note || '—'}</TableCell>
                      <TableCell className="font-mono text-sm">{rule.hit_count}</TableCell>
                      <TableCell>
                        <Button variant="ghost" size="sm" className="text-destructive" onClick={() => deleteIpRule(rule.id)}>
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        {/* RATE LIMITING */}
        <TabsContent value="ratelimit">
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle className="text-sm flex items-center gap-2"><Timer className="h-4 w-4" /> Rate Limiting</CardTitle>
                <Button size="sm" onClick={() => setRlDialogOpen(true)}><Plus className="h-4 w-4 mr-1" /> Rate Limit</Button>
              </div>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>URL-Pattern</TableHead>
                    <TableHead>Limit</TableHead>
                    <TableHead>Aktion</TableHead>
                    <TableHead>Domain</TableHead>
                    <TableHead>Ausgelöst</TableHead>
                    <TableHead>Aktionen</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rateLimits.filter(r => selectedDomain === 'all' || r.domain_id === selectedDomain).length === 0 ? (
                    <TableRow><TableCell colSpan={6} className="text-center text-muted-foreground py-6">Keine Rate Limits</TableCell></TableRow>
                  ) : rateLimits.filter(r => selectedDomain === 'all' || r.domain_id === selectedDomain).map(rl => (
                    <TableRow key={rl.id}>
                      <TableCell className="font-mono text-sm">{rl.url_pattern}</TableCell>
                      <TableCell className="text-sm">{rl.requests_per_period} / {rl.period_seconds}s</TableCell>
                      <TableCell><Badge variant="outline">{rl.action}</Badge></TableCell>
                      <TableCell className="text-sm">{getDomainName(rl.domain_id)}</TableCell>
                      <TableCell className="font-mono">{rl.triggered_count}</TableCell>
                      <TableCell>
                        <Button variant="ghost" size="sm" className="text-destructive" onClick={() => deleteRateLimit(rl.id)}>
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        {/* BOT MANAGEMENT */}
        <TabsContent value="bots">
          <Card>
            <CardHeader>
              <CardTitle className="text-sm flex items-center gap-2"><Bot className="h-4 w-4" /> Bot-Management</CardTitle>
            </CardHeader>
            <CardContent>
              {selectedDomain === 'all' ? (
                <p className="text-center text-muted-foreground py-6">Domain auswählen</p>
              ) : !botConfig ? (
                <div className="text-center py-6">
                  <p className="text-muted-foreground mb-3">Bot-Management nicht konfiguriert</p>
                  <Button onClick={() => initBot(selectedDomain)}><Bot className="h-4 w-4 mr-2" /> Aktivieren</Button>
                </div>
              ) : (
                <div className="space-y-4">
                  {[
                    { key: 'bot_fight_mode', label: 'Bot Fight Mode', desc: 'Automatisch Bots erkennen und blockieren' },
                    { key: 'super_bot_fight_mode', label: 'Super Bot Fight Mode', desc: 'Erweiterte Bot-Erkennung mit ML' },
                    { key: 'javascript_detection', label: 'JavaScript-Erkennung', desc: 'Bots durch JS-Challenge identifizieren' },
                    { key: 'verified_bots_allowed', label: 'Verifizierte Bots erlauben', desc: 'Googlebot, Bingbot etc. durchlassen' },
                    { key: 'static_resource_protection', label: 'Statische Ressourcen schützen', desc: 'Auch CSS/JS/Bilder prüfen' },
                  ].map(({ key, label, desc }) => (
                    <div key={key} className="flex items-center justify-between">
                      <div><Label>{label}</Label><p className="text-xs text-muted-foreground">{desc}</p></div>
                      <Switch checked={Boolean((botConfig as unknown as Record<string, unknown>)[key])} onCheckedChange={c => updateBot(botConfig.id, key, c)} />
                    </div>
                  ))}
                  <div>
                    <Label>KI-Bots Aktion</Label>
                    <Select value={botConfig.ai_bots_action} onValueChange={v => updateBot(botConfig.id, 'ai_bots_action', v)}>
                      <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="allow">Erlauben</SelectItem>
                        <SelectItem value="block">Blockieren</SelectItem>
                        <SelectItem value="challenge">Challenge</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* DDOS PROTECTION */}
        <TabsContent value="ddos">
          <Card>
            <CardHeader>
              <CardTitle className="text-sm flex items-center gap-2"><ShieldCheck className="h-4 w-4 text-blue-500" /> DDoS-Schutz</CardTitle>
            </CardHeader>
            <CardContent>
              {selectedDomain === 'all' ? (
                <p className="text-center text-muted-foreground py-6">Domain auswählen</p>
              ) : !ddosConfig ? (
                <div className="text-center py-6">
                  <p className="text-muted-foreground mb-3">DDoS-Schutz nicht konfiguriert</p>
                  <Button onClick={() => initDdos(selectedDomain)}><ShieldCheck className="h-4 w-4 mr-2" /> Aktivieren</Button>
                </div>
              ) : (
                <div className="space-y-4">
                  {/* Under Attack Mode */}
                  <div className="border rounded-lg p-4 border-red-500/30 bg-red-500/5">
                    <div className="flex items-center justify-between">
                      <div>
                        <Label className="text-red-600 font-semibold">I'm Under Attack™ Modus</Label>
                        <p className="text-xs text-muted-foreground">Zeigt allen Besuchern eine JS-Challenge — nur bei aktivem Angriff aktivieren!</p>
                      </div>
                      <Switch checked={ddosConfig.under_attack_mode} onCheckedChange={c => updateDdos(ddosConfig.id, 'under_attack_mode', c)} />
                    </div>
                  </div>

                  <div>
                    <Label className="font-semibold">Empfindlichkeit</Label>
                    <Select value={ddosConfig.sensitivity_level} onValueChange={v => updateDdos(ddosConfig.id, 'sensitivity_level', v)}>
                      <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="low">Niedrig</SelectItem>
                        <SelectItem value="medium">Mittel (empfohlen)</SelectItem>
                        <SelectItem value="high">Hoch</SelectItem>
                        <SelectItem value="under_attack">Unter Angriff</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="border rounded-lg p-4 space-y-4">
                    <h4 className="font-semibold text-sm">Schutzebenen</h4>
                    {[
                      { key: 'layer7_protection', label: 'Layer 7 (HTTP/HTTPS)', desc: 'Anwendungsschicht-Schutz' },
                      { key: 'layer3_4_protection', label: 'Layer 3/4 (Netzwerk)', desc: 'Netzwerk- und Transport-Schutz' },
                      { key: 'syn_flood_protection', label: 'SYN Flood Schutz', desc: 'TCP SYN Flood-Angriffe abwehren' },
                      { key: 'udp_flood_protection', label: 'UDP Flood Schutz', desc: 'UDP Flood-Angriffe abwehren' },
                      { key: 'dns_amplification_protection', label: 'DNS Amplification Schutz', desc: 'DNS-Verstärkungsangriffe blockieren' },
                      { key: 'slowloris_protection', label: 'Slowloris Schutz', desc: 'Langsame HTTP-Verbindungen erkennen' },
                      { key: 'auto_mitigation', label: 'Automatische Abschwächung', desc: 'Angriffe automatisch abwehren' },
                      { key: 'alert_on_attack', label: 'Alarm bei Angriff', desc: 'Benachrichtigung bei erkanntem DDoS' },
                    ].map(({ key, label, desc }) => (
                      <div key={key} className="flex items-center justify-between">
                        <div><Label>{label}</Label><p className="text-xs text-muted-foreground">{desc}</p></div>
                        <Switch checked={Boolean((ddosConfig as unknown as Record<string, unknown>)[key])} onCheckedChange={c => updateDdos(ddosConfig.id, key, c)} />
                      </div>
                    ))}
                  </div>

                  <div>
                    <Label className="font-semibold">HTTP Flood Schwellenwert (Req/s)</Label>
                    <Input type="number" className="mt-1" value={ddosConfig.http_flood_threshold}
                      onChange={e => updateDdos(ddosConfig.id, 'http_flood_threshold', Number(e.target.value))} />
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* IP Rule Dialog */}
      <Dialog open={ipDialogOpen} onOpenChange={setIpDialogOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>IP-Regel erstellen</DialogTitle></DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid gap-2">
              <Label>IP-Adresse / CIDR *</Label>
              <Input placeholder="192.168.1.0/24" value={ipForm.ip_address} onChange={e => setIpForm(f => ({ ...f, ip_address: e.target.value }))} />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="grid gap-2">
                <Label>Aktion</Label>
                <Select value={ipForm.action} onValueChange={v => setIpForm(f => ({ ...f, action: v }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="block">Blockieren</SelectItem>
                    <SelectItem value="allow">Erlauben (Whitelist)</SelectItem>
                    <SelectItem value="challenge">Challenge</SelectItem>
                    <SelectItem value="js_challenge">JS Challenge</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="grid gap-2">
                <Label>Domain</Label>
                <Select value={ipForm.domain_id} onValueChange={v => setIpForm(f => ({ ...f, domain_id: v }))}>
                  <SelectTrigger><SelectValue placeholder="Global" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Global</SelectItem>
                    {domains.map(d => <SelectItem key={d.id} value={d.id}>{d.domain}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid gap-2">
              <Label>Notiz</Label>
              <Input placeholder="Grund für die Regel" value={ipForm.note} onChange={e => setIpForm(f => ({ ...f, note: e.target.value }))} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIpDialogOpen(false)}>Abbrechen</Button>
            <Button onClick={addIpRule}><Plus className="h-4 w-4 mr-1" /> Erstellen</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Rate Limit Dialog */}
      <Dialog open={rlDialogOpen} onOpenChange={setRlDialogOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Rate Limit erstellen</DialogTitle></DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid gap-2">
              <Label>Domain *</Label>
              <Select value={rlForm.domain_id} onValueChange={v => setRlForm(f => ({ ...f, domain_id: v }))}>
                <SelectTrigger><SelectValue placeholder="Domain wählen..." /></SelectTrigger>
                <SelectContent>
                  {domains.map(d => <SelectItem key={d.id} value={d.id}>{d.domain}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-2">
              <Label>URL-Pattern</Label>
              <Input value={rlForm.url_pattern} onChange={e => setRlForm(f => ({ ...f, url_pattern: e.target.value }))} placeholder="* oder /api/*" />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="grid gap-2">
                <Label>Max. Anfragen</Label>
                <Input type="number" value={rlForm.requests_per_period} onChange={e => setRlForm(f => ({ ...f, requests_per_period: Number(e.target.value) }))} />
              </div>
              <div className="grid gap-2">
                <Label>Zeitraum (Sekunden)</Label>
                <Input type="number" value={rlForm.period_seconds} onChange={e => setRlForm(f => ({ ...f, period_seconds: Number(e.target.value) }))} />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="grid gap-2">
                <Label>Aktion</Label>
                <Select value={rlForm.action} onValueChange={v => setRlForm(f => ({ ...f, action: v }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="block">Blockieren</SelectItem>
                    <SelectItem value="challenge">Challenge</SelectItem>
                    <SelectItem value="simulate">Simulieren (nur loggen)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="grid gap-2">
                <Label>Timeout (Sek)</Label>
                <Input type="number" value={rlForm.action_timeout} onChange={e => setRlForm(f => ({ ...f, action_timeout: Number(e.target.value) }))} />
              </div>
            </div>
            <div className="grid gap-2">
              <Label>Beschreibung</Label>
              <Input value={rlForm.description} onChange={e => setRlForm(f => ({ ...f, description: e.target.value }))} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRlDialogOpen(false)}>Abbrechen</Button>
            <Button onClick={addRateLimit}><Plus className="h-4 w-4 mr-1" /> Erstellen</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
