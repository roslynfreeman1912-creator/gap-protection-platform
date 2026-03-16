import { useState, useEffect, useCallback } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { supabase } from '@/integrations/supabase/client';
import { 
  Shield, Search, Download, Eye, TrendingUp, 
  CheckCircle, XCircle, Loader2, FileText, Calendar
} from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

interface Scan {
  id: string;
  target_url: string;
  requested_at: string;
  completed_at: string | null;
  status: string;
  rating: 'green' | 'red' | null;
  score: number | null;
  summary: any;
  findings: any;
}

interface Stats {
  total: number;
  green: number;
  red: number;
  this_month: number;
}

interface MonthlyReport {
  id: string;
  report_month: string;
  generated_at: string;
  total_scans: number;
  green_count: number;
  red_count: number;
  status: string;
}

export function CustomerScanHistory() {
  const { toast } = useToast();
  const [scans, setScans] = useState<Scan[]>([]);
  const [stats, setStats] = useState<Stats | null>(null);
  const [reports, setReports] = useState<MonthlyReport[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [searchUrl, setSearchUrl] = useState('');
  const [ratingFilter, setRatingFilter] = useState<string>('');
  const [selectedScan, setSelectedScan] = useState<Scan | null>(null);
  const [newScanUrl, setNewScanUrl] = useState('');
  const [isScanning, setIsScanning] = useState(false);

  const loadScans = useCallback(async () => {
    setIsLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke('customer-scans', {
        body: { 
          action: 'get-history',
          limit: 50,
          rating_filter: ratingFilter || undefined
        }
      });

      if (error) throw error;
      setScans(data.scans || []);
    } catch (error: any) {
      toast({ variant: 'destructive', title: 'Fehler', description: error.message });
    } finally {
      setIsLoading(false);
    }
  }, [ratingFilter, toast]);

  const loadStats = useCallback(async () => {
    try {
      const { data, error } = await supabase.functions.invoke('customer-scans', {
        body: { action: 'get-stats' }
      });

      if (error) throw error;
      setStats(data.stats);
    } catch (error: any) {
      console.error('Stats error:', error);
    }
  }, []);

  const loadReports = useCallback(async () => {
    try {
      const { data, error } = await supabase.functions.invoke('customer-scans', {
        body: { action: 'list-reports' }
      });

      if (error) throw error;
      setReports(data.reports || []);
    } catch (error: any) {
      console.error('Reports error:', error);
    }
  }, []);

  const startScan = async () => {
    if (!newScanUrl) {
      toast({ variant: 'destructive', title: 'Fehler', description: 'Bitte URL eingeben' });
      return;
    }

    setIsScanning(true);
    try {
      const { data, error } = await supabase.functions.invoke('customer-scans', {
        body: { action: 'start-scan', target_url: newScanUrl }
      });

      if (error) throw error;

      toast({
        title: data.rating === 'green' ? '✓ Sicher' : '⚠ Probleme gefunden',
        description: data.rating === 'green' 
          ? 'Keine kritischen Probleme gefunden'
          : 'Es wurden Sicherheitsprobleme erkannt',
        variant: data.rating === 'green' ? 'default' : 'destructive'
      });

      setNewScanUrl('');
      loadScans();
      loadStats();
    } catch (error: any) {
      toast({ variant: 'destructive', title: 'Fehler', description: error.message });
    } finally {
      setIsScanning(false);
    }
  };

  const viewScanDetails = async (scanId: string) => {
    try {
      const { data, error } = await supabase.functions.invoke('customer-scans', {
        body: { action: 'get-scan', scan_id: scanId }
      });

      if (error) throw error;
      setSelectedScan(data.scan);
    } catch (error: any) {
      toast({ variant: 'destructive', title: 'Fehler', description: error.message });
    }
  };

  const downloadReport = async (month: string) => {
    try {
      const { data, error } = await supabase.functions.invoke('customer-scans', {
        body: { action: 'get-monthly-report', month }
      });

      if (error) throw error;

      const report = data.report;
      
      // Generate professional HTML report for PDF printing
      const htmlContent = `
<!DOCTYPE html>
<html lang="de">
<head>
  <meta charset="UTF-8">
  <title>Sicherheitsbericht ${month}</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: 'Segoe UI', Tahoma, sans-serif; color: #1a1a2e; background: #fff; padding: 40px; }
    .header { text-align: center; border-bottom: 3px solid #0f172a; padding-bottom: 25px; margin-bottom: 30px; }
    .header h1 { color: #0f172a; font-size: 28px; margin-bottom: 5px; }
    .header h2 { color: #3b82f6; font-size: 16px; font-weight: normal; }
    .header .meta { color: #64748b; font-size: 12px; margin-top: 10px; }
    .stats { display: grid; grid-template-columns: repeat(4, 1fr); gap: 15px; margin: 25px 0; }
    .stat { text-align: center; padding: 20px; border-radius: 8px; border: 2px solid #e2e8f0; }
    .stat.total { background: #f0f9ff; border-color: #3b82f6; }
    .stat.green { background: #f0fdf4; border-color: #16a34a; }
    .stat.red { background: #fef2f2; border-color: #dc2626; }
    .stat.month { background: #fefce8; border-color: #ca8a04; }
    .stat-num { font-size: 32px; font-weight: bold; }
    .stat-label { font-size: 11px; color: #64748b; text-transform: uppercase; }
    .section { margin: 25px 0; }
    .section h3 { color: #0f172a; font-size: 16px; border-bottom: 2px solid #3b82f6; padding-bottom: 8px; margin-bottom: 15px; }
    .finding { background: #f8fafc; padding: 12px; margin: 8px 0; border-radius: 6px; border-left: 4px solid #64748b; }
    .finding.critical { border-left-color: #dc2626; background: #fef2f2; }
    .finding.high { border-left-color: #ea580c; background: #fff7ed; }
    .finding.medium { border-left-color: #ca8a04; background: #fefce8; }
    .finding.low { border-left-color: #16a34a; background: #f0fdf4; }
    .finding-title { font-weight: bold; font-size: 13px; }
    .finding-desc { font-size: 12px; color: #475569; margin-top: 4px; }
    .footer { text-align: center; margin-top: 40px; padding-top: 20px; border-top: 1px solid #e2e8f0; color: #94a3b8; font-size: 11px; }
    @media print { body { padding: 20px; } }
  </style>
</head>
<body>
  <div class="header">
    <h1>🛡️ GAP Protection - Monatsbericht</h1>
    <h2>${formatMonth(month)}</h2>
    <div class="meta">Erstellt: ${new Date().toLocaleDateString('de-DE')} | Report ID: GAP-${Date.now().toString(36).toUpperCase()}</div>
  </div>
  <div class="stats">
    <div class="stat total"><div class="stat-num">${report.total_scans || 0}</div><div class="stat-label">Gesamte Scans</div></div>
    <div class="stat green"><div class="stat-num" style="color:#16a34a">${report.green_count || 0}</div><div class="stat-label">Sicher (Grün)</div></div>
    <div class="stat red"><div class="stat-num" style="color:#dc2626">${report.red_count || 0}</div><div class="stat-label">Probleme (Rot)</div></div>
    <div class="stat month"><div class="stat-num">${report.top_findings?.length || 0}</div><div class="stat-label">Top Findings</div></div>
  </div>
  ${report.top_findings && report.top_findings.length > 0 ? `
  <div class="section">
    <h3>⚠️ Top Findings</h3>
    ${report.top_findings.map((f: any) => `
      <div class="finding ${f.severity || ''}">
        <div class="finding-title">[${(f.severity || 'info').toUpperCase()}] ${f.title || 'Finding'}</div>
        <div class="finding-desc">${f.description || ''}</div>
        ${f.recommendation ? `<div class="finding-desc" style="color:#16a34a;margin-top:6px">✓ ${f.recommendation}</div>` : ''}
      </div>
    `).join('')}
  </div>` : '<div class="section"><h3>✅ Keine Schwachstellen gefunden</h3><p style="color:#16a34a">Alle Scans haben keine kritischen Probleme ergeben.</p></div>'}
  <div class="section">
    <h3>📋 Empfehlungen</h3>
    <ul style="padding-left:20px;color:#334155;font-size:13px;line-height:1.8">
      ${report.red_count > 0 ? '<li><strong>Dringend:</strong> Beheben Sie alle rot markierten Probleme.</li>' : ''}
      <li>Führen Sie regelmäßige Sicherheitsscans durch.</li>
      <li>Halten Sie alle Software und Abhängigkeiten aktuell.</li>
      <li>Überwachen Sie Security Headers und SSL-Zertifikate.</li>
    </ul>
  </div>
  <div class="footer">
    <p>GAP Protection Ltd. | gap-protection.pro | Vertraulicher Sicherheitsbericht</p>
    <p>© ${new Date().getFullYear()} GAP Protection - Alle Rechte vorbehalten</p>
  </div>
</body>
</html>`;

      // Open in new window for printing as PDF
      const printWindow = window.open('', '_blank');
      if (printWindow) {
        printWindow.document.write(htmlContent);
        printWindow.document.close();
        setTimeout(() => printWindow.print(), 500);
      }

      toast({ title: 'Erfolg', description: 'Report wurde generiert - drucken Sie als PDF' });
    } catch (error: any) {
      toast({ variant: 'destructive', title: 'Fehler', description: error.message });
    }
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

  const formatMonth = (monthString: string) => {
    const [year, month] = monthString.split('-');
    const date = new Date(parseInt(year), parseInt(month) - 1);
    return date.toLocaleDateString('de-DE', { month: 'long', year: 'numeric' });
  };

  useEffect(() => {
    loadScans();
    loadStats();
    loadReports();
  }, [ratingFilter, loadScans, loadStats, loadReports]);

  const filteredScans = scans.filter(scan => 
    !searchUrl || scan.target_url.toLowerCase().includes(searchUrl.toLowerCase())
  );

  return (
    <div className="space-y-6">
      {/* Stats */}
      {stats && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                <Shield className="h-4 w-4" />
                Gesamt Scans
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{stats.total}</div>
            </CardContent>
          </Card>
          <Card className="border-green-500/30">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                <CheckCircle className="h-4 w-4 text-green-500" />
                Sicher (Grün)
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-green-500">{stats.green}</div>
            </CardContent>
          </Card>
          <Card className="border-red-500/30">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                <XCircle className="h-4 w-4 text-red-500" />
                Problematisch (Rot)
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-red-500">{stats.red}</div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                <TrendingUp className="h-4 w-4" />
                Diesen Monat
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-primary">{stats.this_month}</div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Neuer Scan */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Shield className="h-5 w-5" />
            Sicherheitsscan starten
          </CardTitle>
          <CardDescription>Geben Sie eine URL ein, um einen Sicherheitsscan durchzuführen</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex gap-4">
            <Input
              placeholder="https://example.com"
              value={newScanUrl}
              onChange={(e) => setNewScanUrl(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && startScan()}
              className="flex-1"
            />
            <Button onClick={startScan} disabled={isScanning}>
              {isScanning ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Scannt...
                </>
              ) : (
                <>
                  <Shield className="h-4 w-4 mr-2" />
                  Scan starten
                </>
              )}
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Scan History */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle>Scan-Historie</CardTitle>
              <CardDescription>Alle durchgeführten Sicherheitsscans</CardDescription>
            </div>
            <div className="flex items-center gap-4">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="URL suchen..."
                  value={searchUrl}
                  onChange={(e) => setSearchUrl(e.target.value)}
                  className="pl-10 w-[200px]"
                />
              </div>
              <Select value={ratingFilter} onValueChange={setRatingFilter}>
                <SelectTrigger className="w-[150px]">
                  <SelectValue placeholder="Alle Ergebnisse" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Alle</SelectItem>
                  <SelectItem value="green">Nur Grün</SelectItem>
                  <SelectItem value="red">Nur Rot</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div className="rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>URL</TableHead>
                  <TableHead>Datum</TableHead>
                  <TableHead>Ergebnis</TableHead>
                  <TableHead>Score</TableHead>
                  <TableHead className="text-right">Aktionen</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading ? (
                  <TableRow>
                    <TableCell colSpan={5} className="text-center py-8">
                      <Loader2 className="h-8 w-8 animate-spin mx-auto text-muted-foreground" />
                    </TableCell>
                  </TableRow>
                ) : filteredScans.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={5} className="text-center py-8 text-muted-foreground">
                      Keine Scans gefunden
                    </TableCell>
                  </TableRow>
                ) : (
                  filteredScans.map((scan) => (
                    <TableRow key={scan.id}>
                      <TableCell className="font-medium max-w-[300px] truncate">
                        {scan.target_url}
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {formatDate(scan.requested_at)}
                      </TableCell>
                      <TableCell>
                        {scan.rating === 'green' ? (
                          <Badge className="bg-green-500/10 text-green-500 border-green-500/30">
                            <CheckCircle className="h-3 w-3 mr-1" />
                            Sicher
                          </Badge>
                        ) : scan.rating === 'red' ? (
                          <Badge className="bg-red-500/10 text-red-500 border-red-500/30">
                            <XCircle className="h-3 w-3 mr-1" />
                            Probleme
                          </Badge>
                        ) : (
                          <Badge variant="secondary">Ausstehend</Badge>
                        )}
                      </TableCell>
                      <TableCell>
                        <span className={scan.score && scan.score >= 70 ? 'text-green-500' : 'text-red-500'}>
                          {scan.score || '-'}/100
                        </span>
                      </TableCell>
                      <TableCell className="text-right">
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => viewScanDetails(scan.id)}
                        >
                          <Eye className="h-4 w-4 mr-1" />
                          Details
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      {/* Monthly Reports */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <FileText className="h-5 w-5" />
            Monatsberichte
          </CardTitle>
          <CardDescription>Herunterladen Ihrer monatlichen Sicherheitsberichte</CardDescription>
        </CardHeader>
        <CardContent>
          {reports.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <Calendar className="h-12 w-12 mx-auto mb-4 opacity-50" />
              <p>Noch keine Monatsberichte verfügbar</p>
              <p className="text-sm">Berichte werden automatisch am Monatsende generiert</p>
            </div>
          ) : (
            <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
              {reports.map((report) => (
                <Card key={report.id} className="bg-muted/50">
                  <CardContent className="p-4">
                    <div className="flex items-center justify-between mb-2">
                      <h4 className="font-semibold">{formatMonth(report.report_month)}</h4>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => downloadReport(report.report_month)}
                      >
                        <Download className="h-4 w-4" />
                      </Button>
                    </div>
                    <div className="text-sm text-muted-foreground space-y-1">
                      <p>{report.total_scans} Scans durchgeführt</p>
                      <div className="flex gap-4">
                        <span className="text-green-500">{report.green_count} ✓</span>
                        <span className="text-red-500">{report.red_count} ✗</span>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Scan Details Modal */}
      {selectedScan && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <Card className="w-full max-w-2xl max-h-[80vh] overflow-auto">
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle>Scan-Details</CardTitle>
                <Button variant="ghost" size="sm" onClick={() => setSelectedScan(null)}>
                  ✕
                </Button>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <h4 className="font-semibold mb-1">URL</h4>
                <p className="text-muted-foreground">{selectedScan.target_url}</p>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <h4 className="font-semibold mb-1">Ergebnis</h4>
                  {selectedScan.rating === 'green' ? (
                    <Badge className="bg-green-500">Sicher</Badge>
                  ) : (
                    <Badge className="bg-red-500">Probleme erkannt</Badge>
                  )}
                </div>
                <div>
                  <h4 className="font-semibold mb-1">Score</h4>
                  <p className="text-2xl font-bold">{selectedScan.score}/100</p>
                </div>
              </div>
              {selectedScan.summary && (
                <div>
                  <h4 className="font-semibold mb-2">Zusammenfassung</h4>
                  <div className="bg-muted p-4 rounded-lg text-sm">
                    <pre className="whitespace-pre-wrap">
                      {JSON.stringify(selectedScan.summary, null, 2)}
                    </pre>
                  </div>
                </div>
              )}
              {selectedScan.findings && Array.isArray(selectedScan.findings) && selectedScan.findings.length > 0 && (
                <div>
                  <h4 className="font-semibold mb-2">Gefundene Probleme</h4>
                  <div className="space-y-2">
                    {selectedScan.findings.map((finding: any, index: number) => (
                      <div key={index} className="bg-muted p-3 rounded-lg">
                        <div className="flex items-center gap-2 mb-1">
                          <Badge variant={finding.severity === 'critical' ? 'destructive' : 'secondary'}>
                            {finding.severity}
                          </Badge>
                          <span className="font-medium">{finding.title}</span>
                        </div>
                        <p className="text-sm text-muted-foreground">{finding.description}</p>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}
