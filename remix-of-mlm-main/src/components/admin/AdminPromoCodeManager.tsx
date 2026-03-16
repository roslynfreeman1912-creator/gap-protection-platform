import { useState, useEffect, useCallback } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { supabase } from '@/integrations/supabase/client';
import { 
  Key, Clock, RefreshCw, Plus, Trash2, Copy, Check, 
  Users, TrendingUp, Eye, EyeOff, Loader2, Timer, Tv
} from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

interface RotatingCode {
  code: string;
  valid_until: string;
  seconds_remaining: number;
  use_count?: number;
}

interface FixedCode {
  id: string;
  code: string;
  valid_from: string;
  valid_to: string;
  max_uses: number | null;
  use_count: number;
  is_active: boolean;
  description: string | null;
  created_at: string;
}

interface CodeUsage {
  id: string;
  user_email: string;
  used_at: string;
  result: string;
  code_type: string;
  promo_code?: { code: string; code_type: string };
}

export function AdminPromoCodeManager() {
  const { toast } = useToast();
  const [currentCode, setCurrentCode] = useState<RotatingCode | null>(null);
  const [fixedCodes, setFixedCodes] = useState<FixedCode[]>([]);
  const [usages, setUsages] = useState<CodeUsage[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [copied, setCopied] = useState(false);
  const [showCode, setShowCode] = useState(true);
  
  // Dialog states
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [newCode, setNewCode] = useState({
    code: '',
    valid_from: '',
    valid_to: '',
    max_uses: '',
    description: ''
  });

  const loadCurrentCode = useCallback(async () => {
    try {
      const { data, error } = await supabase.functions.invoke('promo-code-manager', {
        body: { action: 'get-current' }
      });

      if (error) throw error;
      setCurrentCode(data);
    } catch (error: any) {
      console.error('Error loading current code:', error);
    }
  }, []);

  const loadFixedCodes = async () => {
    try {
      const { data, error } = await supabase.functions.invoke('promo-code-manager', {
        body: { action: 'list-fixed' }
      });

      if (error) throw error;
      setFixedCodes(data.codes || []);
    } catch (error: any) {
      console.error('Error loading fixed codes:', error);
    }
  };

  const loadUsages = async () => {
    try {
      const { data, error } = await supabase.functions.invoke('promo-code-manager', {
        body: { action: 'list-usages', limit: 100 }
      });

      if (error) throw error;
      setUsages(data.usages || []);
    } catch (error: any) {
      console.error('Error loading usages:', error);
    }
  };

  const rotateCode = async () => {
    setIsLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke('promo-code-manager', {
        body: { action: 'rotate' }
      });

      if (error) throw error;

      toast({ title: 'Erfolg', description: 'Neuer Code wurde generiert' });
      loadCurrentCode();
    } catch (error: any) {
      toast({ variant: 'destructive', title: 'Fehler', description: error.message });
    } finally {
      setIsLoading(false);
    }
  };

  const createFixedCode = async () => {
    if (!newCode.valid_to) {
      toast({ variant: 'destructive', title: 'Fehler', description: 'Ablaufdatum erforderlich' });
      return;
    }

    setIsLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke('promo-code-manager', {
        body: {
          action: 'create-fixed',
          code: newCode.code || undefined,
          valid_from: newCode.valid_from || new Date().toISOString(),
          valid_to: new Date(newCode.valid_to).toISOString(),
          max_uses: newCode.max_uses ? parseInt(newCode.max_uses) : null,
          description: newCode.description || null
        }
      });

      if (error) throw error;

      toast({ title: 'Erfolg', description: `Code "${data.code?.code || newCode.code}" erstellt` });
      setShowCreateDialog(false);
      setNewCode({ code: '', valid_from: '', valid_to: '', max_uses: '', description: '' });
      loadFixedCodes();
    } catch (error: any) {
      toast({ variant: 'destructive', title: 'Fehler', description: error.message });
    } finally {
      setIsLoading(false);
    }
  };

  const deleteCode = async (codeId: string) => {
    if (!confirm('Möchten Sie diesen Code wirklich löschen?')) return;

    try {
      const { error } = await supabase.functions.invoke('promo-code-manager', {
        body: { action: 'delete', code_id: codeId }
      });

      if (error) throw error;

      toast({ title: 'Erfolg', description: 'Code gelöscht' });
      loadFixedCodes();
    } catch (error: any) {
      toast({ variant: 'destructive', title: 'Fehler', description: error.message });
    }
  };

  const toggleCodeActive = async (codeId: string) => {
    try {
      const { error } = await supabase.functions.invoke('promo-code-manager', {
        body: { action: 'deactivate', code_id: codeId }
      });

      if (error) throw error;

      toast({ title: 'Erfolg', description: 'Code deaktiviert' });
      loadFixedCodes();
    } catch (error: any) {
      toast({ variant: 'destructive', title: 'Fehler', description: error.message });
    }
  };

  const copyCode = () => {
    if (currentCode?.code) {
      navigator.clipboard.writeText(currentCode.code);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const openDisplayMode = () => {
    window.open('/promo-display', '_blank', 'width=800,height=600');
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleString('de-DE', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  const formatTimeRemaining = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  useEffect(() => {
    loadCurrentCode();
    loadFixedCodes();
    loadUsages();

    // Countdown Timer
    const interval = setInterval(() => {
      setCurrentCode(prev => {
        if (prev && prev.seconds_remaining > 0) {
          return { ...prev, seconds_remaining: prev.seconds_remaining - 1 };
        } else if (prev && prev.seconds_remaining <= 0) {
          // Code abgelaufen - neuen laden
          loadCurrentCode();
        }
        return prev;
      });
    }, 1000);

    return () => clearInterval(interval);
  }, [loadCurrentCode]);

  return (
    <div className="space-y-6">
      {/* Aktueller rotierender Code */}
      <Card className="border-primary/30">
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                <Key className="h-5 w-5 text-primary" />
                Aktueller Registrierungscode
              </CardTitle>
              <CardDescription>Rotiert automatisch alle 10 Minuten</CardDescription>
            </div>
            <div className="flex items-center gap-2">
              <Button variant="outline" size="sm" onClick={openDisplayMode}>
                <Tv className="h-4 w-4 mr-2" />
                Display-Modus
              </Button>
              <Button 
                variant="outline" 
                size="sm" 
                onClick={rotateCode}
                disabled={isLoading}
              >
                {isLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4 mr-2" />}
                Jetzt rotieren
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {currentCode ? (
            <div className="flex items-center justify-between p-6 bg-muted rounded-lg">
              <div className="flex items-center gap-4">
                <div 
                  className="text-4xl font-mono font-bold tracking-wider cursor-pointer"
                  onClick={() => setShowCode(!showCode)}
                >
                  {showCode ? currentCode.code : '••••••••••'}
                </div>
                <Button variant="ghost" size="icon" onClick={() => setShowCode(!showCode)}>
                  {showCode ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
                </Button>
                <Button variant="ghost" size="icon" onClick={copyCode}>
                  {copied ? <Check className="h-5 w-5 text-green-500" /> : <Copy className="h-5 w-5" />}
                </Button>
              </div>
              <div className="text-right">
                <div className="flex items-center gap-2 text-2xl font-mono">
                  <Timer className="h-6 w-6 text-primary" />
                  <span className={currentCode.seconds_remaining < 60 ? 'text-red-500' : ''}>
                    {formatTimeRemaining(currentCode.seconds_remaining)}
                  </span>
                </div>
                <p className="text-sm text-muted-foreground mt-1">
                  {currentCode.use_count || 0} Nutzungen
                </p>
              </div>
            </div>
          ) : (
            <div className="flex items-center justify-center p-6">
              <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            </div>
          )}
        </CardContent>
      </Card>

      {/* Tabs für fixierte Codes und Nutzung */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Clock className="h-5 w-5" />
            Promo-Code Verwaltung
          </CardTitle>
        </CardHeader>
        <CardContent>
          <Tabs defaultValue="fixed">
            <TabsList className="mb-4">
              <TabsTrigger value="fixed">Fixierte Codes</TabsTrigger>
              <TabsTrigger value="usage">Nutzungshistorie</TabsTrigger>
            </TabsList>

            <TabsContent value="fixed">
              <div className="flex justify-end mb-4">
                <Button onClick={() => setShowCreateDialog(true)}>
                  <Plus className="h-4 w-4 mr-2" />
                  Neuen Code erstellen
                </Button>
              </div>

              <div className="rounded-md border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Code</TableHead>
                      <TableHead>Gültig von</TableHead>
                      <TableHead>Gültig bis</TableHead>
                      <TableHead>Limit</TableHead>
                      <TableHead>Nutzungen</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead className="text-right">Aktionen</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {fixedCodes.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={7} className="text-center py-8 text-muted-foreground">
                          Keine fixierten Codes vorhanden
                        </TableCell>
                      </TableRow>
                    ) : (
                      fixedCodes.map((code) => (
                        <TableRow key={code.id}>
                          <TableCell className="font-mono font-bold">{code.code}</TableCell>
                          <TableCell className="text-sm">{formatDate(code.valid_from)}</TableCell>
                          <TableCell className="text-sm">{formatDate(code.valid_to)}</TableCell>
                          <TableCell>{code.max_uses || '∞'}</TableCell>
                          <TableCell>{code.use_count}</TableCell>
                          <TableCell>
                            <Badge variant={code.is_active ? 'default' : 'secondary'}>
                              {code.is_active ? 'Aktiv' : 'Inaktiv'}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-right">
                            <div className="flex justify-end gap-1">
                              {code.is_active && (
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  onClick={() => toggleCodeActive(code.id)}
                                  title="Deaktivieren"
                                >
                                  <EyeOff className="h-4 w-4" />
                                </Button>
                              )}
                              <Button
                                size="sm"
                                variant="ghost"
                                onClick={() => deleteCode(code.id)}
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
            </TabsContent>

            <TabsContent value="usage">
              <div className="rounded-md border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>E-Mail</TableHead>
                      <TableHead>Code</TableHead>
                      <TableHead>Typ</TableHead>
                      <TableHead>Zeitpunkt</TableHead>
                      <TableHead>Ergebnis</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {usages.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={5} className="text-center py-8 text-muted-foreground">
                          Keine Nutzungsdaten vorhanden
                        </TableCell>
                      </TableRow>
                    ) : (
                      usages.map((usage) => (
                        <TableRow key={usage.id}>
                          <TableCell className="font-medium">{usage.user_email}</TableCell>
                          <TableCell className="font-mono text-sm">
                            {usage.promo_code?.code || '-'}
                          </TableCell>
                          <TableCell>
                            <Badge variant="outline">
                              {usage.code_type === 'rotating' ? 'Rotierend' : 'Fixiert'}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-sm">{formatDate(usage.used_at)}</TableCell>
                          <TableCell>
                            <Badge variant={usage.result === 'success' ? 'default' : 'destructive'}>
                              {usage.result === 'success' ? 'Erfolg' : 'Fehlgeschlagen'}
                            </Badge>
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

      {/* Create Fixed Code Dialog */}
      <Dialog open={showCreateDialog} onOpenChange={setShowCreateDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Neuen fixierten Code erstellen</DialogTitle>
            <DialogDescription>
              Erstellen Sie einen Code mit festem Zeitfenster und optionalem Nutzungslimit
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="space-y-2">
              <Label>Code (optional - wird automatisch generiert)</Label>
              <Input
                value={newCode.code}
                onChange={(e) => setNewCode(prev => ({ ...prev, code: e.target.value.toUpperCase() }))}
                placeholder="z.B. ANDI123"
                className="font-mono"
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Gültig ab</Label>
                <Input
                  type="datetime-local"
                  value={newCode.valid_from}
                  onChange={(e) => setNewCode(prev => ({ ...prev, valid_from: e.target.value }))}
                />
              </div>
              <div className="space-y-2">
                <Label>Gültig bis *</Label>
                <Input
                  type="datetime-local"
                  value={newCode.valid_to}
                  onChange={(e) => setNewCode(prev => ({ ...prev, valid_to: e.target.value }))}
                  required
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label>Maximale Nutzungen (leer = unbegrenzt)</Label>
              <Input
                type="number"
                value={newCode.max_uses}
                onChange={(e) => setNewCode(prev => ({ ...prev, max_uses: e.target.value }))}
                placeholder="z.B. 50"
              />
            </div>
            <div className="space-y-2">
              <Label>Beschreibung</Label>
              <Input
                value={newCode.description}
                onChange={(e) => setNewCode(prev => ({ ...prev, description: e.target.value }))}
                placeholder="z.B. Marketing-Aktion Februar"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowCreateDialog(false)}>
              Abbrechen
            </Button>
            <Button onClick={createFixedCode} disabled={isLoading}>
              {isLoading ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Plus className="h-4 w-4 mr-2" />}
              Erstellen
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
