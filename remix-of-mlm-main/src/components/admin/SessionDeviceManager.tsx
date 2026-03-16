import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Input } from '@/components/ui/input';
import { toast } from 'sonner';
import {
  Monitor, Smartphone, Globe, Wifi, Loader2, RefreshCw, Shield,
  Lock, Unlock, XCircle, CheckCircle2, Clock, MapPin, Fingerprint,
  Key, AlertTriangle, Activity
} from 'lucide-react';
import { format } from 'date-fns';

async function callSessionApi(action: string, data: Record<string, unknown> = {}) {
  const { data: result, error } = await supabase.functions.invoke('session-manager', {
    body: { action, ...data },
  });
  if (error) throw new Error(error.message || 'API-Fehler');
  if (result?.error) throw new Error(result.error);
  return result;
}

export function SessionDeviceManager() {
  const [sessions, setSessions] = useState<any[]>([]);
  const [devices, setDevices] = useState<any[]>([]);
  const [mfaStats, setMfaStats] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('sessions');
  const [searchTerm, setSearchTerm] = useState('');
  const [actionLoading, setActionLoading] = useState('');

  const fetchData = useCallback(async () => {
    setLoading(true);
    const [sessionsRes, devicesRes, mfaRes] = await Promise.all([
      supabase.from('active_sessions').select('*').eq('is_active', true).order('last_activity', { ascending: false }).limit(200),
      supabase.from('known_devices').select('*').order('last_seen_at', { ascending: false }).limit(200),
      supabase.from('profiles').select('id, mfa_enabled, mfa_enforced, mfa_method').not('mfa_enabled', 'is', null),
    ]);
    setSessions(sessionsRes.data || []);
    setDevices(devicesRes.data || []);

    // MFA stats
    const allProfiles = mfaRes.data || [];
    setMfaStats({
      total: allProfiles.length,
      enabled: allProfiles.filter((p: any) => p.mfa_enabled).length,
      enforced: allProfiles.filter((p: any) => p.mfa_enforced).length,
      totp: allProfiles.filter((p: any) => p.mfa_method === 'totp').length,
    });
    setLoading(false);
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  const revokeSession = async (sessionId: string) => {
    setActionLoading(sessionId);
    try {
      await callSessionApi('revoke_session', { session_id: sessionId });
      toast.success('Sitzung widerrufen');
      fetchData();
    } catch (e: any) { toast.error(e.message); }
    setActionLoading('');
  };

  const revokeAllSessions = async (profileId: string) => {
    setActionLoading('revoke-all');
    try {
      await callSessionApi('revoke_all_sessions', { profile_id: profileId });
      toast.success('Alle Sitzungen widerrufen');
      fetchData();
    } catch (e: any) { toast.error(e.message); }
    setActionLoading('');
  };

  const blockDevice = async (deviceId: string) => {
    setActionLoading(`block-${deviceId}`);
    try {
      await callSessionApi('block_device', { device_id: deviceId });
      toast.success('Gerät blockiert');
      fetchData();
    } catch (e: any) { toast.error(e.message); }
    setActionLoading('');
  };

  const trustDevice = async (deviceId: string) => {
    setActionLoading(`trust-${deviceId}`);
    try {
      await callSessionApi('trust_device', { device_id: deviceId });
      toast.success('Gerät als vertrauenswürdig markiert');
      fetchData();
    } catch (e: any) { toast.error(e.message); }
    setActionLoading('');
  };

  const enforceMfa = async (profileId: string) => {
    setActionLoading(`mfa-${profileId}`);
    try {
      await callSessionApi('enforce_mfa', { profile_id: profileId });
      toast.success('MFA erzwungen');
    } catch (e: any) { toast.error(e.message); }
    setActionLoading('');
  };

  // Stats
  const activeSessions = sessions.length;
  const vpnSessions = sessions.filter(s => s.is_vpn || s.is_proxy || s.is_tor).length;
  const trustedDevices = devices.filter(d => d.is_trusted).length;
  const blockedDevices = devices.filter(d => d.is_blocked).length;

  // Group sessions by profile
  const sessionsByProfile = sessions.reduce((acc: Record<string, any[]>, s) => {
    const pid = s.profile_id || 'unknown';
    if (!acc[pid]) acc[pid] = [];
    acc[pid].push(s);
    return acc;
  }, {});

  const filteredSessions = searchTerm
    ? sessions.filter(s => (s.ip_address || '').includes(searchTerm) || (s.profile_id || '').includes(searchTerm) || (s.geo_country || '').toLowerCase().includes(searchTerm.toLowerCase()))
    : sessions;

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-8 w-8 animate-spin text-green-500" />
        <span className="ml-3 text-muted-foreground">Sitzungsdaten werden geladen...</span>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Fingerprint className="h-7 w-7 text-green-500" />
            Sitzungen & Geräte
          </h1>
          <p className="text-muted-foreground text-sm mt-1">Aktive Sitzungen, Geräte-Fingerprinting & MFA-Verwaltung</p>
        </div>
        <Button variant="outline" size="sm" onClick={fetchData}>
          <RefreshCw className="h-4 w-4 mr-1" /> Aktualisieren
        </Button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        <Card><CardContent className="p-3 flex items-center gap-3">
          <div className="p-2 rounded-lg bg-green-500/10"><Activity className="h-4 w-4 text-green-500" /></div>
          <div><p className="text-lg font-bold leading-none">{activeSessions}</p><p className="text-[10px] text-muted-foreground">Aktive Sitzungen</p></div>
        </CardContent></Card>
        <Card><CardContent className="p-3 flex items-center gap-3">
          <div className="p-2 rounded-lg bg-orange-500/10"><Globe className="h-4 w-4 text-orange-500" /></div>
          <div><p className="text-lg font-bold leading-none">{vpnSessions}</p><p className="text-[10px] text-muted-foreground">VPN/TOR/Proxy</p></div>
        </CardContent></Card>
        <Card><CardContent className="p-3 flex items-center gap-3">
          <div className="p-2 rounded-lg bg-cyan-500/10"><CheckCircle2 className="h-4 w-4 text-cyan-500" /></div>
          <div><p className="text-lg font-bold leading-none">{trustedDevices}</p><p className="text-[10px] text-muted-foreground">Vertrauenswürdige Geräte</p></div>
        </CardContent></Card>
        <Card><CardContent className="p-3 flex items-center gap-3">
          <div className="p-2 rounded-lg bg-red-500/10"><XCircle className="h-4 w-4 text-red-500" /></div>
          <div><p className="text-lg font-bold leading-none">{blockedDevices}</p><p className="text-[10px] text-muted-foreground">Blockierte Geräte</p></div>
        </CardContent></Card>
        <Card><CardContent className="p-3 flex items-center gap-3">
          <div className="p-2 rounded-lg bg-purple-500/10"><Key className="h-4 w-4 text-purple-500" /></div>
          <div><p className="text-lg font-bold leading-none">{mfaStats?.enabled || 0}</p><p className="text-[10px] text-muted-foreground">MFA aktiviert</p></div>
        </CardContent></Card>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="grid w-full grid-cols-3">
          <TabsTrigger value="sessions">Aktive Sitzungen</TabsTrigger>
          <TabsTrigger value="devices">Bekannte Geräte</TabsTrigger>
          <TabsTrigger value="mfa">MFA-Übersicht</TabsTrigger>
        </TabsList>

        {/* SESSIONS */}
        <TabsContent value="sessions" className="mt-4 space-y-3">
          <Input placeholder="IP, Profil-ID oder Land suchen..." value={searchTerm}
            onChange={e => setSearchTerm(e.target.value)} className="max-w-xs" />
          <Card>
            <CardContent className="p-0">
              <ScrollArea className="h-[550px]">
                <div className="divide-y">
                  {filteredSessions.map(session => (
                    <div key={session.id} className="p-4 hover:bg-muted/30 transition-colors">
                      <div className="flex items-center gap-3 mb-2">
                        <div className={`p-1.5 rounded-lg ${session.mfa_verified ? 'bg-green-500/10' : 'bg-yellow-500/10'}`}>
                          {session.mfa_verified
                            ? <Shield className="h-4 w-4 text-green-400" />
                            : <AlertTriangle className="h-4 w-4 text-yellow-400" />}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-xs font-mono text-muted-foreground">{(session.profile_id || '').slice(0, 12)}...</p>
                          <div className="flex items-center gap-2 text-xs">
                            <span className="font-mono">{session.ip_address}</span>
                            {session.geo_country && (
                              <span className="flex items-center gap-1 text-muted-foreground">
                                <MapPin className="h-3 w-3" /> {session.geo_country}{session.geo_city ? `, ${session.geo_city}` : ''}
                              </span>
                            )}
                          </div>
                        </div>
                        {/* Flags */}
                        <div className="flex items-center gap-1">
                          {session.is_tor && <Badge variant="outline" className="text-[9px] bg-red-500/20 text-red-400">TOR</Badge>}
                          {session.is_vpn && <Badge variant="outline" className="text-[9px] bg-orange-500/20 text-orange-400">VPN</Badge>}
                          {session.is_proxy && <Badge variant="outline" className="text-[9px] bg-yellow-500/20 text-yellow-400">Proxy</Badge>}
                          {session.mfa_verified && <Badge variant="outline" className="text-[9px] bg-green-500/20 text-green-400">MFA</Badge>}
                        </div>
                        <span className="text-xs text-muted-foreground whitespace-nowrap">
                          {session.last_activity ? format(new Date(session.last_activity), 'HH:mm') : ''}
                        </span>
                        <Button size="sm" variant="outline" className="text-xs border-red-500/30 text-red-400"
                          onClick={() => revokeSession(session.id)}
                          disabled={actionLoading === session.id}>
                          {actionLoading === session.id ? <Loader2 className="h-3 w-3 animate-spin" /> : <XCircle className="h-3 w-3 mr-1" />}
                          Widerrufen
                        </Button>
                      </div>
                      <div className="flex items-center gap-4 text-[10px] text-muted-foreground ml-10">
                        <span>User-Agent: {(session.user_agent || '').slice(0, 60)}...</span>
                        <span>Risiko: {session.risk_score || 0}</span>
                        <span>Erstellt: {session.created_at ? format(new Date(session.created_at), 'dd.MM HH:mm') : ''}</span>
                      </div>
                    </div>
                  ))}
                  {filteredSessions.length === 0 && (
                    <div className="text-center py-16">
                      <Activity className="h-10 w-10 mx-auto mb-3 text-muted-foreground/30" />
                      <p className="text-muted-foreground">Keine aktiven Sitzungen</p>
                    </div>
                  )}
                </div>
              </ScrollArea>
            </CardContent>
          </Card>

          {/* Bulk Actions */}
          {Object.keys(sessionsByProfile).length > 0 && (
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm">Massenaktion — Alle Sitzungen eines Nutzers widerrufen</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="flex flex-wrap gap-2">
                  {Object.entries(sessionsByProfile).slice(0, 10).map(([pid, sess]) => (
                    <Button key={pid} size="sm" variant="outline" className="text-xs"
                      onClick={() => revokeAllSessions(pid)}
                      disabled={actionLoading === 'revoke-all'}>
                      {(pid).slice(0, 8)}... ({(sess as any[]).length} Sitzungen)
                    </Button>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        {/* DEVICES */}
        <TabsContent value="devices" className="mt-4">
          <Card>
            <CardContent className="p-0">
              <ScrollArea className="h-[550px]">
                <div className="divide-y">
                  {devices.map(device => (
                    <div key={device.id} className="flex items-center gap-4 p-4 hover:bg-muted/30 transition-colors">
                      <div className={`p-2 rounded-lg ${device.is_blocked ? 'bg-red-500/10' : device.is_trusted ? 'bg-green-500/10' : 'bg-muted'}`}>
                        <Monitor className={`h-4 w-4 ${device.is_blocked ? 'text-red-400' : device.is_trusted ? 'text-green-400' : 'text-muted-foreground'}`} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium truncate">{device.device_name || 'Unbekanntes Gerät'}</p>
                        <p className="text-xs text-muted-foreground font-mono truncate">{device.device_fingerprint || '—'}</p>
                        <p className="text-[10px] text-muted-foreground">
                          {device.login_count || 0} Logins • Letzte Nutzung: {device.last_seen_at ? format(new Date(device.last_seen_at), 'dd.MM.yy HH:mm') : 'Nie'}
                        </p>
                      </div>
                      <div className="flex items-center gap-1">
                        {device.is_trusted && <Badge variant="outline" className="bg-green-500/20 text-green-400 text-[10px]">Vertrauenswürdig</Badge>}
                        {device.is_blocked && <Badge variant="outline" className="bg-red-500/20 text-red-400 text-[10px]">Blockiert</Badge>}
                      </div>
                      <div className="flex items-center gap-1">
                        {!device.is_trusted && !device.is_blocked && (
                          <Button size="sm" variant="outline" className="text-xs border-green-500/30 text-green-400"
                            onClick={() => trustDevice(device.id)} disabled={actionLoading === `trust-${device.id}`}>
                            <CheckCircle2 className="h-3 w-3 mr-1" /> Vertrauen
                          </Button>
                        )}
                        {!device.is_blocked && (
                          <Button size="sm" variant="outline" className="text-xs border-red-500/30 text-red-400"
                            onClick={() => blockDevice(device.id)} disabled={actionLoading === `block-${device.id}`}>
                            <XCircle className="h-3 w-3 mr-1" /> Blockieren
                          </Button>
                        )}
                      </div>
                    </div>
                  ))}
                  {devices.length === 0 && (
                    <div className="text-center py-16">
                      <Monitor className="h-10 w-10 mx-auto mb-3 text-muted-foreground/30" />
                      <p className="text-muted-foreground">Keine bekannten Geräte</p>
                    </div>
                  )}
                </div>
              </ScrollArea>
            </CardContent>
          </Card>
        </TabsContent>

        {/* MFA */}
        <TabsContent value="mfa" className="mt-4 space-y-4">
          <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-4">
            <Card className="border-purple-500/20">
              <CardContent className="p-5 text-center">
                <Key className="h-8 w-8 mx-auto mb-2 text-purple-400" />
                <p className="text-3xl font-bold">{mfaStats?.enabled || 0}</p>
                <p className="text-xs text-muted-foreground">MFA Aktiviert</p>
              </CardContent>
            </Card>
            <Card className="border-orange-500/20">
              <CardContent className="p-5 text-center">
                <Lock className="h-8 w-8 mx-auto mb-2 text-orange-400" />
                <p className="text-3xl font-bold">{mfaStats?.enforced || 0}</p>
                <p className="text-xs text-muted-foreground">MFA Erzwungen</p>
              </CardContent>
            </Card>
            <Card className="border-cyan-500/20">
              <CardContent className="p-5 text-center">
                <Smartphone className="h-8 w-8 mx-auto mb-2 text-cyan-400" />
                <p className="text-3xl font-bold">{mfaStats?.totp || 0}</p>
                <p className="text-xs text-muted-foreground">TOTP (App)</p>
              </CardContent>
            </Card>
            <Card className="border-green-500/20">
              <CardContent className="p-5 text-center">
                <Shield className="h-8 w-8 mx-auto mb-2 text-green-400" />
                <p className="text-3xl font-bold">
                  {mfaStats?.total ? Math.round((mfaStats.enabled / mfaStats.total) * 100) : 0}%
                </p>
                <p className="text-xs text-muted-foreground">Abdeckungsrate</p>
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm flex items-center gap-2">
                <Shield className="h-4 w-4 text-purple-500" /> MFA-Richtlinien
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                <div className="flex items-center gap-2 text-xs">
                  <CheckCircle2 className="h-3.5 w-3.5 text-green-400" />
                  <span>TOTP (Time-based One-Time Password) über Authenticator-App</span>
                </div>
                <div className="flex items-center gap-2 text-xs">
                  <CheckCircle2 className="h-3.5 w-3.5 text-green-400" />
                  <span>10 Wiederherstellungscodes pro Nutzer (SHA-256 gehasht)</span>
                </div>
                <div className="flex items-center gap-2 text-xs">
                  <CheckCircle2 className="h-3.5 w-3.5 text-green-400" />
                  <span>±1 Zeitfenster-Drift-Toleranz (30 Sekunden)</span>
                </div>
                <div className="flex items-center gap-2 text-xs">
                  <CheckCircle2 className="h-3.5 w-3.5 text-green-400" />
                  <span>Konstante Zeitvergleiche gegen Timing-Angriffe</span>
                </div>
                <div className="flex items-center gap-2 text-xs">
                  <CheckCircle2 className="h-3.5 w-3.5 text-green-400" />
                  <span>Admin-Sitzungslimit: 10 gleichzeitig / User-Limit: 5</span>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
