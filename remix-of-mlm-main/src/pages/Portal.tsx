import { useCallback, useEffect, useMemo, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/hooks/use-toast';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Loader2, LogOut, RefreshCw, FileText, Users, Plus, Save, Trash2 } from 'lucide-react';

type PortalMemberRole = 'owner' | 'admin' | 'editor' | 'viewer';

interface PortalInfo {
  id: string;
  slug: string;
  name: string;
  portal_type: string;
  is_active: boolean;
  modules: string[];
  settings: Record<string, any>;
}

interface PortalPageRow {
  id: string;
  slug: string;
  title: string;
  is_published: boolean;
  updated_at: string;
  content?: any;
}

export default function PortalPage() {
  const { portalSlug } = useParams();
  const { user, signOut } = useAuth();
  const { toast } = useToast();
  const navigate = useNavigate();

  const slug = (portalSlug || '').toString().trim().toLowerCase();

  const [loading, setLoading] = useState(false);
  const [portal, setPortal] = useState<PortalInfo | null>(null);
  const [pages, setPages] = useState<PortalPageRow[]>([]);
  const [activePageSlug, setActivePageSlug] = useState('home');
  const [activePage, setActivePage] = useState<PortalPageRow | null>(null);
  const [memberRole, setMemberRole] = useState<PortalMemberRole>('viewer');
  const [authFailed, setAuthFailed] = useState(false);

  // Login form
  const [loginForm, setLoginForm] = useState({ username: '', password: '' });
  const [loginLoading, setLoginLoading] = useState(false);

  // Page editor
  const canEditPages = useMemo(() => ['owner', 'admin', 'editor'].includes(memberRole), [memberRole]);
  const canManageMembers = useMemo(() => ['owner', 'admin'].includes(memberRole), [memberRole]);

  const [pageEditor, setPageEditor] = useState({
    slug: 'home',
    title: '',
    is_published: true,
    contentJson: '{}',
  });
  const [savingPage, setSavingPage] = useState(false);

  // Members
  const [members, setMembers] = useState<any[]>([]);
  const [membersLoading, setMembersLoading] = useState(false);
  const [newMember, setNewMember] = useState({ username: '', password: '', first_name: '', last_name: '', role: 'viewer' as PortalMemberRole });
  const [creatingMember, setCreatingMember] = useState(false);

  const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
  const supabaseKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;

  const callPortal = useCallback(async (action: string, extra: Record<string, any> = {}) => {
    const { data, error } = await supabase.functions.invoke('portal-dashboard', {
      body: { action, portalSlug: slug, ...extra }
    });
    if (error) {
      const status = (error as any)?.context?.status;
      if (status === 401 || status === 403) setAuthFailed(true);
      throw error;
    }
    if (data?.error) {
      if (String(data.error).includes('Kein Zugriff') || String(data.error).includes('Token')) setAuthFailed(true);
      throw new Error(data.error);
    }
    return data;
  }, [slug]);

  const handlePortalLogin = useCallback(async () => {
    if (!slug) return;
    if (!loginForm.username || !loginForm.password) {
      toast({ variant: 'destructive', title: 'Fehler', description: 'Username und Passwort sind erforderlich' });
      return;
    }

    setLoginLoading(true);
    try {
      // avoid session conflicts
      try { await supabase.auth.signOut(); } catch { /* ignore */ }

      const res = await fetch(`${supabaseUrl}/functions/v1/portal-dashboard`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'apikey': supabaseKey,
          'Authorization': `Bearer ${supabaseKey}`,
        },
        body: JSON.stringify({ action: 'login', portalSlug: slug, username: loginForm.username, password: loginForm.password }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Login fehlgeschlagen');

      const { error } = await supabase.auth.setSession({ access_token: data.access_token, refresh_token: data.refresh_token });
      if (error) throw error;

      setAuthFailed(false);
      toast({ title: 'Erfolgreich angemeldet' });
    } catch (err: any) {
      toast({ variant: 'destructive', title: 'Fehler', description: err.message });
      setAuthFailed(true);
    } finally {
      setLoginLoading(false);
    }
  }, [slug, loginForm.username, loginForm.password, supabaseKey, supabaseUrl, toast]);

  const loadPortal = useCallback(async () => {
    if (!slug) return;
    setLoading(true);
    try {
      const data = await callPortal('get_portal');
      setPortal(data.portal);
      setPages(data.pages || []);
      setMemberRole((data.member?.role || 'viewer') as PortalMemberRole);
      setAuthFailed(false);
    } catch (_e) {
      // authFailed will be set in callPortal
    } finally {
      setLoading(false);
    }
  }, [callPortal, slug]);

  const loadPage = useCallback(async (pageSlugToLoad: string) => {
    if (!slug) return;
    try {
      const data = await callPortal('get_page', { pageSlug: pageSlugToLoad });
      const page = data.page as PortalPageRow;
      setActivePage(page);
      setPageEditor({
        slug: page.slug,
        title: page.title || '',
        is_published: !!page.is_published,
        contentJson: JSON.stringify(page.content || {}, null, 2),
      });
    } catch (err: any) {
      toast({ variant: 'destructive', title: 'Fehler', description: err.message });
    }
  }, [callPortal, slug, toast]);

  const savePage = async () => {
    if (!canEditPages) return;
    setSavingPage(true);
    try {
      let parsed: any = {};
      try { parsed = JSON.parse(pageEditor.contentJson || '{}'); } catch { parsed = { raw: pageEditor.contentJson }; }
      await callPortal('upsert_page', {
        pageSlug: pageEditor.slug,
        title: pageEditor.title,
        content: parsed,
        is_published: pageEditor.is_published,
      });
      toast({ title: 'Seite gespeichert' });
      await loadPortal();
      await loadPage(pageEditor.slug);
    } catch (err: any) {
      toast({ variant: 'destructive', title: 'Fehler', description: err.message });
    } finally {
      setSavingPage(false);
    }
  };

  const deletePage = async (pageId: string) => {
    if (!canManageMembers) return;
    if (!confirm('Seite wirklich löschen?')) return;
    try {
      await callPortal('delete_page', { pageId });
      toast({ title: 'Seite gelöscht' });
      setActivePageSlug('home');
      setActivePage(null);
      await loadPortal();
    } catch (err: any) {
      toast({ variant: 'destructive', title: 'Fehler', description: err.message });
    }
  };

  const loadMembers = useCallback(async () => {
    if (!canManageMembers) return;
    setMembersLoading(true);
    try {
      const data = await callPortal('list_members');
      setMembers(data.members || []);
    } catch (err: any) {
      toast({ variant: 'destructive', title: 'Fehler', description: err.message });
    } finally {
      setMembersLoading(false);
    }
  }, [callPortal, canManageMembers, toast]);

  const createMember = async () => {
    if (!canManageMembers) return;
    if (!newMember.username || !newMember.password) {
      toast({ variant: 'destructive', title: 'Fehler', description: 'Username und Passwort sind Pflichtfelder' });
      return;
    }
    setCreatingMember(true);
    try {
      await callPortal('create_member', { ...newMember });
      toast({ title: 'Mitglied erstellt' });
      setNewMember({ username: '', password: '', first_name: '', last_name: '', role: 'viewer' });
      loadMembers();
    } catch (err: any) {
      toast({ variant: 'destructive', title: 'Fehler', description: err.message });
    } finally {
      setCreatingMember(false);
    }
  };

  const updateMember = async (memberId: string, updates: Record<string, any>) => {
    if (!canManageMembers) return;
    try {
      await callPortal('update_member', { memberId, ...updates });
      loadMembers();
    } catch (err: any) {
      toast({ variant: 'destructive', title: 'Fehler', description: err.message });
    }
  };

  useEffect(() => {
    if (!slug) return;
    // Try loading portal if already logged in
    if (user) loadPortal();
  }, [slug, user, loadPortal]);

  useEffect(() => {
    if (slug && user && !authFailed) loadPortal();
  }, [slug, user, authFailed, loadPortal]);

  useEffect(() => {
    if (!user || authFailed) return;
    if (activePageSlug) loadPage(activePageSlug);
  }, [user, authFailed, activePageSlug, loadPage]);

  useEffect(() => {
    if (canManageMembers && user && !authFailed) loadMembers();
  }, [canManageMembers, user, authFailed, loadMembers]);

  if (!slug) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Card className="max-w-lg w-full">
          <CardHeader>
            <CardTitle>Portal</CardTitle>
            <CardDescription>Ungültiger Link</CardDescription>
          </CardHeader>
          <CardContent>
            <Button onClick={() => navigate('/')}>Zur Startseite</Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  const showLogin = !user || authFailed;

  return (
    <div className="min-h-screen bg-background">
      <div className="max-w-6xl mx-auto p-4 md:p-6 space-y-4">
        <div className="flex items-center gap-2">
          <div className="flex-1">
            <h1 className="text-lg font-bold">{portal?.name || `Portal: ${slug}`}</h1>
            <p className="text-xs text-muted-foreground">
              {portal ? (
                <>
                  <Badge variant="outline" className="mr-2">{portal.portal_type}</Badge>
                  <Badge variant="secondary">role: {memberRole}</Badge>
                </>
              ) : (
                <span>—</span>
              )}
            </p>
          </div>

          <Button variant="outline" onClick={loadPortal} disabled={loading}>
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
          </Button>
          {user && (
            <Button
              variant="ghost"
              onClick={async () => { await signOut(); setPortal(null); setPages([]); setAuthFailed(true); }}
            >
              <LogOut className="h-4 w-4 mr-2" /> Logout
            </Button>
          )}
        </div>

        {showLogin ? (
          <Card className="max-w-xl">
            <CardHeader>
              <CardTitle>تسجيل دخول البوابة</CardTitle>
              <CardDescription>
                أدخل اسم المستخدم وكلمة المرور الخاصة بهذه البوابة.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Username</Label>
                  <Input value={loginForm.username} onChange={(e) => setLoginForm(f => ({ ...f, username: e.target.value }))} />
                </div>
                <div className="space-y-2">
                  <Label>Password</Label>
                  <Input type="password" value={loginForm.password} onChange={(e) => setLoginForm(f => ({ ...f, password: e.target.value }))} />
                </div>
              </div>
              <Button onClick={handlePortalLogin} disabled={loginLoading}>
                {loginLoading ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
                Login
              </Button>
            </CardContent>
          </Card>
        ) : (
          <Tabs defaultValue="pages">
            <TabsList>
              <TabsTrigger value="pages"><FileText className="h-4 w-4 mr-2" /> Pages</TabsTrigger>
              {canManageMembers && <TabsTrigger value="members"><Users className="h-4 w-4 mr-2" /> Members</TabsTrigger>}
            </TabsList>

            <TabsContent value="pages" className="mt-4">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <Card className="md:col-span-1">
                  <CardHeader>
                    <CardTitle className="text-base">Pages</CardTitle>
                    <CardDescription>اختَر صفحة لعرضها أو تعديلها</CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-2">
                    {pages.map(p => (
                      <Button
                        key={p.id}
                        variant={activePageSlug === p.slug ? 'default' : 'outline'}
                        className="w-full justify-between"
                        onClick={() => setActivePageSlug(p.slug)}
                      >
                        <span className="truncate">{p.title || p.slug}</span>
                        {!p.is_published && <Badge variant="secondary">draft</Badge>}
                      </Button>
                    ))}

                    {canEditPages && (
                      <Button
                        variant="secondary"
                        className="w-full"
                        onClick={() => {
                          const newSlug = `page-${Date.now().toString().slice(-6)}`;
                          setActivePageSlug(newSlug);
                          setActivePage(null);
                          setPageEditor({ slug: newSlug, title: 'New Page', is_published: true, contentJson: JSON.stringify({ blocks: [] }, null, 2) });
                        }}
                      >
                        <Plus className="h-4 w-4 mr-2" /> New Page
                      </Button>
                    )}
                  </CardContent>
                </Card>

                <Card className="md:col-span-2">
                  <CardHeader>
                    <CardTitle className="text-base">Editor</CardTitle>
                    <CardDescription>
                      {canEditPages ? 'يمكنك تعديل المحتوى وحفظه' : 'عرض فقط'}
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <Label>Slug</Label>
                        <Input value={pageEditor.slug} disabled={!canEditPages} onChange={(e) => setPageEditor(p => ({ ...p, slug: e.target.value }))} />
                      </div>
                      <div className="space-y-2">
                        <Label>Title</Label>
                        <Input value={pageEditor.title} disabled={!canEditPages} onChange={(e) => setPageEditor(p => ({ ...p, title: e.target.value }))} />
                      </div>
                    </div>

                    <div className="flex items-center gap-2">
                      <Label className="text-sm">Published</Label>
                      <Select
                        value={pageEditor.is_published ? 'yes' : 'no'}
                        onValueChange={(v) => setPageEditor(p => ({ ...p, is_published: v === 'yes' }))}
                        disabled={!canEditPages}
                      >
                        <SelectTrigger className="w-[140px]"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="yes">Yes</SelectItem>
                          <SelectItem value="no">No</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>

                    <div className="space-y-2">
                      <Label>Content (JSON)</Label>
                      <Textarea
                        className="min-h-[260px] font-mono text-xs"
                        value={pageEditor.contentJson}
                        disabled={!canEditPages}
                        onChange={(e) => setPageEditor(p => ({ ...p, contentJson: e.target.value }))}
                      />
                    </div>

                    <div className="flex gap-2">
                      {canEditPages && (
                        <Button onClick={savePage} disabled={savingPage}>
                          {savingPage ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Save className="h-4 w-4 mr-2" />}
                          Save
                        </Button>
                      )}
                      {canManageMembers && activePage?.id && (
                        <Button variant="destructive" onClick={() => deletePage(activePage.id)}>
                          <Trash2 className="h-4 w-4 mr-2" /> Delete
                        </Button>
                      )}
                    </div>
                  </CardContent>
                </Card>
              </div>
            </TabsContent>

            {canManageMembers && (
              <TabsContent value="members" className="mt-4">
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                  <Card>
                    <CardHeader>
                      <CardTitle className="text-base">Members</CardTitle>
                      <CardDescription>إضافة/تعديل/تعطيل أعضاء</CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-3">
                      <Button variant="outline" onClick={loadMembers} disabled={membersLoading}>
                        {membersLoading ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <RefreshCw className="h-4 w-4 mr-2" />}
                        Refresh
                      </Button>

                      <div className="rounded-md border">
                        <div className="max-h-[360px] overflow-auto">
                          {members.map(m => (
                            <div key={m.id} className="flex items-center gap-2 p-2 border-b last:border-b-0">
                              <div className="flex-1 min-w-0">
                                <p className="text-sm font-medium truncate">
                                  {m.profile?.first_name} {m.profile?.last_name}
                                </p>
                                <p className="text-xs text-muted-foreground truncate">{m.profile?.email}</p>
                              </div>
                              <Select value={m.role} onValueChange={(v) => updateMember(m.id, { role: v })}>
                                <SelectTrigger className="w-[120px]"><SelectValue /></SelectTrigger>
                                <SelectContent>
                                  <SelectItem value="viewer">viewer</SelectItem>
                                  <SelectItem value="editor">editor</SelectItem>
                                  <SelectItem value="admin">admin</SelectItem>
                                  <SelectItem value="owner">owner</SelectItem>
                                </SelectContent>
                              </Select>
                              <Select value={m.is_active ? 'active' : 'inactive'} onValueChange={(v) => updateMember(m.id, { is_active: v === 'active' })}>
                                <SelectTrigger className="w-[120px]"><SelectValue /></SelectTrigger>
                                <SelectContent>
                                  <SelectItem value="active">active</SelectItem>
                                  <SelectItem value="inactive">inactive</SelectItem>
                                </SelectContent>
                              </Select>
                            </div>
                          ))}
                          {members.length === 0 && (
                            <div className="p-6 text-center text-sm text-muted-foreground">
                              {membersLoading ? 'Loading...' : 'No members'}
                            </div>
                          )}
                        </div>
                      </div>
                    </CardContent>
                  </Card>

                  <Card>
                    <CardHeader>
                      <CardTitle className="text-base">Add Member</CardTitle>
                      <CardDescription>إنشاء حساب جديد (username/password) وربطه بهذه البوابة</CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-4">
                      <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-2">
                          <Label>Username</Label>
                          <Input value={newMember.username} onChange={(e) => setNewMember(f => ({ ...f, username: e.target.value }))} />
                        </div>
                        <div className="space-y-2">
                          <Label>Password</Label>
                          <Input type="password" value={newMember.password} onChange={(e) => setNewMember(f => ({ ...f, password: e.target.value }))} />
                        </div>
                      </div>
                      <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-2">
                          <Label>First name</Label>
                          <Input value={newMember.first_name} onChange={(e) => setNewMember(f => ({ ...f, first_name: e.target.value }))} />
                        </div>
                        <div className="space-y-2">
                          <Label>Last name</Label>
                          <Input value={newMember.last_name} onChange={(e) => setNewMember(f => ({ ...f, last_name: e.target.value }))} />
                        </div>
                      </div>
                      <div className="space-y-2">
                        <Label>Role</Label>
                        <Select value={newMember.role} onValueChange={(v) => setNewMember(f => ({ ...f, role: v as PortalMemberRole }))}>
                          <SelectTrigger><SelectValue /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="viewer">viewer</SelectItem>
                            <SelectItem value="editor">editor</SelectItem>
                            <SelectItem value="admin">admin</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>

                      <Button onClick={createMember} disabled={creatingMember}>
                        {creatingMember ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Plus className="h-4 w-4 mr-2" />}
                        Create member
                      </Button>
                      <p className="text-xs text-muted-foreground">
                        ملاحظة: هذا سينشئ حساب Supabase Auth خلف الكواليس (بإيميل داخلي) لكن المستخدم يسجل دخول بالـusername/password فقط.
                      </p>
                    </CardContent>
                  </Card>
                </div>
              </TabsContent>
            )}
          </Tabs>
        )}
      </div>
    </div>
  );
}

