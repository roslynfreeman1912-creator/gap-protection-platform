import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { toast } from 'sonner';
import {
  Shield, Loader2, RefreshCw, CheckCircle2, XCircle, AlertCircle, Clock,
  FileText, Users, Eye, Search, UserCheck, AlertTriangle, Activity
} from 'lucide-react';
import { format } from 'date-fns';

async function callSessionApi(action: string, data: Record<string, unknown> = {}) {
  const { data: result, error } = await supabase.functions.invoke('session-manager', {
    body: { action, ...data },
  });
  if (error) throw new Error(error.message || 'API-Fehler');
  if (result?.error) throw new Error(result.error);
  return result;
}

const kycStatusColor = (s: string) => {
  switch (s) {
    case 'approved': return 'bg-green-500/20 text-green-400 border-green-500/30';
    case 'pending': return 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30';
    case 'rejected': return 'bg-red-500/20 text-red-400 border-red-500/30';
    case 'expired': return 'bg-muted text-muted-foreground';
    default: return 'bg-muted text-muted-foreground';
  }
};

const kycStatusLabel: Record<string, string> = {
  approved: 'Genehmigt', pending: 'Ausstehend', rejected: 'Abgelehnt',
  submitted: 'Eingereicht', expired: 'Abgelaufen',
};

const kycLevelLabel: Record<string, string> = {
  none: 'Keine', basic: 'Basis', enhanced: 'Erweitert', full: 'Vollständig',
};

