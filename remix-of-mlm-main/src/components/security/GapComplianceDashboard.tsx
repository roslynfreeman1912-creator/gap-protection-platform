import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { securityApi } from '@/lib/securityApi';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Progress } from '@/components/ui/progress';
import { useToast } from '@/hooks/use-toast';
import { Loader2, FileText, CheckCircle, XCircle, AlertTriangle, Clock, Plus } from 'lucide-react';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';

interface ComplianceCheck {
  id: string; framework: string; control_id: string; control_name: string;
  category: string | null; description: string | null; status: string;
  evidence: string | null; risk_level: string; automated: boolean;
  last_assessed_at: string | null; next_review_at: string | null; notes: string | null;
}

const FRAMEWORKS = ['ISO27001', 'GDPR', 'SOC2', 'NIST', 'PCI-DSS', 'BSI-Grundschutz'];

const DEFAULT_CONTROLS: Record<string, { id: string; name: string; category: string }[]> = {
  ISO27001: [
    { id: 'A.5.1', name: 'Informationssicherheitsrichtlinien', category: 'Organisatorisch' },
    { id: 'A.6.1', name: 'Organisation der Informationssicherheit', category: 'Organisatorisch' },
    { id: 'A.7.1', name: 'Personalsicherheit', category: 'Personal' },
    { id: 'A.8.1', name: 'Asset-Management', category: 'Vermögenswerte' },
    { id: 'A.9.1', name: 'Zugriffskontrolle', category: 'Zugriff' },
    { id: 'A.10.1', name: 'Kryptographie', category: 'Kryptographie' },
    { id: 'A.11.1', name: 'Physische Sicherheit', category: 'Physisch' },
    { id: 'A.12.1', name: 'Betriebssicherheit', category: 'Betrieb' },
    { id: 'A.13.1', name: 'Kommunikationssicherheit', category: 'Netzwerk' },
    { id: 'A.14.1', name: 'Systementwicklung', category: 'Entwicklung' },
    { id: 'A.15.1', name: 'Lieferantenbeziehungen', category: 'Lieferanten' },
    { id: 'A.16.1', name: 'Vorfallmanagement', category: 'Vorfälle' },
    { id: 'A.17.1', name: 'Business Continuity', category: 'Kontinuität' },
    { id: 'A.18.1', name: 'Compliance', category: 'Recht' },
  ],
  GDPR: [
    { id: 'Art.5', name: 'Datenverarbeitungsgrundsätze', category: 'Grundsätze' },
    { id: 'Art.6', name: 'Rechtmäßigkeit der Verarbeitung', category: 'Rechtmäßigkeit' },
    { id: 'Art.7', name: 'Einwilligung', category: 'Einwilligung' },
    { id: 'Art.13', name: 'Informationspflichten', category: 'Transparenz' },
    { id: 'Art.15', name: 'Auskunftsrecht', category: 'Betroffenenrechte' },
    { id: 'Art.17', name: 'Recht auf Löschung', category: 'Betroffenenrechte' },
    { id: 'Art.25', name: 'Privacy by Design', category: 'Technik' },
    { id: 'Art.30', name: 'Verarbeitungsverzeichnis', category: 'Dokumentation' },
    { id: 'Art.32', name: 'Sicherheit der Verarbeitung', category: 'Sicherheit' },
    { id: 'Art.33', name: 'Meldepflicht bei Datenpannen', category: 'Vorfälle' },
    { id: 'Art.35', name: 'Datenschutz-Folgenabschätzung', category: 'Risiko' },
    { id: 'Art.37', name: 'Datenschutzbeauftragter', category: 'Organisation' },
  ],
};

