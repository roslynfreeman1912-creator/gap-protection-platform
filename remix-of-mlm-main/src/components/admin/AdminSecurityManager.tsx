import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { securityApi } from '@/lib/securityApi';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Progress } from '@/components/ui/progress';
import { useToast } from '@/hooks/use-toast';
import { 
  Shield, ShieldCheck, ShieldAlert, Globe, Lock, 
  Server, RefreshCw, Eye, AlertTriangle, CheckCircle,
  XCircle, Clock, Loader2, Plus, Trash2, Settings,
  Activity, Radar, Zap, FileSearch, Network, Ban,
  Play, BarChart3, Wifi, WifiOff, Timer
} from 'lucide-react';
import { format } from 'date-fns';
import { de } from 'date-fns/locale';
import gapLogo from '@/assets/gap-logo-horizontal-navy.png';
import { GapDnsManager } from '@/components/security/GapDnsManager';
import { GapSslManager } from '@/components/security/GapSslManager';
import { GapCacheCdn } from '@/components/security/GapCacheCdn';
import { GapPageRules } from '@/components/security/GapPageRules';
import { GapAccessControl } from '@/components/security/GapAccessControl';
import { GapFirewallAnalytics } from '@/components/security/GapFirewallAnalytics';
import { GapIncidentResponse } from '@/components/security/GapIncidentResponse';
import { GapThreatIntelligence } from '@/components/security/GapThreatIntelligence';
import { GapVulnerabilityManager } from '@/components/security/GapVulnerabilityManager';
import { GapComplianceDashboard } from '@/components/security/GapComplianceDashboard';
import { GapEmailSecurity } from '@/components/security/GapEmailSecurity';
import { GapZeroTrust } from '@/components/security/GapZeroTrust';
import { GapSecurityReports } from '@/components/security/GapSecurityReports';
import { GapThreatMap } from '@/components/security/GapThreatMap';

interface ProtectedDomain {
  id: string;
  profile_id: string;
  domain: string;
  ip_address: string | null;
  protection_status: string;
  proxy_ip: string | null;
  waf_enabled: boolean;
  ddos_protection: boolean;
  ssl_managed: boolean;
  activated_at: string | null;
  expires_at: string | null;
  profiles?: { first_name: string; last_name: string; email: string };
}

interface WafRule {
  id: string;
  domain_id: string;
  rule_name: string;
  rule_type: string;
  pattern: string;
  description: string | null;
  is_active: boolean;
  priority: number;
  action: string;
  match_field: string;
  blocked_count: number;
  last_triggered_at: string | null;
}

interface MonitoringLog {
  id: string;
  domain_id: string;
  check_type: string;
  status: string;
  response_time_ms: number | null;
  http_status: number | null;
  ssl_days_remaining: number | null;
  details: Record<string, unknown> | null;
  checked_at: string;
}

interface WafEvent {
  id: string;
  domain_id: string;
  event_type: string;
  source_ip: string | null;
  request_uri: string | null;
  threat_type: string | null;
  created_at: string;
}

interface Profile {
  id: string;
  first_name: string;
  last_name: string;
  email: string;
}

