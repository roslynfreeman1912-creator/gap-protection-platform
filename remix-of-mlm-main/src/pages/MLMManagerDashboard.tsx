import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useToast } from '@/hooks/use-toast';
import {
  Users, Euro, TrendingUp, Award, CheckCircle, XCircle,
  Search, RefreshCw, Download, UserCheck, Wallet, Star
} from 'lucide-react';

interface Partner {
  id: string;
  first_name: string;
  last_name: string;
  email: string;
  partner_number: string;
  promotion_code: string;
  role: string;
  status: string;
  iban: string | null;
  address: string | null;
  created_at: string;
  sponsor_id: string | null;
}

interface Commission {
  id: string;
  partner_id: string;
  commission_amount: number;
  commission_type: string;
  level_number: number;
  status: string;
  created_at: string;
  partner: { first_name: string; last_name: string; partner_number: string } | null;
}

interface WalletData {
  profile_id: string;
  available_balance: number;
  pending_balance: number;
  total_earned: number;
  total_withdrawn: number;
}

export default function MLMManagerDashboard() {
  const { profile } = useAuth();
  const { toast } = useToast();
  const [partners, setPartners] = useState<Partner[]>([]);
  const [commissions, setCommissions] = useState<Commission[]>([]);
  const [wallets, setWallets] = useState<WalletData[]>([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState({
    totalPartners: 0,
    activePartners: 0,
    pendingCommissions: 0,
    totalPaidOut: 0,
    pendingBonuses: 0,
  });

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const db = supabase as any;

      const [partnersRes, commissionsRes, walletsRes, bonusRes] = await Promise.all([
        db.from('profiles')
          .select('id, first_name, last_name, email, partner_number, promotion_code, role, status, iban, address, created_at, sponsor_id')
          .in('role', ['partner', 'mlm_manager', 'verkaufsleiter', 'agent'])
          .order('created_at', { ascending: false }),
        db.from('commissions')
          .select('id, partner_id, commission_amount, commission_type, level_number, status, created_at')
          .order('created_at', { ascending: false })
          .limit(100),
        db.from('wallets')
          .select('profile_id, available_balance, pending_balance, total_earned, total_withdrawn'),
        db.from('first_sale_bonuses')
          .select('id, partner_id, bonus_amount, status')
          .eq('status', 'pending'),
      ]);

      const p = partnersRes.data || [];
      const c = commissionsRes.data || [];
      const w = walletsRes.data || [];
      const b = bonusRes.data || [];

      setPartners(p as Partner[]);
      setCommissions(c as Commission[]);
      setWallets(w as WalletData[]);

      const pendingComm = c.filter(x => x.status === 'pending').reduce((s, x) => s + Number(x.commission_amount), 0);
      const totalPaid = c.filter(x => x.status === 'paid').reduce((s, x) => s + Number(x.commission_amount), 0);
      const pendingBonus = b.reduce((s, x) => s + Number(x.bonus_amount), 0);

      setStats({
        totalPartners: p.length,
        activePartners: p.filter(x => x.status === 'active').length,
        pendingCommissions: pendingComm,
        totalPaidOut: totalPaid,
        pendingBonuses: pendingBonus,
      });
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadData(); }, [loadData]);

  const approveCommission = async (id: string) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error } = await (supabase as any).from('commissions').update({ status: 'approved' }).eq('id', id);
    if (error) {
      toast({ title: 'Fehler', description: error.message, variant: 'destructive' });
    } else {
      toast({ title: 'Genehmigt', description: 'Provision wurde genehmigt.' });
      loadData();
    }
  };

  const reassignPartner = async (partnerId: string, newSponsorCode: string) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const db = supabase as any;
    const { data: sponsor } = await db
      .from('profiles')
      .select('id')
      .eq('promotion_code', newSponsorCode)
      .single();

    if (!sponsor) {
      toast({ title: 'Fehler', description: 'Sponsor-Code nicht gefunden.', variant: 'destructive' });
      return;
    }

    const { error } = await db.from('profiles').update({ sponsor_id: sponsor.id }).eq('id', partnerId);
    if (error) {
      toast({ title: 'Fehler', description: error.message, variant: 'destructive' });
    } else {
      toast({ title: 'Umgeteilt', description: 'Partner wurde neu zugewiesen.' });
      loadData();
    }
  };

  const fmt = (n: number) => new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR' }).format(n);

  const filteredPartners = partners.filter(p =>
    `${p.first_name} ${p.last_name} ${p.email} ${p.partner_number} ${p.promotion_code}`
      .toLowerCase().includes(search.toLowerCase())
  );

  const getWallet = (profileId: string) => wallets.find(w => w.profile_id === profileId);

  const roleBadge = (role: string) => {
    const map: Record<string, string> = {
      mlm_manager: 'bg-purple-100 text-purple-800',
      verkaufsleiter: 'bg-blue-100 text-blue-800',
      agent: 'bg-green-100 text-green-800',
      partner: 'bg-gray-100 text-gray-800',
    };
    return map[role] || 'bg-gray-100 text-gray-800';
  };

  return (
    <div className="min-h-screen bg-gray-50 p-6">
      <div className="max-w-7xl mx-auto space-y-6">

        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">MLM Manager Dashboard</h1>
            <p className="text-gray-500 text-sm">Vollständige Übersicht — Provisionen, Partner, Zahlungen</p>
          </div>
          <Button onClick={loadData} variant="outline" size="sm">
            <RefreshCw className="h-4 w-4 mr-2" /> Aktualisieren
          </Button>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
          {[
            { label: 'Partner gesamt', value: stats.totalPartners, icon: Users, color: 'text-blue-600' },
            { label: 'Aktive Partner', value: stats.activePartners, icon: UserCheck, color: 'text-green-600' },
            { label: 'Offene Provisionen', value: fmt(stats.pendingCommissions), icon: Euro, color: 'text-orange-600' },
            { label: 'Ausgezahlt gesamt', value: fmt(stats.totalPaidOut), icon: TrendingUp, color: 'text-purple-600' },
            { label: 'Offene Boni (50€)', value: fmt(stats.pendingBonuses), icon: Star, color: 'text-yellow-600' },
          ].map((s, i) => (
            <Card key={i}>
              <CardContent className="pt-4 pb-3">
                <div className="flex items-center gap-2">
                  <s.icon className={`h-5 w-5 ${s.color}`} />
                  <div>
                    <p className="text-xs text-gray-500">{s.label}</p>
                    <p className="font-bold text-sm">{s.value}</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>

        {/* Tabs */}
        <Tabs defaultValue="partners">
          <TabsList>
            <TabsTrigger value="partners">Partner</TabsTrigger>
            <TabsTrigger value="commissions">Provisionen</TabsTrigger>
            <TabsTrigger value="bonuses">Abschlussboni (50€)</TabsTrigger>
          </TabsList>

          {/* Partners Tab */}
          <TabsContent value="partners" className="space-y-4">
            <div className="flex gap-2">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-2.5 h-4 w-4 text-gray-400" />
                <Input
                  placeholder="Suche nach Name, E-Mail, Partner-Nr., Promo-Code..."
                  value={search}
                  onChange={e => setSearch(e.target.value)}
                  className="pl-9"
                />
              </div>
            </div>

            <div className="bg-white rounded-lg border overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 border-b">
                  <tr>
                    {['Name', 'E-Mail', 'Partner-Nr.', 'Promo-Code', 'Rolle', 'Status', 'Wallet', 'Aktionen'].map(h => (
                      <th key={h} className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {filteredPartners.map(p => {
                    const wallet = getWallet(p.id);
                    return (
                      <tr key={p.id} className="hover:bg-gray-50">
                        <td className="px-4 py-3 font-medium">{p.first_name} {p.last_name}</td>
                        <td className="px-4 py-3 text-gray-500">{p.email}</td>
                        <td className="px-4 py-3 font-mono text-xs">{p.partner_number || '—'}</td>
                        <td className="px-4 py-3 font-mono text-xs text-blue-600">{p.promotion_code || '—'}</td>
                        <td className="px-4 py-3">
                          <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${roleBadge(p.role)}`}>
                            {p.role}
                          </span>
                        </td>
                        <td className="px-4 py-3">
                          <Badge variant={p.status === 'active' ? 'default' : 'secondary'}>
                            {p.status}
                          </Badge>
                        </td>
                        <td className="px-4 py-3 text-right">
                          {wallet ? (
                            <span className="text-green-600 font-medium">{fmt(wallet.available_balance)}</span>
                          ) : '—'}
                        </td>
                        <td className="px-4 py-3">
                          <ReassignButton partnerId={p.id} onReassign={reassignPartner} />
                        </td>
                      </tr>
                    );
                  })}
                  {filteredPartners.length === 0 && (
                    <tr><td colSpan={8} className="px-4 py-8 text-center text-gray-400">Keine Partner gefunden</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </TabsContent>

          {/* Commissions Tab */}
          <TabsContent value="commissions" className="space-y-4">
            <div className="bg-white rounded-lg border overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 border-b">
                  <tr>
                    {['Partner', 'Betrag', 'Typ', 'Ebene', 'Status', 'Datum', 'Aktion'].map(h => (
                      <th key={h} className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {commissions.map(c => (
                    <tr key={c.id} className="hover:bg-gray-50">
                      <td className="px-4 py-3">
                        {c.partner ? `${c.partner.first_name} ${c.partner.last_name}` : c.partner_id.slice(0, 8)}
                        {c.partner?.partner_number && (
                          <span className="ml-1 text-xs text-gray-400">#{c.partner.partner_number}</span>
                        )}
                      </td>
                      <td className="px-4 py-3 font-medium text-green-600">{fmt(c.commission_amount)}</td>
                      <td className="px-4 py-3">
                        <Badge variant="outline" className="text-xs">
                          {c.commission_type === 'one_time_bonus' ? '🎁 Bonus' : `Ebene ${c.level_number}`}
                        </Badge>
                      </td>
                      <td className="px-4 py-3 text-gray-500">
                        {c.level_number === 0 ? 'Abschlussbonus' : `L${c.level_number}`}
                      </td>
                      <td className="px-4 py-3">
                        <Badge variant={
                          c.status === 'paid' ? 'default' :
                          c.status === 'approved' ? 'secondary' : 'outline'
                        }>
                          {c.status}
                        </Badge>
                      </td>
                      <td className="px-4 py-3 text-gray-400 text-xs">
                        {new Date(c.created_at).toLocaleDateString('de-DE')}
                      </td>
                      <td className="px-4 py-3">
                        {c.status === 'pending' && (
                          <Button size="sm" variant="outline" onClick={() => approveCommission(c.id)}>
                            <CheckCircle className="h-3 w-3 mr-1" /> Genehmigen
                          </Button>
                        )}
                      </td>
                    </tr>
                  ))}
                  {commissions.length === 0 && (
                    <tr><td colSpan={7} className="px-4 py-8 text-center text-gray-400">Keine Provisionen</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </TabsContent>

          {/* Bonuses Tab */}
          <TabsContent value="bonuses">
            <BonusesTab onRefresh={loadData} fmt={fmt} />
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}

// Inline component for reassign button
function ReassignButton({ partnerId, onReassign }: { partnerId: string; onReassign: (id: string, code: string) => void }) {
  const [open, setOpen] = useState(false);
  const [code, setCode] = useState('');
  if (!open) return (
    <Button size="sm" variant="ghost" onClick={() => setOpen(true)}>Umteilen</Button>
  );
  return (
    <div className="flex gap-1">
      <Input value={code} onChange={e => setCode(e.target.value)} placeholder="Promo-Code" className="h-7 text-xs w-24" />
      <Button size="sm" className="h-7 text-xs" onClick={() => { onReassign(partnerId, code); setOpen(false); }}>OK</Button>
      <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => setOpen(false)}>✕</Button>
    </div>
  );
}

// Bonuses tab component
function BonusesTab({ onRefresh, fmt }: { onRefresh: () => void; fmt: (n: number) => string }) {
  const { toast } = useToast();
  const [bonuses, setBonuses] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const db = supabase as any;
    const { data } = await db
      .from('first_sale_bonuses')
      .select('*, partner:profiles!partner_id(first_name, last_name, partner_number, iban)')
      .order('created_at', { ascending: false });
    setBonuses(data || []);
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const markPaid = async (id: string) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const db = supabase as any;
    const { error } = await db.from('first_sale_bonuses')
      .update({ status: 'paid', paid_at: new Date().toISOString() }).eq('id', id);
    if (error) {
      toast({ title: 'Fehler', description: error.message, variant: 'destructive' });
    } else {
      toast({ title: 'Bezahlt', description: '50€ Abschlussbonus als bezahlt markiert.' });
      load(); onRefresh();
    }
  };

  return (
    <div className="bg-white rounded-lg border overflow-hidden">
      <div className="px-4 py-3 border-b bg-yellow-50">
        <p className="text-sm font-medium text-yellow-800">
          Einmalige Abschlussprämie: 50 € pro Partner beim ersten Verkauf
        </p>
      </div>
      <table className="w-full text-sm">
        <thead className="bg-gray-50 border-b">
          <tr>
            {['Partner', 'Partner-Nr.', 'IBAN', 'Betrag', 'Status', 'Datum', 'Aktion'].map(h => (
              <th key={h} className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">{h}</th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100">
          {bonuses.map(b => (
            <tr key={b.id} className="hover:bg-gray-50">
              <td className="px-4 py-3 font-medium">
                {b.partner ? `${b.partner.first_name} ${b.partner.last_name}` : '—'}
              </td>
              <td className="px-4 py-3 font-mono text-xs">{b.partner?.partner_number || '—'}</td>
              <td className="px-4 py-3 font-mono text-xs text-gray-500">{b.partner?.iban || 'Keine IBAN'}</td>
              <td className="px-4 py-3 font-bold text-yellow-600">{fmt(b.bonus_amount)}</td>
              <td className="px-4 py-3">
                <Badge variant={b.status === 'paid' ? 'default' : 'outline'}>
                  {b.status === 'paid' ? '✓ Bezahlt' : 'Ausstehend'}
                </Badge>
              </td>
              <td className="px-4 py-3 text-gray-400 text-xs">
                {new Date(b.created_at).toLocaleDateString('de-DE')}
              </td>
              <td className="px-4 py-3">
                {b.status === 'pending' && (
                  <Button size="sm" onClick={() => markPaid(b.id)}>
                    <CheckCircle className="h-3 w-3 mr-1" /> Als bezahlt markieren
                  </Button>
                )}
              </td>
            </tr>
          ))}
          {bonuses.length === 0 && (
            <tr><td colSpan={7} className="px-4 py-8 text-center text-gray-400">Keine Boni vorhanden</td></tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
