import { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { FileText, Loader2, RefreshCw, ChevronLeft, ChevronRight, Search, Filter, Download, Eye } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';

interface AuditLogEntry {
  id: string;
  created_at: string;
  action: string;
  table_name: string;
  record_id: string;
  user_id: string | null;
  new_data: Record<string, unknown> | null;
  old_data: Record<string, unknown> | null;
  ip_address?: string;
}

export function AdminAuditLog() {
  const { toast } = useToast();
  const [logs, setLogs] = useState<AuditLogEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(0);
  const [searchTerm, setSearchTerm] = useState('');
  const [actionFilter, setActionFilter] = useState('all');
  const [tableFilter, setTableFilter] = useState('all');
  const [detailLog, setDetailLog] = useState<AuditLogEntry | null>(null);
  const limit = 30;

  const loadLogs = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke('admin-users', {
        body: { action: 'audit_log', limit, offset: page * limit }
      });
      if (error) throw error;
      setLogs(data.logs || []);
      setTotal(data.total || 0);
    } catch (err: unknown) {
      const error = err as Error;
      toast({ variant: 'destructive', title: 'Fehler', description: error.message });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { 
    loadLogs(); 
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page]);

  const fmtDate = (d: string) => new Date(d).toLocaleDateString('de-DE', {
    day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit', second: '2-digit'
  });

  const actionColor = (action: string): 'destructive' | 'default' | 'secondary' | 'outline' => {
    if (action.includes('DELETE')) return 'destructive';
    if (action.includes('CREATE') || action.includes('INSERT') || action.includes('PROMOTE')) return 'default';
    if (action.includes('UPDATE') || action.includes('CHANGE')) return 'secondary';
    return 'outline';
  };

  const actionIcon = (action: string) => {
    if (action.includes('DELETE')) return '🗑️';
    if (action.includes('CREATE') || action.includes('PROMOTE')) return '✨';
    if (action.includes('UPDATE') || action.includes('CHANGE')) return '✏️';
    if (action.includes('PASSWORD')) return '🔑';
    if (action.includes('ROLE')) return '🛡️';
    return '📋';
  };

  // Client-side filtering
  const filteredLogs = logs.filter(log => {
    if (searchTerm && !JSON.stringify(log).toLowerCase().includes(searchTerm.toLowerCase())) return false;
    if (actionFilter !== 'all' && !log.action.includes(actionFilter)) return false;
    if (tableFilter !== 'all' && log.table_name !== tableFilter) return false;
    return true;
  });

  // Get unique tables and actions for filters
  const uniqueTables = [...new Set(logs.map(l => l.table_name))];
  const uniqueActions = [...new Set(logs.map(l => l.action))];

  const totalPages = Math.ceil(total / limit);

  const exportCSV = () => {
    const headers = ['Zeitstempel', 'Aktion', 'Tabelle', 'Datensatz-ID', 'Benutzer-ID', 'Details'];
    const rows = filteredLogs.map(l => [
      fmtDate(l.created_at), l.action, l.table_name, l.record_id, l.user_id || '-',
      l.new_data ? JSON.stringify(l.new_data) : '-'
    ]);
    const csv = [headers, ...rows].map(r => r.join(';')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = `audit-log-${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
  };

  return (
    <div className="space-y-4">
      {/* Stats Bar */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card><CardContent className="p-4"><p className="text-xs text-muted-foreground">Einträge gesamt</p><p className="text-2xl font-bold">{total}</p></CardContent></Card>
        <Card><CardContent className="p-4"><p className="text-xs text-muted-foreground">Löschungen</p><p className="text-2xl font-bold text-red-500">{logs.filter(l => l.action.includes('DELETE')).length}</p></CardContent></Card>
        <Card><CardContent className="p-4"><p className="text-xs text-muted-foreground">Änderungen</p><p className="text-2xl font-bold text-blue-500">{logs.filter(l => l.action.includes('UPDATE') || l.action.includes('CHANGE')).length}</p></CardContent></Card>
        <Card><CardContent className="p-4"><p className="text-xs text-muted-foreground">Erstellungen</p><p className="text-2xl font-bold text-green-500">{logs.filter(l => l.action.includes('CREATE') || l.action.includes('PROMOTE')).length}</p></CardContent></Card>
      </div>

      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2"><FileText className="h-5 w-5" /> Audit-Log</CardTitle>
              <CardDescription>Vollständiges Aktivitätsprotokoll aller Systemänderungen</CardDescription>
            </div>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" onClick={exportCSV}>
                <Download className="h-4 w-4 mr-1" /> CSV
              </Button>
              <Button variant="outline" size="sm" onClick={loadLogs} disabled={loading}>
                {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {/* Filters */}
          <div className="flex flex-wrap gap-3 mb-4">
            <div className="relative flex-1 min-w-[200px]">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input placeholder="Suchen..." value={searchTerm} onChange={e => setSearchTerm(e.target.value)} className="pl-10" />
            </div>
            <Select value={actionFilter} onValueChange={setActionFilter}>
              <SelectTrigger className="w-[180px]"><Filter className="h-4 w-4 mr-2" /><SelectValue placeholder="Aktion" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Alle Aktionen</SelectItem>
                <SelectItem value="DELETE">Löschungen</SelectItem>
                <SelectItem value="UPDATE">Änderungen</SelectItem>
                <SelectItem value="CREATE">Erstellungen</SelectItem>
                <SelectItem value="PASSWORD">Passwort</SelectItem>
                <SelectItem value="ROLE">Rollen</SelectItem>
                <SelectItem value="PROMOTE">Beförderungen</SelectItem>
              </SelectContent>
            </Select>
            <Select value={tableFilter} onValueChange={setTableFilter}>
              <SelectTrigger className="w-[180px]"><SelectValue placeholder="Tabelle" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Alle Tabellen</SelectItem>
                {uniqueTables.map(t => <SelectItem key={t} value={t}>{t}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>

          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-[40px]"></TableHead>
                <TableHead>Zeitstempel</TableHead>
                <TableHead>Aktion</TableHead>
                <TableHead>Tabelle</TableHead>
                <TableHead>Datensatz-ID</TableHead>
                <TableHead>Details</TableHead>
                <TableHead></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredLogs.length === 0 ? (
                <TableRow><TableCell colSpan={7} className="text-center py-8 text-muted-foreground">
                  {loading ? 'Laden...' : 'Keine Einträge'}
                </TableCell></TableRow>
              ) : filteredLogs.map(log => (
                <TableRow key={log.id}>
                  <TableCell>{actionIcon(log.action)}</TableCell>
                  <TableCell className="text-sm text-muted-foreground whitespace-nowrap">{fmtDate(log.created_at)}</TableCell>
                  <TableCell><Badge variant={actionColor(log.action)}>{log.action}</Badge></TableCell>
                  <TableCell className="font-mono text-sm">{log.table_name}</TableCell>
                  <TableCell className="font-mono text-xs text-muted-foreground truncate max-w-[120px]">{log.record_id}</TableCell>
                  <TableCell className="max-w-[200px]">
                    {log.new_data && (
                      <code className="text-xs bg-muted p-1 rounded block truncate">
                        {JSON.stringify(log.new_data).substring(0, 80)}
                      </code>
                    )}
                  </TableCell>
                  <TableCell>
                    <Button size="icon" variant="ghost" onClick={() => setDetailLog(log)}>
                      <Eye className="h-4 w-4" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>

          {totalPages > 1 && (
            <div className="flex items-center justify-between mt-4">
              <p className="text-sm text-muted-foreground">{total} Einträge</p>
              <div className="flex gap-2">
                <Button size="sm" variant="outline" disabled={page <= 0} onClick={() => setPage(p => p - 1)}>
                  <ChevronLeft className="h-4 w-4" />
                </Button>
                <span className="text-sm py-1 px-3 bg-muted rounded">Seite {page + 1} / {totalPages}</span>
                <Button size="sm" variant="outline" disabled={page >= totalPages - 1} onClick={() => setPage(p => p + 1)}>
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Detail Dialog */}
      <Dialog open={!!detailLog} onOpenChange={() => setDetailLog(null)}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              {detailLog && actionIcon(detailLog.action)} Audit-Eintrag Details
            </DialogTitle>
          </DialogHeader>
          {detailLog && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div><p className="text-xs text-muted-foreground">Zeitstempel</p><p className="font-medium">{fmtDate(detailLog.created_at)}</p></div>
                <div><p className="text-xs text-muted-foreground">Aktion</p><Badge variant={actionColor(detailLog.action)}>{detailLog.action}</Badge></div>
                <div><p className="text-xs text-muted-foreground">Tabelle</p><p className="font-mono">{detailLog.table_name}</p></div>
                <div><p className="text-xs text-muted-foreground">Datensatz-ID</p><p className="font-mono text-sm break-all">{detailLog.record_id}</p></div>
                <div><p className="text-xs text-muted-foreground">Benutzer-ID</p><p className="font-mono text-sm break-all">{detailLog.user_id || '-'}</p></div>
                <div><p className="text-xs text-muted-foreground">IP-Adresse</p><p className="font-mono text-sm">{detailLog.ip_address || '-'}</p></div>
              </div>
              {detailLog.old_data && (
                <div>
                  <p className="text-xs text-muted-foreground mb-1">Alte Daten</p>
                  <pre className="bg-muted p-3 rounded-lg text-xs overflow-auto max-h-[200px]">{JSON.stringify(detailLog.old_data, null, 2)}</pre>
                </div>
              )}
              {detailLog.new_data && (
                <div>
                  <p className="text-xs text-muted-foreground mb-1">Neue Daten</p>
                  <pre className="bg-muted p-3 rounded-lg text-xs overflow-auto max-h-[200px]">{JSON.stringify(detailLog.new_data, null, 2)}</pre>
                </div>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