export function AdminSecurityManager() {
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [protectedDomains, setProtectedDomains] = useState<ProtectedDomain[]>([]);
  const [wafRules, setWafRules] = useState<WafRule[]>([]);
  const [monitoringLogs, setMonitoringLogs] = useState<MonitoringLog[]>([]);
  const [wafEvents, setWafEvents] = useState<WafEvent[]>([]);
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [monitoringRunning, setMonitoringRunning] = useState(false);
  const [scanningDomain, setScanningDomain] = useState<string | null>(null);
  
  const [stats, setStats] = useState({
    totalDomains: 0,
    activeDomains: 0,
    totalWafRules: 0,
    totalBlocked: 0,
    domainsUp: 0,
    domainsDown: 0,
  });

  // Add Domain Dialog
  const [addDialogOpen, setAddDialogOpen] = useState(false);
  const [addLoading, setAddLoading] = useState(false);
  const [newDomain, setNewDomain] = useState({
    domain: '', ip_address: '', profile_id: '',
    waf_enabled: true, ddos_protection: true, ssl_managed: true
  });

  // Add WAF Rule Dialog
  const [wafDialogOpen, setWafDialogOpen] = useState(false);
  const [wafLoading, setWafLoading] = useState(false);
  const [selectedDomainForWaf, setSelectedDomainForWaf] = useState('');
  const [newWafRule, setNewWafRule] = useState({
    rule_name: '', pattern: '', description: '', action: 'block',
    match_field: 'uri', priority: 100
  });

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const [domainsRes, wafRes, logsRes, eventsRes, profilesRes] = await Promise.all([
        supabase.from('protected_domains').select('*, profiles:profile_id (first_name, last_name, email)').order('created_at', { ascending: false }),
        supabase.from('waf_rules').select('*').order('priority'),
        supabase.from('domain_monitoring_logs').select('*').order('checked_at', { ascending: false }).limit(100),
        supabase.from('waf_event_logs').select('*').order('created_at', { ascending: false }).limit(50),
        supabase.from('profiles').select('id, first_name, last_name, email').order('last_name'),
      ]);

      const domains = domainsRes.data || [];
      const rules = wafRes.data || [];
      const logs = logsRes.data || [];

      setProtectedDomains(domains);
      setWafRules(rules);
      setMonitoringLogs(logs as MonitoringLog[]);
      setWafEvents((eventsRes.data || []) as WafEvent[]);
      setProfiles(profilesRes.data || []);

      // Get latest uptime status per domain
      const latestUptime = new Map<string, string>();
      for (const log of logs) {
        const l = log as MonitoringLog;
        if (l.check_type === 'uptime' && !latestUptime.has(l.domain_id)) {
          latestUptime.set(l.domain_id, l.status);
        }
      }

      setStats({
        totalDomains: domains.length,
        activeDomains: domains.filter(d => d.protection_status === 'active').length,
        totalWafRules: rules.length,
        totalBlocked: rules.reduce((sum, r) => sum + (r.blocked_count || 0), 0),
        domainsUp: Array.from(latestUptime.values()).filter(s => s === 'ok').length,
        domainsDown: Array.from(latestUptime.values()).filter(s => s === 'critical').length,
      });
    } catch (error) {
      console.error('Error:', error);
      toast({ variant: 'destructive', title: 'Fehler', description: 'Daten konnten nicht geladen werden' });
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => { fetchData(); }, [fetchData]);

  // Run monitoring check
  const runMonitoring = async (domainId?: string) => {
    setMonitoringRunning(true);
    try {
      const response = await supabase.functions.invoke('domain-monitor', {
        body: { action: domainId ? 'check_domain' : 'check_all', domainId }
      });
      if (response.error) throw new Error(response.error.message);
      toast({ title: '✓ Monitoring abgeschlossen', description: `${response.data?.results?.length || 0} Domains geprüft` });
      fetchData();
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Unbekannter Fehler';
      toast({ variant: 'destructive', title: 'Monitoring Fehler', description: message });
    } finally {
      setMonitoringRunning(false);
    }
  };

  // Scan domain
  const scanDomain = async (domainId: string, domainName: string) => {
    setScanningDomain(domainId);
    try {
      const response = await supabase.functions.invoke('domain-monitor', {
        body: { action: 'scan_domain', domainId }
      });
      if (response.error) throw new Error(response.error.message);
      toast({ title: '✓ Scan abgeschlossen', description: `${domainName} wurde gescannt. Score: ${response.data?.scan?.score || '—'}/100` });
      fetchData();
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Unbekannter Fehler';
      toast({ variant: 'destructive', title: 'Scan Fehler', description: message });
    } finally {
      setScanningDomain(null);
    }
  };

  // Add domain
  const handleAddDomain = async () => {
    if (!newDomain.domain || !newDomain.profile_id) {
      toast({ variant: 'destructive', title: 'Fehler', description: 'Domain und Kunde sind Pflichtfelder' });
      return;
    }
    setAddLoading(true);
    try {
      const proxyIp = `185.158.${Math.floor(Math.random() * 255)}.${Math.floor(Math.random() * 255)}`;
      await securityApi.insert('protected_domains', {
        domain: newDomain.domain.toLowerCase().trim(),
        ip_address: newDomain.ip_address || null,
        profile_id: newDomain.profile_id,
        protection_status: 'pending',
        proxy_ip: proxyIp,
        waf_enabled: newDomain.waf_enabled,
        ddos_protection: newDomain.ddos_protection,
        ssl_managed: newDomain.ssl_managed
      });
      toast({ title: 'Domain hinzugefügt', description: `${newDomain.domain} wurde hinzugefügt.` });
      setAddDialogOpen(false);
      setNewDomain({ domain: '', ip_address: '', profile_id: '', waf_enabled: true, ddos_protection: true, ssl_managed: true });
      fetchData();
    } catch (error) {
      console.error(error);
      toast({ variant: 'destructive', title: 'Fehler', description: 'Domain konnte nicht hinzugefügt werden' });
    } finally {
      setAddLoading(false);
    }
  };

  // Add WAF rule
  const handleAddWafRule = async () => {
    if (!selectedDomainForWaf || !newWafRule.rule_name || !newWafRule.pattern) {
      toast({ variant: 'destructive', title: 'Fehler', description: 'Alle Pflichtfelder ausfüllen' });
      return;
    }
    setWafLoading(true);
    try {
      await securityApi.insert('waf_rules', {
        domain_id: selectedDomainForWaf,
        rule_name: newWafRule.rule_name,
        pattern: newWafRule.pattern,
        description: newWafRule.description || null,
        action: newWafRule.action,
        match_field: newWafRule.match_field,
        priority: newWafRule.priority,
      });
      toast({ title: 'WAF-Regel erstellt', description: newWafRule.rule_name });
      setWafDialogOpen(false);
      setNewWafRule({ rule_name: '', pattern: '', description: '', action: 'block', match_field: 'uri', priority: 100 });
      fetchData();
    } catch (error) {
      console.error(error);
      toast({ variant: 'destructive', title: 'Fehler', description: 'Regel konnte nicht erstellt werden' });
    } finally {
      setWafLoading(false);
    }
  };

  // Toggle WAF rule
  const toggleWafRule = async (ruleId: string, isActive: boolean) => {
    try {
      await securityApi.update('waf_rules', ruleId, { is_active: !isActive });
      fetchData();
    } catch (error) {
      console.error('Konnte WAF-Regel nicht umschalten', error);
      toast({ variant: 'destructive', title: 'Fehler', description: 'WAF-Regel konnte nicht aktualisiert werden' });
    }
  };

  // Delete WAF rule
  const deleteWafRule = async (ruleId: string) => {
    if (!confirm('Regel wirklich löschen?')) return;
    try {
      await securityApi.delete('waf_rules', ruleId);
      toast({ title: 'Regel gelöscht' });
      fetchData();
    } catch (error) {
      console.error('Konnte WAF-Regel nicht löschen', error);
      toast({ variant: 'destructive', title: 'Fehler', description: 'Regel konnte nicht gelöscht werden' });
    }
  };

  // Activate protection
  const activateProtection = async (domainId: string) => {
    try {
      await securityApi.update('protected_domains', domainId, {
        protection_status: 'active',
        activated_at: new Date().toISOString(),
        waf_enabled: true,
        ddos_protection: true,
        ssl_managed: true,
      });
      toast({ title: 'Schutz aktiviert' });
      fetchData();
    } catch (error) {
      console.error('Konnte Schutz nicht aktivieren', error);
      toast({ variant: 'destructive', title: 'Fehler', description: 'Schutz konnte nicht aktiviert werden' });
    }
  };

  // Delete domain
  const handleDeleteDomain = async (domainId: string, domainName: string) => {
    if (!confirm(`Domain "${domainName}" wirklich löschen?`)) return;
    try {
      await securityApi.delete('protected_domains', domainId);
      toast({ title: 'Domain gelöscht' });
      fetchData();
    } catch (error) {
      console.error('Konnte Domain nicht löschen', error);
      toast({ variant: 'destructive', title: 'Fehler', description: 'Domain konnte nicht gelöscht werden' });
    }
  };

  // Add default WAF rules for a domain
  const addDefaultWafRules = async (domainId: string) => {
    const defaultRules = [
      // ═══ SQL Injection (SQLi) ═══
      { domain_id: domainId, rule_name: 'SQL Injection — Basic', pattern: '(union\\s+(all\\s+)?select|select\\s+.+\\s+from|insert\\s+into|update\\s+.+\\s+set|delete\\s+from|drop\\s+(table|database)|alter\\s+table)', match_field: 'uri', action: 'block', priority: 10, description: 'Blockiert grundlegende SQL-Injection-Angriffe (UNION, SELECT, INSERT, DROP)' },
      { domain_id: domainId, rule_name: 'SQL Injection — Advanced', pattern: '(exec(ute)?\\s*\\(|xp_cmdshell|sp_executesql|0x[0-9a-f]{8,}|benchmark\\s*\\(|sleep\\s*\\(|waitfor\\s+delay)', match_field: 'uri', action: 'block', priority: 11, description: 'Blockiert fortgeschrittene SQLi: Stored Procedures, Hex-Payloads, Time-Based Blind' },
      { domain_id: domainId, rule_name: 'SQL Injection — Comments & Bypass', pattern: '(/\\*.*\\*/|--\\s|#|;\\s*(drop|alter|truncate|grant|revoke)|\\bor\\b\\s+1\\s*=\\s*1|\\band\\b\\s+1\\s*=\\s*1)', match_field: 'uri', action: 'block', priority: 12, description: 'Blockiert SQL-Kommentare und Bypass-Techniken (OR 1=1, AND 1=1)' },
      { domain_id: domainId, rule_name: 'SQL Injection — Stacked Queries', pattern: '(;\\s*(select|insert|update|delete|drop|create|alter|exec)|into\\s+outfile|into\\s+dumpfile|load_file\\s*\\()', match_field: 'uri', action: 'block', priority: 13, description: 'Blockiert Stacked Queries und Datei-Exfiltration via SQL' },
      { domain_id: domainId, rule_name: 'SQL Injection — Body/POST', pattern: '(union\\s+select|select\\s+.*from|insert\\s+into|drop\\s+table|\\bor\\b\\s+["\']?\\d+["\']?\\s*=\\s*["\']?\\d+)', match_field: 'body', action: 'block', priority: 14, description: 'Blockiert SQL-Injection in POST-Body-Daten' },
      
      // ═══ Cross-Site Scripting (XSS) ═══
      { domain_id: domainId, rule_name: 'XSS — Script Tags', pattern: '(<script[^>]*>|</script>|javascript\\s*:|vbscript\\s*:)', match_field: 'uri', action: 'block', priority: 20, description: 'Blockiert Script-Tags und JS/VBS-Protokolle' },
      { domain_id: domainId, rule_name: 'XSS — Event Handlers', pattern: '(\\bon\\w+\\s*=\\s*["\']|\\bon(load|error|click|mouseover|focus|blur|submit|change|input|keydown|keyup)\\s*=)', match_field: 'uri', action: 'block', priority: 21, description: 'Blockiert HTML Event-Handler-Injections (onload, onerror, onclick etc.)' },
      { domain_id: domainId, rule_name: 'XSS — Dangerous Functions', pattern: '(eval\\s*\\(|alert\\s*\\(|prompt\\s*\\(|confirm\\s*\\(|document\\.(cookie|write|location)|window\\.(location|open)|innerHTML\\s*=)', match_field: 'uri', action: 'block', priority: 22, description: 'Blockiert gefährliche JS-Funktionen (eval, alert, document.cookie)' },
      { domain_id: domainId, rule_name: 'XSS — Data URI & SVG', pattern: '(data\\s*:\\s*text/html|data\\s*:\\s*image/svg\\+xml|<svg[^>]*on\\w+=|<img[^>]*onerror)', match_field: 'uri', action: 'block', priority: 23, description: 'Blockiert Data-URI und SVG-basierte XSS-Angriffe' },
      { domain_id: domainId, rule_name: 'XSS — Encoded Payloads', pattern: '(%3Cscript|%3C%2Fscript|%3Csvg|&#x3C;script|&#60;script|\\\\x3c\\\\x73\\\\x63\\\\x72\\\\x69\\\\x70\\\\x74)', match_field: 'uri', action: 'block', priority: 24, description: 'Blockiert URL-encoded und HTML-encoded XSS-Payloads' },
      { domain_id: domainId, rule_name: 'XSS — POST Body', pattern: '(<script|javascript:|on(load|error|click)\\s*=|eval\\s*\\(|document\\.(cookie|write))', match_field: 'body', action: 'block', priority: 25, description: 'Blockiert XSS-Angriffe in POST-Daten und Formularen' },
      
      // ═══ Path Traversal & LFI/RFI ═══
      { domain_id: domainId, rule_name: 'Path Traversal — Directory', pattern: '(\\.\\./|\\.\\.\\\\|%2e%2e%2f|%2e%2e/|\\.\\.%2f|%2e%2e%5c)', match_field: 'uri', action: 'block', priority: 30, description: 'Blockiert Directory Traversal (../ und encoded Varianten)' },
      { domain_id: domainId, rule_name: 'LFI — Local File Inclusion', pattern: '(/etc/(passwd|shadow|hosts|issue)|/proc/(self|version|cmdline)|/var/log/|/windows/system32|c:\\\\windows)', match_field: 'uri', action: 'block', priority: 31, description: 'Blockiert Local File Inclusion — Zugriff auf Systemdateien' },
      { domain_id: domainId, rule_name: 'RFI — Remote File Inclusion', pattern: '(=(https?|ftp|php|data)://|include\\s*\\(\\s*["\']https?://|require\\s*\\(\\s*["\']https?://)', match_field: 'uri', action: 'block', priority: 32, description: 'Blockiert Remote File Inclusion über externe URLs' },
      { domain_id: domainId, rule_name: 'PHP Wrappers', pattern: '(php://(input|filter|data|expect)|phar://|zip://|compress\\.zlib://)', match_field: 'uri', action: 'block', priority: 33, description: 'Blockiert PHP Stream Wrappers (php://input, php://filter etc.)' },
      
      // ═══ Sensitive Files & Information Disclosure ═══
      { domain_id: domainId, rule_name: 'Sensitive Files — Config', pattern: '(\\.env|\\.git/|\\.gitignore|\\.htaccess|\\.htpasswd|wp-config\\.php|config\\.php|settings\\.py|application\\.properties)', match_field: 'uri', action: 'block', priority: 40, description: 'Blockiert Zugriff auf Konfigurationsdateien (.env, .git, wp-config)' },
      { domain_id: domainId, rule_name: 'Sensitive Files — Backup', pattern: '\\.(bak|backup|old|orig|save|swp|swo|tmp|temp|sql|dump|tar\\.gz|zip|rar|7z)$', match_field: 'uri', action: 'block', priority: 41, description: 'Blockiert Zugriff auf Backup- und temporäre Dateien' },
      { domain_id: domainId, rule_name: 'Sensitive Files — Debug', pattern: '(phpinfo\\(|server-status|server-info|debug/|trace\\.axd|elmah\\.axd|actuator/|swagger-ui)', match_field: 'uri', action: 'block', priority: 42, description: 'Blockiert Debug-Seiten und Server-Status-Endpunkte' },
      { domain_id: domainId, rule_name: 'Sensitive Files — Keys & Certs', pattern: '\\.(pem|key|crt|cer|p12|pfx|jks|keystore|id_rsa|id_dsa|pgp|gpg)$', match_field: 'uri', action: 'block', priority: 43, description: 'Blockiert Zugriff auf Schlüssel- und Zertifikatsdateien' },
      { domain_id: domainId, rule_name: 'Sensitive Files — IDE & Logs', pattern: '(\\.idea/|\\.vscode/|\\.DS_Store|Thumbs\\.db|\\.log$|error_log|debug\\.log|access\\.log)', match_field: 'uri', action: 'block', priority: 44, description: 'Blockiert IDE-Konfigurationen und Logdateien' },
      
      // ═══ Bad Bots & Scanners ═══
      { domain_id: domainId, rule_name: 'Bad Bots — Security Scanner', pattern: '(sqlmap|nikto|nmap|masscan|dirbuster|gobuster|wpscan|burpsuite|zap|acunetix|nessus|openvas)', match_field: 'user_agent', action: 'block', priority: 50, description: 'Blockiert bekannte Sicherheitsscanner (SQLMap, Nikto, Nmap, Burp)' },
      { domain_id: domainId, rule_name: 'Bad Bots — Scraper', pattern: '(scrapy|httpclient|python-requests|python-urllib|curl/|wget/|libwww-perl|java/|httpclient)', match_field: 'user_agent', action: 'block', priority: 51, description: 'Blockiert bekannte Scraper und automatisierte Clients' },
      { domain_id: domainId, rule_name: 'Bad Bots — Empty/Fake UA', pattern: '^$|^-$|^mozilla/4\\.0$|^mozilla/5\\.0$', match_field: 'user_agent', action: 'log', priority: 52, description: 'Loggt leere oder verdächtig kurze User-Agents' },
      { domain_id: domainId, rule_name: 'Bad Bots — Exploit Tools', pattern: '(metasploit|havij|pangolin|w3af|commix|hydra|medusa|john|hashcat)', match_field: 'user_agent', action: 'block', priority: 53, description: 'Blockiert Exploit-Frameworks (Metasploit, Hydra, Hashcat)' },
      { domain_id: domainId, rule_name: 'Bad Bots — AI/LLM Scraper', pattern: '(GPTBot|ChatGPT-User|CCBot|anthropic-ai|ClaudeBot|cohere-ai|Bytespider|PetalBot)', match_field: 'user_agent', action: 'block', priority: 54, description: 'Blockiert KI-Crawler und LLM-Scraper (GPTBot, ClaudeBot etc.)' },
      
      // ═══ Command Injection (OS Injection) ═══
      { domain_id: domainId, rule_name: 'OS Command Injection — Basic', pattern: '(;\\s*(ls|cat|wget|curl|bash|sh|python|perl|ruby|nc|netcat)|\\|\\s*(ls|cat|id|whoami|uname))', match_field: 'uri', action: 'block', priority: 60, description: 'Blockiert grundlegende OS-Command-Injection' },
      { domain_id: domainId, rule_name: 'OS Command Injection — Pipes', pattern: '(\\|\\||&&|`[^`]+`|\\$\\([^)]+\\)|\\$\\{[^}]+\\}|%0a|%0d|\\n|\\r)', match_field: 'uri', action: 'block', priority: 61, description: 'Blockiert Pipe-Operatoren, Backticks und Newline-Injections' },
      { domain_id: domainId, rule_name: 'OS Command Injection — Reverse Shell', pattern: '(bash\\s+-i|/dev/tcp/|nc\\s+-e|python\\s+-c\\s+.*import\\s+socket|perl\\s+-e\\s+.*socket|mkfifo)', match_field: 'uri', action: 'block', priority: 62, description: 'Blockiert Reverse-Shell-Versuche (Bash, Netcat, Python)' },
      
      // ═══ File Upload Attacks ═══
      { domain_id: domainId, rule_name: 'Dangerous File Upload — Executables', pattern: '\\.(php[3-8]?|phtml|asp|aspx|jsp|jspx|cgi|pl|py|rb|sh|bash|exe|dll|bat|cmd|com|vbs|vbe|wsf|wsh)$', match_field: 'uri', action: 'block', priority: 70, description: 'Blockiert Upload von ausführbaren Dateien (PHP, ASP, JSP, EXE etc.)' },
      { domain_id: domainId, rule_name: 'Dangerous File Upload — Double Extension', pattern: '\\.(jpg|png|gif|pdf)\\.(php|asp|exe|sh|py|pl|cgi|jsp)', match_field: 'uri', action: 'block', priority: 71, description: 'Blockiert Double-Extension-Angriffe (image.jpg.php)' },
      { domain_id: domainId, rule_name: 'Dangerous File Upload — Content-Type', pattern: '(application/x-httpd-php|application/x-php|text/x-php|application/x-executable)', match_field: 'header', action: 'block', priority: 72, description: 'Blockiert gefährliche Content-Types bei Uploads' },
      
      // ═══ SSRF (Server-Side Request Forgery) ═══
      { domain_id: domainId, rule_name: 'SSRF — Internal Networks', pattern: '(127\\.0\\.0\\.1|localhost|0\\.0\\.0\\.0|10\\.\\d+\\.\\d+\\.\\d+|172\\.(1[6-9]|2\\d|3[01])\\.\\d+\\.\\d+|192\\.168\\.\\d+\\.\\d+|169\\.254\\.\\d+\\.\\d+)', match_field: 'uri', action: 'block', priority: 80, description: 'Blockiert SSRF auf interne Netzwerke (RFC 1918, Loopback, Link-Local)' },
      { domain_id: domainId, rule_name: 'SSRF — Cloud Metadata', pattern: '(169\\.254\\.169\\.254|metadata\\.google\\.internal|metadata\\.azure\\.com|100\\.100\\.100\\.200)', match_field: 'uri', action: 'block', priority: 81, description: 'Blockiert SSRF auf Cloud-Metadaten-Endpunkte (AWS, GCP, Azure)' },
      { domain_id: domainId, rule_name: 'SSRF — Protocols', pattern: '(gopher://|dict://|file://|ftp://|ldap://|tftp://|telnet://)', match_field: 'uri', action: 'block', priority: 82, description: 'Blockiert gefährliche Protokolle (Gopher, FTP, LDAP, Telnet)' },
      
      // ═══ XML/XXE Attacks ═══
      { domain_id: domainId, rule_name: 'XXE — External Entities', pattern: '(<!DOCTYPE[^>]*\\[|<!ENTITY|SYSTEM\\s+["\']|PUBLIC\\s+["\']|xmlns:xi=)', match_field: 'body', action: 'block', priority: 90, description: 'Blockiert XML External Entity (XXE) Injection' },
      { domain_id: domainId, rule_name: 'XXE — Billion Laughs', pattern: '(<!ENTITY\\s+\\w+\\s+["\'](&\\w+;){2,}|<!ENTITY\\s+\\w+\\s+["\'][^"\']{1000,})', match_field: 'body', action: 'block', priority: 91, description: 'Blockiert XML Billion Laughs (DoS via Entity-Expansion)' },
      
      // ═══ CSRF & Header Manipulation ═══
      { domain_id: domainId, rule_name: 'HTTP Header Injection', pattern: '(%0d%0a|\\r\\n|%0aSet-Cookie|%0aLocation|%0d%0aHTTP/)', match_field: 'header', action: 'block', priority: 100, description: 'Blockiert HTTP Header Injection und Response Splitting' },
      { domain_id: domainId, rule_name: 'Host Header Attack', pattern: '(X-Forwarded-Host:\\s*[\\w.-]+\\.evil|Host:\\s*[\\w.-]+\\.attacker)', match_field: 'header', action: 'block', priority: 101, description: 'Blockiert Host-Header-Poisoning-Angriffe' },
      
      // ═══ LDAP & NoSQL Injection ═══
      { domain_id: domainId, rule_name: 'LDAP Injection', pattern: '(\\)\\(|\\(\\||\\(\\&|\\*\\)|%28%7c|%28%26|objectclass=\\*|cn=\\*)', match_field: 'uri', action: 'block', priority: 110, description: 'Blockiert LDAP-Injection-Versuche' },
      { domain_id: domainId, rule_name: 'NoSQL Injection', pattern: '(\\$gt|\\$lt|\\$ne|\\$eq|\\$regex|\\$where|\\$exists|\\{\\s*"\\$)', match_field: 'uri', action: 'block', priority: 111, description: 'Blockiert MongoDB/NoSQL-Injection (Operatoren wie $gt, $ne, $where)' },
      { domain_id: domainId, rule_name: 'NoSQL Injection — Body', pattern: '(\\$gt|\\$lt|\\$ne|\\$regex|\\$where|\\$exists|\\{\\s*"\\$)', match_field: 'body', action: 'block', priority: 112, description: 'Blockiert NoSQL-Injection in POST-Body' },
      
      // ═══ WordPress-spezifisch ═══
      { domain_id: domainId, rule_name: 'WordPress — Admin Login Brute Force', pattern: '(wp-login\\.php|xmlrpc\\.php|wp-admin/admin-ajax\\.php.*action=(login|authenticate))', match_field: 'uri', action: 'rate_limit', priority: 120, description: 'Rate-Limiting für WordPress-Login und XMLRPC' },
      { domain_id: domainId, rule_name: 'WordPress — Plugin Exploits', pattern: '(wp-content/plugins/.*(eval|base64_decode|shell_exec|system\\(|passthru|exec\\())', match_field: 'uri', action: 'block', priority: 121, description: 'Blockiert bekannte WordPress-Plugin-Exploits' },
      { domain_id: domainId, rule_name: 'WordPress — REST API Abuse', pattern: '(wp-json/wp/v2/(users|settings)|wp-json/.*/delete|wp-json/.*/update)', match_field: 'uri', action: 'log', priority: 122, description: 'Überwacht WordPress REST-API-Zugriffe auf sensible Endpunkte' },
      
      // ═══ Rate Limiting & Brute Force ═══
      { domain_id: domainId, rule_name: 'Login Brute Force', pattern: '(/login|/signin|/auth|/api/auth|/api/login|/admin/login|/user/login)', match_field: 'uri', action: 'rate_limit', priority: 130, description: 'Rate-Limiting für Login-Endpunkte gegen Brute-Force' },
      { domain_id: domainId, rule_name: 'API Rate Limit', pattern: '(/api/v[0-9]+/|/graphql|/api/query|/api/mutation)', match_field: 'uri', action: 'rate_limit', priority: 131, description: 'Rate-Limiting für API-Endpunkte' },
      { domain_id: domainId, rule_name: 'Password Reset Abuse', pattern: '(/reset-password|/forgot-password|/password/reset|/api/password)', match_field: 'uri', action: 'rate_limit', priority: 132, description: 'Rate-Limiting für Passwort-Reset gegen Missbrauch' },
      
      // ═══ Protocol & Method Attacks ═══
      { domain_id: domainId, rule_name: 'Dangerous HTTP Methods', pattern: '(TRACE|TRACK|DEBUG|CONNECT|PROPFIND|PROPPATCH|MKCOL|COPY|MOVE|LOCK|UNLOCK)', match_field: 'method', action: 'block', priority: 140, description: 'Blockiert gefährliche HTTP-Methoden (TRACE, DEBUG, WebDAV)' },
      { domain_id: domainId, rule_name: 'HTTP Request Smuggling', pattern: '(Transfer-Encoding:\\s*chunked.*Content-Length:|Content-Length:.*Transfer-Encoding:\\s*chunked)', match_field: 'header', action: 'block', priority: 141, description: 'Blockiert HTTP Request Smuggling (CL.TE / TE.CL)' },
      
      // ═══ Cryptominer & Malware ═══
      { domain_id: domainId, rule_name: 'Cryptominer Block', pattern: '(coinhive|cryptonight|coin-hive|jsecoin|cryptoloot|minero\\.cc|webminepool)', match_field: 'uri', action: 'block', priority: 150, description: 'Blockiert bekannte Kryptominer-Skripte' },
      { domain_id: domainId, rule_name: 'Webshell Detection', pattern: '(c99|r57|b374k|wso\\s*shell|php\\s*shell|cmd\\.php|shell\\.php|backdoor|web_shell)', match_field: 'uri', action: 'block', priority: 151, description: 'Blockiert bekannte Webshell-Zugriffe (c99, r57, b374k)' },
      
      // ═══ Data Exfiltration ═══
      { domain_id: domainId, rule_name: 'Data Exfiltration — Large Response', pattern: '(\\.(sql|csv|xlsx|json|xml)\\?.*export|/export|/download.*\\.(sql|csv|dump))', match_field: 'uri', action: 'log', priority: 160, description: 'Überwacht verdächtige Daten-Export-Anfragen' },
      { domain_id: domainId, rule_name: 'Data Exfiltration — Encoding', pattern: '(base64_encode|btoa\\(|String\\.fromCharCode|encodeURIComponent.*document\\.cookie)', match_field: 'uri', action: 'block', priority: 161, description: 'Blockiert Datenexfiltration via Encoding-Funktionen' },
      
      // ═══ Geo-Blocking & Compliance ═══
      { domain_id: domainId, rule_name: 'Tor Exit Node Block', pattern: '(tor-exit|\\.onion|torproject)', match_field: 'header', action: 'block', priority: 170, description: 'Blockiert Anfragen über bekannte Tor-Exit-Nodes' },
      
      // ═══ API Security ═══
      { domain_id: domainId, rule_name: 'API Key Exposure', pattern: '(api[_-]?key|apikey|api[_-]?secret|access[_-]?token|auth[_-]?token)\\s*=\\s*[a-zA-Z0-9]{16,}', match_field: 'uri', action: 'block', priority: 180, description: 'Blockiert API-Schlüssel-Leaks in URLs' },
      { domain_id: domainId, rule_name: 'GraphQL Introspection', pattern: '(__schema|__type|introspectionQuery|IntrospectionQuery)', match_field: 'body', action: 'block', priority: 181, description: 'Blockiert GraphQL Introspection in Produktion' },
      
      // ═══ Log4Shell & Known CVEs ═══
      { domain_id: domainId, rule_name: 'Log4Shell (CVE-2021-44228)', pattern: '(\\$\\{jndi:(ldap|rmi|dns|iiop)://|\\$\\{lower:|\\$\\{upper:|\\$\\{env:|\\$\\{sys:)', match_field: 'uri', action: 'block', priority: 190, description: 'Blockiert Log4Shell JNDI-Injection (CVE-2021-44228)' },
      { domain_id: domainId, rule_name: 'Log4Shell — Header', pattern: '(\\$\\{jndi:|\\$\\{lower:|\\$\\{upper:|\\$\\{env:|\\$\\{sys:|\\$\\{java:)', match_field: 'header', action: 'block', priority: 191, description: 'Blockiert Log4Shell in HTTP-Headern' },
      { domain_id: domainId, rule_name: 'Spring4Shell (CVE-2022-22965)', pattern: '(class\\.module\\.classLoader|class\\.classLoader\\.resources|classLoader\\[)', match_field: 'uri', action: 'block', priority: 192, description: 'Blockiert Spring4Shell RCE (CVE-2022-22965)' },
      { domain_id: domainId, rule_name: 'Shellshock (CVE-2014-6271)', pattern: '(\\(\\)\\s*\\{\\s*:;\\s*\\}|\\(\\)\\s*\\{\\s*_)', match_field: 'header', action: 'block', priority: 193, description: 'Blockiert Shellshock Bash-Injection (CVE-2014-6271)' },
    ];
    try {
      await securityApi.batchInsert('waf_rules', defaultRules);
      toast({ title: '✓ WAF-Regelpaket installiert', description: `${defaultRules.length} professionelle Schutzregeln erstellt` }); fetchData();
    } catch { toast({ variant: 'destructive', title: 'Fehler', description: 'Regeln konnten nicht erstellt werden' }); }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'ok': return <CheckCircle className="h-4 w-4 text-green-500" />;
      case 'warning': return <AlertTriangle className="h-4 w-4 text-yellow-500" />;
      case 'critical': return <XCircle className="h-4 w-4 text-red-500" />;
      default: return <Clock className="h-4 w-4 text-muted-foreground" />;
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'active': return <Badge className="bg-green-500/15 text-green-600 border-green-500/30">Aktiv</Badge>;
      case 'pending': return <Badge variant="secondary">Ausstehend</Badge>;
      case 'suspended': return <Badge variant="destructive">Gesperrt</Badge>;
      default: return <Badge variant="secondary">{status}</Badge>;
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  // Get domain name by ID
  const getDomainName = (id: string) => protectedDomains.find(d => d.id === id)?.domain || id;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <img src={gapLogo} alt="GAP" className="h-8 w-auto" />
          <div>
            <h2 className="text-xl font-bold">GAP PROTECTION — Admin</h2>
            <p className="text-sm text-muted-foreground">Sicherheits-Management & WAF-Verwaltung</p>
          </div>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => runMonitoring()} disabled={monitoringRunning}>
            {monitoringRunning ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Activity className="h-4 w-4 mr-2" />}
            Alle prüfen
          </Button>
          <Button variant="outline" size="sm" onClick={fetchData}>
            <RefreshCw className="h-4 w-4 mr-2" />
            Aktualisieren
          </Button>
        </div>
      </div>

      {/* Stats */}
      <div className="grid gap-4 md:grid-cols-6">
        {[
          { label: 'Domains', value: stats.totalDomains, icon: Globe, color: 'text-primary' },
          { label: 'Aktiv', value: stats.activeDomains, icon: ShieldCheck, color: 'text-green-500' },
          { label: 'Online', value: stats.domainsUp, icon: Wifi, color: 'text-green-500' },
          { label: 'Offline', value: stats.domainsDown, icon: WifiOff, color: 'text-red-500' },
          { label: 'WAF Regeln', value: stats.totalWafRules, icon: Shield, color: 'text-blue-500' },
          { label: 'Blockiert', value: stats.totalBlocked, icon: Ban, color: 'text-orange-500' },
        ].map(({ label, value, icon: Icon, color }) => (
          <Card key={label}>
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs text-muted-foreground">{label}</p>
                  <p className={`text-2xl font-bold ${color}`}>{value}</p>
                </div>
                <Icon className={`h-5 w-5 ${color} opacity-50`} />
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Main Tabs */}
      <Tabs defaultValue="domains" className="space-y-4">
        <TabsList className="flex flex-wrap h-auto gap-1">
          <TabsTrigger value="domains" className="flex items-center gap-1 text-xs">
            <Globe className="h-3 w-3" /> Domains
          </TabsTrigger>
          <TabsTrigger value="waf" className="flex items-center gap-1 text-xs">
            <Shield className="h-3 w-3" /> WAF
          </TabsTrigger>
          <TabsTrigger value="dns" className="flex items-center gap-1 text-xs">
            <Globe className="h-3 w-3" /> DNS
          </TabsTrigger>
          <TabsTrigger value="ssl" className="flex items-center gap-1 text-xs">
            <Lock className="h-3 w-3" /> SSL/TLS
          </TabsTrigger>
          <TabsTrigger value="access" className="flex items-center gap-1 text-xs">
            <Ban className="h-3 w-3" /> Zugriff
          </TabsTrigger>
          <TabsTrigger value="cache" className="flex items-center gap-1 text-xs">
            <Zap className="h-3 w-3" /> Cache/CDN
          </TabsTrigger>
          <TabsTrigger value="pagerules" className="flex items-center gap-1 text-xs">
            <Settings className="h-3 w-3" /> Page Rules
          </TabsTrigger>
          <TabsTrigger value="monitoring" className="flex items-center gap-1 text-xs">
            <Activity className="h-3 w-3" /> Monitoring
          </TabsTrigger>
          <TabsTrigger value="analytics" className="flex items-center gap-1 text-xs">
            <BarChart3 className="h-3 w-3" /> Analytics
          </TabsTrigger>
          <TabsTrigger value="threats" className="flex items-center gap-1 text-xs">
            <ShieldAlert className="h-3 w-3" /> Bedrohungen
          </TabsTrigger>
          <TabsTrigger value="incidents" className="flex items-center gap-1 text-xs">
            <AlertTriangle className="h-3 w-3" /> Vorfälle
          </TabsTrigger>
          <TabsTrigger value="threatintel" className="flex items-center gap-1 text-xs">
            <Radar className="h-3 w-3" /> Threat Intel
          </TabsTrigger>
          <TabsTrigger value="vulns" className="flex items-center gap-1 text-xs">
            <FileSearch className="h-3 w-3" /> Schwachstellen
          </TabsTrigger>
          <TabsTrigger value="compliance" className="flex items-center gap-1 text-xs">
            <CheckCircle className="h-3 w-3" /> Compliance
          </TabsTrigger>
          <TabsTrigger value="emailsec" className="flex items-center gap-1 text-xs">
            <Lock className="h-3 w-3" /> E-Mail
          </TabsTrigger>
          <TabsTrigger value="zerotrust" className="flex items-center gap-1 text-xs">
            <Network className="h-3 w-3" /> Zero Trust
          </TabsTrigger>
          <TabsTrigger value="threatmap" className="flex items-center gap-1 text-xs">
            <Globe className="h-3 w-3" /> Threat Map
          </TabsTrigger>
          <TabsTrigger value="reports" className="flex items-center gap-1 text-xs">
            <BarChart3 className="h-3 w-3" /> Reports
          </TabsTrigger>
        </TabsList>

        {/* ═══ DOMAINS TAB ═══ */}
        <TabsContent value="domains">
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle>Geschützte Domains</CardTitle>
                  <CardDescription>Domains unter GAP Protection Verwaltung</CardDescription>
                </div>
                <Button className="gap-2" onClick={() => setAddDialogOpen(true)}>
                  <Plus className="h-4 w-4" /> Domain hinzufügen
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Domain</TableHead>
                    <TableHead>Proxy IP</TableHead>
                    <TableHead>Kunde</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Schutz</TableHead>
                    <TableHead>Aktionen</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {protectedDomains.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={6} className="text-center text-muted-foreground py-8">
                        <Shield className="h-12 w-12 mx-auto mb-2 opacity-30" />
                        <p>Keine geschützten Domains</p>
                      </TableCell>
                    </TableRow>
                  ) : protectedDomains.map((domain) => (
                    <TableRow key={domain.id}>
                      <TableCell className="font-medium">
                        <div className="flex items-center gap-2">
                          <Globe className="h-4 w-4 text-muted-foreground" />
                          {domain.domain}
                        </div>
                        {domain.ip_address && <p className="text-xs text-muted-foreground mt-1">IP: {domain.ip_address}</p>}
                      </TableCell>
                      <TableCell>
                        {domain.proxy_ip ? (
                          <code className="text-xs bg-muted px-2 py-1 rounded">{domain.proxy_ip}</code>
                        ) : '—'}
                      </TableCell>
                      <TableCell>
                        {domain.profiles ? (
                          <div>
                            <p className="text-sm">{domain.profiles.first_name} {domain.profiles.last_name}</p>
                            <p className="text-xs text-muted-foreground">{domain.profiles.email}</p>
                          </div>
                        ) : '—'}
                      </TableCell>
                      <TableCell>{getStatusBadge(domain.protection_status)}</TableCell>
                      <TableCell>
                        <div className="flex gap-1 flex-wrap">
                          {domain.waf_enabled && <Badge variant="outline" className="text-xs bg-green-500/10 text-green-600 border-green-500/20">WAF</Badge>}
                          {domain.ddos_protection && <Badge variant="outline" className="text-xs bg-blue-500/10 text-blue-600 border-blue-500/20">DDoS</Badge>}
                          {domain.ssl_managed && <Badge variant="outline" className="text-xs bg-purple-500/10 text-purple-600 border-purple-500/20">SSL</Badge>}
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-1">
                          {domain.protection_status === 'pending' && (
                            <Button variant="default" size="sm" onClick={() => activateProtection(domain.id)}>Aktivieren</Button>
                          )}
                          <Button variant="outline" size="sm" onClick={() => scanDomain(domain.id, domain.domain)} disabled={scanningDomain === domain.id} title="Scan starten">
                            {scanningDomain === domain.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <Radar className="h-4 w-4" />}
                          </Button>
                          <Button variant="outline" size="sm" onClick={() => runMonitoring(domain.id)} disabled={monitoringRunning} title="Monitoring">
                            <Activity className="h-4 w-4" />
                          </Button>
                          <Button variant="outline" size="sm" onClick={() => addDefaultWafRules(domain.id)} title="Standard WAF-Regeln">
                            <Zap className="h-4 w-4" />
                          </Button>
                          <Button variant="ghost" size="sm" className="text-destructive" onClick={() => handleDeleteDomain(domain.id, domain.domain)} title="Löschen">
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ═══ WAF TAB ═══ */}
        <TabsContent value="waf">
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="flex items-center gap-2">
                    <Shield className="h-5 w-5 text-primary" />
                    Web Application Firewall — Regeln
                  </CardTitle>
                  <CardDescription>Angriffsmuster blockieren, filtern und überwachen</CardDescription>
                </div>
                <Button className="gap-2" onClick={() => setWafDialogOpen(true)}>
                  <Plus className="h-4 w-4" /> Neue Regel
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Regel</TableHead>
                    <TableHead>Domain</TableHead>
                    <TableHead>Pattern</TableHead>
                    <TableHead>Feld</TableHead>
                    <TableHead>Aktion</TableHead>
                    <TableHead>Blockiert</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Aktionen</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {wafRules.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={8} className="text-center text-muted-foreground py-8">
                        <Shield className="h-12 w-12 mx-auto mb-2 opacity-30" />
                        <p>Keine WAF-Regeln konfiguriert</p>
                        <p className="text-sm">Fügen Sie eine Domain hinzu und aktivieren Sie Standard-Regeln</p>
                      </TableCell>
                    </TableRow>
                  ) : wafRules.map((rule) => (
                    <TableRow key={rule.id}>
                      <TableCell>
                        <div>
                          <p className="font-medium text-sm">{rule.rule_name}</p>
                          {rule.description && <p className="text-xs text-muted-foreground">{rule.description}</p>}
                        </div>
                      </TableCell>
                      <TableCell className="text-sm">{getDomainName(rule.domain_id)}</TableCell>
                      <TableCell>
                        <code className="text-xs bg-muted px-2 py-1 rounded max-w-[200px] truncate block">{rule.pattern}</code>
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline" className="text-xs">{rule.match_field}</Badge>
                      </TableCell>
                      <TableCell>
                        <Badge className={
                          rule.action === 'block' ? 'bg-red-500/15 text-red-600 border-red-500/30' :
                          rule.action === 'challenge' ? 'bg-yellow-500/15 text-yellow-600 border-yellow-500/30' :
                          'bg-blue-500/15 text-blue-600 border-blue-500/30'
                        }>{rule.action}</Badge>
                      </TableCell>
                      <TableCell className="font-mono text-sm">{rule.blocked_count}</TableCell>
                      <TableCell>
                        <Switch checked={rule.is_active} onCheckedChange={() => toggleWafRule(rule.id, rule.is_active)} />
                      </TableCell>
                      <TableCell>
                        <Button variant="ghost" size="sm" className="text-destructive" onClick={() => deleteWafRule(rule.id)}>
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ═══ MONITORING TAB ═══ */}
        <TabsContent value="monitoring">
          <div className="space-y-4">
            {/* Per-domain monitoring summary */}
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
              {protectedDomains.filter(d => d.protection_status === 'active').map((domain) => {
                const domainLogs = monitoringLogs.filter(l => l.domain_id === domain.id);
                const latestUptime = domainLogs.find(l => l.check_type === 'uptime');
                const latestSsl = domainLogs.find(l => l.check_type === 'ssl_expiry');
                const latestHeaders = domainLogs.find(l => l.check_type === 'security_headers');
                const latestVuln = domainLogs.find(l => l.check_type === 'vulnerability');

                return (
                  <Card key={domain.id} className="border">
                    <CardHeader className="pb-3">
                      <div className="flex items-center justify-between">
                        <CardTitle className="text-sm flex items-center gap-2">
                          <Globe className="h-4 w-4" />
                          {domain.domain}
                        </CardTitle>
                        {latestUptime && getStatusIcon(latestUptime.status)}
                      </div>
                    </CardHeader>
                    <CardContent className="space-y-3">
                      {latestUptime ? (
                        <>
                          <div className="grid grid-cols-2 gap-2 text-sm">
                            <div className="flex items-center gap-2">
                              {getStatusIcon(latestUptime.status)}
                              <span>Uptime</span>
                            </div>
                            <span className="text-right font-mono">{latestUptime.response_time_ms}ms</span>
                          </div>
                          {latestSsl && (
                            <div className="grid grid-cols-2 gap-2 text-sm">
                              <div className="flex items-center gap-2">
                                {getStatusIcon(latestSsl.status)}
                                <span>SSL</span>
                              </div>
                              <span className="text-right">{latestSsl.ssl_days_remaining} Tage</span>
                            </div>
                          )}
                          {latestHeaders && (
                            <div className="grid grid-cols-2 gap-2 text-sm">
                              <div className="flex items-center gap-2">
                                {getStatusIcon(latestHeaders.status)}
                                <span>Headers</span>
                              </div>
                              <span className="text-right">{latestHeaders.status}</span>
                            </div>
                          )}
                          {latestVuln && (
                            <div className="grid grid-cols-2 gap-2 text-sm">
                              <div className="flex items-center gap-2">
                                {getStatusIcon(latestVuln.status)}
                                <span>Schwachstellen</span>
                              </div>
                              <span className="text-right">{latestVuln.status}</span>
                            </div>
                          )}
                          <p className="text-xs text-muted-foreground">
                            Letzte Prüfung: {format(new Date(latestUptime.checked_at), 'dd.MM.yy HH:mm', { locale: de })}
                          </p>
                        </>
                      ) : (
                        <p className="text-sm text-muted-foreground">Noch nicht geprüft</p>
                      )}
                      <div className="flex gap-1 pt-1">
                        <Button variant="outline" size="sm" className="flex-1" onClick={() => runMonitoring(domain.id)} disabled={monitoringRunning}>
                          <Activity className="h-3 w-3 mr-1" /> Prüfen
                        </Button>
                        <Button variant="outline" size="sm" className="flex-1" onClick={() => scanDomain(domain.id, domain.domain)} disabled={!!scanningDomain}>
                          <Radar className="h-3 w-3 mr-1" /> Scan
                        </Button>
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
              {protectedDomains.filter(d => d.protection_status === 'active').length === 0 && (
                <Card className="col-span-full">
                  <CardContent className="py-8 text-center text-muted-foreground">
                    <Activity className="h-12 w-12 mx-auto mb-2 opacity-30" />
                    <p>Keine aktiven Domains zum Überwachen</p>
                  </CardContent>
                </Card>
              )}
            </div>

            {/* Recent monitoring logs */}
            <Card>
              <CardHeader>
                <CardTitle className="text-sm">Letzte Monitoring-Einträge</CardTitle>
              </CardHeader>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Domain</TableHead>
                      <TableHead>Prüfung</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Antwortzeit</TableHead>
                      <TableHead>Zeitpunkt</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {monitoringLogs.slice(0, 20).map((log) => (
                      <TableRow key={log.id}>
                        <TableCell className="text-sm">{getDomainName(log.domain_id)}</TableCell>
                        <TableCell>
                          <Badge variant="outline" className="text-xs">{log.check_type}</Badge>
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-1">
                            {getStatusIcon(log.status)}
                            <span className="text-sm">{log.status}</span>
                          </div>
                        </TableCell>
                        <TableCell className="font-mono text-sm">
                          {log.response_time_ms ? `${log.response_time_ms}ms` : '—'}
                        </TableCell>
                        <TableCell className="text-sm text-muted-foreground">
                          {format(new Date(log.checked_at), 'dd.MM.yy HH:mm:ss', { locale: de })}
                        </TableCell>
                      </TableRow>
                    ))}
                    {monitoringLogs.length === 0 && (
                      <TableRow>
                        <TableCell colSpan={5} className="text-center text-muted-foreground py-6">
                          Keine Monitoring-Daten — Starten Sie eine Prüfung
                        </TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* ═══ THREATS TAB ═══ */}
        <TabsContent value="threats">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <ShieldAlert className="h-5 w-5 text-red-500" />
                Bedrohungen & WAF-Events
              </CardTitle>
              <CardDescription>Blockierte Angriffe und erkannte Bedrohungen</CardDescription>
            </CardHeader>
            <CardContent>
              {wafEvents.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  <Ban className="h-12 w-12 mx-auto mb-2 opacity-30" />
                  <p>Keine Bedrohungen erkannt</p>
                  <p className="text-sm">WAF-Events werden hier angezeigt sobald Angriffe blockiert werden</p>
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Domain</TableHead>
                      <TableHead>Typ</TableHead>
                      <TableHead>Bedrohung</TableHead>
                      <TableHead>Quell-IP</TableHead>
                      <TableHead>URI</TableHead>
                      <TableHead>Zeitpunkt</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {wafEvents.map((event) => (
                      <TableRow key={event.id}>
                        <TableCell className="text-sm">{getDomainName(event.domain_id)}</TableCell>
                        <TableCell>
                          <Badge variant="destructive" className="text-xs">{event.event_type}</Badge>
                        </TableCell>
                        <TableCell className="text-sm">{event.threat_type || '—'}</TableCell>
                        <TableCell className="font-mono text-xs">{event.source_ip || '—'}</TableCell>
                        <TableCell className="text-xs max-w-[200px] truncate">{event.request_uri || '—'}</TableCell>
                        <TableCell className="text-sm text-muted-foreground">
                          {format(new Date(event.created_at), 'dd.MM.yy HH:mm', { locale: de })}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>
        {/* ═══ NEW TABS ═══ */}
        <TabsContent value="dns"><GapDnsManager domains={protectedDomains.map(d => ({ id: d.id, domain: d.domain }))} /></TabsContent>
        <TabsContent value="ssl"><GapSslManager domains={protectedDomains.map(d => ({ id: d.id, domain: d.domain }))} /></TabsContent>
        <TabsContent value="access"><GapAccessControl domains={protectedDomains.map(d => ({ id: d.id, domain: d.domain }))} /></TabsContent>
        <TabsContent value="cache"><GapCacheCdn domains={protectedDomains.map(d => ({ id: d.id, domain: d.domain }))} /></TabsContent>
        <TabsContent value="pagerules"><GapPageRules domains={protectedDomains.map(d => ({ id: d.id, domain: d.domain }))} /></TabsContent>
        <TabsContent value="analytics"><GapFirewallAnalytics domains={protectedDomains.map(d => ({ id: d.id, domain: d.domain }))} /></TabsContent>
        <TabsContent value="incidents"><GapIncidentResponse domains={protectedDomains.map(d => ({ id: d.id, domain: d.domain }))} /></TabsContent>
        <TabsContent value="threatintel"><GapThreatIntelligence /></TabsContent>
        <TabsContent value="vulns"><GapVulnerabilityManager domains={protectedDomains.map(d => ({ id: d.id, domain: d.domain }))} /></TabsContent>
        <TabsContent value="compliance"><GapComplianceDashboard /></TabsContent>
        <TabsContent value="emailsec"><GapEmailSecurity domains={protectedDomains.map(d => ({ id: d.id, domain: d.domain }))} /></TabsContent>
        <TabsContent value="zerotrust"><GapZeroTrust domains={protectedDomains.map(d => ({ id: d.id, domain: d.domain }))} /></TabsContent>
        <TabsContent value="threatmap"><GapThreatMap /></TabsContent>
        <TabsContent value="reports"><GapSecurityReports domains={protectedDomains.map(d => ({ id: d.id, domain: d.domain }))} /></TabsContent>
      </Tabs>

      {/* ═══ ADD DOMAIN DIALOG ═══ */}
      <Dialog open={addDialogOpen} onOpenChange={setAddDialogOpen}>
        <DialogContent className="sm:max-w-[500px]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Shield className="h-5 w-5 text-primary" />
              Neue Domain schützen
            </DialogTitle>
            <DialogDescription>Domain mit GAP Protection absichern.</DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid gap-2">
              <Label>Domain *</Label>
              <Input placeholder="beispiel.de" value={newDomain.domain}
                onChange={(e) => setNewDomain(p => ({ ...p, domain: e.target.value }))} />
            </div>
            <div className="grid gap-2">
              <Label>Original IP (optional)</Label>
              <Input placeholder="123.456.789.0" value={newDomain.ip_address}
                onChange={(e) => setNewDomain(p => ({ ...p, ip_address: e.target.value }))} />
            </div>
            <div className="grid gap-2">
              <Label>Kunde *</Label>
              <Select value={newDomain.profile_id} onValueChange={(v) => setNewDomain(p => ({ ...p, profile_id: v }))}>
                <SelectTrigger><SelectValue placeholder="Kunde auswählen..." /></SelectTrigger>
                <SelectContent>
                  {profiles.map((p) => (
                    <SelectItem key={p.id} value={p.id}>{p.first_name} {p.last_name} ({p.email})</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="border rounded-lg p-4 space-y-3">
              <h4 className="font-medium text-sm flex items-center gap-2"><Settings className="h-4 w-4" /> Schutzfunktionen</h4>
              {[
                { id: 'waf', label: 'Web Application Firewall', desc: 'SQLi, XSS, RFI Schutz', key: 'waf_enabled' as const },
                { id: 'ddos', label: 'DDoS-Schutz', desc: 'Überlastungsschutz', key: 'ddos_protection' as const },
                { id: 'ssl', label: 'SSL-Verwaltung', desc: 'Auto SSL-Zertifikate', key: 'ssl_managed' as const },
              ].map(({ id, label, desc, key }) => (
                <div key={id} className="flex items-center justify-between">
                  <div><Label htmlFor={id}>{label}</Label><p className="text-xs text-muted-foreground">{desc}</p></div>
                  <Switch id={id} checked={newDomain[key]} onCheckedChange={(c) => setNewDomain(p => ({ ...p, [key]: c }))} />
                </div>
              ))}
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAddDialogOpen(false)}>Abbrechen</Button>
            <Button onClick={handleAddDomain} disabled={addLoading}>
              {addLoading ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Wird hinzugefügt...</> : <><Plus className="h-4 w-4 mr-2" />Hinzufügen</>}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ═══ ADD WAF RULE DIALOG ═══ */}
      <Dialog open={wafDialogOpen} onOpenChange={setWafDialogOpen}>
        <DialogContent className="sm:max-w-[500px]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Shield className="h-5 w-5 text-primary" />
              Neue WAF-Regel
            </DialogTitle>
            <DialogDescription>Benutzerdefinierte Firewall-Regel erstellen.</DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid gap-2">
              <Label>Domain *</Label>
              <Select value={selectedDomainForWaf} onValueChange={setSelectedDomainForWaf}>
                <SelectTrigger><SelectValue placeholder="Domain auswählen..." /></SelectTrigger>
                <SelectContent>
                  {protectedDomains.map((d) => (
                    <SelectItem key={d.id} value={d.id}>{d.domain}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-2">
              <Label>Regelname *</Label>
              <Input placeholder="z.B. SQL Injection Block" value={newWafRule.rule_name}
                onChange={(e) => setNewWafRule(p => ({ ...p, rule_name: e.target.value }))} />
            </div>
            <div className="grid gap-2">
              <Label>Pattern (Regex) *</Label>
              <Input placeholder="(union|select|drop)" value={newWafRule.pattern}
                onChange={(e) => setNewWafRule(p => ({ ...p, pattern: e.target.value }))} />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="grid gap-2">
                <Label>Match-Feld</Label>
                <Select value={newWafRule.match_field} onValueChange={(v) => setNewWafRule(p => ({ ...p, match_field: v }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="uri">URI</SelectItem>
                    <SelectItem value="ip">IP-Adresse</SelectItem>
                    <SelectItem value="user_agent">User Agent</SelectItem>
                    <SelectItem value="header">Header</SelectItem>
                    <SelectItem value="body">Body</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="grid gap-2">
                <Label>Aktion</Label>
                <Select value={newWafRule.action} onValueChange={(v) => setNewWafRule(p => ({ ...p, action: v }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="block">Blockieren</SelectItem>
                    <SelectItem value="challenge">Challenge</SelectItem>
                    <SelectItem value="log">Nur loggen</SelectItem>
                    <SelectItem value="allow">Erlauben</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid gap-2">
              <Label>Beschreibung</Label>
              <Input placeholder="Optionale Beschreibung" value={newWafRule.description}
                onChange={(e) => setNewWafRule(p => ({ ...p, description: e.target.value }))} />
            </div>
            <div className="grid gap-2">
              <Label>Priorität (niedriger = höher)</Label>
              <Input type="number" value={newWafRule.priority}
                onChange={(e) => setNewWafRule(p => ({ ...p, priority: parseInt(e.target.value) || 100 }))} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setWafDialogOpen(false)}>Abbrechen</Button>
            <Button onClick={handleAddWafRule} disabled={wafLoading}>
              {wafLoading ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Wird erstellt...</> : <><Plus className="h-4 w-4 mr-2" />Regel erstellen</>}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
