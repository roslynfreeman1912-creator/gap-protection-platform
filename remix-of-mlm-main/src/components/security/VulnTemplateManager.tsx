import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { Shield, Upload, Search, Filter, Eye, Trash2, Plus, Database, AlertTriangle } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { securityApi } from '@/lib/securityApi';
import { useToast } from '@/hooks/use-toast';

interface VulnTemplate {
  id: string;
  name: string;
  type: string;
  severity: string;
  cve_id: string | null;
  description: string | null;
  payloads: string[];
  paths: string[];
  methods: string[];
  matchers: string[];
  source_file: string | null;
  is_active: boolean;
  created_at: string;
}

const SEVERITY_COLORS: Record<string, string> = {
  critical: 'bg-red-600 text-white',
  high: 'bg-orange-500 text-white',
  medium: 'bg-yellow-500 text-black',
  low: 'bg-blue-500 text-white',
  info: 'bg-gray-400 text-white',
};

export function VulnTemplateManager() {
  const [templates, setTemplates] = useState<VulnTemplate[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [filterType, setFilterType] = useState('all');
  const [filterSeverity, setFilterSeverity] = useState('all');
  const [page, setPage] = useState(0);
  const [total, setTotal] = useState(0);
  const [selectedTemplate, setSelectedTemplate] = useState<VulnTemplate | null>(null);
  const [importing, setImporting] = useState(false);
  const { toast } = useToast();
  const PAGE_SIZE = 50;

  const fetchTemplates = async () => {
    setLoading(true);
    try {
      let query = supabase
        .from('vulnerability_templates' as any)
        .select('*', { count: 'exact' })
        .order('created_at', { ascending: false })
        .range(page * PAGE_SIZE, (page + 1) * PAGE_SIZE - 1);

      if (searchQuery) {
        query = query.or(`name.ilike.%${searchQuery}%,type.ilike.%${searchQuery}%,cve_id.ilike.%${searchQuery}%`);
      }
      if (filterType !== 'all') {
        query = query.eq('type', filterType);
      }
      if (filterSeverity !== 'all') {
        query = query.eq('severity', filterSeverity);
      }

      const { data, count, error } = await query;
      if (error) throw error;
      setTemplates((data as unknown as VulnTemplate[]) || []);
      setTotal(count || 0);
    } catch (err: any) {
      toast({ title: 'Fehler', description: err.message, variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchTemplates(); }, [page, filterType, filterSeverity]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleSearch = () => {
    setPage(0);
    fetchTemplates();
  };

  const handleToggleActive = async (id: string, currentActive: boolean) => {
    try {
      await securityApi.update('vulnerability_templates', id, { is_active: !currentActive });
      setTemplates(prev => prev.map(t => t.id === id ? { ...t, is_active: !currentActive } : t));
      toast({ title: !currentActive ? 'Aktiviert' : 'Deaktiviert' });
    } catch (err: any) {
      toast({ title: 'Fehler', description: err.message, variant: 'destructive' });
    }
  };

  const handleDelete = async (id: string) => {
    try {
      await securityApi.delete('vulnerability_templates', id);
      setTemplates(prev => prev.filter(t => t.id !== id));
      setTotal(prev => prev - 1);
      toast({ title: 'Gelöscht' });
    } catch (err: any) {
      toast({ title: 'Fehler', description: err.message, variant: 'destructive' });
    }
  };

  const handleBulkImport = async () => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json';
    input.onchange = async (e: any) => {
      const file = e.target.files[0];
      if (!file) return;
      setImporting(true);
      try {
        const text = await file.text();
        const records = JSON.parse(text);
        if (!Array.isArray(records)) throw new Error('JSON muss ein Array sein');

        // Batch insert in chunks of 100
        const chunkSize = 100;
        let imported = 0;
        for (let i = 0; i < records.length; i += chunkSize) {
          const chunk = records.slice(i, i + chunkSize);
          await securityApi.batchInsert('vulnerability_templates', chunk);
          imported += chunk.length;
        }

        toast({ title: `${imported} Templates importiert` });
        fetchTemplates();
      } catch (err: any) {
        toast({ title: 'Import fehlgeschlagen', description: err.message, variant: 'destructive' });
      } finally {
        setImporting(false);
      }
    };
    input.click();
  };

  // Unique types from current page for filter dropdown
  const typeOptions = ['all', ...new Set(templates.map(t => t.type))];
  const totalPages = Math.ceil(total / PAGE_SIZE);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Shield className="h-5 w-5" />
          Vulnerability Templates
          <Badge variant="secondary">{total} gesamt</Badge>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Toolbar */}
        <div className="flex flex-wrap gap-2">
          <div className="flex gap-2 flex-1 min-w-[200px]">
            <Input
              placeholder="Suche nach Name, Typ, CVE..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
            />
            <Button variant="outline" size="icon" onClick={handleSearch}>
              <Search className="h-4 w-4" />
            </Button>
          </div>
          <Select value={filterSeverity} onValueChange={(v) => { setFilterSeverity(v); setPage(0); }}>
            <SelectTrigger className="w-[140px]">
              <Filter className="h-4 w-4 mr-1" />
              <SelectValue placeholder="Severity" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Alle Severity</SelectItem>
              <SelectItem value="critical">Critical</SelectItem>
              <SelectItem value="high">High</SelectItem>
              <SelectItem value="medium">Medium</SelectItem>
              <SelectItem value="low">Low</SelectItem>
              <SelectItem value="info">Info</SelectItem>
            </SelectContent>
          </Select>
          <Select value={filterType} onValueChange={(v) => { setFilterType(v); setPage(0); }}>
            <SelectTrigger className="w-[160px]">
              <SelectValue placeholder="Typ" />
            </SelectTrigger>
            <SelectContent>
              {typeOptions.map(t => (
                <SelectItem key={t} value={t}>{t === 'all' ? 'Alle Typen' : t}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button variant="outline" onClick={handleBulkImport} disabled={importing}>
            <Upload className="h-4 w-4 mr-1" />
            {importing ? 'Importiere...' : 'JSON Import'}
          </Button>
        </div>

        {/* Table */}
        <div className="border rounded-md overflow-auto max-h-[600px]">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Typ</TableHead>
                <TableHead>Severity</TableHead>
                <TableHead>CVE</TableHead>
                <TableHead>Payloads</TableHead>
                <TableHead>Aktiv</TableHead>
                <TableHead>Aktionen</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                <TableRow><TableCell colSpan={7} className="text-center py-8">Laden...</TableCell></TableRow>
              ) : templates.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={7} className="text-center py-8">
                    <div className="flex flex-col items-center gap-2">
                      <Database className="h-8 w-8 text-muted-foreground" />
                      <p>Keine Templates gefunden</p>
                      <p className="text-sm text-muted-foreground">Importieren Sie die vulnerability_templates_import.json Datei</p>
                    </div>
                  </TableCell>
                </TableRow>
              ) : templates.map(t => (
                <TableRow key={t.id}>
                  <TableCell className="font-medium max-w-[200px] truncate">{t.name}</TableCell>
                  <TableCell><Badge variant="outline">{t.type}</Badge></TableCell>
                  <TableCell>
                    <Badge className={SEVERITY_COLORS[t.severity] || 'bg-gray-400'}>{t.severity}</Badge>
                  </TableCell>
                  <TableCell className="text-xs">{t.cve_id || '—'}</TableCell>
                  <TableCell>{t.payloads?.length || 0}</TableCell>
                  <TableCell>
                    <Switch checked={t.is_active} onCheckedChange={() => handleToggleActive(t.id, t.is_active)} />
                  </TableCell>
                  <TableCell>
                    <div className="flex gap-1">
                      <Button variant="ghost" size="icon" onClick={() => setSelectedTemplate(t)}>
                        <Eye className="h-4 w-4" />
                      </Button>
                      <Button variant="ghost" size="icon" onClick={() => handleDelete(t.id)}>
                        <Trash2 className="h-4 w-4 text-red-500" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="flex items-center justify-between">
            <span className="text-sm text-muted-foreground">
              Seite {page + 1} von {totalPages} ({total} Templates)
            </span>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" disabled={page === 0} onClick={() => setPage(p => p - 1)}>
                Zurück
              </Button>
              <Button variant="outline" size="sm" disabled={page >= totalPages - 1} onClick={() => setPage(p => p + 1)}>
                Weiter
              </Button>
            </div>
          </div>
        )}

        {/* Detail Dialog */}
        <Dialog open={!!selectedTemplate} onOpenChange={() => setSelectedTemplate(null)}>
          <DialogContent className="max-w-2xl max-h-[80vh] overflow-auto">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <AlertTriangle className="h-5 w-5" />
                {selectedTemplate?.name}
              </DialogTitle>
            </DialogHeader>
            {selectedTemplate && (
              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="text-sm font-medium">Typ</label>
                    <p><Badge variant="outline">{selectedTemplate.type}</Badge></p>
                  </div>
                  <div>
                    <label className="text-sm font-medium">Severity</label>
                    <p><Badge className={SEVERITY_COLORS[selectedTemplate.severity]}>{selectedTemplate.severity}</Badge></p>
                  </div>
                  {selectedTemplate.cve_id && (
                    <div>
                      <label className="text-sm font-medium">CVE</label>
                      <p>{selectedTemplate.cve_id}</p>
                    </div>
                  )}
                  <div>
                    <label className="text-sm font-medium">Quelle</label>
                    <p className="text-sm">{selectedTemplate.source_file || '—'}</p>
                  </div>
                </div>
                {selectedTemplate.description && (
                  <div>
                    <label className="text-sm font-medium">Beschreibung</label>
                    <p className="text-sm">{selectedTemplate.description}</p>
                  </div>
                )}
                <div>
                  <label className="text-sm font-medium">Payloads ({selectedTemplate.payloads?.length || 0})</label>
                  <div className="bg-muted rounded p-2 max-h-[200px] overflow-auto">
                    <pre className="text-xs whitespace-pre-wrap break-all">
                      {selectedTemplate.payloads?.join('\n')}
                    </pre>
                  </div>
                </div>
                {selectedTemplate.matchers?.length > 0 && (
                  <div>
                    <label className="text-sm font-medium">Matchers</label>
                    <div className="flex flex-wrap gap-1">
                      {selectedTemplate.matchers.map((m, i) => (
                        <Badge key={i} variant="outline" className="text-xs">{m}</Badge>
                      ))}
                    </div>
                  </div>
                )}
                {selectedTemplate.paths?.length > 0 && (
                  <div>
                    <label className="text-sm font-medium">Pfade</label>
                    <div className="flex flex-wrap gap-1">
                      {selectedTemplate.paths.map((p, i) => (
                        <Badge key={i} variant="secondary" className="text-xs">{p}</Badge>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}
          </DialogContent>
        </Dialog>
      </CardContent>
    </Card>
  );
}
