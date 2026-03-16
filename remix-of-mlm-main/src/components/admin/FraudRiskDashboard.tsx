import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Progress } from '@/components/ui/progress';
import { Switch } from '@/components/ui/switch';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { toast } from 'sonner';
import {
  Target, AlertTriangle, Shield, Loader2, RefreshCw, Eye, Activity,
  BarChart3, TrendingUp, AlertCircle, CheckCircle2, XCircle, Zap, Settings
} from 'lucide-react';
import { format } from 'date-fns';

async function callSiemApi(action: string, data: Record<string, unknown> = {}) {
  const { data: result, error } = await supabase.functions.invoke('siem-engine', {
    body: { action, ...data },
  });
  if (error) throw new Error(error.message || 'API-Fehler');
  if (result?.error) throw new Error(result.error);
  return result;
}

const riskColor = (score: number) => {
  if (score >= 700) return 'text-red-400';
  if (score >= 400) return 'text-orange-400';
  if (score >= 200) return 'text-yellow-400';
  return 'text-green-400';
};

const riskBg = (score: number) => {
  if (score >= 700) return 'bg-red-500/20 border-red-500/30';
  if (score >= 400) return 'bg-orange-500/20 border-orange-500/30';
  if (score >= 200) return 'bg-yellow-500/20 border-yellow-500/30';
  return 'bg-green-500/20 border-green-500/30';
};

const riskLabel = (score: number) => {
  if (score >= 700) return 'Kritisch';
  if (score >= 400) return 'Hoch';
  if (score >= 200) return 'Mittel';
  return 'Niedrig';
};

const subscoreLabels: Record<string, string> = {
  velocity_score: 'Geschwindigkeit',
  behavioral_score: 'Verhalten',
  network_score: 'Netzwerk',
  device_score: 'Gerät',
  financial_score: 'Finanzen',
  identity_score: 'Identität',
};

