import { useState, useEffect, useCallback } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import {
  Users, Search, Loader2, Edit, Trash2, Key, Shield, Eye,
  UserPlus, RefreshCw, ChevronLeft, ChevronRight
} from 'lucide-react';

interface UserProfile {
  id: string;
  user_id: string;
  first_name: string;
  last_name: string;
  email: string;
  phone: string | null;
  status: string;
  role: string;
  domain: string | null;
  city: string | null;
  country: string | null;
  created_at: string;
  roles: string[];
}

interface AdminUsersManagerProps {
  isSuperAdmin: boolean;
}

export function AdminUsersManager({ isSuperAdmin }: AdminUsersManagerProps) {
  const { toast } = useToast();
  const [users, setUsers] = useState<UserProfile[]>([]);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState('');
  const [roleFilter, setRoleFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const limit = 20;

  // Dialogs
  const [editDialog, setEditDialog] = useState(false);
  const [passwordDialog, setPasswordDialog] = useState(false);
  const [roleDialog, setRoleDialog] = useState(false);
  const [detailDialog, setDetailDialog] = useState(false);
  const [selectedUser, setSelectedUser] = useState<UserProfile | null>(null);
  const [editForm, setEditForm] = useState<Record<string, string>>({});
  const [newPassword, setNewPassword] = useState('');
  const [actionLoading, setActionLoading] = useState(false);
  const [userDetail, setUserDetail] = useState<any>(null);

  const loadUsers = useCallback(async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke('admin-users', {
        body: { action: 'list_users', search: search || undefined, role: roleFilter, status: statusFilter, page, limit }
      });
      if (error) throw error;
      setUsers(data.users || []);
      setTotal(data.total || 0);
    } catch (err: any) {
      toast({ variant: 'destructive', title: 'Fehler', description: err.message });
    } finally {
      setLoading(false);
    }
  }, [search, roleFilter, statusFilter, page, limit, toast]);

  useEffect(() => { loadUsers(); }, [loadUsers]);

  const openEdit = (user: UserProfile) => {
    setSelectedUser(user);
    setEditForm({
      first_name: user.first_name || '',
      last_name: user.last_name || '',
      email: user.email || '',
      phone: user.phone || '',
      status: user.status || 'pending',
      city: user.city || '',
      country: user.country || '',
    });
    setEditDialog(true);
  };

  const handleSaveEdit = async () => {
    if (!selectedUser) return;
    setActionLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke('admin-users', {
        body: { action: 'update_user', profileId: selectedUser.id, updates: editForm }
      });
      if (error) throw error;
      toast({ title: 'Benutzer aktualisiert' });
      setEditDialog(false);
      loadUsers();
    } catch (err: any) {
      toast({ variant: 'destructive', title: 'Fehler', description: err.message });
    } finally {
      setActionLoading(false);
    }
  };

  const handleChangePassword = async () => {
    if (!selectedUser || !newPassword || newPassword.length < 6) {
      toast({ variant: 'destructive', title: 'Fehler', description: 'Passwort muss mindestens 6 Zeichen lang sein' });
      return;
    }
    setActionLoading(true);
    try {
      const { error } = await supabase.functions.invoke('admin-users', {
        body: { action: 'change_password', profileId: selectedUser.id, newPassword }
      });
      if (error) throw error;
      toast({ title: 'Passwort geändert' });
      setPasswordDialog(false);
      setNewPassword('');
    } catch (err: any) {
      toast({ variant: 'destructive', title: 'Fehler', description: err.message });
    } finally {
      setActionLoading(false);
    }
  };

  const handleChangeRole = async (addRoles: string[], removeRoles: string[]) => {
    if (!selectedUser) return;
    setActionLoading(true);
    try {
      const { error } = await supabase.functions.invoke('admin-users', {
        body: { action: 'change_role', profileId: selectedUser.id, addRoles, removeRoles }
      });
      if (error) throw error;
      toast({ title: 'Rollen aktualisiert' });
      setRoleDialog(false);
      loadUsers();
    } catch (err: any) {
      toast({ variant: 'destructive', title: 'Fehler', description: err.message });
    } finally {
      setActionLoading(false);
    }
  };

  const handleDelete = async (user: UserProfile) => {
    if (!confirm(`Benutzer "${user.first_name} ${user.last_name}" wirklich löschen? Diese Aktion kann nicht rückgängig gemacht werden.`)) return;
    try {
      const { error } = await supabase.functions.invoke('admin-users', {
        body: { action: 'delete_user', profileId: user.id }
      });
      if (error) throw error;
      toast({ title: 'Benutzer gelöscht' });
      loadUsers();
    } catch (err: any) {
      toast({ variant: 'destructive', title: 'Fehler', description: err.message });
    }
  };

  const viewUser = async (user: UserProfile) => {
    setSelectedUser(user);
    setDetailDialog(true);
    try {
      const { data, error } = await supabase.functions.invoke('admin-users', {
        body: { action: 'get_user', profileId: user.id }
      });
      if (error) throw error;
      setUserDetail(data);
    } catch (err: any) {
      toast({ variant: 'destructive', title: 'Fehler', description: err.message });
    }
  };

  const fmt = (n: number) => new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR' }).format(n);
  const fmtDate = (d: string) => new Date(d).toLocaleDateString('de-DE');

  const roleBadgeColor = (role: string) => {
    switch (role) {
      case 'super_admin': return 'bg-red-500/15 text-red-600 border-red-500/30';
      case 'admin': return 'bg-orange-500/15 text-orange-600 border-orange-500/30';
      case 'partner': return 'bg-blue-500/15 text-blue-600 border-blue-500/30';
      case 'callcenter': return 'bg-purple-500/15 text-purple-600 border-purple-500/30';
      default: return '';
    }
  };

  const allRoles = ['customer', 'partner', 'admin', 'super_admin', 'callcenter'];
  const totalPages = Math.ceil(total / limit);

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Users className="h-5 w-5" /> Benutzerverwaltung
          </CardTitle>
          <CardDescription>
            Alle Benutzer verwalten — Profile bearbeiten, Rollen ändern, Passwörter zurücksetzen
            {!isSuperAdmin && <span className="text-orange-500 ml-2">(Eingeschränkte Rechte — nur Super Admin kann Passwörter/Rollen ändern)</span>}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {/* Filters */}
          <div className="flex flex-wrap gap-3 mb-6">
            <div className="relative flex-1 min-w-[200px]">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input placeholder="Name oder E-Mail suchen..." value={search} onChange={e => setSearch(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && loadUsers()} className="pl-10" />
            </div>
            <Select value={roleFilter} onValueChange={setRoleFilter}>
              <SelectTrigger className="w-[150px]"><SelectValue placeholder="Rolle" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Alle Rollen</SelectItem>
                <SelectItem value="customer">Kunde</SelectItem>
                <SelectItem value="partner">Partner</SelectItem>
                <SelectItem value="admin">Admin</SelectItem>
                <SelectItem value="super_admin">Super Admin</SelectItem>
                <SelectItem value="callcenter">Call Center</SelectItem>
              </SelectContent>
            </Select>
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-[150px]"><SelectValue placeholder="Status" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Alle Status</SelectItem>
                <SelectItem value="active">Aktiv</SelectItem>
                <SelectItem value="pending">Ausstehend</SelectItem>
                <SelectItem value="suspended">Gesperrt</SelectItem>
              </SelectContent>
            </Select>
            <Button onClick={loadUsers} disabled={loading}>
              {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
            </Button>
          </div>

          {/* Users Table */}
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>E-Mail</TableHead>
                <TableHead>Rollen</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Registriert</TableHead>
                <TableHead className="text-right">Aktionen</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {users.length === 0 ? (
                <TableRow><TableCell colSpan={6} className="text-center py-8 text-muted-foreground">
                  {loading ? 'Laden...' : 'Keine Benutzer gefunden'}
                </TableCell></TableRow>
              ) : users.map(u => (
                <TableRow key={u.id}>
                  <TableCell className="font-medium">{u.first_name} {u.last_name}</TableCell>
                  <TableCell className="text-muted-foreground">{u.email}</TableCell>
                  <TableCell>
                    <div className="flex flex-wrap gap-1">
                      {u.roles.map(r => (
                        <Badge key={r} variant="outline" className={roleBadgeColor(r)}>{r}</Badge>
                      ))}
                    </div>
                  </TableCell>
                  <TableCell>
                    <Badge variant={u.status === 'active' ? 'default' : u.status === 'suspended' ? 'destructive' : 'secondary'}>
                      {u.status === 'active' ? 'Aktiv' : u.status === 'suspended' ? 'Gesperrt' : 'Ausstehend'}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-muted-foreground text-sm">{fmtDate(u.created_at)}</TableCell>
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-1">
                      <Button size="icon" variant="ghost" onClick={() => viewUser(u)} title="Details">
                        <Eye className="h-4 w-4" />
                      </Button>
                      <Button size="icon" variant="ghost" onClick={() => openEdit(u)} title="Bearbeiten">
                        <Edit className="h-4 w-4" />
                      </Button>
                      {isSuperAdmin && (
                        <>
                          <Button size="icon" variant="ghost" onClick={() => { setSelectedUser(u); setPasswordDialog(true); }} title="Passwort ändern">
                            <Key className="h-4 w-4" />
                          </Button>
                          <Button size="icon" variant="ghost" onClick={() => { setSelectedUser(u); setRoleDialog(true); }} title="Rollen ändern">
                            <Shield className="h-4 w-4" />
                          </Button>
                          <Button size="icon" variant="ghost" className="text-destructive" onClick={() => handleDelete(u)} title="Löschen">
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </>
                      )}
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex items-center justify-between mt-4">
              <p className="text-sm text-muted-foreground">{total} Benutzer insgesamt</p>
              <div className="flex gap-2">
                <Button size="sm" variant="outline" disabled={page <= 1} onClick={() => setPage(p => p - 1)}>
                  <ChevronLeft className="h-4 w-4" />
                </Button>
                <span className="text-sm py-1 px-3 bg-muted rounded">Seite {page} / {totalPages}</span>
                <Button size="sm" variant="outline" disabled={page >= totalPages} onClick={() => setPage(p => p + 1)}>
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Edit Dialog */}
      <Dialog open={editDialog} onOpenChange={setEditDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Benutzer bearbeiten</DialogTitle>
            <DialogDescription>{selectedUser?.first_name} {selectedUser?.last_name}</DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid grid-cols-2 gap-4">
              <div><Label>Vorname</Label><Input value={editForm.first_name || ''} onChange={e => setEditForm(f => ({ ...f, first_name: e.target.value }))} /></div>
              <div><Label>Nachname</Label><Input value={editForm.last_name || ''} onChange={e => setEditForm(f => ({ ...f, last_name: e.target.value }))} /></div>
            </div>
            <div><Label>E-Mail</Label><Input value={editForm.email || ''} onChange={e => setEditForm(f => ({ ...f, email: e.target.value }))} /></div>
            <div><Label>Telefon</Label><Input value={editForm.phone || ''} onChange={e => setEditForm(f => ({ ...f, phone: e.target.value }))} /></div>
            <div className="grid grid-cols-2 gap-4">
              <div><Label>Stadt</Label><Input value={editForm.city || ''} onChange={e => setEditForm(f => ({ ...f, city: e.target.value }))} /></div>
              <div><Label>Land</Label><Input value={editForm.country || ''} onChange={e => setEditForm(f => ({ ...f, country: e.target.value }))} /></div>
            </div>
            <div>
              <Label>Status</Label>
              <Select value={editForm.status} onValueChange={v => setEditForm(f => ({ ...f, status: v }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="active">Aktiv</SelectItem>
                  <SelectItem value="pending">Ausstehend</SelectItem>
                  <SelectItem value="suspended">Gesperrt</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditDialog(false)}>Abbrechen</Button>
            <Button onClick={handleSaveEdit} disabled={actionLoading}>
              {actionLoading ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null} Speichern
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Password Dialog */}
      <Dialog open={passwordDialog} onOpenChange={setPasswordDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Passwort ändern</DialogTitle>
            <DialogDescription>{selectedUser?.first_name} {selectedUser?.last_name} ({selectedUser?.email})</DialogDescription>
          </DialogHeader>
          <div className="py-4">
            <Label>Neues Passwort</Label>
            <Input type="password" value={newPassword} onChange={e => setNewPassword(e.target.value)} placeholder="Mindestens 6 Zeichen" />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setPasswordDialog(false)}>Abbrechen</Button>
            <Button onClick={handleChangePassword} disabled={actionLoading}>
              {actionLoading ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Key className="h-4 w-4 mr-2" />} Passwort ändern
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Role Dialog */}
      <Dialog open={roleDialog} onOpenChange={setRoleDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Rollen verwalten</DialogTitle>
            <DialogDescription>{selectedUser?.first_name} {selectedUser?.last_name}</DialogDescription>
          </DialogHeader>
          <div className="py-4 space-y-3">
            <p className="text-sm text-muted-foreground">Aktuelle Rollen:</p>
            <div className="flex flex-wrap gap-2">
              {selectedUser?.roles.map(r => (
                <Badge key={r} variant="outline" className={`${roleBadgeColor(r)} cursor-pointer`}
                  onClick={() => handleChangeRole([], [r])}>
                  {r} ✕
                </Badge>
              ))}
            </div>
            <p className="text-sm text-muted-foreground mt-4">Rolle hinzufügen:</p>
            <div className="flex flex-wrap gap-2">
              {allRoles.filter(r => !selectedUser?.roles.includes(r)).map(r => (
                <Button key={r} size="sm" variant="outline" onClick={() => handleChangeRole([r], [])} disabled={actionLoading}>
                  + {r}
                </Button>
              ))}
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Detail Dialog */}
      <Dialog open={detailDialog} onOpenChange={setDetailDialog}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Benutzerdetails</DialogTitle>
          </DialogHeader>
          {!userDetail ? (
            <div className="flex justify-center py-8"><Loader2 className="h-6 w-6 animate-spin" /></div>
          ) : (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div><p className="text-xs text-muted-foreground">Name</p><p className="font-medium">{userDetail.profile.first_name} {userDetail.profile.last_name}</p></div>
                <div><p className="text-xs text-muted-foreground">E-Mail</p><p className="font-medium">{userDetail.profile.email}</p></div>
                <div><p className="text-xs text-muted-foreground">Telefon</p><p className="font-medium">{userDetail.profile.phone || '—'}</p></div>
                <div><p className="text-xs text-muted-foreground">Status</p><Badge variant={userDetail.profile.status === 'active' ? 'default' : 'secondary'}>{userDetail.profile.status}</Badge></div>
                <div><p className="text-xs text-muted-foreground">Domain</p><p className="font-medium">{userDetail.profile.domain || '—'}</p></div>
                <div><p className="text-xs text-muted-foreground">Ort</p><p className="font-medium">{userDetail.profile.city || '—'}, {userDetail.profile.country || '—'}</p></div>
              </div>
              <div>
                <p className="text-xs text-muted-foreground mb-1">Rollen</p>
                <div className="flex gap-1">{userDetail.roles.map((r: string) => <Badge key={r} variant="outline" className={roleBadgeColor(r)}>{r}</Badge>)}</div>
              </div>
              {userDetail.stats && (
                <div className="grid grid-cols-3 gap-3">
                  <Card><CardContent className="pt-4"><p className="text-xs text-muted-foreground">Team</p><p className="text-xl font-bold">{userDetail.stats.teamSize}</p></CardContent></Card>
                  <Card><CardContent className="pt-4"><p className="text-xs text-muted-foreground">Provisionen</p><p className="text-xl font-bold">{fmt(userDetail.stats.totalCommissions)}</p></CardContent></Card>
                  <Card><CardContent className="pt-4"><p className="text-xs text-muted-foreground">Level 1</p><p className="text-xl font-bold">{userDetail.stats.level1}</p></CardContent></Card>
                </div>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
