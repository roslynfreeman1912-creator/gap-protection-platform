import { useEffect, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { Layout } from '@/components/layout/Layout';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { supabase } from '@/integrations/supabase/client';
import { Building2, Euro, TrendingUp, Loader2, Shield, Plus, Percent } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

export default function BrokerDashboard() {
  const { user, loading: authLoading, hasAnyRole } = useAuth();
  const navigate = useNavigate();
  const { toast } = useToast();

  const [dashboard, setDashboard] = useState<any>(null);
  const [callCenters, setCallCenters] = useState<any[]>([]);
  const [commissions, setCommissions] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [createCCOpen, setCreateCCOpen] = useState(false);
  const [ccForm, setCCForm] = useState({ name: '', email: '', phone: '', commission_rate: '5' });
  const [creatingCC, setCreatingCC] = useState(false);
  const [commissionEdit, setCommissionEdit] = useState<{ id: string; rate: string } | null>(null);

  useEffect(() => {
    if (!authLoading && !user) navigate('/auth');
    if (!authLoading && user && !hasAnyRole(['cc_broker', 'admin', 'super_admin'])) navigate('/dashboard');
  }, [user, authLoading, navigate, hasAnyRole]);

  const callFunction = useCallback(async (body: object) => {
    const { data: { session } } = await supabase.auth.getSession();
    const url = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/broker-dashboard`;
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${session?.access_token}`,
        'apikey': import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Fehler');
    return data;
  }, []);

  const loadAll = useCallback(async () => {
    setIsLoading(true);
    try {
      const [statsRes, ccRes, commRes] = await Promise.all([
        callFunction({ action: 'stats' }),
        callFunction({ action: 'list_callcenters' }),
        callFunction({ action: 'list_commissions' }),
      ]);
      setDashboard(statsRes.dashboard);
      setCallCenters(ccRes.callCenters || []);
      setCommissions(commRes.commissions || []);
    } catch (e: any) {
      toast({ variant: 'destructive', title: 'Fehler', description: e.message });
    } finally {
      setIsLoading(false);
    }
  }, [callFunction, toast]);

  useEffect(() => {
    if (user) loadAll();
  }, [user, loadAll]);

  const createCallCenter = async () => {
    if (!ccForm.name) {
      toast({ variant: 'destructive', title: 'Fehler', description: 'Name ist erforderlich' });
      return;
    }
    setCreatingCC(true);
    try {
      await callFunction({ action: 'create_callcenter', ...ccForm, commission_rate: parseFloat(ccForm.commission_rate) || 0 });
      toast({ title: 'Call Center angelegt' });
      setCreateCCOpen(false);
      setCCForm({ name: '', email: '', phone: '', commission_rate: '5' });
      loadAll();
    } catch (e: any) {
      toast({ variant: 'destructive', title: 'Fehler', description: e.message });
    } finally {
      setCreatingCC(false);
    }
  };

  const saveCommission = async (ccId: string, rate: string) => {
    try {
      await callFunction({ action: 'set_commission', call_center_id: ccId, commission_rate: parseFloat(rate) || 0 });
      toast({ title: 'Provision gespeichert' });
      setCommissionEdit(null);
      loadAll();
    } catch (e: any) {
      toast({ variant: 'destructive', title: 'Fehler', description: e.message });
    }
  };

  if (authLoading || isLoading) {
    return (
      <Layout>
        <div className="container py-8 flex items-center justify-center min-h-[60vh]">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      </Layout>
    );
  }

  return (
    <Layout>
      <div className="container px-4 sm:px-6 py-6 sm:py-8 space-y-6">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h1 className="text-2xl md:text-3xl font-bold flex items-center gap-3">
              <Shield className="h-7 w-7 text-primary" />
              Broker Dashboard
            </h1>
            <p className="text-muted-foreground mt-1">
              Vermittler-Übersicht — Ihre Call Center und Provisionen
            </p>
          </div>
          {dashboard && (
            <Badge variant="outline" className="text-sm px-3 py-1 self-start">
              #{dashboard.broker_number}
            </Badge>
          )}
        </div>

        {/* Stats */}
        {dashboard && (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            <Card>
              <CardContent className="pt-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-muted-foreground">Call Center</p>
                    <p className="text-3xl font-bold">{dashboard.total_call_centers}</p>
                  </div>
                  <Building2 className="h-8 w-8 text-blue-500" />
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-muted-foreground">Mitarbeiter gesamt</p>
                    <p className="text-3xl font-bold">{dashboard.total_employees}</p>
                  </div>
                  <TrendingUp className="h-8 w-8 text-green-500" />
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-muted-foreground">Offene Provisionen</p>
                    <p className="text-3xl font-bold">€{Number(dashboard.pending_commissions).toLocaleString('de-DE')}</p>
                  </div>
                  <Euro className="h-8 w-8 text-yellow-500" />
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-muted-foreground">Ausgezahlte Provisionen</p>
                    <p className="text-3xl font-bold">€{Number(dashboard.paid_commissions).toLocaleString('de-DE')}</p>
                  </div>
                  <Euro className="h-8 w-8 text-emerald-500" />
                </div>
              </CardContent>
            </Card>
          </div>
        )}

        {/* Tabs */}
        <Tabs defaultValue="callcenters" className="space-y-4">
          <TabsList>
            <TabsTrigger value="callcenters" className="flex items-center gap-2">
              <Building2 className="h-4 w-4" />
              Meine Call Center ({callCenters.length})
            </TabsTrigger>
            <TabsTrigger value="commissions" className="flex items-center gap-2">
              <Euro className="h-4 w-4" />
              Provisionen ({commissions.length})
            </TabsTrigger>
          </TabsList>

          {/* Call Centers Tab */}
          <TabsContent value="callcenters">
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle>Meine Call Center</CardTitle>
                    <CardDescription>Alle von Ihnen vermittelten Call Center</CardDescription>
                  </div>
                  <Dialog open={createCCOpen} onOpenChange={setCreateCCOpen}>
                    <DialogTrigger asChild>
                      <Button size="sm" className="flex items-center gap-2">
                        <Plus className="h-4 w-4" />
                        Call Center anlegen
                      </Button>
                    </DialogTrigger>
                    <DialogContent>
                      <DialogHeader>
                        <DialogTitle>Neues Call Center anlegen</DialogTitle>
                      </DialogHeader>
                      <div className="space-y-4 pt-2">
                        <div>
                          <Label>Name *</Label>
                          <Input value={ccForm.name} onChange={e => setCCForm(f => ({ ...f, name: e.target.value }))} />
                        </div>
                        <div>
                          <Label>E-Mail</Label>
                          <Input type="email" value={ccForm.email} onChange={e => setCCForm(f => ({ ...f, email: e.target.value }))} />
                        </div>
                        <div>
                          <Label>Telefon</Label>
                          <Input value={ccForm.phone} onChange={e => setCCForm(f => ({ ...f, phone: e.target.value }))} />
                        </div>
                        <div>
                          <Label>Ihre Provision (%)</Label>
                          <Input type="number" min="0" max="100" value={ccForm.commission_rate} onChange={e => setCCForm(f => ({ ...f, commission_rate: e.target.value }))} />
                        </div>
                        <Button className="w-full" onClick={createCallCenter} disabled={creatingCC}>
                          {creatingCC ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
                          Anlegen
                        </Button>
                      </div>
                    </DialogContent>
                  </Dialog>
                </div>
              </CardHeader>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Name</TableHead>
                      <TableHead>E-Mail</TableHead>
                      <TableHead>Provision</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Erstellt</TableHead>
                      <TableHead></TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {callCenters.map((cc: any) => (
                      <TableRow key={cc.id}>
                        <TableCell className="font-medium">{cc.name}</TableCell>
                        <TableCell className="text-muted-foreground">{cc.email || '-'}</TableCell>
                        <TableCell>
                          {commissionEdit?.id === cc.id ? (
                            <div className="flex items-center gap-2">
                              <Input
                                type="number" min="0" max="100"
                                className="w-20 h-7 text-sm"
                                value={commissionEdit?.rate ?? ''}
                                onChange={e => setCommissionEdit(c => c ? { ...c, rate: e.target.value } : null)}
                              />
                              <Button size="sm" variant="default" className="h-7 px-2" onClick={() => commissionEdit && saveCommission(cc.id, commissionEdit.rate)}>✓</Button>
                              <Button size="sm" variant="ghost" className="h-7 px-2" onClick={() => setCommissionEdit(null)}>✕</Button>
                            </div>
                          ) : (
                            <div className="flex items-center gap-2">
                              <span>{cc.broker_commission_rate || 0}%</span>
                              <Button size="sm" variant="ghost" className="h-6 w-6 p-0" onClick={() => setCommissionEdit({ id: cc.id, rate: String(cc.broker_commission_rate || 0) })}>
                                <Percent className="h-3 w-3" />
                              </Button>
                            </div>
                          )}
                        </TableCell>
                        <TableCell>
                          <Badge variant={cc.is_active ? 'default' : 'secondary'}>
                            {cc.is_active ? 'Aktiv' : 'Inaktiv'}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-muted-foreground text-sm">
                          {new Date(cc.created_at).toLocaleDateString('de-DE')}
                        </TableCell>
                        <TableCell>
                          <Button size="sm" variant="outline" onClick={() => navigate(`/callcenter?cc=${cc.id}`)}>
                            Verwalten
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                    {callCenters.length === 0 && (
                      <TableRow>
                        <TableCell colSpan={6} className="text-center text-muted-foreground py-8">
                          Noch keine Call Center angelegt
                        </TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Commissions Tab */}
          <TabsContent value="commissions">
            <Card>
              <CardHeader>
                <CardTitle>Provisionsübersicht</CardTitle>
                <CardDescription>Ihre Provisionen aus allen Call Centern</CardDescription>
              </CardHeader>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Call Center</TableHead>
                      <TableHead>Basisbetrag</TableHead>
                      <TableHead>Provision %</TableHead>
                      <TableHead>Betrag</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Datum</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {commissions.map((c: any) => (
                      <TableRow key={c.id}>
                        <TableCell className="font-medium">{c.call_center?.name || '-'}</TableCell>
                        <TableCell>€{Number(c.base_amount).toLocaleString('de-DE')}</TableCell>
                        <TableCell>{c.commission_rate}%</TableCell>
                        <TableCell className="font-bold text-green-600">
                          €{Number(c.commission_amount).toLocaleString('de-DE', { minimumFractionDigits: 2 })}
                        </TableCell>
                        <TableCell>
                          <Badge variant={c.status === 'paid' ? 'default' : c.status === 'pending' ? 'secondary' : 'outline'}>
                            {c.status === 'paid' ? 'Ausgezahlt' : c.status === 'pending' ? 'Ausstehend' : c.status}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-muted-foreground text-sm">
                          {new Date(c.created_at).toLocaleDateString('de-DE')}
                        </TableCell>
                      </TableRow>
                    ))}
                    {commissions.length === 0 && (
                      <TableRow>
                        <TableCell colSpan={6} className="text-center text-muted-foreground py-8">
                          Keine Provisionen vorhanden
                        </TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </Layout>
  );
}
