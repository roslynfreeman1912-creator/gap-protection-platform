import { useState } from 'react';
import { useLanguage } from '@/contexts/LanguageContext';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useToast } from '@/hooks/use-toast';
import { 
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Award, Copy, Share2, Trash2, Loader2, Plus } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';

interface PromotionCode {
  id: string;
  code: string;
  usage_count: number;
  max_uses: number | null;
  is_active: boolean;
}

interface PromotionCodeCardProps {
  promotionCodes: PromotionCode[];
  onCodeDeleted?: () => void;
  onCodeCreated?: () => void;
}

export function PromotionCodeCard({ promotionCodes, onCodeDeleted, onCodeCreated }: PromotionCodeCardProps) {
  const { t } = useLanguage();
  const { toast } = useToast();
  const [copied, setCopied] = useState(false);
  const [deletingCodeId, setDeletingCodeId] = useState<string | null>(null);
  const [selectedCode, setSelectedCode] = useState<PromotionCode | null>(
    promotionCodes.length > 0 ? promotionCodes[0] : null
  );
  
  // Create code state
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
  const [newCodeInput, setNewCodeInput] = useState('');
  const [maxUses, setMaxUses] = useState('');
  const [isCreating, setIsCreating] = useState(false);

  const registrationLink = selectedCode 
    ? `${window.location.origin}/register?code=${selectedCode.code}`
    : '';

  const copyToClipboard = async (text: string, label: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      toast({
        title: 'Kopiert!',
        description: `${label} wurde in die Zwischenablage kopiert.`,
      });
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      toast({
        variant: 'destructive',
        title: 'Fehler',
        description: 'Konnte nicht kopieren.',
      });
    }
  };

  const shareLink = async () => {
    if (!selectedCode) return;
    
    if (navigator.share) {
      try {
        await navigator.share({
          title: 'GAP Protection - Cyber-Sicherheit',
          text: 'Schützen Sie Ihr Unternehmen mit GAP Protection. Nutzen Sie meinen Promotion-Code:',
          url: registrationLink,
        });
      } catch (err) {
        // User cancelled share
      }
    } else {
      copyToClipboard(registrationLink, 'Link');
    }
  };

  const handleDeleteCode = async (codeId: string) => {
    setDeletingCodeId(codeId);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        toast({
          variant: 'destructive',
          title: 'Fehler',
          description: 'Sie müssen angemeldet sein.',
        });
        return;
      }

      const { data, error } = await supabase.functions.invoke('delete-promotion-code', {
        body: { codeId },
      });

      if (error) throw error;

      toast({
        title: 'Erfolgreich gelöscht',
        description: 'Der Promotion-Code wurde entfernt.',
      });

      // Update selected code if the deleted one was selected
      if (selectedCode?.id === codeId) {
        const remaining = promotionCodes.filter(c => c.id !== codeId);
        setSelectedCode(remaining.length > 0 ? remaining[0] : null);
      }

      onCodeDeleted?.();
    } catch (error: any) {
      console.error('Delete code error:', error);
      toast({
        variant: 'destructive',
        title: 'Fehler',
        description: error.message || 'Code konnte nicht gelöscht werden.',
      });
    } finally {
      setDeletingCodeId(null);
    }
  };

  const handleCreateCode = async () => {
    if (!newCodeInput.trim()) {
      toast({
        variant: 'destructive',
        title: 'Fehler',
        description: 'Bitte geben Sie einen Code ein.',
      });
      return;
    }

    // Format code: ensure GP- prefix
    let formattedCode = newCodeInput.toUpperCase().trim();
    if (!formattedCode.startsWith('GP-')) {
      formattedCode = 'GP-' + formattedCode;
    }

    // Validate format
    if (!/^GP-[A-Z0-9]{3,20}$/.test(formattedCode)) {
      toast({
        variant: 'destructive',
        title: 'Ungültiges Format',
        description: 'Code muss 3-20 Zeichen haben (nur Buchstaben und Zahlen nach GP-).',
      });
      return;
    }

    setIsCreating(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        toast({
          variant: 'destructive',
          title: 'Fehler',
          description: 'Sie müssen angemeldet sein.',
        });
        return;
      }

      const { data, error } = await supabase.functions.invoke('create-promotion-code', {
        body: { 
          code: formattedCode,
          maxUses: maxUses ? parseInt(maxUses) : null,
        },
      });

      if (error) throw error;

      if (data?.error) {
        throw new Error(data.error);
      }

      toast({
        title: 'Code erstellt!',
        description: `Der Promotion-Code ${formattedCode} wurde erfolgreich erstellt.`,
      });

      setNewCodeInput('');
      setMaxUses('');
      setIsCreateDialogOpen(false);
      onCodeCreated?.();
    } catch (error: any) {
      console.error('Create code error:', error);
      toast({
        variant: 'destructive',
        title: 'Fehler',
        description: error.message || 'Code konnte nicht erstellt werden.',
      });
    } finally {
      setIsCreating(false);
    }
  };

  return (
    <Card className="border-2 border-primary/20 bg-gradient-to-br from-primary/5 to-transparent">
      <CardHeader>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 bg-primary/10 rounded-lg flex items-center justify-center">
              <Award className="h-6 w-6 text-primary" />
            </div>
            <div>
              <CardTitle>{t('dashboard.sections.promotionCode')}</CardTitle>
              <CardDescription>
                Teilen Sie diesen Code mit potenziellen Kunden
              </CardDescription>
            </div>
          </div>
          
          {/* Create New Code Button */}
          <Dialog open={isCreateDialogOpen} onOpenChange={setIsCreateDialogOpen}>
            <DialogTrigger asChild>
              <Button variant="outline" size="sm" className="gap-2">
                <Plus className="h-4 w-4" />
                Neuer Code
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Neuen Promotion-Code erstellen</DialogTitle>
                <DialogDescription>
                  Erstellen Sie einen eigenen Code für Ihre Kunden.
                </DialogDescription>
              </DialogHeader>
              
              <div className="space-y-4 py-4">
                <div className="space-y-2">
                  <Label htmlFor="newCode">Code *</Label>
                  <div className="flex items-center gap-2">
                    <span className="text-muted-foreground font-mono">GP-</span>
                    <Input
                      id="newCode"
                      value={newCodeInput.replace(/^GP-/i, '')}
                      onChange={(e) => setNewCodeInput(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ''))}
                      placeholder="MEINCODE"
                      className="font-mono"
                      maxLength={20}
                    />
                  </div>
                  <p className="text-xs text-muted-foreground">
                    3-20 Zeichen, nur Buchstaben und Zahlen
                  </p>
                </div>
                
                <div className="space-y-2">
                  <Label htmlFor="maxUses">Maximale Nutzungen (optional)</Label>
                  <Input
                    id="maxUses"
                    type="number"
                    value={maxUses}
                    onChange={(e) => setMaxUses(e.target.value)}
                    placeholder="Unbegrenzt"
                    min="1"
                  />
                  <p className="text-xs text-muted-foreground">
                    Leer lassen für unbegrenzte Nutzung
                  </p>
                </div>

                {newCodeInput && (
                  <div className="p-3 bg-muted rounded-lg">
                    <p className="text-sm text-muted-foreground">Vorschau:</p>
                    <code className="text-lg font-mono font-bold text-primary">
                      GP-{newCodeInput.replace(/^GP-/i, '').toUpperCase()}
                    </code>
                  </div>
                )}
              </div>
              
              <DialogFooter>
                <Button variant="outline" onClick={() => setIsCreateDialogOpen(false)}>
                  Abbrechen
                </Button>
                <Button onClick={handleCreateCode} disabled={isCreating || !newCodeInput.trim()}>
                  {isCreating ? (
                    <>
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      Erstellen...
                    </>
                  ) : (
                    'Code erstellen'
                  )}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>
      </CardHeader>
      
      <CardContent className="space-y-6">
        {promotionCodes.length === 0 ? (
          <div className="text-center py-8">
            <p className="text-muted-foreground mb-4">
              Sie haben noch keinen Promotion-Code.
            </p>
            <Button onClick={() => setIsCreateDialogOpen(true)} className="gap-2">
              <Plus className="h-4 w-4" />
              Ersten Code erstellen
            </Button>
          </div>
        ) : (
          <>
            {/* Code Selection if multiple codes */}
            {promotionCodes.length > 1 && (
              <div className="space-y-2">
                <p className="text-sm font-medium">Ihre Codes ({promotionCodes.length})</p>
                <div className="flex flex-wrap gap-2">
                  {promotionCodes.map((code) => (
                    <Button
                      key={code.id}
                      variant={selectedCode?.id === code.id ? 'default' : 'outline'}
                      size="sm"
                      onClick={() => setSelectedCode(code)}
                      className="font-mono"
                    >
                      {code.code}
                    </Button>
                  ))}
                </div>
              </div>
            )}

            {/* Selected Code Display */}
            {selectedCode && (
              <>
                <div className="bg-background rounded-xl p-6 border-2 border-dashed border-primary/30 relative">
                  <div className="text-center">
                    <p className="text-xs text-muted-foreground mb-2 uppercase tracking-wide">
                      Ihr persönlicher Code
                    </p>
                    <code className="text-4xl font-mono font-bold text-primary tracking-wider">
                      {selectedCode.code}
                    </code>
                    <p className="text-xs text-muted-foreground mt-3">
                      Verwendet: {selectedCode.usage_count}
                      {selectedCode.max_uses ? ` / ${selectedCode.max_uses}` : ' (unbegrenzt)'}
                    </p>
                  </div>

                  {/* Delete Button */}
                  <AlertDialog>
                    <AlertDialogTrigger asChild>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="absolute top-2 right-2 text-muted-foreground hover:text-destructive"
                        disabled={deletingCodeId === selectedCode.id}
                      >
                        {deletingCodeId === selectedCode.id ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                          <Trash2 className="h-4 w-4" />
                        )}
                      </Button>
                    </AlertDialogTrigger>
                    <AlertDialogContent>
                      <AlertDialogHeader>
                        <AlertDialogTitle>Code löschen?</AlertDialogTitle>
                        <AlertDialogDescription>
                          Möchten Sie den Promotion-Code <strong>{selectedCode.code}</strong> wirklich löschen?
                          Diese Aktion kann nicht rückgängig gemacht werden.
                          {selectedCode.usage_count > 0 && (
                            <span className="block mt-2 text-amber-600">
                              ⚠️ Dieser Code wurde bereits {selectedCode.usage_count}x verwendet.
                            </span>
                          )}
                        </AlertDialogDescription>
                      </AlertDialogHeader>
                      <AlertDialogFooter>
                        <AlertDialogCancel>Abbrechen</AlertDialogCancel>
                        <AlertDialogAction
                          onClick={() => handleDeleteCode(selectedCode.id)}
                          className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                        >
                          Löschen
                        </AlertDialogAction>
                      </AlertDialogFooter>
                    </AlertDialogContent>
                  </AlertDialog>
                </div>

                {/* Action Buttons */}
                <div className="grid grid-cols-2 gap-3">
                  <Button
                    variant="outline"
                    className="w-full"
                    onClick={() => copyToClipboard(selectedCode.code, 'Promotion-Code')}
                  >
                    <Copy className="h-4 w-4 mr-2" />
                    Code kopieren
                  </Button>
                  <Button
                    variant="outline"
                    className="w-full"
                    onClick={shareLink}
                  >
                    <Share2 className="h-4 w-4 mr-2" />
                    Teilen
                  </Button>
                </div>

                {/* Registration Link */}
                <div className="space-y-2">
                  <p className="text-sm font-medium">Registrierungslink</p>
                  <div className="flex gap-2">
                    <Input
                      value={registrationLink}
                      readOnly
                      className="font-mono text-xs"
                    />
                    <Button
                      variant="secondary"
                      size="icon"
                      onClick={() => copyToClipboard(registrationLink, 'Link')}
                    >
                      <Copy className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              </>
            )}
          </>
        )}

        {/* Quick Tips */}
        <div className="bg-muted/50 rounded-lg p-4">
          <p className="text-sm font-medium mb-2">💡 Tipps für mehr Erfolg</p>
          <ul className="text-xs text-muted-foreground space-y-1">
            <li>• Teilen Sie den Link direkt in Gesprächen mit Interessenten</li>
            <li>• Fügen Sie den Code in Ihre E-Mail-Signatur ein</li>
            <li>• Nutzen Sie Social Media für größere Reichweite</li>
          </ul>
        </div>
      </CardContent>
    </Card>
  );
}
