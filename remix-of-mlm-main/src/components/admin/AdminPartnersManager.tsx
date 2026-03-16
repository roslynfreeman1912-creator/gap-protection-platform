import { useState, useEffect, useCallback } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { 
  Dialog, DialogContent, DialogDescription, DialogFooter, 
  DialogHeader, DialogTitle 
} from '@/components/ui/dialog';
import { supabase } from '@/integrations/supabase/client';
import { 
  Users, Search, Loader2, UserPlus, UserMinus, CheckCircle, 
  XCircle, Eye, Edit, ChevronLeft, ChevronRight, Crown, Ban, 
  Plus, Trash2, Save
} from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

interface Profile {
  id: string;
  first_name: string;
  last_name: string;
  email: string;
  phone: string | null;
  status: string;
  created_at: string;
  street: string | null;
  house_number: string | null;
  postal_code: string | null;
  city: string | null;
  country: string | null;
  iban: string | null;
  bic: string | null;
  bank_name: string | null;
  sponsor?: {
    id: string;
    first_name: string;
    last_name: string;
    email: string;
  } | null;
  user_roles?: { role: string }[];
  roles?: string[];
  promotion_codes?: { id: string; code: string; usage_count: number; is_active: boolean }[];
}

interface Stats {
  total: number;
  partners: number;
  pending: number;
  active: number;
}

interface AdminPartnersManagerProps {
  onRefresh?: () => void;
}

