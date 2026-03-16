import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { useToast } from '@/hooks/use-toast';
import { Plus, Trash2, Loader2, FileText, Settings } from 'lucide-react';
import type { Json } from '@/integrations/supabase/types';

interface PageRule {
  id: string;
  domain_id: string;
  url_pattern: string;
  actions: Record<string, unknown>;
  priority: number;
  is_active: boolean;
  description: string | null;
}

interface Props {
  domains: { id: string; domain: string }[];
}

export function GapPageRules({ domains }: Props) {
  const { toast } = useToast();
  const [rules, setRules] = useState<PageRule[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [form, setForm] = useState({
    domain_id: '', url_pattern: '', priority: 1, description: '',
    cache_level: 'standard', security_level: 'medium', ssl: 'full',
    forwarding_url: '', always_online: false, browser_cache_ttl: 14400,
    disable_apps: false, disable_performance: false,
  });

  const loadRules = async () => {
    setLoading(true);
    const { data } = await supabase.from('page_rules').select('*').order('priority');
    setRules((data || []) as PageRule[]);
    setLoading(false);
  };

  useEffect(() => { loadRules(); }, []);

  const getDomainName = (id: string) => domains.find(d => d.id === id)?.domain || id;

  const handleAdd = async () => {
    if (!form.domain_id || !form.url_pattern) return;
    const actions: Record<string, unknown> = {};
    if (form.cache_level !== 'standard') actions.cache_level = form.cache_level;
    if (form.security_level !== 'medium') actions.security_level = form.security_level;
    if (form.ssl !== 'full') actions.ssl = form.ssl;
    if (form.forwarding_url) actions.forwarding_url = form.forwarding_url;
    if (form.always_online) actions.always_online = true;
    if (form.browser_cache_ttl !== 14400) actions.browser_cache_ttl = form.browser_cache_ttl;
    if (form.disable_apps) actions.disable_apps = true;
    if (form.disable_performance) actions.disable_performance = true;

    const { error } = await supabase.from('page_rules').insert({
      domain_id: form.domain_id,
      url_pattern: form.url_pattern,
      actions: actions as unknown as Json,
      priority: form.priority,
      description: form.description || null,
    });
    if (!error) { toast({ title: '✓ Seitenregel erstellt' }); setDialogOpen(false); loadRules(); }
  };

  const toggleRule = async (id: string, active: boolean) => {
    await supabase.from('page_rules').update({ is_active: !active }).eq('id', id);
    loadRules();
  };

  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);

  const deleteRule = async (id: string) => {
    await supabase.from('page_rules').delete().eq('id', id);
    setDeleteConfirmId(null);
    loadRules();
  };

  const formatActions = (actions: Record<string, unknown>) => {
    return Object.entries(actions).map(([k, v]) => (
      <Badge key={k} variant="outline" className="text-[10px] mr-1">{k}: {String(v)}</Badge>
    ));
  };

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                <FileText className="h-5 w-5 text-purple-500" />
                Seitenregeln (Page Rules)
              </CardTitle>
              <CardDescription>URL-basierte Einstellungen für Cache, Sicherheit und Weiterleitungen</CardDescription>
            </div>
            <Button onClick={() => setDialogOpen(true)}>
              <Plus className="h-4 w-4 mr-2" /> Seitenregel
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex items-center justify-center py-8"><Loader2 className="h-6 w-6 animate-spin" /></div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>URL-Pattern</TableHead>
                  <TableHead>Domain</TableHead>
                  <TableHead>Aktionen</TableHead>
                  <TableHead>Priorität</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Verwaltung</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rules.length === 0 ? (
                  <TableRow><TableCell colSpan={6} className="text-center text-muted-foreground py-8">Keine Seitenregeln</TableCell></TableRow>
                ) : rules.map(rule => (
                  <TableRow key={rule.id}>
                    <TableCell className="font-mono text-sm">{rule.url_pattern}</TableCell>
                    <TableCell className="text-sm">{getDomainName(rule.domain_id)}</TableCell>
                    <TableCell><div className="flex flex-wrap gap-1">{formatActions(rule.actions)}</div></TableCell>
                    <TableCell className="text-sm">{rule.priority}</TableCell>
                    <TableCell>
                      <Switch checked={rule.is_active} onCheckedChange={() => toggleRule(rule.id, rule.is_active)} />
                    </TableCell>
                    <TableCell>
                      <Button variant="ghost" size="sm" className="text-destructive" onClick={() => setDeleteConfirmId(rule.id)}>
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

      <AlertDialog open={!!deleteConfirmId} onOpenChange={(open) => !open && setDeleteConfirmId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Seitenregel löschen?</AlertDialogTitle>
            <AlertDialogDescription>Diese Aktion kann nicht rückgängig gemacht werden.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Abbrechen</AlertDialogCancel>
            <AlertDialogAction onClick={() => deleteConfirmId && deleteRule(deleteConfirmId)}>Löschen</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-[550px]">
          <DialogHeader><DialogTitle>Neue Seitenregel</DialogTitle></DialogHeader>
          <div className="grid gap-4 py-4 max-h-[60vh] overflow-y-auto">
            <div className="grid gap-2">
              <Label>Domain *</Label>
              <Select value={form.domain_id} onValueChange={v => setForm(f => ({ ...f, domain_id: v }))}>
                <SelectTrigger><SelectValue placeholder="Domain wählen..." /></SelectTrigger>
                <SelectContent>{domains.map(d => <SelectItem key={d.id} value={d.id}>{d.domain}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="grid gap-2">
              <Label>URL-Pattern *</Label>
              <Input value={form.url_pattern} onChange={e => setForm(f => ({ ...f, url_pattern: e.target.value }))} placeholder="example.com/images/*" />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="grid gap-2">
                <Label>Cache-Stufe</Label>
                <Select value={form.cache_level} onValueChange={v => setForm(f => ({ ...f, cache_level: v }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="bypass">Bypass</SelectItem>
                    <SelectItem value="basic">Basic</SelectItem>
                    <SelectItem value="standard">Standard</SelectItem>
                    <SelectItem value="aggressive">Aggressiv</SelectItem>
                    <SelectItem value="cache_everything">Alles cachen</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="grid gap-2">
                <Label>Sicherheitsstufe</Label>
                <Select value={form.security_level} onValueChange={v => setForm(f => ({ ...f, security_level: v }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="off">Aus</SelectItem>
                    <SelectItem value="low">Niedrig</SelectItem>
                    <SelectItem value="medium">Mittel</SelectItem>
                    <SelectItem value="high">Hoch</SelectItem>
                    <SelectItem value="under_attack">Unter Angriff</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid gap-2">
              <Label>Weiterleitungs-URL (optional)</Label>
              <Input value={form.forwarding_url} onChange={e => setForm(f => ({ ...f, forwarding_url: e.target.value }))} placeholder="https://new-url.com/$1" />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="grid gap-2">
                <Label>Priorität</Label>
                <Input type="number" value={form.priority} onChange={e => setForm(f => ({ ...f, priority: Number(e.target.value) }))} />
              </div>
              <div className="grid gap-2">
                <Label>Browser Cache TTL</Label>
                <Select value={String(form.browser_cache_ttl)} onValueChange={v => setForm(f => ({ ...f, browser_cache_ttl: Number(v) }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="1800">30 Min</SelectItem>
                    <SelectItem value="3600">1 Stunde</SelectItem>
                    <SelectItem value="14400">4 Stunden</SelectItem>
                    <SelectItem value="86400">1 Tag</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="flex items-center justify-between">
              <Label>Always Online</Label>
              <Switch checked={form.always_online} onCheckedChange={c => setForm(f => ({ ...f, always_online: c }))} />
            </div>
            <div className="grid gap-2">
              <Label>Beschreibung</Label>
              <Input value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Abbrechen</Button>
            <Button onClick={handleAdd}><Plus className="h-4 w-4 mr-1" /> Erstellen</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
