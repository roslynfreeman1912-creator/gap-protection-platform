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
  Shield, AlertTriangle, Clock, CheckCircle2, XCircle, Loader2, RefreshCw,
  Plus, Play, FileText, Target, Zap, Lock, Users, Activity, BarChart3
} from 'lucide-react';
import { format } from 'date-fns';

async function callIncidentApi(action: string, data: Record<string, unknown> = {}) {
  const { data: result, error } = await supabase.functions.invoke('incident-response', {
    body: { action, ...data },
  });
  if (error) throw new Error(error.message || 'API-Fehler');
  if (result?.error) throw new Error(result.error);
  return result;
}

const priorityColor = (p: number) => {
  if (p === 1) return 'bg-red-500/20 text-red-400 border-red-500/30';
  if (p === 2) return 'bg-orange-500/20 text-orange-400 border-orange-500/30';
  if (p === 3) return 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30';
  return 'bg-blue-500/20 text-blue-400 border-blue-500/30';
};

const statusBadge = (s: string) => {
  switch (s) {
    case 'open': return 'bg-red-500/20 text-red-400';
    case 'investigating': return 'bg-yellow-500/20 text-yellow-400';
    case 'containing': return 'bg-orange-500/20 text-orange-400';
    case 'contained': return 'bg-blue-500/20 text-blue-400';
    case 'eradicating': return 'bg-purple-500/20 text-purple-400';
    case 'recovering': return 'bg-cyan-500/20 text-cyan-400';
    case 'resolved': return 'bg-green-500/20 text-green-400';
    case 'closed': return 'bg-muted text-muted-foreground';
    default: return 'bg-muted text-muted-foreground';
  }
};

const statusLabel: Record<string, string> = {
  open: 'Offen', investigating: 'Untersuchen', containing: 'Eindämmen',
  contained: 'Eingedämmt', eradicating: 'Beseitigen', recovering: 'Wiederherstellen',
  resolved: 'Gelöst', closed: 'Geschlossen',
};

const playbookInfo: Record<string, { label: string; description: string; icon: typeof Shield }> = {
  account_compromise: { label: 'Konto-Kompromittierung', description: 'Automatische Sperrung, Sitzungswiderruf & Forensik', icon: Lock },
  data_breach: { label: 'Datenpanne', description: 'Sofortige Eindämmung, Zugriffsprüfung & Meldepflicht', icon: FileText },
  ddos_attack: { label: 'DDoS-Angriff', description: 'Traffic-Analyse, Rate-Limiting & CDN-Aktivierung', icon: Zap },
  insider_threat: { label: 'Insider-Bedrohung', description: 'Zugriffsentzug, Aktivitätsanalyse & HR-Eskalation', icon: Users },
  fraud_ring: { label: 'Betrugsring', description: 'Netzwerk-Analyse, Massensperrung & Finanzprüfung', icon: Target },
};

