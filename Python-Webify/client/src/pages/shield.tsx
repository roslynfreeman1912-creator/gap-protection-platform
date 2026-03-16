import { useState, useEffect, useRef, useCallback } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { Link } from "wouter";
import {
  Shield, ShieldCheck, ShieldAlert, Globe, Lock, Zap, Eye, EyeOff, AlertTriangle, Activity,
  Bot, Flame, Target, ArrowLeft, Plus, Trash2, Play, Pause, Copy, Filter, Ban, BarChart3,
  Syringe, Code, Terminal, FileWarning, Search, KeyRound, Clock, MapPin, Server, Users,
  Fingerprint, Skull, Network, Radio, Settings, FileCode, ShieldOff, CheckCircle, XCircle,
  RefreshCw, Database, Wifi, WifiOff, Hash, Bug, Crosshair
} from "lucide-react";

interface ProtectedDomain {
  id: string;
  domain: string;
  originIp: string;
  proxyIp: string;
  status: "active" | "paused" | "error";
  wafEnabled: boolean;
  ddosProtection: boolean;
  botProtection: boolean;
  rateLimit: number;
  blockedRequests: number;
  totalRequests: number;
  sslEnabled: boolean;
  createdAt: string;
}

interface ThreatLog {
  id: string;
  timestamp: string;
  type: string;
  sourceIp: string;
  country: string;
  path: string;
  action: "blocked" | "challenged" | "allowed";
  severity: "critical" | "high" | "medium" | "low";
}

interface WAFRule {
  id: string;
  name: string;
  type: string;
  pattern: string;
  action: "block" | "challenge" | "log";
  enabled: boolean;
  hits: number;
}

interface IPEntry {
  id: string;
  ip: string;
  type: "blacklist" | "whitelist";
  reason: string;
  addedAt: string;
  expiresAt?: string;
  hits: number;
}

interface GeoRule {
  id: string;
  countryCode: string;
  countryName: string;
  action: "block" | "challenge" | "allow";
  enabled: boolean;
}

interface RateLimitRule {
  id: string;
  name: string;
  path: string;
  requestsPerMinute: number;
  blockDuration: number;
  enabled: boolean;
  triggered: number;
}

interface SecurityHeader {
  id: string;
  name: string;
  value: string;
  enabled: boolean;
  description: string;
}

interface BruteForceRule {
  id: string;
  name: string;
  path: string;
  maxAttempts: number;
  lockoutDuration: number;
  enabled: boolean;
  blocked: number;
}

interface Honeypot {
  id: string;
  path: string;
  type: "admin" | "login" | "api" | "backup" | "config";
  triggered: number;
  enabled: boolean;
}

interface IPReputation {
  ip: string;
  score: number;
  category: "clean" | "suspicious" | "malicious" | "tor" | "vpn" | "proxy" | "datacenter";
  lastSeen: string;
  totalRequests: number;
  blockedRequests: number;
  country: string;
}

interface AdvancedStats {
  domains: { total: number; active: number; blocked: number; requests: number };
  waf: { total: number; active: number; hits: number };
  geo: { total: number; blocking: number; challenging: number };
  rateLimits: { total: number; active: number; triggered: number };
  bruteForce: { total: number; active: number; blocked: number };
  honeypots: { total: number; active: number; triggered: number };
  ipList: { blacklisted: number; whitelisted: number };
  headers: { total: number; active: number };
  threats: { total: number; blocked: number; challenged: number };
}

const THREAT_ICONS: Record<string, typeof Syringe> = {
  sql_injection: Syringe, xss: Code, ddos: Zap, bot: Bot, rate_limit: Clock,
  scanner: Search, bruteforce: KeyRound, rce: Terminal, lfi: FileWarning,
  xxe: FileCode, ssrf: Network, nosql: Database, log4j: Bug,
};

const CATEGORY_COLORS: Record<string, string> = {
  clean: "text-green-400", suspicious: "text-yellow-400", malicious: "text-red-500",
  tor: "text-purple-400", vpn: "text-blue-400", proxy: "text-orange-400", datacenter: "text-cyan-400",
};

interface ZeroDaySignature {
  id: string;
  name: string;
  pattern: string;
  severity: string;
  cve: string;
}

