import { useEffect, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { Layout } from '@/components/layout/Layout';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { useToast } from '@/hooks/use-toast';
import {
  Building2, Phone, Mail, MapPin, Plus, Search, Download, Upload,
  FileText, Calendar, MessageSquare, Send, Loader2, Trash2, CheckCircle,
  Clock, AlertTriangle, XCircle, Edit, Eye, PhoneCall, Star
} from 'lucide-react';

// ── Types ──
interface CrmContact {
  id: string; owner_id: string; company_name: string; street: string;
  house_number: string; postal_code: string; city: string; phone: string;
  email: string; fax: string; notes: string; penetration_test_date: string | null;
  threat_level: number | null; subscription_date: string | null;
  status: string; created_at: string; updated_at: string;
  crm_notes?: { count: number }[]; crm_reminders?: { count: number }[];
}
interface CrmNote { id: string; note_text: string; created_at: string; user?: { first_name: string; last_name: string } }
interface CrmReminder { id: string; title: string; reminder_date: string; is_completed: boolean; created_at: string; contact?: { company_name: string }; user?: { first_name: string; last_name: string } }

const STATUS_MAP: Record<string, { label: string; color: string; icon: any }> = {
  new: { label: 'Neu', color: 'bg-blue-500', icon: Star },
  contacted: { label: 'Kontaktiert', color: 'bg-yellow-500', icon: Phone },
  interested: { label: 'Interessiert', color: 'bg-green-500', icon: CheckCircle },
  negotiation: { label: 'Verhandlung', color: 'bg-purple-500', icon: MessageSquare },
  customer: { label: 'Kunde', color: 'bg-emerald-500', icon: CheckCircle },
  lost: { label: 'Verloren', color: 'bg-red-500', icon: XCircle },
};

const emptyContact = (): Partial<CrmContact> => ({
  company_name: '', street: '', house_number: '', postal_code: '', city: '',
  phone: '', email: '', fax: '', notes: '', status: 'new',
  penetration_test_date: null, threat_level: null, subscription_date: null,
});

// ── API Helper ──
async function callCrmApi(action: string, data: any = {}) {
  const { data: result, error } = await supabase.functions.invoke('crm-api', { body: { action, ...data } });
  if (error) throw new Error(error.message);
  return result;
}

export default function CRMDashboard() {
  const { user, profile, loading, hasAnyRole } = useAuth();
  const navigate = useNavigate();
  const { toast } = useToast();

  const [contacts, setContacts] = useState<CrmContact[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');

  // Dialogs
  const [showForm, setShowForm] = useState(false);
  const [showDetail, setShowDetail] = useState(false);
  const [showEmailDialog, setShowEmailDialog] = useState(false);
  const [showImportDialog, setShowImportDialog] = useState(false);

  // Form
  const [editContact, setEditContact] = useState<Partial<CrmContact>>(emptyContact());
  const [isEditing, setIsEditing] = useState(false);

  // Detail
  const [selectedContact, setSelectedContact] = useState<CrmContact | null>(null);
  const [contactNotes, setContactNotes] = useState<CrmNote[]>([]);
  const [contactReminders, setContactReminders] = useState<CrmReminder[]>([]);
  const [newNote, setNewNote] = useState('');
  const [newReminderTitle, setNewReminderTitle] = useState('');
  const [newReminderDate, setNewReminderDate] = useState('');

  // Email
  const [emailSubject, setEmailSubject] = useState('');
  const [emailBody, setEmailBody] = useState('');
  const [emailTemplate, setEmailTemplate] = useState('custom');
  const [isSending, setIsSending] = useState(false);

  // Upcoming reminders
  const [upcomingReminders, setUpcomingReminders] = useState<CrmReminder[]>([]);

  useEffect(() => {
    if (!loading && !user) navigate('/auth');
  }, [user, loading, navigate]);

  const loadContacts = useCallback(async () => {
    setIsLoading(true);
    try {
      const result = await callCrmApi('list', {
        search: search || undefined,
        status: statusFilter !== 'all' ? statusFilter : undefined,
      });
      setContacts(result.contacts || []);
    } catch (e: any) {
      toast({ variant: 'destructive', title: 'Fehler', description: e.message });
    } finally {
      setIsLoading(false);
    }
  }, [search, statusFilter, toast]);

  const loadUpcoming = useCallback(async () => {
    try {
      const result = await callCrmApi('upcoming-reminders');
      setUpcomingReminders(result.reminders || []);
    } catch {}
  }, []);

  useEffect(() => {
    if (profile) { loadContacts(); loadUpcoming(); }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profile]);

  // ── Handlers ──
  const handleSave = async () => {
    try {
      if (isEditing && editContact.id) {
        const { id, owner_id, created_at, updated_at, crm_notes, crm_reminders, ...contactData } = editContact as any;
        await callCrmApi('update', { contactId: id, contact: contactData });
        toast({ title: 'Gespeichert', description: 'Kontakt aktualisiert.' });
      } else {
        const { id, owner_id, created_at, updated_at, crm_notes, crm_reminders, ...contactData } = editContact as any;
        await callCrmApi('create', { contact: contactData });
        toast({ title: 'Erstellt', description: 'Neuer Kontakt angelegt.' });
      }
      setShowForm(false);
      loadContacts();
    } catch (e: any) {
      toast({ variant: 'destructive', title: 'Fehler', description: e.message });
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Kontakt wirklich löschen?')) return;
    try {
      await callCrmApi('delete', { contactId: id });
      toast({ title: 'Gelöscht' });
      loadContacts();
      if (selectedContact?.id === id) setShowDetail(false);
    } catch (e: any) {
      toast({ variant: 'destructive', title: 'Fehler', description: e.message });
    }
  };

  const openDetail = async (contact: CrmContact) => {
    setSelectedContact(contact);
    setShowDetail(true);
    try {
      const result = await callCrmApi('get', { contactId: contact.id });
      setSelectedContact(result.contact);
      setContactNotes(result.notes || []);
      setContactReminders(result.reminders || []);
    } catch {}
  };

  const addNote = async () => {
    if (!newNote.trim() || !selectedContact) return;
    try {
      const result = await callCrmApi('add-note', { contactId: selectedContact.id, text: newNote });
      setContactNotes(prev => [result.note, ...prev]);
      setNewNote('');
    } catch (e: any) {
      toast({ variant: 'destructive', title: 'Fehler', description: e.message });
    }
  };

  const addReminder = async () => {
    if (!newReminderTitle.trim() || !newReminderDate || !selectedContact) return;
    try {
      const result = await callCrmApi('add-reminder', {
        contactId: selectedContact.id, title: newReminderTitle, reminderDate: newReminderDate,
      });
      setContactReminders(prev => [...prev, result.reminder]);
      setNewReminderTitle('');
      setNewReminderDate('');
      loadUpcoming();
    } catch (e: any) {
      toast({ variant: 'destructive', title: 'Fehler', description: e.message });
    }
  };

  const completeReminder = async (id: string, completed: boolean) => {
    try {
      await callCrmApi('complete-reminder', { reminderId: id, completed });
      setContactReminders(prev => prev.map(r => r.id === id ? { ...r, is_completed: completed } : r));
      loadUpcoming();
    } catch {}
  };

  const sendEmail = async () => {
    if (!selectedContact) return;
    setIsSending(true);
    try {
      await callCrmApi('send-email', {
        contactId: selectedContact.id,
        emailTo: selectedContact.email,
        subject: emailSubject,
        htmlBody: emailBody ? `<div style="font-family:Arial,sans-serif;line-height:1.6">${emailBody.replace(/\n/g,'<br>')}</div>` : undefined,
        templateType: emailTemplate !== 'custom' ? emailTemplate : undefined,
      });
      toast({ title: 'Email gesendet', description: `An ${selectedContact.email}` });
      setShowEmailDialog(false);
      setEmailSubject(''); setEmailBody(''); setEmailTemplate('custom');
    } catch (e: any) {
      toast({ variant: 'destructive', title: 'Fehler', description: e.message });
    } finally {
      setIsSending(false);
    }
  };

  const exportCsv = async () => {
    try {
      const result = await callCrmApi('export-csv');
      const blob = new Blob(['\uFEFF' + result.csv], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url; a.download = `crm_export_${new Date().toISOString().slice(0,10)}.csv`;
      a.click(); URL.revokeObjectURL(url);
      toast({ title: 'Exportiert' });
    } catch (e: any) {
      toast({ variant: 'destructive', title: 'Fehler', description: e.message });
    }
  };

  const importCsv = async (file: File) => {
    try {
      const text = await file.text();
      const lines = text.split('\n').filter(l => l.trim());
      if (lines.length < 2) { toast({ variant: 'destructive', title: 'Leere Datei' }); return; }
      const headers = lines[0].split(';').map(h => h.replace(/"/g, '').trim());
      const rows = lines.slice(1).map(line => {
        const vals = line.split(';').map(v => v.replace(/^"|"$/g, '').trim());
        const obj: any = {};
        headers.forEach((h, i) => { obj[h] = vals[i] || ''; });
        return obj;
      });
      const result = await callCrmApi('import-csv', { rows });
      toast({ title: 'Importiert', description: `${result.imported} Kontakte importiert.` });
      setShowImportDialog(false);
      loadContacts();
    } catch (e: any) {
      toast({ variant: 'destructive', title: 'Import-Fehler', description: e.message });
    }
  };

  const fmtDate = (d: string) => new Date(d).toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' });
  const fmtDateTime = (d: string) => new Date(d).toLocaleString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });

  if (loading || isLoading) {
    return (
      <Layout><div className="container py-8 flex items-center justify-center min-h-[60vh]">
        <div className="text-center"><Loader2 className="h-8 w-8 animate-spin mx-auto mb-4 text-primary" /><p className="text-muted-foreground">Lade CRM...</p></div>
      </div></Layout>
    );
  }

  return (
    <Layout>
      <div className="container px-4 sm:px-6 py-6 sm:py-8 space-y-6">
        {/* ── Header ── */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h1 className="text-2xl sm:text-3xl font-bold flex items-center gap-3">
              <Building2 className="h-7 w-7 text-primary" />
              CRM
            </h1>
            <p className="text-muted-foreground mt-1">{contacts.length} Kontakte</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Button onClick={() => { setEditContact(emptyContact()); setIsEditing(false); setShowForm(true); }} className="gap-2">
              <Plus className="h-4 w-4" /> Kontakt
            </Button>
            <Button variant="outline" onClick={exportCsv} className="gap-2">
              <Download className="h-4 w-4" /> Export
            </Button>
            <Button variant="outline" onClick={() => setShowImportDialog(true)} className="gap-2">
              <Upload className="h-4 w-4" /> Import
            </Button>
          </div>
        </div>

        {/* ── Upcoming Reminders ── */}
        {upcomingReminders.length > 0 && (
          <Card className="border-orange-500/30 bg-orange-500/5">
            <CardHeader className="py-3">
              <CardTitle className="text-sm flex items-center gap-2"><Clock className="h-4 w-4 text-orange-500" /> Anstehende Wiedervorlagen ({upcomingReminders.length})</CardTitle>
            </CardHeader>
            <CardContent className="py-0 pb-3">
              <div className="space-y-1">
                {upcomingReminders.slice(0, 5).map(r => (
                  <div key={r.id} className="flex items-center justify-between text-sm py-1.5 px-2 rounded hover:bg-muted/50">
                    <div className="flex items-center gap-2 min-w-0">
                      <Calendar className="h-3.5 w-3.5 text-orange-500 shrink-0" />
                      <span className="font-medium truncate">{r.title}</span>
                      <span className="text-muted-foreground text-xs">— {r.contact?.company_name}</span>
                    </div>
                    <Badge variant="outline" className="shrink-0 text-xs">{fmtDateTime(r.reminder_date)}</Badge>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}

        {/* ── Search & Filter ── */}
        <div className="flex flex-col sm:flex-row gap-3">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input placeholder="Suchen (Firma, Email, Stadt, Telefon)..." value={search} onChange={e => setSearch(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && loadContacts()} className="pl-9" />
          </div>
          <Select value={statusFilter} onValueChange={v => { setStatusFilter(v); }}>
            <SelectTrigger className="w-full sm:w-[200px]"><SelectValue placeholder="Alle Status" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Alle Status</SelectItem>
              {Object.entries(STATUS_MAP).map(([k, v]) => (<SelectItem key={k} value={k}>{v.label}</SelectItem>))}
            </SelectContent>
          </Select>
          <Button onClick={loadContacts} variant="secondary" className="gap-2"><Search className="h-4 w-4" /> Suchen</Button>
        </div>

        {/* ── Contacts Table ── */}
        <Card>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Firma</TableHead>
                  <TableHead className="hidden md:table-cell">Ort</TableHead>
                  <TableHead className="hidden sm:table-cell">Telefon</TableHead>
                  <TableHead className="hidden lg:table-cell">E-Mail</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="hidden lg:table-cell">Bedrohung</TableHead>
                  <TableHead className="text-right">Aktionen</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {contacts.map(c => {
                  const s = STATUS_MAP[c.status] || STATUS_MAP.new;
                  return (
                    <TableRow key={c.id} className="cursor-pointer hover:bg-muted/50" onClick={() => openDetail(c)}>
                      <TableCell>
                        <div className="font-medium">{c.company_name || '—'}</div>
                        <div className="text-xs text-muted-foreground md:hidden">{c.city}</div>
                      </TableCell>
                      <TableCell className="hidden md:table-cell text-muted-foreground">{c.postal_code} {c.city}</TableCell>
                      <TableCell className="hidden sm:table-cell">{c.phone}</TableCell>
                      <TableCell className="hidden lg:table-cell text-muted-foreground">{c.email}</TableCell>
                      <TableCell><Badge className={s.color}>{s.label}</Badge></TableCell>
                      <TableCell className="hidden lg:table-cell">
                        {c.threat_level ? (
                          <div className="flex items-center gap-1">
                            {[1,2,3,4,5].map(i => (
                              <div key={i} className={`h-2 w-4 rounded-sm ${i <= (c.threat_level||0) ?
                                (c.threat_level! <= 2 ? 'bg-green-500' : c.threat_level! <= 3 ? 'bg-yellow-500' : 'bg-red-500') : 'bg-muted'}`} />
                            ))}
                          </div>
                        ) : <span className="text-muted-foreground text-xs">—</span>}
                      </TableCell>
                      <TableCell className="text-right" onClick={e => e.stopPropagation()}>
                        <div className="flex items-center justify-end gap-1">
                          {c.phone && (
                            <Button size="icon" variant="ghost" className="h-7 w-7"
                              onClick={() => window.open(`tel:${c.phone}`, '_blank')} title="Anrufen">
                              <PhoneCall className="h-3.5 w-3.5 text-green-600" />
                            </Button>
                          )}
                          <Button size="icon" variant="ghost" className="h-7 w-7"
                            onClick={() => { setEditContact(c); setIsEditing(true); setShowForm(true); }} title="Bearbeiten">
                            <Edit className="h-3.5 w-3.5" />
                          </Button>
                          <Button size="icon" variant="ghost" className="h-7 w-7 text-destructive hover:text-destructive"
                            onClick={() => handleDelete(c.id)} title="Löschen">
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })}
                {contacts.length === 0 && (
                  <TableRow><TableCell colSpan={7} className="text-center text-muted-foreground py-12">
                    <Building2 className="h-10 w-10 mx-auto mb-3 opacity-30" />
                    <p>Keine Kontakte gefunden</p>
                    <Button variant="link" className="mt-2" onClick={() => { setEditContact(emptyContact()); setIsEditing(false); setShowForm(true); }}>
                      Ersten Kontakt anlegen
                    </Button>
                  </TableCell></TableRow>
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        {/* ════════════════════════════════════════════ */}
        {/* ── Contact Form Dialog ── */}
        {/* ════════════════════════════════════════════ */}
        <Dialog open={showForm} onOpenChange={setShowForm}>
          <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>{isEditing ? 'Kontakt bearbeiten' : 'Neuer Kontakt'}</DialogTitle>
              <DialogDescription>Alle Felder ausfüllen.</DialogDescription>
            </DialogHeader>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="sm:col-span-2"><Label>Firmenname</Label><Input value={editContact.company_name || ''} onChange={e => setEditContact(p => ({ ...p, company_name: e.target.value }))} /></div>
              <div><Label>Straße</Label><Input value={editContact.street || ''} onChange={e => setEditContact(p => ({ ...p, street: e.target.value }))} /></div>
              <div><Label>Hausnummer</Label><Input value={editContact.house_number || ''} onChange={e => setEditContact(p => ({ ...p, house_number: e.target.value }))} /></div>
              <div><Label>PLZ</Label><Input value={editContact.postal_code || ''} onChange={e => setEditContact(p => ({ ...p, postal_code: e.target.value }))} /></div>
              <div><Label>Ort</Label><Input value={editContact.city || ''} onChange={e => setEditContact(p => ({ ...p, city: e.target.value }))} /></div>
              <div><Label>Telefon</Label><Input value={editContact.phone || ''} onChange={e => setEditContact(p => ({ ...p, phone: e.target.value }))} /></div>
              <div><Label>E-Mail</Label><Input type="email" value={editContact.email || ''} onChange={e => setEditContact(p => ({ ...p, email: e.target.value }))} /></div>
              <div><Label>Fax (optional)</Label><Input value={editContact.fax || ''} onChange={e => setEditContact(p => ({ ...p, fax: e.target.value }))} /></div>
              <div>
                <Label>Status</Label>
                <Select value={editContact.status || 'new'} onValueChange={v => setEditContact(p => ({ ...p, status: v }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{Object.entries(STATUS_MAP).map(([k, v]) => (<SelectItem key={k} value={k}>{v.label}</SelectItem>))}</SelectContent>
                </Select>
              </div>
              <div><Label>Penetrationstest am</Label><Input type="date" value={editContact.penetration_test_date || ''} onChange={e => setEditContact(p => ({ ...p, penetration_test_date: e.target.value || null }))} /></div>
              <div>
                <Label>Bedrohungslevel (1-5)</Label>
                <Select value={editContact.threat_level ? String(editContact.threat_level) : 'none'} onValueChange={v => setEditContact(p => ({ ...p, threat_level: v === 'none' ? null : Number(v) }))}>
                  <SelectTrigger><SelectValue placeholder="Nicht bewertet" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Nicht bewertet</SelectItem>
                    {[1,2,3,4,5].map(i => (<SelectItem key={i} value={String(i)}>Level {i}</SelectItem>))}
                  </SelectContent>
                </Select>
              </div>
              <div><Label>Abo abgeschlossen am</Label><Input type="date" value={editContact.subscription_date || ''} onChange={e => setEditContact(p => ({ ...p, subscription_date: e.target.value || null }))} /></div>
              <div className="sm:col-span-2"><Label>Notizen</Label><Textarea rows={3} value={editContact.notes || ''} onChange={e => setEditContact(p => ({ ...p, notes: e.target.value }))} /></div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setShowForm(false)}>Abbrechen</Button>
              <Button onClick={handleSave}>{isEditing ? 'Speichern' : 'Erstellen'}</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* ════════════════════════════════════════════ */}
        {/* ── Contact Detail Dialog ── */}
        {/* ════════════════════════════════════════════ */}
        <Dialog open={showDetail} onOpenChange={setShowDetail}>
          <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
            {selectedContact && (
              <>
                <DialogHeader>
                  <DialogTitle className="flex items-center gap-3">
                    <Building2 className="h-5 w-5" />
                    {selectedContact.company_name || 'Kein Firmenname'}
                    <Badge className={STATUS_MAP[selectedContact.status]?.color}>{STATUS_MAP[selectedContact.status]?.label}</Badge>
                  </DialogTitle>
                  <DialogDescription className="flex flex-wrap items-center gap-4 pt-2">
                    {selectedContact.phone && <span className="flex items-center gap-1"><Phone className="h-3.5 w-3.5" />{selectedContact.phone}</span>}
                    {selectedContact.email && <span className="flex items-center gap-1"><Mail className="h-3.5 w-3.5" />{selectedContact.email}</span>}
                    {selectedContact.city && <span className="flex items-center gap-1"><MapPin className="h-3.5 w-3.5" />{selectedContact.postal_code} {selectedContact.city}</span>}
                  </DialogDescription>
                </DialogHeader>

                {/* Action Buttons */}
                <div className="flex flex-wrap gap-2 py-2">
                  {selectedContact.phone && (
                    <Button size="sm" variant="outline" className="gap-2" onClick={() => window.open(`tel:${selectedContact.phone}`, '_blank')}>
                      <PhoneCall className="h-3.5 w-3.5 text-green-600" /> Anrufen
                    </Button>
                  )}
                  {selectedContact.email && (
                    <Button size="sm" variant="outline" className="gap-2" onClick={() => {
                      setEmailTemplate('custom'); setEmailSubject(''); setEmailBody(''); setShowEmailDialog(true);
                    }}>
                      <Mail className="h-3.5 w-3.5 text-blue-600" /> E-Mail senden
                    </Button>
                  )}
                  {selectedContact.email && (
                    <Button size="sm" variant="outline" className="gap-2" onClick={() => {
                      setEmailTemplate('penetration_vollmacht'); setShowEmailDialog(true);
                    }}>
                      <Send className="h-3.5 w-3.5 text-purple-600" /> Vollmacht senden
                    </Button>
                  )}
                </div>

                {/* Tabs: Info / Notes / Calendar */}
                <Tabs defaultValue="info" className="mt-2">
                  <TabsList className="grid w-full grid-cols-3">
                    <TabsTrigger value="info" className="gap-1.5"><FileText className="h-3.5 w-3.5" /> Info</TabsTrigger>
                    <TabsTrigger value="notes" className="gap-1.5"><MessageSquare className="h-3.5 w-3.5" /> Notizen ({contactNotes.length})</TabsTrigger>
                    <TabsTrigger value="calendar" className="gap-1.5"><Calendar className="h-3.5 w-3.5" /> Termine ({contactReminders.length})</TabsTrigger>
                  </TabsList>

                  {/* Info Tab */}
                  <TabsContent value="info" className="space-y-3 mt-3">
                    <div className="grid grid-cols-2 gap-3 text-sm">
                      <div><span className="text-muted-foreground">Straße:</span> <strong>{selectedContact.street} {selectedContact.house_number}</strong></div>
                      <div><span className="text-muted-foreground">PLZ/Ort:</span> <strong>{selectedContact.postal_code} {selectedContact.city}</strong></div>
                      <div><span className="text-muted-foreground">Fax:</span> <strong>{selectedContact.fax || '—'}</strong></div>
                      <div><span className="text-muted-foreground">Penetrationstest:</span> <strong>{selectedContact.penetration_test_date ? fmtDate(selectedContact.penetration_test_date) : '—'}</strong></div>
                      <div><span className="text-muted-foreground">Bedrohungslevel:</span> <strong>{selectedContact.threat_level ? `Level ${selectedContact.threat_level}/5` : '—'}</strong></div>
                      <div><span className="text-muted-foreground">Abo seit:</span> <strong>{selectedContact.subscription_date ? fmtDate(selectedContact.subscription_date) : '—'}</strong></div>
                    </div>
                    {selectedContact.notes && (
                      <div className="bg-muted/50 rounded-lg p-3 mt-3">
                        <p className="text-xs text-muted-foreground mb-1">Notizen:</p>
                        <p className="text-sm whitespace-pre-wrap">{selectedContact.notes}</p>
                      </div>
                    )}
                  </TabsContent>

                  {/* Notes Tab */}
                  <TabsContent value="notes" className="space-y-3 mt-3">
                    <div className="flex gap-2">
                      <Textarea placeholder="Gesprächsnotiz eingeben..." value={newNote} onChange={e => setNewNote(e.target.value)} rows={2} className="flex-1" />
                      <Button onClick={addNote} disabled={!newNote.trim()} className="self-end"><Plus className="h-4 w-4" /></Button>
                    </div>
                    <div className="space-y-2 max-h-[300px] overflow-y-auto">
                      {contactNotes.map(n => (
                        <div key={n.id} className="border rounded-lg p-3">
                          <div className="flex items-center justify-between mb-1">
                            <span className="text-xs font-medium">{n.user?.first_name} {n.user?.last_name}</span>
                            <span className="text-xs text-muted-foreground">{fmtDateTime(n.created_at)}</span>
                          </div>
                          <p className="text-sm whitespace-pre-wrap">{n.note_text}</p>
                        </div>
                      ))}
                      {contactNotes.length === 0 && <p className="text-sm text-muted-foreground text-center py-4">Keine Notizen vorhanden</p>}
                    </div>
                  </TabsContent>

                  {/* Calendar Tab */}
                  <TabsContent value="calendar" className="space-y-3 mt-3">
                    <div className="flex flex-col sm:flex-row gap-2">
                      <Input placeholder="Termin-Titel" value={newReminderTitle} onChange={e => setNewReminderTitle(e.target.value)} className="flex-1" />
                      <Input type="datetime-local" value={newReminderDate} onChange={e => setNewReminderDate(e.target.value)} className="w-full sm:w-auto" />
                      <Button onClick={addReminder} disabled={!newReminderTitle.trim() || !newReminderDate}><Plus className="h-4 w-4" /></Button>
                    </div>
                    <div className="space-y-2 max-h-[300px] overflow-y-auto">
                      {contactReminders.map(r => (
                        <div key={r.id} className={`flex items-center gap-3 border rounded-lg p-3 ${r.is_completed ? 'opacity-50' : ''}`}>
                          <Button size="icon" variant="ghost" className="h-7 w-7 shrink-0" onClick={() => completeReminder(r.id, !r.is_completed)}>
                            {r.is_completed ? <CheckCircle className="h-4 w-4 text-green-500" /> : <Clock className="h-4 w-4 text-orange-500" />}
                          </Button>
                          <div className="flex-1 min-w-0">
                            <p className={`text-sm font-medium ${r.is_completed ? 'line-through' : ''}`}>{r.title}</p>
                            <p className="text-xs text-muted-foreground">{fmtDateTime(r.reminder_date)}</p>
                          </div>
                        </div>
                      ))}
                      {contactReminders.length === 0 && <p className="text-sm text-muted-foreground text-center py-4">Keine Termine vorhanden</p>}
                    </div>
                  </TabsContent>
                </Tabs>
              </>
            )}
          </DialogContent>
        </Dialog>

        {/* ════════════════════════════════════════════ */}
        {/* ── Email Dialog ── */}
        {/* ════════════════════════════════════════════ */}
        <Dialog open={showEmailDialog} onOpenChange={setShowEmailDialog}>
          <DialogContent className="max-w-lg">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2"><Mail className="h-5 w-5" /> E-Mail senden</DialogTitle>
              <DialogDescription>An: {selectedContact?.email}</DialogDescription>
            </DialogHeader>
            <div className="space-y-4">
              <div>
                <Label>Vorlage</Label>
                <Select value={emailTemplate} onValueChange={v => {
                  setEmailTemplate(v);
                  if (v === 'penetration_vollmacht') { setEmailSubject('Vollmacht zum Penetrationstest'); setEmailBody(''); }
                }}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="custom">Eigene Nachricht</SelectItem>
                    <SelectItem value="penetration_vollmacht">📋 Vollmacht Penetrationstest</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              {emailTemplate === 'custom' && (
                <>
                  <div><Label>Betreff</Label><Input value={emailSubject} onChange={e => setEmailSubject(e.target.value)} /></div>
                  <div><Label>Nachricht</Label><Textarea rows={6} value={emailBody} onChange={e => setEmailBody(e.target.value)} placeholder="Ihre Nachricht..." /></div>
                </>
              )}
              {emailTemplate === 'penetration_vollmacht' && (
                <div className="bg-muted/50 rounded-lg p-3 text-sm">
                  <p className="font-medium mb-2">📋 Vollmacht-Vorlage wird gesendet:</p>
                  <p>Enthält alle Informationen zur Durchführung des Penetrationstests inkl. Rücksendeformular.</p>
                </div>
              )}
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setShowEmailDialog(false)}>Abbrechen</Button>
              <Button onClick={sendEmail} disabled={isSending} className="gap-2">
                {isSending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                Senden
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* ════════════════════════════════════════════ */}
        {/* ── Import Dialog ── */}
        {/* ════════════════════════════════════════════ */}
        <Dialog open={showImportDialog} onOpenChange={setShowImportDialog}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2"><Upload className="h-5 w-5" /> CSV Import</DialogTitle>
              <DialogDescription>CSV-Datei mit Semikolon (;) als Trennzeichen hochladen.</DialogDescription>
            </DialogHeader>
            <div className="space-y-3">
              <p className="text-xs text-muted-foreground">
                Spalten: Firmenname; Straße; Hausnr; PLZ; Ort; Telefon; E-Mail; Fax; Notizen
              </p>
              <Input type="file" accept=".csv,.txt" onChange={e => { if (e.target.files?.[0]) importCsv(e.target.files[0]); }} />
            </div>
          </DialogContent>
        </Dialog>
      </div>
    </Layout>
  );
}
