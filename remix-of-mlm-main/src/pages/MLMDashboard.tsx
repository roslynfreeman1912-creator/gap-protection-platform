import { useEffect, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { ScrollArea } from '@/components/ui/scroll-area';
import { MLMTreeView, TreeNode } from '@/components/mlm/MLMTreeView';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';
import {
  LayoutDashboard, Users, Euro, GitBranch, UserCog,
  Network, TrendingUp, Shield, Loader2, Menu, LogOut,
  ChevronRight, RefreshCw, Edit3, Save, X, Copy, Check,
  Building2, BarChart3, Plus, Trash2, KeyRound, Lock, Eye, EyeOff,
  Settings, Pencil,
} from 'lucide-react';
import logoIcon from '@/assets/gap-icon.png';

// ─── Types ───────────────────────────────────
interface MLMStats {
  totalPartners?: number;
  activePartners?: number;
  totalDownline?: number;
  level1?: number;
  level2?: number;
  level3?: number;
  level4?: number;
  level5?: number;
  totalCommissions?: number;
  pendingCommissions?: number;
  approvedCommissions?: number;
  paidCommissions?: number;
  [key: string]: number | undefined;
}

interface MLMSetting {
  key: string;
  value: any;
  label: string;
  category: string;
}

interface StructureAdmin {
  base_number: string;
  structure_name: string;
  admin_name: string;
}

const DEFAULT_COMMISSION_RATES: Record<number, number> = {
  1: 10, 2: 5, 3: 4, 4: 3, 5: 2,
};

interface SidebarItem {
  id: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  group: string;
  adminOnly?: boolean;
}

const sidebarItems: SidebarItem[] = [
  { id: 'overview', label: 'Übersicht', icon: LayoutDashboard, group: 'Dashboard' },
  { id: 'downline', label: 'Meine Struktur', icon: Users, group: 'Dashboard' },
  { id: 'tree', label: 'Baumansicht', icon: GitBranch, group: 'Dashboard' },
  { id: 'commissions', label: 'Provisionen', icon: Euro, group: 'Finanzen' },
  { id: 'profile', label: 'Mein Profil', icon: UserCog, group: 'Einstellungen' },
  { id: 'settings', label: 'Verwaltung', icon: Settings, group: 'Einstellungen', adminOnly: true },
];

const EMPTY_PARTNER = {
  first_name: '', last_name: '', email: '', phone: '',
  city: '', street: '', house_number: '', postal_code: '', partner_number: '',
};

// ─── Login Screen ────────────────────────────
function MLMLoginScreen({ onLogin }: { onLogin: (u: string, p: string) => Promise<void> }) {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [showPw, setShowPw] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    try {
      await onLogin(username, password);
    } catch (err: any) {
      setError(err.message || 'Login fehlgeschlagen');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-4 bg-mlm-login">
      <Card className="w-full max-w-md border-primary/20 shadow-2xl">
        <CardHeader className="text-center space-y-4 pb-2">
          <div className="mx-auto w-16 h-16 rounded-2xl flex items-center justify-center bg-mlm-logo-gradient">
            <img src={logoIcon} alt="GAP" className="h-10 w-10 brightness-[1.3]" />
          </div>
          <div>
            <CardTitle className="text-2xl">MLM Dashboard</CardTitle>
            <CardDescription>GAP Protection Ltd · Partner Management</CardDescription>
          </div>
        </CardHeader>
        <CardContent>
          <form onSubmit={submit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="mlm-user">Benutzername</Label>
              <Input id="mlm-user" value={username} onChange={(e) => setUsername(e.target.value)}
                placeholder="Benutzername eingeben" autoComplete="username" required />
            </div>
            <div className="space-y-2">
              <Label htmlFor="mlm-pw">Passwort</Label>
              <div className="relative">
                <Input id="mlm-pw" type={showPw ? 'text' : 'password'} value={password}
                  onChange={(e) => setPassword(e.target.value)} placeholder="Passwort eingeben"
                  autoComplete="current-password" required />
                <button type="button" className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                  onClick={() => setShowPw(!showPw)}
                  aria-label={showPw ? 'Passwort verbergen' : 'Passwort anzeigen'}>
                  {showPw ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </div>
            {error && (
              <div className="p-3 rounded-lg bg-destructive/10 text-destructive text-sm">{error}</div>
            )}
            <Button type="submit" className="w-full" disabled={loading}>
              {loading ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Lock className="h-4 w-4 mr-2" />}
              Anmelden
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}

// ─── Main Dashboard Component ────────────────
export default function MLMDashboard() {
  const { user, profile, loading, signOut } = useAuth();
  const navigate = useNavigate();
  const { toast } = useToast();

  const [activeTab, setActiveTab] = useState('overview');
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [mlmAuthFailed, setMlmAuthFailed] = useState(false);

  // Data states
  const [stats, setStats] = useState<MLMStats>({});
  const [structureAdmin, setStructureAdmin] = useState<StructureAdmin | null>(null);
  const [isSuperAdmin, setIsSuperAdmin] = useState(false);
  const [isStructureAdmin, setIsStructureAdmin] = useState(false);
  const [downline, setDownline] = useState<any[]>([]);
  const [treeData, setTreeData] = useState<TreeNode | null>(null);
  const [commissions, setCommissions] = useState<any[]>([]);
  const [levelStats, setLevelStats] = useState<Record<number, { count: number; total: number }>>({});
  const [structures, setStructures] = useState<any[]>([]);
  const [selectedStructure, setSelectedStructure] = useState<string>('');

  // Profile editing
  const [editMode, setEditMode] = useState(false);
  const [editData, setEditData] = useState<Record<string, string>>({});

  // CRUD state
  const [showPartnerForm, setShowPartnerForm] = useState(false);
  const [editingPartnerId, setEditingPartnerId] = useState<string | null>(null);
  const [partnerForm, setPartnerForm] = useState(EMPTY_PARTNER);
  const [savingPartner, setSavingPartner] = useState(false);

  // Credentials state
  const [showCredentials, setShowCredentials] = useState(false);
  const [credForm, setCredForm] = useState({ newPassword: '', confirmPassword: '', newEmail: '' });
  const [savingCreds, setSavingCreds] = useState(false);

  // Settings state
  const [allSettings, setAllSettings] = useState<MLMSetting[]>([]);
  const [settingsEdits, setSettingsEdits] = useState<Record<string, any>>({});
  const [savingSettings, setSavingSettings] = useState(false);
  const [settingsLoaded, setSettingsLoaded] = useState(false);
  const [newSettingForm, setNewSettingForm] = useState({ key: '', value: '', label: '', category: 'general' });
  const [showNewSetting, setShowNewSetting] = useState(false);

  // Dynamic commission rates from DB
  const [commissionRates, setCommissionRates] = useState<Record<number, number>>(DEFAULT_COMMISSION_RATES);
  // Dynamic labels from DB
  const [dynamicLabels, setDynamicLabels] = useState<Record<string, string>>({});

  // ─── API helper ─────────────────────────────
  const callMLMDashboard = useCallback(async (action: string, extra: Record<string, any> = {}) => {
    const { data, error } = await supabase.functions.invoke('mlm-dashboard', {
      body: { action, ...extra }
    });
    if (error) {
      // Detect 401/403 from FunctionsHttpError (context holds the Response object)
      const status = (error as any)?.context?.status;
      const msg = error.message || '';
      if (
        status === 401 || status === 403 ||
        msg.includes('401') || msg.includes('403') ||
        msg.includes('Berechtigung') || msg.includes('autorisiert') ||
        msg.includes('Nicht autorisiert') || msg.includes('Ungültiges Token')
      ) {
        setMlmAuthFailed(true);
      }
      throw error;
    }
    // Also check for error in the response body
    if (data?.error && (data.error.includes('autorisiert') || data.error.includes('Token'))) {
      setMlmAuthFailed(true);
      throw new Error(data.error);
    }
    return data;
  }, []);

  // ─── Login handler ──────────────────────────
  const handleMLMLogin = useCallback(async (username: string, password: string) => {
    const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
    const supabaseKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;

    // Sign out any existing session first to avoid conflicts (ignore errors)
    try { await supabase.auth.signOut(); } catch { /* ignore signout errors */ }

    const res = await fetch(`${supabaseUrl}/functions/v1/mlm-dashboard`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'apikey': supabaseKey,
        'Authorization': `Bearer ${supabaseKey}`,
      },
      body: JSON.stringify({ action: 'login', username, password }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Login fehlgeschlagen');

    // Set the Supabase session so useAuth() picks it up
    const { error } = await supabase.auth.setSession({
      access_token: data.access_token,
      refresh_token: data.refresh_token,
    });
    if (error) throw error;
    setMlmAuthFailed(false);
  }, []);

  // ─── Data loaders ───────────────────────────
  const loadOverview = useCallback(async () => {
    setIsLoading(true);
    try {
      const data = await callMLMDashboard('overview',
        selectedStructure ? { baseNumber: selectedStructure } : {}
      );
      setStats(data.stats || {});
      setStructureAdmin(data.structureAdmin || null);
      setIsSuperAdmin(data.isSuperAdmin || false);
      setIsStructureAdmin(data.isStructureAdmin || false);
      setStructures(data.structures || []);
      setMlmAuthFailed(false);
    } catch (error: any) {
      console.error('MLM overview error:', error);
    } finally {
      setIsLoading(false);
    }
  }, [callMLMDashboard, selectedStructure]);

  const loadDownline = useCallback(async () => {
    try {
      const data = await callMLMDashboard('downline',
        selectedStructure ? { baseNumber: selectedStructure } : {}
      );
      setDownline(data.downline || []);
    } catch (error: any) {
      toast({ variant: 'destructive', title: 'Fehler', description: error.message });
    }
  }, [callMLMDashboard, selectedStructure, toast]);

  const loadTree = useCallback(async () => {
    try {
      const data = await callMLMDashboard('tree');
      setTreeData(data.tree || null);
    } catch (error: any) {
      toast({ variant: 'destructive', title: 'Fehler', description: error.message });
    }
  }, [callMLMDashboard, toast]);

  const loadCommissions = useCallback(async () => {
    try {
      const data = await callMLMDashboard('commissions',
        selectedStructure ? { baseNumber: selectedStructure } : {}
      );
      setCommissions(data.commissions || []);
      setLevelStats(data.levelStats || {});
    } catch (error: any) {
      toast({ variant: 'destructive', title: 'Fehler', description: error.message });
    }
  }, [callMLMDashboard, selectedStructure, toast]);

  const saveProfile = async () => {
    try {
      await callMLMDashboard('edit-profile', { profileData: editData });
      toast({ title: 'Gespeichert', description: 'Profil wurde aktualisiert' });
      setEditMode(false);
    } catch (error: any) {
      toast({ variant: 'destructive', title: 'Fehler', description: error.message });
    }
  };

  // ─── CRUD handlers ──────────────────────────
  const openAddPartner = () => {
    setEditingPartnerId(null);
    setPartnerForm(EMPTY_PARTNER);
    setShowPartnerForm(true);
  };

  const openEditPartner = (partner: any) => {
    const member = isStructureAdmin ? partner.profile : partner.user;
    setEditingPartnerId(member?.id);
    setPartnerForm({
      first_name: member?.first_name || '',
      last_name: member?.last_name || '',
      email: member?.email || '',
      phone: member?.phone || '',
      city: member?.city || '',
      street: member?.street || '',
      house_number: member?.house_number || '',
      postal_code: member?.postal_code || '',
      partner_number: member?.partner_number || '',
    });
    setShowPartnerForm(true);
  };

  const savePartner = async () => {
    setSavingPartner(true);
    try {
      if (editingPartnerId) {
        await callMLMDashboard('edit-partner', { partnerId: editingPartnerId, partnerData: partnerForm });
        toast({ title: 'Gespeichert', description: 'Partner wurde aktualisiert' });
      } else {
        await callMLMDashboard('add-partner', { partnerData: partnerForm });
        toast({ title: 'Erstellt', description: 'Neuer Partner wurde hinzugefügt' });
      }
      setShowPartnerForm(false);
      loadDownline();
    } catch (error: any) {
      toast({ variant: 'destructive', title: 'Fehler', description: error.message });
    } finally {
      setSavingPartner(false);
    }
  };

  const deletePartner = async (id: string, name: string) => {
    if (!confirm(`Partner "${name}" wirklich löschen?`)) return;
    try {
      await callMLMDashboard('delete-partner', { partnerId: id });
      toast({ title: 'Gelöscht', description: `Partner "${name}" wurde deaktiviert` });
      loadDownline();
    } catch (error: any) {
      toast({ variant: 'destructive', title: 'Fehler', description: error.message });
    }
  };

  // ─── Credential change handler ──────────────
  const saveCredentials = async () => {
    if (credForm.newPassword && credForm.newPassword !== credForm.confirmPassword) {
      toast({ variant: 'destructive', title: 'Fehler', description: 'Passwörter stimmen nicht überein' });
      return;
    }
    setSavingCreds(true);
    try {
      await callMLMDashboard('change-credentials', {
        newPassword: credForm.newPassword || undefined,
        newEmail: credForm.newEmail || undefined,
      });
      toast({ title: 'Gespeichert', description: 'Zugangsdaten wurden geändert' });
      setShowCredentials(false);
      setCredForm({ newPassword: '', confirmPassword: '', newEmail: '' });
    } catch (error: any) {
      toast({ variant: 'destructive', title: 'Fehler', description: error.message });
    } finally {
      setSavingCreds(false);
    }
  };

  // ─── Settings handlers ──────────────────────
  const loadSettings = useCallback(async () => {
    try {
      const data = await callMLMDashboard('get-settings');
      const settings = data.settings || [];
      setAllSettings(settings);
      setSettingsLoaded(true);

      // Extract commission rates and labels
      const rates: Record<number, number> = {};
      const labels: Record<string, string> = {};
      for (const s of settings) {
        if (s.key.startsWith('commission_rate_level_')) {
          const level = parseInt(s.key.replace('commission_rate_level_', ''));
          rates[level] = Number(s.value);
        }
        if (s.category === 'labels' || s.category === 'branding') {
          labels[s.key] = typeof s.value === 'string' ? s.value : String(s.value);
        }
      }
      if (Object.keys(rates).length > 0) setCommissionRates(rates);
      setDynamicLabels(labels);

      // Reset edits
      const edits: Record<string, any> = {};
      settings.forEach((s: MLMSetting) => {
        edits[s.key] = typeof s.value === 'string' ? s.value : JSON.stringify(s.value);
      });
      setSettingsEdits(edits);
    } catch (error: any) {
      console.error('Settings load error:', error);
    }
  }, [callMLMDashboard]);

  const saveSettings = async () => {
    setSavingSettings(true);
    try {
      const changes: Array<{ key: string; value: any }> = [];
      for (const s of allSettings) {
        const currentVal = typeof s.value === 'string' ? s.value : JSON.stringify(s.value);
        const editVal = settingsEdits[s.key];
        if (editVal !== currentVal) {
          // Try to parse as number for commission rates
          let parsedValue: any = editVal;
          if (s.key.startsWith('commission_rate_level_') || s.key === 'max_levels') {
            parsedValue = Number(editVal);
            if (isNaN(parsedValue)) parsedValue = editVal;
          }
          changes.push({ key: s.key, value: parsedValue });
        }
      }

      if (changes.length === 0) {
        toast({ title: 'Info', description: 'Keine Änderungen vorhanden' });
        setSavingSettings(false);
        return;
      }

      await callMLMDashboard('update-settings', { settings: changes });
      toast({ title: 'Gespeichert', description: `${changes.length} Einstellung(en) aktualisiert` });
      await loadSettings(); // Reload to get fresh data
    } catch (error: any) {
      toast({ variant: 'destructive', title: 'Fehler', description: error.message });
    } finally {
      setSavingSettings(false);
    }
  };

  const addNewSetting = async () => {
    if (!newSettingForm.key || !newSettingForm.value) {
      toast({ variant: 'destructive', title: 'Fehler', description: 'Schlüssel und Wert erforderlich' });
      return;
    }
    try {
      await callMLMDashboard('add-setting', newSettingForm);
      toast({ title: 'Erstellt', description: 'Neue Einstellung hinzugefügt' });
      setShowNewSetting(false);
      setNewSettingForm({ key: '', value: '', label: '', category: 'general' });
      await loadSettings();
    } catch (error: any) {
      toast({ variant: 'destructive', title: 'Fehler', description: error.message });
    }
  };

  const deleteSetting = async (key: string) => {
    if (!confirm(`Einstellung "${key}" wirklich löschen?`)) return;
    try {
      await callMLMDashboard('delete-setting', { key });
      toast({ title: 'Gelöscht', description: `Einstellung "${key}" wurde entfernt` });
      await loadSettings();
    } catch (error: any) {
      toast({ variant: 'destructive', title: 'Fehler', description: error.message });
    }
  };

  // ─── Effects ────────────────────────────────
  useEffect(() => {
    if (profile && !mlmAuthFailed) {
      loadOverview();
      // Load settings on initial load for dynamic labels/rates
      if (!settingsLoaded) loadSettings();
    }
  }, [profile, mlmAuthFailed, loadOverview, loadSettings, settingsLoaded]);

  useEffect(() => {
    if (mlmAuthFailed) return;
    if (activeTab === 'downline') loadDownline();
    if (activeTab === 'tree') loadTree();
    if (activeTab === 'commissions') loadCommissions();
    if (activeTab === 'settings' && !settingsLoaded) loadSettings();
  }, [activeTab, mlmAuthFailed, loadDownline, loadTree, loadCommissions, loadSettings, settingsLoaded]);

  // ─── Format helpers ─────────────────────────
  const fmt = (n: number) => new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR' }).format(n);
  const formatDate = (d: string) => new Date(d).toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' });
  const getLabel = (key: string, fallback: string) => dynamicLabels[key] || fallback;

  // Filter sidebar items based on admin status
  const visibleSidebarItems = sidebarItems.filter(item => 
    !item.adminOnly || isSuperAdmin
  );

  // ─── LOADING STATE ──────────────────────────
  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-mlm-loading">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  // ─── LOGIN GATE ─────────────────────────────
  if (!user || mlmAuthFailed) {
    return <MLMLoginScreen onLogin={handleMLMLogin} />;
  }

  if (!profile) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-mlm-loading">
        <div className="text-center">
          <Loader2 className="h-8 w-8 animate-spin mx-auto mb-4 text-primary" />
          <p className="text-muted-foreground">Profil wird geladen...</p>
        </div>
      </div>
    );
  }

  if (isLoading && !stats.totalPartners && !stats.totalDownline) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-cyber">
        <div className="text-center">
          <Loader2 className="h-8 w-8 animate-spin mx-auto mb-4 text-primary" />
          <p className="text-muted-foreground">MLM Dashboard laden...</p>
        </div>
      </div>
    );
  }

  const groups = [...new Set(visibleSidebarItems.map(i => i.group))];
  const currentItem = visibleSidebarItems.find(i => i.id === activeTab);
  const partnerNumber = profile?.partner_number || structureAdmin?.base_number || '—';

  // ────────────────────────────────────────────
  // RENDER CONTENT
  // ────────────────────────────────────────────
  const renderContent = () => {
    switch (activeTab) {
      case 'overview':
        return (
          <div className="space-y-6">
            {/* Structure Info Banner */}
            {(isStructureAdmin || isSuperAdmin) && (
              <Card className="border-primary/30 bg-primary/5">
                <CardContent className="pt-4 pb-4">
                  <div className="flex items-center justify-between flex-wrap gap-3">
                    <div className="flex items-center gap-3">
                      <div className="h-10 w-10 rounded-full bg-primary/20 flex items-center justify-center">
                        <Building2 className="h-5 w-5 text-primary" />
                      </div>
                      <div>
                        <p className="font-bold text-lg">
                          {structureAdmin?.structure_name || 'Alle Strukturen'}
                        </p>
                        <p className="text-sm text-muted-foreground">
                          {structureAdmin
                            ? `Struktur-Admin: ${structureAdmin.admin_name} · Basis: ${structureAdmin.base_number}`
                            : 'Super Administrator · Gesamtübersicht'
                          }
                        </p>
                      </div>
                    </div>
                    {isSuperAdmin && structures.length > 0 && (
                      <select
                        className="bg-background border rounded-md px-3 py-2 text-sm"
                        value={selectedStructure}
                        onChange={(e) => setSelectedStructure(e.target.value)}
                        aria-label="Struktur auswählen"
                      >
                        <option value="">Alle Strukturen</option>
                        {structures.map((s: any) => (
                          <option key={s.id} value={s.base_number}>
                            {s.structure_name} ({s.base_number}) - {s.admin_name}
                          </option>
                        ))}
                      </select>
                    )}
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Stats Cards */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
              <Card>
                <CardContent className="pt-5 pb-4">
                  <div className="flex items-center gap-3">
                    <div className="h-10 w-10 rounded-lg bg-blue-500/10 flex items-center justify-center">
                      <Users className="h-5 w-5 text-blue-500" />
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground">
                        {isStructureAdmin ? getLabel('label_total_partners', 'Partner gesamt') : getLabel('label_total_downline', 'Downline gesamt')}
                      </p>
                      <p className="text-2xl font-bold">
                        {stats.totalPartners ?? stats.totalDownline ?? 0}
                      </p>
                    </div>
                  </div>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="pt-5 pb-4">
                  <div className="flex items-center gap-3">
                    <div className="h-10 w-10 rounded-lg bg-green-500/10 flex items-center justify-center">
                      <TrendingUp className="h-5 w-5 text-green-500" />
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground">{getLabel('label_active_partners', 'Aktive Partner')}</p>
                      <p className="text-2xl font-bold">
                        {stats.activePartners ?? stats.level1 ?? 0}
                      </p>
                    </div>
                  </div>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="pt-5 pb-4">
                  <div className="flex items-center gap-3">
                    <div className="h-10 w-10 rounded-lg bg-yellow-500/10 flex items-center justify-center">
                      <Euro className="h-5 w-5 text-yellow-500" />
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground">{getLabel('label_pending', 'Ausstehend')}</p>
                      <p className="text-2xl font-bold">{fmt(stats.pendingCommissions || 0)}</p>
                    </div>
                  </div>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="pt-5 pb-4">
                  <div className="flex items-center gap-3">
                    <div className="h-10 w-10 rounded-lg bg-emerald-500/10 flex items-center justify-center">
                      <Euro className="h-5 w-5 text-emerald-500" />
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground">{getLabel('label_paid', 'Ausgezahlt')}</p>
                      <p className="text-2xl font-bold">{fmt(stats.paidCommissions || 0)}</p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>

            {/* Level Breakdown (for partners) */}
            {!isStructureAdmin && (
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Network className="h-5 w-5" />
                    {getLabel('section_level_overview', '5-Stufen Übersicht')}
                  </CardTitle>
                  <CardDescription>
                    {getLabel('section_level_overview_desc', 'Verteilung Ihrer Downline nach Stufen mit Provisionssätzen')}
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-5 gap-3">
                    {Object.keys(commissionRates).map(k => Number(k)).sort().map(level => {
                      const count = stats[`level${level}`] || 0;
                      const rate = commissionRates[level] ?? 0;
                      return (
                        <div key={level} className="text-center p-4 rounded-lg bg-muted/50 border">
                          <p className="text-xs text-muted-foreground mb-1">Stufe {level}</p>
                          <p className="text-2xl font-bold">{count}</p>
                          <Badge variant="outline" className="mt-2 text-xs">
                            {rate}% Provision
                          </Badge>
                        </div>
                      );
                    })}
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Commission Rate Table */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <BarChart3 className="h-5 w-5" />
                  {getLabel('section_commission_table', 'Provisionsstufen')}
                </CardTitle>
              </CardHeader>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Stufe</TableHead>
                      <TableHead>Beschreibung</TableHead>
                      <TableHead className="text-right">Provision</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {Object.entries(commissionRates).sort(([a], [b]) => Number(a) - Number(b)).map(([level, rate]) => (
                      <TableRow key={level}>
                        <TableCell>
                          <Badge variant="outline">Level {level}</Badge>
                        </TableCell>
                        <TableCell className="text-muted-foreground">
                          {getLabel(`level_${level}_description`,
                            level === '1' ? 'Direkt geworbene Partner' :
                            `Partner auf Stufe ${level} (durch Stufe ${Number(level) - 1} geworben)`
                          )}
                        </TableCell>
                        <TableCell className="text-right font-bold text-primary">{rate}%</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </div>
        );

      case 'downline':
        return (
          <div className="space-y-6">
            {/* Header with CRUD buttons */}
            <div className="flex items-center justify-between flex-wrap gap-3">
              <div>
                <h2 className="text-xl font-bold">Meine Struktur</h2>
                <p className="text-sm text-muted-foreground">
                  {isStructureAdmin
                    ? `Alle Partner in der ${structureAdmin?.structure_name}-Struktur (${structureAdmin?.base_number})`
                    : 'Ihre direkte und indirekte Downline (bis 5 Stufen)'
                  }
                </p>
              </div>
              <div className="flex gap-2">
                <Button onClick={openAddPartner} size="sm" className="bg-green-600 hover:bg-green-700">
                  <Plus className="h-4 w-4 mr-2" />
                  Hinzufügen
                </Button>
                <Button onClick={loadDownline} variant="outline" size="sm">
                  <RefreshCw className="h-4 w-4 mr-2" />
                  Aktualisieren
                </Button>
              </div>
            </div>

            {/* Add/Edit Partner Form */}
            {showPartnerForm && (
              <Card className="border-primary/30 bg-primary/5">
                <CardHeader className="pb-3">
                  <CardTitle className="text-base">
                    {editingPartnerId ? 'Partner bearbeiten' : 'Neuen Partner hinzufügen'}
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                    <div className="space-y-1">
                      <Label className="text-xs">Vorname *</Label>
                      <Input value={partnerForm.first_name}
                        onChange={(e) => setPartnerForm(p => ({ ...p, first_name: e.target.value }))}
                        placeholder="Vorname" />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs">Nachname *</Label>
                      <Input value={partnerForm.last_name}
                        onChange={(e) => setPartnerForm(p => ({ ...p, last_name: e.target.value }))}
                        placeholder="Nachname" />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs">E-Mail *</Label>
                      <Input type="email" value={partnerForm.email}
                        onChange={(e) => setPartnerForm(p => ({ ...p, email: e.target.value }))}
                        placeholder="email@example.com" />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs">Telefon</Label>
                      <Input value={partnerForm.phone}
                        onChange={(e) => setPartnerForm(p => ({ ...p, phone: e.target.value }))}
                        placeholder="+49..." />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs">Stadt</Label>
                      <Input value={partnerForm.city}
                        onChange={(e) => setPartnerForm(p => ({ ...p, city: e.target.value }))}
                        placeholder="Stadt" />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs">Partner-Nr.</Label>
                      <Input value={partnerForm.partner_number}
                        onChange={(e) => setPartnerForm(p => ({ ...p, partner_number: e.target.value }))}
                        placeholder="Auto" />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs">Straße</Label>
                      <Input value={partnerForm.street}
                        onChange={(e) => setPartnerForm(p => ({ ...p, street: e.target.value }))}
                        placeholder="Straße" />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs">Hausnr.</Label>
                      <Input value={partnerForm.house_number}
                        onChange={(e) => setPartnerForm(p => ({ ...p, house_number: e.target.value }))}
                        placeholder="Nr." />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs">PLZ</Label>
                      <Input value={partnerForm.postal_code}
                        onChange={(e) => setPartnerForm(p => ({ ...p, postal_code: e.target.value }))}
                        placeholder="PLZ" />
                    </div>
                  </div>
                  <div className="flex gap-2 justify-end">
                    <Button variant="outline" size="sm" onClick={() => setShowPartnerForm(false)}>
                      <X className="h-4 w-4 mr-1" /> Abbrechen
                    </Button>
                    <Button size="sm" onClick={savePartner} disabled={savingPartner}>
                      {savingPartner ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <Save className="h-4 w-4 mr-1" />}
                      {editingPartnerId ? 'Speichern' : 'Erstellen'}
                    </Button>
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Downline Table */}
            {downline.length === 0 ? (
              <Card>
                <CardContent className="py-12 text-center">
                  <Users className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
                  <p className="text-muted-foreground">Noch keine Partner in Ihrer Struktur.</p>
                  <p className="text-sm text-muted-foreground mt-2">
                    Klicken Sie auf "Hinzufügen", um einen Partner anzulegen.
                  </p>
                </CardContent>
              </Card>
            ) : (
              <Card>
                <CardContent className="pt-6">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Partner-Nr.</TableHead>
                        <TableHead>Name</TableHead>
                        <TableHead>E-Mail</TableHead>
                        <TableHead>Stufe</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead>Aktiv</TableHead>
                        <TableHead className="text-right">Aktionen</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {downline.map((item: any) => {
                        const member = isStructureAdmin ? item.profile : item.user;
                        const partnerNum = isStructureAdmin ? item.partner_number : member?.partner_number;
                        const level = isStructureAdmin ? item.level_in_structure : item.level_number;
                        const memberId = member?.id;
                        const memberName = `${member?.first_name || ''} ${member?.last_name || ''}`.trim();
                        return (
                          <TableRow key={item.id || partnerNum}>
                            <TableCell>
                              <Badge variant="outline" className="font-mono">
                                {partnerNum || '—'}
                              </Badge>
                            </TableCell>
                            <TableCell>
                              <div className="flex items-center gap-2">
                                <div className="w-7 h-7 rounded-full bg-primary/10 flex items-center justify-center text-xs font-medium">
                                  {member?.first_name?.[0]}{member?.last_name?.[0]}
                                </div>
                                <span className="font-medium">{memberName}</span>
                              </div>
                            </TableCell>
                            <TableCell className="text-muted-foreground">
                              {member?.email}
                            </TableCell>
                            <TableCell>
                              <Badge variant="secondary">Stufe {level || '—'}</Badge>
                            </TableCell>
                            <TableCell>
                              <Badge variant={member?.status === 'active' ? 'default' : 'outline'}>
                                {member?.status === 'active' ? 'Aktiv' : member?.status === 'deleted' ? 'Gelöscht' : 'Ausstehend'}
                              </Badge>
                            </TableCell>
                            <TableCell>
                              {item.is_active_for_commission ? (
                                <Check className="h-4 w-4 text-green-500" />
                              ) : (
                                <X className="h-4 w-4 text-muted-foreground" />
                              )}
                            </TableCell>
                            <TableCell className="text-right">
                              <div className="flex gap-1 justify-end">
                                <Button variant="ghost" size="icon" className="h-7 w-7"
                                  onClick={() => openEditPartner(item)}
                                  title="Bearbeiten">
                                  <Edit3 className="h-3.5 w-3.5" />
                                </Button>
                                {memberId && member?.status !== 'deleted' && (
                                  <Button variant="ghost" size="icon" className="h-7 w-7 text-red-500 hover:text-red-600"
                                    onClick={() => deletePartner(memberId, memberName)}
                                    title="Löschen">
                                    <Trash2 className="h-3.5 w-3.5" />
                                  </Button>
                                )}
                              </div>
                            </TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                </CardContent>
              </Card>
            )}
          </div>
        );

      case 'tree':
        return (
          <div className="space-y-6">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-xl font-bold">Baumansicht</h2>
                <p className="text-sm text-muted-foreground">
                  Hierarchische Darstellung Ihrer Partner-Struktur
                </p>
              </div>
              <Button onClick={loadTree} variant="outline" size="sm">
                <RefreshCw className="h-4 w-4 mr-2" />
                Aktualisieren
              </Button>
            </div>
            <Card>
              <CardContent className="pt-6">
                {treeData ? (
                  <MLMTreeView
                    data={treeData}
                    maxExpandLevel={3}
                    onNodeClick={(node) => {
                      if (node.partner_number) {
                        toast({
                          title: node.name,
                          description: `Partner-Nr: ${node.partner_number} · Level: ${node.level} · Status: ${node.status || 'unbekannt'}`,
                        });
                      }
                    }}
                  />
                ) : (
                  <div className="text-center py-12">
                    <GitBranch className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
                    <p className="text-muted-foreground">Keine Baumdaten verfügbar.</p>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        );

      case 'commissions':
        return (
          <div className="space-y-6">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-xl font-bold">Provisionen</h2>
                <p className="text-sm text-muted-foreground">
                  Ihre Provisionshistorie und Auswertungen
                </p>
              </div>
              <Button onClick={loadCommissions} variant="outline" size="sm">
                <RefreshCw className="h-4 w-4 mr-2" />
                Aktualisieren
              </Button>
            </div>

            {/* Level Stats Summary */}
            {Object.keys(levelStats).length > 0 && (
              <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
                {Object.keys(commissionRates).map(k => Number(k)).sort().map(level => {
                  const stat = levelStats[level];
                  return (
                    <Card key={level}>
                      <CardContent className="pt-4 pb-3 text-center">
                        <p className="text-xs text-muted-foreground">Stufe {level} ({commissionRates[level] ?? 0}%)</p>
                        <p className="text-lg font-bold">{stat?.count || 0}x</p>
                        <p className="text-sm text-primary font-medium">{fmt(stat?.total || 0)}</p>
                      </CardContent>
                    </Card>
                  );
                })}
              </div>
            )}

            {/* Commission Totals */}
            <div className="grid grid-cols-3 gap-4">
              <Card className="border-yellow-500/30">
                <CardContent className="pt-4">
                  <p className="text-sm text-muted-foreground">{getLabel('label_pending', 'Ausstehend')}</p>
                  <p className="text-2xl font-bold text-yellow-500">{fmt(stats.pendingCommissions || 0)}</p>
                </CardContent>
              </Card>
              <Card className="border-blue-500/30">
                <CardContent className="pt-4">
                  <p className="text-sm text-muted-foreground">{getLabel('label_approved', 'Genehmigt')}</p>
                  <p className="text-2xl font-bold text-blue-500">{fmt(stats.approvedCommissions || 0)}</p>
                </CardContent>
              </Card>
              <Card className="border-green-500/30">
                <CardContent className="pt-4">
                  <p className="text-sm text-muted-foreground">{getLabel('label_paid', 'Ausgezahlt')}</p>
                  <p className="text-2xl font-bold text-green-500">{fmt(stats.paidCommissions || 0)}</p>
                </CardContent>
              </Card>
            </div>

            {/* Commissions Table */}
            <Card>
              <CardContent className="pt-6">
                {commissions.length === 0 ? (
                  <div className="text-center py-12">
                    <Euro className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
                    <p className="text-muted-foreground">Noch keine Provisionen vorhanden.</p>
                  </div>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Datum</TableHead>
                        <TableHead>Kunde</TableHead>
                        <TableHead>Stufe</TableHead>
                        <TableHead>Betrag</TableHead>
                        <TableHead>Status</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {commissions.map((c: any) => (
                        <TableRow key={c.id}>
                          <TableCell>{formatDate(c.created_at)}</TableCell>
                          <TableCell className="text-muted-foreground">
                            {c.transaction?.customer?.first_name} {c.transaction?.customer?.last_name}
                            {c.transaction?.customer?.partner_number && (
                              <Badge variant="outline" className="ml-2 text-[10px]">
                                #{c.transaction.customer.partner_number}
                              </Badge>
                            )}
                          </TableCell>
                          <TableCell>
                            <Badge variant="outline">Stufe {c.level_number || 1}</Badge>
                          </TableCell>
                          <TableCell className="font-medium">{fmt(c.commission_amount)}</TableCell>
                          <TableCell>
                            <Badge variant={
                              c.status === 'paid' ? 'default' :
                              c.status === 'approved' ? 'secondary' : 'outline'
                            }>
                              {c.status === 'paid' ? 'Ausgezahlt' :
                               c.status === 'approved' ? 'Genehmigt' : 'Ausstehend'}
                            </Badge>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </CardContent>
            </Card>
          </div>
        );

      case 'profile':
        return (
          <div className="space-y-6">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-xl font-bold">{getLabel('profile_title', 'Mein Profil')}</h2>
                <p className="text-sm text-muted-foreground">
                  Persönliche Daten einsehen und bearbeiten
                </p>
              </div>
              {!editMode ? (
                <Button onClick={() => {
                  setEditMode(true);
                  setEditData({
                    phone: profile.phone || '',
                    email: profile.email || '',
                    street: profile.street || '',
                    house_number: profile.house_number || '',
                    postal_code: profile.postal_code || '',
                    city: profile.city || '',
                  });
                }} variant="outline" size="sm">
                  <Edit3 className="h-4 w-4 mr-2" />
                  Bearbeiten
                </Button>
              ) : (
                <div className="flex gap-2">
                  <Button onClick={saveProfile} size="sm">
                    <Save className="h-4 w-4 mr-2" />
                    Speichern
                  </Button>
                  <Button onClick={() => setEditMode(false)} variant="outline" size="sm">
                    <X className="h-4 w-4 mr-2" />
                    Abbrechen
                  </Button>
                </div>
              )}
            </div>

            <div className="grid md:grid-cols-2 gap-6">
              {/* Locked Data */}
              <Card>
                <CardHeader>
                  <CardTitle className="text-base flex items-center gap-2">
                    <Shield className="h-4 w-4" />
                    Stammdaten (gesperrt)
                  </CardTitle>
                  <CardDescription>
                    Diese Daten können nicht geändert werden
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div>
                    <Label className="text-xs text-muted-foreground">Vorname</Label>
                    <p className="font-medium">{profile.first_name}</p>
                  </div>
                  <div>
                    <Label className="text-xs text-muted-foreground">Nachname</Label>
                    <p className="font-medium">{profile.last_name}</p>
                  </div>
                  <div>
                    <Label className="text-xs text-muted-foreground">Geburtsdatum</Label>
                    <p className="font-medium">{profile.date_of_birth ? formatDate(profile.date_of_birth) : '—'}</p>
                  </div>
                  <div>
                    <Label className="text-xs text-muted-foreground">Partner-Nummer</Label>
                    <div className="flex items-center gap-2">
                      <Badge variant="outline" className="font-mono text-sm">{partnerNumber}</Badge>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-6 w-6"
                        onClick={() => {
                          navigator.clipboard.writeText(partnerNumber);
                          toast({ title: 'Kopiert', description: 'Partner-Nummer in die Zwischenablage kopiert' });
                        }}
                      >
                        <Copy className="h-3 w-3" />
                      </Button>
                    </div>
                  </div>
                  <div>
                    <Label className="text-xs text-muted-foreground">Promotion-Code</Label>
                    <div className="flex items-center gap-2">
                      <Badge variant="default" className="font-mono text-sm">{profile.promotion_code || partnerNumber}</Badge>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-6 w-6"
                        onClick={() => {
                          navigator.clipboard.writeText(profile.promotion_code || partnerNumber);
                          toast({ title: 'Kopiert', description: 'Promotion-Code in die Zwischenablage kopiert' });
                        }}
                      >
                        <Copy className="h-3 w-3" />
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>

              {/* Editable Data */}
              <Card>
                <CardHeader>
                  <CardTitle className="text-base flex items-center gap-2">
                    <UserCog className="h-4 w-4" />
                    Kontaktdaten {editMode && <Badge variant="secondary">Bearbeiten</Badge>}
                  </CardTitle>
                  <CardDescription>
                    {editMode ? 'Ändern Sie Ihre Kontaktdaten' : 'Diese Daten können Sie ändern'}
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  {editMode ? (
                    <>
                      <div className="space-y-2">
                        <Label htmlFor="phone">Telefon</Label>
                        <Input id="phone" value={editData.phone || ''} onChange={(e) => setEditData(prev => ({ ...prev, phone: e.target.value }))} />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="email">E-Mail</Label>
                        <Input id="email" type="email" value={editData.email || ''} onChange={(e) => setEditData(prev => ({ ...prev, email: e.target.value }))} />
                      </div>
                      <div className="grid grid-cols-3 gap-2">
                        <div className="col-span-2 space-y-2">
                          <Label htmlFor="street">Straße</Label>
                          <Input id="street" value={editData.street || ''} onChange={(e) => setEditData(prev => ({ ...prev, street: e.target.value }))} />
                        </div>
                        <div className="space-y-2">
                          <Label htmlFor="house_number">Nr.</Label>
                          <Input id="house_number" value={editData.house_number || ''} onChange={(e) => setEditData(prev => ({ ...prev, house_number: e.target.value }))} />
                        </div>
                      </div>
                      <div className="grid grid-cols-3 gap-2">
                        <div className="space-y-2">
                          <Label htmlFor="postal_code">PLZ</Label>
                          <Input id="postal_code" value={editData.postal_code || ''} onChange={(e) => setEditData(prev => ({ ...prev, postal_code: e.target.value }))} />
                        </div>
                        <div className="col-span-2 space-y-2">
                          <Label htmlFor="city">Stadt</Label>
                          <Input id="city" value={editData.city || ''} onChange={(e) => setEditData(prev => ({ ...prev, city: e.target.value }))} />
                        </div>
                      </div>
                    </>
                  ) : (
                    <>
                      <div>
                        <Label className="text-xs text-muted-foreground">Telefon</Label>
                        <p className="font-medium">{profile.phone || '—'}</p>
                      </div>
                      <div>
                        <Label className="text-xs text-muted-foreground">E-Mail</Label>
                        <p className="font-medium">{profile.email}</p>
                      </div>
                      <div>
                        <Label className="text-xs text-muted-foreground">Adresse</Label>
                        <p className="font-medium">
                          {profile.street ? `${profile.street} ${profile.house_number || ''}` : '—'}
                        </p>
                        <p className="font-medium">
                          {profile.postal_code || ''} {profile.city || ''}
                        </p>
                      </div>
                    </>
                  )}
                </CardContent>
              </Card>
            </div>

            {/* Credential Change Section */}
            <Card className="border-orange-500/20">
              <CardHeader>
                <div className="flex items-center justify-between">
                  <CardTitle className="text-base flex items-center gap-2">
                    <KeyRound className="h-4 w-4" />
                    Zugangsdaten ändern
                  </CardTitle>
                  <Button variant="outline" size="sm" onClick={() => setShowCredentials(!showCredentials)}>
                    {showCredentials ? 'Schließen' : 'Ändern'}
                  </Button>
                </div>
                <CardDescription>
                  Passwort oder E-Mail-Adresse für den Login ändern
                </CardDescription>
              </CardHeader>
              {showCredentials && (
                <CardContent className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="cred-password">Neues Passwort</Label>
                    <Input id="cred-password" type="password" value={credForm.newPassword}
                      onChange={(e) => setCredForm(p => ({ ...p, newPassword: e.target.value }))}
                      placeholder="Neues Passwort eingeben" />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="cred-confirm">Passwort bestätigen</Label>
                    <Input id="cred-confirm" type="password" value={credForm.confirmPassword}
                      onChange={(e) => setCredForm(p => ({ ...p, confirmPassword: e.target.value }))}
                      placeholder="Passwort wiederholen" />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="cred-email">Neue E-Mail (optional)</Label>
                    <Input id="cred-email" type="email" value={credForm.newEmail}
                      onChange={(e) => setCredForm(p => ({ ...p, newEmail: e.target.value }))}
                      placeholder="Neue Login-E-Mail" />
                  </div>
                  <div className="flex gap-2 justify-end">
                    <Button variant="outline" size="sm" onClick={() => {
                      setShowCredentials(false);
                      setCredForm({ newPassword: '', confirmPassword: '', newEmail: '' });
                    }}>
                      Abbrechen
                    </Button>
                    <Button size="sm" onClick={saveCredentials} disabled={savingCreds}
                      className="bg-orange-600 hover:bg-orange-700">
                      {savingCreds ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <Save className="h-4 w-4 mr-1" />}
                      Zugangsdaten speichern
                    </Button>
                  </div>
                </CardContent>
              )}
            </Card>
          </div>
        );

      case 'settings':
        return (
          <div className="space-y-6">
            <div className="flex items-center justify-between flex-wrap gap-3">
              <div>
                <h2 className="text-xl font-bold">Verwaltung & Einstellungen</h2>
                <p className="text-sm text-muted-foreground">
                  Provisionen, Texte und Beschriftungen verwalten — alle Änderungen werden in der Datenbank gespeichert
                </p>
              </div>
              <div className="flex gap-2">
                <Button onClick={() => setShowNewSetting(true)} variant="outline" size="sm">
                  <Plus className="h-4 w-4 mr-2" />
                  Neu
                </Button>
                <Button onClick={loadSettings} variant="outline" size="sm">
                  <RefreshCw className="h-4 w-4 mr-2" />
                  Laden
                </Button>
                <Button onClick={saveSettings} size="sm" disabled={savingSettings}
                  className="bg-green-600 hover:bg-green-700">
                  {savingSettings ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Save className="h-4 w-4 mr-2" />}
                  Alle speichern
                </Button>
              </div>
            </div>

            {/* Add New Setting Form */}
            {showNewSetting && (
              <Card className="border-primary/30 bg-primary/5">
                <CardHeader className="pb-3">
                  <CardTitle className="text-base">Neue Einstellung hinzufügen</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                    <div className="space-y-1">
                      <Label className="text-xs">Schlüssel *</Label>
                      <Input value={newSettingForm.key}
                        onChange={(e) => setNewSettingForm(p => ({ ...p, key: e.target.value }))}
                        placeholder="z.B. custom_text_1" />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs">Wert *</Label>
                      <Input value={newSettingForm.value}
                        onChange={(e) => setNewSettingForm(p => ({ ...p, value: e.target.value }))}
                        placeholder="Wert eingeben" />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs">Bezeichnung</Label>
                      <Input value={newSettingForm.label}
                        onChange={(e) => setNewSettingForm(p => ({ ...p, label: e.target.value }))}
                        placeholder="Beschreibung" />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs">Kategorie</Label>
                      <select className="w-full h-9 rounded-md border border-input bg-background px-3 py-1 text-sm"
                        value={newSettingForm.category}
                        onChange={(e) => setNewSettingForm(p => ({ ...p, category: e.target.value }))}
                        aria-label="Kategorie auswählen">
                        <option value="general">Allgemein</option>
                        <option value="commissions">Provisionen</option>
                        <option value="labels">Beschriftungen</option>
                        <option value="branding">Branding</option>
                      </select>
                    </div>
                  </div>
                  <div className="flex gap-2 justify-end">
                    <Button variant="outline" size="sm" onClick={() => setShowNewSetting(false)}>
                      <X className="h-4 w-4 mr-1" /> Abbrechen
                    </Button>
                    <Button size="sm" onClick={addNewSetting}>
                      <Plus className="h-4 w-4 mr-1" /> Erstellen
                    </Button>
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Settings by Category */}
            {(() => {
              const categories = [...new Set(allSettings.map(s => s.category))].sort();
              const categoryLabels: Record<string, string> = {
                commissions: 'Provisionen',
                labels: 'Beschriftungen & Texte',
                branding: 'Branding & Firmendaten',
                general: 'Allgemein',
              };
              return categories.map(cat => (
                <Card key={cat}>
                  <CardHeader>
                    <CardTitle className="text-base flex items-center gap-2">
                      <Settings className="h-4 w-4" />
                      {categoryLabels[cat] || cat}
                    </CardTitle>
                    <CardDescription>
                      {cat === 'commissions' ? 'Provisionssätze pro Stufe konfigurieren' :
                       cat === 'labels' ? 'Texte, Beschreibungen und Bezeichnungen anpassen' :
                       cat === 'branding' ? 'Firmenname, Titel und Branding-Texte' :
                       'Allgemeine Systemeinstellungen'}
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-3">
                      {allSettings.filter(s => s.category === cat).map(setting => (
                        <div key={setting.key} className="flex items-center gap-3 p-3 rounded-lg bg-muted/30 border">
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 mb-1">
                              <span className="text-sm font-medium">{setting.label}</span>
                              <Badge variant="outline" className="text-[10px] font-mono">{setting.key}</Badge>
                            </div>
                            <Input
                              value={settingsEdits[setting.key] ?? ''}
                              onChange={(e) => setSettingsEdits(prev => ({ ...prev, [setting.key]: e.target.value }))}
                              className="h-8 text-sm"
                            />
                          </div>
                          <Button variant="ghost" size="icon" className="h-8 w-8 text-red-500 hover:text-red-600 shrink-0"
                            onClick={() => deleteSetting(setting.key)}
                            title="Löschen">
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              ));
            })()}
          </div>
        );

      default:
        return null;
    }
  };

  // ──────────────────── MAIN LAYOUT ────────────────────
  return (
    <div className="min-h-screen flex bg-background">
      {/* Sidebar */}
      <aside
        className={cn(
          "fixed inset-y-0 left-0 z-50 flex flex-col border-r transition-all duration-300 ease-in-out",
          "bg-sidebar text-sidebar-foreground border-sidebar-border",
          sidebarCollapsed ? "w-[68px]" : "w-[260px]",
          "lg:relative",
          !sidebarOpen && "lg:flex -translate-x-full lg:translate-x-0"
        )}
      >
        {/* Logo */}
        <div className="flex items-center gap-3 px-4 h-16 shrink-0 border-b border-sidebar-border">
          <img
            src={logoIcon}
            alt="GAP"
            className="h-9 w-9 shrink-0 rounded-lg p-0.5 bg-mlm-logo-gradient brightness-[1.3]"
          />
          {!sidebarCollapsed && (
            <div className="overflow-hidden">
              <h1 className="text-sm font-bold truncate text-sidebar-primary">GAP Protection</h1>
              <p className="text-[10px] text-white/50">MLM Dashboard</p>
            </div>
          )}
        </div>

        {/* Partner Number Display */}
        {!sidebarCollapsed && (
          <div className="px-4 py-3 border-b border-sidebar-border">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-cyan-500/20 rounded-full flex items-center justify-center text-cyan-400 font-medium text-sm">
                {profile?.first_name?.[0]}{profile?.last_name?.[0]}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-white truncate">
                  {profile?.first_name} {profile?.last_name}
                </p>
                <div className="flex items-center gap-1.5">
                  <Badge className="text-[9px] px-1 py-0 bg-cyan-500/20 text-cyan-300 border-cyan-500/30">
                    {isStructureAdmin ? 'Struktur-Admin' : isSuperAdmin ? 'Super Admin' : 'Partner'}
                  </Badge>
                  <span className="text-[10px] text-white/40 font-mono">#{partnerNumber}</span>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Navigation */}
        <ScrollArea className="flex-1 py-3">
          <nav className="space-y-1 px-2">
            {groups.map(group => (
              <div key={group} className="mb-3">
                {!sidebarCollapsed && (
                  <p className="px-3 mb-1.5 text-[10px] font-semibold uppercase tracking-widest text-white/40">
                    {group}
                  </p>
                )}
                {visibleSidebarItems.filter(i => i.group === group).map(item => {
                  const isActive = activeTab === item.id;
                  return (
                    <button
                      key={item.id}
                      onClick={() => { setActiveTab(item.id); setSidebarOpen(false); }}
                      className={cn(
                        "w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-all group",
                        isActive
                          ? "bg-cyan-500/20 text-cyan-400 font-medium"
                          : "text-white/80 hover:bg-white/10 hover:text-white"
                      )}
                      title={sidebarCollapsed ? item.label : undefined}
                    >
                      <item.icon className={cn(
                        "h-4 w-4 shrink-0 transition-colors",
                        isActive ? "text-cyan-400" : "text-white/50 group-hover:text-white/80"
                      )} />
                      {!sidebarCollapsed && <span className="truncate">{item.label}</span>}
                      {!sidebarCollapsed && isActive && (
                        <ChevronRight className="h-3 w-3 ml-auto text-cyan-400/60" />
                      )}
                    </button>
                  );
                })}
              </div>
            ))}

            {/* System section removed — MLM users stay in MLM only */}
          </nav>
        </ScrollArea>

        {/* Footer */}
        <div className="p-3 shrink-0 border-t border-sidebar-border">
          <Button
            variant="ghost"
            className="w-full justify-start gap-3 text-white/50 hover:text-white hover:bg-white/10 h-9"
            onClick={async () => { try { await signOut(); } catch { /* ignore */ } setMlmAuthFailed(true); navigate('/mlm'); }}
          >
            <LogOut className="h-4 w-4" />
            {!sidebarCollapsed && <span className="text-sm">Abmelden</span>}
          </Button>
        </div>
      </aside>

      {/* Mobile overlay */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 bg-black/60 z-40 lg:hidden backdrop-blur-sm"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Main Content */}
      <main className="flex-1 flex flex-col min-w-0">
        {/* Top Bar */}
        <header className="sticky top-0 z-30 h-14 border-b border-border bg-background/80 backdrop-blur-md flex items-center gap-3 px-4 shrink-0">
          <Button
            variant="ghost"
            size="icon"
            className="lg:hidden h-8 w-8"
            onClick={() => setSidebarOpen(true)}
          >
            <Menu className="h-4 w-4" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="hidden lg:flex h-8 w-8"
            onClick={() => setSidebarCollapsed(!sidebarCollapsed)}
          >
            <Menu className="h-4 w-4" />
          </Button>

          {/* Breadcrumb */}
          <div className="flex items-center gap-2 text-sm">
            <span className="text-muted-foreground">MLM</span>
            <ChevronRight className="h-3 w-3 text-muted-foreground" />
            <span className="font-medium">{currentItem?.label || 'Übersicht'}</span>
          </div>

          <div className="ml-auto flex items-center gap-2">
            <Badge variant="outline" className="font-mono text-xs">
              #{partnerNumber}
            </Badge>
            <Button onClick={loadOverview} variant="ghost" size="icon" className="h-8 w-8">
              <RefreshCw className="h-4 w-4" />
            </Button>
          </div>
        </header>

        {/* Page Content */}
        <div className="flex-1 overflow-auto p-4 sm:p-6 lg:p-8">
          <div className="max-w-7xl mx-auto">
            {renderContent()}
          </div>
        </div>
      </main>
    </div>
  );
}
