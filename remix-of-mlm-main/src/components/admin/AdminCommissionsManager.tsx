import { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { supabase } from '@/integrations/supabase/client';
import { 
  Euro, Loader2, CheckCircle, XCircle, Clock, 
  ChevronLeft, ChevronRight, CreditCard, Download,
  Plus, Edit, Trash2, Save
} from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

interface Commission {
  id: string;
  commission_amount: number;
  commission_type: string;
  level_number: number;
  status: string;
  created_at: string;
  paid_at: string | null;
  partner: {
    id: string;
    first_name: string;
    last_name: string;
    email: string;
  };
  transaction: {
    id: string;
    amount: number;
    status: string;
    created_at: string;
    customer: {
      first_name: string;
      last_name: string;
    };
  };
}

interface Stats {
  pending: { count: number; amount: number };
  approved: { count: number; amount: number };
  paid: { count: number; amount: number };
  total: { count: number; amount: number };
}

interface Partner {
  id: string;
  first_name: string;
  last_name: string;
  email: string;
}

export function AdminCommissionsManager() {
  const { toast } = useToast();
  const [commissions, setCommissions] = useState<Commission[]>([]);
  const [partners, setPartners] = useState<Partner[]>([]);
  const [stats, setStats] = useState<Stats | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [statusFilter, setStatusFilter] = useState<string>('');
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [isActionLoading, setIsActionLoading] = useState(false);
  
  // Add/Edit Dialog
  const [showAddDialog, setShowAddDialog] = useState(false);
  const [showEditDialog, setShowEditDialog] = useState(false);
  const [selectedCommission, setSelectedCommission] = useState<Commission | null>(null);
  const [formData, setFormData] = useState({
    partner_id: '',
    commission_amount: '',
    commission_type: 'fixed',
    level_number: '1',
    status: 'pending'
  });

  const loadCommissions = async () => {
    setIsLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke('admin-commissions', {
        body: {
          action: 'list',
          filters: {
            status: statusFilter || undefined,
            page,
            limit: 25
          }
        }
      });

      if (error) throw error;
      
      setCommissions(data.commissions || []);
      setTotalPages(Math.ceil((data.pagination?.total || 0) / 25));
    } catch (err: unknown) {
      const error = err as Error;
      toast({ variant: 'destructive', title: 'Fehler', description: error.message });
    } finally {
      setIsLoading(false);
    }
  };

  const loadStats = async () => {
    try {
      const { data, error } = await supabase.functions.invoke('admin-commissions', {
        body: { action: 'stats' }
      });

      if (error) throw error;
      setStats(data.stats);
    } catch (err: unknown) {
      console.error('Stats error:', err);
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

  const updateStatus = async (commissionId: string, status: string) => {
    setIsActionLoading(true);
    try {
      const { error } = await supabase.functions.invoke('admin-commissions', {
        body: { action: 'update-status', commissionId, status }
      });

      if (error) throw error;

      toast({ title: 'Erfolg', description: `Status auf "${status}" geändert` });
      loadCommissions();
      loadStats();
    } catch (err: unknown) {
      const error = err as Error;
      toast({ variant: 'destructive', title: 'Fehler', description: error.message });
    } finally {
      setIsActionLoading(false);
    }
  };

  const payBatch = async () => {
    if (selectedIds.length === 0) return;

    setIsActionLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke('admin-commissions', {
        body: { action: 'pay-batch', commissionIds: selectedIds }
      });

      if (error) throw error;

      toast({ 
        title: 'Erfolg', 
        description: `${data.paidCount} Provisionen ausgezahlt` 
      });
      setSelectedIds([]);
      loadCommissions();
      loadStats();
    } catch (err: unknown) {
      const error = err as Error;
      toast({ variant: 'destructive', title: 'Fehler', description: error.message });
    } finally {
      setIsActionLoading(false);
    }
  };

  const handleCreateCommission = async () => {
    if (!formData.partner_id || !formData.commission_amount) {
      toast({ variant: 'destructive', title: 'Fehler', description: 'Partner und Betrag sind erforderlich' });
      return;
    }

    setIsActionLoading(true);
    try {
      const { error } = await supabase.functions.invoke('admin-commissions', {
        body: { 
          action: 'create',
          data: {
            partner_id: formData.partner_id,
            commission_amount: parseFloat(formData.commission_amount),
            commission_type: formData.commission_type,
            level_number: parseInt(formData.level_number),
            status: formData.status
          }
        }
      });

      if (error) throw error;

      toast({ title: 'Erfolg', description: 'Provision wurde erstellt' });
      setShowAddDialog(false);
      resetForm();
      loadCommissions();
      loadStats();
    } catch (err: unknown) {
      const error = err as Error;
      toast({ variant: 'destructive', title: 'Fehler', description: error.message });
    } finally {
      setIsActionLoading(false);
    }
  };

  const handleUpdateCommission = async () => {
    if (!selectedCommission) return;

    setIsActionLoading(true);
    try {
      const { error } = await supabase.functions.invoke('admin-commissions', {
        body: { 
          action: 'update',
          commissionId: selectedCommission.id,
          data: {
            commission_amount: parseFloat(formData.commission_amount),
            commission_type: formData.commission_type,
            level_number: parseInt(formData.level_number),
            status: formData.status
          }
        }
      });

      if (error) throw error;

      toast({ title: 'Erfolg', description: 'Provision wurde aktualisiert' });
      setShowEditDialog(false);
      resetForm();
      loadCommissions();
      loadStats();
    } catch (err: unknown) {
      const error = err as Error;
      toast({ variant: 'destructive', title: 'Fehler', description: error.message });
    } finally {
      setIsActionLoading(false);
    }
  };

  const handleDeleteCommission = async (id: string) => {
    if (!confirm('Möchten Sie diese Provision wirklich löschen?')) return;

    setIsActionLoading(true);
    try {
      const { error } = await supabase.functions.invoke('admin-commissions', {
        body: { action: 'delete', commissionId: id }
      });

      if (error) throw error;

      toast({ title: 'Erfolg', description: 'Provision wurde gelöscht' });
      loadCommissions();
      loadStats();
    } catch (err: unknown) {
      const error = err as Error;
      toast({ variant: 'destructive', title: 'Fehler', description: error.message });
    } finally {
      setIsActionLoading(false);
    }
  };

  const openEditDialog = (commission: Commission) => {
    setSelectedCommission(commission);
    setFormData({
      partner_id: commission.partner.id,
      commission_amount: commission.commission_amount.toString(),
      commission_type: commission.commission_type,
      level_number: commission.level_number.toString(),
      status: commission.status
    });
    setShowEditDialog(true);
  };

  const resetForm = () => {
    setFormData({
      partner_id: '',
      commission_amount: '',
      commission_type: 'fixed',
      level_number: '1',
      status: 'pending'
    });
    setSelectedCommission(null);
  };

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('de-DE', {
      style: 'currency',
      currency: 'EUR',
    }).format(amount);
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('de-DE', {
      day: '2-digit', month: '2-digit', year: 'numeric'
    });
  };

  const toggleSelect = (id: string) => {
    setSelectedIds(prev => 
      prev.includes(id) ? prev.filter(i => i !== id) : [...prev, id]
    );
  };

  const selectAllApproved = () => {
    const approvedIds = commissions
      .filter(c => c.status === 'approved')
      .map(c => c.id);
    setSelectedIds(approvedIds);
  };

  useEffect(() => {
    loadCommissions();
    loadStats();
    loadPartners();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [statusFilter, page]);

  return (
    <div className="space-y-6">
      {/* Commission Matrix */}
      <Card className="border-primary/20">
        <CardHeader className="pb-3">
          <CardTitle className="text-lg flex items-center gap-2">
            <Euro className="h-5 w-5 text-primary" />
            Upline-Provisionsmatrix (Sliding Window)
          </CardTitle>
          <CardDescription>Provisionsbeträge in € basierend auf Partner-Tiefe und Auszahlungsstufe</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="rounded-md border overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/50">
                  <TableHead className="font-bold">Tiefe (d)</TableHead>
                  <TableHead className="text-center font-bold">Auslöser</TableHead>
                  <TableHead className="text-center font-bold">Upline 1</TableHead>
                  <TableHead className="text-center font-bold">Upline 2</TableHead>
                  <TableHead className="text-center font-bold">Upline 3</TableHead>
                  <TableHead className="text-center font-bold">Upline 4</TableHead>
                  <TableHead className="text-center font-bold">Summe</TableHead>
                  <TableHead className="text-center font-bold">→ Pool</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {[
                  { depth: 'd=1', values: [100, null, null, null, null], pool: 0 },
                  { depth: 'd=2', values: [80, 20, null, null, null], pool: 0 },
                  { depth: 'd=3', values: [45, 20, 15, null, null], pool: 20 },
                  { depth: 'd=4', values: [45, 20, 15, 10, null], pool: 10 },
                  { depth: 'd≥5', values: [45, 20, 15, 10, 10], pool: 0 },
                ].map((row) => (
                  <TableRow key={row.depth}>
                    <TableCell className="font-bold">{row.depth}</TableCell>
                    {row.values.map((val, i) => (
                      <TableCell key={i} className="text-center">
                        {val !== null ? (
                          <Badge variant={i === 0 ? 'default' : 'outline'} className="min-w-[50px]">
                            {val}€
                          </Badge>
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </TableCell>
                    ))}
                    <TableCell className="text-center font-bold text-primary">
                      {row.values.filter(v => v !== null).reduce((a, b) => (a || 0) + (b || 0), 0)}€
                    </TableCell>
                    <TableCell className="text-center font-medium" style={{ color: 'hsl(var(--accent-foreground))' }}>
                      {row.pool > 0 ? `${row.pool}€` : '—'}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      {/* Stats */}
      {stats && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <Card className="border-yellow-500/30">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                <Clock className="h-4 w-4 text-yellow-500" />
                Ausstehend
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{formatCurrency(stats.pending.amount)}</div>
              <p className="text-xs text-muted-foreground">{stats.pending.count} Provisionen</p>
            </CardContent>
          </Card>
          <Card className="border-blue-500/30">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                <CheckCircle className="h-4 w-4 text-blue-500" />
                Genehmigt
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{formatCurrency(stats.approved.amount)}</div>
              <p className="text-xs text-muted-foreground">{stats.approved.count} Provisionen</p>
            </CardContent>
          </Card>
          <Card className="border-green-500/30">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                <CreditCard className="h-4 w-4 text-green-500" />
                Ausgezahlt
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{formatCurrency(stats.paid.amount)}</div>
              <p className="text-xs text-muted-foreground">{stats.paid.count} Provisionen</p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                <Euro className="h-4 w-4" />
                Gesamt
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-primary">{formatCurrency(stats.total.amount)}</div>
              <p className="text-xs text-muted-foreground">{stats.total.count} Provisionen</p>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Table */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                <Euro className="h-5 w-5" />
                Provisionen verwalten
              </CardTitle>
              <CardDescription>Alle Provisionen anzeigen, bearbeiten und auszahlen</CardDescription>
            </div>
            <div className="flex items-center gap-2">
              <Select value={statusFilter || 'all'} onValueChange={(v) => { setStatusFilter(v === 'all' ? '' : v); setPage(1); }}>
                <SelectTrigger className="w-[150px]">
                  <SelectValue placeholder="Status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Alle</SelectItem>
                  <SelectItem value="pending">Ausstehend</SelectItem>
                  <SelectItem value="approved">Genehmigt</SelectItem>
                  <SelectItem value="paid">Ausgezahlt</SelectItem>
                </SelectContent>
              </Select>
              <Button variant="outline" onClick={loadCommissions} disabled={isLoading}>
                {isLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Aktualisieren'}
              </Button>
              <Button onClick={() => { resetForm(); setShowAddDialog(true); }}>
                <Plus className="h-4 w-4 mr-2" />
                Neue Provision
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {/* Batch actions */}
          {selectedIds.length > 0 && (
            <div className="flex items-center justify-between mb-4 p-3 bg-muted rounded-lg">
              <span className="text-sm">{selectedIds.length} Provisionen ausgewählt</span>
              <div className="flex gap-2">
                <Button size="sm" variant="outline" onClick={() => setSelectedIds([])}>
                  Abwählen
                </Button>
                <Button 
                  size="sm" 
                  onClick={payBatch}
                  disabled={isActionLoading}
                >
                  {isActionLoading ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
                  Auszahlen
                </Button>
              </div>
            </div>
          )}

          {statusFilter === 'approved' && commissions.length > 0 && (
            <div className="mb-4">
              <Button size="sm" variant="outline" onClick={selectAllApproved}>
                Alle genehmigten auswählen
              </Button>
            </div>
          )}

          <div className="rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-[50px]"></TableHead>
                  <TableHead>Partner</TableHead>
                  <TableHead>Kunde</TableHead>
                  <TableHead>Stufe</TableHead>
                  <TableHead>Betrag</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Datum</TableHead>
                  <TableHead className="text-right">Aktionen</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {commissions.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={8} className="text-center py-8 text-muted-foreground">
                      {isLoading ? 'Laden...' : 'Keine Provisionen gefunden'}
                    </TableCell>
                  </TableRow>
                ) : (
                  commissions.map((commission) => (
                    <TableRow key={commission.id}>
                      <TableCell>
                        {commission.status === 'approved' && (
                          <Checkbox
                            checked={selectedIds.includes(commission.id)}
                            onCheckedChange={() => toggleSelect(commission.id)}
                          />
                        )}
                      </TableCell>
                      <TableCell>
                        <div>
                          <p className="font-medium">
                            {commission.partner?.first_name} {commission.partner?.last_name}
                          </p>
                          <p className="text-xs text-muted-foreground">
                            {commission.partner?.email}
                          </p>
                        </div>
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        {commission.transaction?.customer?.first_name} {commission.transaction?.customer?.last_name}
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline">Stufe {commission.level_number}</Badge>
                      </TableCell>
                      <TableCell className="font-medium">
                        {formatCurrency(commission.commission_amount)}
                      </TableCell>
                      <TableCell>
                        <Badge 
                          variant={
                            commission.status === 'paid' ? 'default' : 
                            commission.status === 'approved' ? 'secondary' : 
                            'outline'
                          }
                        >
                          {commission.status === 'paid' ? 'Ausgezahlt' :
                           commission.status === 'approved' ? 'Genehmigt' : 'Ausstehend'}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-muted-foreground text-sm">
                        {formatDate(commission.created_at)}
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-1">
                          <Button 
                            size="sm" 
                            variant="ghost"
                            onClick={() => openEditDialog(commission)}
                            disabled={isActionLoading}
                            title="Bearbeiten"
                          >
                            <Edit className="h-4 w-4" />
                          </Button>
                          {commission.status === 'pending' && (
                            <Button 
                              size="sm" 
                              variant="ghost"
                              onClick={() => updateStatus(commission.id, 'approved')}
                              disabled={isActionLoading}
                              title="Genehmigen"
                            >
                              <CheckCircle className="h-4 w-4 text-green-500" />
                            </Button>
                          )}
                          {commission.status === 'approved' && (
                            <Button 
                              size="sm" 
                              variant="ghost"
                              onClick={() => updateStatus(commission.id, 'paid')}
                              disabled={isActionLoading}
                              title="Auszahlen"
                            >
                              <CreditCard className="h-4 w-4 text-primary" />
                            </Button>
                          )}
                          {commission.status !== 'cancelled' && commission.status !== 'paid' && (
                            <Button 
                              size="sm" 
                              variant="ghost"
                              onClick={() => updateStatus(commission.id, 'cancelled')}
                              disabled={isActionLoading}
                              title="Stornieren"
                            >
                              <XCircle className="h-4 w-4 text-red-500" />
                            </Button>
                          )}
                          <Button 
                            size="sm" 
                            variant="ghost"
                            onClick={() => handleDeleteCommission(commission.id)}
                            disabled={isActionLoading}
                            title="Löschen"
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

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex items-center justify-between mt-4">
              <p className="text-sm text-muted-foreground">Seite {page} von {totalPages}</p>
              <div className="flex gap-2">
                <Button 
                  variant="outline" 
                  size="sm" 
                  onClick={() => setPage(p => p - 1)}
                  disabled={page === 1}
                >
                  <ChevronLeft className="h-4 w-4" />
                </Button>
                <Button 
                  variant="outline" 
                  size="sm" 
                  onClick={() => setPage(p => p + 1)}
                  disabled={page >= totalPages}
                >
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Add Commission Dialog */}
      <Dialog open={showAddDialog} onOpenChange={setShowAddDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Neue Provision erstellen</DialogTitle>
            <DialogDescription>Erstellen Sie eine manuelle Provision für einen Partner</DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="space-y-2">
              <Label>Partner</Label>
              <Select 
                value={formData.partner_id} 
                onValueChange={(v) => setFormData(prev => ({ ...prev, partner_id: v }))}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Partner auswählen..." />
                </SelectTrigger>
                <SelectContent>
                  {partners.map((partner) => (
                    <SelectItem key={partner.id} value={partner.id}>
                      {partner.first_name} {partner.last_name} ({partner.email})
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
                  value={formData.commission_amount}
                  onChange={(e) => setFormData(prev => ({ ...prev, commission_amount: e.target.value }))}
                  placeholder="0.00"
                />
              </div>
              <div className="space-y-2">
                <Label>Typ</Label>
                <Select 
                  value={formData.commission_type} 
                  onValueChange={(v) => setFormData(prev => ({ ...prev, commission_type: v }))}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="fixed">Festbetrag</SelectItem>
                    <SelectItem value="percentage">Prozent</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Stufe</Label>
                <Select 
                  value={formData.level_number} 
                  onValueChange={(v) => setFormData(prev => ({ ...prev, level_number: v }))}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {[1, 2, 3, 4, 5].map(level => (
                      <SelectItem key={level} value={level.toString()}>Stufe {level}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Status</Label>
                <Select 
                  value={formData.status} 
                  onValueChange={(v) => setFormData(prev => ({ ...prev, status: v }))}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="pending">Ausstehend</SelectItem>
                    <SelectItem value="approved">Genehmigt</SelectItem>
                    <SelectItem value="paid">Ausgezahlt</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowAddDialog(false)}>
              Abbrechen
            </Button>
            <Button onClick={handleCreateCommission} disabled={isActionLoading}>
              {isActionLoading ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Plus className="h-4 w-4 mr-2" />}
              Erstellen
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit Commission Dialog */}
      <Dialog open={showEditDialog} onOpenChange={setShowEditDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Provision bearbeiten</DialogTitle>
            <DialogDescription>Ändern Sie die Details der Provision</DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Betrag (€)</Label>
                <Input
                  type="number"
                  step="0.01"
                  value={formData.commission_amount}
                  onChange={(e) => setFormData(prev => ({ ...prev, commission_amount: e.target.value }))}
                />
              </div>
              <div className="space-y-2">
                <Label>Typ</Label>
                <Select 
                  value={formData.commission_type} 
                  onValueChange={(v) => setFormData(prev => ({ ...prev, commission_type: v }))}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="fixed">Festbetrag</SelectItem>
                    <SelectItem value="percentage">Prozent</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Stufe</Label>
                <Select 
                  value={formData.level_number} 
                  onValueChange={(v) => setFormData(prev => ({ ...prev, level_number: v }))}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {[1, 2, 3, 4, 5].map(level => (
                      <SelectItem key={level} value={level.toString()}>Stufe {level}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Status</Label>
                <Select 
                  value={formData.status} 
                  onValueChange={(v) => setFormData(prev => ({ ...prev, status: v }))}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="pending">Ausstehend</SelectItem>
                    <SelectItem value="approved">Genehmigt</SelectItem>
                    <SelectItem value="paid">Ausgezahlt</SelectItem>
                    <SelectItem value="cancelled">Storniert</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowEditDialog(false)}>
              Abbrechen
            </Button>
            <Button onClick={handleUpdateCommission} disabled={isActionLoading}>
              {isActionLoading ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Save className="h-4 w-4 mr-2" />}
              Speichern
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
