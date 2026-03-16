import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { toast } from 'sonner';
import {
  FileText, Shield, Loader2, RefreshCw, CheckCircle2, AlertTriangle,
  Clock, Download, Activity, Eye, Lock, Zap
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

const dsarStatusColor = (s: string) => {
  switch (s) {
    case 'completed': return 'bg-green-500/20 text-green-400';
    case 'pending': return 'bg-yellow-500/20 text-yellow-400';
    case 'processing': return 'bg-blue-500/20 text-blue-400';
    case 'rejected': return 'bg-red-500/20 text-red-400';
    default: return 'bg-muted text-muted-foreground';
  }
};

const dsarStatusLabel: Record<string, string> = {
  pending: 'Ausstehend', processing: 'In Bearbeitung', completed: 'Abgeschlossen', rejected: 'Abgelehnt',
};

const reportTypeLabel: Record<string, string> = {
  audit_trail: 'Audit-Trail', access_review: 'Zugriffsüberprüfung', risk_assessment: 'Risikobewertung',
};

export function ComplianceDashboard() {
  const [dsarRequests, setDsarRequests] = useState<any[]>([]);
  const [classificationPolicies, setClassificationPolicies] = useState<any[]>([]);
  const [complianceReports, setComplianceReports] = useState<any[]>([]);
  const [auditChainValid, setAuditChainValid] = useState<boolean | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('overview');
  const [actionLoading, setActionLoading] = useState('');
  const [reportType, setReportType] = useState('audit_trail');

  const fetchData = useCallback(async () => {
    setLoading(true);
    const [dsarRes, classRes, reportsRes] = await Promise.all([
      supabase.from('dsar_requests').select('*').order('requested_at', { ascending: false }).limit(100),
      supabase.from('data_classification_policies').select('*').order('table_name'),
      supabase.from('compliance_reports').select('*').order('generated_at', { ascending: false }).limit(50),
    ]);
    setDsarRequests(dsarRes.data || []);
    setClassificationPolicies(classRes.data || []);
    setComplianceReports(reportsRes.data || []);
    setLoading(false);
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  const verifyAuditChain = async () => {
    setActionLoading('verify');
    try {
      const data = await callSessionApi('verify_audit_chain');
      setAuditChainValid(data.valid);
      if (data.valid) {
        toast.success(`Audit-Chain verifiziert — ${data.entries_checked} Einträge geprüft`);
      } else {
        toast.error(`Audit-Chain KOMPROMITTIERT! Bruch bei Eintrag #${data.break_at_sequence}`);
      }
    } catch (e: any) { toast.error(e.message); }
    setActionLoading('');
  };

  const processeDsar = async (requestId: string) => {
    setActionLoading(`dsar-${requestId}`);
    try {
      await callSessionApi('process_dsar', { request_id: requestId });
      toast.success('DSAR verarbeitet');
      fetchData();
    } catch (e: any) { toast.error(e.message); }
    setActionLoading('');
  };

  const generateReport = async () => {
    setActionLoading('report');
    try {
      const data = await callSessionApi('generate_compliance_report', { report_type: reportType });
      toast.success(`Compliance-Bericht generiert`);
      fetchData();
    } catch (e: any) { toast.error(e.message); }
    setActionLoading('');
  };

  // Stats
  const pendingDsar = dsarRequests.filter(d => d.status === 'pending').length;
  const totalPolicies = classificationPolicies.length;
  const piiFields = classificationPolicies.filter(p => p.classification === 'pii' || p.classification === 'sensitive_pii').length;

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-8 w-8 animate-spin text-blue-500" />
        <span className="ml-3 text-muted-foreground">Compliance-Daten werden geladen...</span>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <FileText className="h-7 w-7 text-blue-500" />
            Compliance & Datenschutz
          </h1>
          <p className="text-muted-foreground text-sm mt-1">DSGVO, DSAR, Datenklassifikation & Audit-Chain-Integrität</p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={fetchData}>
            <RefreshCw className="h-4 w-4 mr-1" /> Aktualisieren
          </Button>
          <Button size="sm" onClick={verifyAuditChain} disabled={actionLoading === 'verify'}
            className={`${auditChainValid === true ? 'bg-green-600 hover:bg-green-700' : auditChainValid === false ? 'bg-red-600 hover:bg-red-700' : 'bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700'} text-white`}>
            {actionLoading === 'verify' ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <Shield className="h-4 w-4 mr-1" />}
            Audit-Chain verifizieren
          </Button>
        </div>
      </div>

      {/* Audit Chain Status */}
      {auditChainValid !== null && (
        <Card className={`border ${auditChainValid ? 'border-green-500/40 bg-green-950/20' : 'border-red-500/40 bg-red-950/20'}`}>
          <CardContent className="p-4 flex items-center gap-3">
            {auditChainValid
              ? <><CheckCircle2 className="h-6 w-6 text-green-400" /> <div><p className="text-sm font-medium text-green-400">Audit-Chain Integrität: VERIFIZIERT</p><p className="text-xs text-muted-foreground">Alle Audit-Log-Einträge sind tamper-proof und unveränder verkettet</p></div></>
              : <><AlertTriangle className="h-6 w-6 text-red-400" /> <div><p className="text-sm font-medium text-red-400">Audit-Chain Integrität: KOMPROMITTIERT</p><p className="text-xs text-muted-foreground">Manipulation erkannt! Sofortige forensische Untersuchung erforderlich</p></div></>
            }
          </CardContent>
        </Card>
      )}

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Card><CardContent className="p-3 flex items-center gap-3">
          <div className="p-2 rounded-lg bg-yellow-500/10"><Clock className="h-4 w-4 text-yellow-500" /></div>
          <div><p className="text-lg font-bold leading-none">{pendingDsar}</p><p className="text-[10px] text-muted-foreground">DSAR ausstehend</p></div>
        </CardContent></Card>
        <Card><CardContent className="p-3 flex items-center gap-3">
          <div className="p-2 rounded-lg bg-blue-500/10"><FileText className="h-4 w-4 text-blue-500" /></div>
          <div><p className="text-lg font-bold leading-none">{complianceReports.length}</p><p className="text-[10px] text-muted-foreground">Berichte</p></div>
        </CardContent></Card>
        <Card><CardContent className="p-3 flex items-center gap-3">
          <div className="p-2 rounded-lg bg-purple-500/10"><Eye className="h-4 w-4 text-purple-500" /></div>
          <div><p className="text-lg font-bold leading-none">{piiFields}</p><p className="text-[10px] text-muted-foreground">PII-Felder</p></div>
        </CardContent></Card>
        <Card><CardContent className="p-3 flex items-center gap-3">
          <div className="p-2 rounded-lg bg-green-500/10"><Lock className="h-4 w-4 text-green-500" /></div>
          <div><p className="text-lg font-bold leading-none">{totalPolicies}</p><p className="text-[10px] text-muted-foreground">Klassifizierungen</p></div>
        </CardContent></Card>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="grid w-full grid-cols-4">
          <TabsTrigger value="overview">DSAR-Anfragen</TabsTrigger>
          <TabsTrigger value="classification">Datenklassifikation</TabsTrigger>
          <TabsTrigger value="reports">Compliance-Berichte</TabsTrigger>
          <TabsTrigger value="audit">Audit-Integrität</TabsTrigger>
        </TabsList>

        {/* DSAR REQUESTS */}
        <TabsContent value="overview" className="mt-4">
          <Card>
            <CardContent className="p-0">
              <ScrollArea className="h-[500px]">
                <div className="divide-y">
                  {dsarRequests.map(req => (
                    <div key={req.id} className="flex items-center gap-4 p-4 hover:bg-muted/30 transition-colors">
                      <Badge variant="outline" className={dsarStatusColor(req.status)}>
                        {dsarStatusLabel[req.status] || req.status}
                      </Badge>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium">{req.request_type || 'DSAR'}</p>
                        <p className="text-xs text-muted-foreground">
                          Profil: {(req.profile_id || '').slice(0, 12)}... •
                          {req.requested_at ? format(new Date(req.requested_at), ' dd.MM.yy HH:mm') : ''}
                        </p>
                      </div>
                      {req.status === 'pending' && (
                        <Button size="sm" variant="outline" className="text-xs"
                          onClick={() => processeDsar(req.id)}
                          disabled={actionLoading === `dsar-${req.id}`}>
                          {actionLoading === `dsar-${req.id}` ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : <Zap className="h-3 w-3 mr-1" />}
                          Verarbeiten
                        </Button>
                      )}
                      {req.completed_at && (
                        <span className="text-xs text-muted-foreground">
                          Abgeschlossen: {format(new Date(req.completed_at), 'dd.MM.yy')}
                        </span>
                      )}
                    </div>
                  ))}
                  {dsarRequests.length === 0 && (
                    <div className="text-center py-16">
                      <FileText className="h-10 w-10 mx-auto mb-3 text-muted-foreground/30" />
                      <p className="text-muted-foreground">Keine DSAR-Anfragen</p>
                    </div>
                  )}
                </div>
              </ScrollArea>
            </CardContent>
          </Card>
        </TabsContent>

        {/* DATA CLASSIFICATION */}
        <TabsContent value="classification" className="mt-4">
          <Card>
            <CardContent className="p-0">
              <ScrollArea className="h-[500px]">
                <div className="divide-y">
                  {classificationPolicies.map(policy => (
                    <div key={policy.id} className="flex items-center gap-4 p-4 hover:bg-muted/30">
                      <Badge variant="outline" className={
                        policy.classification === 'sensitive_pii' ? 'bg-red-500/20 text-red-400' :
                        policy.classification === 'pii' ? 'bg-orange-500/20 text-orange-400' :
                        policy.classification === 'financial' ? 'bg-yellow-500/20 text-yellow-400' :
                        policy.classification === 'internal' ? 'bg-blue-500/20 text-blue-400' :
                        'bg-muted text-muted-foreground'
                      }>
                        {policy.classification?.toUpperCase()}
                      </Badge>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium font-mono">{policy.table_name}.{policy.column_name}</p>
                        <p className="text-xs text-muted-foreground">
                          Aufbewahrung: {policy.retention_days ? `${policy.retention_days} Tage` : 'Unbegrenzt'} •
                          Verschlüsselung: {policy.requires_encryption ? 'Ja' : 'Nein'} •
                          Maskierung: {policy.mask_in_logs ? 'Ja' : 'Nein'}
                        </p>
                      </div>
                      <div className="flex items-center gap-1">
                        {policy.requires_encryption && <Lock className="h-3.5 w-3.5 text-green-400" />}
                        {policy.mask_in_logs && <Eye className="h-3.5 w-3.5 text-blue-400" />}
                      </div>
                    </div>
                  ))}
                  {classificationPolicies.length === 0 && (
                    <div className="text-center py-16">
                      <Lock className="h-10 w-10 mx-auto mb-3 text-muted-foreground/30" />
                      <p className="text-muted-foreground">Keine Datenklassifikations-Richtlinien</p>
                    </div>
                  )}
                </div>
              </ScrollArea>
            </CardContent>
          </Card>
        </TabsContent>

        {/* COMPLIANCE REPORTS */}
        <TabsContent value="reports" className="mt-4 space-y-4">
          {/* Generate Report */}
          <Card className="border-blue-500/30">
            <CardContent className="p-4">
              <div className="flex items-center gap-3">
                <Select value={reportType} onValueChange={setReportType}>
                  <SelectTrigger className="w-[200px]"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="audit_trail">Audit-Trail</SelectItem>
                    <SelectItem value="access_review">Zugriffsüberprüfung</SelectItem>
                    <SelectItem value="risk_assessment">Risikobewertung</SelectItem>
                  </SelectContent>
                </Select>
                <Button onClick={generateReport} disabled={actionLoading === 'report'}
                  className="bg-blue-600 hover:bg-blue-700 text-white">
                  {actionLoading === 'report' ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <FileText className="h-4 w-4 mr-1" />}
                  Bericht generieren
                </Button>
              </div>
            </CardContent>
          </Card>

          {/* Report List */}
          <Card>
            <CardContent className="p-0">
              <ScrollArea className="h-[450px]">
                <div className="divide-y">
                  {complianceReports.map(report => (
                    <div key={report.id} className="flex items-center gap-4 p-4 hover:bg-muted/30">
                      <FileText className="h-5 w-5 text-blue-400 shrink-0" />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium">
                          {reportTypeLabel[report.report_type] || report.report_type}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {report.generated_at ? format(new Date(report.generated_at), 'dd.MM.yy HH:mm') : ''} •
                          {report.generated_by ? ` Von: ${(report.generated_by).slice(0, 8)}...` : ''}
                        </p>
                      </div>
                      <Badge variant="outline" className={
                        report.status === 'completed' ? 'bg-green-500/20 text-green-400' :
                        report.status === 'generating' ? 'bg-blue-500/20 text-blue-400' :
                        'bg-muted text-muted-foreground'
                      }>
                        {report.status === 'completed' ? 'Fertig' : report.status === 'generating' ? 'Generiert...' : report.status}
                      </Badge>
                      {report.report_data && (
                        <Button size="sm" variant="outline" className="text-xs"
                          onClick={() => {
                            const blob = new Blob([JSON.stringify(report.report_data, null, 2)], { type: 'application/json' });
                            const url = URL.createObjectURL(blob);
                            const a = document.createElement('a');
                            a.href = url;
                            a.download = `compliance-report-${report.report_type}-${format(new Date(), 'yyyyMMdd')}.json`;
                            a.click();
                            URL.revokeObjectURL(url);
                          }}>
                          <Download className="h-3 w-3 mr-1" /> Export
                        </Button>
                      )}
                    </div>
                  ))}
                  {complianceReports.length === 0 && (
                    <div className="text-center py-16">
                      <FileText className="h-10 w-10 mx-auto mb-3 text-muted-foreground/30" />
                      <p className="text-muted-foreground">Keine Compliance-Berichte</p>
                    </div>
                  )}
                </div>
              </ScrollArea>
            </CardContent>
          </Card>
        </TabsContent>

        {/* AUDIT INTEGRITY */}
        <TabsContent value="audit" className="mt-4 space-y-4">
          <Card className="border-green-500/30">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm flex items-center gap-2">
                <Shield className="h-4 w-4 text-green-500" /> Hash-Chain Audit-Log
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <p className="text-sm text-muted-foreground">
                Jeder Audit-Log-Eintrag wird mit SHA-256 verkettet. Der Hash jedes Eintrags beinhaltet den Hash des vorherigen Eintrags,
                wodurch eine tamper-proof Kette entsteht. Jede Manipulation wird bei der Verifizierung erkannt.
              </p>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <h4 className="text-xs font-semibold text-green-400">Wie es funktioniert</h4>
                  <div className="space-y-1">
                    <p className="text-xs text-muted-foreground">1. Neuer Audit-Eintrag wird erstellt</p>
                    <p className="text-xs text-muted-foreground">2. SHA-256 Hash wird berechnet aus: Sequenz + vorheriger Hash + Tabelle + Aktion + Benutzer + Daten</p>
                    <p className="text-xs text-muted-foreground">3. Hash wird mit vorherigem Eintrag verkettet</p>
                    <p className="text-xs text-muted-foreground">4. Verifizierung prüft die gesamte Kette</p>
                  </div>
                </div>
                <div className="space-y-2">
                  <h4 className="text-xs font-semibold text-green-400">Sicherheitsgarantien</h4>
                  <div className="space-y-1">
                    <div className="flex items-center gap-2 text-xs">
                      <CheckCircle2 className="h-3 w-3 text-green-400" /> Manipulationserkennung
                    </div>
                    <div className="flex items-center gap-2 text-xs">
                      <CheckCircle2 className="h-3 w-3 text-green-400" /> Lücken-Erkennung (fehlende Einträge)
                    </div>
                    <div className="flex items-center gap-2 text-xs">
                      <CheckCircle2 className="h-3 w-3 text-green-400" /> Reihenfolge-Verifizierung
                    </div>
                    <div className="flex items-center gap-2 text-xs">
                      <CheckCircle2 className="h-3 w-3 text-green-400" /> Kryptographische Integrität
                    </div>
                  </div>
                </div>
              </div>
              <Button onClick={verifyAuditChain} disabled={actionLoading === 'verify'}
                className="bg-green-600 hover:bg-green-700 text-white">
                {actionLoading === 'verify' ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <Shield className="h-4 w-4 mr-1" />}
                Jetzt verifizieren
              </Button>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