export function KYCManager() {
  const [verifications, setVerifications] = useState<any[]>([]);
  const [watchlist, setWatchlist] = useState<any[]>([]);
  const [limits, setLimits] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('verifications');
  const [selectedVerification, setSelectedVerification] = useState<any>(null);
  const [reviewNote, setReviewNote] = useState('');
  const [searchTerm, setSearchTerm] = useState('');
  const [filterStatus, setFilterStatus] = useState('all');
  const [actionLoading, setActionLoading] = useState('');

  const fetchData = useCallback(async () => {
    setLoading(true);
    const [kycRes, amlRes, limitsRes] = await Promise.all([
      supabase.from('kyc_verifications').select('*').order('submitted_at', { ascending: false }).limit(200),
      supabase.from('aml_watchlist').select('*').order('created_at', { ascending: false }).limit(100),
      supabase.from('kyc_limits').select('*').order('kyc_level'),
    ]);
    setVerifications(kycRes.data || []);
    setWatchlist(amlRes.data || []);
    setLimits(limitsRes.data || []);
    setLoading(false);
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  const reviewKyc = async (id: string, decision: 'approved' | 'rejected') => {
    setActionLoading(decision);
    try {
      await callSessionApi('review_kyc', {
        verification_id: id,
        decision,
        notes: reviewNote || undefined,
      });
      toast.success(`KYC ${decision === 'approved' ? 'genehmigt' : 'abgelehnt'}`);
      setSelectedVerification(null);
      setReviewNote('');
      fetchData();
    } catch (e: any) { toast.error(e.message); }
    setActionLoading('');
  };

  const checkAml = async (profileId: string) => {
    setActionLoading('aml');
    try {
      const data = await callSessionApi('check_aml', { profile_id: profileId });
      if (data.matches?.length > 0) {
        toast.error(`AML-Treffer: ${data.matches.length} Übereinstimmungen gefunden!`);
      } else {
        toast.success('Keine AML-Treffer');
      }
    } catch (e: any) { toast.error(e.message); }
    setActionLoading('');
  };

  // Stats
  const pendingCount = verifications.filter(v => v.status === 'pending' || v.status === 'submitted').length;
  const approvedCount = verifications.filter(v => v.status === 'approved').length;
  const rejectedCount = verifications.filter(v => v.status === 'rejected').length;
  const activeWatchlist = watchlist.filter(w => w.is_active).length;

  const filteredVerifications = verifications.filter(v => {
    if (filterStatus !== 'all' && v.status !== filterStatus) return false;
    if (searchTerm && !(v.profile_id || '').includes(searchTerm) && !(v.full_name || '').toLowerCase().includes(searchTerm.toLowerCase())) return false;
    return true;
  });

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-8 w-8 animate-spin text-blue-500" />
        <span className="ml-3 text-muted-foreground">KYC-Daten werden geladen...</span>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <UserCheck className="h-7 w-7 text-blue-500" />
            KYC/AML-Verwaltung
          </h1>
          <p className="text-muted-foreground text-sm mt-1">Know-Your-Customer Verifizierung & Anti-Geldwäsche-Prüfung</p>
        </div>
        <Button variant="outline" size="sm" onClick={fetchData}>
          <RefreshCw className="h-4 w-4 mr-1" /> Aktualisieren
        </Button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Card><CardContent className="p-3 flex items-center gap-3">
          <div className="p-2 rounded-lg bg-yellow-500/10"><Clock className="h-4 w-4 text-yellow-500" /></div>
          <div><p className="text-lg font-bold leading-none">{pendingCount}</p><p className="text-[10px] text-muted-foreground">Ausstehend</p></div>
        </CardContent></Card>
        <Card><CardContent className="p-3 flex items-center gap-3">
          <div className="p-2 rounded-lg bg-green-500/10"><CheckCircle2 className="h-4 w-4 text-green-500" /></div>
          <div><p className="text-lg font-bold leading-none">{approvedCount}</p><p className="text-[10px] text-muted-foreground">Genehmigt</p></div>
        </CardContent></Card>
        <Card><CardContent className="p-3 flex items-center gap-3">
          <div className="p-2 rounded-lg bg-red-500/10"><XCircle className="h-4 w-4 text-red-500" /></div>
          <div><p className="text-lg font-bold leading-none">{rejectedCount}</p><p className="text-[10px] text-muted-foreground">Abgelehnt</p></div>
        </CardContent></Card>
        <Card><CardContent className="p-3 flex items-center gap-3">
          <div className="p-2 rounded-lg bg-orange-500/10"><AlertTriangle className="h-4 w-4 text-orange-500" /></div>
          <div><p className="text-lg font-bold leading-none">{activeWatchlist}</p><p className="text-[10px] text-muted-foreground">AML-Watchlist</p></div>
        </CardContent></Card>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="grid w-full grid-cols-4">
          <TabsTrigger value="verifications">Verifizierungen</TabsTrigger>
          <TabsTrigger value="review" disabled={!selectedVerification}>Prüfung</TabsTrigger>
          <TabsTrigger value="watchlist">AML-Watchlist</TabsTrigger>
          <TabsTrigger value="limits">KYC-Limits</TabsTrigger>
        </TabsList>

        {/* VERIFICATIONS */}
        <TabsContent value="verifications" className="mt-4 space-y-3">
          <div className="flex gap-3">
            <Input placeholder="Name oder Profil-ID suchen..." value={searchTerm} onChange={e => setSearchTerm(e.target.value)}
              className="max-w-xs" />
            <Select value={filterStatus} onValueChange={setFilterStatus}>
              <SelectTrigger className="w-[160px]"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Alle</SelectItem>
                <SelectItem value="pending">Ausstehend</SelectItem>
                <SelectItem value="submitted">Eingereicht</SelectItem>
                <SelectItem value="approved">Genehmigt</SelectItem>
                <SelectItem value="rejected">Abgelehnt</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <Card>
            <CardContent className="p-0">
              <ScrollArea className="h-[500px]">
                <div className="divide-y">
                  {filteredVerifications.map(v => (
                    <div key={v.id} className="flex items-center gap-4 p-4 hover:bg-muted/30 cursor-pointer transition-colors"
                      onClick={() => { setSelectedVerification(v); setActiveTab('review'); }}>
                      <Badge variant="outline" className={kycStatusColor(v.status)}>
                        {kycStatusLabel[v.status] || v.status}
                      </Badge>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium truncate">{v.full_name || 'Unbekannt'}</p>
                        <p className="text-xs text-muted-foreground">
                          Level: {kycLevelLabel[v.kyc_level] || v.kyc_level} • {v.document_type || 'N/A'}
                        </p>
                      </div>
                      <div className="text-right">
                        <p className="text-xs text-muted-foreground">
                          {v.submitted_at ? format(new Date(v.submitted_at), 'dd.MM.yy HH:mm') : ''}
                        </p>
                        <p className="text-[10px] text-muted-foreground">{v.nationality || ''}</p>
                      </div>
                    </div>
                  ))}
                  {filteredVerifications.length === 0 && (
                    <div className="text-center py-16">
                      <UserCheck className="h-10 w-10 mx-auto mb-3 text-muted-foreground/30" />
                      <p className="text-muted-foreground">Keine Verifizierungen gefunden</p>
                    </div>
                  )}
                </div>
              </ScrollArea>
            </CardContent>
          </Card>
        </TabsContent>

        {/* REVIEW */}
        <TabsContent value="review" className="mt-4 space-y-4">
          {selectedVerification && (
            <>
              <Card className="border-blue-500/30">
                <CardHeader className="pb-3">
                  <div className="flex items-center justify-between">
                    <CardTitle className="text-lg flex items-center gap-2">
                      <UserCheck className="h-5 w-5 text-blue-500" />
                      KYC-Prüfung
                    </CardTitle>
                    <Badge variant="outline" className={kycStatusColor(selectedVerification.status)}>
                      {kycStatusLabel[selectedVerification.status] || selectedVerification.status}
                    </Badge>
                  </div>
                </CardHeader>
                <CardContent className="space-y-4">
                  {/* Personal Data */}
                  <div className="grid md:grid-cols-2 gap-4">
                    <div className="space-y-3">
                      <h3 className="text-sm font-semibold text-blue-400">Persönliche Daten</h3>
                      <InfoRow label="Name" value={selectedVerification.full_name} />
                      <InfoRow label="Geburtsdatum" value={selectedVerification.date_of_birth ? format(new Date(selectedVerification.date_of_birth), 'dd.MM.yyyy') : '—'} />
                      <InfoRow label="Nationalität" value={selectedVerification.nationality || '—'} />
                      <InfoRow label="Land" value={selectedVerification.country || '—'} />
                      <InfoRow label="Adresse" value={selectedVerification.address || '—'} />
                    </div>
                    <div className="space-y-3">
                      <h3 className="text-sm font-semibold text-blue-400">Dokumentation</h3>
                      <InfoRow label="Dokumenttyp" value={selectedVerification.document_type || '—'} />
                      <InfoRow label="Dokumentnummer" value={selectedVerification.document_number || '—'} />
                      <InfoRow label="KYC-Level" value={kycLevelLabel[selectedVerification.kyc_level] || selectedVerification.kyc_level} />
                      <InfoRow label="Eingereicht" value={selectedVerification.submitted_at ? format(new Date(selectedVerification.submitted_at), 'dd.MM.yy HH:mm') : '—'} />
                      <InfoRow label="Geprüft" value={selectedVerification.reviewed_at ? format(new Date(selectedVerification.reviewed_at), 'dd.MM.yy HH:mm') : 'Noch nicht'} />
                    </div>
                  </div>

                  {/* Existing Notes */}
                  {selectedVerification.reviewer_notes && (
                    <div className="bg-muted/30 rounded-lg p-3">
                      <p className="text-xs font-semibold text-muted-foreground mb-1">Prüfer-Notizen</p>
                      <p className="text-sm">{selectedVerification.reviewer_notes}</p>
                    </div>
                  )}

                  {/* Actions */}
                  {(selectedVerification.status === 'pending' || selectedVerification.status === 'submitted') && (
                    <div className="space-y-3 border-t pt-4">
                      <Textarea placeholder="Notizen zur Prüfung (optional)..." value={reviewNote}
                        onChange={e => setReviewNote(e.target.value)} rows={2} />
                      <div className="flex gap-3">
                        <Button className="flex-1 bg-green-600 hover:bg-green-700 text-white"
                          onClick={() => reviewKyc(selectedVerification.id, 'approved')}
                          disabled={!!actionLoading}>
                          {actionLoading === 'approved' ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <CheckCircle2 className="h-4 w-4 mr-1" />}
                          Genehmigen
                        </Button>
                        <Button className="flex-1 bg-red-600 hover:bg-red-700 text-white"
                          onClick={() => reviewKyc(selectedVerification.id, 'rejected')}
                          disabled={!!actionLoading}>
                          {actionLoading === 'rejected' ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <XCircle className="h-4 w-4 mr-1" />}
                          Ablehnen
                        </Button>
                        <Button variant="outline" className="border-orange-500/30"
                          onClick={() => checkAml(selectedVerification.profile_id)}
                          disabled={actionLoading === 'aml'}>
                          {actionLoading === 'aml' ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <Search className="h-4 w-4 mr-1" />}
                          AML-Check
                        </Button>
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>
            </>
          )}
        </TabsContent>

        {/* AML WATCHLIST */}
        <TabsContent value="watchlist" className="mt-4">
          <Card>
            <CardContent className="p-0">
              <ScrollArea className="h-[500px]">
                <div className="divide-y">
                  {watchlist.map(entry => (
                    <div key={entry.id} className="flex items-center gap-4 p-4 hover:bg-muted/30">
                      <Badge variant={entry.is_active ? 'destructive' : 'secondary'}>
                        {entry.is_active ? 'Aktiv' : 'Inaktiv'}
                      </Badge>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium truncate">{entry.entity_name || 'Unbekannt'}</p>
                        <p className="text-xs text-muted-foreground">
                          Typ: {entry.entity_type || '—'} • Quelle: {entry.source || '—'}
                        </p>
                      </div>
                      <Badge variant="outline" className="bg-red-500/20 text-red-400 text-[10px]">
                        Risiko: {entry.risk_level || '—'}
                      </Badge>
                      <span className="text-xs text-muted-foreground">
                        {entry.created_at ? format(new Date(entry.created_at), 'dd.MM.yy') : ''}
                      </span>
                    </div>
                  ))}
                  {watchlist.length === 0 && (
                    <div className="text-center py-16">
                      <Eye className="h-10 w-10 mx-auto mb-3 text-muted-foreground/30" />
                      <p className="text-muted-foreground">Keine AML-Watchlist-Einträge</p>
                    </div>
                  )}
                </div>
              </ScrollArea>
            </CardContent>
          </Card>
        </TabsContent>

        {/* KYC LIMITS */}
        <TabsContent value="limits" className="mt-4">
          <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-4">
            {limits.map(limit => (
              <Card key={limit.id} className="border-blue-500/20">
                <CardContent className="p-4 space-y-3">
                  <div className="flex items-center justify-between">
                    <Badge variant="outline" className="bg-blue-500/20 text-blue-400">
                      {kycLevelLabel[limit.kyc_level] || limit.kyc_level}
                    </Badge>
                  </div>
                  <div className="space-y-2">
                    <LimitRow label="Tägliches Limit" value={limit.daily_transaction_limit ? `€${limit.daily_transaction_limit.toLocaleString()}` : 'Unbegrenzt'} />
                    <LimitRow label="Monatliches Limit" value={limit.monthly_transaction_limit ? `€${limit.monthly_transaction_limit.toLocaleString()}` : 'Unbegrenzt'} />
                    <LimitRow label="Einzeltransaktion" value={limit.single_transaction_limit ? `€${limit.single_transaction_limit.toLocaleString()}` : 'Unbegrenzt'} />
                    <LimitRow label="Auszahlung max." value={limit.max_withdrawal ? `€${limit.max_withdrawal.toLocaleString()}` : 'Unbegrenzt'} />
                  </div>
                </CardContent>
              </Card>
            ))}
            {limits.length === 0 && (
              <div className="col-span-full text-center py-16">
                <Shield className="h-10 w-10 mx-auto mb-3 text-muted-foreground/30" />
                <p className="text-muted-foreground">Keine KYC-Limits konfiguriert</p>
              </div>
            )}
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-xs text-muted-foreground">{label}</span>
      <span className="text-xs font-medium">{value}</span>
    </div>
  );
}

function LimitRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between text-xs">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-medium">{value}</span>
    </div>
  );
}