export function IncidentResponseManager() {
  const [incidents, setIncidents] = useState<any[]>([]);
  const [selectedIncident, setSelectedIncident] = useState<any>(null);
  const [timeline, setTimeline] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState('');
  const [showCreate, setShowCreate] = useState(false);
  const [showPlaybook, setShowPlaybook] = useState(false);
  const [activeTab, setActiveTab] = useState('incidents');

  const [newIncident, setNewIncident] = useState({
    title: '', description: '', incident_type: 'unauthorized_access',
    severity: 'high', priority: 2,
  });
  const [timelineEntry, setTimelineEntry] = useState({ entry_type: 'note', description: '' });

  const fetchIncidents = useCallback(async () => {
    setLoading(true);
    try {
      const data = await callIncidentApi('list_incidents', { limit: 100 });
      setIncidents(data.incidents || []);
    } catch (e: any) { toast.error(e.message); }
    setLoading(false);
  }, []);

  const fetchIncidentDetail = async (id: string) => {
    try {
      const data = await callIncidentApi('get_incident', { incident_id: id });
      setSelectedIncident(data.incident);
      setTimeline(data.timeline || []);
    } catch (e: any) { toast.error(e.message); }
  };

  useEffect(() => { fetchIncidents(); }, [fetchIncidents]);

  const createIncident = async () => {
    setActionLoading('create');
    try {
      const data = await callIncidentApi('create_incident', newIncident);
      toast.success(`Vorfall ${data.incident_number} erstellt`);
      setShowCreate(false);
      setNewIncident({ title: '', description: '', incident_type: 'unauthorized_access', severity: 'high', priority: 2 });
      fetchIncidents();
    } catch (e: any) { toast.error(e.message); }
    setActionLoading('');
  };

  const updateStatus = async (id: string, status: string) => {
    setActionLoading(status);
    try {
      await callIncidentApi('update_incident', { incident_id: id, status });
      toast.success(`Status → ${statusLabel[status] || status}`);
      fetchIncidentDetail(id);
      fetchIncidents();
    } catch (e: any) { toast.error(e.message); }
    setActionLoading('');
  };

  const autoContain = async (id: string) => {
    setActionLoading('contain');
    try {
      await callIncidentApi('auto_contain', { incident_id: id });
      toast.success('Automatische Eindämmung ausgeführt');
      fetchIncidentDetail(id);
    } catch (e: any) { toast.error(e.message); }
    setActionLoading('');
  };

  const runPlaybook = async (id: string, playbook: string) => {
    setActionLoading('playbook');
    try {
      const data = await callIncidentApi('run_playbook', { incident_id: id, playbook });
      toast.success(`Playbook "${playbookInfo[playbook]?.label}" ausgeführt — ${data.steps_executed} Schritte`);
      fetchIncidentDetail(id);
      setShowPlaybook(false);
    } catch (e: any) { toast.error(e.message); }
    setActionLoading('');
  };

  const addTimeline = async (id: string) => {
    if (!timelineEntry.description.trim()) return;
    try {
      await callIncidentApi('add_timeline_entry', { incident_id: id, ...timelineEntry });
      toast.success('Timeline-Eintrag hinzugefügt');
      setTimelineEntry({ entry_type: 'note', description: '' });
      fetchIncidentDetail(id);
    } catch (e: any) { toast.error(e.message); }
  };

  const generatePostMortem = async (id: string) => {
    setActionLoading('postmortem');
    try {
      const data = await callIncidentApi('generate_post_mortem', { incident_id: id });
      toast.success('Post-Mortem generiert');
      // Show in a simple way
      setSelectedIncident((prev: any) => ({ ...prev, post_mortem: data.post_mortem }));
    } catch (e: any) { toast.error(e.message); }
    setActionLoading('');
  };

  // Stats
  const openCount = incidents.filter(i => ['open', 'investigating', 'containing'].includes(i.status)).length;
  const criticalCount = incidents.filter(i => i.priority === 1 && i.status !== 'closed' && i.status !== 'resolved').length;
  const resolvedToday = incidents.filter(i => {
    const d = i.resolved_at ? new Date(i.resolved_at) : null;
    return d && d.toDateString() === new Date().toDateString();
  }).length;

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-8 w-8 animate-spin text-red-500" />
        <span className="ml-3 text-muted-foreground">Vorfälle werden geladen...</span>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <AlertTriangle className="h-7 w-7 text-red-500" />
            Incident Response Center
          </h1>
          <p className="text-muted-foreground text-sm mt-1">Vorfallmanagement, Playbooks & automatische Eindämmung</p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={fetchIncidents}>
            <RefreshCw className="h-4 w-4 mr-1" /> Aktualisieren
          </Button>
          <Dialog open={showCreate} onOpenChange={setShowCreate}>
            <DialogTrigger asChild>
              <Button size="sm" className="bg-red-600 hover:bg-red-700 text-white">
                <Plus className="h-4 w-4 mr-1" /> Vorfall melden
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader><DialogTitle>Neuen Vorfall melden</DialogTitle></DialogHeader>
              <div className="space-y-3">
                <Input placeholder="Titel" value={newIncident.title} onChange={e => setNewIncident({ ...newIncident, title: e.target.value })} />
                <Textarea placeholder="Beschreibung" rows={3} value={newIncident.description} onChange={e => setNewIncident({ ...newIncident, description: e.target.value })} />
                <div className="grid grid-cols-3 gap-3">
                  <Select value={newIncident.incident_type} onValueChange={v => setNewIncident({ ...newIncident, incident_type: v })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {['unauthorized_access', 'data_breach', 'malware', 'ddos', 'phishing', 'insider_threat', 'fraud', 'policy_violation'].map(t => (
                        <SelectItem key={t} value={t}>{t.replace(/_/g, ' ').toUpperCase()}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Select value={newIncident.severity} onValueChange={v => setNewIncident({ ...newIncident, severity: v })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {['critical', 'high', 'medium', 'low'].map(s => (
                        <SelectItem key={s} value={s}>{s.toUpperCase()}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Select value={String(newIncident.priority)} onValueChange={v => setNewIncident({ ...newIncident, priority: parseInt(v) })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="1">P1 — Kritisch</SelectItem>
                      <SelectItem value="2">P2 — Hoch</SelectItem>
                      <SelectItem value="3">P3 — Mittel</SelectItem>
                      <SelectItem value="4">P4 — Niedrig</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <Button className="w-full bg-red-600 hover:bg-red-700" onClick={createIncident} disabled={actionLoading === 'create'}>
                  {actionLoading === 'create' ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <AlertTriangle className="h-4 w-4 mr-1" />}
                  Vorfall erstellen
                </Button>
              </div>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Card><CardContent className="p-3 flex items-center gap-3">
          <div className="p-2 rounded-lg bg-red-500/10"><AlertTriangle className="h-4 w-4 text-red-500" /></div>
          <div><p className="text-lg font-bold leading-none">{openCount}</p><p className="text-[10px] text-muted-foreground">Offene Vorfälle</p></div>
        </CardContent></Card>
        <Card><CardContent className="p-3 flex items-center gap-3">
          <div className="p-2 rounded-lg bg-orange-500/10"><Zap className="h-4 w-4 text-orange-500" /></div>
          <div><p className="text-lg font-bold leading-none">{criticalCount}</p><p className="text-[10px] text-muted-foreground">P1 Kritisch</p></div>
        </CardContent></Card>
        <Card><CardContent className="p-3 flex items-center gap-3">
          <div className="p-2 rounded-lg bg-green-500/10"><CheckCircle2 className="h-4 w-4 text-green-500" /></div>
          <div><p className="text-lg font-bold leading-none">{resolvedToday}</p><p className="text-[10px] text-muted-foreground">Heute gelöst</p></div>
        </CardContent></Card>
        <Card><CardContent className="p-3 flex items-center gap-3">
          <div className="p-2 rounded-lg bg-purple-500/10"><Activity className="h-4 w-4 text-purple-500" /></div>
          <div><p className="text-lg font-bold leading-none">{incidents.length}</p><p className="text-[10px] text-muted-foreground">Gesamt</p></div>
        </CardContent></Card>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="grid w-full grid-cols-3">
          <TabsTrigger value="incidents">Vorfälle</TabsTrigger>
          <TabsTrigger value="detail" disabled={!selectedIncident}>Detail & Timeline</TabsTrigger>
          <TabsTrigger value="playbooks">Playbooks</TabsTrigger>
        </TabsList>

        {/* INCIDENTS LIST */}
        <TabsContent value="incidents" className="mt-4">
          <Card>
            <CardContent className="p-0">
              <ScrollArea className="h-[550px]">
                <div className="divide-y">
                  {incidents.map(inc => (
                    <div key={inc.id} className="flex items-center gap-4 p-4 hover:bg-muted/30 cursor-pointer transition-colors"
                      onClick={() => { fetchIncidentDetail(inc.id); setActiveTab('detail'); }}>
                      <Badge variant="outline" className={`${priorityColor(inc.priority)} text-[10px] w-10 justify-center`}>
                        P{inc.priority}
                      </Badge>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-mono text-muted-foreground">{inc.incident_number}</span>
                          <p className="font-medium text-sm truncate">{inc.title}</p>
                        </div>
                        <p className="text-xs text-muted-foreground">{inc.incident_type?.replace(/_/g, ' ')} • {inc.severity}</p>
                      </div>
                      <Badge variant="outline" className={statusBadge(inc.status)}>
                        {statusLabel[inc.status] || inc.status}
                      </Badge>
                      <span className="text-xs text-muted-foreground whitespace-nowrap">
                        {format(new Date(inc.created_at), 'dd.MM.yy HH:mm')}
                      </span>
                    </div>
                  ))}
                  {incidents.length === 0 && (
                    <div className="text-center py-16">
                      <Shield className="h-10 w-10 mx-auto mb-3 text-muted-foreground/30" />
                      <p className="text-muted-foreground">Keine Vorfälle registriert</p>
                    </div>
                  )}
                </div>
              </ScrollArea>
            </CardContent>
          </Card>
        </TabsContent>

        {/* INCIDENT DETAIL */}
        <TabsContent value="detail" className="mt-4 space-y-4">
          {selectedIncident && (
            <>
              <Card className="border-red-500/30">
                <CardHeader className="pb-3">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-xs font-mono text-muted-foreground">{selectedIncident.incident_number}</p>
                      <CardTitle className="text-lg">{selectedIncident.title}</CardTitle>
                    </div>
                    <div className="flex items-center gap-2">
                      <Badge variant="outline" className={priorityColor(selectedIncident.priority)}>P{selectedIncident.priority}</Badge>
                      <Badge variant="outline" className={statusBadge(selectedIncident.status)}>
                        {statusLabel[selectedIncident.status] || selectedIncident.status}
                      </Badge>
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="space-y-4">
                  <p className="text-sm text-muted-foreground">{selectedIncident.description}</p>

                  {/* Metrics */}
                  {selectedIncident.metrics && (
                    <div className="grid grid-cols-3 gap-3">
                      <div className="bg-muted/50 rounded-lg p-3 text-center">
                        <p className="text-xs text-muted-foreground">Zeit bis Eindämmung</p>
                        <p className="text-sm font-bold">{selectedIncident.metrics.time_to_contain || '—'}</p>
                      </div>
                      <div className="bg-muted/50 rounded-lg p-3 text-center">
                        <p className="text-xs text-muted-foreground">Zeit bis Lösung</p>
                        <p className="text-sm font-bold">{selectedIncident.metrics.time_to_resolve || '—'}</p>
                      </div>
                      <div className="bg-muted/50 rounded-lg p-3 text-center">
                        <p className="text-xs text-muted-foreground">Timeline-Einträge</p>
                        <p className="text-sm font-bold">{timeline.length}</p>
                      </div>
                    </div>
                  )}

                  {/* Actions */}
                  <div className="flex flex-wrap gap-2">
                    {selectedIncident.status === 'open' && (
                      <Button size="sm" variant="outline" onClick={() => updateStatus(selectedIncident.id, 'investigating')}
                        disabled={!!actionLoading}>
                        <Activity className="h-3 w-3 mr-1" /> Untersuchen
                      </Button>
                    )}
                    {['open', 'investigating'].includes(selectedIncident.status) && (
                      <Button size="sm" className="bg-orange-600 hover:bg-orange-700 text-white"
                        onClick={() => autoContain(selectedIncident.id)} disabled={!!actionLoading}>
                        {actionLoading === 'contain' ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : <Lock className="h-3 w-3 mr-1" />}
                        Auto-Eindämmen
                      </Button>
                    )}
                    {selectedIncident.status === 'contained' && (
                      <Button size="sm" variant="outline" onClick={() => updateStatus(selectedIncident.id, 'eradicating')}
                        disabled={!!actionLoading}>Beseitigen</Button>
                    )}
                    {selectedIncident.status === 'eradicating' && (
                      <Button size="sm" variant="outline" onClick={() => updateStatus(selectedIncident.id, 'recovering')}
                        disabled={!!actionLoading}>Wiederherstellen</Button>
                    )}
                    {selectedIncident.status === 'recovering' && (
                      <Button size="sm" className="bg-green-600 hover:bg-green-700 text-white"
                        onClick={() => updateStatus(selectedIncident.id, 'resolved')} disabled={!!actionLoading}>
                        <CheckCircle2 className="h-3 w-3 mr-1" /> Lösen
                      </Button>
                    )}

                    <Dialog open={showPlaybook} onOpenChange={setShowPlaybook}>
                      <DialogTrigger asChild>
                        <Button size="sm" variant="outline" className="border-purple-500/30 text-purple-400">
                          <Play className="h-3 w-3 mr-1" /> Playbook
                        </Button>
                      </DialogTrigger>
                      <DialogContent>
                        <DialogHeader><DialogTitle>Playbook ausführen</DialogTitle></DialogHeader>
                        <div className="space-y-3">
                          {Object.entries(playbookInfo).map(([key, info]) => {
                            const Icon = info.icon;
                            return (
                              <div key={key} className="flex items-center gap-3 p-3 rounded-lg border hover:bg-muted/50 cursor-pointer transition-colors"
                                onClick={() => runPlaybook(selectedIncident.id, key)}>
                                <Icon className="h-5 w-5 text-purple-400" />
                                <div className="flex-1">
                                  <p className="text-sm font-medium">{info.label}</p>
                                  <p className="text-xs text-muted-foreground">{info.description}</p>
                                </div>
                                <Play className="h-4 w-4 text-muted-foreground" />
                              </div>
                            );
                          })}
                        </div>
                      </DialogContent>
                    </Dialog>

                    {selectedIncident.status === 'resolved' && (
                      <Button size="sm" variant="outline" onClick={() => generatePostMortem(selectedIncident.id)}
                        disabled={actionLoading === 'postmortem'}>
                        {actionLoading === 'postmortem' ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : <FileText className="h-3 w-3 mr-1" />}
                        Post-Mortem
                      </Button>
                    )}
                  </div>

                  {/* Post-Mortem */}
                  {selectedIncident.post_mortem && (
                    <div className="bg-muted/30 rounded-lg p-4 space-y-2 border border-purple-500/20">
                      <p className="text-xs font-semibold text-purple-400">Post-Mortem Bericht</p>
                      <pre className="text-xs overflow-auto max-h-[300px] whitespace-pre-wrap">
                        {JSON.stringify(selectedIncident.post_mortem, null, 2)}
                      </pre>
                    </div>
                  )}
                </CardContent>
              </Card>

              {/* Timeline */}
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-sm flex items-center gap-2">
                    <Clock className="h-4 w-4 text-cyan-500" /> Vorfall-Timeline
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  {/* Add entry */}
                  <div className="flex gap-2">
                    <Select value={timelineEntry.entry_type} onValueChange={v => setTimelineEntry({ ...timelineEntry, entry_type: v })}>
                      <SelectTrigger className="w-[140px]"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {['note', 'action', 'evidence', 'communication', 'escalation'].map(t => (
                          <SelectItem key={t} value={t}>{t.charAt(0).toUpperCase() + t.slice(1)}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <Input placeholder="Beschreibung..." value={timelineEntry.description}
                      onChange={e => setTimelineEntry({ ...timelineEntry, description: e.target.value })}
                      onKeyDown={e => e.key === 'Enter' && addTimeline(selectedIncident.id)}
                      className="flex-1" />
                    <Button size="sm" onClick={() => addTimeline(selectedIncident.id)}>
                      <Plus className="h-4 w-4" />
                    </Button>
                  </div>

                  <ScrollArea className="h-[350px]">
                    <div className="relative pl-6 space-y-4">
                      <div className="absolute left-[11px] top-0 bottom-0 w-px bg-border" />
                      {timeline.map((entry, i) => (
                        <div key={entry.id || i} className="relative">
                          <div className={`absolute -left-6 w-[22px] h-[22px] rounded-full border-2 flex items-center justify-center text-[8px] font-bold
                            ${entry.entry_type === 'action' ? 'border-cyan-500 bg-cyan-500/20 text-cyan-400' :
                              entry.entry_type === 'escalation' ? 'border-red-500 bg-red-500/20 text-red-400' :
                              entry.entry_type === 'evidence' ? 'border-purple-500 bg-purple-500/20 text-purple-400' :
                              'border-muted-foreground bg-muted text-muted-foreground'}`}>
                            {i + 1}
                          </div>
                          <div className="bg-muted/30 rounded-lg p-3">
                            <div className="flex items-center gap-2 mb-1">
                              <Badge variant="outline" className="text-[10px]">{entry.entry_type}</Badge>
                              <span className="text-[10px] text-muted-foreground">
                                {entry.created_at ? format(new Date(entry.created_at), 'dd.MM.yy HH:mm:ss') : ''}
                              </span>
                              {entry.actor_id && <span className="text-[10px] text-muted-foreground">• {entry.actor_id.slice(0, 8)}</span>}
                            </div>
                            <p className="text-sm">{entry.description}</p>
                          </div>
                        </div>
                      ))}
                      {timeline.length === 0 && (
                        <p className="text-center text-muted-foreground py-8 text-sm">Keine Timeline-Einträge</p>
                      )}
                    </div>
                  </ScrollArea>
                </CardContent>
              </Card>
            </>
          )}
        </TabsContent>

        {/* PLAYBOOKS */}
        <TabsContent value="playbooks" className="mt-4">
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
            {Object.entries(playbookInfo).map(([key, info]) => {
              const Icon = info.icon;
              return (
                <Card key={key} className="hover:shadow-md transition-shadow border-purple-500/20">
                  <CardContent className="p-5">
                    <div className="flex items-center gap-3 mb-3">
                      <div className="p-2.5 rounded-xl bg-purple-500/20">
                        <Icon className="h-5 w-5 text-purple-400" />
                      </div>
                      <div>
                        <p className="font-medium text-sm">{info.label}</p>
                      </div>
                    </div>
                    <p className="text-xs text-muted-foreground mb-4">{info.description}</p>
                    <div className="text-[10px] text-muted-foreground space-y-1">
                      <p>Automatisierte Schritte:</p>
                      {key === 'account_compromise' && <p>1. Sitzungen widerrufen → 2. Konto sperren → 3. IPs blockieren → 4. API-Keys widerrufen → 5. Benachrichtigung</p>}
                      {key === 'data_breach' && <p>1. Zugriff sperren → 2. Logs sichern → 3. Betroffene identifizieren → 4. DSGVO-Meldung → 5. Forensik</p>}
                      {key === 'ddos_attack' && <p>1. Traffic-Analyse → 2. Rate-Limits → 3. IP-Blockierung → 4. CDN-Aktivierung → 5. Monitoring</p>}
                      {key === 'insider_threat' && <p>1. Zugriffsentzug → 2. Aktivitäts-Log → 3. Daten sichern → 4. HR-Eskalation → 5. Forensik</p>}
                      {key === 'fraud_ring' && <p>1. Netzwerk-Analyse → 2. Konten sperren → 3. Transaktionen prüfen → 4. Wallets einfrieren → 5. Bericht</p>}
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
