import { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { supabase } from '@/integrations/supabase/client';
import { 
  Award, Star, Globe, TrendingUp, Loader2, Calculator, 
  Users, Euro, Wallet, Edit, Trash2, Plus, Save, CreditCard
} from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

interface PoolStats {
  totalRevenue: number;
  poolPercentage: number;
  poolAmount: number;
  totalShares: number;
  shareValue: number;
  pendingPayouts: number;
  qualifiedPartners: {
    businessPartnerPlus: number;
    nationalPartner: number;
    worldPartner: number;
    total: number;
  };
}

interface Qualification {
  id: string;
  partner_id: string;
  pool_level: string;
  shares_count: number;
  is_qualified: boolean;
  direct_partners_count: number;
  active_contracts_count: number;
  level1_partners_count: number;
  level2_partners_count: number;
  qualified_at: string | null;
  partner: {
    id: string;
    first_name: string;
    last_name: string;
    email: string;
  };
}

interface Payout {
  id: string;
  partner_id: string;
  pool_level: string;
  period_start: string;
  period_end: string;
  total_pool_amount: number;
  share_value: number;
  partner_shares: number;
  payout_amount: number;
  status: string;
  partner: {
    first_name: string;
    last_name: string;
  };
}

interface Partner {
  id: string;
  first_name: string;
  last_name: string;
  email: string;
}

const POOL_LEVELS = {
  business_partner_plus: { name: 'Business Partner Plus', icon: Star, shares: 1, color: 'from-yellow-500 to-amber-500' },
  national_partner: { name: 'National Partner', icon: Award, shares: 3, color: 'from-blue-500 to-indigo-500' },
  world_partner: { name: 'World Partner', icon: Globe, shares: 7, color: 'from-purple-500 to-pink-500' }
};

export function AdminLeadershipPoolManager() {
  const { toast } = useToast();
  const [stats, setStats] = useState<PoolStats | null>(null);
  const [qualifications, setQualifications] = useState<Qualification[]>([]);
  const [payouts, setPayouts] = useState<Payout[]>([]);
  const [partners, setPartners] = useState<Partner[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isCalculating, setIsCalculating] = useState(false);
  const [isCreatingPayouts, setIsCreatingPayouts] = useState(false);
  const [isActionLoading, setIsActionLoading] = useState(false);

  // Dialogs
  const [showAddQualDialog, setShowAddQualDialog] = useState(false);
  const [showEditQualDialog, setShowEditQualDialog] = useState(false);
  const [showAddPayoutDialog, setShowAddPayoutDialog] = useState(false);
  const [showEditPayoutDialog, setShowEditPayoutDialog] = useState(false);
  const [selectedQual, setSelectedQual] = useState<Qualification | null>(null);
  const [selectedPayout, setSelectedPayout] = useState<Payout | null>(null);

  const [qualForm, setQualForm] = useState({
    partner_id: '',
    pool_level: 'business_partner_plus',
    shares_count: '1',
    is_qualified: true,
    direct_partners_count: '0',
    active_contracts_count: '0',
    level1_partners_count: '0',
    level2_partners_count: '0'
  });

  const [payoutForm, setPayoutForm] = useState({
    partner_id: '',
    pool_level: 'business_partner_plus',
    payout_amount: '',
    partner_shares: '1',
    status: 'pending'
  });

  const loadStats = async () => {
    try {
      const { data, error } = await supabase.functions.invoke('admin-leadership-pool', {
        body: { action: 'stats' }
      });

      if (error) throw error;
      setStats(data.stats);
    } catch (err: unknown) {
      const error = err as Error;
      toast({ variant: 'destructive', title: 'Fehler', description: error.message });
    }
  };

  const loadQualifications = async () => {
    setIsLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke('admin-leadership-pool', {
        body: { action: 'list-qualifications', filters: { limit: 100 } }
      });

      if (error) throw error;
      setQualifications(data.qualifications || []);
    } catch (err: unknown) {
      const error = err as Error;
      toast({ variant: 'destructive', title: 'Fehler', description: error.message });
    } finally {
      setIsLoading(false);
    }
  };

  const loadPayouts = async () => {
    setIsLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke('admin-leadership-pool', {
        body: { action: 'list-payouts', filters: { limit: 100 } }
      });

      if (error) throw error;
      setPayouts(data.payouts || []);
    } catch (err: unknown) {
      const error = err as Error;
      toast({ variant: 'destructive', title: 'Fehler', description: error.message });
    } finally {
      setIsLoading(false);
    }
  };

  const loadPartners = async () => {
    try {
      const { data, error } = await supabase.functions.invoke('get-partners-list', {
        method: 'POST',
      });
      
      if (error) throw error;
      setPartners(data?.partners || []);
    } catch (err: unknown) {
      console.error('Partners error:', err);
    }
  };

  const calculateQualifications = async () => {
    setIsCalculating(true);
    try {
      const { data, error } = await supabase.functions.invoke('admin-leadership-pool', {
        body: { action: 'calculate' }
      });

      if (error) throw error;

      toast({ 
        title: 'Qualifikationen berechnet', 
        description: `${data.processed} Partner geprüft, ${data.qualified} qualifiziert` 
      });
      
      loadStats();
      loadQualifications();
    } catch (err: unknown) {
      const error = err as Error;
      toast({ variant: 'destructive', title: 'Fehler', description: error.message });
    } finally {
      setIsCalculating(false);
    }
  };

  const createMonthlyPayouts = async () => {
    setIsCreatingPayouts(true);
    try {
      const { data, error } = await supabase.functions.invoke('admin-leadership-pool', {
        body: { action: 'create-payout' }
      });

      if (error) throw error;

      toast({ 
        title: 'Auszahlungen erstellt', 
        description: `${data.payoutsCreated} Auszahlungen erstellt. Pool: ${formatCurrency(data.poolAmount)}` 
      });
      
      loadStats();
      loadPayouts();
    } catch (err: unknown) {
      const error = err as Error;
      toast({ variant: 'destructive', title: 'Fehler', description: error.message });
    } finally {
      setIsCreatingPayouts(false);
    }
  };

  // CRUD for Qualifications
  const handleCreateQualification = async () => {
    if (!qualForm.partner_id) {
      toast({ variant: 'destructive', title: 'Fehler', description: 'Partner ist erforderlich' });
      return;
    }

    setIsActionLoading(true);
    try {
      const { error } = await supabase.functions.invoke('admin-leadership-pool', {
        body: { 
          action: 'create-qualification',
          data: {
            partner_id: qualForm.partner_id,
            pool_level: qualForm.pool_level,
            shares_count: parseInt(qualForm.shares_count),
            is_qualified: qualForm.is_qualified,
            direct_partners_count: parseInt(qualForm.direct_partners_count),
            active_contracts_count: parseInt(qualForm.active_contracts_count),
            level1_partners_count: parseInt(qualForm.level1_partners_count),
            level2_partners_count: parseInt(qualForm.level2_partners_count)
          }
        }
      });

      if (error) throw error;

      toast({ title: 'Erfolg', description: 'Qualifikation wurde erstellt' });
      setShowAddQualDialog(false);
      resetQualForm();
      loadQualifications();
      loadStats();
    } catch (err: unknown) {
      const error = err as Error;
      toast({ variant: 'destructive', title: 'Fehler', description: error.message });
    } finally {
      setIsActionLoading(false);
    }
  };

  const handleUpdateQualification = async () => {
    if (!selectedQual) return;

    setIsActionLoading(true);
    try {
      const { error } = await supabase.functions.invoke('admin-leadership-pool', {
        body: { 
          action: 'update-qualification',
          qualificationId: selectedQual.id,
          data: {
            pool_level: qualForm.pool_level,
            shares_count: parseInt(qualForm.shares_count),
            is_qualified: qualForm.is_qualified,
            direct_partners_count: parseInt(qualForm.direct_partners_count),
            active_contracts_count: parseInt(qualForm.active_contracts_count),
            level1_partners_count: parseInt(qualForm.level1_partners_count),
            level2_partners_count: parseInt(qualForm.level2_partners_count)
          }
        }
      });

      if (error) throw error;

      toast({ title: 'Erfolg', description: 'Qualifikation wurde aktualisiert' });
      setShowEditQualDialog(false);
      loadQualifications();
      loadStats();
    } catch (err: unknown) {
      const error = err as Error;
      toast({ variant: 'destructive', title: 'Fehler', description: error.message });
    } finally {
      setIsActionLoading(false);
    }
  };

  const handleDeleteQualification = async (id: string) => {
    if (!confirm('Möchten Sie diese Qualifikation wirklich löschen?')) return;

    setIsActionLoading(true);
    try {
      const { error } = await supabase.functions.invoke('admin-leadership-pool', {
        body: { action: 'delete-qualification', qualificationId: id }
      });

      if (error) throw error;

      toast({ title: 'Erfolg', description: 'Qualifikation wurde gelöscht' });
      loadQualifications();
      loadStats();
    } catch (err: unknown) {
      const error = err as Error;
      toast({ variant: 'destructive', title: 'Fehler', description: error.message });
    } finally {
      setIsActionLoading(false);
    }
  };

  // CRUD for Payouts
  const handleCreatePayout = async () => {
    if (!payoutForm.partner_id || !payoutForm.payout_amount) {
      toast({ variant: 'destructive', title: 'Fehler', description: 'Partner und Betrag sind erforderlich' });
      return;
    }

    setIsActionLoading(true);
    try {
      const { error } = await supabase.functions.invoke('admin-leadership-pool', {
        body: { 
          action: 'create-single-payout',
          data: {
            partner_id: payoutForm.partner_id,
            pool_level: payoutForm.pool_level,
            payout_amount: parseFloat(payoutForm.payout_amount),
            partner_shares: parseInt(payoutForm.partner_shares),
            status: payoutForm.status
          }
        }
      });

      if (error) throw error;

      toast({ title: 'Erfolg', description: 'Auszahlung wurde erstellt' });
      setShowAddPayoutDialog(false);
      resetPayoutForm();
      loadPayouts();
      loadStats();
    } catch (err: unknown) {
      const error = err as Error;
      toast({ variant: 'destructive', title: 'Fehler', description: error.message });
    } finally {
      setIsActionLoading(false);
    }
  };

  const handleUpdatePayout = async () => {
    if (!selectedPayout) return;

    setIsActionLoading(true);
    try {
      const { error } = await supabase.functions.invoke('admin-leadership-pool', {
        body: { 
          action: 'update-payout',
          payoutId: selectedPayout.id,
          data: {
            payout_amount: parseFloat(payoutForm.payout_amount),
            partner_shares: parseInt(payoutForm.partner_shares),
            status: payoutForm.status
          }
        }
      });

      if (error) throw error;

      toast({ title: 'Erfolg', description: 'Auszahlung wurde aktualisiert' });
      setShowEditPayoutDialog(false);
      loadPayouts();
      loadStats();
    } catch (err: unknown) {
      const error = err as Error;
      toast({ variant: 'destructive', title: 'Fehler', description: error.message });
    } finally {
      setIsActionLoading(false);
    }
  };

  const handleDeletePayout = async (id: string) => {
    if (!confirm('Möchten Sie diese Auszahlung wirklich löschen?')) return;

    setIsActionLoading(true);
    try {
      const { error } = await supabase.functions.invoke('admin-leadership-pool', {
        body: { action: 'delete-payout', payoutId: id }
      });

      if (error) throw error;

      toast({ title: 'Erfolg', description: 'Auszahlung wurde gelöscht' });
      loadPayouts();
      loadStats();
    } catch (err: unknown) {
      const error = err as Error;
      toast({ variant: 'destructive', title: 'Fehler', description: error.message });
    } finally {
      setIsActionLoading(false);
    }
  };

  const handlePayPayout = async (id: string) => {
    setIsActionLoading(true);
    try {
      const { error } = await supabase.functions.invoke('admin-leadership-pool', {
        body: { action: 'pay-payout', payoutId: id }
      });

      if (error) throw error;

      toast({ title: 'Erfolg', description: 'Auszahlung wurde als bezahlt markiert' });
      loadPayouts();
      loadStats();
    } catch (error: any) {
      toast({ variant: 'destructive', title: 'Fehler', description: error.message });
    } finally {
      setIsActionLoading(false);
    }
  };

  const openEditQualDialog = (qual: Qualification) => {
    setSelectedQual(qual);
    setQualForm({
      partner_id: qual.partner_id,
      pool_level: qual.pool_level,
      shares_count: qual.shares_count.toString(),
      is_qualified: qual.is_qualified,
      direct_partners_count: qual.direct_partners_count.toString(),
      active_contracts_count: qual.active_contracts_count.toString(),
      level1_partners_count: qual.level1_partners_count.toString(),
      level2_partners_count: qual.level2_partners_count.toString()
    });
    setShowEditQualDialog(true);
  };

  const openEditPayoutDialog = (payout: Payout) => {
    setSelectedPayout(payout);
    setPayoutForm({
      partner_id: payout.partner_id,
      pool_level: payout.pool_level,
      payout_amount: payout.payout_amount.toString(),
      partner_shares: payout.partner_shares.toString(),
      status: payout.status
    });
    setShowEditPayoutDialog(true);
  };

  const resetQualForm = () => {
    setQualForm({
      partner_id: '',
      pool_level: 'business_partner_plus',
      shares_count: '1',
      is_qualified: true,
      direct_partners_count: '0',
      active_contracts_count: '0',
      level1_partners_count: '0',
      level2_partners_count: '0'
    });
    setSelectedQual(null);
  };

  const resetPayoutForm = () => {
    setPayoutForm({
      partner_id: '',
      pool_level: 'business_partner_plus',
      payout_amount: '',
      partner_shares: '1',
      status: 'pending'
    });
    setSelectedPayout(null);
  };

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('de-DE', {
      style: 'currency',
      currency: 'EUR',
    }).format(amount);
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('de-DE');
  };

  useEffect(() => {
    loadStats();
    loadQualifications();
    loadPayouts();
    loadPartners();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="space-y-6">
      {/* Overview Stats */}
      {stats && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                <TrendingUp className="h-4 w-4" />
                Gesamtumsatz
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{formatCurrency(stats.totalRevenue)}</div>
            </CardContent>
          </Card>
          <Card className="border-primary/30">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                <Wallet className="h-4 w-4 text-primary" />
                Pool ({stats.poolPercentage}%)
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-primary">{formatCurrency(stats.poolAmount)}</div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                <Users className="h-4 w-4" />
                Qualifizierte Partner
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{stats.qualifiedPartners.total}</div>
              <p className="text-xs text-muted-foreground">
                {stats.totalShares} Shares
              </p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                <Euro className="h-4 w-4" />
                Share-Wert
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{formatCurrency(stats.shareValue)}</div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Pool Level Stats */}
      {stats && (
        <div className="grid md:grid-cols-3 gap-4">
          {Object.entries(POOL_LEVELS).map(([key, level]) => {
            const count = stats.qualifiedPartners[
              key === 'business_partner_plus' ? 'businessPartnerPlus' :
              key === 'national_partner' ? 'nationalPartner' : 'worldPartner'
            ];
            
            return (
              <Card key={key} className="relative overflow-hidden">
                <div className={`absolute inset-0 bg-gradient-to-br ${level.color} opacity-5`} />
                <CardHeader className="pb-2 relative">
                  <div className="flex items-center gap-3">
                    <div className={`w-10 h-10 rounded-lg bg-gradient-to-br ${level.color} flex items-center justify-center`}>
                      <level.icon className="h-5 w-5 text-white" />
                    </div>
                    <div>
                      <CardTitle className="text-lg">{level.name}</CardTitle>
                      <Badge variant="secondary">{level.shares} Share{level.shares > 1 ? 's' : ''}</Badge>
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="relative">
                  <div className="text-3xl font-bold">{count}</div>
                  <p className="text-sm text-muted-foreground">Partner qualifiziert</p>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {/* Actions */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                <Award className="h-5 w-5" />
                Leadership Pool verwalten
              </CardTitle>
              <CardDescription>Qualifikationen prüfen und Auszahlungen erstellen</CardDescription>
            </div>
            <div className="flex gap-2">
              <Button 
                variant="outline" 
                onClick={calculateQualifications}
                disabled={isCalculating}
              >
                {isCalculating ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Calculator className="h-4 w-4 mr-2" />}
                Qualifikationen berechnen
              </Button>
              <Button 
                onClick={createMonthlyPayouts}
                disabled={isCreatingPayouts}
              >
                {isCreatingPayouts ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Wallet className="h-4 w-4 mr-2" />}
                Monatliche Auszahlung erstellen
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <Tabs defaultValue="qualifications">
            <TabsList>
              <TabsTrigger value="qualifications">Qualifikationen</TabsTrigger>
              <TabsTrigger value="payouts">Auszahlungen</TabsTrigger>
            </TabsList>

            <TabsContent value="qualifications" className="mt-4">
              <div className="flex justify-end mb-4">
                <Button onClick={() => { resetQualForm(); setShowAddQualDialog(true); }}>
                  <Plus className="h-4 w-4 mr-2" />
                  Qualifikation hinzufügen
                </Button>
              </div>
              <div className="rounded-md border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Partner</TableHead>
                      <TableHead>Level</TableHead>
                      <TableHead>Shares</TableHead>
                      <TableHead>Direkte Partner</TableHead>
                      <TableHead>Verträge</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead className="text-right">Aktionen</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {qualifications.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={7} className="text-center py-8 text-muted-foreground">
                          {isLoading ? 'Laden...' : 'Keine Qualifikationen vorhanden'}
                        </TableCell>
                      </TableRow>
                    ) : (
                      qualifications.map((qual) => {
                        const levelInfo = POOL_LEVELS[qual.pool_level as keyof typeof POOL_LEVELS];
                        return (
                          <TableRow key={qual.id}>
                            <TableCell>
                              <div>
                                <p className="font-medium">{qual.partner?.first_name} {qual.partner?.last_name}</p>
                                <p className="text-xs text-muted-foreground">{qual.partner?.email}</p>
                              </div>
                            </TableCell>
                            <TableCell>
                              <Badge className={`bg-gradient-to-r ${levelInfo?.color || ''} text-white border-0`}>
                                {levelInfo?.name || qual.pool_level}
                              </Badge>
                            </TableCell>
                            <TableCell className="font-bold">{qual.shares_count}</TableCell>
                            <TableCell>{qual.direct_partners_count}</TableCell>
                            <TableCell>{qual.active_contracts_count?.toLocaleString('de-DE')}</TableCell>
                            <TableCell>
                              <Badge variant={qual.is_qualified ? 'default' : 'secondary'}>
                                {qual.is_qualified ? 'Qualifiziert' : 'Nicht qualifiziert'}
                              </Badge>
                            </TableCell>
                            <TableCell className="text-right">
                              <div className="flex justify-end gap-1">
                                <Button 
                                  size="sm" 
                                  variant="ghost"
                                  onClick={() => openEditQualDialog(qual)}
                                  disabled={isActionLoading}
                                >
                                  <Edit className="h-4 w-4" />
                                </Button>
                                <Button 
                                  size="sm" 
                                  variant="ghost"
                                  onClick={() => handleDeleteQualification(qual.id)}
                                  disabled={isActionLoading}
                                >
                                  <Trash2 className="h-4 w-4 text-red-500" />
                                </Button>
                              </div>
                            </TableCell>
                          </TableRow>
                        );
                      })
                    )}
                  </TableBody>
                </Table>
              </div>
            </TabsContent>

            <TabsContent value="payouts" className="mt-4">
              <div className="flex justify-end mb-4">
                <Button onClick={() => { resetPayoutForm(); setShowAddPayoutDialog(true); }}>
                  <Plus className="h-4 w-4 mr-2" />
                  Auszahlung hinzufügen
                </Button>
              </div>
              <div className="rounded-md border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Partner</TableHead>
                      <TableHead>Zeitraum</TableHead>
                      <TableHead>Level</TableHead>
                      <TableHead>Shares</TableHead>
                      <TableHead>Auszahlung</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead className="text-right">Aktionen</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {payouts.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={7} className="text-center py-8 text-muted-foreground">
                          {isLoading ? 'Laden...' : 'Keine Auszahlungen vorhanden'}
                        </TableCell>
                      </TableRow>
                    ) : (
                      payouts.map((payout) => (
                        <TableRow key={payout.id}>
                          <TableCell className="font-medium">
                            {payout.partner?.first_name} {payout.partner?.last_name}
                          </TableCell>
                          <TableCell className="text-muted-foreground">
                            {formatDate(payout.period_start)} - {formatDate(payout.period_end)}
                          </TableCell>
                          <TableCell>
                            <Badge variant="outline">
                              {POOL_LEVELS[payout.pool_level as keyof typeof POOL_LEVELS]?.name || payout.pool_level}
                            </Badge>
                          </TableCell>
                          <TableCell>{payout.partner_shares}</TableCell>
                          <TableCell className="font-bold">{formatCurrency(payout.payout_amount)}</TableCell>
                          <TableCell>
                            <Badge variant={payout.status === 'paid' ? 'default' : 'secondary'}>
                              {payout.status === 'paid' ? 'Ausgezahlt' : 'Ausstehend'}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-right">
                            <div className="flex justify-end gap-1">
                              {payout.status !== 'paid' && (
                                <Button 
                                  size="sm" 
                                  variant="ghost"
                                  onClick={() => handlePayPayout(payout.id)}
                                  disabled={isActionLoading}
                                  title="Als bezahlt markieren"
                                >
                                  <CreditCard className="h-4 w-4 text-green-500" />
                                </Button>
                              )}
                              <Button 
                                size="sm" 
                                variant="ghost"
                                onClick={() => openEditPayoutDialog(payout)}
                                disabled={isActionLoading}
                              >
                                <Edit className="h-4 w-4" />
                              </Button>
                              <Button 
                                size="sm" 
                                variant="ghost"
                                onClick={() => handleDeletePayout(payout.id)}
                                disabled={isActionLoading}
                              >
                                <Trash2 className="h-4 w-4 text-red-500" />
                              </Button>
                            </div>
                          </TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
              </div>
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>

      {/* Add Qualification Dialog */}
      <Dialog open={showAddQualDialog} onOpenChange={setShowAddQualDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Qualifikation hinzufügen</DialogTitle>
            <DialogDescription>Fügen Sie eine manuelle Qualifikation für einen Partner hinzu</DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="space-y-2">
              <Label>Partner</Label>
              <Select 
                value={qualForm.partner_id} 
                onValueChange={(v) => setQualForm(prev => ({ ...prev, partner_id: v }))}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Partner auswählen..." />
                </SelectTrigger>
                <SelectContent>
                  {partners.map((p) => (
                    <SelectItem key={p.id} value={p.id}>
                      {p.first_name} {p.last_name} ({p.email})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Pool Level</Label>
                <Select 
                  value={qualForm.pool_level} 
                  onValueChange={(v) => setQualForm(prev => ({ ...prev, pool_level: v }))}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="business_partner_plus">Business Partner Plus</SelectItem>
                    <SelectItem value="national_partner">National Partner</SelectItem>
                    <SelectItem value="world_partner">World Partner</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Shares</Label>
                <Input
                  type="number"
                  value={qualForm.shares_count}
                  onChange={(e) => setQualForm(prev => ({ ...prev, shares_count: e.target.value }))}
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Direkte Partner</Label>
                <Input
                  type="number"
                  value={qualForm.direct_partners_count}
                  onChange={(e) => setQualForm(prev => ({ ...prev, direct_partners_count: e.target.value }))}
                />
              </div>
              <div className="space-y-2">
                <Label>Aktive Verträge</Label>
                <Input
                  type="number"
                  value={qualForm.active_contracts_count}
                  onChange={(e) => setQualForm(prev => ({ ...prev, active_contracts_count: e.target.value }))}
                />
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowAddQualDialog(false)}>Abbrechen</Button>
            <Button onClick={handleCreateQualification} disabled={isActionLoading}>
              {isActionLoading ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Plus className="h-4 w-4 mr-2" />}
              Erstellen
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit Qualification Dialog */}
      <Dialog open={showEditQualDialog} onOpenChange={setShowEditQualDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Qualifikation bearbeiten</DialogTitle>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Pool Level</Label>
                <Select 
                  value={qualForm.pool_level} 
                  onValueChange={(v) => setQualForm(prev => ({ ...prev, pool_level: v }))}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="business_partner_plus">Business Partner Plus</SelectItem>
                    <SelectItem value="national_partner">National Partner</SelectItem>
                    <SelectItem value="world_partner">World Partner</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Shares</Label>
                <Input
                  type="number"
                  value={qualForm.shares_count}
                  onChange={(e) => setQualForm(prev => ({ ...prev, shares_count: e.target.value }))}
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Direkte Partner</Label>
                <Input
                  type="number"
                  value={qualForm.direct_partners_count}
                  onChange={(e) => setQualForm(prev => ({ ...prev, direct_partners_count: e.target.value }))}
                />
              </div>
              <div className="space-y-2">
                <Label>Aktive Verträge</Label>
                <Input
                  type="number"
                  value={qualForm.active_contracts_count}
                  onChange={(e) => setQualForm(prev => ({ ...prev, active_contracts_count: e.target.value }))}
                />
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowEditQualDialog(false)}>Abbrechen</Button>
            <Button onClick={handleUpdateQualification} disabled={isActionLoading}>
              {isActionLoading ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Save className="h-4 w-4 mr-2" />}
              Speichern
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Add Payout Dialog */}
      <Dialog open={showAddPayoutDialog} onOpenChange={setShowAddPayoutDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Auszahlung hinzufügen</DialogTitle>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="space-y-2">
              <Label>Partner</Label>
              <Select 
                value={payoutForm.partner_id} 
                onValueChange={(v) => setPayoutForm(prev => ({ ...prev, partner_id: v }))}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Partner auswählen..." />
                </SelectTrigger>
                <SelectContent>
                  {partners.map((p) => (
                    <SelectItem key={p.id} value={p.id}>
                      {p.first_name} {p.last_name} ({p.email})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Betrag (€)</Label>
                <Input
                  type="number"
                  step="0.01"
                  value={payoutForm.payout_amount}
                  onChange={(e) => setPayoutForm(prev => ({ ...prev, payout_amount: e.target.value }))}
                />
              </div>
              <div className="space-y-2">
                <Label>Shares</Label>
                <Input
                  type="number"
                  value={payoutForm.partner_shares}
                  onChange={(e) => setPayoutForm(prev => ({ ...prev, partner_shares: e.target.value }))}
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Pool Level</Label>
                <Select 
                  value={payoutForm.pool_level} 
                  onValueChange={(v) => setPayoutForm(prev => ({ ...prev, pool_level: v }))}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="business_partner_plus">Business Partner Plus</SelectItem>
                    <SelectItem value="national_partner">National Partner</SelectItem>
                    <SelectItem value="world_partner">World Partner</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Status</Label>
                <Select 
                  value={payoutForm.status} 
                  onValueChange={(v) => setPayoutForm(prev => ({ ...prev, status: v }))}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="pending">Ausstehend</SelectItem>
                    <SelectItem value="paid">Ausgezahlt</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowAddPayoutDialog(false)}>Abbrechen</Button>
            <Button onClick={handleCreatePayout} disabled={isActionLoading}>
              {isActionLoading ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Plus className="h-4 w-4 mr-2" />}
              Erstellen
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit Payout Dialog */}
      <Dialog open={showEditPayoutDialog} onOpenChange={setShowEditPayoutDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Auszahlung bearbeiten</DialogTitle>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Betrag (€)</Label>
                <Input
                  type="number"
                  step="0.01"
                  value={payoutForm.payout_amount}
                  onChange={(e) => setPayoutForm(prev => ({ ...prev, payout_amount: e.target.value }))}
                />
              </div>
              <div className="space-y-2">
                <Label>Shares</Label>
                <Input
                  type="number"
                  value={payoutForm.partner_shares}
                  onChange={(e) => setPayoutForm(prev => ({ ...prev, partner_shares: e.target.value }))}
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label>Status</Label>
              <Select 
                value={payoutForm.status} 
                onValueChange={(v) => setPayoutForm(prev => ({ ...prev, status: v }))}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="pending">Ausstehend</SelectItem>
                  <SelectItem value="paid">Ausgezahlt</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowEditPayoutDialog(false)}>Abbrechen</Button>
            <Button onClick={handleUpdatePayout} disabled={isActionLoading}>
              {isActionLoading ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Save className="h-4 w-4 mr-2" />}
              Speichern
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
