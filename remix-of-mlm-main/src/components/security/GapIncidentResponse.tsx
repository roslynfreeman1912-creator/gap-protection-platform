import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { securityApi } from '@/lib/securityApi';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { useToast } from '@/hooks/use-toast';
import { Plus, Loader2, AlertTriangle, Shield, Clock, CheckCircle, XCircle, Search } from 'lucide-react';
import { format } from 'date-fns';
import { de } from 'date-fns/locale';

interface Incident {
  id: string;
  title: string;
  description: string | null;
  severity: string;
  status: string;
  category: string;
  source: string | null;
  mitre_tactic: string | null;
  mitre_technique: string | null;
  source_ip: string | null;
  priority: number;
  assigned_to: string | null;
  reported_by: string | null;
  resolution_notes: string | null;
  resolved_at: string | null;
  sla_breach: boolean;
  created_at: string;
}

interface Props {
  domains: { id: string; domain: string }[];
}

export function GapIncidentResponse({ domains }: Props) {
  const { toast } = useToast();
  const [incidents, setIncidents] = useState<Incident[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [filter, setFilter] = useState('all');
  const [search, setSearch] = useState('');
  const [form, setForm] = useState({
    title: '', description: '', severity: 'medium', category: 'general',
    mitre_tactic: '', mitre_technique: '', source_ip: '', priority: 3,
    affected_domain_id: ''
  });

  const fetchIncidents = async () => {
    setLoading(true);
    const { data } = await supabase.from('security_incidents').select('*').order('created_at', { ascending: false });
    setIncidents((data || []) as Incident[]);
    setLoading(false);
  };

  useEffect(() => { fetchIncidents(); }, []);

  const handleCreate = async () => {
    if (!form.title) { toast({ variant: 'destructive', title: 'Titel ist Pflichtfeld' }); return; }
    setSaving(true);
    try {
      await securityApi.insert('security_incidents', {
        title: form.title, description: form.description || null,
        severity: form.severity, category: form.category,
        mitre_tactic: form.mitre_tactic || null, mitre_technique: form.mitre_technique || null,
        source_ip: form.source_ip || null, priority: form.priority,
        affected_domain_id: form.affected_domain_id || null,
      });
      toast({ title: '✓ Vorfall erstellt' });
      setDialogOpen(false);
      setForm({ title: '', description: '', severity: 'medium', category: 'general', mitre_tactic: '', mitre_technique: '', source_ip: '', priority: 3, affected_domain_id: '' });
      fetchIncidents();
    } catch (error: any) {
      toast({ variant: 'destructive', title: 'Fehler', description: error.message });
    }
    setSaving(false);
  };

  const updateStatus = async (id: string, status: string) => {
    const update: Record<string, unknown> = { status };
    if (status === 'resolved') update.resolved_at = new Date().toISOString();
    await securityApi.update('security_incidents', id, update);
    fetchIncidents();
  };

  const severityColor = (s: string) => {
    switch (s) {
      case 'critical': return 'bg-red-500/15 text-red-600 border-red-500/30';
      case 'high': return 'bg-orange-500/15 text-orange-600 border-orange-500/30';
      case 'medium': return 'bg-yellow-500/15 text-yellow-600 border-yellow-500/30';
      case 'low': return 'bg-green-500/15 text-green-600 border-green-500/30';
      default: return 'bg-muted text-muted-foreground';
    }
  };

  const statusIcon = (s: string) => {
    switch (s) {
      case 'open': return <AlertTriangle className="h-4 w-4 text-red-500" />;
      case 'investigating': return <Search className="h-4 w-4 text-yellow-500" />;
      case 'contained': return <Shield className="h-4 w-4 text-blue-500" />;
      case 'resolved': return <CheckCircle className="h-4 w-4 text-green-500" />;
      case 'closed': return <XCircle className="h-4 w-4 text-muted-foreground" />;
      default: return <Clock className="h-4 w-4" />;
    }
  };

  const filtered = incidents.filter(i => {
    if (filter !== 'all' && i.status !== filter) return false;
    if (search && !i.title.toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  });

  const stats = {
    open: incidents.filter(i => i.status === 'open').length,
    investigating: incidents.filter(i => i.status === 'investigating').length,
    critical: incidents.filter(i => i.severity === 'critical' && i.status !== 'resolved' && i.status !== 'closed').length,
    resolved: incidents.filter(i => i.status === 'resolved').length,
  };

  return (
    <div className="space-y-4">
      {/* Stats */}
      <div className="grid grid-cols-4 gap-4">
        {[
          { label: 'Offen', value: stats.open, icon: AlertTriangle, color: 'text-red-500' },
          { label: 'In Untersuchung', value: stats.investigating, icon: Search, color: 'text-yellow-500' },
          { label: 'Kritisch', value: stats.critical, icon: Shield, color: 'text-red-600' },
          { label: 'Gelöst', value: stats.resolved, icon: CheckCircle, color: 'text-green-500' },
        ].map(({ label, value, icon: Icon, color }) => (
          <Card key={label}>
            <CardContent className="pt-4 pb-3">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs text-muted-foreground">{label}</p>
                  <p className="text-2xl font-bold">{value}</p>
                </div>
                <Icon className={`h-8 w-8 opacity-50 ${color}`} />
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                <AlertTriangle className="h-5 w-5 text-red-500" />
                Incident Response Center
              </CardTitle>
              <CardDescription>Sicherheitsvorfälle verwalten und verfolgen</CardDescription>
            </div>
            <div className="flex gap-2">
              <Input placeholder="Suchen..." value={search} onChange={e => setSearch(e.target.value)} className="w-[200px]" />
              <Select value={filter} onValueChange={setFilter}>
                <SelectTrigger className="w-[150px]"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Alle Status</SelectItem>
                  <SelectItem value="open">Offen</SelectItem>
                  <SelectItem value="investigating">In Untersuchung</SelectItem>
                  <SelectItem value="contained">Eingedämmt</SelectItem>
                  <SelectItem value="resolved">Gelöst</SelectItem>
                  <SelectItem value="closed">Geschlossen</SelectItem>
                </SelectContent>
              </Select>
              <Button onClick={() => setDialogOpen(true)}><Plus className="h-4 w-4 mr-2" /> Vorfall melden</Button>
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
                  <TableHead>Priorität</TableHead>
                  <TableHead>Schwere</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Titel</TableHead>
                  <TableHead>Kategorie</TableHead>
                  <TableHead>MITRE ATT&CK</TableHead>
                  <TableHead>Quell-IP</TableHead>
                  <TableHead>Erstellt</TableHead>
                  <TableHead>Aktionen</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.length === 0 ? (
                  <TableRow><TableCell colSpan={9} className="text-center text-muted-foreground py-8">Keine Vorfälle</TableCell></TableRow>
                ) : filtered.map(inc => (
                  <TableRow key={inc.id}>
                    <TableCell><Badge variant="outline">P{inc.priority}</Badge></TableCell>
                    <TableCell><Badge className={severityColor(inc.severity)}>{inc.severity.toUpperCase()}</Badge></TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1">{statusIcon(inc.status)}<span className="text-sm">{inc.status}</span></div>
                    </TableCell>
                    <TableCell className="font-medium max-w-[200px] truncate">{inc.title}</TableCell>
                    <TableCell className="text-sm">{inc.category}</TableCell>
                    <TableCell className="text-xs font-mono">{inc.mitre_technique || '—'}</TableCell>
                    <TableCell className="text-xs font-mono">{inc.source_ip || '—'}</TableCell>
                    <TableCell className="text-sm">{format(new Date(inc.created_at), 'dd.MM.yy HH:mm', { locale: de })}</TableCell>
                    <TableCell>
                      <Select value={inc.status} onValueChange={v => updateStatus(inc.id, v)}>
                        <SelectTrigger className="h-8 w-[130px]"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="open">Offen</SelectItem>
                          <SelectItem value="investigating">Untersuchen</SelectItem>
                          <SelectItem value="contained">Eingedämmt</SelectItem>
                          <SelectItem value="resolved">Gelöst</SelectItem>
                          <SelectItem value="closed">Geschlossen</SelectItem>
                        </SelectContent>
                      </Select>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Create Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-[600px]">
          <DialogHeader><DialogTitle>Sicherheitsvorfall melden</DialogTitle></DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid gap-2">
              <Label>Titel *</Label>
              <Input value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))} placeholder="Kurzbeschreibung des Vorfalls" />
            </div>
            <div className="grid gap-2">
              <Label>Beschreibung</Label>
              <Textarea value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} placeholder="Detaillierte Beschreibung..." rows={3} />
            </div>
            <div className="grid grid-cols-3 gap-4">
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
              <div className="grid gap-2">
                <Label>Kategorie</Label>
                <Select value={form.category} onValueChange={v => setForm(f => ({ ...f, category: v }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="malware">Malware</SelectItem>
                    <SelectItem value="phishing">Phishing</SelectItem>
                    <SelectItem value="ddos">DDoS</SelectItem>
                    <SelectItem value="data_breach">Datenleck</SelectItem>
                    <SelectItem value="unauthorized_access">Unbefugter Zugriff</SelectItem>
                    <SelectItem value="insider_threat">Insider-Bedrohung</SelectItem>
                    <SelectItem value="ransomware">Ransomware</SelectItem>
                    <SelectItem value="general">Allgemein</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="grid gap-2">
                <Label>Priorität</Label>
                <Select value={String(form.priority)} onValueChange={v => setForm(f => ({ ...f, priority: Number(v) }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="1">P1 — Kritisch</SelectItem>
                    <SelectItem value="2">P2 — Hoch</SelectItem>
                    <SelectItem value="3">P3 — Mittel</SelectItem>
                    <SelectItem value="4">P4 — Niedrig</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="grid gap-2">
                <Label>MITRE Taktik</Label>
                <Select value={form.mitre_tactic} onValueChange={v => setForm(f => ({ ...f, mitre_tactic: v }))}>
                  <SelectTrigger><SelectValue placeholder="Wählen..." /></SelectTrigger>
                  <SelectContent>
                    {['Initial Access','Execution','Persistence','Privilege Escalation','Defense Evasion','Credential Access','Discovery','Lateral Movement','Collection','Exfiltration','Command and Control','Impact'].map(t => (
                      <SelectItem key={t} value={t}>{t}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="grid gap-2">
                <Label>MITRE Technik-ID</Label>
                <Input value={form.mitre_technique} onChange={e => setForm(f => ({ ...f, mitre_technique: e.target.value }))} placeholder="z.B. T1566.001" />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="grid gap-2">
                <Label>Quell-IP</Label>
                <Input value={form.source_ip} onChange={e => setForm(f => ({ ...f, source_ip: e.target.value }))} placeholder="IP des Angreifers" />
              </div>
              <div className="grid gap-2">
                <Label>Betroffene Domain</Label>
                <Select value={form.affected_domain_id} onValueChange={v => setForm(f => ({ ...f, affected_domain_id: v }))}>
                  <SelectTrigger><SelectValue placeholder="Optional..." /></SelectTrigger>
                  <SelectContent>
                    {domains.map(d => <SelectItem key={d.id} value={d.id}>{d.domain}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Abbrechen</Button>
            <Button onClick={handleCreate} disabled={saving}>
              {saving ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Plus className="h-4 w-4 mr-2" />}
              Vorfall erstellen
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
