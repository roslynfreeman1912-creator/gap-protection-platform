import { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { supabase } from '@/integrations/supabase/client';
import { securityApi } from '@/lib/securityApi';
import {
  Network, Users, TrendingUp, Loader2, RefreshCw, ArrowRight,
  CheckCircle, XCircle, Layers, GitBranch
} from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

// Corrected Sliding Window Commission Matrix
// Key = trigger depth (d), values = [Auslöser, Upline1, Upline2, Upline3, Upline4]
const COMMISSION_MATRIX: Record<number, Record<number, number>> = {
  1: { 1: 100 },
  2: { 1: 80, 2: 20 },
  3: { 1: 45, 2: 20, 3: 15 },
  4: { 1: 45, 2: 20, 3: 15, 4: 10 },
  5: { 1: 45, 2: 20, 3: 15, 4: 10, 5: 10 },
};

interface HierarchyNode {
  id: string;
  first_name: string;
  last_name: string;
  email: string;
  status: string;
  level: number;
  children_count: number;
  commissions_total: number;
  is_partner: boolean;
}

export function AdminMLMManager() {
  const { toast } = useToast();
  const [isLoading, setIsLoading] = useState(false);
  const [hierarchyData, setHierarchyData] = useState<unknown[]>([]);
  const [topPartners, setTopPartners] = useState<any[]>([]);
  const [mlmStats, setMlmStats] = useState({
    totalPartners: 0,
    totalCustomers: 0,
    maxDepth: 0,
    totalCommissions: 0,
    activeChains: 0
  });
  const [matrixValues, setMatrixValues] = useState<Record<string, number>>({});

  const loadMLMData = async () => {
    setIsLoading(true);
    try {
      // Load all hierarchy relationships
      const { data: hierarchy } = await supabase
        .from('user_hierarchy')
        .select(`
          id, user_id, ancestor_id, level_number, is_active_for_commission,
          user:profiles!user_hierarchy_user_id_fkey (id, first_name, last_name, email, status),
          ancestor:profiles!user_hierarchy_ancestor_id_fkey (id, first_name, last_name, email)
        `)
        .order('level_number');

      // Load commission matrix from DB
      const { data: matrix } = await supabase
        .from('commission_matrix')
        .select('*')
        .order('partner_depth')
        .order('payout_level');

      // Load partner roles
      const { data: roles } = await supabase
        .from('user_roles')
        .select('user_id, role')
        .in('role', ['partner', 'admin']);

      // Load total commissions per partner
      const { data: commissions } = await supabase
        .from('commissions')
        .select('partner_id, commission_amount');

      const partnerIds = new Set(roles?.map(r => r.user_id) || []);
      const maxDepth = hierarchy?.reduce((max, h) => Math.max(max, h.level_number), 0) || 0;
      const totalComm = commissions?.reduce((s, c) => s + Number(c.commission_amount), 0) || 0;

      // Commission totals by partner
      const commByPartner: Record<string, number> = {};
      commissions?.forEach(c => {
        commByPartner[c.partner_id] = (commByPartner[c.partner_id] || 0) + Number(c.commission_amount);
      });

      // Find top-level partners (those who have downlines)
      const ancestorCounts: Record<string, number> = {};
      hierarchy?.forEach(h => {
        ancestorCounts[h.ancestor_id] = (ancestorCounts[h.ancestor_id] || 0) + 1;
      });

      const topPartnerIds = Object.entries(ancestorCounts)
        .sort(([, a], [, b]) => b - a)
        .slice(0, 20)
        .map(([id]) => id);

      const topPartnersData = topPartnerIds.map(id => {
        const entry = (hierarchy as any[])?.find(h => h.ancestor_id === id);
        return {
          id,
          name: entry?.ancestor ? `${entry.ancestor.first_name} ${entry.ancestor.last_name}` : id,
          email: entry?.ancestor?.email || '',
          downlineCount: ancestorCounts[id] || 0,
          totalCommissions: commByPartner[id] || 0,
        };
      });

      // Load matrix values
      const matrixMap: Record<string, number> = {};
      matrix?.forEach(m => {
        matrixMap[`${m.partner_depth}-${m.payout_level}`] = m.value;
      });

      setHierarchyData(hierarchy || []);
      setTopPartners(topPartnersData);
      setMatrixValues(matrixMap);
      setMlmStats({
        totalPartners: partnerIds.size,
        totalCustomers: new Set(hierarchy?.map(h => h.user_id)).size,
        maxDepth,
        totalCommissions: totalComm,
        activeChains: Object.keys(ancestorCounts).length,
      });
    } catch (err: unknown) {
      const error = err as Error;
      toast({ variant: 'destructive', title: 'Fehler', description: error.message });
    } finally {
      setIsLoading(false);
    }
  };

  const updateMatrixValue = async (partnerDepth: number, payoutLevel: number, value: number) => {
    try {
      const modelId = (await supabase.from('commission_models').select('id').eq('name', 'GAP-Protection Sliding').single()).data?.id;
      if (!modelId) {
        toast({ variant: 'destructive', title: 'Fehler', description: 'Kein MLM-Modell gefunden' });
        return;
      }

      await securityApi.upsert('commission_matrix', {
          model_id: modelId,
          partner_depth: partnerDepth,
          payout_level: payoutLevel,
          value
        });

      setMatrixValues(prev => ({ ...prev, [`${partnerDepth}-${payoutLevel}`]: value }));
      toast({ title: 'Gespeichert', description: `Matrix L${partnerDepth}/L${payoutLevel} = ${value}€` });
    } catch (err: unknown) {
      const error = err as Error;
      toast({ variant: 'destructive', title: 'Fehler', description: error.message });
    }
  };

  const rebuildHierarchy = async () => {
    setIsLoading(true);
    try {
      const { error } = await supabase.functions.invoke('rebuild-hierarchy');
      if (error) throw error;
      toast({ title: 'Erfolg', description: 'Hierarchie wurde neu aufgebaut' });
      loadMLMData();
    } catch (err: unknown) {
      const error = err as Error;
      toast({ variant: 'destructive', title: 'Fehler', description: error.message });
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => { 
    loadMLMData(); 
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const fmt = (n: number) => new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR' }).format(n);

  return (
    <div className="space-y-6">
      {/* MLM Stats Overview */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
        <Card><CardContent className="pt-4">
          <p className="text-xs text-muted-foreground">Partner gesamt</p>
          <p className="text-2xl font-bold text-primary">{mlmStats.totalPartners}</p>
        </CardContent></Card>
        <Card><CardContent className="pt-4">
          <p className="text-xs text-muted-foreground">Struktur-Mitglieder</p>
          <p className="text-2xl font-bold">{mlmStats.totalCustomers}</p>
        </CardContent></Card>
        <Card><CardContent className="pt-4">
          <p className="text-xs text-muted-foreground">Max. Tiefe</p>
          <p className="text-2xl font-bold">{mlmStats.maxDepth}</p>
        </CardContent></Card>
        <Card><CardContent className="pt-4">
          <p className="text-xs text-muted-foreground">Provisionen gesamt</p>
          <p className="text-2xl font-bold">{fmt(mlmStats.totalCommissions)}</p>
        </CardContent></Card>
        <Card><CardContent className="pt-4">
          <p className="text-xs text-muted-foreground">Aktive Ketten</p>
          <p className="text-2xl font-bold">{mlmStats.activeChains}</p>
        </CardContent></Card>
      </div>

      <Tabs defaultValue="matrix" className="space-y-4">
        <TabsList className="grid grid-cols-3 w-full max-w-lg">
          <TabsTrigger value="matrix"><Layers className="h-4 w-4 mr-1" />Provisions-Matrix</TabsTrigger>
          <TabsTrigger value="top"><TrendingUp className="h-4 w-4 mr-1" />Top Partner</TabsTrigger>
          <TabsTrigger value="hierarchy"><GitBranch className="h-4 w-4 mr-1" />Hierarchie</TabsTrigger>
        </TabsList>

        {/* Sliding Window Matrix */}
        <TabsContent value="matrix">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Network className="h-5 w-5" />
                Sliding Window Provisions-Matrix
              </CardTitle>
              <CardDescription>
                Provisionen in € basierend auf Partner-Tiefe (Zeilen) und Upline-Level (Spalten). Klicken Sie auf einen Wert zum Bearbeiten.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                     <TableRow>
                      <TableHead className="bg-muted font-bold">Tiefe (d)</TableHead>
                      <TableHead className="text-center bg-primary/5 font-bold">Auslöser</TableHead>
                      <TableHead className="text-center bg-primary/5 font-bold">Upline 1</TableHead>
                      <TableHead className="text-center bg-primary/5 font-bold">Upline 2</TableHead>
                      <TableHead className="text-center bg-primary/5 font-bold">Upline 3</TableHead>
                      <TableHead className="text-center bg-primary/5 font-bold">Upline 4</TableHead>
                      <TableHead className="text-center font-bold">Gesamt</TableHead>
                      <TableHead className="text-center font-bold">→ Pool</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                  {[1, 2, 3, 4, 5].map(depth => {
                      const matrix = COMMISSION_MATRIX[depth] || {};
                      const total = Object.values(matrix).reduce((s, v) => s + v, 0);
                      const poolAmount = 100 - total;
                      return (
                        <TableRow key={depth} className={depth >= 5 ? 'bg-muted/30' : ''}>
                          <TableCell className="font-bold">
                            {depth >= 5 ? 'ab d≥5' : `d=${depth}`}
                          </TableCell>
                          {[1, 2, 3, 4, 5].map(level => {
                            const val = matrixValues[`${depth}-${level}`] ?? matrix[level];
                            return (
                              <TableCell key={level} className="text-center">
                                {val !== undefined ? (
                                  <Input
                                    type="number"
                                    className="w-20 mx-auto text-center h-8"
                                    defaultValue={val}
                                    onBlur={(e) => {
                                      const newVal = Number(e.target.value);
                                    if (newVal !== val) {
                                        updateMatrixValue(depth, level, newVal);
                                      }
                                    }}
                                  />
                                ) : (
                                  <span className="text-muted-foreground">—</span>
                                )}
                              </TableCell>
                            );
                          })}
                          <TableCell className="text-center font-bold text-primary">
                            {total}€
                          </TableCell>
                          <TableCell className="text-center font-medium text-orange-500">
                            {poolAmount > 0 ? `${poolAmount}€` : '—'}
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>

              <div className="mt-4 p-4 bg-muted/50 rounded-lg text-sm text-muted-foreground">
                <p className="font-medium mb-2">🔄 Sliding Window Erklärung:</p>
                <ul className="space-y-1 list-disc list-inside">
                  <li><strong>d=1:</strong> Auslöser bekommt 100€ (alles, kein Pool)</li>
                  <li><strong>d=2:</strong> Auslöser 80€ + Upline1 20€ (kein Pool)</li>
                  <li><strong>d=3:</strong> Auslöser 45€ + Upline1 20€ + Upline2 15€ → 20€ Pool</li>
                  <li><strong>d=4:</strong> Auslöser 45€ + Upline1 20€ + Upline2 15€ + Upline3 10€ → 10€ Pool</li>
                  <li><strong>d≥5:</strong> Auslöser 45€ + Upline1-4 (20+15+10+10)€ → kein Pool</li>
                  <li>Ab d≥6 rutscht das Fenster: nur die letzten 5 Positionen erhalten Provisionen</li>
                </ul>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Top Partners */}
        <TabsContent value="top">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <TrendingUp className="h-5 w-5" />
                Top-Partner nach Struktur-Größe
              </CardTitle>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>#</TableHead>
                    <TableHead>Partner</TableHead>
                    <TableHead>E-Mail</TableHead>
                    <TableHead className="text-center">Downline</TableHead>
                    <TableHead className="text-right">Provisionen</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {topPartners.length === 0 ? (
                    <TableRow><TableCell colSpan={5} className="text-center py-8 text-muted-foreground">Keine Daten</TableCell></TableRow>
                  ) : topPartners.map((p, i) => (
                    <TableRow key={p.id}>
                      <TableCell className="font-bold">{i + 1}</TableCell>
                      <TableCell className="font-medium">{p.name}</TableCell>
                      <TableCell className="text-muted-foreground">{p.email}</TableCell>
                      <TableCell className="text-center">
                        <Badge variant="secondary">{p.downlineCount} Mitglieder</Badge>
                      </TableCell>
                      <TableCell className="text-right font-medium">{fmt(p.totalCommissions)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Hierarchy View */}
        <TabsContent value="hierarchy">
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="flex items-center gap-2">
                    <GitBranch className="h-5 w-5" />
                    MLM-Hierarchie
                  </CardTitle>
                  <CardDescription>Alle Beziehungen in der Partner-Struktur</CardDescription>
                </div>
                <Button onClick={rebuildHierarchy} variant="outline" disabled={isLoading}>
                  <RefreshCw className={`h-4 w-4 mr-2 ${isLoading ? 'animate-spin' : ''}`} />
                  Hierarchie neu aufbauen
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Mitglied</TableHead>
                    <TableHead className="text-center"><ArrowRight className="h-4 w-4 inline" /></TableHead>
                    <TableHead>Upline (Ancestor)</TableHead>
                    <TableHead>Stufe</TableHead>
                    <TableHead>Provisions-Aktiv</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {hierarchyData.length === 0 ? (
                    <TableRow><TableCell colSpan={5} className="text-center py-8 text-muted-foreground">Keine Hierarchie-Daten</TableCell></TableRow>
                  ) : hierarchyData.slice(0, 100).map((h: any) => (
                    <TableRow key={h.id}>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <div className="w-7 h-7 rounded-full bg-primary/10 flex items-center justify-center text-xs font-medium">
                            {h.user?.first_name?.[0]}{h.user?.last_name?.[0]}
                          </div>
                          <span className="font-medium">{h.user?.first_name} {h.user?.last_name}</span>
                        </div>
                      </TableCell>
                      <TableCell className="text-center text-muted-foreground">→</TableCell>
                      <TableCell className="text-muted-foreground">
                        {h.ancestor?.first_name} {h.ancestor?.last_name}
                      </TableCell>
                      <TableCell><Badge variant="outline">L{h.level_number}</Badge></TableCell>
                      <TableCell>
                        {h.is_active_for_commission ? (
                          <CheckCircle className="h-4 w-4 text-green-500" />
                        ) : (
                          <XCircle className="h-4 w-4 text-destructive" />
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
              {hierarchyData.length > 100 && (
                <p className="text-sm text-muted-foreground text-center mt-4">
                  Zeige 100 von {hierarchyData.length} Einträgen
                </p>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
