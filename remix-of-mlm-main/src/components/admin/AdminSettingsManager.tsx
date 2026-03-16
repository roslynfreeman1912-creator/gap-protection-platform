import { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Checkbox } from '@/components/ui/checkbox';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import {
  UserPlus, Key, Trash2, Edit, Shield, Search, Loader2, RefreshCw,
  Users, Building2, Network, Settings, Eye, EyeOff, Copy, Check
} from 'lucide-react';
import { useEffect, useCallback } from 'react';

interface UserRow {
  id: string;
  user_id: string;
  first_name: string;
  last_name: string;
  email: string;
  phone: string | null;
  status: string;
  role: string;
  created_at: string;
  roles: string[];
}

export function AdminSettingsManager() {
  const { toast } = useToast();
  const [activeSection, setActiveSection] = useState('create');
  
  // Users list
  const [users, setUsers] = useState<UserRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState('');

  // Create user form
  const [createForm, setCreateForm] = useState({
    email: '', password: '', firstName: '', lastName: '', role: 'partner',
    roles: ['partner'] as string[],
  });
  const [creating, setCreating] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [copiedPassword, setCopiedPassword] = useState(false);

  // Edit dialog
  const [editDialog, setEditDialog] = useState(false);
  const [editUser, setEditUser] = useState<UserRow | null>(null);
  const [editForm, setEditForm] = useState({ firstName: '', lastName: '', email: '', phone: '', status: '' });
  const [editLoading, setEditLoading] = useState(false);

  // Password dialog
  const [pwDialog, setPwDialog] = useState(false);
  const [pwUser, setPwUser] = useState<UserRow | null>(null);
  const [newPassword, setNewPassword] = useState('');
  const [showNewPw, setShowNewPw] = useState(false);
  const [pwLoading, setPwLoading] = useState(false);

  // Role dialog
  const [roleDialog, setRoleDialog] = useState(false);
  const [roleUser, setRoleUser] = useState<UserRow | null>(null);
  const [selectedRoles, setSelectedRoles] = useState<string[]>([]);
  const [roleLoading, setRoleLoading] = useState(false);

  // Delete dialog
  const [deleteDialog, setDeleteDialog] = useState(false);
  const [deleteUser, setDeleteUser] = useState<UserRow | null>(null);
  const [deleteLoading, setDeleteLoading] = useState(false);

  const allRoles = ['admin', 'super_admin', 'partner', 'customer', 'callcenter'];

  const loadUsers = useCallback(async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke('admin-users', {
        body: { action: 'list_users', search: search || undefined, page: 1, limit: 100 }
      });
      if (error) throw error;
      setUsers(data.users || []);
    } catch (err: any) {
      toast({ variant: 'destructive', title: 'Fehler', description: err.message });
    } finally {
      setLoading(false);
    }
  }, [search, toast]);

  useEffect(() => { loadUsers(); }, [loadUsers]);

  // Generate random password
  const generatePassword = () => {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789!@#$';
    let pw = '';
    for (let i = 0; i < 16; i++) pw += chars[Math.floor(Math.random() * chars.length)];
    return pw;
  };

  // Create user
  const handleCreate = async () => {
    if (!createForm.email || !createForm.password || !createForm.firstName || !createForm.lastName) {
      toast({ variant: 'destructive', title: 'Fehler', description: 'Alle Felder ausfüllen' });
      return;
    }
    setCreating(true);
    try {
      const { data, error } = await supabase.functions.invoke('admin-users', {
        body: {
          action: 'create_user',
          email: createForm.email,
          password: createForm.password,
          firstName: createForm.firstName,
          lastName: createForm.lastName,
          role: createForm.role,
          roles: createForm.roles,
        }
      });
      if (error) throw error;
      if (data.error) throw new Error(data.error);
      toast({ title: 'Erstellt', description: `${createForm.email} wurde erfolgreich angelegt.` });
      setCreateForm({ email: '', password: '', firstName: '', lastName: '', role: 'partner', roles: ['partner'] });
      loadUsers();
    } catch (err: any) {
      toast({ variant: 'destructive', title: 'Fehler', description: err.message });
    } finally {
      setCreating(false);
    }
  };

  // Update user
  const handleUpdate = async () => {
    if (!editUser) return;
    setEditLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke('admin-users', {
        body: {
          action: 'update_user', profileId: editUser.id,
          updates: { first_name: editForm.firstName, last_name: editForm.lastName, email: editForm.email, phone: editForm.phone, status: editForm.status }
        }
      });
      if (error) throw error;
      if (data.error) throw new Error(data.error);
      toast({ title: 'Aktualisiert' });
      setEditDialog(false);
      loadUsers();
    } catch (err: any) {
      toast({ variant: 'destructive', title: 'Fehler', description: err.message });
    } finally {
      setEditLoading(false);
    }
  };

  // Change password
  const handlePasswordChange = async () => {
    if (!pwUser || !newPassword) return;
    setPwLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke('admin-users', {
        body: { action: 'change_password', profileId: pwUser.id, newPassword }
      });
      if (error) throw error;
      if (data.error) throw new Error(data.error);
      toast({ title: 'Passwort geändert', description: `Passwort für ${pwUser.email} wurde aktualisiert.` });
      setPwDialog(false);
      setNewPassword('');
    } catch (err: any) {
      toast({ variant: 'destructive', title: 'Fehler', description: err.message });
    } finally {
      setPwLoading(false);
    }
  };

  // Change roles
  const handleRoleChange = async () => {
    if (!roleUser) return;
    setRoleLoading(true);
    try {
      const currentRoles = roleUser.roles;
      const addRoles = selectedRoles.filter(r => !currentRoles.includes(r));
      const removeRoles = currentRoles.filter(r => !selectedRoles.includes(r));
      const { data, error } = await supabase.functions.invoke('admin-users', {
        body: { action: 'change_role', profileId: roleUser.id, addRoles, removeRoles }
      });
      if (error) throw error;
      if (data.error) throw new Error(data.error);
      toast({ title: 'Rollen aktualisiert' });
      setRoleDialog(false);
      loadUsers();
    } catch (err: any) {
      toast({ variant: 'destructive', title: 'Fehler', description: err.message });
    } finally {
      setRoleLoading(false);
    }
  };

  // Delete user
  const handleDelete = async () => {
    if (!deleteUser) return;
    setDeleteLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke('admin-users', {
        body: { action: 'delete_user', profileId: deleteUser.id }
      });
      if (error) throw error;
      if (data.error) throw new Error(data.error);
      toast({ title: 'Gelöscht', description: `${deleteUser.email} wurde entfernt.` });
      setDeleteDialog(false);
      loadUsers();
    } catch (err: any) {
      toast({ variant: 'destructive', title: 'Fehler', description: err.message });
    } finally {
      setDeleteLoading(false);
    }
  };

  const roleColor = (role: string) => {
    switch (role) {
      case 'super_admin': return 'destructive';
      case 'admin': return 'default';
      case 'partner': return 'secondary';
      case 'callcenter': return 'outline';
      default: return 'secondary';
    }
  };

  const roleLabel = (role: string) => {
    switch (role) {
      case 'super_admin': return 'Super Admin';
      case 'admin': return 'Admin';
      case 'partner': return 'Partner';
      case 'customer': return 'Kunde';
      case 'callcenter': return 'Call Center';
      default: return role;
    }
  };

  return (
    <div className="space-y-6">
      <Tabs value={activeSection} onValueChange={setActiveSection}>
        <TabsList className="grid grid-cols-4 max-w-xl">
          <TabsTrigger value="create" className="flex items-center gap-1.5 text-xs">
            <UserPlus className="h-3.5 w-3.5" />Konto erstellen
          </TabsTrigger>
          <TabsTrigger value="manage" className="flex items-center gap-1.5 text-xs">
            <Users className="h-3.5 w-3.5" />Verwalten
          </TabsTrigger>
          <TabsTrigger value="passwords" className="flex items-center gap-1.5 text-xs">
            <Key className="h-3.5 w-3.5" />Passwörter
          </TabsTrigger>
          <TabsTrigger value="roles" className="flex items-center gap-1.5 text-xs">
            <Shield className="h-3.5 w-3.5" />Rollen
          </TabsTrigger>
        </TabsList>

        {/* ═══════ CREATE ACCOUNT ═══════ */}
        <TabsContent value="create" className="mt-6">
          <div className="grid lg:grid-cols-2 gap-6">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <UserPlus className="h-5 w-5" /> Neues Konto erstellen
                </CardTitle>
                <CardDescription>Admin, Partner, Call Center oder Kunden anlegen</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label>Vorname *</Label>
                    <Input value={createForm.firstName} onChange={e => setCreateForm(p => ({ ...p, firstName: e.target.value }))} placeholder="Max" />
                  </div>
                  <div>
                    <Label>Nachname *</Label>
                    <Input value={createForm.lastName} onChange={e => setCreateForm(p => ({ ...p, lastName: e.target.value }))} placeholder="Mustermann" />
                  </div>
                </div>
                <div>
                  <Label>E-Mail *</Label>
                  <Input type="email" value={createForm.email} onChange={e => setCreateForm(p => ({ ...p, email: e.target.value }))} placeholder="user@example.com" />
                </div>
                <div>
                  <Label>Passwort *</Label>
                  <div className="flex gap-2">
                    <div className="relative flex-1">
                      <Input
                        type={showPassword ? 'text' : 'password'}
                        value={createForm.password}
                        onChange={e => setCreateForm(p => ({ ...p, password: e.target.value }))}
                        placeholder="Mind. 8 Zeichen"
                      />
                      <button type="button" className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground" onClick={() => setShowPassword(!showPassword)}>
                        {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                      </button>
                    </div>
                    <Button variant="outline" size="sm" onClick={() => {
                      const pw = generatePassword();
                      setCreateForm(p => ({ ...p, password: pw }));
                      setShowPassword(true);
                    }}>
                      Generieren
                    </Button>
                    <Button variant="outline" size="icon" onClick={() => {
                      navigator.clipboard.writeText(createForm.password);
                      setCopiedPassword(true);
                      setTimeout(() => setCopiedPassword(false), 2000);
                    }}>
                      {copiedPassword ? <Check className="h-4 w-4 text-green-500" /> : <Copy className="h-4 w-4" />}
                    </Button>
                  </div>
                </div>
                <div>
                  <Label>Hauptrolle</Label>
                  <Select value={createForm.role} onValueChange={v => setCreateForm(p => ({ ...p, role: v, roles: [v] }))}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="admin">Admin</SelectItem>
                      <SelectItem value="partner">Partner</SelectItem>
                      <SelectItem value="callcenter">Call Center</SelectItem>
                      <SelectItem value="customer">Kunde</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label className="mb-2 block">Zusätzliche Rollen</Label>
                  <div className="flex flex-wrap gap-3">
                    {allRoles.map(role => (
                      <label key={role} className="flex items-center gap-1.5 text-sm">
                        <Checkbox
                          checked={createForm.roles.includes(role)}
                          onCheckedChange={(checked) => {
                            setCreateForm(p => ({
                              ...p,
                              roles: checked
                                ? [...p.roles.filter(r => r !== role), role]
                                : p.roles.filter(r => r !== role)
                            }));
                          }}
                        />
                        {roleLabel(role)}
                      </label>
                    ))}
                  </div>
                </div>
                <Button onClick={handleCreate} disabled={creating} className="w-full">
                  {creating ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <UserPlus className="h-4 w-4 mr-2" />}
                  Konto erstellen
                </Button>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Schnellaktionen</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <Button variant="outline" className="w-full justify-start" onClick={() => {
                  setCreateForm({ email: '', password: generatePassword(), firstName: '', lastName: '', role: 'admin', roles: ['admin', 'super_admin'] });
                  setShowPassword(true);
                }}>
                  <Shield className="h-4 w-4 mr-2" /> Neuen Admin erstellen
                </Button>
                <Button variant="outline" className="w-full justify-start" onClick={() => {
                  setCreateForm({ email: '', password: generatePassword(), firstName: '', lastName: '', role: 'partner', roles: ['partner'] });
                  setShowPassword(true);
                }}>
                  <Users className="h-4 w-4 mr-2" /> Neuen Partner erstellen
                </Button>
                <Button variant="outline" className="w-full justify-start" onClick={() => {
                  setCreateForm({ email: '', password: generatePassword(), firstName: '', lastName: '', role: 'callcenter', roles: ['callcenter'] });
                  setShowPassword(true);
                }}>
                  <Building2 className="h-4 w-4 mr-2" /> Neues Call Center erstellen
                </Button>

                <div className="pt-4 border-t">
                  <h4 className="font-medium mb-2 text-sm">Aktuelle Konten</h4>
                  <div className="space-y-2 text-sm text-muted-foreground">
                    <p>Admins: {users.filter(u => u.roles.includes('admin')).length}</p>
                    <p>Partner: {users.filter(u => u.roles.includes('partner')).length}</p>
                    <p>Call Center: {users.filter(u => u.roles.includes('callcenter')).length}</p>
                    <p>Kunden: {users.filter(u => u.roles.includes('customer')).length}</p>
                    <p className="font-medium text-foreground">Gesamt: {users.length}</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* ═══════ MANAGE USERS ═══════ */}
        <TabsContent value="manage" className="mt-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Users className="h-5 w-5" /> Alle Konten verwalten
              </CardTitle>
              <div className="flex items-center gap-3 mt-3">
                <div className="relative flex-1 max-w-sm">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    placeholder="Suchen..."
                    value={search}
                    onChange={e => setSearch(e.target.value)}
                    className="pl-9"
                  />
                </div>
                <Button variant="outline" size="icon" onClick={loadUsers}>
                  <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              {loading ? (
                <div className="flex justify-center py-8"><Loader2 className="h-6 w-6 animate-spin" /></div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Name</TableHead>
                      <TableHead>E-Mail</TableHead>
                      <TableHead>Rollen</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead className="text-right">Aktionen</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {users.map(user => (
                      <TableRow key={user.id}>
                        <TableCell className="font-medium">{user.first_name} {user.last_name}</TableCell>
                        <TableCell className="text-sm">{user.email}</TableCell>
                        <TableCell>
                          <div className="flex flex-wrap gap-1">
                            {user.roles.map(r => (
                              <Badge key={r} variant={roleColor(r) as any} className="text-[10px]">{roleLabel(r)}</Badge>
                            ))}
                          </div>
                        </TableCell>
                        <TableCell>
                          <Badge variant={user.status === 'active' ? 'default' : 'secondary'}>{user.status}</Badge>
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="flex gap-1 justify-end">
                            <Button size="icon" variant="ghost" title="Bearbeiten" onClick={() => {
                              setEditUser(user);
                              setEditForm({ firstName: user.first_name, lastName: user.last_name, email: user.email, phone: user.phone || '', status: user.status });
                              setEditDialog(true);
                            }}>
                              <Edit className="h-4 w-4" />
                            </Button>
                            <Button size="icon" variant="ghost" title="Passwort ändern" onClick={() => {
                              setPwUser(user);
                              setNewPassword('');
                              setPwDialog(true);
                            }}>
                              <Key className="h-4 w-4" />
                            </Button>
                            <Button size="icon" variant="ghost" title="Rollen ändern" onClick={() => {
                              setRoleUser(user);
                              setSelectedRoles([...user.roles]);
                              setRoleDialog(true);
                            }}>
                              <Shield className="h-4 w-4" />
                            </Button>
                            <Button size="icon" variant="ghost" title="Löschen" className="text-destructive hover:text-destructive" onClick={() => {
                              setDeleteUser(user);
                              setDeleteDialog(true);
                            }}>
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                    {users.length === 0 && (
                      <TableRow><TableCell colSpan={5} className="text-center text-muted-foreground py-8">Keine Benutzer gefunden</TableCell></TableRow>
                    )}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* ═══════ PASSWORDS ═══════ */}
        <TabsContent value="passwords" className="mt-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Key className="h-5 w-5" /> Passwörter verwalten
              </CardTitle>
              <CardDescription>Klicken Sie auf einen Benutzer, um das Passwort zu ändern</CardDescription>
            </CardHeader>
            <CardContent>
              {loading ? (
                <div className="flex justify-center py-8"><Loader2 className="h-6 w-6 animate-spin" /></div>
              ) : (
                <div className="space-y-2">
                  {users.map(user => (
                    <div key={user.id} className="flex items-center justify-between p-3 rounded-lg border hover:bg-muted/50 transition-colors">
                      <div>
                        <p className="font-medium">{user.first_name} {user.last_name}</p>
                        <p className="text-sm text-muted-foreground">{user.email}</p>
                      </div>
                      <div className="flex items-center gap-2">
                        <div className="flex gap-1">
                          {user.roles.map(r => (
                            <Badge key={r} variant={roleColor(r) as any} className="text-[10px]">{roleLabel(r)}</Badge>
                          ))}
                        </div>
                        <Button size="sm" variant="outline" onClick={() => {
                          setPwUser(user);
                          setNewPassword(generatePassword());
                          setShowNewPw(true);
                          setPwDialog(true);
                        }}>
                          <Key className="h-3.5 w-3.5 mr-1.5" /> Passwort ändern
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* ═══════ ROLES ═══════ */}
        <TabsContent value="roles" className="mt-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Shield className="h-5 w-5" /> Rollen verwalten
              </CardTitle>
              <CardDescription>Klicken Sie auf einen Benutzer, um Rollen zuzuweisen oder zu entfernen</CardDescription>
            </CardHeader>
            <CardContent>
              {loading ? (
                <div className="flex justify-center py-8"><Loader2 className="h-6 w-6 animate-spin" /></div>
              ) : (
                <div className="space-y-2">
                  {users.map(user => (
                    <div key={user.id} className="flex items-center justify-between p-3 rounded-lg border hover:bg-muted/50 transition-colors">
                      <div>
                        <p className="font-medium">{user.first_name} {user.last_name}</p>
                        <p className="text-sm text-muted-foreground">{user.email}</p>
                      </div>
                      <div className="flex items-center gap-2">
                        <div className="flex gap-1">
                          {user.roles.map(r => (
                            <Badge key={r} variant={roleColor(r) as any} className="text-[10px]">{roleLabel(r)}</Badge>
                          ))}
                        </div>
                        <Button size="sm" variant="outline" onClick={() => {
                          setRoleUser(user);
                          setSelectedRoles([...user.roles]);
                          setRoleDialog(true);
                        }}>
                          <Shield className="h-3.5 w-3.5 mr-1.5" /> Rollen bearbeiten
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* ═══ EDIT DIALOG ═══ */}
      <Dialog open={editDialog} onOpenChange={setEditDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Benutzer bearbeiten</DialogTitle>
            <DialogDescription>{editUser?.email}</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div><Label>Vorname</Label><Input value={editForm.firstName} onChange={e => setEditForm(p => ({ ...p, firstName: e.target.value }))} /></div>
              <div><Label>Nachname</Label><Input value={editForm.lastName} onChange={e => setEditForm(p => ({ ...p, lastName: e.target.value }))} /></div>
            </div>
            <div><Label>E-Mail</Label><Input value={editForm.email} onChange={e => setEditForm(p => ({ ...p, email: e.target.value }))} /></div>
            <div><Label>Telefon</Label><Input value={editForm.phone} onChange={e => setEditForm(p => ({ ...p, phone: e.target.value }))} /></div>
            <div>
              <Label>Status</Label>
              <Select value={editForm.status} onValueChange={v => setEditForm(p => ({ ...p, status: v }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="active">Aktiv</SelectItem>
                  <SelectItem value="pending">Ausstehend</SelectItem>
                  <SelectItem value="suspended">Gesperrt</SelectItem>
                  <SelectItem value="inactive">Inaktiv</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditDialog(false)}>Abbrechen</Button>
            <Button onClick={handleUpdate} disabled={editLoading}>
              {editLoading && <Loader2 className="h-4 w-4 animate-spin mr-2" />} Speichern
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ═══ PASSWORD DIALOG ═══ */}
      <Dialog open={pwDialog} onOpenChange={setPwDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Passwort ändern</DialogTitle>
            <DialogDescription>{pwUser?.first_name} {pwUser?.last_name} ({pwUser?.email})</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label>Neues Passwort</Label>
              <div className="flex gap-2">
                <div className="relative flex-1">
                  <Input type={showNewPw ? 'text' : 'password'} value={newPassword} onChange={e => setNewPassword(e.target.value)} placeholder="Mind. 8 Zeichen" />
                  <button type="button" className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground" onClick={() => setShowNewPw(!showNewPw)}>
                    {showNewPw ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
                <Button variant="outline" size="sm" onClick={() => { setNewPassword(generatePassword()); setShowNewPw(true); }}>Generieren</Button>
                <Button variant="outline" size="icon" onClick={() => navigator.clipboard.writeText(newPassword)}>
                  <Copy className="h-4 w-4" />
                </Button>
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setPwDialog(false)}>Abbrechen</Button>
            <Button onClick={handlePasswordChange} disabled={pwLoading || !newPassword}>
              {pwLoading && <Loader2 className="h-4 w-4 animate-spin mr-2" />} Passwort ändern
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ═══ ROLE DIALOG ═══ */}
      <Dialog open={roleDialog} onOpenChange={setRoleDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Rollen bearbeiten</DialogTitle>
            <DialogDescription>{roleUser?.first_name} {roleUser?.last_name} ({roleUser?.email})</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            {allRoles.map(role => (
              <label key={role} className="flex items-center gap-3 p-2 rounded hover:bg-muted/50">
                <Checkbox
                  checked={selectedRoles.includes(role)}
                  onCheckedChange={checked => {
                    setSelectedRoles(prev => checked ? [...prev, role] : prev.filter(r => r !== role));
                  }}
                />
                <div>
                  <p className="font-medium text-sm">{roleLabel(role)}</p>
                  <p className="text-xs text-muted-foreground">
                    {role === 'super_admin' && 'Vollzugriff auf alle Funktionen'}
                    {role === 'admin' && 'Admin-Panel Zugriff'}
                    {role === 'partner' && 'Partner-Dashboard und Provisionen'}
                    {role === 'customer' && 'Basis-Kunde'}
                    {role === 'callcenter' && 'Call-Center Dashboard'}
                  </p>
                </div>
              </label>
            ))}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRoleDialog(false)}>Abbrechen</Button>
            <Button onClick={handleRoleChange} disabled={roleLoading}>
              {roleLoading && <Loader2 className="h-4 w-4 animate-spin mr-2" />} Rollen speichern
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ═══ DELETE DIALOG ═══ */}
      <Dialog open={deleteDialog} onOpenChange={setDeleteDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="text-destructive">Benutzer löschen</DialogTitle>
            <DialogDescription>
              Sind Sie sicher, dass Sie <strong>{deleteUser?.first_name} {deleteUser?.last_name}</strong> ({deleteUser?.email}) unwiderruflich löschen möchten?
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteDialog(false)}>Abbrechen</Button>
            <Button variant="destructive" onClick={handleDelete} disabled={deleteLoading}>
              {deleteLoading && <Loader2 className="h-4 w-4 animate-spin mr-2" />} Endgültig löschen
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
