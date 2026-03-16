import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Loader2, Globe, MapPin, Activity, AlertTriangle } from 'lucide-react';
import { format } from 'date-fns';
import { de } from 'date-fns/locale';

interface HoneypotEvent {
  id: string; honeypot_type: string; attacker_ip: string;
  attack_type: string | null; protocol: string | null;
  target_port: number | null; payload: string | null;
  is_automated: boolean; geo_location: Record<string, unknown> | null;
  created_at: string;
}

interface WafEvent {
  id: string; event_type: string; source_ip: string | null;
  threat_type: string | null; request_uri: string | null;
  created_at: string;
}

export function GapThreatMap() {
  const [honeypots, setHoneypots] = useState<HoneypotEvent[]>([]);
  const [wafEvents, setWafEvents] = useState<WafEvent[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetch = async () => {
      setLoading(true);
      const [hpRes, wafRes] = await Promise.all([
        supabase.from('honeypot_events').select('*').order('created_at', { ascending: false }).limit(100),
        supabase.from('waf_event_logs').select('*').order('created_at', { ascending: false }).limit(100),
      ]);
      setHoneypots((hpRes.data || []) as HoneypotEvent[]);
      setWafEvents((wafRes.data || []) as WafEvent[]);
      setLoading(false);
    };
    fetch();
  }, []);

  // Group attacks by country from geo_location
  const countryStats = new Map<string, number>();
  honeypots.forEach(h => {
    const country = (h.geo_location as any)?.country || 'Unbekannt';
    countryStats.set(country, (countryStats.get(country) || 0) + 1);
  });
  const topCountries = Array.from(countryStats.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 15);

  // Attack type stats
  const attackTypes = new Map<string, number>();
  honeypots.forEach(h => {
    const type = h.attack_type || 'unknown';
    attackTypes.set(type, (attackTypes.get(type) || 0) + 1);
  });
  const topAttacks = Array.from(attackTypes.entries()).sort((a, b) => b[1] - a[1]).slice(0, 10);

  // Unique IPs
  const uniqueIps = new Set([...honeypots.map(h => h.attacker_ip), ...wafEvents.map(w => w.source_ip).filter(Boolean)]);

  if (loading) return <div className="flex justify-center py-8"><Loader2 className="h-6 w-6 animate-spin" /></div>;

  return (
    <div className="space-y-4">
      {/* Stats */}
      <div className="grid grid-cols-4 gap-4">
        <Card>
          <CardContent className="pt-4 pb-3 text-center">
            <p className="text-xs text-muted-foreground">Honeypot-Events</p>
            <p className="text-2xl font-bold text-red-500">{honeypots.length}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-3 text-center">
            <p className="text-xs text-muted-foreground">WAF-Events</p>
            <p className="text-2xl font-bold text-orange-500">{wafEvents.length}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-3 text-center">
            <p className="text-xs text-muted-foreground">Eindeutige IPs</p>
            <p className="text-2xl font-bold text-primary">{uniqueIps.size}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-3 text-center">
            <p className="text-xs text-muted-foreground">Länder</p>
            <p className="text-2xl font-bold text-purple-500">{countryStats.size}</p>
          </CardContent>
        </Card>
      </div>

      <div className="grid md:grid-cols-2 gap-4">
        {/* Top Countries */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm flex items-center gap-2"><MapPin className="h-4 w-4 text-red-500" /> Top Angreifer-Länder</CardTitle>
          </CardHeader>
          <CardContent>
            {topCountries.length === 0 ? (
              <p className="text-center text-muted-foreground py-6">Keine Geo-Daten</p>
            ) : (
              <div className="space-y-2">
                {topCountries.map(([country, count]) => {
                  const maxCount = topCountries[0]?.[1] || 1;
                  return (
                    <div key={country} className="flex items-center gap-3">
                      <span className="text-sm w-24 truncate">{country}</span>
                      <div className="flex-1 h-3 bg-muted rounded-full overflow-hidden">
                        <div className="h-full bg-red-500/70 rounded-full transition-all" style={{ width: `${(count / maxCount) * 100}%` }} />
                      </div>
                      <span className="text-sm font-mono w-10 text-right">{count}</span>
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Top Attack Types */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm flex items-center gap-2"><AlertTriangle className="h-4 w-4 text-orange-500" /> Top Angriffstypen</CardTitle>
          </CardHeader>
          <CardContent>
            {topAttacks.length === 0 ? (
              <p className="text-center text-muted-foreground py-6">Keine Angriffsdaten</p>
            ) : (
              <div className="space-y-2">
                {topAttacks.map(([type, count]) => {
                  const maxCount = topAttacks[0]?.[1] || 1;
                  return (
                    <div key={type} className="flex items-center gap-3">
                      <Badge variant="outline" className="text-xs w-32 justify-center">{type}</Badge>
                      <div className="flex-1 h-3 bg-muted rounded-full overflow-hidden">
                        <div className="h-full bg-orange-500/70 rounded-full transition-all" style={{ width: `${(count / maxCount) * 100}%` }} />
                      </div>
                      <span className="text-sm font-mono w-10 text-right">{count}</span>
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Recent Attacks Table */}
      <Card>
        <CardHeader>
          <CardTitle className="text-sm flex items-center gap-2"><Activity className="h-4 w-4 text-primary" /> Aktuelle Angriffe (Live-Feed)</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Quelle</TableHead><TableHead>IP</TableHead><TableHead>Typ</TableHead>
                <TableHead>Protokoll</TableHead><TableHead>Port</TableHead><TableHead>Automatisiert</TableHead>
                <TableHead>Land</TableHead><TableHead>Zeitpunkt</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {honeypots.length === 0 ? (
                <TableRow><TableCell colSpan={8} className="text-center text-muted-foreground py-8">Keine Angriffsdaten</TableCell></TableRow>
              ) : honeypots.slice(0, 25).map(h => (
                <TableRow key={h.id}>
                  <TableCell><Badge variant="outline" className="text-xs">{h.honeypot_type}</Badge></TableCell>
                  <TableCell className="font-mono text-xs">{h.attacker_ip}</TableCell>
                  <TableCell className="text-sm">{h.attack_type || '—'}</TableCell>
                  <TableCell className="text-xs">{h.protocol || '—'}</TableCell>
                  <TableCell className="font-mono text-xs">{h.target_port || '—'}</TableCell>
                  <TableCell>{h.is_automated ? <Badge className="bg-red-500/15 text-red-600 text-xs">Bot</Badge> : <Badge variant="outline" className="text-xs">Manuell</Badge>}</TableCell>
                  <TableCell className="text-xs">{(h.geo_location as any)?.country || '—'}</TableCell>
                  <TableCell className="text-xs">{format(new Date(h.created_at), 'dd.MM.yy HH:mm:ss', { locale: de })}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