export function GapComplianceDashboard() {
  const { toast } = useToast();
  const [checks, setChecks] = useState<ComplianceCheck[]>([]);
  const [loading, setLoading] = useState(true);
  const [framework, setFramework] = useState('ISO27001');
  const [dialogOpen, setDialogOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({ control_id: '', control_name: '', category: '', description: '', risk_level: 'medium' });

  const fetchChecks = useCallback(async () => {
    setLoading(true);
    const { data } = await supabase.from('compliance_checks').select('*').eq('framework', framework).order('control_id');
    setChecks((data || []) as ComplianceCheck[]);
    setLoading(false);
  }, [framework]);

  useEffect(() => { fetchChecks(); }, [fetchChecks]);

  const initFramework = async (fw: string) => {
    const controls = DEFAULT_CONTROLS[fw];
    if (!controls) { toast({ variant: 'destructive', title: 'Keine Standardkontrollen verfügbar' }); return; }
    const inserts = controls.map(c => ({
      framework: fw, control_id: c.id, control_name: c.name, category: c.category, status: 'not_assessed'
    }));
    await securityApi.batchInsert('compliance_checks', inserts);
    toast({ title: `✓ ${controls.length} Kontrollen initialisiert` });
    fetchChecks();
  };

  const updateStatus = async (id: string, status: string) => {
    await securityApi.update('compliance_checks', id, { status, last_assessed_at: new Date().toISOString() });
    fetchChecks();
  };

  const handleAdd = async () => {
    if (!form.control_id || !form.control_name) return;
    setSaving(true);
    await securityApi.insert('compliance_checks', {
      framework, control_id: form.control_id, control_name: form.control_name,
      category: form.category || null, description: form.description || null, risk_level: form.risk_level
    });
    setDialogOpen(false);
    fetchChecks();
    setSaving(false);
  };

  const statusColor = (s: string) => {
    switch (s) {
      case 'compliant': return 'bg-green-500/15 text-green-600';
      case 'partial': return 'bg-yellow-500/15 text-yellow-600';
      case 'non_compliant': return 'bg-red-500/15 text-red-600';
      default: return 'bg-muted text-muted-foreground';
    }
  };

  const statusIcon = (s: string) => {
    switch (s) {
      case 'compliant': return <CheckCircle className="h-4 w-4 text-green-500" />;
      case 'partial': return <AlertTriangle className="h-4 w-4 text-yellow-500" />;
      case 'non_compliant': return <XCircle className="h-4 w-4 text-red-500" />;
      default: return <Clock className="h-4 w-4 text-muted-foreground" />;
    }
  };

  const compliant = checks.filter(c => c.status === 'compliant').length;
  const partial = checks.filter(c => c.status === 'partial').length;
  const nonCompliant = checks.filter(c => c.status === 'non_compliant').length;
  const score = checks.length > 0 ? Math.round(((compliant + partial * 0.5) / checks.length) * 100) : 0;

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-5 gap-4">
        <Card><CardContent className="pt-4 pb-3 text-center"><p className="text-xs text-muted-foreground">Compliance-Score</p><p className="text-2xl font-bold text-primary">{score}%</p><Progress value={score} className="mt-2" /></CardContent></Card>
        <Card><CardContent className="pt-4 pb-3 text-center"><p className="text-xs text-muted-foreground">Kontrollen</p><p className="text-2xl font-bold">{checks.length}</p></CardContent></Card>
        <Card><CardContent className="pt-4 pb-3 text-center"><p className="text-xs text-green-500">Konform</p><p className="text-2xl font-bold text-green-500">{compliant}</p></CardContent></Card>
        <Card><CardContent className="pt-4 pb-3 text-center"><p className="text-xs text-yellow-500">Teilweise</p><p className="text-2xl font-bold text-yellow-500">{partial}</p></CardContent></Card>
        <Card><CardContent className="pt-4 pb-3 text-center"><p className="text-xs text-red-500">Nicht konform</p><p className="text-2xl font-bold text-red-500">{nonCompliant}</p></CardContent></Card>
      </div>

      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2"><FileText className="h-5 w-5 text-primary" /> Compliance & Audit</CardTitle>
              <CardDescription>Regulatorische Compliance-Prüfungen — ISO 27001, GDPR, BSI</CardDescription>
            </div>
            <div className="flex gap-2">
              <Select value={framework} onValueChange={setFramework}>
                <SelectTrigger className="w-[180px]"><SelectValue /></SelectTrigger>
                <SelectContent>{FRAMEWORKS.map(f => <SelectItem key={f} value={f}>{f}</SelectItem>)}</SelectContent>
              </Select>
              {checks.length === 0 && DEFAULT_CONTROLS[framework] && (
                <Button variant="outline" onClick={() => initFramework(framework)}>Standardkontrollen laden</Button>
              )}
              <Button onClick={() => setDialogOpen(true)}><Plus className="h-4 w-4 mr-2" /> Kontrolle</Button>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {loading ? <div className="flex justify-center py-8"><Loader2 className="h-6 w-6 animate-spin" /></div> : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Kontrolle</TableHead><TableHead>Name</TableHead><TableHead>Kategorie</TableHead>
                  <TableHead>Status</TableHead><TableHead>Risiko</TableHead><TableHead>Aktionen</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {checks.length === 0 ? (
                  <TableRow><TableCell colSpan={6} className="text-center text-muted-foreground py-8">Keine Kontrollen — Laden Sie Standardkontrollen</TableCell></TableRow>
                ) : checks.map(c => (
                  <TableRow key={c.id}>
                    <TableCell className="font-mono text-sm font-bold">{c.control_id}</TableCell>
                    <TableCell className="text-sm">{c.control_name}</TableCell>
                    <TableCell><Badge variant="outline" className="text-xs">{c.category || '—'}</Badge></TableCell>
                    <TableCell><div className="flex items-center gap-1">{statusIcon(c.status)}<Badge className={statusColor(c.status)}>{c.status === 'compliant' ? 'Konform' : c.status === 'partial' ? 'Teilweise' : c.status === 'non_compliant' ? 'Nicht konform' : 'Nicht bewertet'}</Badge></div></TableCell>
                    <TableCell><Badge variant="outline" className={c.risk_level === 'high' ? 'text-red-500' : c.risk_level === 'medium' ? 'text-yellow-500' : 'text-green-500'}>{c.risk_level}</Badge></TableCell>
                    <TableCell>
                      <Select value={c.status} onValueChange={v => updateStatus(c.id, v)}>
                        <SelectTrigger className="h-7 w-[130px] text-xs"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="not_assessed">Nicht bewertet</SelectItem>
                          <SelectItem value="compliant">Konform</SelectItem>
                          <SelectItem value="partial">Teilweise</SelectItem>
                          <SelectItem value="non_compliant">Nicht konform</SelectItem>
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

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Kontrolle hinzufügen</DialogTitle></DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="grid gap-2"><Label>Kontrolle-ID *</Label><Input value={form.control_id} onChange={e => setForm(f => ({ ...f, control_id: e.target.value }))} placeholder="A.5.1" /></div>
              <div className="grid gap-2"><Label>Kategorie</Label><Input value={form.category} onChange={e => setForm(f => ({ ...f, category: e.target.value }))} /></div>
            </div>
            <div className="grid gap-2"><Label>Name *</Label><Input value={form.control_name} onChange={e => setForm(f => ({ ...f, control_name: e.target.value }))} /></div>
            <div className="grid gap-2"><Label>Beschreibung</Label><Textarea value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} rows={2} /></div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Abbrechen</Button>
            <Button onClick={handleAdd} disabled={saving}>{saving ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}Erstellen</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
