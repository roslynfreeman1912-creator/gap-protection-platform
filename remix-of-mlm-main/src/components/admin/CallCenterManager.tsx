import { useState, useEffect, useCallback } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Progress } from '@/components/ui/progress';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { callcenterApi, securityApi } from '@/lib/securityApi';
import { Building2, Users, Phone, Plus, Edit, Trash2, Loader2, UserPlus, Target, Euro, BarChart3, TrendingUp } from 'lucide-react';

interface CallCenter {
  id: string;
  name: string;
  owner_id: string;
  description: string;
  address: string;
  phone: string;
  email: string;
  is_active: boolean;
  created_at: string;
  owner?: { first_name: string; last_name: string; email: string };
  employee_count?: number;
}

interface Employee {
  id: string;
  call_center_id: string;
  profile_id: string;
  role: string;
  commission_rate: number;
  is_active: boolean;
  hired_at: string;
  profile?: { first_name: string; last_name: string; email: string };
}

interface Lead {
  id: string;
  call_center_id: string;
  assigned_employee_id: string;
  company_name: string;
  contact_person: string;
  email: string;
  phone: string;
  domain: string;
  status: string;
  notes: string;
  last_contact_at: string;
  callback_at: string;
  priority: number;
}

const EMPLOYEE_ROLES = [
  { value: 'agent', label: 'Agent' },
  { value: 'team_leader', label: 'Teamleiter' },
  { value: 'area_manager', label: 'Bereichsleiter' },
  { value: 'regional_director', label: 'Regionalleiter' },
  { value: 'director', label: 'Direktor' }
];

const LEAD_STATUSES = [
  { value: 'new', label: 'Neu', color: 'bg-blue-500' },
  { value: 'contacted', label: 'Kontaktiert', color: 'bg-yellow-500' },
  { value: 'interested', label: 'Interessiert', color: 'bg-green-500' },
  { value: 'negotiation', label: 'Verhandlung', color: 'bg-purple-500' },
  { value: 'won', label: 'Gewonnen', color: 'bg-emerald-500' },
  { value: 'lost', label: 'Verloren', color: 'bg-red-500' },
  { value: 'callback', label: 'Rückruf', color: 'bg-orange-500' }
];

