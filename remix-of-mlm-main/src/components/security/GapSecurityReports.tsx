import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { securityApi } from '@/lib/securityApi';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { useToast } from '@/hooks/use-toast';
import { Loader2, FileText, BarChart3, Calendar } from 'lucide-react';
import { format } from 'date-fns';
import { de } from 'date-fns/locale';

interface SecurityReport {
  id: string; report_type: string; profile_id: string; domain_id: string | null;
  period_start: string; period_end: string; total_scans: number;
  total_findings: number; critical_count: number; high_count: number; created_at: string;
}

interface Props { domains: { id: string; domain: string }[] }

export function GapSecurityReports({ domains }: Props) {
  const { toast } = useToast();
  const [reports, setReports] = useState<SecurityReport[]>([]);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);

  const fetchReports = async () => {
    setLoading(true);
    const { data } = await supabase.from('security_reports').select('*').order('created_at', { ascending: false });
    setReports((data || []) as unknown as SecurityReport[]);
    setLoading(false);
  };

  useEffect(() => { fetchReports(); }, []);

  const generateReport = async (type: string) => {
    setGenerating(true);
    const now = new Date();
    const periodStart = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const periodEnd = new Date(now.getFullYear(), now.getMonth(), 0);

    const [vulnRes, wafRes] = await Promise.all([
      supabase.from('vulnerability_findings').select('id', { count: 'exact', head: true }),
      supabase.from('waf_rules').select('blocked_count'),
    ]);

    const totalBlocked = (wafRes.data || []).reduce((sum: number, r: any) => sum + (r.blocked_count || 0), 0);
    const { data: { user } } = await supabase.auth.getUser();
    const { data: profile } = await supabase.from('profiles').select('id').eq('user_id', user?.id || '').maybeSingle();

    if (!profile) { toast({ variant: 'destructive', title: 'Profil nicht gefunden' }); setGenerating(false); return; }

    const { error } = await supabase.from('security_reports').insert({
      report_type: type,
      profile_id: profile.id,
      period_start: periodStart.toISOString(),
      period_end: periodEnd.toISOString(),
      total_scans: totalBlocked,
      total_findings: vulnRes.count || 0,
      critical_count: 0,
      high_count: 0,
    });

    if (!error) { toast({ title: '✓ Bericht generiert' }); fetchReports(); }
    setGenerating(false);
  };

  const getDomain = (id: string | null) => domains.find(d => d.id === id)?.domain || 'Alle';

  if (loading) return <div className="flex justify-center py-8"><Loader2 className="h-6 w-6 animate-spin" /></div>;

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2"><BarChart3 className="h-5 w-5 text-primary" /> Sicherheitsberichte</CardTitle>
              <CardDescription>Automatische Sicherheitsberichte generieren</CardDescription>
            </div>
            <div className="flex gap-2">
              <Button variant="outline" onClick={() => generateReport('monthly')} disabled={generating}>
                <Calendar className="h-4 w-4 mr-2" /> Monatsbericht
              </Button>
              <Button onClick={() => generateReport('quarterly')} disabled={generating}>
                {generating ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <FileText className="h-4 w-4 mr-2" />}
                Quartalsbericht
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Typ</TableHead><TableHead>Zeitraum</TableHead><TableHead>Domain</TableHead>
                <TableHead>Scans</TableHead><TableHead>Findings</TableHead><TableHead>Kritisch</TableHead>
                <TableHead>Hoch</TableHead><TableHead>Erstellt</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {reports.length === 0 ? (
                <TableRow><TableCell colSpan={8} className="text-center text-muted-foreground py-8">Keine Berichte</TableCell></TableRow>
              ) : reports.map(r => (
                <TableRow key={r.id}>
                  <TableCell><Badge variant="outline" className="text-xs">{r.report_type}</Badge></TableCell>
                  <TableCell className="text-xs">{format(new Date(r.period_start), 'dd.MM.yy', { locale: de })} — {format(new Date(r.period_end), 'dd.MM.yy', { locale: de })}</TableCell>
                  <TableCell className="text-sm">{getDomain(r.domain_id)}</TableCell>
                  <TableCell className="font-mono">{r.total_scans}</TableCell>
                  <TableCell className="font-mono">{r.total_findings}</TableCell>
                  <TableCell className="font-mono text-red-500">{r.critical_count}</TableCell>
                  <TableCell className="font-mono text-orange-500">{r.high_count}</TableCell>
                  <TableCell className="text-sm">{format(new Date(r.created_at), 'dd.MM.yy HH:mm', { locale: de })}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
