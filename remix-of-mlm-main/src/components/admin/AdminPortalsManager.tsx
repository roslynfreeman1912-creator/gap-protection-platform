import { useCallback, useEffect, useMemo, useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { Building2, Loader2, Plus, RefreshCw, Trash2, Edit, ExternalLink } from 'lucide-react';

type PortalModule = 'partners' | 'callcenter' | 'mlm' | 'custom';

interface PortalRow {
  id: string;
  slug: string;
  name: string;
  portal_type: string;
  is_active: boolean;
  modules: PortalModule[];
  settings: Record<string, any>;
  created_at: string;
  updated_at: string;
  member_count?: number;
}

const ALL_MODULES: { id: PortalModule; label: string }[] = [
  { id: 'custom', label: 'Custom' },
  { id: 'partners', label: 'Partners' },
  { id: 'callcenter', label: 'Call Center' },
  { id: 'mlm', label: 'MLM' },
];

export function AdminPortalsManager() {
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  const [actionLoading, setActionLoading] = useState(false);
  const [search, setSearch] = useState('');
  const [portals, setPortals] = useState<PortalRow[]>([]);

  const [createOpen, setCreateOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [selected, setSelected] = useState<PortalRow | null>(null);

  const [createForm, setCreateForm] = useState({
    slug: '',
    name: '',
    portal_type: 'custom',
    modules: ['custom'] as PortalModule[],
    admin_username: '',
    admin_password: '',
  });

  const [editForm, setEditForm] = useState({
    name: '',
    portal_type: 'custom',
    is_active: true,
    modules: ['custom'] as PortalModule[],
  });

  const portalUrl = useMemo(() => {
    const origin = window.location.origin;
    return (slug: string) => `${origin}/p/${slug}`;
  }, []);

  const loadPortals = useCallback(async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke('admin-portals', {
        body: { action: 'list', search: search || undefined }
      });
      if (error) throw error;
      setPortals((data?.portals || []) as PortalRow[]);
    } catch (err: any) {
      toast({ variant: 'destructive', title: 'Fehler', description: err.message });
    } finally {
      setLoading(false);
    }
  }, [search, toast]);

  useEffect(() => { loadPortals(); }, [loadPortals]);

  const toggleCreateModule = (m: PortalModule) => {
    setCreateForm(f => {
      const exists = f.modules.includes(m);
      const modules = exists ? f.modules.filter(x => x !== m) : [...f.modules, m];
      return { ...f, modules: modules.length ? modules : (['custom'] as PortalModule[]) };
    });
  };

  const toggleEditModule = (m: PortalModule) => {
    setEditForm(f => {
      const exists = f.modules.includes(m);
      const modules = exists ? f.modules.filter(x => x !== m) : [...f.modules, m];
      return { ...f, modules: modules.length ? modules : (['custom'] as PortalModule[]) };
    });
  };

  const openEdit = (p: PortalRow) => {
    setSelected(p);
    setEditForm({
      name: p.name || '',
      portal_type: p.portal_type || 'custom',
      is_active: !!p.is_active,
      modules: (p.modules || ['custom']) as PortalModule[],
    });
    setEditOpen(true);
  };

  const handleCreate = async () => {
    if (!createForm.slug || !createForm.name) {
      toast({ variant: 'destructive', title: 'Fehler', description: 'Slug und Name sind Pflichtfelder' });
      return;
    }
    setActionLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke('admin-portals', {
        body: { action: 'create', ...createForm }
      });
      if (error) throw error;

      toast({
        title: 'Portal erstellt',
        description: data?.portal?.slug ? `URL: ${portalUrl(data.portal.slug)}` : undefined
      });
      setCreateOpen(false);
      setCreateForm({ slug: '', name: '', portal_type: 'custom', modules: ['custom'], admin_username: '', admin_password: '' });
      loadPortals();
    } catch (err: any) {
      toast({ variant: 'destructive', title: 'Fehler', description: err.message });
    } finally {
      setActionLoading(false);
    }
  };

  const handleSaveEdit = async () => {
    if (!selected) return;
    setActionLoading(true);
    try {
      const { error } = await supabase.functions.invoke('admin-portals', {
        body: { action: 'update', portalId: selected.id, updates: editForm }
      });
      if (error) throw error;
      toast({ title: 'Portal aktualisiert' });
      setEditOpen(false);
      setSelected(null);
      loadPortals();
    } catch (err: any) {
      toast({ variant: 'destructive', title: 'Fehler', description: err.message });
    } finally {
      setActionLoading(false);
    }
  };

  const handleDelete = async (p: PortalRow) => {
    if (!confirm(`Portal "${p.name}" wirklich löschen?`)) return;
    setActionLoading(true);
    try {
      const { error } = await supabase.functions.invoke('admin-portals', {
        body: { action: 'delete', portalId: p.id }
      });
      if (error) throw error;
      toast({ title: 'Portal gelöscht' });
      loadPortals();
    } catch (err: any) {
      toast({ variant: 'destructive', title: 'Fehler', description: err.message });
    } finally {
      setActionLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Building2 className="h-5 w-5" /> Portals / Mandanten
          </CardTitle>
          <CardDescription>
            Super-Admin/Admin kann eigene Portale für Partner, Call Center oder beliebige Organisationen anlegen.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap items-center gap-3 mb-6">
            <div className="flex-1 min-w-[220px]">
              <Input
                placeholder="Nach Name oder Slug suchen..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && loadPortals()}
              />
            </div>
            <Button variant="outline" onClick={loadPortals} disabled={loading}>
              {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
            </Button>
            <Button onClick={() => setCreateOpen(true)}>
              <Plus className="h-4 w-4 mr-2" /> Neues Portal
            </Button>
          </div>

          <div className="rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Slug</TableHead>
                  <TableHead>Typ</TableHead>
                  <TableHead>Module</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Mitglieder</TableHead>
                  <TableHead className="text-right">Aktionen</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {portals.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={7} className="text-center py-8 text-muted-foreground">
                      {loading ? 'Laden...' : 'Keine Portale'}
                    </TableCell>
                  </TableRow>
                ) : portals.map(p => (
                  <TableRow key={p.id}>
                    <TableCell className="font-medium">{p.name}</TableCell>
                    <TableCell className="text-muted-foreground">{p.slug}</TableCell>
                    <TableCell>{p.portal_type}</TableCell>
                    <TableCell>
                      <div className="flex flex-wrap gap-1">
                        {(p.modules || []).slice(0, 4).map(m => (
                          <Badge key={m} variant="outline">{m}</Badge>
                        ))}
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge variant={p.is_active ? 'default' : 'secondary'}>
                        {p.is_active ? 'Aktiv' : 'Inaktiv'}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-muted-foreground">{p.member_count ?? 0}</TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-1">
                        <Button
                          size="icon"
                          variant="ghost"
                          onClick={() => window.open(`/p/${p.slug}`, '_blank')}
                          title="Portal öffnen"
                        >
                          <ExternalLink className="h-4 w-4" />
                        </Button>
                        <Button size="icon" variant="ghost" onClick={() => openEdit(p)} title="Bearbeiten">
                          <Edit className="h-4 w-4" />
                        </Button>
                        <Button
                          size="icon"
                          variant="ghost"
                          className="text-destructive"
                          onClick={() => handleDelete(p)}
                          title="Löschen"
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      {/* Create Dialog */}
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Neues Portal erstellen</DialogTitle>
            <DialogDescription>
              Erstellt ein Portal mit eigener Seite (`/p/&lt;slug&gt;`) und optionalem Portal-Admin (username/password).
            </DialogDescription>
          </DialogHeader>

          <div className="grid gap-4 py-2">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Portal Name</Label>
                <Input value={createForm.name} onChange={(e) => setCreateForm(f => ({ ...f, name: e.target.value }))} />
              </div>
              <div className="space-y-2">
                <Label>Slug</Label>
                <Input value={createForm.slug} onChange={(e) => setCreateForm(f => ({ ...f, slug: e.target.value }))} placeholder="مثال: partner-a" />
                <p className="text-xs text-muted-foreground">URL: {createForm.slug ? portalUrl(createForm.slug.toLowerCase()) : '—'}</p>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Portal Type</Label>
                <Select value={createForm.portal_type} onValueChange={(v) => setCreateForm(f => ({ ...f, portal_type: v }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="custom">custom</SelectItem>
                    <SelectItem value="partner">partner</SelectItem>
                    <SelectItem value="callcenter">callcenter</SelectItem>
                    <SelectItem value="mlm">mlm</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Module</Label>
                <div className="grid grid-cols-2 gap-2 rounded-md border p-3">
                  {ALL_MODULES.map(m => (
                    <label key={m.id} className="flex items-center gap-2 text-sm">
                      <Checkbox
                        checked={createForm.modules.includes(m.id)}
                        onCheckedChange={() => toggleCreateModule(m.id)}
                      />
                      {m.label}
                    </label>
                  ))}
                </div>
              </div>
            </div>

            <div className="border-t pt-4">
              <p className="text-sm font-medium mb-2">Portal Admin (اختياري)</p>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Username</Label>
                  <Input value={createForm.admin_username} onChange={(e) => setCreateForm(f => ({ ...f, admin_username: e.target.value }))} />
                </div>
                <div className="space-y-2">
                  <Label>Password</Label>
                  <Input
                    type="password"
                    value={createForm.admin_password}
                    onChange={(e) => setCreateForm(f => ({ ...f, admin_password: e.target.value }))}
                    placeholder="min 8 chars"
                  />
                </div>
              </div>
              <p className="text-xs text-muted-foreground mt-2">
                إذا تركتها فارغة: سيتم إنشاء البوابة بدون حساب أدمن، ويمكن إضافة أعضاء من داخل البوابة لاحقًا.
              </p>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateOpen(false)}>Abbrechen</Button>
            <Button onClick={handleCreate} disabled={actionLoading}>
              {actionLoading ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
              Erstellen
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit Dialog */}
      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent className="max-w-xl">
          <DialogHeader>
            <DialogTitle>Portal bearbeiten</DialogTitle>
            <DialogDescription>{selected ? `/${selected.slug}` : ''}</DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-2">
            <div className="space-y-2">
              <Label>Name</Label>
              <Input value={editForm.name} onChange={(e) => setEditForm(f => ({ ...f, name: e.target.value }))} />
            </div>
            <div className="space-y-2">
              <Label>Type</Label>
              <Select value={editForm.portal_type} onValueChange={(v) => setEditForm(f => ({ ...f, portal_type: v }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="custom">custom</SelectItem>
                  <SelectItem value="partner">partner</SelectItem>
                  <SelectItem value="callcenter">callcenter</SelectItem>
                  <SelectItem value="mlm">mlm</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Module</Label>
              <div className="grid grid-cols-2 gap-2 rounded-md border p-3">
                {ALL_MODULES.map(m => (
                  <label key={m.id} className="flex items-center gap-2 text-sm">
                    <Checkbox
                      checked={editForm.modules.includes(m.id)}
                      onCheckedChange={() => toggleEditModule(m.id)}
                    />
                    {m.label}
                  </label>
                ))}
              </div>
            </div>
            <div className="space-y-2">
              <Label>Status</Label>
              <Select value={editForm.is_active ? 'active' : 'inactive'} onValueChange={(v) => setEditForm(f => ({ ...f, is_active: v === 'active' }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="active">Aktiv</SelectItem>
                  <SelectItem value="inactive">Inaktiv</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditOpen(false)}>Abbrechen</Button>
            <Button onClick={handleSaveEdit} disabled={actionLoading}>
              {actionLoading ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
              Speichern
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