export function CallCenterManager() {
  const { toast } = useToast();
  const [activeTab, setActiveTab] = useState('overview');
  const [callCenters, setCallCenters] = useState<CallCenter[]>([]);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [leads, setLeads] = useState<Lead[]>([]);
  const [partners, setPartners] = useState<any[]>([]);
  const [ccCommissions, setCcCommissions] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [showCenterDialog, setShowCenterDialog] = useState(false);
  const [showEmployeeDialog, setShowEmployeeDialog] = useState(false);
  const [showLeadDialog, setShowLeadDialog] = useState(false);
  const [selectedCenter, setSelectedCenter] = useState<CallCenter | null>(null);
  const [selectedEmployee, setSelectedEmployee] = useState<Employee | null>(null);
  const [selectedLead, setSelectedLead] = useState<Lead | null>(null);

  const [centerForm, setCenterForm] = useState({
    name: '', owner_id: '', description: '', address: '', phone: '', email: ''
  });

  const [employeeForm, setEmployeeForm] = useState({
    call_center_id: '', profile_id: '', role: 'agent', commission_rate: 0,
    parent_employee_id: '', override_rate: 0, level: 1
  });

  const [leadForm, setLeadForm] = useState({
    call_center_id: '', assigned_employee_id: '', company_name: '', contact_person: '',
    email: '', phone: '', domain: '', status: 'new', notes: '', priority: 0
  });

  const loadCallCenters = useCallback(async () => {
    const { data } = await supabase
      .from('call_centers')
      .select('*, owner:profiles!owner_id(first_name, last_name, email)')
      .order('created_at', { ascending: false });
    setCallCenters(data || []);
  }, []);

  const loadEmployees = useCallback(async () => {
    const { data } = await supabase
      .from('call_center_employees')
      .select('*, profile:profiles!profile_id(first_name, last_name, email)')
      .order('created_at', { ascending: false });
    setEmployees(data || []);
  }, []);

  const loadLeads = useCallback(async () => {
    const { data } = await supabase.from('leads').select('*').order('created_at', { ascending: false });
    setLeads(data || []);
  }, []);

  const loadPartners = useCallback(async () => {
    const { data } = await supabase.from('profiles').select('id, first_name, last_name, email').order('last_name');
    setPartners(data || []);
  }, []);

  const loadCcCommissions = useCallback(async () => {
    const { data } = await supabase.from('cc_commissions').select('*').order('created_at', { ascending: false }).limit(100);
    setCcCommissions(data || []);
  }, []);

  const loadData = useCallback(async () => {
    setIsLoading(true);
    await Promise.all([loadCallCenters(), loadEmployees(), loadLeads(), loadPartners(), loadCcCommissions()]);
    setIsLoading(false);
  }, [loadCallCenters, loadEmployees, loadLeads, loadPartners, loadCcCommissions]);

  useEffect(() => { loadData(); }, [loadData]);

  const saveCallCenter = async () => {
    try {
      await callcenterApi.upsertCallcenter(selectedCenter?.id || null, centerForm);
      if (!selectedCenter && centerForm.owner_id) {
        await securityApi.insert('user_roles', { user_id: centerForm.owner_id, role: 'callcenter' });
        const code = 'GP-CC-' + Math.random().toString(36).substring(2, 8).toUpperCase();
        await securityApi.insert('promotion_codes', {
          code, partner_id: centerForm.owner_id,
          is_active: true, usage_count: 0,
        });
      }
      toast({ title: selectedCenter ? 'Call Center aktualisiert' : 'Call Center erstellt', description: selectedCenter ? undefined : 'Dashboard und Promo-Code wurden automatisch zugewiesen.' });
      setShowCenterDialog(false);
      loadCallCenters();
    } catch (error: any) {
      toast({ variant: 'destructive', title: 'Fehler', description: error.message });
    }
  };

  const saveEmployee = async () => {
    try {
      await callcenterApi.upsertEmployee(selectedEmployee?.id || null, employeeForm);
      toast({ title: selectedEmployee ? 'Mitarbeiter aktualisiert' : 'Mitarbeiter hinzugefügt' });
      setShowEmployeeDialog(false);
      loadEmployees();
    } catch (error: any) {
      toast({ variant: 'destructive', title: 'Fehler', description: error.message });
    }
  };

  const saveLead = async () => {
    try {
      await callcenterApi.upsertLead(selectedLead?.id || null, leadForm);
      toast({ title: selectedLead ? 'Lead aktualisiert' : 'Lead erstellt' });
      setShowLeadDialog(false);
      loadLeads();
    } catch (error: any) {
      toast({ variant: 'destructive', title: 'Fehler', description: error.message });
    }
  };

  const deleteCallCenter = async (id: string) => {
    if (!confirm('Call Center wirklich löschen?')) return;
    await callcenterApi.deleteCallcenter(id);
    toast({ title: 'Call Center gelöscht' });
    loadCallCenters();
  };

  const deleteEmployee = async (id: string) => {
    if (!confirm('Mitarbeiter wirklich entfernen?')) return;
    await callcenterApi.deleteEmployee(id);
    toast({ title: 'Mitarbeiter entfernt' });
    loadEmployees();
  };

  const deleteLead = async (id: string) => {
    if (!confirm('Lead wirklich löschen?')) return;
    await callcenterApi.deleteLead(id);
    toast({ title: 'Lead gelöscht' });
    loadLeads();
  };

  const fmt = (n: number) => new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR' }).format(n);

  if (isLoading) {
    return <div className="flex items-center justify-center py-12"><Loader2 className="h-8 w-8 animate-spin" /></div>;
  }

  // Calculate stats
  const totalCcCommissions = ccCommissions.reduce((s, c) => s + Number(c.commission_amount || 0), 0);
  const pendingCcComm = ccCommissions.filter(c => c.status === 'pending').reduce((s, c) => s + Number(c.commission_amount || 0), 0);
  const paidCcComm = ccCommissions.filter(c => c.status === 'paid').reduce((s, c) => s + Number(c.commission_amount || 0), 0);
  const leadsByStatus = LEAD_STATUSES.map(s => ({ ...s, count: leads.filter(l => l.status === s.value).length }));
  const wonLeads = leads.filter(l => l.status === 'won').length;
  const conversionRate = leads.length > 0 ? ((wonLeads / leads.length) * 100).toFixed(1) : '0';

  return (
    <div className="space-y-6">
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="grid grid-cols-5 w-full max-w-2xl">
          <TabsTrigger value="overview" className="flex items-center gap-1.5 text-xs">
            <BarChart3 className="h-3.5 w-3.5" /> Übersicht
          </TabsTrigger>
          <TabsTrigger value="centers" className="flex items-center gap-1.5 text-xs">
            <Building2 className="h-3.5 w-3.5" /> Center ({callCenters.length})
          </TabsTrigger>
          <TabsTrigger value="employees" className="flex items-center gap-1.5 text-xs">
            <Users className="h-3.5 w-3.5" /> Mitarbeiter ({employees.length})
          </TabsTrigger>
          <TabsTrigger value="leads" className="flex items-center gap-1.5 text-xs">
            <Target className="h-3.5 w-3.5" /> Leads ({leads.length})
          </TabsTrigger>
          <TabsTrigger value="commissions" className="flex items-center gap-1.5 text-xs">
            <Euro className="h-3.5 w-3.5" /> Provisionen
          </TabsTrigger>
        </TabsList>

        {/* ═══ OVERVIEW ═══ */}
        <TabsContent value="overview">
          <div className="grid gap-4 grid-cols-2 md:grid-cols-4">
            <Card><CardContent className="p-4"><p className="text-xs text-muted-foreground">Call Center</p><p className="text-2xl font-bold text-primary">{callCenters.length}</p></CardContent></Card>
            <Card><CardContent className="p-4"><p className="text-xs text-muted-foreground">Mitarbeiter</p><p className="text-2xl font-bold">{employees.length}</p><p className="text-xs text-muted-foreground">{employees.filter(e => e.is_active).length} aktiv</p></CardContent></Card>
            <Card><CardContent className="p-4"><p className="text-xs text-muted-foreground">Leads</p><p className="text-2xl font-bold">{leads.length}</p><p className="text-xs text-muted-foreground">{conversionRate}% Conversion</p></CardContent></Card>
            <Card><CardContent className="p-4"><p className="text-xs text-muted-foreground">CC-Provisionen</p><p className="text-2xl font-bold">{fmt(totalCcCommissions)}</p><p className="text-xs text-muted-foreground">{fmt(pendingCcComm)} offen</p></CardContent></Card>
          </div>

          <div className="grid gap-6 md:grid-cols-2 mt-6">
            {/* Lead Pipeline */}
            <Card>
              <CardHeader><CardTitle className="text-base">Lead-Pipeline</CardTitle></CardHeader>
              <CardContent className="space-y-3">
                {leadsByStatus.map(s => (
                  <div key={s.value}>
                    <div className="flex justify-between text-sm mb-1">
                      <span>{s.label}</span><span className="font-medium">{s.count}</span>
                    </div>
                    <Progress value={leads.length > 0 ? (s.count / leads.length) * 100 : 0} className="h-2" />
                  </div>
                ))}
              </CardContent>
            </Card>

            {/* Centers Performance */}
            <Card>
              <CardHeader><CardTitle className="text-base">Center-Leistung</CardTitle></CardHeader>
              <CardContent>
                <Table>
                  <TableHeader><TableRow><TableHead>Center</TableHead><TableHead>Mitarbeiter</TableHead><TableHead>Leads</TableHead><TableHead>Provisionen</TableHead></TableRow></TableHeader>
                  <TableBody>
                    {callCenters.map(cc => {
                      const empCount = employees.filter(e => e.call_center_id === cc.id).length;
                      const leadCount = leads.filter(l => l.call_center_id === cc.id).length;
                      const commTotal = ccCommissions.filter(c => c.call_center_id === cc.id).reduce((s, c) => s + Number(c.commission_amount || 0), 0);
                      return (
                        <TableRow key={cc.id}>
                          <TableCell className="font-medium">{cc.name}</TableCell>
                          <TableCell>{empCount}</TableCell>
                          <TableCell>{leadCount}</TableCell>
                          <TableCell className="font-medium">{fmt(commTotal)}</TableCell>
                        </TableRow>
                      );
                    })}
                    {callCenters.length === 0 && <TableRow><TableCell colSpan={4} className="text-center text-muted-foreground py-6">Keine Center</TableCell></TableRow>}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* ═══ CALL CENTERS ═══ */}
        <TabsContent value="centers">
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div><CardTitle>Call Center verwalten</CardTitle><CardDescription>Alle Call Center und deren Inhaber</CardDescription></div>
                <Button onClick={() => { setSelectedCenter(null); setCenterForm({ name: '', owner_id: '', description: '', address: '', phone: '', email: '' }); setShowCenterDialog(true); }}>
                  <Plus className="h-4 w-4 mr-2" /> Neues Call Center
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader><TableRow><TableHead>Name</TableHead><TableHead>Inhaber</TableHead><TableHead>Kontakt</TableHead><TableHead>Mitarbeiter</TableHead><TableHead>Status</TableHead><TableHead className="text-right">Aktionen</TableHead></TableRow></TableHeader>
                <TableBody>
                  {callCenters.map((center) => (
                    <TableRow key={center.id}>
                      <TableCell className="font-medium">{center.name}</TableCell>
                      <TableCell>{center.owner?.first_name} {center.owner?.last_name}</TableCell>
                      <TableCell><div className="text-sm">{center.phone && <div className="flex items-center gap-1"><Phone className="h-3 w-3" /> {center.phone}</div>}<div className="text-muted-foreground">{center.email}</div></div></TableCell>
                      <TableCell><Badge variant="outline">{employees.filter(e => e.call_center_id === center.id).length} MA</Badge></TableCell>
                      <TableCell><Badge variant={center.is_active ? 'default' : 'secondary'}>{center.is_active ? 'Aktiv' : 'Inaktiv'}</Badge></TableCell>
                      <TableCell className="text-right">
                        <Button size="sm" variant="ghost" onClick={() => { setSelectedCenter(center); setCenterForm(center as any); setShowCenterDialog(true); }}><Edit className="h-4 w-4" /></Button>
                        <Button size="sm" variant="ghost" onClick={() => deleteCallCenter(center.id)}><Trash2 className="h-4 w-4" /></Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ═══ EMPLOYEES ═══ */}
        <TabsContent value="employees">
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div><CardTitle>Mitarbeiter verwalten</CardTitle><CardDescription>Alle Call Center Mitarbeiter</CardDescription></div>
                <Button onClick={() => { setSelectedEmployee(null); setEmployeeForm({ call_center_id: '', profile_id: '', role: 'agent', commission_rate: 0, parent_employee_id: '', override_rate: 0, level: 1 }); setShowEmployeeDialog(true); }}>
                  <UserPlus className="h-4 w-4 mr-2" /> Mitarbeiter hinzufügen
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader><TableRow><TableHead>Name</TableHead><TableHead>Call Center</TableHead><TableHead>Rolle</TableHead><TableHead>Provision</TableHead><TableHead>Status</TableHead><TableHead className="text-right">Aktionen</TableHead></TableRow></TableHeader>
                <TableBody>
                  {employees.map((employee) => {
                    const center = callCenters.find(c => c.id === employee.call_center_id);
                    return (
                      <TableRow key={employee.id}>
                        <TableCell className="font-medium">{employee.profile?.first_name} {employee.profile?.last_name}</TableCell>
                        <TableCell>{center?.name || '-'}</TableCell>
                        <TableCell><Badge variant="outline">{EMPLOYEE_ROLES.find(r => r.value === employee.role)?.label}</Badge></TableCell>
                        <TableCell>{employee.commission_rate}%</TableCell>
                        <TableCell><Badge variant={employee.is_active ? 'default' : 'secondary'}>{employee.is_active ? 'Aktiv' : 'Inaktiv'}</Badge></TableCell>
                        <TableCell className="text-right">
                          <Button size="sm" variant="ghost" onClick={() => { setSelectedEmployee(employee); setEmployeeForm(employee as any); setShowEmployeeDialog(true); }}><Edit className="h-4 w-4" /></Button>
                          <Button size="sm" variant="ghost" onClick={() => deleteEmployee(employee.id)}><Trash2 className="h-4 w-4" /></Button>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ═══ LEADS ═══ */}
        <TabsContent value="leads">
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div><CardTitle>Leads verwalten</CardTitle><CardDescription>Potenzielle Kunden für Outbound-Anrufe</CardDescription></div>
                <Button onClick={() => { setSelectedLead(null); setLeadForm({ call_center_id: '', assigned_employee_id: '', company_name: '', contact_person: '', email: '', phone: '', domain: '', status: 'new', notes: '', priority: 0 }); setShowLeadDialog(true); }}>
                  <Plus className="h-4 w-4 mr-2" /> Neuer Lead
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader><TableRow><TableHead>Firma</TableHead><TableHead>Kontakt</TableHead><TableHead>Domain</TableHead><TableHead>Status</TableHead><TableHead>Priorität</TableHead><TableHead className="text-right">Aktionen</TableHead></TableRow></TableHeader>
                <TableBody>
                  {leads.map((lead) => {
                    const status = LEAD_STATUSES.find(s => s.value === lead.status);
                    return (
                      <TableRow key={lead.id}>
                        <TableCell className="font-medium">{lead.company_name || '-'}</TableCell>
                        <TableCell><div className="text-sm"><div>{lead.contact_person}</div><div className="text-muted-foreground">{lead.phone}</div></div></TableCell>
                        <TableCell>{lead.domain || '-'}</TableCell>
                        <TableCell><Badge className={status?.color}>{status?.label}</Badge></TableCell>
                        <TableCell><Badge variant="outline">{lead.priority}</Badge></TableCell>
                        <TableCell className="text-right">
                          <Button size="sm" variant="ghost" onClick={() => { setSelectedLead(lead); setLeadForm(lead as any); setShowLeadDialog(true); }}><Edit className="h-4 w-4" /></Button>
                          <Button size="sm" variant="ghost" onClick={() => deleteLead(lead.id)}><Trash2 className="h-4 w-4" /></Button>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ═══ COMMISSIONS ═══ */}
        <TabsContent value="commissions">
          <div className="grid gap-4 grid-cols-3 mb-6">
            <Card><CardContent className="p-4"><p className="text-xs text-muted-foreground">Ausstehend</p><p className="text-2xl font-bold text-yellow-500">{fmt(pendingCcComm)}</p></CardContent></Card>
            <Card><CardContent className="p-4"><p className="text-xs text-muted-foreground">Ausgezahlt</p><p className="text-2xl font-bold text-green-500">{fmt(paidCcComm)}</p></CardContent></Card>
            <Card><CardContent className="p-4"><p className="text-xs text-muted-foreground">Gesamt</p><p className="text-2xl font-bold text-primary">{fmt(totalCcCommissions)}</p></CardContent></Card>
          </div>
          <Card>
            <CardHeader><CardTitle>CC-Provisionen</CardTitle><CardDescription>Alle Call Center Provisionen</CardDescription></CardHeader>
            <CardContent>
              <Table>
                <TableHeader><TableRow><TableHead>Datum</TableHead><TableHead>Center</TableHead><TableHead>Typ</TableHead><TableHead>Betrag</TableHead><TableHead>Provision</TableHead><TableHead>Status</TableHead></TableRow></TableHeader>
                <TableBody>
                  {ccCommissions.length === 0 ? (
                    <TableRow><TableCell colSpan={6} className="text-center py-6 text-muted-foreground">Keine Provisionen</TableCell></TableRow>
                  ) : ccCommissions.slice(0, 50).map(c => {
                    const center = callCenters.find(cc => cc.id === c.call_center_id);
                    return (
                      <TableRow key={c.id}>
                        <TableCell className="text-sm">{new Date(c.created_at).toLocaleDateString('de-DE')}</TableCell>
                        <TableCell>{center?.name || '-'}</TableCell>
                        <TableCell><Badge variant="outline">{c.commission_type}</Badge></TableCell>
                        <TableCell>{fmt(c.base_amount)}</TableCell>
                        <TableCell className="font-medium">{fmt(c.commission_amount)}</TableCell>
                        <TableCell><Badge variant={c.status === 'paid' ? 'default' : 'secondary'}>{c.status === 'paid' ? 'Ausgezahlt' : 'Ausstehend'}</Badge></TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* ═══ DIALOGS ═══ */}
      {/* Call Center Dialog */}
      <Dialog open={showCenterDialog} onOpenChange={setShowCenterDialog}>
        <DialogContent>
          <DialogHeader><DialogTitle>{selectedCenter ? 'Call Center bearbeiten' : 'Neues Call Center'}</DialogTitle></DialogHeader>
          <div className="grid gap-4 py-4">
            <div><Label>Name</Label><Input value={centerForm.name} onChange={e => setCenterForm(f => ({ ...f, name: e.target.value }))} /></div>
            <div>
              <Label>Inhaber</Label>
              <Select value={centerForm.owner_id} onValueChange={v => setCenterForm(f => ({ ...f, owner_id: v }))}>
                <SelectTrigger><SelectValue placeholder="Inhaber wählen" /></SelectTrigger>
                <SelectContent>{partners.map(p => <SelectItem key={p.id} value={p.id}>{p.first_name} {p.last_name} ({p.email})</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div><Label>Beschreibung</Label><Input value={centerForm.description} onChange={e => setCenterForm(f => ({ ...f, description: e.target.value }))} /></div>
            <div className="grid grid-cols-2 gap-4">
              <div><Label>Telefon</Label><Input value={centerForm.phone} onChange={e => setCenterForm(f => ({ ...f, phone: e.target.value }))} /></div>
              <div><Label>E-Mail</Label><Input value={centerForm.email} onChange={e => setCenterForm(f => ({ ...f, email: e.target.value }))} /></div>
            </div>
            <div><Label>Adresse</Label><Input value={centerForm.address} onChange={e => setCenterForm(f => ({ ...f, address: e.target.value }))} /></div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowCenterDialog(false)}>Abbrechen</Button>
            <Button onClick={saveCallCenter}>Speichern</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Employee Dialog */}
      <Dialog open={showEmployeeDialog} onOpenChange={setShowEmployeeDialog}>
        <DialogContent>
          <DialogHeader><DialogTitle>{selectedEmployee ? 'Mitarbeiter bearbeiten' : 'Neuer Mitarbeiter'}</DialogTitle></DialogHeader>
          <div className="grid gap-4 py-4">
            <div>
              <Label>Call Center</Label>
              <Select value={employeeForm.call_center_id} onValueChange={v => setEmployeeForm(f => ({ ...f, call_center_id: v }))}>
                <SelectTrigger><SelectValue placeholder="Center wählen" /></SelectTrigger>
                <SelectContent>{callCenters.map(cc => <SelectItem key={cc.id} value={cc.id}>{cc.name}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div>
              <Label>Person</Label>
              <Select value={employeeForm.profile_id} onValueChange={v => setEmployeeForm(f => ({ ...f, profile_id: v }))}>
                <SelectTrigger><SelectValue placeholder="Person wählen" /></SelectTrigger>
                <SelectContent>{partners.map(p => <SelectItem key={p.id} value={p.id}>{p.first_name} {p.last_name}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>Rolle</Label>
                <Select value={employeeForm.role} onValueChange={v => setEmployeeForm(f => ({ ...f, role: v }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{EMPLOYEE_ROLES.map(r => <SelectItem key={r.value} value={r.value}>{r.label}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div><Label>Provision (%)</Label><Input type="number" value={employeeForm.commission_rate} onChange={e => setEmployeeForm(f => ({ ...f, commission_rate: Number(e.target.value) }))} /></div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div><Label>Level</Label><Input type="number" value={employeeForm.level} onChange={e => setEmployeeForm(f => ({ ...f, level: Number(e.target.value) }))} /></div>
              <div><Label>Override (%)</Label><Input type="number" value={employeeForm.override_rate} onChange={e => setEmployeeForm(f => ({ ...f, override_rate: Number(e.target.value) }))} /></div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowEmployeeDialog(false)}>Abbrechen</Button>
            <Button onClick={saveEmployee}>Speichern</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Lead Dialog */}
      <Dialog open={showLeadDialog} onOpenChange={setShowLeadDialog}>
        <DialogContent>
          <DialogHeader><DialogTitle>{selectedLead ? 'Lead bearbeiten' : 'Neuer Lead'}</DialogTitle></DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid grid-cols-2 gap-4">
              <div><Label>Firma</Label><Input value={leadForm.company_name} onChange={e => setLeadForm(f => ({ ...f, company_name: e.target.value }))} /></div>
              <div><Label>Ansprechpartner</Label><Input value={leadForm.contact_person} onChange={e => setLeadForm(f => ({ ...f, contact_person: e.target.value }))} /></div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div><Label>E-Mail</Label><Input value={leadForm.email} onChange={e => setLeadForm(f => ({ ...f, email: e.target.value }))} /></div>
              <div><Label>Telefon</Label><Input value={leadForm.phone} onChange={e => setLeadForm(f => ({ ...f, phone: e.target.value }))} /></div>
            </div>
            <div><Label>Domain</Label><Input value={leadForm.domain} onChange={e => setLeadForm(f => ({ ...f, domain: e.target.value }))} /></div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>Call Center</Label>
                <Select value={leadForm.call_center_id} onValueChange={v => setLeadForm(f => ({ ...f, call_center_id: v }))}>
                  <SelectTrigger><SelectValue placeholder="Center" /></SelectTrigger>
                  <SelectContent>{callCenters.map(cc => <SelectItem key={cc.id} value={cc.id}>{cc.name}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div>
                <Label>Status</Label>
                <Select value={leadForm.status} onValueChange={v => setLeadForm(f => ({ ...f, status: v }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{LEAD_STATUSES.map(s => <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>)}</SelectContent>
                </Select>
              </div>
            </div>
            <div><Label>Notizen</Label><Input value={leadForm.notes} onChange={e => setLeadForm(f => ({ ...f, notes: e.target.value }))} /></div>
            <div><Label>Priorität</Label><Input type="number" value={leadForm.priority} onChange={e => setLeadForm(f => ({ ...f, priority: Number(e.target.value) }))} /></div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowLeadDialog(false)}>Abbrechen</Button>
            <Button onClick={saveLead}>Speichern</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
