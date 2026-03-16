import { useState, useEffect, useCallback } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { supabase } from '@/integrations/supabase/client';
import { FileText, Loader2, Download, TrendingUp, Users, Euro, RefreshCw } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

interface MonthlyReportCardProps {
  profileId: string;
}

interface ReportData {
  period: string;
  generatedAt: string;
  partner: { id: string; name: string; email: string };
  summary: {
    totalCommission: { gross: number; vat: number; net: number };
    byStatus: { pending: number; approved: number; paid: number };
    byLevel: Record<number, number>;
    transactionCount: number;
  };
  team: {
    newPartners: number;
    teamRevenue: { gross: number; vat: number; net: number };
    teamTransactionCount: number;
  };
  details: {
    commissions: any[];
    newPartners: any[];
  };
}

export function MonthlyReportCard({ profileId }: MonthlyReportCardProps) {
  const { toast } = useToast();
  const [isLoading, setIsLoading] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [selectedMonth, setSelectedMonth] = useState<string>(() => {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  });
  const [report, setReport] = useState<ReportData | null>(null);
  const [showDetails, setShowDetails] = useState(false);

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('de-DE', {
      style: 'currency',
      currency: 'EUR',
    }).format(amount);
  };

  const formatMonth = (month: string) => {
    const [year, m] = month.split('-');
    const date = new Date(parseInt(year), parseInt(m) - 1);
    return date.toLocaleDateString('de-DE', { month: 'long', year: 'numeric' });
  };

  const generateMonths = () => {
    const months: string[] = [];
    const now = new Date();
    for (let i = 0; i < 12; i++) {
      const date = new Date(now.getFullYear(), now.getMonth() - i, 1);
      months.push(`${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`);
    }
    return months;
  };

  const loadReport = useCallback(async (month: string) => {
    setIsLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke('generate-monthly-report', {
        body: { partnerId: profileId, month, action: 'single' }
      });

      if (error) throw error;

      if (data?.report?.top_findings) {
        setReport(data.report.top_findings);
      } else {
        setReport(null);
      }
    } catch (error: any) {
      console.error('Load report error:', error);
    } finally {
      setIsLoading(false);
    }
  }, [profileId]);

  const generateReport = async () => {
    setIsGenerating(true);
    try {
      const { data, error } = await supabase.functions.invoke('generate-monthly-report', {
        body: { partnerId: profileId, month: selectedMonth, action: 'generate' }
      });

      if (error) throw error;

      if (data?.report) {
        setReport(data.report);
        toast({ title: 'Erfolg', description: 'Bericht wurde generiert' });
      }
    } catch (error: any) {
      toast({ variant: 'destructive', title: 'Fehler', description: error.message });
    } finally {
      setIsGenerating(false);
    }
  };

  const downloadPDF = () => {
    if (!report) return;
    
    const period = formatMonth(selectedMonth);
    const partnerName = `${report.partner?.name || 'Partner'}`;
    
    // Build professional HTML for print-to-PDF
    const html = `<!DOCTYPE html>
<html lang="de">
<head>
<meta charset="utf-8">
<title>Monatsbericht ${period} - GAP Protection</title>
<style>
  @page { margin: 20mm 15mm; size: A4; }
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body { font-family: 'Segoe UI', Arial, sans-serif; color: #1a1a2e; font-size: 11pt; line-height: 1.5; }
  .header { background: linear-gradient(135deg, #0a1628, #162447); color: white; padding: 28px 32px; margin: -20mm -15mm 24px -15mm; }
  .header h1 { font-size: 22pt; font-weight: 700; margin-bottom: 2px; letter-spacing: -0.5px; }
  .header .subtitle { font-size: 10pt; color: #7dd3fc; }
  .header .company { font-size: 9pt; color: rgba(255,255,255,0.6); margin-top: 8px; }
  .meta { display: flex; justify-content: space-between; margin-bottom: 24px; padding: 14px 20px; background: #f1f5f9; border-radius: 8px; border-left: 4px solid #0ea5e9; }
  .meta-item { font-size: 9pt; }
  .meta-item strong { display: block; font-size: 10pt; color: #0f172a; }
  .section { margin-bottom: 20px; }
  .section-title { font-size: 13pt; font-weight: 700; color: #0f172a; border-bottom: 2px solid #0ea5e9; padding-bottom: 6px; margin-bottom: 14px; }
  .kpi-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 14px; margin-bottom: 22px; }
  .kpi-card { background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 16px; text-align: center; }
  .kpi-card .label { font-size: 8pt; color: #64748b; text-transform: uppercase; letter-spacing: 0.5px; }
  .kpi-card .value { font-size: 18pt; font-weight: 700; color: #0f172a; margin-top: 4px; }
  .kpi-card .sub { font-size: 8pt; color: #94a3b8; margin-top: 2px; }
  .level-grid { display: grid; grid-template-columns: repeat(5, 1fr); gap: 8px; margin-bottom: 16px; }
  .level-box { background: #f0f9ff; border: 1px solid #bae6fd; border-radius: 6px; padding: 10px; text-align: center; }
  .level-box .level { font-size: 8pt; color: #0284c7; font-weight: 600; }
  .level-box .amount { font-size: 12pt; font-weight: 700; color: #0f172a; }
  .status-row { display: flex; gap: 16px; margin-bottom: 16px; }
  .status-badge { padding: 6px 14px; border-radius: 20px; font-size: 9pt; font-weight: 600; }
  .status-pending { background: #fef3c7; color: #92400e; }
  .status-approved { background: #dbeafe; color: #1e40af; }
  .status-paid { background: #d1fae5; color: #065f46; }
  table { width: 100%; border-collapse: collapse; font-size: 9pt; }
  th { background: #f1f5f9; padding: 8px 10px; text-align: left; font-weight: 600; color: #475569; border-bottom: 2px solid #e2e8f0; }
  td { padding: 7px 10px; border-bottom: 1px solid #f1f5f9; }
  tr:nth-child(even) td { background: #fafafa; }
  .footer { margin-top: 30px; padding-top: 14px; border-top: 1px solid #e2e8f0; font-size: 8pt; color: #94a3b8; text-align: center; }
  .footer strong { color: #64748b; }
  .watermark { position: fixed; bottom: 10mm; right: 15mm; font-size: 7pt; color: #cbd5e1; }
</style>
</head>
<body>
<div class="header">
  <h1>Monatsbericht</h1>
  <div class="subtitle">${period}</div>
  <div class="company">GAP Protection Ltd &middot; Enterprise Partner Management</div>
</div>

<div class="meta">
  <div class="meta-item">
    <strong>${partnerName}</strong>
    ${report.partner?.email || ''}
  </div>
  <div class="meta-item">
    <strong>Berichtszeitraum</strong>
    ${period}
  </div>
  <div class="meta-item">
    <strong>Erstellt am</strong>
    ${new Date(report.generatedAt || Date.now()).toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
  </div>
</div>

<div class="section">
  <div class="section-title">Zusammenfassung</div>
  <div class="kpi-grid">
    <div class="kpi-card">
      <div class="label">Provisionen (Brutto)</div>
      <div class="value">${formatCurrency(report.summary.totalCommission.gross)}</div>
      <div class="sub">Netto: ${formatCurrency(report.summary.totalCommission.net)} &middot; MwSt: ${formatCurrency(report.summary.totalCommission.vat)}</div>
    </div>
    <div class="kpi-card">
      <div class="label">Neue Partner</div>
      <div class="value">${report.team.newPartners}</div>
      <div class="sub">${report.summary.transactionCount} Transaktionen</div>
    </div>
    <div class="kpi-card">
      <div class="label">Team-Umsatz (Brutto)</div>
      <div class="value">${formatCurrency(report.team.teamRevenue.gross)}</div>
      <div class="sub">${report.team.teamTransactionCount} Vertr&auml;ge</div>
    </div>
  </div>
</div>

<div class="section">
  <div class="section-title">Provisionen nach Stufe</div>
  <div class="level-grid">
    ${[1,2,3,4,5].map(level => `
    <div class="level-box">
      <div class="level">Stufe ${level}</div>
      <div class="amount">${formatCurrency(report.summary.byLevel[level] || 0)}</div>
    </div>`).join('')}
  </div>
  <div class="status-row">
    <span class="status-badge status-pending">Ausstehend: ${formatCurrency(report.summary.byStatus.pending)}</span>
    <span class="status-badge status-approved">Genehmigt: ${formatCurrency(report.summary.byStatus.approved)}</span>
    <span class="status-badge status-paid">Ausgezahlt: ${formatCurrency(report.summary.byStatus.paid)}</span>
  </div>
</div>

${report.details.commissions.length > 0 ? `
<div class="section">
  <div class="section-title">Provisionsdetails</div>
  <table>
    <thead><tr><th>Datum</th><th>Kunde</th><th>Stufe</th><th>Betrag</th><th>Status</th></tr></thead>
    <tbody>
    ${report.details.commissions.slice(0, 20).map(c => `
      <tr>
        <td>${new Date(c.date).toLocaleDateString('de-DE')}</td>
        <td>${c.customer?.first_name || ''} ${c.customer?.last_name || ''}</td>
        <td>Stufe ${c.level}</td>
        <td><strong>${formatCurrency(c.amount)}</strong></td>
        <td>${c.status === 'paid' ? 'Ausgezahlt' : c.status === 'approved' ? 'Genehmigt' : 'Ausstehend'}</td>
      </tr>`).join('')}
    </tbody>
  </table>
</div>` : ''}

${report.details.newPartners.length > 0 ? `
<div class="section">
  <div class="section-title">Neue Partner im Team</div>
  <table>
    <thead><tr><th>Name</th><th>E-Mail</th><th>Stufe</th><th>Registriert</th></tr></thead>
    <tbody>
    ${report.details.newPartners.map(p => `
      <tr>
        <td>${p.user?.first_name || ''} ${p.user?.last_name || ''}</td>
        <td>${p.user?.email || ''}</td>
        <td>Stufe ${p.level_number}</td>
        <td>${new Date(p.created_at).toLocaleDateString('de-DE')}</td>
      </tr>`).join('')}
    </tbody>
  </table>
</div>` : ''}

<div class="footer">
  <strong>GAP Protection Ltd</strong> &middot; Enterprise Partner Management System<br>
  Dieser Bericht wurde automatisch generiert. Alle Betr&auml;ge in EUR inkl. 19% MwSt.
</div>
<div class="watermark">Ref: RPT-${selectedMonth}-${report.partner?.id?.substring(0, 8) || 'XXXX'}</div>
</body></html>`;
    
    const printWindow = window.open('', '_blank');
    if (printWindow) {
      printWindow.document.write(html);
      printWindow.document.close();
      setTimeout(() => { printWindow.print(); }, 500);
    }
  };

  useEffect(() => {
    loadReport(selectedMonth);
  }, [selectedMonth, profileId, loadReport]);

  return (
    <>
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                <FileText className="h-5 w-5" />
                Monatsbericht
              </CardTitle>
              <CardDescription>Ihre Provisionen und Team-Statistiken</CardDescription>
            </div>
            <Select value={selectedMonth} onValueChange={setSelectedMonth}>
              <SelectTrigger className="w-[180px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {generateMonths().map(month => (
                  <SelectItem key={month} value={month}>
                    {formatMonth(month)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            </div>
          ) : report ? (
            <div className="space-y-6">
              {/* Summary Cards */}
              <div className="grid grid-cols-3 gap-4">
                <Card className="bg-muted/30">
                  <CardContent className="pt-4">
                    <div className="flex items-center gap-2 mb-2">
                      <Euro className="h-4 w-4 text-primary" />
                      <span className="text-sm text-muted-foreground">Provisionen</span>
                    </div>
                    <p className="text-2xl font-bold">{formatCurrency(report.summary.totalCommission.gross)}</p>
                    <div className="text-xs text-muted-foreground mt-1">
                      <span>Netto: {formatCurrency(report.summary.totalCommission.net)}</span>
                      <span className="ml-2">MwSt: {formatCurrency(report.summary.totalCommission.vat)}</span>
                    </div>
                  </CardContent>
                </Card>
                
                <Card className="bg-muted/30">
                  <CardContent className="pt-4">
                    <div className="flex items-center gap-2 mb-2">
                      <Users className="h-4 w-4 text-blue-500" />
                      <span className="text-sm text-muted-foreground">Neue Partner</span>
                    </div>
                    <p className="text-2xl font-bold">{report.team.newPartners}</p>
                    <p className="text-xs text-muted-foreground mt-1">
                      {report.summary.transactionCount} Transaktionen
                    </p>
                  </CardContent>
                </Card>
                
                <Card className="bg-muted/30">
                  <CardContent className="pt-4">
                    <div className="flex items-center gap-2 mb-2">
                      <TrendingUp className="h-4 w-4 text-green-500" />
                      <span className="text-sm text-muted-foreground">Team-Umsatz</span>
                    </div>
                    <p className="text-2xl font-bold">{formatCurrency(report.team.teamRevenue.gross)}</p>
                    <p className="text-xs text-muted-foreground mt-1">
                      {report.team.teamTransactionCount} Verträge
                    </p>
                  </CardContent>
                </Card>
              </div>

              {/* Level Breakdown */}
              <div>
                <h4 className="text-sm font-medium mb-3">Provisionen nach Stufe</h4>
                <div className="grid grid-cols-5 gap-2">
                  {[1, 2, 3, 4, 5].map(level => (
                    <div key={level} className="p-3 rounded-lg bg-muted/50 text-center">
                      <p className="text-xs text-muted-foreground mb-1">Stufe {level}</p>
                      <p className="font-medium">
                        {formatCurrency(report.summary.byLevel[level] || 0)}
                      </p>
                    </div>
                  ))}
                </div>
              </div>

              {/* Status Breakdown */}
              <div className="flex items-center gap-4">
                <Badge variant="outline" className="text-yellow-600">
                  Ausstehend: {formatCurrency(report.summary.byStatus.pending)}
                </Badge>
                <Badge variant="outline" className="text-blue-600">
                  Genehmigt: {formatCurrency(report.summary.byStatus.approved)}
                </Badge>
                <Badge variant="default" className="bg-green-600">
                  Ausgezahlt: {formatCurrency(report.summary.byStatus.paid)}
                </Badge>
              </div>

              {/* Actions */}
              <div className="flex gap-2">
                <Button variant="outline" onClick={() => setShowDetails(true)}>
                  <Download className="h-4 w-4 mr-2" />
                  Details anzeigen
                </Button>
                <Button variant="outline" onClick={downloadPDF}>
                  <FileText className="h-4 w-4 mr-2" />
                  PDF herunterladen
                </Button>
                <Button onClick={generateReport} disabled={isGenerating}>
                  {isGenerating ? (
                    <Loader2 className="h-4 w-4 animate-spin mr-2" />
                  ) : (
                    <RefreshCw className="h-4 w-4 mr-2" />
                  )}
                  Neu generieren
                </Button>
              </div>
            </div>
          ) : (
            <div className="text-center py-12">
              <FileText className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
              <p className="text-muted-foreground mb-4">
                Kein Bericht für {formatMonth(selectedMonth)} vorhanden.
              </p>
              <Button onClick={generateReport} disabled={isGenerating}>
                {isGenerating ? (
                  <Loader2 className="h-4 w-4 animate-spin mr-2" />
                ) : (
                  <FileText className="h-4 w-4 mr-2" />
                )}
                Bericht generieren
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Details Dialog */}
      <Dialog open={showDetails} onOpenChange={setShowDetails}>
        <DialogContent className="max-w-4xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <div className="flex items-center justify-between">
              <DialogTitle>Bericht Details - {selectedMonth && formatMonth(selectedMonth)}</DialogTitle>
              <Button variant="outline" size="sm" onClick={downloadPDF} className="mr-8">
                <FileText className="h-4 w-4 mr-2" />
                PDF
              </Button>
            </div>
          </DialogHeader>
          {report && (
            <div className="space-y-6">
              <div className="grid grid-cols-2 gap-4">
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm">Gesamtprovision (Brutto)</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <p className="text-3xl font-bold">{formatCurrency(report.summary.totalCommission.gross)}</p>
                  </CardContent>
                </Card>
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm">Team-Umsatz (Brutto)</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <p className="text-3xl font-bold">{formatCurrency(report.team.teamRevenue.gross)}</p>
                  </CardContent>
                </Card>
              </div>

              {report.details.commissions.length > 0 && (
                <div>
                  <h4 className="font-medium mb-3">Letzte Provisionen</h4>
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Datum</TableHead>
                        <TableHead>Kunde</TableHead>
                        <TableHead>Stufe</TableHead>
                        <TableHead>Betrag</TableHead>
                        <TableHead>Status</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {report.details.commissions.slice(0, 10).map((c, i) => (
                        <TableRow key={i}>
                          <TableCell>{new Date(c.date).toLocaleDateString('de-DE')}</TableCell>
                          <TableCell>{c.customer?.first_name} {c.customer?.last_name}</TableCell>
                          <TableCell><Badge variant="outline">Stufe {c.level}</Badge></TableCell>
                          <TableCell className="font-medium">{formatCurrency(c.amount)}</TableCell>
                          <TableCell>
                            <Badge variant={c.status === 'paid' ? 'default' : 'outline'}>
                              {c.status === 'paid' ? 'Ausgezahlt' : c.status === 'approved' ? 'Genehmigt' : 'Ausstehend'}
                            </Badge>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}

              {report.details.newPartners.length > 0 && (
                <div>
                  <h4 className="font-medium mb-3">Neue Partner</h4>
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Name</TableHead>
                        <TableHead>E-Mail</TableHead>
                        <TableHead>Stufe</TableHead>
                        <TableHead>Registriert am</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {report.details.newPartners.map((p, i) => (
                        <TableRow key={i}>
                          <TableCell>{p.user?.first_name} {p.user?.last_name}</TableCell>
                          <TableCell className="text-muted-foreground">{p.user?.email}</TableCell>
                          <TableCell><Badge variant="outline">Stufe {p.level_number}</Badge></TableCell>
                          <TableCell>{new Date(p.created_at).toLocaleDateString('de-DE')}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
