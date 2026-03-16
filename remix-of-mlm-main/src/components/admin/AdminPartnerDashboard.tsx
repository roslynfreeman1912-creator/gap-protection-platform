import { useState, useEffect, useMemo, useCallback } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Progress } from '@/components/ui/progress';
import { supabase } from '@/integrations/supabase/client';
import {
  Users, Search, Loader2, Eye, Euro, Award, TrendingUp,
  CheckCircle, Gift, BarChart3, Network, RefreshCw, Edit, Trash2,
  ArrowUpRight, UserCheck, Crown, XCircle, Ban, UserPlus, UserMinus,
  ChevronLeft, ChevronRight, Filter, Calendar, Wallet, Save, ShieldCheck,
  MoreVertical, Globe
} from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem,
  DropdownMenuSeparator, DropdownMenuTrigger
} from '@/components/ui/dropdown-menu';
import { AreaChart, Area, BarChart, Bar, PieChart, Pie, Cell, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from 'recharts';

interface PartnerSummary {
  id: string;
  first_name: string;
  last_name: string;
  email: string;
  phone?: string | null;
  status: string;
  created_at: string;
  street?: string | null;
  house_number?: string | null;
  postal_code?: string | null;
  city?: string | null;
  country?: string | null;
  iban?: string | null;
  bic?: string | null;
  bank_name?: string | null;
  domain?: string | null;
  roles?: string[];
  sponsor?: { id: string; first_name: string; last_name: string; email: string } | null;
  promotion_codes?: { id: string; code: string; usage_count: number; is_active: boolean }[];
}

interface PartnerDashboardData {
  profile: any;
  stats: any;
  hierarchy: any[];
  commissions: any[];
  codes: any[];
  leadership: any;
  customers: any[];
}

const COMMISSION_COLORS = {
  pending: 'hsl(45 93% 47%)',
  approved: 'hsl(210 100% 50%)',
  paid: 'hsl(142 71% 45%)',
};

const LEVEL_COLORS = ['hsl(210 100% 50%)', 'hsl(142 71% 45%)', 'hsl(45 93% 47%)', 'hsl(0 84% 60%)', 'hsl(280 67% 50%)'];

export function AdminPartnerDashboard() {
  const { toast } = useToast();
  const [partners, setPartners] = useState<PartnerSummary[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [selectedPartner, setSelectedPartner] = useState<PartnerDashboardData | null>(null);
  const [showDashboard, setShowDashboard] = useState(false);
  const [dashLoading, setDashLoading] = useState(false);
  const [page, setPage] = useState(1);
  const perPage = 12;

  // Edit state
  const [showEditDialog, setShowEditDialog] = useState(false);
  const [editingPartner, setEditingPartner] = useState<PartnerSummary | null>(null);
  const [editForm, setEditForm] = useState<Record<string, string>>({});
  const [actionLoading, setActionLoading] = useState(false);

  // Add new partner state
  const [showAddDialog, setShowAddDialog] = useState(false);
  const [addForm, setAddForm] = useState({
    first_name: '', last_name: '', email: '', phone: '',
    street: '', house_number: '', postal_code: '', city: '', country: 'Deutschland',
    domain: '', make_partner: true, password: ''
  });

  const loadPartners = useCallback(async () => {
    setIsLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke('admin-partners', {
        body: { action: 'list', filters: { search: searchTerm || undefined, page: 1, limit: 200 } }
      });
      if (error) throw error;
      const all = (data.profiles || []) as PartnerSummary[];
      setPartners(all);
      setPage(1);
    } catch (error: any) {
      toast({ variant: 'destructive', title: 'Fehler', description: error.message });
    } finally {
      setIsLoading(false);
    }
  }, [searchTerm, toast]);

  const handleAction = async (action: string, profileId: string, partnerName?: string) => {
    if (action === 'delete') {
      if (!confirm(`"${partnerName}" wirklich löschen? Diese Aktion kann nicht rückgängig gemacht werden.`)) return;
    }
    setActionLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke('admin-partners', {
        body: { action, profileId }
      });
      if (error) throw error;
      toast({
        title: 'Erfolg',
        description: action === 'promote' ? `Partner befördert. Code: ${data.promotionCode}` :
          action === 'delete' ? 'Profil gelöscht' :
          action === 'activate' ? 'Partner aktiviert' :
          action === 'suspend' ? 'Partner gesperrt' :
          action === 'demote' ? 'Partner-Status entfernt' : 'Aktion erfolgreich'
      });
      loadPartners();
    } catch (error: any) {
      toast({ variant: 'destructive', title: 'Fehler', description: error.message });
    } finally {
      setActionLoading(false);
    }
  };

  const openEditDialog = (partner: PartnerSummary) => {
    setEditingPartner(partner);
    setEditForm({
      first_name: partner.first_name || '',
      last_name: partner.last_name || '',
      email: partner.email || '',
      phone: partner.phone || '',
      street: partner.street || '',
      house_number: partner.house_number || '',
      postal_code: partner.postal_code || '',
      city: partner.city || '',
      country: partner.country || 'Deutschland',
      iban: partner.iban || '',
      bic: partner.bic || '',
      bank_name: partner.bank_name || '',
    });
    setShowEditDialog(true);
  };

  const handleUpdateProfile = async () => {
    if (!editingPartner) return;
    setActionLoading(true);
    try {
      const { error } = await supabase.functions.invoke('admin-partners', {
        body: { action: 'update', profileId: editingPartner.id, data: editForm }
      });
      if (error) throw error;
      toast({ title: 'Erfolg', description: 'Profil wurde aktualisiert' });
      setShowEditDialog(false);
      loadPartners();
    } catch (error: any) {
      toast({ variant: 'destructive', title: 'Fehler', description: error.message });
    } finally {
      setActionLoading(false);
    }
  };

  const handleAddPartner = async () => {
    if (!addForm.first_name || !addForm.last_name || !addForm.email || !addForm.password) {
      toast({ variant: 'destructive', title: 'Fehler', description: 'Name, E-Mail und Passwort sind Pflichtfelder' });
      return;
    }
    setActionLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke('admin-partners', {
        body: {
          action: 'create',
          data: {
            email: addForm.email,
            password: addForm.password,
            first_name: addForm.first_name,
            last_name: addForm.last_name,
            phone: addForm.phone || null,
            street: addForm.street || null,
            house_number: addForm.house_number || null,
            postal_code: addForm.postal_code || null,
            city: addForm.city || null,
            country: addForm.country || 'Deutschland',
            domain: addForm.domain || null,
            make_partner: addForm.make_partner,
          }
        }
      });
      if (error) throw error;

      toast({ title: 'Erfolg', description: `Partner ${addForm.first_name} ${addForm.last_name} wurde erstellt` });
      setShowAddDialog(false);
      setAddForm({ first_name: '', last_name: '', email: '', phone: '', street: '', house_number: '', postal_code: '', city: '', country: 'Deutschland', domain: '', make_partner: true, password: '' });
      loadPartners();
    } catch (error: any) {
      toast({ variant: 'destructive', title: 'Fehler', description: error.message });
    } finally {
      setActionLoading(false);
    }
  };

  const hasRole = (p: PartnerSummary, role: string) => p.roles?.includes(role);

  const viewPartnerDashboard = async (partnerId: string) => {
    setDashLoading(true);
    setShowDashboard(true);
    try {
      const { data, error } = await supabase.functions.invoke('admin-partners', {
        body: { action: 'get', profileId: partnerId }
      });
      if (error) throw error;

      const [hierarchyRes, commissionsRes, codesRes, leadershipRes, payoutsRes] = await Promise.all([
        supabase.from('user_hierarchy')
          .select('id, level_number, is_active_for_commission, created_at, user:profiles!user_hierarchy_user_id_fkey (id, first_name, last_name, email, status, domain, phone, created_at)')
          .eq('ancestor_id', partnerId).order('level_number'),
        supabase.from('commissions')
          .select('*, transaction:transactions!commissions_transaction_id_fkey (id, amount, created_at, customer:profiles!transactions_customer_id_fkey (first_name, last_name, email, domain))')
          .eq('partner_id', partnerId).order('created_at', { ascending: false }).limit(100),
        supabase.from('promotion_codes').select('*').eq('partner_id', partnerId),
        supabase.from('leadership_qualifications').select('*').eq('partner_id', partnerId).maybeSingle(),
        supabase.from('leadership_pool_payouts').select('*').eq('partner_id', partnerId).order('created_at', { ascending: false }).limit(12),
      ]);

      const hierarchy = hierarchyRes.data || [];
      const commissions = commissionsRes.data || [];
      const codes = codesRes.data || [];

      // Extract unique customers from hierarchy (level 1 = direct customers/partners)
      const customers = hierarchy
        .filter((h: any) => h.level_number === 1 && h.user)
        .map((h: any) => ({
          ...h.user,
          level: h.level_number,
          commission_active: h.is_active_for_commission,
          joined_at: h.created_at
        }));

      const l1 = hierarchy.filter((h: any) => h.level_number === 1).length;
      const l2 = hierarchy.filter((h: any) => h.level_number === 2).length;
      const l3 = hierarchy.filter((h: any) => h.level_number === 3).length;
      const l4 = hierarchy.filter((h: any) => h.level_number === 4).length;
      const l5 = hierarchy.filter((h: any) => h.level_number === 5).length;
      const pending = commissions.filter((c: any) => c.status === 'pending').reduce((s: number, c: any) => s + Number(c.commission_amount), 0);
      const approved = commissions.filter((c: any) => c.status === 'approved').reduce((s: number, c: any) => s + Number(c.commission_amount), 0);
      const paid = commissions.filter((c: any) => c.status === 'paid').reduce((s: number, c: any) => s + Number(c.commission_amount), 0);

      setSelectedPartner({
        profile: data.profile,
        stats: {
          level1Partners: l1, level2Partners: l2, level3Partners: l3, level4Partners: l4, level5Partners: l5,
          totalTeam: hierarchy.length,
          pendingCommissions: pending, approvedCommissions: approved, paidCommissions: paid,
          totalCommissions: pending + approved + paid,
          activeCodes: codes.filter((c: any) => c.is_active).length,
          totalCodeUsage: codes.reduce((s: number, c: any) => s + (c.usage_count || 0), 0)
        },
        hierarchy,
        commissions,
        codes,
        leadership: { qualification: leadershipRes.data, payouts: payoutsRes.data || [] },
        customers
      });
    } catch (error: any) {
      toast({ variant: 'destructive', title: 'Fehler', description: error.message });
    } finally {
      setDashLoading(false);
    }
  };

  useEffect(() => { loadPartners(); }, [loadPartners]);

  const fmt = (n: number) => new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR' }).format(n);
  const fmtDate = (d: string) => new Date(d).toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' });

  const filteredPartners = useMemo(() => {
    let result = partners;
    if (statusFilter !== 'all') {
      result = result.filter(p => p.status === statusFilter);
    }
    return result;
  }, [partners, statusFilter]);

  const paginatedPartners = useMemo(() => {
    const start = (page - 1) * perPage;
    return filteredPartners.slice(start, start + perPage);
  }, [filteredPartners, page]);

  const totalPages = Math.ceil(filteredPartners.length / perPage);
  const activeCount = partners.filter(p => p.status === 'active').length;
  const pendingCount = partners.filter(p => p.status === 'pending').length;

  const getCommissionChartData = () => {
    if (!selectedPartner) return [];
    const months: Record<string, { month: string; pending: number; approved: number; paid: number }> = {};
    selectedPartner.commissions.forEach((c: any) => {
      const m = new Date(c.created_at).toLocaleDateString('de-DE', { month: 'short', year: '2-digit' });
      if (!months[m]) months[m] = { month: m, pending: 0, approved: 0, paid: 0 };
      months[m][c.status as 'pending' | 'approved' | 'paid'] += Number(c.commission_amount);
    });
    return Object.values(months).reverse().slice(0, 12).reverse();
  };

  const getLevelDistribution = () => {
    if (!selectedPartner) return [];
    return [
      { name: 'Level 1', value: selectedPartner.stats.level1Partners, fill: LEVEL_COLORS[0] },
      { name: 'Level 2', value: selectedPartner.stats.level2Partners, fill: LEVEL_COLORS[1] },
      { name: 'Level 3', value: selectedPartner.stats.level3Partners || 0, fill: LEVEL_COLORS[2] },
      { name: 'Level 4', value: selectedPartner.stats.level4Partners || 0, fill: LEVEL_COLORS[3] },
      { name: 'Level 5', value: selectedPartner.stats.level5Partners || 0, fill: LEVEL_COLORS[4] },
    ].filter(d => d.value > 0);
  };

  const getCommissionPieData = () => {
    if (!selectedPartner) return [];
    return [
      { name: 'Ausstehend', value: selectedPartner.stats.pendingCommissions, fill: COMMISSION_COLORS.pending },
      { name: 'Genehmigt', value: selectedPartner.stats.approvedCommissions, fill: COMMISSION_COLORS.approved },
      { name: 'Ausgezahlt', value: selectedPartner.stats.paidCommissions, fill: COMMISSION_COLORS.paid },
    ].filter(d => d.value > 0);
  };

  return (
    <div className="space-y-6">
      {/* Header Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Card className="relative overflow-hidden">
          <div className="absolute top-0 left-0 w-1 h-full bg-primary" />
          <CardContent className="pt-5 pb-4 pl-5">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Gesamt Partner</p>
                <p className="text-3xl font-bold mt-1">{partners.length}</p>
              </div>
              <div className="h-12 w-12 rounded-xl bg-primary/10 flex items-center justify-center">
                <Users className="h-6 w-6 text-primary" />
              </div>
            </div>
          </CardContent>
        </Card>
        <Card className="relative overflow-hidden">
          <div className="absolute top-0 left-0 w-1 h-full" style={{ backgroundColor: 'hsl(142 71% 45%)' }} />
          <CardContent className="pt-5 pb-4 pl-5">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Aktive Partner</p>
                <p className="text-3xl font-bold mt-1" style={{ color: 'hsl(142 71% 45%)' }}>{activeCount}</p>
              </div>
              <div className="h-12 w-12 rounded-xl flex items-center justify-center" style={{ backgroundColor: 'hsla(142, 71%, 45%, 0.1)' }}>
                <UserCheck className="h-6 w-6" style={{ color: 'hsl(142 71% 45%)' }} />
              </div>
            </div>
          </CardContent>
        </Card>
        <Card className="relative overflow-hidden">
          <div className="absolute top-0 left-0 w-1 h-full" style={{ backgroundColor: 'hsl(45 93% 47%)' }} />
          <CardContent className="pt-5 pb-4 pl-5">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Ausstehend</p>
                <p className="text-3xl font-bold mt-1" style={{ color: 'hsl(45 93% 47%)' }}>{pendingCount}</p>
              </div>
              <div className="h-12 w-12 rounded-xl flex items-center justify-center" style={{ backgroundColor: 'hsla(45, 93%, 47%, 0.1)' }}>
                <Loader2 className="h-6 w-6" style={{ color: 'hsl(45 93% 47%)' }} />
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Search & Filter Bar */}
      <Card>
        <CardContent className="pt-5 pb-4">
          <div className="flex flex-col sm:flex-row gap-3">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Partner suchen (Name, E-Mail)..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && loadPartners()}
                className="pl-10"
              />
            </div>
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-[160px]">
                <Filter className="h-4 w-4 mr-2" />
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Alle Status</SelectItem>
                <SelectItem value="active">Aktiv</SelectItem>
                <SelectItem value="pending">Ausstehend</SelectItem>
                <SelectItem value="suspended">Gesperrt</SelectItem>
              </SelectContent>
            </Select>
            <Button onClick={loadPartners} disabled={isLoading} variant="outline" className="gap-2">
              {isLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
              Aktualisieren
            </Button>
            <Button onClick={() => setShowAddDialog(true)} className="gap-2">
              <UserPlus className="h-4 w-4" />
              Neuer Partner
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Partner Grid */}
      {isLoading ? (
        <div className="flex items-center justify-center py-16">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      ) : paginatedPartners.length === 0 ? (
        <Card>
          <CardContent className="py-16 text-center">
            <Users className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
            <p className="text-muted-foreground text-lg">Keine Partner gefunden</p>
          </CardContent>
        </Card>
      ) : (
        <>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {paginatedPartners.map((p) => (
              <Card key={p.id} className="group hover:shadow-lg transition-all duration-300 hover:border-primary/30 relative">
                <CardContent className="pt-5 pb-4">
                  {/* Actions dropdown */}
                  <div className="absolute top-3 right-3">
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="icon" className="h-7 w-7 opacity-50 hover:opacity-100">
                          <MoreVertical className="h-4 w-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem onClick={() => viewPartnerDashboard(p.id)}>
                          <Eye className="h-4 w-4 mr-2" /> Dashboard öffnen
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={() => openEditDialog(p)}>
                          <Edit className="h-4 w-4 mr-2" /> Bearbeiten
                        </DropdownMenuItem>
                        <DropdownMenuSeparator />
                        {p.status === 'pending' && (
                          <DropdownMenuItem onClick={() => handleAction('activate', p.id)}>
                            <CheckCircle className="h-4 w-4 mr-2 text-green-500" /> Aktivieren
                          </DropdownMenuItem>
                        )}
                        {p.status === 'active' && !hasRole(p, 'admin') && (
                          <DropdownMenuItem onClick={() => handleAction('suspend', p.id)}>
                            <Ban className="h-4 w-4 mr-2 text-orange-500" /> Sperren
                          </DropdownMenuItem>
                        )}
                        {p.status === 'suspended' && (
                          <DropdownMenuItem onClick={() => handleAction('activate', p.id)}>
                            <CheckCircle className="h-4 w-4 mr-2 text-green-500" /> Reaktivieren
                          </DropdownMenuItem>
                        )}
                        {!hasRole(p, 'partner') && !hasRole(p, 'admin') && (
                          <DropdownMenuItem onClick={() => handleAction('promote', p.id)}>
                            <Crown className="h-4 w-4 mr-2 text-yellow-500" /> Zum Partner befördern
                          </DropdownMenuItem>
                        )}
                        {hasRole(p, 'partner') && !hasRole(p, 'admin') && (
                          <DropdownMenuItem onClick={() => handleAction('demote', p.id)}>
                            <UserMinus className="h-4 w-4 mr-2 text-red-500" /> Partner-Status entfernen
                          </DropdownMenuItem>
                        )}
                        {!hasRole(p, 'admin') && (
                          <>
                            <DropdownMenuSeparator />
                            <DropdownMenuItem className="text-destructive" onClick={() => handleAction('delete', p.id, `${p.first_name} ${p.last_name}`)}>
                              <Trash2 className="h-4 w-4 mr-2" /> Löschen
                            </DropdownMenuItem>
                          </>
                        )}
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>

                  <div className="flex items-start gap-3 mb-4 cursor-pointer" onClick={() => viewPartnerDashboard(p.id)}>
                    <div className="w-11 h-11 rounded-full bg-gradient-to-br from-primary/20 to-primary/5 flex items-center justify-center text-primary font-bold text-sm shrink-0">
                      {p.first_name?.[0]}{p.last_name?.[0]}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-semibold truncate">{p.first_name} {p.last_name}</p>
                      <p className="text-xs text-muted-foreground truncate">{p.email}</p>
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center gap-1.5 mb-3">
                    {hasRole(p, 'admin') && <Badge variant="default" className="text-[10px]">Admin</Badge>}
                    {hasRole(p, 'partner') && <Badge variant="secondary" className="text-[10px]">Partner</Badge>}
                    {p.promotion_codes?.some(c => c.is_active) && (
                      <Badge variant="outline" className="text-[10px] font-mono">
                        {p.promotion_codes.find(c => c.is_active)?.code}
                      </Badge>
                    )}
                  </div>

                  <div className="flex items-center justify-between">
                    <Badge
                      variant={p.status === 'active' ? 'default' : p.status === 'suspended' ? 'destructive' : 'secondary'}
                      className="text-[10px]"
                    >
                      {p.status === 'active' ? '● Aktiv' : p.status === 'suspended' ? '● Gesperrt' : '○ Ausstehend'}
                    </Badge>
                    <div className="flex items-center gap-1 text-xs text-muted-foreground">
                      <Calendar className="h-3 w-3" />
                      {fmtDate(p.created_at)}
                    </div>
                  </div>

                  {p.sponsor && (
                    <div className="mt-2 pt-2 border-t">
                      <p className="text-[10px] text-muted-foreground">
                        Sponsor: <span className="font-medium text-foreground">{p.sponsor.first_name} {p.sponsor.last_name}</span>
                      </p>
                    </div>
                  )}
                </CardContent>
              </Card>
            ))}
          </div>

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex items-center justify-between">
              <p className="text-sm text-muted-foreground">
                {(page - 1) * perPage + 1}–{Math.min(page * perPage, filteredPartners.length)} von {filteredPartners.length}
              </p>
              <div className="flex items-center gap-2">
                <Button variant="outline" size="sm" onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1}>
                  <ChevronLeft className="h-4 w-4" />
                </Button>
                {Array.from({ length: Math.min(totalPages, 5) }, (_, i) => {
                  const pageNum = page <= 3 ? i + 1 : page + i - 2;
                  if (pageNum < 1 || pageNum > totalPages) return null;
                  return (
                    <Button key={pageNum} variant={pageNum === page ? 'default' : 'outline'} size="sm" className="w-8 h-8 p-0" onClick={() => setPage(pageNum)}>
                      {pageNum}
                    </Button>
                  );
                })}
                <Button variant="outline" size="sm" onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page === totalPages}>
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </div>
            </div>
          )}
        </>
      )}

      {/* ===== EDIT DIALOG ===== */}
      <Dialog open={showEditDialog} onOpenChange={setShowEditDialog}>
        <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Edit className="h-5 w-5" /> Partner bearbeiten
            </DialogTitle>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Vorname</Label>
                <Input value={editForm.first_name || ''} onChange={e => setEditForm(f => ({ ...f, first_name: e.target.value }))} />
              </div>
              <div className="space-y-1.5">
                <Label>Nachname</Label>
                <Input value={editForm.last_name || ''} onChange={e => setEditForm(f => ({ ...f, last_name: e.target.value }))} />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>E-Mail</Label>
              <Input value={editForm.email || ''} onChange={e => setEditForm(f => ({ ...f, email: e.target.value }))} />
            </div>
            <div className="space-y-1.5">
              <Label>Telefon</Label>
              <Input value={editForm.phone || ''} onChange={e => setEditForm(f => ({ ...f, phone: e.target.value }))} />
            </div>
            <div className="grid grid-cols-3 gap-3">
              <div className="col-span-2 space-y-1.5">
                <Label>Straße</Label>
                <Input value={editForm.street || ''} onChange={e => setEditForm(f => ({ ...f, street: e.target.value }))} />
              </div>
              <div className="space-y-1.5">
                <Label>Hausnr.</Label>
                <Input value={editForm.house_number || ''} onChange={e => setEditForm(f => ({ ...f, house_number: e.target.value }))} />
              </div>
            </div>
            <div className="grid grid-cols-3 gap-3">
              <div className="space-y-1.5">
                <Label>PLZ</Label>
                <Input value={editForm.postal_code || ''} onChange={e => setEditForm(f => ({ ...f, postal_code: e.target.value }))} />
              </div>
              <div className="space-y-1.5">
                <Label>Stadt</Label>
                <Input value={editForm.city || ''} onChange={e => setEditForm(f => ({ ...f, city: e.target.value }))} />
              </div>
              <div className="space-y-1.5">
                <Label>Land</Label>
                <Input value={editForm.country || ''} onChange={e => setEditForm(f => ({ ...f, country: e.target.value }))} />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>IBAN</Label>
                <Input value={editForm.iban || ''} onChange={e => setEditForm(f => ({ ...f, iban: e.target.value }))} />
              </div>
              <div className="space-y-1.5">
                <Label>BIC</Label>
                <Input value={editForm.bic || ''} onChange={e => setEditForm(f => ({ ...f, bic: e.target.value }))} />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>Bankname</Label>
              <Input value={editForm.bank_name || ''} onChange={e => setEditForm(f => ({ ...f, bank_name: e.target.value }))} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowEditDialog(false)}>Abbrechen</Button>
            <Button onClick={handleUpdateProfile} disabled={actionLoading} className="gap-2">
              {actionLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
              Speichern
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ===== ADD PARTNER DIALOG ===== */}
      <Dialog open={showAddDialog} onOpenChange={setShowAddDialog}>
        <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <UserPlus className="h-5 w-5" /> Neuen Partner erstellen
            </DialogTitle>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Vorname *</Label>
                <Input value={addForm.first_name} onChange={e => setAddForm(f => ({ ...f, first_name: e.target.value }))} />
              </div>
              <div className="space-y-1.5">
                <Label>Nachname *</Label>
                <Input value={addForm.last_name} onChange={e => setAddForm(f => ({ ...f, last_name: e.target.value }))} />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>E-Mail *</Label>
              <Input type="email" value={addForm.email} onChange={e => setAddForm(f => ({ ...f, email: e.target.value }))} />
            </div>
            <div className="space-y-1.5">
              <Label>Passwort *</Label>
              <Input type="password" value={addForm.password} onChange={e => setAddForm(f => ({ ...f, password: e.target.value }))} placeholder="Mindestens 6 Zeichen" />
            </div>
            <div className="space-y-1.5">
              <Label>Telefon</Label>
              <Input value={addForm.phone} onChange={e => setAddForm(f => ({ ...f, phone: e.target.value }))} />
            </div>
            <div className="space-y-1.5">
              <Label>Domain</Label>
              <Input value={addForm.domain} onChange={e => setAddForm(f => ({ ...f, domain: e.target.value }))} placeholder="z.B. example.de" />
            </div>
            <div className="grid grid-cols-3 gap-3">
              <div className="col-span-2 space-y-1.5">
                <Label>Straße</Label>
                <Input value={addForm.street} onChange={e => setAddForm(f => ({ ...f, street: e.target.value }))} />
              </div>
              <div className="space-y-1.5">
                <Label>Hausnr.</Label>
                <Input value={addForm.house_number} onChange={e => setAddForm(f => ({ ...f, house_number: e.target.value }))} />
              </div>
            </div>
            <div className="grid grid-cols-3 gap-3">
              <div className="space-y-1.5">
                <Label>PLZ</Label>
                <Input value={addForm.postal_code} onChange={e => setAddForm(f => ({ ...f, postal_code: e.target.value }))} />
              </div>
              <div className="space-y-1.5">
                <Label>Stadt</Label>
                <Input value={addForm.city} onChange={e => setAddForm(f => ({ ...f, city: e.target.value }))} />
              </div>
              <div className="space-y-1.5">
                <Label>Land</Label>
                <Input value={addForm.country} onChange={e => setAddForm(f => ({ ...f, country: e.target.value }))} />
              </div>
            </div>
            <div className="flex items-center gap-2 pt-2">
              <input
                type="checkbox"
                id="make_partner"
                checked={addForm.make_partner}
                onChange={e => setAddForm(f => ({ ...f, make_partner: e.target.checked }))}
                className="h-4 w-4 rounded border-border"
              />
              <Label htmlFor="make_partner" className="text-sm cursor-pointer">Direkt als Partner aktivieren (mit Promo-Code)</Label>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowAddDialog(false)}>Abbrechen</Button>
            <Button onClick={handleAddPartner} disabled={actionLoading} className="gap-2">
              {actionLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <UserPlus className="h-4 w-4" />}
              Partner erstellen
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ===== PARTNER DASHBOARD DIALOG ===== */}
      <Dialog open={showDashboard} onOpenChange={setShowDashboard}>
        <DialogContent className="max-w-6xl max-h-[92vh] overflow-y-auto p-0">
          {dashLoading ? (
            <div className="flex items-center justify-center py-20">
              <div className="text-center">
                <Loader2 className="h-10 w-10 animate-spin text-primary mx-auto mb-3" />
                <p className="text-sm text-muted-foreground">Dashboard wird geladen...</p>
              </div>
            </div>
          ) : selectedPartner ? (
            <div>
              {/* Dashboard Header */}
              <div className="px-6 py-5 border-b bg-gradient-to-r from-primary/5 to-transparent">
                <div className="flex items-center gap-4">
                  <div className="w-14 h-14 rounded-full bg-gradient-to-br from-primary/30 to-primary/5 flex items-center justify-center text-primary font-bold text-xl">
                    {selectedPartner.profile?.first_name?.[0]}{selectedPartner.profile?.last_name?.[0]}
                  </div>
                  <div className="flex-1">
                    <h2 className="text-xl font-bold">
                      {selectedPartner.profile?.first_name} {selectedPartner.profile?.last_name}
                    </h2>
                    <p className="text-sm text-muted-foreground">{selectedPartner.profile?.email}</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge variant={selectedPartner.profile?.status === 'active' ? 'default' : selectedPartner.profile?.status === 'suspended' ? 'destructive' : 'secondary'}>
                      {selectedPartner.profile?.status === 'active' ? 'Aktiv' : selectedPartner.profile?.status === 'suspended' ? 'Gesperrt' : 'Ausstehend'}
                    </Badge>
                    {selectedPartner.leadership?.qualification?.is_qualified && (
                      <Badge className="bg-gradient-to-r from-amber-500 to-yellow-400 text-white border-0">
                        <Crown className="h-3 w-3 mr-1" /> Leadership
                      </Badge>
                    )}
                  </div>
                </div>
              </div>

              {/* KPI Row */}
              <div className="grid grid-cols-2 md:grid-cols-5 gap-3 p-6 pb-0">
                {[
                  { label: 'Team gesamt', value: selectedPartner.stats.totalTeam, icon: Users, color: 'hsl(var(--primary))' },
                  { label: 'Direktpartner', value: selectedPartner.stats.level1Partners, icon: UserCheck, color: 'hsl(210 100% 50%)' },
                  { label: 'Provisionen', value: fmt(selectedPartner.stats.totalCommissions), icon: Euro, color: 'hsl(142 71% 45%)' },
                  { label: 'Aktive Codes', value: selectedPartner.stats.activeCodes, icon: Gift, color: 'hsl(280 67% 50%)' },
                  { label: 'Kunden', value: selectedPartner.customers.length, icon: ShieldCheck, color: 'hsl(45 93% 47%)' },
                ].map((kpi, i) => (
                  <Card key={i} className="relative overflow-hidden">
                    <div className="absolute top-0 left-0 w-full h-0.5" style={{ backgroundColor: kpi.color }} />
                    <CardContent className="pt-4 pb-3 px-4">
                      <div className="flex items-center gap-2 mb-1">
                        <kpi.icon className="h-3.5 w-3.5" style={{ color: kpi.color }} />
                        <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">{kpi.label}</p>
                      </div>
                      <p className="text-xl font-bold">{kpi.value}</p>
                    </CardContent>
                  </Card>
                ))}
              </div>

              {/* Tabs */}
              <Tabs defaultValue="customers" className="p-6 pt-4">
                <TabsList className="grid grid-cols-6 w-full">
                  <TabsTrigger value="customers"><ShieldCheck className="h-4 w-4 mr-1.5" />Kunden</TabsTrigger>
                  <TabsTrigger value="overview"><BarChart3 className="h-4 w-4 mr-1.5" />Übersicht</TabsTrigger>
                  <TabsTrigger value="hierarchy"><Network className="h-4 w-4 mr-1.5" />Struktur</TabsTrigger>
                  <TabsTrigger value="commissions"><Euro className="h-4 w-4 mr-1.5" />Provisionen</TabsTrigger>
                  <TabsTrigger value="codes"><Gift className="h-4 w-4 mr-1.5" />Codes</TabsTrigger>
                  <TabsTrigger value="leadership"><Award className="h-4 w-4 mr-1.5" />Leadership</TabsTrigger>
                </TabsList>

                {/* ===== CUSTOMERS TAB (NEW) ===== */}
                <TabsContent value="customers" className="mt-4">
                  <Card>
                    <CardHeader className="pb-2">
                      <CardTitle className="text-sm flex items-center gap-2">
                        <ShieldCheck className="h-4 w-4" />
                        Kunden von {selectedPartner.profile?.first_name} {selectedPartner.profile?.last_name}
                      </CardTitle>
                      <CardDescription>
                        Alle direkt zugeordneten Kunden (Level 1)
                      </CardDescription>
                    </CardHeader>
                    <CardContent>
                      {selectedPartner.customers.length === 0 ? (
                        <div className="text-center py-10">
                          <Users className="h-10 w-10 text-muted-foreground mx-auto mb-3" />
                          <p className="text-muted-foreground">Keine Kunden vorhanden</p>
                          <p className="text-xs text-muted-foreground mt-1">Dieser Partner hat noch keine direkt zugeordneten Kunden</p>
                        </div>
                      ) : (
                        <Table>
                          <TableHeader>
                            <TableRow>
                              <TableHead>Name</TableHead>
                              <TableHead>E-Mail</TableHead>
                              <TableHead>Telefon</TableHead>
                              <TableHead>Domain</TableHead>
                              <TableHead>Status</TableHead>
                              <TableHead>Provision aktiv</TableHead>
                              <TableHead>Beitritt</TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {selectedPartner.customers.map((c: any) => (
                              <TableRow key={c.id}>
                                <TableCell>
                                  <div className="flex items-center gap-2">
                                    <div className="w-8 h-8 rounded-full bg-muted flex items-center justify-center text-[10px] font-medium">
                                      {c.first_name?.[0]}{c.last_name?.[0]}
                                    </div>
                                    <span className="font-medium">{c.first_name} {c.last_name}</span>
                                  </div>
                                </TableCell>
                                <TableCell className="text-muted-foreground text-xs">{c.email}</TableCell>
                                <TableCell className="text-muted-foreground text-xs">{c.phone || '-'}</TableCell>
                                <TableCell>
                                  {c.domain ? (
                                    <div className="flex items-center gap-1 text-xs">
                                      <Globe className="h-3 w-3 text-primary" />
                                      <span className="text-primary">{c.domain}</span>
                                    </div>
                                  ) : (
                                    <span className="text-muted-foreground text-xs">-</span>
                                  )}
                                </TableCell>
                                <TableCell>
                                  <Badge variant={c.status === 'active' ? 'default' : c.status === 'suspended' ? 'destructive' : 'secondary'} className="text-[10px]">
                                    {c.status === 'active' ? '● Aktiv' : c.status === 'suspended' ? '● Gesperrt' : '○ Ausstehend'}
                                  </Badge>
                                </TableCell>
                                <TableCell>
                                  {c.commission_active ? (
                                    <CheckCircle className="h-4 w-4" style={{ color: 'hsl(142 71% 45%)' }} />
                                  ) : (
                                    <XCircle className="h-4 w-4 text-muted-foreground/40" />
                                  )}
                                </TableCell>
                                <TableCell className="text-xs text-muted-foreground">{fmtDate(c.joined_at || c.created_at)}</TableCell>
                              </TableRow>
                            ))}
                          </TableBody>
                        </Table>
                      )}
                    </CardContent>
                  </Card>
                </TabsContent>

                {/* Overview Tab with Charts */}
                <TabsContent value="overview" className="space-y-4 mt-4">
                  <div className="grid md:grid-cols-2 gap-4">
                    <Card>
                      <CardHeader className="pb-2">
                        <CardTitle className="text-sm">Provisionsverlauf</CardTitle>
                      </CardHeader>
                      <CardContent>
                        {getCommissionChartData().length > 0 ? (
                          <ResponsiveContainer width="100%" height={220}>
                            <BarChart data={getCommissionChartData()}>
                              <CartesianGrid strokeDasharray="3 3" className="opacity-30" />
                              <XAxis dataKey="month" tick={{ fontSize: 10 }} />
                              <YAxis tick={{ fontSize: 10 }} />
                              <Tooltip formatter={(v: number) => fmt(v)} />
                              <Bar dataKey="paid" stackId="a" fill={COMMISSION_COLORS.paid} name="Ausgezahlt" radius={[0, 0, 0, 0]} />
                              <Bar dataKey="approved" stackId="a" fill={COMMISSION_COLORS.approved} name="Genehmigt" />
                              <Bar dataKey="pending" stackId="a" fill={COMMISSION_COLORS.pending} name="Ausstehend" radius={[4, 4, 0, 0]} />
                            </BarChart>
                          </ResponsiveContainer>
                        ) : (
                          <div className="h-[220px] flex items-center justify-center text-muted-foreground text-sm">Keine Provisionsdaten</div>
                        )}
                      </CardContent>
                    </Card>
                    <div className="grid grid-rows-2 gap-4">
                      <Card>
                        <CardHeader className="pb-1">
                          <CardTitle className="text-sm">Teamstruktur nach Level</CardTitle>
                        </CardHeader>
                        <CardContent className="flex items-center justify-center">
                          {getLevelDistribution().length > 0 ? (
                            <ResponsiveContainer width="100%" height={90}>
                              <BarChart data={getLevelDistribution()} layout="vertical">
                                <XAxis type="number" hide />
                                <YAxis dataKey="name" type="category" tick={{ fontSize: 10 }} width={55} />
                                <Tooltip />
                                <Bar dataKey="value" name="Partner" radius={[0, 4, 4, 0]}>
                                  {getLevelDistribution().map((entry, index) => (
                                    <Cell key={index} fill={entry.fill} />
                                  ))}
                                </Bar>
                              </BarChart>
                            </ResponsiveContainer>
                          ) : (
                            <p className="text-muted-foreground text-sm py-4">Kein Team</p>
                          )}
                        </CardContent>
                      </Card>
                      <Card>
                        <CardHeader className="pb-1">
                          <CardTitle className="text-sm">Provisionsverteilung</CardTitle>
                        </CardHeader>
                        <CardContent className="flex items-center justify-center">
                          {getCommissionPieData().length > 0 ? (
                            <ResponsiveContainer width="100%" height={90}>
                              <PieChart>
                                <Pie data={getCommissionPieData()} cx="50%" cy="50%" innerRadius={25} outerRadius={40} dataKey="value" paddingAngle={2}>
                                  {getCommissionPieData().map((entry, index) => (
                                    <Cell key={index} fill={entry.fill} />
                                  ))}
                                </Pie>
                                <Tooltip formatter={(v: number) => fmt(v)} />
                                <Legend iconSize={8} wrapperStyle={{ fontSize: '10px' }} />
                              </PieChart>
                            </ResponsiveContainer>
                          ) : (
                            <p className="text-muted-foreground text-sm py-4">Keine Provisionen</p>
                          )}
                        </CardContent>
                      </Card>
                    </div>
                  </div>

                  <Card>
                    <CardHeader className="pb-2">
                      <CardTitle className="text-sm">Provisionsübersicht</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-3">
                      {[
                        { label: 'Ausstehend', value: selectedPartner.stats.pendingCommissions, color: 'hsl(45 93% 47%)' },
                        { label: 'Genehmigt', value: selectedPartner.stats.approvedCommissions, color: 'hsl(210 100% 50%)' },
                        { label: 'Ausgezahlt', value: selectedPartner.stats.paidCommissions, color: 'hsl(142 71% 45%)' },
                      ].map((item, i) => {
                        const total = selectedPartner.stats.totalCommissions || 1;
                        const pct = (item.value / total) * 100;
                        return (
                          <div key={i}>
                            <div className="flex items-center justify-between mb-1">
                              <span className="text-xs text-muted-foreground">{item.label}</span>
                              <span className="text-xs font-semibold">{fmt(item.value)}</span>
                            </div>
                            <div className="h-2 rounded-full bg-muted overflow-hidden">
                              <div className="h-full rounded-full transition-all" style={{ width: `${pct}%`, backgroundColor: item.color }} />
                            </div>
                          </div>
                        );
                      })}
                    </CardContent>
                  </Card>
                </TabsContent>

                {/* Hierarchy Tab */}
                <TabsContent value="hierarchy" className="mt-4">
                  <Card>
                    <CardContent className="pt-4">
                      {selectedPartner.hierarchy.length === 0 ? (
                        <div className="text-center py-10">
                          <Network className="h-10 w-10 text-muted-foreground mx-auto mb-3" />
                          <p className="text-muted-foreground">Keine Struktur vorhanden</p>
                        </div>
                      ) : (
                        <Table>
                          <TableHeader>
                            <TableRow>
                              <TableHead>Stufe</TableHead>
                              <TableHead>Name</TableHead>
                              <TableHead>E-Mail</TableHead>
                              <TableHead>Status</TableHead>
                              <TableHead>Provisions-Aktiv</TableHead>
                              <TableHead>Registriert am</TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {selectedPartner.hierarchy.map((m: any) => (
                              <TableRow key={m.id}>
                                <TableCell>
                                  <Badge variant="outline" style={{ borderColor: LEVEL_COLORS[Math.min(m.level_number - 1, 4)], color: LEVEL_COLORS[Math.min(m.level_number - 1, 4)] }}>
                                    L{m.level_number}
                                  </Badge>
                                </TableCell>
                                <TableCell>
                                  <div className="flex items-center gap-2">
                                    <div className="w-7 h-7 rounded-full bg-muted flex items-center justify-center text-[10px] font-medium">
                                      {m.user?.first_name?.[0]}{m.user?.last_name?.[0]}
                                    </div>
                                    <span className="font-medium">{m.user?.first_name} {m.user?.last_name}</span>
                                  </div>
                                </TableCell>
                                <TableCell className="text-muted-foreground text-xs">{m.user?.email}</TableCell>
                                <TableCell>
                                  <Badge variant={m.user?.status === 'active' ? 'default' : 'secondary'} className="text-[10px]">
                                    {m.user?.status === 'active' ? 'Aktiv' : 'Ausstehend'}
                                  </Badge>
                                </TableCell>
                                <TableCell>
                                  {m.is_active_for_commission ? (
                                    <CheckCircle className="h-4 w-4" style={{ color: 'hsl(142 71% 45%)' }} />
                                  ) : (
                                    <XCircle className="h-4 w-4 text-muted-foreground/40" />
                                  )}
                                </TableCell>
                                <TableCell className="text-xs text-muted-foreground">{fmtDate(m.created_at)}</TableCell>
                              </TableRow>
                            ))}
                          </TableBody>
                        </Table>
                      )}
                    </CardContent>
                  </Card>
                </TabsContent>

                {/* Commissions Tab */}
                <TabsContent value="commissions" className="mt-4 space-y-4">
                  <div className="grid grid-cols-3 gap-3">
                    {[
                      { label: 'Ausstehend', value: selectedPartner.stats.pendingCommissions, color: 'hsl(45 93% 47%)', icon: Loader2 },
                      { label: 'Genehmigt', value: selectedPartner.stats.approvedCommissions, color: 'hsl(210 100% 50%)', icon: CheckCircle },
                      { label: 'Ausgezahlt', value: selectedPartner.stats.paidCommissions, color: 'hsl(142 71% 45%)', icon: Wallet },
                    ].map((item, i) => (
                      <Card key={i} className="relative overflow-hidden">
                        <div className="absolute bottom-0 left-0 w-full h-0.5" style={{ backgroundColor: item.color }} />
                        <CardContent className="pt-4 pb-3">
                          <div className="flex items-center gap-2 mb-1">
                            <item.icon className="h-3.5 w-3.5" style={{ color: item.color }} />
                            <p className="text-[10px] text-muted-foreground uppercase tracking-wider">{item.label}</p>
                          </div>
                          <p className="text-xl font-bold" style={{ color: item.color }}>{fmt(item.value)}</p>
                        </CardContent>
                      </Card>
                    ))}
                  </div>
                  <Card>
                    <CardContent className="pt-4">
                      {selectedPartner.commissions.length === 0 ? (
                        <div className="text-center py-10">
                          <Euro className="h-10 w-10 text-muted-foreground mx-auto mb-3" />
                          <p className="text-muted-foreground">Keine Provisionen vorhanden</p>
                        </div>
                      ) : (
                        <Table>
                          <TableHeader>
                            <TableRow>
                              <TableHead>Datum</TableHead>
                              <TableHead>Kunde</TableHead>
                              <TableHead>Stufe</TableHead>
                              <TableHead>Basis</TableHead>
                              <TableHead>Provision</TableHead>
                              <TableHead>Status</TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {selectedPartner.commissions.map((c: any) => (
                              <TableRow key={c.id}>
                                <TableCell className="text-xs">{fmtDate(c.created_at)}</TableCell>
                                <TableCell className="text-sm">{c.transaction?.customer?.first_name} {c.transaction?.customer?.last_name}</TableCell>
                                <TableCell>
                                  <Badge variant="outline" style={{ borderColor: LEVEL_COLORS[Math.min(c.level_number - 1, 4)], color: LEVEL_COLORS[Math.min(c.level_number - 1, 4)] }}>
                                    L{c.level_number}
                                  </Badge>
                                </TableCell>
                                <TableCell className="text-xs text-muted-foreground">{fmt(c.base_amount)}</TableCell>
                                <TableCell className="font-semibold">{fmt(c.commission_amount)}</TableCell>
                                <TableCell>
                                  <Badge variant={c.status === 'paid' ? 'default' : c.status === 'approved' ? 'secondary' : 'outline'} className="text-[10px]">
                                    {c.status === 'paid' ? '✓ Ausgezahlt' : c.status === 'approved' ? '● Genehmigt' : '○ Ausstehend'}
                                  </Badge>
                                </TableCell>
                              </TableRow>
                            ))}
                          </TableBody>
                        </Table>
                      )}
                    </CardContent>
                  </Card>
                </TabsContent>

                {/* Codes Tab */}
                <TabsContent value="codes" className="mt-4">
                  <Card>
                    <CardContent className="pt-4">
                      {selectedPartner.codes.length === 0 ? (
                        <div className="text-center py-10">
                          <Gift className="h-10 w-10 text-muted-foreground mx-auto mb-3" />
                          <p className="text-muted-foreground">Keine Promotion-Codes vorhanden</p>
                        </div>
                      ) : (
                        <Table>
                          <TableHeader>
                            <TableRow>
                              <TableHead>Code</TableHead>
                              <TableHead>Nutzungen</TableHead>
                              <TableHead>Max</TableHead>
                              <TableHead>Erstellt am</TableHead>
                              <TableHead>Status</TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {selectedPartner.codes.map((c: any) => (
                              <TableRow key={c.id}>
                                <TableCell>
                                  <code className="px-2 py-0.5 rounded bg-muted text-xs font-mono font-semibold">{c.code}</code>
                                </TableCell>
                                <TableCell>
                                  <div className="flex items-center gap-2">
                                    <span className="font-medium">{c.usage_count || 0}</span>
                                    {c.max_uses && (
                                      <Progress value={((c.usage_count || 0) / c.max_uses) * 100} className="h-1.5 w-16" />
                                    )}
                                  </div>
                                </TableCell>
                                <TableCell className="text-muted-foreground">{c.max_uses || '∞'}</TableCell>
                                <TableCell className="text-xs text-muted-foreground">{fmtDate(c.created_at)}</TableCell>
                                <TableCell>
                                  <Badge variant={c.is_active ? 'default' : 'secondary'} className="text-[10px]">
                                    {c.is_active ? '● Aktiv' : '○ Inaktiv'}
                                  </Badge>
                                </TableCell>
                              </TableRow>
                            ))}
                          </TableBody>
                        </Table>
                      )}
                    </CardContent>
                  </Card>
                </TabsContent>

                {/* Leadership Tab */}
                <TabsContent value="leadership" className="mt-4 space-y-4">
                  {selectedPartner.leadership?.qualification ? (
                    <>
                      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                        {[
                          { label: 'Pool-Level', value: selectedPartner.leadership.qualification.pool_level, icon: Crown, color: 'hsl(45 93% 47%)' },
                          { label: 'Anteile', value: selectedPartner.leadership.qualification.shares_count, icon: Award, color: 'hsl(280 67% 50%)' },
                          { label: 'Qualifiziert', value: selectedPartner.leadership.qualification.is_qualified ? 'Ja ✓' : 'Nein', icon: CheckCircle, color: selectedPartner.leadership.qualification.is_qualified ? 'hsl(142 71% 45%)' : 'hsl(0 84% 60%)' },
                          { label: 'Direkt-Partner', value: selectedPartner.leadership.qualification.direct_partners_count || 0, icon: Users, color: 'hsl(210 100% 50%)' },
                        ].map((item, i) => (
                          <Card key={i} className="relative overflow-hidden">
                            <div className="absolute top-0 left-0 w-full h-0.5" style={{ backgroundColor: item.color }} />
                            <CardContent className="pt-4 pb-3 px-4">
                              <div className="flex items-center gap-2 mb-1">
                                <item.icon className="h-3.5 w-3.5" style={{ color: item.color }} />
                                <p className="text-[10px] text-muted-foreground uppercase tracking-wider">{item.label}</p>
                              </div>
                              <p className="text-xl font-bold">{item.value}</p>
                            </CardContent>
                          </Card>
                        ))}
                      </div>

                      {selectedPartner.leadership.payouts.length > 0 && (
                        <Card>
                          <CardHeader className="pb-2">
                            <CardTitle className="text-sm">Pool-Auszahlungen</CardTitle>
                          </CardHeader>
                          <CardContent>
                            <Table>
                              <TableHeader>
                                <TableRow>
                                  <TableHead>Zeitraum</TableHead>
                                  <TableHead>Pool</TableHead>
                                  <TableHead>Anteile</TableHead>
                                  <TableHead>Auszahlung</TableHead>
                                  <TableHead>Status</TableHead>
                                </TableRow>
                              </TableHeader>
                              <TableBody>
                                {selectedPartner.leadership.payouts.map((p: any) => (
                                  <TableRow key={p.id}>
                                    <TableCell className="text-xs">{fmtDate(p.period_start)} – {fmtDate(p.period_end)}</TableCell>
                                    <TableCell className="text-xs text-muted-foreground">{fmt(p.total_pool_amount)}</TableCell>
                                    <TableCell>{p.partner_shares}/{p.total_shares}</TableCell>
                                    <TableCell className="font-semibold">{fmt(p.payout_amount)}</TableCell>
                                    <TableCell>
                                      <Badge variant={p.status === 'paid' ? 'default' : 'outline'} className="text-[10px]">
                                        {p.status === 'paid' ? '✓ Ausgezahlt' : '○ Ausstehend'}
                                      </Badge>
                                    </TableCell>
                                  </TableRow>
                                ))}
                              </TableBody>
                            </Table>
                          </CardContent>
                        </Card>
                      )}
                    </>
                  ) : (
                    <Card>
                      <CardContent className="py-10 text-center">
                        <Award className="h-10 w-10 text-muted-foreground mx-auto mb-3" />
                        <p className="text-muted-foreground">Keine Leadership-Qualifikation vorhanden</p>
                        <p className="text-xs text-muted-foreground mt-1">Dieser Partner hat noch nicht die erforderlichen Kriterien erreicht</p>
                      </CardContent>
                    </Card>
                  )}
                </TabsContent>
              </Tabs>
            </div>
          ) : null}
        </DialogContent>
      </Dialog>
    </div>
  );
}