export function AdminPartnersManager({ onRefresh }: AdminPartnersManagerProps) {
  const { toast } = useToast();
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [stats, setStats] = useState<Stats>({ total: 0, partners: 0, pending: 0, active: 0 });
  const [isLoading, setIsLoading] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('');
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [selectedProfile, setSelectedProfile] = useState<Profile | null>(null);
  const [isActionLoading, setIsActionLoading] = useState(false);
  const [showDetailDialog, setShowDetailDialog] = useState(false);
  const [showEditDialog, setShowEditDialog] = useState(false);
  const [showAddDialog, setShowAddDialog] = useState(false);
  const [editForm, setEditForm] = useState<Partial<Profile>>({});
  const [newPartner, setNewPartner] = useState({
    first_name: '',
    last_name: '',
    email: '',
    phone: '',
    status: 'pending'
  });

  const loadProfiles = useCallback(async () => {
    setIsLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke('admin-partners', {
        body: {
          action: 'list',
          filters: {
            search: searchTerm || undefined,
            status: statusFilter || undefined,
            page,
            limit: 20
          }
        }
      });

      if (error) throw error;
      
      setProfiles(data.profiles || []);
      setStats(data.stats || { total: 0, partners: 0, pending: 0, active: 0 });
      setTotalPages(Math.ceil((data.pagination?.total || 0) / 20));
    } catch (error: any) {
      toast({ variant: 'destructive', title: 'Fehler', description: error.message });
    } finally {
      setIsLoading(false);
    }
  }, [searchTerm, statusFilter, page, toast]);

  const handleAction = async (action: string, profileId: string) => {
    setIsActionLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke('admin-partners', {
        body: { action, profileId }
      });

      if (error) throw error;

      toast({ 
        title: 'Erfolg', 
        description: action === 'promote' 
          ? `Partner befördert. Code: ${data.promotionCode}` 
          : 'Aktion erfolgreich'
      });
      
      loadProfiles();
      onRefresh?.();
    } catch (error: any) {
      toast({ variant: 'destructive', title: 'Fehler', description: error.message });
    } finally {
      setIsActionLoading(false);
    }
  };

  const viewProfile = async (profileId: string) => {
    setIsActionLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke('admin-partners', {
        body: { action: 'get', profileId }
      });

      if (error) throw error;
      setSelectedProfile(data.profile);
      setShowDetailDialog(true);
    } catch (error: any) {
      toast({ variant: 'destructive', title: 'Fehler', description: error.message });
    } finally {
      setIsActionLoading(false);
    }
  };

  const openEditDialog = (profile: Profile) => {
    setEditForm({
      first_name: profile.first_name,
      last_name: profile.last_name,
      email: profile.email,
      phone: profile.phone || '',
      status: profile.status,
      street: profile.street || '',
      house_number: profile.house_number || '',
      postal_code: profile.postal_code || '',
      city: profile.city || '',
      country: profile.country || 'Deutschland',
      iban: profile.iban || '',
      bic: profile.bic || '',
      bank_name: profile.bank_name || ''
    });
    setSelectedProfile(profile);
    setShowEditDialog(true);
  };

  const handleUpdateProfile = async () => {
    if (!selectedProfile) return;
    setIsActionLoading(true);
    try {
      const { error } = await supabase.functions.invoke('admin-partners', {
        body: { 
          action: 'update', 
          profileId: selectedProfile.id,
          data: editForm
        }
      });

      if (error) throw error;

      toast({ title: 'Erfolg', description: 'Profil wurde aktualisiert' });
      setShowEditDialog(false);
      loadProfiles();
    } catch (error: any) {
      toast({ variant: 'destructive', title: 'Fehler', description: error.message });
    } finally {
      setIsActionLoading(false);
    }
  };

  const handleDeleteProfile = async (profileId: string, name: string) => {
    if (!confirm(`Möchten Sie "${name}" wirklich löschen? Diese Aktion kann nicht rückgängig gemacht werden.`)) {
      return;
    }
    
    setIsActionLoading(true);
    try {
      const { error } = await supabase.functions.invoke('admin-partners', {
        body: { action: 'delete', profileId }
      });

      if (error) throw error;

      toast({ title: 'Erfolg', description: 'Profil wurde gelöscht' });
      loadProfiles();
    } catch (error: any) {
      toast({ variant: 'destructive', title: 'Fehler', description: error.message });
    } finally {
      setIsActionLoading(false);
    }
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('de-DE', {
      day: '2-digit', month: '2-digit', year: 'numeric'
    });
  };

  const hasRole = (profile: Profile, role: string) => {
    return profile.user_roles?.some(r => r.role === role) || profile.roles?.includes(role);
  };

  useEffect(() => {
    loadProfiles();
  }, [loadProfiles]);

  return (
    <div className="space-y-6">
      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Gesamt</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.total}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Partner</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-primary">{stats.partners}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Ausstehend</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-yellow-500">{stats.pending}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Aktiv</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-green-500">{stats.active}</div>
          </CardContent>
        </Card>
      </div>

      {/* Filters */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                <Users className="h-5 w-5" />
                Partner & Kunden verwalten
              </CardTitle>
              <CardDescription>Alle Benutzer anzeigen, bearbeiten und verwalten</CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col md:flex-row gap-4 mb-6">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Name, E-Mail suchen..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && loadProfiles()}
                className="pl-10"
              />
            </div>
            <Select value={statusFilter} onValueChange={(val) => setStatusFilter(val === 'all' ? '' : val)}>
              <SelectTrigger className="w-[180px]">
                <SelectValue placeholder="Status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Alle Status</SelectItem>
                <SelectItem value="pending">Ausstehend</SelectItem>
                <SelectItem value="active">Aktiv</SelectItem>
                <SelectItem value="suspended">Gesperrt</SelectItem>
              </SelectContent>
            </Select>
            <Button onClick={loadProfiles} disabled={isLoading}>
              {isLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Suchen'}
            </Button>
          </div>

          {/* Table */}
          <div className="rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>E-Mail</TableHead>
                  <TableHead>Rollen</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Sponsor</TableHead>
                  <TableHead>Datum</TableHead>
                  <TableHead className="text-right">Aktionen</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {profiles.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={7} className="text-center py-8 text-muted-foreground">
                      {isLoading ? 'Laden...' : 'Keine Benutzer gefunden'}
                    </TableCell>
                  </TableRow>
                ) : (
                  profiles.map((profile) => (
                    <TableRow key={profile.id}>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center text-xs font-medium">
                            {profile.first_name?.[0]}{profile.last_name?.[0]}
                          </div>
                          <span className="font-medium">{profile.first_name} {profile.last_name}</span>
                        </div>
                      </TableCell>
                      <TableCell className="text-muted-foreground">{profile.email}</TableCell>
                      <TableCell>
                        <div className="flex gap-1">
                          {hasRole(profile, 'admin') && <Badge variant="default">Admin</Badge>}
                          {hasRole(profile, 'partner') && <Badge variant="secondary">Partner</Badge>}
                          {hasRole(profile, 'customer') && !hasRole(profile, 'partner') && (
                            <Badge variant="outline">Kunde</Badge>
                          )}
                        </div>
                      </TableCell>
                      <TableCell>
                        <Badge 
                          variant={
                            profile.status === 'active' ? 'default' : 
                            profile.status === 'pending' ? 'secondary' : 
                            'destructive'
                          }
                        >
                          {profile.status === 'active' ? 'Aktiv' : 
                           profile.status === 'pending' ? 'Ausstehend' : 'Gesperrt'}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-muted-foreground text-sm">
                        {profile.sponsor ? `${profile.sponsor.first_name} ${profile.sponsor.last_name}` : '-'}
                      </TableCell>
                      <TableCell className="text-muted-foreground text-sm">
                        {formatDate(profile.created_at)}
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-1">
                          <Button 
                            size="icon" 
                            variant="ghost" 
                            onClick={() => viewProfile(profile.id)}
                            disabled={isActionLoading}
                            title="Details anzeigen"
                          >
                            <Eye className="h-4 w-4" />
                          </Button>
                          <Button 
                            size="icon" 
                            variant="ghost" 
                            onClick={() => openEditDialog(profile)}
                            disabled={isActionLoading}
                            title="Bearbeiten"
                          >
                            <Edit className="h-4 w-4" />
                          </Button>
                          {!hasRole(profile, 'partner') && !hasRole(profile, 'admin') && (
                            <Button 
                              size="icon" 
                              variant="ghost" 
                              onClick={() => handleAction('promote', profile.id)}
                              disabled={isActionLoading}
                              title="Zum Partner befördern"
                            >
                              <Crown className="h-4 w-4 text-yellow-500" />
                            </Button>
                          )}
                          {hasRole(profile, 'partner') && !hasRole(profile, 'admin') && (
                            <Button 
                              size="icon" 
                              variant="ghost" 
                              onClick={() => handleAction('demote', profile.id)}
                              disabled={isActionLoading}
                              title="Partner-Status entfernen"
                            >
                              <UserMinus className="h-4 w-4 text-red-500" />
                            </Button>
                          )}
                          {profile.status === 'pending' && (
                            <Button 
                              size="icon" 
                              variant="ghost" 
                              onClick={() => handleAction('activate', profile.id)}
                              disabled={isActionLoading}
                              title="Aktivieren"
                            >
                              <CheckCircle className="h-4 w-4 text-green-500" />
                            </Button>
                          )}
                          {profile.status === 'active' && !hasRole(profile, 'admin') && (
                            <Button 
                              size="icon" 
                              variant="ghost" 
                              onClick={() => handleAction('suspend', profile.id)}
                              disabled={isActionLoading}
                              title="Sperren"
                            >
                              <Ban className="h-4 w-4 text-red-500" />
                            </Button>
                          )}
                          {!hasRole(profile, 'admin') && (
                            <Button 
                              size="icon" 
                              variant="ghost" 
                              onClick={() => handleDeleteProfile(profile.id, `${profile.first_name} ${profile.last_name}`)}
                              disabled={isActionLoading}
                              title="Löschen"
                            >
                              <Trash2 className="h-4 w-4 text-red-500" />
                            </Button>
                          )}
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
              <p className="text-sm text-muted-foreground">
                Seite {page} von {totalPages}
              </p>
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

      {/* Detail Dialog */}
      <Dialog open={showDetailDialog} onOpenChange={setShowDetailDialog}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>
              {selectedProfile?.first_name} {selectedProfile?.last_name}
            </DialogTitle>
            <DialogDescription>{selectedProfile?.email}</DialogDescription>
          </DialogHeader>
          {selectedProfile && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <p className="text-sm text-muted-foreground">Telefon</p>
                  <p className="font-medium">{selectedProfile.phone || '-'}</p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Status</p>
                  <Badge>{selectedProfile.status}</Badge>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Registriert am</p>
                  <p className="font-medium">{formatDate(selectedProfile.created_at)}</p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Sponsor</p>
                  <p className="font-medium">
                    {selectedProfile.sponsor 
                      ? `${selectedProfile.sponsor.first_name} ${selectedProfile.sponsor.last_name}`
                      : 'Kein Sponsor'}
                  </p>
                </div>
              </div>
              
              {/* Address */}
              <div className="border-t pt-4">
                <h4 className="font-medium mb-2">Adresse</h4>
                <p className="text-sm text-muted-foreground">
                  {selectedProfile.street} {selectedProfile.house_number}<br />
                  {selectedProfile.postal_code} {selectedProfile.city}<br />
                  {selectedProfile.country}
                </p>
              </div>
              
              {/* Bank Details */}
              <div className="border-t pt-4">
                <h4 className="font-medium mb-2">Bankdaten</h4>
                <div className="grid grid-cols-2 gap-2 text-sm">
                  <div>
                    <p className="text-muted-foreground">IBAN</p>
                    <p>{selectedProfile.iban || '-'}</p>
                  </div>
                  <div>
                    <p className="text-muted-foreground">BIC</p>
                    <p>{selectedProfile.bic || '-'}</p>
                  </div>
                  <div>
                    <p className="text-muted-foreground">Bank</p>
                    <p>{selectedProfile.bank_name || '-'}</p>
                  </div>
                </div>
              </div>
              
              {selectedProfile.promotion_codes && selectedProfile.promotion_codes.length > 0 && (
                <div className="border-t pt-4">
                  <p className="text-sm text-muted-foreground mb-2">Promotion Codes</p>
                  <div className="flex flex-wrap gap-2">
                    {selectedProfile.promotion_codes.map(code => (
                      <Badge key={code.id} variant={code.is_active ? 'default' : 'secondary'}>
                        {code.code} ({code.usage_count} Nutzungen)
                      </Badge>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowDetailDialog(false)}>
              Schließen
            </Button>
            <Button onClick={() => {
              setShowDetailDialog(false);
              if (selectedProfile) openEditDialog(selectedProfile);
            }}>
              <Edit className="h-4 w-4 mr-2" />
              Bearbeiten
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit Dialog */}
      <Dialog open={showEditDialog} onOpenChange={setShowEditDialog}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Profil bearbeiten</DialogTitle>
            <DialogDescription>Ändern Sie die Daten des Benutzers</DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="first_name">Vorname</Label>
                <Input
                  id="first_name"
                  value={editForm.first_name || ''}
                  onChange={(e) => setEditForm(prev => ({ ...prev, first_name: e.target.value }))}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="last_name">Nachname</Label>
                <Input
                  id="last_name"
                  value={editForm.last_name || ''}
                  onChange={(e) => setEditForm(prev => ({ ...prev, last_name: e.target.value }))}
                />
              </div>
            </div>
            
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="email">E-Mail</Label>
                <Input
                  id="email"
                  type="email"
                  value={editForm.email || ''}
                  onChange={(e) => setEditForm(prev => ({ ...prev, email: e.target.value }))}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="phone">Telefon</Label>
                <Input
                  id="phone"
                  value={editForm.phone || ''}
                  onChange={(e) => setEditForm(prev => ({ ...prev, phone: e.target.value }))}
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="status">Status</Label>
              <Select 
                value={editForm.status || ''} 
                onValueChange={(val) => setEditForm(prev => ({ ...prev, status: val }))}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="pending">Ausstehend</SelectItem>
                  <SelectItem value="active">Aktiv</SelectItem>
                  <SelectItem value="suspended">Gesperrt</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="border-t pt-4">
              <h4 className="font-medium mb-4">Adresse</h4>
              <div className="grid grid-cols-3 gap-4">
                <div className="col-span-2 space-y-2">
                  <Label htmlFor="street">Straße</Label>
                  <Input
                    id="street"
                    value={editForm.street || ''}
                    onChange={(e) => setEditForm(prev => ({ ...prev, street: e.target.value }))}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="house_number">Nr.</Label>
                  <Input
                    id="house_number"
                    value={editForm.house_number || ''}
                    onChange={(e) => setEditForm(prev => ({ ...prev, house_number: e.target.value }))}
                  />
                </div>
              </div>
              <div className="grid grid-cols-3 gap-4 mt-4">
                <div className="space-y-2">
                  <Label htmlFor="postal_code">PLZ</Label>
                  <Input
                    id="postal_code"
                    value={editForm.postal_code || ''}
                    onChange={(e) => setEditForm(prev => ({ ...prev, postal_code: e.target.value }))}
                  />
                </div>
                <div className="col-span-2 space-y-2">
                  <Label htmlFor="city">Stadt</Label>
                  <Input
                    id="city"
                    value={editForm.city || ''}
                    onChange={(e) => setEditForm(prev => ({ ...prev, city: e.target.value }))}
                  />
                </div>
              </div>
              <div className="mt-4 space-y-2">
                <Label htmlFor="country">Land</Label>
                <Input
                  id="country"
                  value={editForm.country || ''}
                  onChange={(e) => setEditForm(prev => ({ ...prev, country: e.target.value }))}
                />
              </div>
            </div>

            <div className="border-t pt-4">
              <h4 className="font-medium mb-4">Bankdaten</h4>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="iban">IBAN</Label>
                  <Input
                    id="iban"
                    value={editForm.iban || ''}
                    onChange={(e) => setEditForm(prev => ({ ...prev, iban: e.target.value }))}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="bic">BIC</Label>
                  <Input
                    id="bic"
                    value={editForm.bic || ''}
                    onChange={(e) => setEditForm(prev => ({ ...prev, bic: e.target.value }))}
                  />
                </div>
              </div>
              <div className="mt-4 space-y-2">
                <Label htmlFor="bank_name">Bank</Label>
                <Input
                  id="bank_name"
                  value={editForm.bank_name || ''}
                  onChange={(e) => setEditForm(prev => ({ ...prev, bank_name: e.target.value }))}
                />
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowEditDialog(false)}>
              Abbrechen
            </Button>
            <Button onClick={handleUpdateProfile} disabled={isActionLoading}>
              {isActionLoading ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <Save className="h-4 w-4 mr-2" />
              )}
              Speichern
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
