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
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { useToast } from '@/hooks/use-toast';
import { Plus, Trash2, Loader2, Globe, Shield, Edit } from 'lucide-react';

interface DnsRecord {
  id: string;
  domain_id: string;
  record_type: string;
  name: string;
  content: string;
  ttl: number;
  proxied: boolean;
  priority: number | null;
  is_active: boolean;
}

interface Props {
  domains: { id: string; domain: string }[];
}

export function GapDnsManager({ domains }: Props) {
  const { toast } = useToast();
  const [records, setRecords] = useState<DnsRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [selectedDomain, setSelectedDomain] = useState('all');
  const [form, setForm] = useState({
    domain_id: '', record_type: 'A', name: '@', content: '', ttl: 3600, proxied: true, priority: 0
  });

  const fetchRecords = async () => {
    setLoading(true);
    const { data } = await supabase.from('dns_records').select('*').order('name');
    setRecords((data || []) as DnsRecord[]);
    setLoading(false);
  };

  useEffect(() => { fetchRecords(); }, []);

  const handleAdd = async () => {
    if (!form.domain_id || !form.content) {
      toast({ variant: 'destructive', title: 'Fehler', description: 'Domain und Inhalt sind Pflichtfelder' });
      return;
    }
    setSaving(true);
    try {
      await securityApi.insert('dns_records', {
        domain_id: form.domain_id,
        record_type: form.record_type,
        name: form.name,
        content: form.content,
        ttl: form.ttl,
        proxied: form.proxied,
        priority: form.record_type === 'MX' ? form.priority : null,
      });
      toast({ title: '✓ DNS-Eintrag erstellt' });
      setDialogOpen(false);
      setForm({ domain_id: '', record_type: 'A', name: '@', content: '', ttl: 3600, proxied: true, priority: 0 });
      fetchRecords();
    } catch (error: any) {
      toast({ variant: 'destructive', title: 'Fehler', description: error.message });
    }
    setSaving(false);
  };

  const handleDelete = async (id: string) => {
    if (!confirm('DNS-Eintrag wirklich löschen?')) return;
    await securityApi.delete('dns_records', id);
    fetchRecords();
  };

  const toggleProxy = async (id: string, proxied: boolean) => {
    await securityApi.update('dns_records', id, { proxied: !proxied });
    fetchRecords();
  };

  const getDomainName = (id: string) => domains.find(d => d.id === id)?.domain || id;

  const filtered = selectedDomain && selectedDomain !== 'all' ? records.filter(r => r.domain_id === selectedDomain) : records;

  const typeColor = (type: string) => {
    switch (type) {
      case 'A': return 'bg-orange-500/15 text-orange-600 border-orange-500/30';
      case 'AAAA': return 'bg-purple-500/15 text-purple-600 border-purple-500/30';
      case 'CNAME': return 'bg-blue-500/15 text-blue-600 border-blue-500/30';
      case 'MX': return 'bg-green-500/15 text-green-600 border-green-500/30';
      case 'TXT': return 'bg-yellow-500/15 text-yellow-600 border-yellow-500/30';
      case 'NS': return 'bg-cyan-500/15 text-cyan-600 border-cyan-500/30';
      case 'SRV': return 'bg-pink-500/15 text-pink-600 border-pink-500/30';
      default: return 'bg-muted text-muted-foreground';
    }
  };

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                <Globe className="h-5 w-5 text-primary" />
                DNS-Verwaltung
              </CardTitle>
              <CardDescription>DNS-Einträge verwalten — GAP Protection DNS</CardDescription>
            </div>
            <div className="flex gap-2">
              <Select value={selectedDomain} onValueChange={setSelectedDomain}>
                <SelectTrigger className="w-[200px]">
                  <SelectValue placeholder="Alle Domains" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Alle Domains</SelectItem>
                  {domains.map(d => (
                    <SelectItem key={d.id} value={d.id}>{d.domain}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Button onClick={() => setDialogOpen(true)}>
                <Plus className="h-4 w-4 mr-2" /> DNS-Eintrag
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-6 w-6 animate-spin" />
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Typ</TableHead>
                  <TableHead>Name</TableHead>
                  <TableHead>Inhalt</TableHead>
                  <TableHead>TTL</TableHead>
                  <TableHead>Proxy</TableHead>
                  <TableHead>Domain</TableHead>
                  <TableHead>Aktionen</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={7} className="text-center text-muted-foreground py-8">
                      Keine DNS-Einträge vorhanden
                    </TableCell>
                  </TableRow>
                ) : filtered.map(rec => (
                  <TableRow key={rec.id}>
                    <TableCell>
                      <Badge className={typeColor(rec.record_type)}>{rec.record_type}</Badge>
                    </TableCell>
                    <TableCell className="font-mono text-sm">{rec.name}</TableCell>
                    <TableCell className="font-mono text-sm max-w-[300px] truncate">{rec.content}</TableCell>
                    <TableCell className="text-sm">{rec.ttl === 1 ? 'Auto' : `${rec.ttl}s`}</TableCell>
                    <TableCell>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => toggleProxy(rec.id, rec.proxied)}
                        className={rec.proxied ? 'text-orange-500' : 'text-muted-foreground'}
                      >
                        <Shield className="h-4 w-4" />
                        <span className="ml-1 text-xs">{rec.proxied ? 'Proxied' : 'DNS only'}</span>
                      </Button>
                    </TableCell>
                    <TableCell className="text-sm">{getDomainName(rec.domain_id)}</TableCell>
                    <TableCell>
                      <Button variant="ghost" size="sm" className="text-destructive" onClick={() => handleDelete(rec.id)}>
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
          <DialogHeader>
            <DialogTitle>Neuen DNS-Eintrag erstellen</DialogTitle>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid gap-2">
              <Label>Domain *</Label>
              <Select value={form.domain_id} onValueChange={v => setForm(f => ({ ...f, domain_id: v }))}>
                <SelectTrigger><SelectValue placeholder="Domain wählen..." /></SelectTrigger>
                <SelectContent>
                  {domains.map(d => <SelectItem key={d.id} value={d.id}>{d.domain}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="grid gap-2">
                <Label>Typ</Label>
                <Select value={form.record_type} onValueChange={v => setForm(f => ({ ...f, record_type: v }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {['A', 'AAAA', 'CNAME', 'MX', 'TXT', 'NS', 'SRV', 'CAA', 'PTR'].map(t => (
                      <SelectItem key={t} value={t}>{t}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="grid gap-2">
                <Label>Name</Label>
                <Input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="@ oder subdomain" />
              </div>
            </div>
            <div className="grid gap-2">
              <Label>Inhalt *</Label>
              <Input value={form.content} onChange={e => setForm(f => ({ ...f, content: e.target.value }))} placeholder="IP-Adresse oder Hostname" />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="grid gap-2">
                <Label>TTL</Label>
                <Select value={String(form.ttl)} onValueChange={v => setForm(f => ({ ...f, ttl: Number(v) }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="1">Auto</SelectItem>
                    <SelectItem value="60">1 Min</SelectItem>
                    <SelectItem value="300">5 Min</SelectItem>
                    <SelectItem value="3600">1 Std</SelectItem>
                    <SelectItem value="86400">1 Tag</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              {form.record_type === 'MX' && (
                <div className="grid gap-2">
                  <Label>Priorität</Label>
                  <Input type="number" value={form.priority} onChange={e => setForm(f => ({ ...f, priority: Number(e.target.value) }))} />
                </div>
              )}
            </div>
            <div className="flex items-center justify-between">
              <div>
                <Label>Proxy-Status</Label>
                <p className="text-xs text-muted-foreground">Traffic über GAP Protection leiten</p>
              </div>
              <Switch checked={form.proxied} onCheckedChange={c => setForm(f => ({ ...f, proxied: c }))} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Abbrechen</Button>
            <Button onClick={handleAdd} disabled={saving}>
              {saving ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Plus className="h-4 w-4 mr-2" />}
              Erstellen
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