export function FraudRiskDashboard() {
  const [profiles, setProfiles] = useState<any[]>([]);
  const [rules, setRules] = useState<any[]>([]);
  const [triggers, setTriggers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [recalculating, setRecalculating] = useState(false);
  const [selectedProfile, setSelectedProfile] = useState<any>(null);
  const [activeTab, setActiveTab] = useState('overview');
  const [filterRisk, setFilterRisk] = useState('all');
  const [searchTerm, setSearchTerm] = useState('');

  const fetchData = useCallback(async () => {
    setLoading(true);
    const [profilesRes, rulesRes, triggersRes] = await Promise.all([
      supabase.from('fraud_risk_profiles').select('*').order('composite_score', { ascending: false }).limit(200),
      supabase.from('fraud_rules').select('*').order('rule_name'),
      supabase.from('fraud_rule_triggers').select('*').order('triggered_at', { ascending: false }).limit(100),
    ]);
    setProfiles(profilesRes.data || []);
    setRules(rulesRes.data || []);
    setTriggers(triggersRes.data || []);
    setLoading(false);
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  const recalculateAll = async () => {
    setRecalculating(true);
    try {
      // Recalculate a batch
      const ids = profiles.slice(0, 50).map(p => p.profile_id);
      let recalculated = 0;
      for (const pid of ids) {
        try {
          await callSiemApi('recalculate_fraud', { profile_id: pid });
          recalculated++;
        } catch { /* skip individual failures */ }
      }
      toast.success(`${recalculated} Risikoprofile neu berechnet`);
      fetchData();
    } catch (e: any) { toast.error(e.message); }
    setRecalculating(false);
  };

  const recalculateOne = async (profileId: string) => {
    try {
      const data = await callSiemApi('recalculate_fraud', { profile_id: profileId });
      toast.success(`Risiko-Score: ${data.composite_score || 0}`);
      fetchData();
    } catch (e: any) { toast.error(e.message); }
  };

  // Stats
  const criticalCount = profiles.filter(p => p.composite_score >= 700).length;
  const highCount = profiles.filter(p => p.composite_score >= 400 && p.composite_score < 700).length;
  const mediumCount = profiles.filter(p => p.composite_score >= 200 && p.composite_score < 400).length;
  const lowCount = profiles.filter(p => p.composite_score < 200).length;
  const avgScore = profiles.length > 0 ? Math.round(profiles.reduce((s, p) => s + (p.composite_score || 0), 0) / profiles.length) : 0;

  const filteredProfiles = profiles.filter(p => {
    if (filterRisk === 'critical' && p.composite_score < 700) return false;
    if (filterRisk === 'high' && (p.composite_score < 400 || p.composite_score >= 700)) return false;
    if (filterRisk === 'medium' && (p.composite_score < 200 || p.composite_score >= 400)) return false;
    if (filterRisk === 'low' && p.composite_score >= 200) return false;
    if (searchTerm && !(p.profile_id || '').includes(searchTerm)) return false;
    return true;
  });

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-8 w-8 animate-spin text-yellow-500" />
        <span className="ml-3 text-muted-foreground">Betrugsdaten werden geladen...</span>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Target className="h-7 w-7 text-yellow-500" />
            Betrugsanalyse & Risiko-Scoring
          </h1>
          <p className="text-muted-foreground text-sm mt-1">Composite-Score (0–1000) mit 6 Unterkategorien</p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={fetchData}>
            <RefreshCw className="h-4 w-4 mr-1" /> Aktualisieren
          </Button>
          <Button size="sm" onClick={recalculateAll} disabled={recalculating}
            className="bg-gradient-to-r from-yellow-600 to-orange-600 text-white">
            {recalculating ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <Zap className="h-4 w-4 mr-1" />}
            Batch-Neuberechnung
          </Button>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        <Card><CardContent className="p-3 flex items-center gap-3">
          <div className="p-2 rounded-lg bg-red-500/10"><XCircle className="h-4 w-4 text-red-500" /></div>
          <div><p className="text-lg font-bold leading-none">{criticalCount}</p><p className="text-[10px] text-muted-foreground">Kritisch (≥700)</p></div>
        </CardContent></Card>
        <Card><CardContent className="p-3 flex items-center gap-3">
          <div className="p-2 rounded-lg bg-orange-500/10"><AlertTriangle className="h-4 w-4 text-orange-500" /></div>
          <div><p className="text-lg font-bold leading-none">{highCount}</p><p className="text-[10px] text-muted-foreground">Hoch (400–699)</p></div>
        </CardContent></Card>
        <Card><CardContent className="p-3 flex items-center gap-3">
          <div className="p-2 rounded-lg bg-yellow-500/10"><AlertCircle className="h-4 w-4 text-yellow-500" /></div>
          <div><p className="text-lg font-bold leading-none">{mediumCount}</p><p className="text-[10px] text-muted-foreground">Mittel (200–399)</p></div>
        </CardContent></Card>
        <Card><CardContent className="p-3 flex items-center gap-3">
          <div className="p-2 rounded-lg bg-green-500/10"><CheckCircle2 className="h-4 w-4 text-green-500" /></div>
          <div><p className="text-lg font-bold leading-none">{lowCount}</p><p className="text-[10px] text-muted-foreground">Niedrig (&lt;200)</p></div>
        </CardContent></Card>
        <Card><CardContent className="p-3 flex items-center gap-3">
          <div className="p-2 rounded-lg bg-purple-500/10"><BarChart3 className="h-4 w-4 text-purple-500" /></div>
          <div><p className={`text-lg font-bold leading-none ${riskColor(avgScore)}`}>{avgScore}</p><p className="text-[10px] text-muted-foreground">Durchschn. Score</p></div>
        </CardContent></Card>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="grid w-full grid-cols-4">
          <TabsTrigger value="overview">Risikoprofile</TabsTrigger>
          <TabsTrigger value="detail" disabled={!selectedProfile}>Profil-Detail</TabsTrigger>
          <TabsTrigger value="rules">Betrugsregeln</TabsTrigger>
          <TabsTrigger value="triggers">Regel-Auslöser</TabsTrigger>
        </TabsList>

        {/* RISK PROFILES */}
        <TabsContent value="overview" className="mt-4 space-y-3">
          <div className="flex gap-3">
            <Input placeholder="Profil-ID suchen..." value={searchTerm} onChange={e => setSearchTerm(e.target.value)} className="max-w-xs" />
            <Select value={filterRisk} onValueChange={setFilterRisk}>
              <SelectTrigger className="w-[160px]"><SelectValue placeholder="Risikostufe" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Alle</SelectItem>
                <SelectItem value="critical">Kritisch</SelectItem>
                <SelectItem value="high">Hoch</SelectItem>
                <SelectItem value="medium">Mittel</SelectItem>
                <SelectItem value="low">Niedrig</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <Card>
            <CardContent className="p-0">
              <ScrollArea className="h-[500px]">
                <div className="divide-y">
                  {filteredProfiles.map(profile => (
                    <div key={profile.id} className="flex items-center gap-4 p-4 hover:bg-muted/30 cursor-pointer transition-colors"
                      onClick={() => { setSelectedProfile(profile); setActiveTab('detail'); }}>
                      <div className={`w-12 h-12 rounded-lg flex items-center justify-center text-sm font-bold border ${riskBg(profile.composite_score)}`}>
                        <span className={riskColor(profile.composite_score)}>{profile.composite_score}</span>
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-mono truncate">{profile.profile_id}</p>
                        <p className="text-xs text-muted-foreground">
                          Letzte Berechnung: {profile.last_calculated ? format(new Date(profile.last_calculated), 'dd.MM.yy HH:mm') : 'Nie'}
                        </p>
                      </div>
                      <Badge variant="outline" className={riskBg(profile.composite_score)}>
                        {riskLabel(profile.composite_score)}
                      </Badge>
                      {/* Mini subscores */}
                      <div className="hidden lg:flex gap-1">
                        {Object.entries(subscoreLabels).map(([key, label]) => (
                          <div key={key} className="text-center px-1.5">
                            <p className={`text-[10px] font-bold ${riskColor(profile[key] || 0)}`}>{profile[key] || 0}</p>
                            <p className="text-[8px] text-muted-foreground">{label.slice(0, 4)}</p>
                          </div>
                        ))}
                      </div>
                      <Button size="icon" variant="ghost" className="h-7 w-7" onClick={e => { e.stopPropagation(); recalculateOne(profile.profile_id); }}>
                        <RefreshCw className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  ))}
                  {filteredProfiles.length === 0 && (
                    <div className="text-center py-16">
                      <Target className="h-10 w-10 mx-auto mb-3 text-muted-foreground/30" />
                      <p className="text-muted-foreground">Keine Risikoprofile gefunden</p>
                    </div>
                  )}
                </div>
              </ScrollArea>
            </CardContent>
          </Card>
        </TabsContent>

        {/* PROFILE DETAIL */}
        <TabsContent value="detail" className="mt-4 space-y-4">
          {selectedProfile && (
            <>
              <Card className="border-yellow-500/30">
                <CardHeader className="pb-3">
                  <div className="flex items-center justify-between">
                    <CardTitle className="text-lg flex items-center gap-2">
                      <Target className={`h-5 w-5 ${riskColor(selectedProfile.composite_score)}`} />
                      Risikoprofil
                    </CardTitle>
                    <Badge variant="outline" className={`text-base px-3 py-1 ${riskBg(selectedProfile.composite_score)}`}>
                      <span className={riskColor(selectedProfile.composite_score)}>
                        {selectedProfile.composite_score} / 1000
                      </span>
                    </Badge>
                  </div>
                </CardHeader>
                <CardContent className="space-y-4">
                  <p className="text-xs font-mono text-muted-foreground">{selectedProfile.profile_id}</p>

                  {/* Composite Score Bar */}
                  <div>
                    <div className="flex items-center justify-between text-xs mb-1">
                      <span>Gesamt-Risikoscore</span>
                      <span className={`font-bold ${riskColor(selectedProfile.composite_score)}`}>
                        {riskLabel(selectedProfile.composite_score)}
                      </span>
                    </div>
                    <Progress value={(selectedProfile.composite_score / 1000) * 100} className="h-4" />
                  </div>

                  {/* Subscores */}
                  <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-3">
                    {Object.entries(subscoreLabels).map(([key, label]) => {
                      const val = selectedProfile[key] || 0;
                      return (
                        <div key={key} className="p-3 rounded-lg bg-muted/30 border">
                          <div className="flex items-center justify-between mb-2">
                            <span className="text-xs font-medium">{label}</span>
                            <span className={`text-sm font-bold ${riskColor(val)}`}>{val}</span>
                          </div>
                          <div className="h-2 bg-muted rounded-full overflow-hidden">
                            <div className={`h-full rounded-full transition-all ${
                              val >= 700 ? 'bg-red-500' : val >= 400 ? 'bg-orange-500' : val >= 200 ? 'bg-yellow-500' : 'bg-green-500'
                            }`} style={{ width: `${Math.min((val / 1000) * 100, 100)}%` }} />
                          </div>
                        </div>
                      );
                    })}
                  </div>

                  {/* Risk Factors */}
                  {selectedProfile.risk_factors && Array.isArray(selectedProfile.risk_factors) && selectedProfile.risk_factors.length > 0 && (
                    <div className="bg-muted/30 rounded-lg p-4">
                      <p className="text-xs font-semibold text-yellow-400 mb-2">Risikofaktoren</p>
                      <div className="space-y-1">
                        {selectedProfile.risk_factors.map((f: string, i: number) => (
                          <p key={i} className="text-xs text-muted-foreground flex items-start gap-2">
                            <AlertTriangle className="h-3 w-3 text-yellow-400 mt-0.5 shrink-0" /> {f}
                          </p>
                        ))}
                      </div>
                    </div>
                  )}

                  <Button size="sm" onClick={() => recalculateOne(selectedProfile.profile_id)}>
                    <RefreshCw className="h-4 w-4 mr-1" /> Neu berechnen
                  </Button>
                </CardContent>
              </Card>

              {/* Related Triggers */}
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-sm flex items-center gap-2">
                    <Zap className="h-4 w-4 text-orange-500" /> Ausgelöste Regeln für dieses Profil
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <ScrollArea className="h-[250px]">
                    {triggers.filter(t => t.profile_id === selectedProfile.profile_id).length > 0 ? (
                      <div className="space-y-2">
                        {triggers.filter(t => t.profile_id === selectedProfile.profile_id).map(trigger => (
                          <div key={trigger.id} className="flex items-center gap-3 p-2 rounded-lg bg-muted/30">
                            <Zap className="h-4 w-4 text-orange-400" />
                            <div className="flex-1">
                              <p className="text-sm">{trigger.rule_id?.slice(0, 8)}</p>
                              <p className="text-xs text-muted-foreground">
                                Score-Beitrag: +{trigger.score_contribution || 0} •
                                {trigger.triggered_at ? format(new Date(trigger.triggered_at), ' dd.MM.yy HH:mm') : ''}
                              </p>
                            </div>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <p className="text-center text-muted-foreground py-8 text-sm">Keine Regel-Auslöser für dieses Profil</p>
                    )}
                  </ScrollArea>
                </CardContent>
              </Card>
            </>
          )}
        </TabsContent>

        {/* FRAUD RULES */}
        <TabsContent value="rules" className="mt-4">
          <Card>
            <CardContent className="p-0">
              <ScrollArea className="h-[550px]">
                <div className="divide-y">
                  {rules.map(rule => (
                    <div key={rule.id} className="p-4 hover:bg-muted/30 transition-colors">
                      <div className="flex items-center gap-3 mb-2">
                        <Badge variant="outline" className={rule.is_active ? 'bg-green-500/20 text-green-400' : 'bg-muted text-muted-foreground'}>
                          {rule.is_active ? 'Aktiv' : 'Inaktiv'}
                        </Badge>
                        <span className="text-sm font-medium">{rule.rule_name}</span>
                        <Badge variant="outline" className="ml-auto text-[10px]">
                          Score: +{rule.score_weight || 0}
                        </Badge>
                      </div>
                      {rule.description && <p className="text-xs text-muted-foreground">{rule.description}</p>}
                      <div className="flex items-center gap-4 mt-2 text-[10px] text-muted-foreground">
                        <span>Kategorie: {rule.category || '—'}</span>
                        <span>Cooldown: {rule.cooldown_minutes || 0}min</span>
                        <span>Schwelle: {rule.threshold || '—'}</span>
                      </div>
                    </div>
                  ))}
                  {rules.length === 0 && (
                    <div className="text-center py-16">
                      <Settings className="h-10 w-10 mx-auto mb-3 text-muted-foreground/30" />
                      <p className="text-muted-foreground">Keine Betrugsregeln konfiguriert</p>
                    </div>
                  )}
                </div>
              </ScrollArea>
            </CardContent>
          </Card>
        </TabsContent>

        {/* RULE TRIGGERS */}
        <TabsContent value="triggers" className="mt-4">
          <Card>
            <CardContent className="p-0">
              <ScrollArea className="h-[550px]">
                <div className="divide-y">
                  {triggers.map(trigger => (
                    <div key={trigger.id} className="flex items-center gap-4 p-4 hover:bg-muted/30">
                      <Zap className="h-4 w-4 text-orange-400 shrink-0" />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium truncate">Profil: {(trigger.profile_id || '').slice(0, 12)}...</p>
                        <p className="text-xs text-muted-foreground">Regel: {(trigger.rule_id || '').slice(0, 12)}...</p>
                      </div>
                      <Badge variant="outline" className="bg-orange-500/20 text-orange-400">
                        +{trigger.score_contribution || 0}
                      </Badge>
                      <span className="text-xs text-muted-foreground whitespace-nowrap">
                        {trigger.triggered_at ? format(new Date(trigger.triggered_at), 'dd.MM.yy HH:mm') : ''}
                      </span>
                    </div>
                  ))}
                  {triggers.length === 0 && (
                    <div className="text-center py-16">
                      <Zap className="h-10 w-10 mx-auto mb-3 text-muted-foreground/30" />
                      <p className="text-muted-foreground">Keine Regel-Auslöser</p>
                    </div>
                  )}
                </div>
              </ScrollArea>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
