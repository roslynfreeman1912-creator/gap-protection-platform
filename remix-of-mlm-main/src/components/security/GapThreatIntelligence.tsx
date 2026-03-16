import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { useToast } from '@/hooks/use-toast';
import { Plus, Loader2, Trash2, Eye, Globe, Crosshair, Fingerprint, Database } from 'lucide-react';
import { format } from 'date-fns';
import { de } from 'date-fns/locale';

interface ThreatIntel {
  id: string;
  indicator_type: string;
  indicator_value: string;
  threat_type: string | null;
  confidence: number;
  severity: string;
  feed_source: string;
  description: string | null;
  tags: string[];
  first_seen: string;
  last_seen: string;
  is_active: boolean;
  hit_count: number;
  geo_location: Record<string, unknown> | null;
}

export function GapThreatIntelligence() {
  const { toast } = useToast();
  const [feeds, setFeeds] = useState<ThreatIntel[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [typeFilter, setTypeFilter] = useState('all');
  const [search, setSearch] = useState('');
  const [form, setForm] = useState({
    indicator_type: 'ip', indicator_value: '', threat_type: '', confidence: 75,
    severity: 'medium', feed_source: 'manual', description: ''
  });

  const fetchFeeds = async () => {
    setLoading(true);
    const { data } = await supabase.from('threat_intel_feeds').select('*').order('last_seen', { ascending: false }).limit(200);
    setFeeds((data || []) as ThreatIntel[]);
    setLoading(false);
  };

  useEffect(() => { fetchFeeds(); }, []);

  const handleAdd = async () => {
    if (!form.indicator_value) { toast({ variant: 'destructive', title: 'Indikator-Wert fehlt' }); return; }
    setSaving(true);
    const { error } = await supabase.from('threat_intel_feeds').insert({
      indicator_type: form.indicator_type, indicator_value: form.indicator_value,
      threat_type: form.threat_type || null, confidence: form.confidence,
      severity: form.severity, feed_source: form.feed_source,
      description: form.description || null,
    });
    if (!error) {
      toast({ title: '✓ IOC hinzugefügt' });
      setDialogOpen(false);
      setForm({ indicator_type: 'ip', indicator_value: '', threat_type: '', confidence: 75, severity: 'medium', feed_source: 'manual', description: '' });
      fetchFeeds();
    }
    setSaving(false);
  };

  const handleDelete = async (id: string) => {
    if (!confirm('IOC löschen?')) return;
    await supabase.from('threat_intel_feeds').delete().eq('id', id);
    fetchFeeds();
  };

  const typeIcon = (type: string) => {
    switch (type) {
      case 'ip': return <Globe className="h-4 w-4" />;
      case 'domain': return <Crosshair className="h-4 w-4" />;
      case 'hash': return <Fingerprint className="h-4 w-4" />;
      default: return <Database className="h-4 w-4" />;
    }
  };

  const severityColor = (s: string) => {
    switch (s) {
      case 'critical': return 'bg-red-500/15 text-red-600';
      case 'high': return 'bg-orange-500/15 text-orange-600';
      case 'medium': return 'bg-yellow-500/15 text-yellow-600';
      default: return 'bg-green-500/15 text-green-600';
    }
  };

  const filtered = feeds.filter(f => {
    if (typeFilter !== 'all' && f.indicator_type !== typeFilter) return false;
    if (search && !f.indicator_value.toLowerCase().includes(search.toLowerCase()) && 
        !(f.description || '').toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  });

  const stats = {
    total: feeds.length,
    ips: feeds.filter(f => f.indicator_type === 'ip').length,
    domains: feeds.filter(f => f.indicator_type === 'domain').length,
    hashes: feeds.filter(f => f.indicator_type === 'hash').length,
    critical: feeds.filter(f => f.severity === 'critical').length,
  };

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-5 gap-4">
        {[
          { label: 'Gesamt IOCs', value: stats.total, color: 'text-primary' },
          { label: 'IP-Adressen', value: stats.ips, color: 'text-blue-500' },
          { label: 'Domains', value: stats.domains, color: 'text-purple-500' },
          { label: 'Hashes', value: stats.hashes, color: 'text-orange-500' },
          { label: 'Kritisch', value: stats.critical, color: 'text-red-500' },
        ].map(({ label, value, color }) => (
          <Card key={label}>
            <CardContent className="pt-4 pb-3 text-center">
              <p className="text-xs text-muted-foreground">{label}</p>
              <p className={`text-2xl font-bold ${color}`}>{value}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2"><Eye className="h-5 w-5 text-primary" /> Threat Intelligence</CardTitle>
              <CardDescription>IOCs, Bedrohungsindikatoren & Kampagnen-Tracking</CardDescription>
            </div>
            <div className="flex gap-2">
              <Input placeholder="IOC suchen..." value={search} onChange={e => setSearch(e.target.value)} className="w-[200px]" />
              <Select value={typeFilter} onValueChange={setTypeFilter}>
                <SelectTrigger className="w-[130px]"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Alle Typen</SelectItem>
                  <SelectItem value="ip">IP</SelectItem>
                  <SelectItem value="domain">Domain</SelectItem>
                  <SelectItem value="hash">Hash</SelectItem>
                  <SelectItem value="url">URL</SelectItem>
                  <SelectItem value="email">E-Mail</SelectItem>
                  <SelectItem value="cve">CVE</SelectItem>
                </SelectContent>
              </Select>
              <Button onClick={() => setDialogOpen(true)}><Plus className="h-4 w-4 mr-2" /> IOC hinzufügen</Button>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex items-center justify-center py-8"><Loader2 className="h-6 w-6 animate-spin" /></div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Typ</TableHead>
                  <TableHead>Indikator</TableHead>
                  <TableHead>Bedrohung</TableHead>
                  <TableHead>Schwere</TableHead>
                  <TableHead>Vertrauen</TableHead>
                  <TableHead>Quelle</TableHead>
                  <TableHead>Treffer</TableHead>
                  <TableHead>Zuletzt gesehen</TableHead>
                  <TableHead>Aktionen</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.length === 0 ? (
                  <TableRow><TableCell colSpan={9} className="text-center text-muted-foreground py-8">Keine IOCs vorhanden</TableCell></TableRow>
                ) : filtered.slice(0, 50).map(feed => (
                  <TableRow key={feed.id}>
                    <TableCell><div className="flex items-center gap-1">{typeIcon(feed.indicator_type)}<Badge variant="outline" className="text-xs">{feed.indicator_type.toUpperCase()}</Badge></div></TableCell>
                    <TableCell className="font-mono text-sm max-w-[250px] truncate">{feed.indicator_value}</TableCell>
                    <TableCell className="text-sm">{feed.threat_type || '—'}</TableCell>
                    <TableCell><Badge className={severityColor(feed.severity)}>{feed.severity}</Badge></TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <div className="w-16 h-2 bg-muted rounded-full overflow-hidden">
                          <div className="h-full bg-primary rounded-full" style={{ width: `${feed.confidence}%` }} />
                        </div>
                        <span className="text-xs">{feed.confidence}%</span>
                      </div>
                    </TableCell>
                    <TableCell className="text-xs">{feed.feed_source}</TableCell>
                    <TableCell className="font-mono text-sm">{feed.hit_count}</TableCell>
                    <TableCell className="text-sm">{format(new Date(feed.last_seen), 'dd.MM.yy HH:mm', { locale: de })}</TableCell>
                    <TableCell>
                      <Button variant="ghost" size="sm" className="text-destructive" onClick={() => handleDelete(feed.id)}>
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-[500px]">
          <DialogHeader><DialogTitle>IOC / Bedrohungsindikator hinzufügen</DialogTitle></DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="grid gap-2">
                <Label>Typ</Label>
                <Select value={form.indicator_type} onValueChange={v => setForm(f => ({ ...f, indicator_type: v }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {['ip','domain','hash','url','email','cve','mutex','registry'].map(t => (
                      <SelectItem key={t} value={t}>{t.toUpperCase()}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="grid gap-2">
                <Label>Schweregrad</Label>
                <Select value={form.severity} onValueChange={v => setForm(f => ({ ...f, severity: v }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="critical">Kritisch</SelectItem>
                    <SelectItem value="high">Hoch</SelectItem>
                    <SelectItem value="medium">Mittel</SelectItem>
                    <SelectItem value="low">Niedrig</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid gap-2">
              <Label>Indikator-Wert *</Label>
              <Input value={form.indicator_value} onChange={e => setForm(f => ({ ...f, indicator_value: e.target.value }))} placeholder="z.B. 192.168.1.1 oder md5-hash" />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="grid gap-2">
                <Label>Bedrohungstyp</Label>
                <Select value={form.threat_type} onValueChange={v => setForm(f => ({ ...f, threat_type: v }))}>
                  <SelectTrigger><SelectValue placeholder="Wählen..." /></SelectTrigger>
                  <SelectContent>
                    {['malware','phishing','c2','botnet','ransomware','apt','scanner','spam','exploit','tor_exit'].map(t => (
                      <SelectItem key={t} value={t}>{t}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="grid gap-2">
                <Label>Vertrauenswert (%)</Label>
                <Input type="number" min={0} max={100} value={form.confidence} onChange={e => setForm(f => ({ ...f, confidence: Number(e.target.value) }))} />
              </div>
            </div>
            <div className="grid gap-2">
              <Label>Quelle</Label>
              <Select value={form.feed_source} onValueChange={v => setForm(f => ({ ...f, feed_source: v }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {['manual','alienvault','abuseipdb','virustotal','misp','internal','honeypot','osint'].map(s => (
                    <SelectItem key={s} value={s}>{s}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-2">
              <Label>Beschreibung</Label>
              <Input value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} placeholder="Optionale Details..." />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Abbrechen</Button>
            <Button onClick={handleAdd} disabled={saving}>
              {saving ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Plus className="h-4 w-4 mr-2" />}
              Hinzufügen
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