function ZeroDayTab() {
  const [testPayload, setTestPayload] = useState("");
  const [testResult, setTestResult] = useState<any>(null);
  const [isLoading, setIsLoading] = useState(false);
  
  const { data: signatures } = useQuery<{ count: number; signatures: ZeroDaySignature[] }>({
    queryKey: ["/api/shield/zero-day-signatures"],
  });
  
  const testZeroDay = async () => {
    if (!testPayload.trim()) return;
    setIsLoading(true);
    try {
      const res = await apiRequest("POST", "/api/shield/zero-day-check", { payload: testPayload });
      const data = await res.json();
      setTestResult(data);
    } catch (e) {
      console.error(e);
    }
    setIsLoading(false);
  };
  
  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
      <Card className="bg-gray-900/50 border-red-900/50">
        <CardHeader>
          <CardTitle className="text-red-400 flex items-center gap-2">
            <Skull className="h-5 w-5" />
            Zero-Day Signatur-Datenbank ({signatures?.count || 0})
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-2 max-h-96 overflow-y-auto custom-scrollbar">
            {signatures?.signatures.map((sig) => (
              <div key={sig.id} className="p-3 bg-black/50 rounded-lg border border-red-900/30" data-testid={`zeroday-sig-${sig.id}`}>
                <div className="flex items-center justify-between">
                  <span className="text-red-400 font-medium">{sig.name}</span>
                  <Badge variant="outline" className={sig.severity === "critical" ? "border-red-500 text-red-400" : "border-orange-500 text-orange-400"}>
                    {sig.severity}
                  </Badge>
                </div>
                <div className="text-xs text-gray-500 mt-1">CVE: {sig.cve}</div>
                <code className="text-xs text-gray-400 block mt-1 bg-gray-900 p-1 rounded">{sig.pattern}</code>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
      
      <Card className="bg-gray-900/50 border-red-900/50">
        <CardHeader>
          <CardTitle className="text-red-400 flex items-center gap-2">
            <Bug className="h-5 w-5" />
            Zero-Day Payload Tester
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex gap-2">
            <Input
              value={testPayload}
              onChange={(e) => setTestPayload(e.target.value)}
              placeholder="Payload eingeben (z.B. ${jndi:ldap://...})"
              className="flex-1 bg-black border-red-900/50 text-red-400 font-mono"
              data-testid="input-zeroday-payload"
            />
            <Button onClick={testZeroDay} disabled={isLoading} variant="destructive" data-testid="button-test-zeroday">
              <Play className="h-4 w-4 mr-1" />Testen
            </Button>
          </div>
          
          {testResult && (
            <div className={`p-4 rounded-lg border ${testResult.verdict === "ZERO-DAY ATTACK DETECTED" ? "bg-red-950/50 border-red-500" : "bg-green-950/50 border-green-500"}`} data-testid="zeroday-result">
              <div className={`font-bold ${testResult.verdict === "ZERO-DAY ATTACK DETECTED" ? "text-red-400" : "text-green-400"}`}>
                {testResult.verdict}
              </div>
              {testResult.matches?.length > 0 && (
                <div className="mt-2 space-y-1">
                  {testResult.matches.map((m: any) => (
                    <div key={m.signatureId} className="text-xs text-red-300">
                      {m.name} ({m.cve}) - {m.severity}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
          
          <div className="text-xs text-gray-500">
            Bekannte Exploits: Log4j, Spring4Shell, ProxyShell, Confluence OGNL, F5 BIG-IP, VMware RCE, GitLab LFI, Grafana LFI, Zimbra, FortiOS
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function DDoSTab() {
  const [testIp, setTestIp] = useState("");
  const [ddosResult, setDdosResult] = useState<any>(null);
  const [isLoading, setIsLoading] = useState(false);
  
  const testDDoS = async () => {
    if (!testIp.trim()) return;
    setIsLoading(true);
    try {
      const res = await apiRequest("POST", "/api/shield/ddos-check", { ip: testIp });
      const data = await res.json();
      setDdosResult(data);
    } catch (e) {
      console.error(e);
    }
    setIsLoading(false);
  };
  
  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
      <Card className="bg-gray-900/50 border-orange-900/50">
        <CardHeader>
          <CardTitle className="text-orange-400 flex items-center gap-2">
            <Zap className="h-5 w-5" />
            DDoS-Schutz Engine
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="p-4 bg-black/50 rounded-lg border border-orange-900/30 text-center">
              <div className="text-3xl font-bold text-orange-400">100</div>
              <div className="text-xs text-gray-500">Max Verbindungen/Min</div>
            </div>
            <div className="p-4 bg-black/50 rounded-lg border border-orange-900/30 text-center">
              <div className="text-3xl font-bold text-orange-400">60s</div>
              <div className="text-xs text-gray-500">Zeitfenster</div>
            </div>
          </div>
          
          <div className="p-4 bg-orange-950/30 rounded-lg border border-orange-900/50">
            <h4 className="text-orange-400 font-medium mb-2">Schutzebenen:</h4>
            <ul className="text-sm text-gray-300 space-y-1">
              <li className="flex items-center gap-2"><ShieldCheck className="h-4 w-4 text-green-400" />Connection Tracking</li>
              <li className="flex items-center gap-2"><ShieldCheck className="h-4 w-4 text-green-400" />Rate Limiting</li>
              <li className="flex items-center gap-2"><ShieldCheck className="h-4 w-4 text-green-400" />IP Reputation Check</li>
              <li className="flex items-center gap-2"><ShieldCheck className="h-4 w-4 text-green-400" />Geo-Blocking</li>
              <li className="flex items-center gap-2"><ShieldCheck className="h-4 w-4 text-green-400" />Bot-Erkennung</li>
            </ul>
          </div>
        </CardContent>
      </Card>
      
      <Card className="bg-gray-900/50 border-orange-900/50">
        <CardHeader>
          <CardTitle className="text-orange-400 flex items-center gap-2">
            <Activity className="h-5 w-5" />
            Connection Tester
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex gap-2">
            <Input
              value={testIp}
              onChange={(e) => setTestIp(e.target.value)}
              placeholder="IP-Adresse eingeben"
              className="flex-1 bg-black border-orange-900/50 text-orange-400 font-mono"
              data-testid="input-ddos-ip"
            />
            <Button onClick={testDDoS} disabled={isLoading} variant="default" data-testid="button-test-ddos">
              <Play className="h-4 w-4 mr-1" />Prüfen
            </Button>
          </div>
          
          {ddosResult && (
            <div className={`p-4 rounded-lg border ${ddosResult.blocked ? "bg-red-950/50 border-red-500" : "bg-green-950/50 border-green-500"}`} data-testid="ddos-result">
              <div className={`font-bold ${ddosResult.blocked ? "text-red-400" : "text-green-400"}`}>
                {ddosResult.status}
              </div>
              <div className="grid grid-cols-2 gap-2 mt-2 text-sm">
                <div><span className="text-gray-500">IP:</span> <span className="text-white">{ddosResult.ip}</span></div>
                <div><span className="text-gray-500">Verbindungen:</span> <span className="text-white">{ddosResult.connectionCount}</span></div>
                <div><span className="text-gray-500">Rate/Sek:</span> <span className="text-white">{ddosResult.ratePerSecond?.toFixed(2)}</span></div>
                <div><span className="text-gray-500">Limit:</span> <span className="text-white">{ddosResult.threshold}</span></div>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function AnomalyTab() {
  const [testUrl, setTestUrl] = useState("");
  const [testBody, setTestBody] = useState("");
  const [anomalyResult, setAnomalyResult] = useState<any>(null);
  const [isLoading, setIsLoading] = useState(false);
  
  const testAnomaly = async () => {
    setIsLoading(true);
    try {
      const res = await apiRequest("POST", "/api/shield/anomaly-detect", {
        request: { url: testUrl, body: testBody }
      });
      const data = await res.json();
      setAnomalyResult(data);
    } catch (e) {
      console.error(e);
    }
    setIsLoading(false);
  };
  
  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
      <Card className="bg-gray-900/50 border-purple-900/50">
        <CardHeader>
          <CardTitle className="text-purple-400 flex items-center gap-2">
            <Bug className="h-5 w-5" />
            Anomalie-Erkennung
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="p-4 bg-purple-950/30 rounded-lg border border-purple-900/50">
            <h4 className="text-purple-400 font-medium mb-2">Erkennbare Anomalien:</h4>
            <ul className="text-sm text-gray-300 space-y-1">
              <li className="flex items-center gap-2"><CheckCircle className="h-4 w-4 text-green-400" />Doppelte URL-Kodierung</li>
              <li className="flex items-center gap-2"><CheckCircle className="h-4 w-4 text-green-400" />Null-Byte-Injektion</li>
              <li className="flex items-center gap-2"><CheckCircle className="h-4 w-4 text-green-400" />Unicode-Bypass-Versuche</li>
              <li className="flex items-center gap-2"><CheckCircle className="h-4 w-4 text-green-400" />Sonderzeichen-Überfluss</li>
              <li className="flex items-center gap-2"><CheckCircle className="h-4 w-4 text-green-400" />Serialisierungsangriffe</li>
              <li className="flex items-center gap-2"><CheckCircle className="h-4 w-4 text-green-400" />Header-Injection</li>
            </ul>
          </div>
        </CardContent>
      </Card>
      
      <Card className="bg-gray-900/50 border-purple-900/50">
        <CardHeader>
          <CardTitle className="text-purple-400 flex items-center gap-2">
            <Search className="h-5 w-5" />
            Anomalie-Tester
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <Input
            value={testUrl}
            onChange={(e) => setTestUrl(e.target.value)}
            placeholder="URL (z.B. /path%252f../etc/passwd)"
            className="bg-black border-purple-900/50 text-purple-400 font-mono"
            data-testid="input-anomaly-url"
          />
          <Input
            value={testBody}
            onChange={(e) => setTestBody(e.target.value)}
            placeholder="Body (z.B. test%00null)"
            className="bg-black border-purple-900/50 text-purple-400 font-mono"
            data-testid="input-anomaly-body"
          />
          <Button onClick={testAnomaly} disabled={isLoading} variant="secondary" className="w-full" data-testid="button-test-anomaly">
            <Play className="h-4 w-4 mr-1" />Analysieren
          </Button>
          
          {anomalyResult && (
            <div className={`p-4 rounded-lg border ${anomalyResult.verdict === "malicious" ? "bg-red-950/50 border-red-500" : anomalyResult.verdict === "suspicious" ? "bg-yellow-950/50 border-yellow-500" : "bg-green-950/50 border-green-500"}`} data-testid="anomaly-result">
              <div className="flex justify-between items-center">
                <span className={`font-bold ${anomalyResult.verdict === "malicious" ? "text-red-400" : anomalyResult.verdict === "suspicious" ? "text-yellow-400" : "text-green-400"}`}>
                  {anomalyResult.verdict === "malicious" ? "BÖSARTIG" : anomalyResult.verdict === "suspicious" ? "VERDÄCHTIG" : "NORMAL"}
                </span>
                <Badge variant="outline" className="text-white">Score: {anomalyResult.score}/{anomalyResult.maxScore}</Badge>
              </div>
              {anomalyResult.detections?.length > 0 && (
                <div className="mt-2 space-y-1">
                  {anomalyResult.detections.map((d: any, i: number) => (
                    <div key={i} className="text-xs text-red-300 flex justify-between">
                      <span>{d.type}: {d.description}</span>
                      <span className="text-yellow-400">+{d.score}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

export default function ShieldPage() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState("overview");
  const [newDomain, setNewDomain] = useState("");
  const [newOriginIp, setNewOriginIp] = useState("");
  const [isAddingDomain, setIsAddingDomain] = useState(false);
  const [newIp, setNewIp] = useState("");
  const [newIpType, setNewIpType] = useState<"blacklist" | "whitelist">("blacklist");
  const [newIpReason, setNewIpReason] = useState("");
  const [isAddingIp, setIsAddingIp] = useState(false);
  const [checkIpInput, setCheckIpInput] = useState("");
  const [ipCheckResult, setIpCheckResult] = useState<IPReputation | null>(null);
  const terminalRef = useRef<HTMLDivElement>(null);
  const [terminalLogs, setTerminalLogs] = useState<string[]>([]);

  const addTerminalLog = useCallback((message: string, type: string = "INFO") => {
    const timestamp = new Date().toLocaleTimeString("de-DE");
    setTerminalLogs(prev => [...prev.slice(-100), `[${timestamp}] [${type}] ${message}`]);
  }, []);

  const { data: domains = [] } = useQuery<ProtectedDomain[]>({ queryKey: ["/api/shield/domains"], refetchInterval: 5000 });
  const { data: wafRules = [] } = useQuery<WAFRule[]>({ queryKey: ["/api/shield/waf-rules"], refetchInterval: 10000 });
  const { data: threats = [] } = useQuery<ThreatLog[]>({ queryKey: ["/api/shield/threats"], refetchInterval: 3000 });
  const { data: ipListData = [] } = useQuery<IPEntry[]>({ queryKey: ["/api/shield/ip-list"], refetchInterval: 10000 });
  const { data: geoRules = [] } = useQuery<GeoRule[]>({ queryKey: ["/api/shield/geo-rules"], refetchInterval: 10000 });
  const { data: rateLimits = [] } = useQuery<RateLimitRule[]>({ queryKey: ["/api/shield/rate-limits"], refetchInterval: 10000 });
  const { data: secHeaders = [] } = useQuery<SecurityHeader[]>({ queryKey: ["/api/shield/security-headers"], refetchInterval: 10000 });
  const { data: bruteForceRules = [] } = useQuery<BruteForceRule[]>({ queryKey: ["/api/shield/brute-force"], refetchInterval: 10000 });
  const { data: honeypots = [] } = useQuery<Honeypot[]>({ queryKey: ["/api/shield/honeypots"], refetchInterval: 10000 });
  const { data: advancedStats } = useQuery<AdvancedStats>({ queryKey: ["/api/shield/advanced-stats"], refetchInterval: 5000 });

  const addDomainMutation = useMutation({
    mutationFn: async (data: { domain: string; originIp: string }) => {
      const res = await apiRequest("POST", "/api/shield/domains", data);
      return res.json();
    },
    onSuccess: (newDomain) => {
      queryClient.invalidateQueries({ queryKey: ["/api/shield/domains"] });
      queryClient.invalidateQueries({ queryKey: ["/api/shield/advanced-stats"] });
      addTerminalLog(`Domain ${newDomain.domain} added to protection`, "INFO");
      toast({ title: "Erfolg", description: `${newDomain.domain} wurde geschutzt` });
      setNewDomain(""); setNewOriginIp(""); setIsAddingDomain(false);
    },
  });

  const updateDomainMutation = useMutation({
    mutationFn: async ({ id, updates }: { id: string; updates: Partial<ProtectedDomain> }) => {
      const res = await apiRequest("PATCH", `/api/shield/domains/${id}`, updates);
      return res.json();
    },
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["/api/shield/domains"] }); },
  });

  const deleteDomainMutation = useMutation({
    mutationFn: async (id: string) => { await apiRequest("DELETE", `/api/shield/domains/${id}`); return id; },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/shield/domains"] });
      queryClient.invalidateQueries({ queryKey: ["/api/shield/advanced-stats"] });
    },
  });

  const updateRuleMutation = useMutation({
    mutationFn: async ({ id, enabled }: { id: string; enabled: boolean }) => {
      const res = await apiRequest("PATCH", `/api/shield/waf-rules/${id}`, { enabled });
      return res.json();
    },
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["/api/shield/waf-rules"] }); },
  });

  const addIpMutation = useMutation({
    mutationFn: async (data: { ip: string; type: string; reason: string }) => {
      const res = await apiRequest("POST", "/api/shield/ip-list", data);
      return res.json();
    },
    onSuccess: (entry) => {
      queryClient.invalidateQueries({ queryKey: ["/api/shield/ip-list"] });
      addTerminalLog(`IP ${entry.ip} added to ${entry.type}`, entry.type === "blacklist" ? "BLOCK" : "INFO");
      toast({ title: "Erfolg", description: `IP wurde zur ${entry.type === "blacklist" ? "Blacklist" : "Whitelist"} hinzugefugt` });
      setNewIp(""); setNewIpReason(""); setIsAddingIp(false);
    },
  });

  const deleteIpMutation = useMutation({
    mutationFn: async (id: string) => { await apiRequest("DELETE", `/api/shield/ip-list/${id}`); return id; },
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["/api/shield/ip-list"] }); },
  });

  const updateGeoMutation = useMutation({
    mutationFn: async ({ id, updates }: { id: string; updates: Partial<GeoRule> }) => {
      const res = await apiRequest("PATCH", `/api/shield/geo-rules/${id}`, updates);
      return res.json();
    },
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["/api/shield/geo-rules"] }); },
  });

  const updateRateLimitMutation = useMutation({
    mutationFn: async ({ id, updates }: { id: string; updates: Partial<RateLimitRule> }) => {
      const res = await apiRequest("PATCH", `/api/shield/rate-limits/${id}`, updates);
      return res.json();
    },
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["/api/shield/rate-limits"] }); },
  });

  const updateHeaderMutation = useMutation({
    mutationFn: async ({ id, enabled }: { id: string; enabled: boolean }) => {
      const res = await apiRequest("PATCH", `/api/shield/security-headers/${id}`, { enabled });
      return res.json();
    },
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["/api/shield/security-headers"] }); },
  });

  const updateBruteForceMutation = useMutation({
    mutationFn: async ({ id, enabled }: { id: string; enabled: boolean }) => {
      const res = await apiRequest("PATCH", `/api/shield/brute-force/${id}`, { enabled });
      return res.json();
    },
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["/api/shield/brute-force"] }); },
  });

  const updateHoneypotMutation = useMutation({
    mutationFn: async ({ id, enabled }: { id: string; enabled: boolean }) => {
      const res = await apiRequest("PATCH", `/api/shield/honeypots/${id}`, { enabled });
      return res.json();
    },
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["/api/shield/honeypots"] }); },
  });

  const checkIpMutation = useMutation({
    mutationFn: async (ip: string) => {
      const res = await apiRequest("POST", "/api/shield/check-ip", { ip });
      return res.json();
    },
    onSuccess: (result) => {
      setIpCheckResult(result);
      addTerminalLog(`IP Check: ${result.ip} - ${result.category} (Score: ${result.score})`, result.score < 50 ? "WARN" : "INFO");
    },
  });

  useEffect(() => {
    if (terminalRef.current) terminalRef.current.scrollTop = terminalRef.current.scrollHeight;
  }, [terminalLogs]);

  useEffect(() => {
    addTerminalLog("TEUFEL SHIELD v3.0 ADVANCED initialized", "INFO");
    addTerminalLog("WAF Engine: 10 RULES ACTIVE", "INFO");
    addTerminalLog("Geo-Blocking: ENABLED", "INFO");
    addTerminalLog("Honeypot Traps: 8 ACTIVE", "INFO");
    addTerminalLog("IP Reputation: ONLINE", "INFO");
    addTerminalLog("Bot Detection: RUNNING", "INFO");
  }, [addTerminalLog]);

  const getThreatIcon = (type: string) => THREAT_ICONS[type] || AlertTriangle;

  return (
    <div className="min-h-screen bg-black text-green-400 font-mono">
      <div className="fixed inset-0 bg-gradient-to-b from-black via-gray-950 to-black pointer-events-none" />
      
      <div className="relative z-10">
        <header className="border-b border-green-900/50 bg-black/80 backdrop-blur-sm sticky top-0 z-50">
          <div className="container mx-auto px-4 py-4">
            <div className="flex items-center justify-between gap-4 flex-wrap">
              <div className="flex items-center gap-4">
                <Link href="/"><Button variant="ghost" size="icon" className="text-green-400" data-testid="button-back"><ArrowLeft className="h-5 w-5" /></Button></Link>
                <div className="flex items-center gap-3">
                  <div className="relative">
                    <Shield className="h-10 w-10 text-green-500" />
                    <div className="absolute -top-1 -right-1 h-3 w-3 bg-green-500 rounded-full animate-pulse" />
                  </div>
                  <div>
                    <h1 className="text-2xl font-bold text-green-400 tracking-wider" data-testid="text-title">TEUFEL SHIELD</h1>
                    <p className="text-xs text-green-600">Advanced WAF & Protection System</p>
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-2 flex-wrap">
                <Badge variant="outline" className="border-green-500 text-green-400 bg-green-500/10"><Activity className="h-3 w-3 mr-1 animate-pulse" />LIVE</Badge>
                <Badge variant="outline" className="border-red-500 text-red-400 bg-red-500/10"><Ban className="h-3 w-3 mr-1" />{advancedStats?.threats.blocked || 0} BLOCKED</Badge>
                <Badge variant="outline" className="border-purple-500 text-purple-400 bg-purple-500/10"><Crosshair className="h-3 w-3 mr-1" />{advancedStats?.honeypots.triggered || 0} TRAPS</Badge>
              </div>
            </div>
          </div>
        </header>

        <main className="container mx-auto px-4 py-6">
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 mb-6">
            <Card className="bg-gray-900/50 border-green-900/50">
              <CardContent className="pt-4">
                <div className="flex items-center gap-3">
                  <Globe className="h-5 w-5 text-green-400" />
                  <div>
                    <p className="text-xs text-gray-400">Domains</p>
                    <p className="text-lg font-bold text-green-400">{advancedStats?.domains.active || 0}</p>
                  </div>
                </div>
              </CardContent>
            </Card>
            <Card className="bg-gray-900/50 border-green-900/50">
              <CardContent className="pt-4">
                <div className="flex items-center gap-3">
                  <Filter className="h-5 w-5 text-blue-400" />
                  <div>
                    <p className="text-xs text-gray-400">WAF Rules</p>
                    <p className="text-lg font-bold text-blue-400">{advancedStats?.waf.active || 0}</p>
                  </div>
                </div>
              </CardContent>
            </Card>
            <Card className="bg-gray-900/50 border-green-900/50">
              <CardContent className="pt-4">
                <div className="flex items-center gap-3">
                  <MapPin className="h-5 w-5 text-purple-400" />
                  <div>
                    <p className="text-xs text-gray-400">Geo-Blocks</p>
                    <p className="text-lg font-bold text-purple-400">{advancedStats?.geo.blocking || 0}</p>
                  </div>
                </div>
              </CardContent>
            </Card>
            <Card className="bg-gray-900/50 border-green-900/50">
              <CardContent className="pt-4">
                <div className="flex items-center gap-3">
                  <Skull className="h-5 w-5 text-red-400" />
                  <div>
                    <p className="text-xs text-gray-400">Blacklisted</p>
                    <p className="text-lg font-bold text-red-400">{advancedStats?.ipList.blacklisted || 0}</p>
                  </div>
                </div>
              </CardContent>
            </Card>
            <Card className="bg-gray-900/50 border-green-900/50">
              <CardContent className="pt-4">
                <div className="flex items-center gap-3">
                  <Crosshair className="h-5 w-5 text-orange-400" />
                  <div>
                    <p className="text-xs text-gray-400">Honeypots</p>
                    <p className="text-lg font-bold text-orange-400">{advancedStats?.honeypots.active || 0}</p>
                  </div>
                </div>
              </CardContent>
            </Card>
            <Card className="bg-gray-900/50 border-green-900/50">
              <CardContent className="pt-4">
                <div className="flex items-center gap-3">
                  <Lock className="h-5 w-5 text-cyan-400" />
                  <div>
                    <p className="text-xs text-gray-400">Headers</p>
                    <p className="text-lg font-bold text-cyan-400">{advancedStats?.headers.active || 0}</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>

          <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-4">
            <TabsList className="bg-gray-900/50 border border-green-900/50 flex-wrap h-auto gap-1 p-1">
              <TabsTrigger value="overview" className="data-[state=active]:bg-green-900/50 data-[state=active]:text-green-400" data-testid="tab-overview"><BarChart3 className="h-4 w-4 mr-1" />Overview</TabsTrigger>
              <TabsTrigger value="domains" className="data-[state=active]:bg-green-900/50 data-[state=active]:text-green-400" data-testid="tab-domains"><Globe className="h-4 w-4 mr-1" />Domains</TabsTrigger>
              <TabsTrigger value="waf" className="data-[state=active]:bg-green-900/50 data-[state=active]:text-green-400" data-testid="tab-waf"><Filter className="h-4 w-4 mr-1" />WAF ({advancedStats?.waf?.total || 0})</TabsTrigger>
              <TabsTrigger value="ip-list" className="data-[state=active]:bg-green-900/50 data-[state=active]:text-green-400" data-testid="tab-ip-list"><Ban className="h-4 w-4 mr-1" />IP List</TabsTrigger>
              <TabsTrigger value="geo" className="data-[state=active]:bg-green-900/50 data-[state=active]:text-green-400" data-testid="tab-geo"><MapPin className="h-4 w-4 mr-1" />Geo</TabsTrigger>
              <TabsTrigger value="rate-limit" className="data-[state=active]:bg-green-900/50 data-[state=active]:text-green-400" data-testid="tab-rate-limit"><Clock className="h-4 w-4 mr-1" />Rate Limit</TabsTrigger>
              <TabsTrigger value="brute-force" className="data-[state=active]:bg-green-900/50 data-[state=active]:text-green-400" data-testid="tab-brute-force"><KeyRound className="h-4 w-4 mr-1" />Brute Force</TabsTrigger>
              <TabsTrigger value="honeypots" className="data-[state=active]:bg-green-900/50 data-[state=active]:text-green-400" data-testid="tab-honeypots"><Crosshair className="h-4 w-4 mr-1" />Honeypots ({advancedStats?.honeypots?.total || 0})</TabsTrigger>
              <TabsTrigger value="headers" className="data-[state=active]:bg-green-900/50 data-[state=active]:text-green-400" data-testid="tab-headers"><FileCode className="h-4 w-4 mr-1" />Headers ({advancedStats?.headers?.total || 0})</TabsTrigger>
              <TabsTrigger value="zero-day" className="data-[state=active]:bg-red-900/50 data-[state=active]:text-red-400" data-testid="tab-zero-day"><Skull className="h-4 w-4 mr-1" />Zero-Day</TabsTrigger>
              <TabsTrigger value="ddos" className="data-[state=active]:bg-orange-900/50 data-[state=active]:text-orange-400" data-testid="tab-ddos"><Zap className="h-4 w-4 mr-1" />DDoS</TabsTrigger>
              <TabsTrigger value="anomaly" className="data-[state=active]:bg-purple-900/50 data-[state=active]:text-purple-400" data-testid="tab-anomaly"><Bug className="h-4 w-4 mr-1" />Anomaly</TabsTrigger>
              <TabsTrigger value="reputation" className="data-[state=active]:bg-green-900/50 data-[state=active]:text-green-400" data-testid="tab-reputation"><Fingerprint className="h-4 w-4 mr-1" />IP Intel</TabsTrigger>
              <TabsTrigger value="threats" className="data-[state=active]:bg-green-900/50 data-[state=active]:text-green-400" data-testid="tab-threats"><AlertTriangle className="h-4 w-4 mr-1" />Threats</TabsTrigger>
            </TabsList>

            <TabsContent value="overview" className="space-y-4">
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                <Card className="bg-gray-900/50 border-green-900/50">
                  <CardHeader><CardTitle className="text-green-400 flex items-center gap-2"><Activity className="h-5 w-5" />Live Terminal</CardTitle></CardHeader>
                  <CardContent>
                    <div ref={terminalRef} className="bg-black rounded-lg p-4 h-80 overflow-y-auto font-mono text-sm border border-green-900/30 custom-scrollbar" data-testid="terminal-output">
                      {terminalLogs.map((log, i) => (
                        <div key={i} className={`${log.includes("[BLOCK]") ? "text-red-400" : log.includes("[WARN]") ? "text-yellow-400" : "text-green-400"}`}>{log}</div>
                      ))}
                      <div className="flex items-center gap-2 mt-2"><span className="text-green-500">teufel@shield:~$</span><span className="animate-pulse">_</span></div>
                    </div>
                  </CardContent>
                </Card>
                <Card className="bg-gray-900/50 border-green-900/50">
                  <CardHeader><CardTitle className="text-green-400 flex items-center gap-2"><Target className="h-5 w-5" />Protection Status</CardTitle></CardHeader>
                  <CardContent>
                    <div className="space-y-3">
                      {[
                        { name: "WAF Engine", active: (advancedStats?.waf.active || 0) > 0, count: advancedStats?.waf.hits || 0, icon: Filter },
                        { name: "Geo-Blocking", active: (advancedStats?.geo.blocking || 0) > 0, count: advancedStats?.geo.blocking || 0, icon: MapPin },
                        { name: "Rate Limiting", active: (advancedStats?.rateLimits.active || 0) > 0, count: advancedStats?.rateLimits.triggered || 0, icon: Clock },
                        { name: "Brute Force Protection", active: (advancedStats?.bruteForce.active || 0) > 0, count: advancedStats?.bruteForce.blocked || 0, icon: KeyRound },
                        { name: "Honeypot Traps", active: (advancedStats?.honeypots.active || 0) > 0, count: advancedStats?.honeypots.triggered || 0, icon: Crosshair },
                        { name: "Security Headers", active: (advancedStats?.headers.active || 0) > 0, count: advancedStats?.headers.active || 0, icon: FileCode },
                        { name: "IP Blacklist", active: (advancedStats?.ipList.blacklisted || 0) > 0, count: advancedStats?.ipList.blacklisted || 0, icon: Ban },
                      ].map((item) => (
                        <div key={item.name} className="flex items-center justify-between p-3 rounded-lg bg-gray-800/50 border border-gray-700">
                          <div className="flex items-center gap-3">
                            <item.icon className={`h-5 w-5 ${item.active ? "text-green-400" : "text-gray-500"}`} />
                            <span className={item.active ? "text-white" : "text-gray-500"}>{item.name}</span>
                          </div>
                          <div className="flex items-center gap-2">
                            <Badge variant="outline" className="border-gray-600 text-gray-400">{item.count}</Badge>
                            {item.active ? <CheckCircle className="h-4 w-4 text-green-400" /> : <XCircle className="h-4 w-4 text-gray-500" />}
                          </div>
                        </div>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              </div>
              <Card className="bg-gray-900/50 border-green-900/50">
                <CardHeader><CardTitle className="text-green-400 flex items-center gap-2"><Flame className="h-5 w-5 text-orange-500" />Real-Time Threat Feed</CardTitle></CardHeader>
                <CardContent>
                  <div className="space-y-2 max-h-60 overflow-y-auto custom-scrollbar">
                    {threats.slice(0, 10).map((threat) => {
                      const IconComponent = getThreatIcon(threat.type);
                      return (
                        <div key={threat.id} className={`flex items-center justify-between p-3 rounded-lg ${threat.action === "blocked" ? "bg-red-900/20 border border-red-900/30" : "bg-yellow-900/20 border border-yellow-900/30"}`}>
                          <div className="flex items-center gap-3">
                            <IconComponent className="h-5 w-5 text-red-400" />
                            <div>
                              <p className="text-sm font-medium text-white">{threat.type.replace(/_/g, " ").toUpperCase()}</p>
                              <p className="text-xs text-gray-400">{threat.sourceIp} ({threat.country}) - {threat.path}</p>
                            </div>
                          </div>
                          <Badge variant="outline" className={threat.action === "blocked" ? "border-red-500 text-red-400" : "border-yellow-500 text-yellow-400"}>{threat.action.toUpperCase()}</Badge>
                        </div>
                      );
                    })}
                    {threats.length === 0 && <div className="text-center py-8 text-gray-500"><Shield className="h-12 w-12 mx-auto mb-2 opacity-50" /><p>No threats detected</p></div>}
                  </div>
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="domains" className="space-y-4">
              <Card className="bg-gray-900/50 border-green-900/50">
                <CardHeader>
                  <div className="flex items-center justify-between gap-4 flex-wrap">
                    <CardTitle className="text-green-400 flex items-center gap-2"><Globe className="h-5 w-5" />Protected Domains</CardTitle>
                    <Button onClick={() => setIsAddingDomain(true)} variant="default" data-testid="button-add-domain"><Plus className="h-4 w-4 mr-2" />Add Domain</Button>
                  </div>
                </CardHeader>
                <CardContent>
                  {isAddingDomain && (
                    <div className="mb-6 p-4 bg-gray-800/50 rounded-lg border border-green-900/30">
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
                        <div><label className="text-sm text-gray-400 mb-2 block">Domain</label><Input placeholder="example.com" value={newDomain} onChange={(e) => setNewDomain(e.target.value)} className="bg-gray-900 border-green-900/50 text-green-400" data-testid="input-domain" /></div>
                        <div><label className="text-sm text-gray-400 mb-2 block">Origin IP</label><Input placeholder="192.168.1.100" value={newOriginIp} onChange={(e) => setNewOriginIp(e.target.value)} className="bg-gray-900 border-green-900/50 text-green-400" data-testid="input-origin-ip" /></div>
                      </div>
                      <div className="flex gap-2">
                        <Button onClick={() => addDomainMutation.mutate({ domain: newDomain, originIp: newOriginIp })} variant="default" disabled={addDomainMutation.isPending} data-testid="button-confirm-add"><ShieldCheck className="h-4 w-4 mr-2" />{addDomainMutation.isPending ? "Adding..." : "Protect"}</Button>
                        <Button variant="outline" onClick={() => setIsAddingDomain(false)} data-testid="button-cancel-add">Cancel</Button>
                      </div>
                    </div>
                  )}
                  <div className="space-y-4">
                    {domains.map((domain) => (
                      <div key={domain.id} className={`p-4 rounded-lg border ${domain.status === "active" ? "bg-green-900/10 border-green-900/30" : "bg-gray-800/50 border-gray-700"}`} data-testid={`domain-${domain.id}`}>
                        <div className="flex items-center justify-between mb-4 gap-4 flex-wrap">
                          <div className="flex items-center gap-3">
                            <div className={`p-2 rounded-lg ${domain.status === "active" ? "bg-green-500/20" : "bg-gray-700"}`}>{domain.status === "active" ? <ShieldCheck className="h-6 w-6 text-green-400" /> : <ShieldAlert className="h-6 w-6 text-gray-500" />}</div>
                            <div><h3 className="text-lg font-medium text-white">{domain.domain}</h3><p className="text-sm text-gray-400">Proxy: {domain.proxyIp}</p></div>
                          </div>
                          <div className="flex items-center gap-2">
                            <Button variant="ghost" size="icon" onClick={() => navigator.clipboard.writeText(domain.proxyIp)} className="text-gray-400" data-testid={`button-copy-${domain.id}`}><Copy className="h-4 w-4" /></Button>
                            <Button variant="ghost" size="icon" onClick={() => updateDomainMutation.mutate({ id: domain.id, updates: { status: domain.status === "active" ? "paused" : "active" } })} className={domain.status === "active" ? "text-green-400" : "text-gray-400"} data-testid={`button-toggle-${domain.id}`}>{domain.status === "active" ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}</Button>
                            <Button variant="ghost" size="icon" onClick={() => deleteDomainMutation.mutate(domain.id)} className="text-red-400" data-testid={`button-remove-${domain.id}`}><Trash2 className="h-4 w-4" /></Button>
                          </div>
                        </div>
                        <div className="flex flex-wrap gap-2">
                          <Badge variant="outline" className={domain.wafEnabled ? "border-green-500 text-green-400" : "border-gray-600 text-gray-500"}><Filter className="h-3 w-3 mr-1" />WAF</Badge>
                          <Badge variant="outline" className={domain.ddosProtection ? "border-green-500 text-green-400" : "border-gray-600 text-gray-500"}><Zap className="h-3 w-3 mr-1" />DDoS</Badge>
                          <Badge variant="outline" className={domain.botProtection ? "border-green-500 text-green-400" : "border-gray-600 text-gray-500"}><Bot className="h-3 w-3 mr-1" />Bot</Badge>
                          <Badge variant="outline" className={domain.sslEnabled ? "border-green-500 text-green-400" : "border-gray-600 text-gray-500"}><Lock className="h-3 w-3 mr-1" />SSL</Badge>
                        </div>
                      </div>
                    ))}
                    {domains.length === 0 && <div className="text-center py-12 text-gray-500"><Shield className="h-16 w-16 mx-auto mb-4 opacity-50" /><p>No domains protected yet</p></div>}
                  </div>
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="waf" className="space-y-4">
              <Card className="bg-gray-900/50 border-green-900/50">
                <CardHeader><CardTitle className="text-green-400 flex items-center gap-2"><Filter className="h-5 w-5" />WAF Rules Engine ({wafRules.length} Rules)</CardTitle></CardHeader>
                <CardContent>
                  <div className="space-y-3">
                    {wafRules.map((rule) => (
                      <div key={rule.id} className={`flex items-center justify-between p-4 rounded-lg border gap-4 flex-wrap ${rule.enabled ? "bg-green-900/10 border-green-900/30" : "bg-gray-800/50 border-gray-700"}`} data-testid={`waf-rule-${rule.id}`}>
                        <div className="flex items-center gap-4">
                          <Switch checked={rule.enabled} onCheckedChange={(checked) => updateRuleMutation.mutate({ id: rule.id, enabled: checked })} data-testid={`switch-rule-${rule.id}`} />
                          <div><h4 className="font-medium text-white">{rule.name}</h4><p className="text-xs text-gray-500 font-mono">{rule.pattern.substring(0, 40)}...</p></div>
                        </div>
                        <div className="flex items-center gap-4">
                          <Badge variant="outline" className={rule.action === "block" ? "border-red-500 text-red-400" : rule.action === "challenge" ? "border-yellow-500 text-yellow-400" : "border-blue-500 text-blue-400"}>{rule.action.toUpperCase()}</Badge>
                          <div className="text-right"><p className="text-sm text-gray-400">Hits</p><p className="font-bold text-green-400">{rule.hits.toLocaleString()}</p></div>
                        </div>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="ip-list" className="space-y-4">
              <Card className="bg-gray-900/50 border-green-900/50">
                <CardHeader>
                  <div className="flex items-center justify-between gap-4 flex-wrap">
                    <CardTitle className="text-green-400 flex items-center gap-2"><Ban className="h-5 w-5" />IP Blacklist / Whitelist</CardTitle>
                    <Button onClick={() => setIsAddingIp(true)} variant="default" data-testid="button-add-ip"><Plus className="h-4 w-4 mr-2" />Add IP</Button>
                  </div>
                </CardHeader>
                <CardContent>
                  {isAddingIp && (
                    <div className="mb-6 p-4 bg-gray-800/50 rounded-lg border border-green-900/30">
                      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
                        <div><label className="text-sm text-gray-400 mb-2 block">IP Address</label><Input placeholder="192.168.1.100" value={newIp} onChange={(e) => setNewIp(e.target.value)} className="bg-gray-900 border-green-900/50 text-green-400" data-testid="input-new-ip" /></div>
                        <div><label className="text-sm text-gray-400 mb-2 block">Type</label>
                          <Select value={newIpType} onValueChange={(v) => setNewIpType(v as "blacklist" | "whitelist")}>
                            <SelectTrigger className="bg-gray-900 border-green-900/50 text-green-400"><SelectValue /></SelectTrigger>
                            <SelectContent><SelectItem value="blacklist">Blacklist</SelectItem><SelectItem value="whitelist">Whitelist</SelectItem></SelectContent>
                          </Select>
                        </div>
                        <div><label className="text-sm text-gray-400 mb-2 block">Reason</label><Input placeholder="Attack source" value={newIpReason} onChange={(e) => setNewIpReason(e.target.value)} className="bg-gray-900 border-green-900/50 text-green-400" data-testid="input-ip-reason" /></div>
                      </div>
                      <div className="flex gap-2">
                        <Button onClick={() => addIpMutation.mutate({ ip: newIp, type: newIpType, reason: newIpReason })} variant="default" disabled={addIpMutation.isPending} data-testid="button-confirm-add-ip">{newIpType === "blacklist" ? <Ban className="h-4 w-4 mr-2" /> : <CheckCircle className="h-4 w-4 mr-2" />}{addIpMutation.isPending ? "Adding..." : "Add"}</Button>
                        <Button variant="outline" onClick={() => setIsAddingIp(false)}>Cancel</Button>
                      </div>
                    </div>
                  )}
                  <div className="space-y-3">
                    {ipListData.map((entry) => (
                      <div key={entry.id} className={`flex items-center justify-between p-4 rounded-lg border gap-4 ${entry.type === "blacklist" ? "bg-red-900/10 border-red-900/30" : "bg-green-900/10 border-green-900/30"}`} data-testid={`ip-entry-${entry.id}`}>
                        <div className="flex items-center gap-4">
                          {entry.type === "blacklist" ? <Ban className="h-5 w-5 text-red-400" /> : <CheckCircle className="h-5 w-5 text-green-400" />}
                          <div><p className="font-mono text-white">{entry.ip}</p><p className="text-xs text-gray-400">{entry.reason}</p></div>
                        </div>
                        <div className="flex items-center gap-4">
                          <Badge variant="outline" className={entry.type === "blacklist" ? "border-red-500 text-red-400" : "border-green-500 text-green-400"}>{entry.type.toUpperCase()}</Badge>
                          <Button variant="ghost" size="icon" onClick={() => deleteIpMutation.mutate(entry.id)} className="text-red-400" data-testid={`button-delete-ip-${entry.id}`}><Trash2 className="h-4 w-4" /></Button>
                        </div>
                      </div>
                    ))}
                    {ipListData.length === 0 && <div className="text-center py-8 text-gray-500"><Ban className="h-12 w-12 mx-auto mb-2 opacity-50" /><p>No IPs in list</p></div>}
                  </div>
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="geo" className="space-y-4">
              <Card className="bg-gray-900/50 border-green-900/50">
                <CardHeader><CardTitle className="text-green-400 flex items-center gap-2"><MapPin className="h-5 w-5" />Geo-Blocking Rules</CardTitle></CardHeader>
                <CardContent>
                  <div className="space-y-3">
                    {geoRules.map((rule) => (
                      <div key={rule.id} className={`flex items-center justify-between p-4 rounded-lg border gap-4 ${rule.enabled ? (rule.action === "block" ? "bg-red-900/10 border-red-900/30" : rule.action === "challenge" ? "bg-yellow-900/10 border-yellow-900/30" : "bg-green-900/10 border-green-900/30") : "bg-gray-800/50 border-gray-700"}`} data-testid={`geo-rule-${rule.id}`}>
                        <div className="flex items-center gap-4">
                          <Switch checked={rule.enabled} onCheckedChange={(checked) => updateGeoMutation.mutate({ id: rule.id, updates: { enabled: checked } })} data-testid={`switch-geo-${rule.id}`} />
                          <div><p className="font-medium text-white">{rule.countryName}</p><p className="text-xs text-gray-400 font-mono">{rule.countryCode}</p></div>
                        </div>
                        <Select value={rule.action} onValueChange={(v) => updateGeoMutation.mutate({ id: rule.id, updates: { action: v as "block" | "challenge" | "allow" } })}>
                          <SelectTrigger className="w-32 bg-gray-900 border-green-900/50"><SelectValue /></SelectTrigger>
                          <SelectContent><SelectItem value="block">Block</SelectItem><SelectItem value="challenge">Challenge</SelectItem><SelectItem value="allow">Allow</SelectItem></SelectContent>
                        </Select>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="rate-limit" className="space-y-4">
              <Card className="bg-gray-900/50 border-green-900/50">
                <CardHeader><CardTitle className="text-green-400 flex items-center gap-2"><Clock className="h-5 w-5" />Rate Limiting Rules</CardTitle></CardHeader>
                <CardContent>
                  <div className="space-y-3">
                    {rateLimits.map((rule) => (
                      <div key={rule.id} className={`flex items-center justify-between p-4 rounded-lg border gap-4 flex-wrap ${rule.enabled ? "bg-green-900/10 border-green-900/30" : "bg-gray-800/50 border-gray-700"}`} data-testid={`rate-limit-${rule.id}`}>
                        <div className="flex items-center gap-4">
                          <Switch checked={rule.enabled} onCheckedChange={(checked) => updateRateLimitMutation.mutate({ id: rule.id, updates: { enabled: checked } })} data-testid={`switch-rate-${rule.id}`} />
                          <div><h4 className="font-medium text-white">{rule.name}</h4><p className="text-xs text-gray-500 font-mono">{rule.path}</p></div>
                        </div>
                        <div className="flex items-center gap-4">
                          <div className="text-center"><p className="text-xs text-gray-400">Req/min</p><p className="font-bold text-blue-400">{rule.requestsPerMinute}</p></div>
                          <div className="text-center"><p className="text-xs text-gray-400">Block (s)</p><p className="font-bold text-orange-400">{rule.blockDuration}</p></div>
                          <div className="text-center"><p className="text-xs text-gray-400">Triggered</p><p className="font-bold text-red-400">{rule.triggered}</p></div>
                        </div>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="brute-force" className="space-y-4">
              <Card className="bg-gray-900/50 border-green-900/50">
                <CardHeader><CardTitle className="text-green-400 flex items-center gap-2"><KeyRound className="h-5 w-5" />Brute Force Protection</CardTitle></CardHeader>
                <CardContent>
                  <div className="space-y-3">
                    {bruteForceRules.map((rule) => (
                      <div key={rule.id} className={`flex items-center justify-between p-4 rounded-lg border gap-4 flex-wrap ${rule.enabled ? "bg-green-900/10 border-green-900/30" : "bg-gray-800/50 border-gray-700"}`} data-testid={`brute-force-${rule.id}`}>
                        <div className="flex items-center gap-4">
                          <Switch checked={rule.enabled} onCheckedChange={(checked) => updateBruteForceMutation.mutate({ id: rule.id, enabled: checked })} data-testid={`switch-brute-${rule.id}`} />
                          <div><h4 className="font-medium text-white">{rule.name}</h4><p className="text-xs text-gray-500 font-mono">{rule.path}</p></div>
                        </div>
                        <div className="flex items-center gap-4">
                          <div className="text-center"><p className="text-xs text-gray-400">Max Attempts</p><p className="font-bold text-yellow-400">{rule.maxAttempts}</p></div>
                          <div className="text-center"><p className="text-xs text-gray-400">Lockout (s)</p><p className="font-bold text-orange-400">{rule.lockoutDuration}</p></div>
                          <div className="text-center"><p className="text-xs text-gray-400">Blocked</p><p className="font-bold text-red-400">{rule.blocked}</p></div>
                        </div>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="honeypots" className="space-y-4">
              <Card className="bg-gray-900/50 border-green-900/50">
                <CardHeader><CardTitle className="text-green-400 flex items-center gap-2"><Crosshair className="h-5 w-5" />Honeypot Traps</CardTitle></CardHeader>
                <CardContent>
                  <div className="space-y-3">
                    {honeypots.map((hp) => (
                      <div key={hp.id} className={`flex items-center justify-between p-4 rounded-lg border gap-4 ${hp.enabled ? "bg-orange-900/10 border-orange-900/30" : "bg-gray-800/50 border-gray-700"}`} data-testid={`honeypot-${hp.id}`}>
                        <div className="flex items-center gap-4">
                          <Switch checked={hp.enabled} onCheckedChange={(checked) => updateHoneypotMutation.mutate({ id: hp.id, enabled: checked })} data-testid={`switch-honeypot-${hp.id}`} />
                          <div><p className="font-mono text-white">{hp.path}</p><Badge variant="outline" className="border-orange-500 text-orange-400 text-xs">{hp.type}</Badge></div>
                        </div>
                        <div className="text-right"><p className="text-xs text-gray-400">Triggered</p><p className="font-bold text-orange-400">{hp.triggered}</p></div>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="headers" className="space-y-4">
              <Card className="bg-gray-900/50 border-green-900/50">
                <CardHeader><CardTitle className="text-green-400 flex items-center gap-2"><FileCode className="h-5 w-5" />Security Headers</CardTitle></CardHeader>
                <CardContent>
                  <div className="space-y-3">
                    {secHeaders.map((header) => (
                      <div key={header.id} className={`flex items-center justify-between p-4 rounded-lg border gap-4 flex-wrap ${header.enabled ? "bg-cyan-900/10 border-cyan-900/30" : "bg-gray-800/50 border-gray-700"}`} data-testid={`header-${header.id}`}>
                        <div className="flex items-center gap-4">
                          <Switch checked={header.enabled} onCheckedChange={(checked) => updateHeaderMutation.mutate({ id: header.id, enabled: checked })} data-testid={`switch-header-${header.id}`} />
                          <div><h4 className="font-medium text-white">{header.name}</h4><p className="text-xs text-gray-400">{header.description}</p><p className="text-xs text-cyan-400 font-mono mt-1">{header.value}</p></div>
                        </div>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="reputation" className="space-y-4">
              <Card className="bg-gray-900/50 border-green-900/50">
                <CardHeader><CardTitle className="text-green-400 flex items-center gap-2"><Fingerprint className="h-5 w-5" />IP Intelligence & Reputation</CardTitle></CardHeader>
                <CardContent>
                  <div className="mb-6 p-4 bg-gray-800/50 rounded-lg border border-green-900/30">
                    <div className="flex gap-4 flex-wrap">
                      <Input placeholder="Enter IP to check (e.g., 192.168.1.1)" value={checkIpInput} onChange={(e) => setCheckIpInput(e.target.value)} className="bg-gray-900 border-green-900/50 text-green-400 flex-1" data-testid="input-check-ip" />
                      <Button onClick={() => checkIpMutation.mutate(checkIpInput)} variant="default" disabled={checkIpMutation.isPending} data-testid="button-check-ip"><Search className="h-4 w-4 mr-2" />{checkIpMutation.isPending ? "Checking..." : "Check IP"}</Button>
                    </div>
                  </div>
                  {ipCheckResult && (
                    <div className="p-4 bg-gray-800/50 rounded-lg border border-green-900/30 mb-4">
                      <h3 className="text-lg font-bold text-white mb-4">IP: {ipCheckResult.ip}</h3>
                      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                        <div className="bg-gray-900/50 p-3 rounded-lg"><p className="text-xs text-gray-400">Score</p><p className={`text-2xl font-bold ${ipCheckResult.score > 70 ? "text-green-400" : ipCheckResult.score > 40 ? "text-yellow-400" : "text-red-400"}`}>{ipCheckResult.score}</p></div>
                        <div className="bg-gray-900/50 p-3 rounded-lg"><p className="text-xs text-gray-400">Category</p><p className={`text-lg font-bold ${CATEGORY_COLORS[ipCheckResult.category]}`}>{ipCheckResult.category.toUpperCase()}</p></div>
                        <div className="bg-gray-900/50 p-3 rounded-lg"><p className="text-xs text-gray-400">Country</p><p className="text-lg font-bold text-white">{ipCheckResult.country}</p></div>
                        <div className="bg-gray-900/50 p-3 rounded-lg"><p className="text-xs text-gray-400">Total Requests</p><p className="text-lg font-bold text-blue-400">{ipCheckResult.totalRequests.toLocaleString()}</p></div>
                      </div>
                      <div className="mt-4 flex gap-2 flex-wrap">
                        {ipCheckResult.category === "tor" && <Badge variant="outline" className="border-purple-500 text-purple-400"><Radio className="h-3 w-3 mr-1" />TOR Exit Node</Badge>}
                        {ipCheckResult.category === "vpn" && <Badge variant="outline" className="border-blue-500 text-blue-400"><Wifi className="h-3 w-3 mr-1" />VPN Detected</Badge>}
                        {ipCheckResult.category === "proxy" && <Badge variant="outline" className="border-orange-500 text-orange-400"><Network className="h-3 w-3 mr-1" />Proxy Server</Badge>}
                        {ipCheckResult.category === "datacenter" && <Badge variant="outline" className="border-cyan-500 text-cyan-400"><Server className="h-3 w-3 mr-1" />Datacenter IP</Badge>}
                        {ipCheckResult.category === "malicious" && <Badge variant="outline" className="border-red-500 text-red-400"><Skull className="h-3 w-3 mr-1" />Malicious</Badge>}
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="threats" className="space-y-4">
              <Card className="bg-gray-900/50 border-green-900/50">
                <CardHeader><CardTitle className="text-green-400 flex items-center gap-2"><AlertTriangle className="h-5 w-5" />Threat Log ({threats.length} events)</CardTitle></CardHeader>
                <CardContent>
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead><tr className="border-b border-gray-800"><th className="text-left py-3 px-4 text-gray-400">Time</th><th className="text-left py-3 px-4 text-gray-400">Type</th><th className="text-left py-3 px-4 text-gray-400">Source</th><th className="text-left py-3 px-4 text-gray-400">Path</th><th className="text-left py-3 px-4 text-gray-400">Action</th></tr></thead>
                      <tbody>
                        {threats.map((threat) => {
                          const IconComponent = getThreatIcon(threat.type);
                          return (
                            <tr key={threat.id} className="border-b border-gray-800/50" data-testid={`threat-row-${threat.id}`}>
                              <td className="py-3 px-4 text-gray-500">{new Date(threat.timestamp).toLocaleTimeString("de-DE")}</td>
                              <td className="py-3 px-4"><span className="flex items-center gap-2 text-red-400"><IconComponent className="h-4 w-4" />{threat.type.replace(/_/g, " ")}</span></td>
                              <td className="py-3 px-4 font-mono text-gray-300">{threat.sourceIp}<span className="ml-2 text-xs text-gray-500">({threat.country})</span></td>
                              <td className="py-3 px-4 text-gray-400 font-mono text-xs">{threat.path}</td>
                              <td className="py-3 px-4"><Badge variant="outline" className={threat.action === "blocked" ? "border-red-500 text-red-400" : "border-yellow-500 text-yellow-400"}>{threat.action}</Badge></td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                    {threats.length === 0 && <div className="text-center py-12 text-gray-500"><Shield className="h-12 w-12 mx-auto mb-2 opacity-50" /><p>No threats logged</p></div>}
                  </div>
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="zero-day" className="space-y-4">
              <ZeroDayTab />
            </TabsContent>

            <TabsContent value="ddos" className="space-y-4">
              <DDoSTab />
            </TabsContent>

            <TabsContent value="anomaly" className="space-y-4">
              <AnomalyTab />
            </TabsContent>
          </Tabs>
        </main>
      </div>

      <style>{`
        .custom-scrollbar::-webkit-scrollbar { width: 6px; }
        .custom-scrollbar::-webkit-scrollbar-track { background: #1a1a1a; }
        .custom-scrollbar::-webkit-scrollbar-thumb { background: #22c55e; border-radius: 3px; }
      `}</style>
    </div>
  );
}
