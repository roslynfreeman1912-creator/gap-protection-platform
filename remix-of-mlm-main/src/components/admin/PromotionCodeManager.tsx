import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { useToast } from '@/hooks/use-toast';
import { Plus, Copy, Trash2, RefreshCw, Loader2, CheckCircle, XCircle, Search } from 'lucide-react';

interface PromotionCode {
  id: string;
  code: string;
  partner_id: string;
  is_active: boolean;
  usage_count: number;
  max_uses: number | null;
  expires_at: string | null;
  created_at: string;
  partner?: {
    first_name: string;
    last_name: string;
    email: string;
  };
}

interface Partner {
  id: string;
  first_name: string;
  last_name: string;
  email: string;
}

export function PromotionCodeManager() {
  const { toast } = useToast();
  const [codes, setCodes] = useState<PromotionCode[]>([]);
  const [partners, setPartners] = useState<Partner[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isCreating, setIsCreating] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  
  // Form state for creating new code
  const [newCode, setNewCode] = useState({
    code: '',
    partnerId: '',
    maxUses: '',
    expiresAt: '',
  });

  const loadData = useCallback(async () => {
    setIsLoading(true);
    try {
      // Load promotion codes with partner info using service role through edge function
      const { data: codesData, error: codesError } = await supabase.functions.invoke('get-promotion-codes', {
        method: 'POST',
      });
      
      if (codesError) throw codesError;
      setCodes(codesData?.codes || []);

      // Load partners (users with partner role)
      const { data: partnersData, error: partnersError } = await supabase.functions.invoke('get-partners-list', {
        method: 'POST',
      });
      
      if (partnersError) throw partnersError;
      setPartners(partnersData?.partners || []);
      
    } catch (error: any) {
      console.error('Error loading promotion codes:', error);
      toast({
        variant: 'destructive',
        title: 'Fehler',
        description: 'Daten konnten nicht geladen werden.',
      });
    } finally {
      setIsLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const generateCode = () => {
    const prefix = 'GP-';
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    let randomPart = '';
    for (let i = 0; i < 6; i++) {
      randomPart += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    setNewCode(prev => ({ ...prev, code: prefix + randomPart }));
  };

  const createCode = async () => {
    if (!newCode.code || !newCode.partnerId) {
      toast({
        variant: 'destructive',
        title: 'Fehler',
        description: 'Code und Partner sind erforderlich.',
      });
      return;
    }

    setIsCreating(true);
    try {
      const { data, error } = await supabase.functions.invoke('create-promotion-code', {
        method: 'POST',
        body: {
          code: newCode.code.toUpperCase(),
          partnerId: newCode.partnerId,
          maxUses: newCode.maxUses ? parseInt(newCode.maxUses) : null,
          expiresAt: newCode.expiresAt || null,
        },
      });

      if (error) throw error;

      toast({
        title: 'Erfolg',
        description: `Promotion Code "${newCode.code}" wurde erstellt.`,
      });

      setNewCode({ code: '', partnerId: '', maxUses: '', expiresAt: '' });
      setIsDialogOpen(false);
      loadData();
    } catch (error: any) {
      console.error('Error creating code:', error);
      toast({
        variant: 'destructive',
        title: 'Fehler',
        description: error.message || 'Code konnte nicht erstellt werden.',
      });
    } finally {
      setIsCreating(false);
    }
  };

  const toggleCodeStatus = async (codeId: string, isActive: boolean) => {
    try {
      const { error } = await supabase.functions.invoke('update-promotion-code', {
        method: 'POST',
        body: { codeId, isActive: !isActive },
      });

      if (error) throw error;

      setCodes(prev => prev.map(c => 
        c.id === codeId ? { ...c, is_active: !isActive } : c
      ));

      toast({
        title: 'Status geändert',
        description: `Code ist jetzt ${!isActive ? 'aktiv' : 'inaktiv'}.`,
      });
    } catch (error: any) {
      toast({
        variant: 'destructive',
        title: 'Fehler',
        description: error.message,
      });
    }
  };

  const deleteCode = async (codeId: string, code: string) => {
    if (!confirm(`Möchten Sie den Code "${code}" wirklich löschen?`)) return;

    try {
      const { error } = await supabase.functions.invoke('delete-promotion-code', {
        method: 'POST',
        body: { codeId },
      });

      if (error) throw error;

      setCodes(prev => prev.filter(c => c.id !== codeId));

      toast({
        title: 'Gelöscht',
        description: `Code "${code}" wurde entfernt.`,
      });
    } catch (error: any) {
      toast({
        variant: 'destructive',
        title: 'Fehler',
        description: error.message,
      });
    }
  };

  const copyCode = (code: string) => {
    navigator.clipboard.writeText(code);
    toast({
      title: 'Kopiert',
      description: `"${code}" in Zwischenablage kopiert.`,
    });
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('de-DE', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
    });
  };

  const filteredCodes = codes.filter(c =>
    c.code.toLowerCase().includes(searchTerm.toLowerCase()) ||
    (c.partner?.first_name?.toLowerCase().includes(searchTerm.toLowerCase())) ||
    (c.partner?.last_name?.toLowerCase().includes(searchTerm.toLowerCase())) ||
    (c.partner?.email?.toLowerCase().includes(searchTerm.toLowerCase()))
  );

  if (isLoading) {
    return (
      <Card>
        <CardContent className="py-12">
          <div className="flex items-center justify-center">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
            <span className="ml-2">Lade Promotion Codes...</span>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle>Promotion Codes</CardTitle>
            <CardDescription>
              Erstellen und verwalten Sie Promotion Codes für Partner
            </CardDescription>
          </div>
          <div className="flex items-center gap-3">
            <div className="relative w-64">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Suchen..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-10"
              />
            </div>
            <Button variant="outline" size="sm" onClick={loadData}>
              <RefreshCw className="h-4 w-4 mr-2" />
              Aktualisieren
            </Button>
            <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
              <Button onClick={() => setIsDialogOpen(true)}>
                <Plus className="h-4 w-4 mr-2" />
                Neuer Code
              </Button>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Neuen Promotion Code erstellen</DialogTitle>
                  <DialogDescription>
                    Erstellen Sie einen eindeutigen Code für einen Partner.
                  </DialogDescription>
                </DialogHeader>
                
                <div className="space-y-4 py-4">
                  <div className="space-y-2">
                    <Label htmlFor="code">Code</Label>
                    <div className="flex gap-2">
                      <Input
                        id="code"
                        placeholder="GP-XXXXXX"
                        value={newCode.code}
                        onChange={(e) => setNewCode(prev => ({ 
                          ...prev, 
                          code: e.target.value.toUpperCase() 
                        }))}
                        className="flex-1"
                      />
                      <Button type="button" variant="outline" onClick={generateCode}>
                        <RefreshCw className="h-4 w-4 mr-2" />
                        Generieren
                      </Button>
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="partner">Partner zuweisen</Label>
                    <Select 
                      value={newCode.partnerId} 
                      onValueChange={(value) => setNewCode(prev => ({ ...prev, partnerId: value }))}
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
                      <Label htmlFor="maxUses">Max. Verwendungen (optional)</Label>
                      <Input
                        id="maxUses"
                        type="number"
                        placeholder="Unbegrenzt"
                        value={newCode.maxUses}
                        onChange={(e) => setNewCode(prev => ({ ...prev, maxUses: e.target.value }))}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="expiresAt">Ablaufdatum (optional)</Label>
                      <Input
                        id="expiresAt"
                        type="date"
                        value={newCode.expiresAt}
                        onChange={(e) => setNewCode(prev => ({ ...prev, expiresAt: e.target.value }))}
                      />
                    </div>
                  </div>
                </div>

                <DialogFooter>
                  <Button variant="outline" onClick={() => setIsDialogOpen(false)}>
                    Abbrechen
                  </Button>
                  <Button onClick={createCode} disabled={isCreating}>
                    {isCreating ? (
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    ) : (
                      <Plus className="h-4 w-4 mr-2" />
                    )}
                    Erstellen
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          </div>
        </div>
      </CardHeader>

      <CardContent>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Code</TableHead>
              <TableHead>Partner</TableHead>
              <TableHead>Verwendungen</TableHead>
              <TableHead>Ablauf</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Erstellt</TableHead>
              <TableHead className="text-right">Aktionen</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filteredCodes.map((promo) => (
              <TableRow key={promo.id}>
                <TableCell>
                  <div className="flex items-center gap-2">
                    <code className="px-2 py-1 bg-muted rounded text-sm font-mono">
                      {promo.code}
                    </code>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => copyCode(promo.code)}
                    >
                      <Copy className="h-3 w-3" />
                    </Button>
                  </div>
                </TableCell>
                <TableCell>
                  {promo.partner ? (
                    <div>
                      <p className="font-medium">
                        {promo.partner.first_name} {promo.partner.last_name}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {promo.partner.email}
                      </p>
                    </div>
                  ) : (
                    <span className="text-muted-foreground">-</span>
                  )}
                </TableCell>
                <TableCell>
                  <span className="font-medium">{promo.usage_count}</span>
                  {promo.max_uses && (
                    <span className="text-muted-foreground"> / {promo.max_uses}</span>
                  )}
                </TableCell>
                <TableCell>
                  {promo.expires_at ? (
                    <span className={new Date(promo.expires_at) < new Date() ? 'text-destructive' : ''}>
                      {formatDate(promo.expires_at)}
                    </span>
                  ) : (
                    <span className="text-muted-foreground">Nie</span>
                  )}
                </TableCell>
                <TableCell>
                  <div className="flex items-center gap-2">
                    <Switch
                      checked={promo.is_active}
                      onCheckedChange={() => toggleCodeStatus(promo.id, promo.is_active)}
                    />
                    <Badge variant={promo.is_active ? 'default' : 'secondary'}>
                      {promo.is_active ? 'Aktiv' : 'Inaktiv'}
                    </Badge>
                  </div>
                </TableCell>
                <TableCell className="text-muted-foreground">
                  {formatDate(promo.created_at)}
                </TableCell>
                <TableCell className="text-right">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => deleteCode(promo.id, promo.code)}
                  >
                    <Trash2 className="h-4 w-4 text-destructive" />
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>

        {filteredCodes.length === 0 && (
          <p className="text-center text-muted-foreground py-8">
            {searchTerm ? 'Keine Codes gefunden.' : 'Noch keine Promotion Codes vorhanden.'}
          </p>
        )}

        {/* Summary Stats */}
        <div className="flex items-center gap-6 mt-6 pt-4 border-t text-sm text-muted-foreground">
          <div className="flex items-center gap-2">
            <CheckCircle className="h-4 w-4 text-green-500" />
            <span>{codes.filter(c => c.is_active).length} aktive Codes</span>
          </div>
          <div className="flex items-center gap-2">
            <XCircle className="h-4 w-4 text-red-500" />
            <span>{codes.filter(c => !c.is_active).length} inaktive Codes</span>
          </div>
          <div>
            Gesamt: {codes.reduce((sum, c) => sum + c.usage_count, 0)} Verwendungen
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
