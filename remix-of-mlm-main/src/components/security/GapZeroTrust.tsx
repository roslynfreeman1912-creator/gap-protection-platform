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
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { useToast } from '@/hooks/use-toast';
import { Plus, Loader2, Trash2, Fingerprint, Shield, Lock } from 'lucide-react';

interface ZeroTrustPolicy {
  id: string; name: string; description: string | null; policy_type: string;
  domain_id: string | null; action: string; require_mfa: boolean;
  require_device_posture: boolean; allowed_countries: string[];
  blocked_countries: string[]; session_duration: number;
  risk_score_threshold: number; is_active: boolean; priority: number; hit_count: number;
}

interface Props { domains: { id: string; domain: string }[] }

export function GapZeroTrust({ domains }: Props) {
  const { toast } = useToast();
  const [policies, setPolicies] = useState<ZeroTrustPolicy[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    name: '', description: '', policy_type: 'access', action: 'allow',
    require_mfa: false, require_device_posture: false, session_duration: 3600,
    risk_score_threshold: 70, domain_id: '', priority: 100
  });

  const fetchPolicies = async () => {
    setLoading(true);
    const { data } = await supabase.from('zero_trust_policies').select('*').order('priority');
    setPolicies((data || []) as ZeroTrustPolicy[]);
    setLoading(false);
  };

  useEffect(() => { fetchPolicies(); }, []);

  const handleAdd = async () => {
    if (!form.name) return;
    setSaving(true);
    try {
      await securityApi.insert('zero_trust_policies', {
        name: form.name, description: form.description || null, policy_type: form.policy_type,
        action: form.action, require_mfa: form.require_mfa,
        require_device_posture: form.require_device_posture, session_duration: form.session_duration,
        risk_score_threshold: form.risk_score_threshold,
        domain_id: form.domain_id || null, priority: form.priority,
      });
      toast({ title: '✓ Policy erstellt' }); setDialogOpen(false); fetchPolicies();
    } catch (err) {
      toast({ variant: 'destructive', title: 'Fehler beim Erstellen der Policy', description: err instanceof Error ? err.message : 'Unbekannter Fehler' });
    }
    setSaving(false);
  };

  const toggleActive = async (id: string, active: boolean) => {
    await securityApi.update('zero_trust_policies', id, { is_active: !active });
    fetchPolicies();
  };

  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);

  const deletePolicy = async (id: string) => {
    await securityApi.delete('zero_trust_policies', id);
    setDeleteConfirmId(null);
    fetchPolicies();
  };

  const getDomain = (id: string | null) => domains.find(d => d.id === id)?.domain || 'Global';

  const actionColor = (a: string) => {
    switch (a) {
      case 'allow': return 'bg-green-500/15 text-green-600';
      case 'block': return 'bg-red-500/15 text-red-600';
      case 'challenge': return 'bg-yellow-500/15 text-yellow-600';
      default: return 'bg-muted text-muted-foreground';
    }
  };

  if (loading) return <div className="flex justify-center py-8"><Loader2 className="h-6 w-6 animate-spin" /></div>;

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2"><Fingerprint className="h-5 w-5 text-primary" /> Zero Trust Network Access</CardTitle>
              <CardDescription>Richtlinien für identitätsbasierte Zugriffskontrolle — Vertraue niemandem, überprüfe alles</CardDescription>
            </div>
            <Button onClick={() => setDialogOpen(true)}><Plus className="h-4 w-4 mr-2" /> Policy erstellen</Button>
          </div>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Priorität</TableHead><TableHead>Name</TableHead><TableHead>Typ</TableHead>
                <TableHead>Aktion</TableHead><TableHead>MFA</TableHead><TableHead>Geräteprüfung</TableHead>
                <TableHead>Domain</TableHead><TableHead>Sitzungsdauer</TableHead><TableHead>Treffer</TableHead>
                <TableHead>Aktiv</TableHead><TableHead>Aktionen</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {policies.length === 0 ? (
                <TableRow><TableCell colSpan={11} className="text-center text-muted-foreground py-8">Keine Zero-Trust-Policies</TableCell></TableRow>
              ) : policies.map(p => (
                <TableRow key={p.id} className={!p.is_active ? 'opacity-50' : ''}>
                  <TableCell className="font-mono text-sm">{p.priority}</TableCell>
                  <TableCell className="font-medium">{p.name}</TableCell>
                  <TableCell><Badge variant="outline" className="text-xs">{p.policy_type}</Badge></TableCell>
                  <TableCell><Badge className={actionColor(p.action)}>{p.action}</Badge></TableCell>
                  <TableCell>{p.require_mfa ? <Shield className="h-4 w-4 text-green-500" /> : <span className="text-xs text-muted-foreground">—</span>}</TableCell>
                  <TableCell>{p.require_device_posture ? <Lock className="h-4 w-4 text-blue-500" /> : <span className="text-xs text-muted-foreground">—</span>}</TableCell>
                  <TableCell className="text-sm">{getDomain(p.domain_id)}</TableCell>
                  <TableCell className="text-sm">{Math.round(p.session_duration / 60)} Min</TableCell>
                  <TableCell className="font-mono">{p.hit_count}</TableCell>
                  <TableCell><Switch checked={p.is_active} onCheckedChange={() => toggleActive(p.id, p.is_active)} /></TableCell>
                  <TableCell>
                    <Button variant="ghost" size="sm" className="text-destructive" onClick={() => setDeleteConfirmId(p.id)}>
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <AlertDialog open={!!deleteConfirmId} onOpenChange={(open) => !open && setDeleteConfirmId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Policy löschen?</AlertDialogTitle>
            <AlertDialogDescription>Diese Aktion kann nicht rückgängig gemacht werden.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Abbrechen</AlertDialogCancel>
            <AlertDialogAction onClick={() => deleteConfirmId && deletePolicy(deleteConfirmId)}>Löschen</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-[550px]">
          <DialogHeader><DialogTitle>Zero-Trust Policy erstellen</DialogTitle></DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid gap-2"><Label>Name *</Label><Input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="z.B. Admin-Zugriff nur mit MFA" /></div>
            <div className="grid gap-2"><Label>Beschreibung</Label><Input value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} /></div>
            <div className="grid grid-cols-3 gap-4">
              <div className="grid gap-2"><Label>Typ</Label>
                <Select value={form.policy_type} onValueChange={v => setForm(f => ({ ...f, policy_type: v }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="access">Zugang</SelectItem>
                    <SelectItem value="identity">Identität</SelectItem>
                    <SelectItem value="device">Gerät</SelectItem>
                    <SelectItem value="network">Netzwerk</SelectItem>
                    <SelectItem value="application">Anwendung</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="grid gap-2"><Label>Aktion</Label>
                <Select value={form.action} onValueChange={v => setForm(f => ({ ...f, action: v }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="allow">Erlauben</SelectItem>
                    <SelectItem value="block">Blockieren</SelectItem>
                    <SelectItem value="challenge">Challenge</SelectItem>
                    <SelectItem value="isolate">Isolieren</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="grid gap-2"><Label>Priorität</Label>
                <Input type="number" value={form.priority} onChange={e => setForm(f => ({ ...f, priority: Number(e.target.value) }))} />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="grid gap-2"><Label>Sitzungsdauer (Sek.)</Label>
                <Input type="number" value={form.session_duration} onChange={e => setForm(f => ({ ...f, session_duration: Number(e.target.value) }))} />
              </div>
              <div className="grid gap-2"><Label>Risiko-Schwellenwert</Label>
                <Input type="number" min={0} max={100} value={form.risk_score_threshold} onChange={e => setForm(f => ({ ...f, risk_score_threshold: Number(e.target.value) }))} />
              </div>
            </div>
            <div className="grid gap-2"><Label>Domain</Label>
              <Select value={form.domain_id} onValueChange={v => setForm(f => ({ ...f, domain_id: v }))}>
                <SelectTrigger><SelectValue placeholder="Global" /></SelectTrigger>
                <SelectContent>{domains.map(d => <SelectItem key={d.id} value={d.id}>{d.domain}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="flex gap-6">
              <div className="flex items-center gap-2"><Switch checked={form.require_mfa} onCheckedChange={c => setForm(f => ({ ...f, require_mfa: c }))} /><Label>MFA erforderlich</Label></div>
              <div className="flex items-center gap-2"><Switch checked={form.require_device_posture} onCheckedChange={c => setForm(f => ({ ...f, require_device_posture: c }))} /><Label>Geräteprüfung</Label></div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Abbrechen</Button>
            <Button onClick={handleAdd} disabled={saving}>{saving ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Plus className="h-4 w-4 mr-2" />}Erstellen</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
