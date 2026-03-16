import { useState, useEffect, useCallback } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { supabase } from '@/integrations/supabase/client';
import {
  FileText, Loader2, CheckCircle, Send, Download, Euro,
  CreditCard, RefreshCw, Zap
} from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

interface CreditNote {
  id: string;
  partner_id: string;
  credit_note_number: string;
  net_amount: number;
  vat_rate: number;
  vat_amount: number;
  gross_amount: number;
  status: string;
  easybill_document_id: string | null;
  easybill_pdf_url: string | null;
  paid_at: string | null;
  created_at: string;
  partner?: { first_name: string; last_name: string; email: string };
}

export function CreditNotesManager() {
  const { toast } = useToast();
  const [creditNotes, setCreditNotes] = useState<CreditNote[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isActionLoading, setIsActionLoading] = useState(false);
  const [statusFilter, setStatusFilter] = useState('all');
  const [partners, setPartners] = useState<any[]>([]);

  const loadCreditNotes = useCallback(async () => {
    setIsLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke('generate-credit-notes', {
        body: { action: 'list' }
      });
      if (error) throw error;
      setCreditNotes(data.creditNotes || []);
    } catch (error: any) {
      toast({ variant: 'destructive', title: 'Fehler', description: error.message });
    } finally {
      setIsLoading(false);
    }
  }, [toast]);

  const loadPartners = useCallback(async () => {
    const { data } = await supabase
      .from('profiles')
      .select('id, first_name, last_name, email')
      .order('last_name');
    setPartners(data || []);
  }, []);

  const generateBatch = async () => {
    setIsActionLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke('generate-credit-notes', {
        body: { action: 'generate-batch' }
      });
      if (error) throw error;
      toast({ title: 'Erfolg', description: `${data.generated} Gutschriften erstellt` });
      loadCreditNotes();
    } catch (error: any) {
      toast({ variant: 'destructive', title: 'Fehler', description: error.message });
    } finally {
      setIsActionLoading(false);
    }
  };

  const generateForPartner = async (partnerId: string) => {
    setIsActionLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke('generate-credit-notes', {
        body: { action: 'generate', partnerId }
      });
      if (error) throw error;
      toast({ title: 'Gutschrift erstellt', description: `Nr. ${data.creditNote.credit_note_number}` });
      loadCreditNotes();
    } catch (error: any) {
      toast({ variant: 'destructive', title: 'Fehler', description: error.message });
    } finally {
      setIsActionLoading(false);
    }
  };

  const approveCreditNote = async (id: string) => {
    setIsActionLoading(true);
    try {
      const { error } = await supabase.functions.invoke('generate-credit-notes', {
        body: { action: 'approve', creditNoteId: id }
      });
      if (error) throw error;
      toast({ title: 'Gutschrift genehmigt' });
      loadCreditNotes();
    } catch (error: any) {
      toast({ variant: 'destructive', title: 'Fehler', description: error.message });
    } finally {
      setIsActionLoading(false);
    }
  };

  const syncToEasybill = async (id: string) => {
    setIsActionLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke('easybill-integration', {
        body: { action: 'sync-credit-note', creditNoteId: id }
      });
      if (error) throw error;
      toast({ title: 'EasyBill-Sync', description: `Dokument #${data.easybillDocumentId} erstellt` });
      loadCreditNotes();
    } catch (error: any) {
      toast({ variant: 'destructive', title: 'EasyBill Fehler', description: error.message });
    } finally {
      setIsActionLoading(false);
    }
  };

  const triggerPayout = async (id: string) => {
    if (!confirm('SEPA-Auszahlung wirklich auslösen?')) return;
    setIsActionLoading(true);
    try {
      const { error } = await supabase.functions.invoke('easybill-integration', {
        body: { action: 'trigger-payout', creditNoteId: id }
      });
      if (error) throw error;
      toast({ title: 'Auszahlung veranlasst' });
      loadCreditNotes();
    } catch (error: any) {
      toast({ variant: 'destructive', title: 'Fehler', description: error.message });
    } finally {
      setIsActionLoading(false);
    }
  };

  const markPaid = async (id: string) => {
    setIsActionLoading(true);
    try {
      const { error } = await supabase.functions.invoke('generate-credit-notes', {
        body: { action: 'mark-paid', creditNoteId: id }
      });
      if (error) throw error;
      toast({ title: 'Als bezahlt markiert' });
      loadCreditNotes();
    } catch (error: any) {
      toast({ variant: 'destructive', title: 'Fehler', description: error.message });
    } finally {
      setIsActionLoading(false);
    }
  };

  useEffect(() => {
    loadCreditNotes();
    loadPartners();
  }, [loadCreditNotes, loadPartners]);

  const fmt = (n: number) => new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR' }).format(n);
  const fmtDate = (d: string) => new Date(d).toLocaleDateString('de-DE');

  const statusBadge = (status: string) => {
    const map: Record<string, { label: string; variant: 'default' | 'secondary' | 'outline' | 'destructive' }> = {
      draft: { label: 'Entwurf', variant: 'outline' },
      approved: { label: 'Genehmigt', variant: 'secondary' },
      synced: { label: 'EasyBill', variant: 'default' },
      paid: { label: 'Bezahlt', variant: 'default' },
    };
    const s = map[status] || { label: status, variant: 'outline' as const };
    return <Badge variant={s.variant}>{s.label}</Badge>;
  };

  const filtered = statusFilter === 'all'
    ? creditNotes
    : creditNotes.filter(cn => cn.status === statusFilter);

  const totals = {
    draft: creditNotes.filter(cn => cn.status === 'draft').reduce((s, cn) => s + cn.gross_amount, 0),
    approved: creditNotes.filter(cn => cn.status === 'approved').reduce((s, cn) => s + cn.gross_amount, 0),
    paid: creditNotes.filter(cn => cn.status === 'paid').reduce((s, cn) => s + cn.gross_amount, 0),
  };

  return (
    <div className="space-y-6">
      {/* Stats */}
      <div className="grid grid-cols-3 gap-4">
        <Card>
          <CardContent className="pt-4">
            <p className="text-xs text-muted-foreground">Entwürfe</p>
            <p className="text-2xl font-bold">{fmt(totals.draft)}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <p className="text-xs text-muted-foreground">Genehmigt</p>
            <p className="text-2xl font-bold">{fmt(totals.approved)}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <p className="text-xs text-muted-foreground">Ausgezahlt</p>
            <p className="text-2xl font-bold text-primary">{fmt(totals.paid)}</p>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                <FileText className="h-5 w-5" />
                Gutschriften verwalten
              </CardTitle>
              <CardDescription>Automatische Gutschriften aus Provisionen erstellen und verwalten</CardDescription>
            </div>
            <div className="flex items-center gap-2">
              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger className="w-[140px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Alle</SelectItem>
                  <SelectItem value="draft">Entwurf</SelectItem>
                  <SelectItem value="approved">Genehmigt</SelectItem>
                  <SelectItem value="synced">EasyBill</SelectItem>
                  <SelectItem value="paid">Bezahlt</SelectItem>
                </SelectContent>
              </Select>
              <Button variant="outline" onClick={loadCreditNotes} disabled={isLoading}>
                <RefreshCw className={`h-4 w-4 mr-2 ${isLoading ? 'animate-spin' : ''}`} />
                Laden
              </Button>
              <Button onClick={generateBatch} disabled={isActionLoading}>
                <Zap className="h-4 w-4 mr-2" />
                Alle generieren
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Nr.</TableHead>
                <TableHead>Partner</TableHead>
                <TableHead className="text-right">Netto</TableHead>
                <TableHead className="text-right">MwSt</TableHead>
                <TableHead className="text-right">Brutto</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>EasyBill</TableHead>
                <TableHead>Datum</TableHead>
                <TableHead className="text-right">Aktionen</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={9} className="text-center py-8 text-muted-foreground">
                    Keine Gutschriften vorhanden
                  </TableCell>
                </TableRow>
              ) : filtered.map(cn => (
                <TableRow key={cn.id}>
                  <TableCell className="font-mono text-sm">{cn.credit_note_number}</TableCell>
                  <TableCell>{cn.partner?.first_name} {cn.partner?.last_name}</TableCell>
                  <TableCell className="text-right">{fmt(cn.net_amount)}</TableCell>
                  <TableCell className="text-right text-muted-foreground">{fmt(cn.vat_amount)}</TableCell>
                  <TableCell className="text-right font-bold">{fmt(cn.gross_amount)}</TableCell>
                  <TableCell>{statusBadge(cn.status)}</TableCell>
                  <TableCell>
                    {cn.easybill_document_id ? (
                      <Badge variant="outline" className="gap-1">
                        <CheckCircle className="h-3 w-3" />
                        #{cn.easybill_document_id}
                      </Badge>
                    ) : (
                      <span className="text-muted-foreground text-sm">—</span>
                    )}
                  </TableCell>
                  <TableCell className="text-sm">{fmtDate(cn.created_at)}</TableCell>
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-1">
                      {cn.status === 'draft' && (
                        <Button size="sm" variant="outline" onClick={() => approveCreditNote(cn.id)} disabled={isActionLoading}>
                          <CheckCircle className="h-3 w-3 mr-1" />
                          Genehmigen
                        </Button>
                      )}
                      {cn.status === 'approved' && !cn.easybill_document_id && (
                        <Button size="sm" variant="outline" onClick={() => syncToEasybill(cn.id)} disabled={isActionLoading}>
                          <Send className="h-3 w-3 mr-1" />
                          → EasyBill
                        </Button>
                      )}
                      {(cn.status === 'synced' || cn.status === 'approved') && (
                        <>
                          {cn.easybill_document_id && (
                            <Button size="sm" variant="outline" onClick={() => triggerPayout(cn.id)} disabled={isActionLoading}>
                              <CreditCard className="h-3 w-3 mr-1" />
                              SEPA
                            </Button>
                          )}
                          <Button size="sm" variant="outline" onClick={() => markPaid(cn.id)} disabled={isActionLoading}>
                            <Euro className="h-3 w-3 mr-1" />
                            Bezahlt
                          </Button>
                        </>
                      )}
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
