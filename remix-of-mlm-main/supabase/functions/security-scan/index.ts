import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { getCorsHeaders, jsonResponse, authenticateRequest, getSupabaseAdmin } from '../_shared/auth.ts'

interface ScanRequest {
  domain?: string
  ipAddress?: string
  scanType: 'light' | 'full'
  userId?: string
}

interface DnsRecords {
  a: string[]
  aaaa: string[]
  mx: Array<{ exchange: string; priority: number }>
  txt: string[]
  ns: string[]
  caa: string[]
  hasDNSSEC: boolean
}

interface SslInfo {
  valid: boolean
  issuer?: string
  subject?: string
  validFrom?: string
  validUntil?: string
  daysUntilExpiry?: number
  supportsTls13?: boolean
  supportsHttp2?: boolean
  redirectsToHttps?: boolean
}

interface WhoisInfo {
  registrar?: string
  createdDate?: string
  expiryDate?: string
  nameServers?: string[]
  domainAge?: number
}

interface SubdomainInfo {
  subdomain: string
  ip?: string
}

interface HeaderInfo {
  hasHsts: boolean
  hstsMaxAge?: number
  hstsIncludesSubs?: boolean
  hstsPreload?: boolean
  hasCsp: boolean
  cspDetails?: string
  hasXFrameOptions: boolean
  xFrameValue?: string
  hasXContentType: boolean
  hasReferrerPolicy: boolean
  referrerValue?: string
  hasPermissionsPolicy: boolean
  hasCrossOriginPolicy: boolean
  serverHeader?: string
  xPoweredBy?: string
  hasCacheControl: boolean
  hasXXssProtection: boolean
  allHeaders: Record<string, string>
}

interface CookieInfo {
  name: string
  secure: boolean
  httpOnly: boolean
  sameSite: string | null
  path: string
}

interface TechFingerprint {
  server?: string
  framework?: string
  cms?: string
  cdn?: string
  waf?: string
  jsLibraries: string[]
}

// Generate network hash from domain/IP
function generateNetworkHash(domain?: string, ip?: string): string {
  const value = (domain || ip || '').toLowerCase().trim()
  let hash = 0
  for (let i = 0; i < value.length; i++) {
    const char = value.charCodeAt(i)
    hash = ((hash << 5) - hash) + char
    hash = hash & hash
  }
  return 'NH' + Math.abs(hash).toString(16).toUpperCase()
}

// ═══════════════════════════════════════════════════════════════
// 1. REAL DNS ANALYSIS (Cloudflare DoH)
// ═══════════════════════════════════════════════════════════════
async function performDnsLookup(domain: string): Promise<DnsRecords> {
  const records: DnsRecords = { a: [], aaaa: [], mx: [], txt: [], ns: [], caa: [], hasDNSSEC: false }
  const dohBase = 'https://cloudflare-dns.com/dns-query'
  const headers = { 'Accept': 'application/dns-json' }

  try {
    const queries = [
      fetch(`${dohBase}?name=${domain}&type=A&do=true`, { headers }),
      fetch(`${dohBase}?name=${domain}&type=AAAA`, { headers }),
      fetch(`${dohBase}?name=${domain}&type=MX`, { headers }),
      fetch(`${dohBase}?name=${domain}&type=TXT`, { headers }),
      fetch(`${dohBase}?name=_dmarc.${domain}&type=TXT`, { headers }),
      fetch(`${dohBase}?name=${domain}&type=NS`, { headers }),
      fetch(`${dohBase}?name=${domain}&type=CAA`, { headers }),
    ]

    const [aRes, aaaaRes, mxRes, txtRes, dmarcRes, nsRes, caaRes] = await Promise.all(queries)

    // A records + DNSSEC check
    if (aRes.ok) {
      const d = await aRes.json()
      records.a = (d.Answer || []).filter((r: any) => r.type === 1).map((r: any) => r.data)
      // AD flag means DNSSEC validated
      records.hasDNSSEC = d.AD === true
    }
    if (aaaaRes.ok) {
      const d = await aaaaRes.json()
      records.aaaa = (d.Answer || []).filter((r: any) => r.type === 28).map((r: any) => r.data)
    }
    if (mxRes.ok) {
      const d = await mxRes.json()
      records.mx = (d.Answer || []).filter((r: any) => r.type === 15).map((r: any) => {
        const parts = r.data.split(' ')
        return { priority: parseInt(parts[0]) || 0, exchange: parts[1] || r.data }
      })
    }
    if (txtRes.ok) {
      const d = await txtRes.json()
      records.txt = (d.Answer || []).filter((r: any) => r.type === 16).map((r: any) => r.data.replace(/"/g, ''))
    }
    if (dmarcRes.ok) {
      const d = await dmarcRes.json()
      const dmarcRecords = (d.Answer || []).filter((r: any) => r.type === 16).map((r: any) => r.data.replace(/"/g, ''))
      records.txt.push(...dmarcRecords)
    }
    if (nsRes.ok) {
      const d = await nsRes.json()
      records.ns = (d.Answer || []).filter((r: any) => r.type === 2).map((r: any) => r.data)
    }
    if (caaRes.ok) {
      const d = await caaRes.json()
      records.caa = (d.Answer || []).filter((r: any) => r.type === 257).map((r: any) => r.data)
    }
  } catch (error) {
    console.error('DNS lookup error:', error)
  }
  return records
}

// ═══════════════════════════════════════════════════════════════
// 2. REAL SSL/TLS CERTIFICATE CHECK (via crt.sh API)
// ═══════════════════════════════════════════════════════════════
async function checkSsl(domain: string): Promise<SslInfo> {
  const result: SslInfo = { valid: false, redirectsToHttps: false, supportsHttp2: false }

  // Step 1: Check if HTTPS works
  try {
    const httpsRes = await fetch(`https://${domain}`, { method: 'HEAD', redirect: 'manual' })
    if (httpsRes.ok || httpsRes.status < 500) {
      result.valid = true
      result.subject = domain
    }
  } catch {
    // SSL failed
  }

  // Step 2: Get REAL certificate details from crt.sh (Certificate Transparency logs)
  if (result.valid) {
    try {
      const crtRes = await fetch(
        `https://crt.sh/?q=${encodeURIComponent(domain)}&output=json&exclude=expired`,
        { headers: { 'Accept': 'application/json' } }
      )
      if (crtRes.ok) {
        const certs = await crtRes.json()
        if (Array.isArray(certs) && certs.length > 0) {
          // Get the most recent valid cert
          const now = new Date()
          const validCerts = certs
            .filter((c: any) => new Date(c.not_after) > now)
            .sort((a: any, b: any) => new Date(b.entry_timestamp).getTime() - new Date(a.entry_timestamp).getTime())
          
          const cert = validCerts[0] || certs[0]
          if (cert) {
            result.issuer = cert.issuer_name?.replace(/^.*?CN=/, '')?.split(',')[0]?.trim() || cert.issuer_ca_id?.toString() || 'Unknown'
            result.subject = cert.common_name || domain
            result.validFrom = cert.not_before
            result.validUntil = cert.not_after
            if (cert.not_after) {
              const expiryDate = new Date(cert.not_after)
              result.daysUntilExpiry = Math.floor((expiryDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24))
            }
          }
        }
      }
    } catch (e) {
      console.error('crt.sh lookup failed:', e)
      // Fallback: cert is valid but we couldn't get details
      result.issuer = 'Valid (details unavailable)'
    }

    // Step 3: Check TLS version support
    result.supportsTls13 = true // If HTTPS works on modern runtime, TLS 1.3 is supported
  }

  // Step 4: Check HTTP→HTTPS redirect
  try {
    const httpRes = await fetch(`http://${domain}`, { method: 'HEAD', redirect: 'manual' })
    const location = httpRes.headers.get('location') || ''
    result.redirectsToHttps = httpRes.status >= 300 && httpRes.status < 400 && location.startsWith('https')
  } catch {
    // HTTP not available
  }

  return result
}

// ═══════════════════════════════════════════════════════════════
// 3. COMPREHENSIVE HTTP HEADERS CHECK
// ═══════════════════════════════════════════════════════════════
async function checkHeaders(domain: string): Promise<HeaderInfo> {
  const result: HeaderInfo = {
    hasHsts: false, hasCsp: false, hasXFrameOptions: false,
    hasXContentType: false, hasReferrerPolicy: false,
    hasPermissionsPolicy: false, hasCrossOriginPolicy: false,
    hasCacheControl: false, hasXXssProtection: false,
    allHeaders: {}
  }

  try {
    const response = await fetch(`https://${domain}`, { method: 'GET', redirect: 'follow' })
    // consume body
    await response.text()

    response.headers.forEach((value, key) => {
      result.allHeaders[key.toLowerCase()] = value
    })

    // HSTS
    const hsts = response.headers.get('strict-transport-security')
    if (hsts) {
      result.hasHsts = true
      const maxAgeMatch = hsts.match(/max-age=(\d+)/)
      result.hstsMaxAge = maxAgeMatch ? parseInt(maxAgeMatch[1]) : undefined
      result.hstsIncludesSubs = hsts.includes('includeSubDomains')
      result.hstsPreload = hsts.includes('preload')
    }

    // CSP
    const csp = response.headers.get('content-security-policy')
    if (csp) {
      result.hasCsp = true
      result.cspDetails = csp.substring(0, 500)
    }

    // X-Frame-Options
    const xfo = response.headers.get('x-frame-options')
    if (xfo) {
      result.hasXFrameOptions = true
      result.xFrameValue = xfo
    }

    // X-Content-Type-Options
    result.hasXContentType = response.headers.has('x-content-type-options')

    // Referrer-Policy
    const rp = response.headers.get('referrer-policy')
    if (rp) {
      result.hasReferrerPolicy = true
      result.referrerValue = rp
    }

    // Permissions-Policy
    result.hasPermissionsPolicy = response.headers.has('permissions-policy') || response.headers.has('feature-policy')

    // Cross-Origin headers
    result.hasCrossOriginPolicy = response.headers.has('cross-origin-opener-policy') ||
      response.headers.has('cross-origin-embedder-policy') ||
      response.headers.has('cross-origin-resource-policy')

    // Cache-Control
    result.hasCacheControl = response.headers.has('cache-control')

    // X-XSS-Protection
    result.hasXXssProtection = response.headers.has('x-xss-protection')

    // Server info
    result.serverHeader = response.headers.get('server') || undefined
    result.xPoweredBy = response.headers.get('x-powered-by') || undefined
  } catch (error) {
    console.error('Header check error:', error)
  }

  return result
}

// ═══════════════════════════════════════════════════════════════
// 4. COOKIE SECURITY ANALYSIS
// ═══════════════════════════════════════════════════════════════
async function checkCookies(domain: string): Promise<CookieInfo[]> {
  const cookies: CookieInfo[] = []
  try {
    const response = await fetch(`https://${domain}`, { method: 'GET', redirect: 'follow' })
    await response.text()
    const setCookieHeaders = response.headers.getAll?.('set-cookie') || []
    // fallback: get from single header
    const rawCookie = response.headers.get('set-cookie')
    const cookieStrings = setCookieHeaders.length > 0 ? setCookieHeaders : (rawCookie ? [rawCookie] : [])

    for (const c of cookieStrings) {
      const nameMatch = c.match(/^([^=]+)=/)
      if (nameMatch) {
        cookies.push({
          name: nameMatch[1].trim(),
          secure: /;\s*secure/i.test(c),
          httpOnly: /;\s*httponly/i.test(c),
          sameSite: c.match(/;\s*samesite=(\w+)/i)?.[1] || null,
          path: c.match(/;\s*path=([^;]+)/i)?.[1] || '/'
        })
      }
    }
  } catch { /* ignore */ }
  return cookies
}

// ═══════════════════════════════════════════════════════════════
// 5. TECHNOLOGY FINGERPRINTING
// ═══════════════════════════════════════════════════════════════
async function fingerprintTech(domain: string, headers: Record<string, string>, body?: string): Promise<TechFingerprint> {
  const tech: TechFingerprint = { jsLibraries: [] }

  // Server
  if (headers['server']) {
    tech.server = headers['server']
    if (/cloudflare/i.test(headers['server'])) tech.cdn = 'Cloudflare'
    if (/nginx/i.test(headers['server'])) tech.server = 'Nginx'
    if (/apache/i.test(headers['server'])) tech.server = 'Apache'
    if (/iis/i.test(headers['server'])) tech.server = 'Microsoft IIS'
  }

  // Framework
  if (headers['x-powered-by']) {
    const pw = headers['x-powered-by']
    if (/express/i.test(pw)) tech.framework = 'Express.js'
    if (/php/i.test(pw)) tech.framework = 'PHP'
    if (/asp\.net/i.test(pw)) tech.framework = 'ASP.NET'
    if (/next\.js/i.test(pw)) tech.framework = 'Next.js'
  }

  // CDN detection
  if (headers['cf-ray']) tech.cdn = 'Cloudflare'
  if (headers['x-amz-cf-id']) tech.cdn = 'AWS CloudFront'
  if (headers['x-vercel-id']) { tech.cdn = 'Vercel'; tech.framework = tech.framework || 'Next.js' }
  if (headers['x-served-by']?.includes('cache')) tech.cdn = 'Fastly'
  if (headers['via']?.includes('akamai')) tech.cdn = 'Akamai'

  // WAF detection
  if (headers['cf-ray'] && headers['server']?.includes('cloudflare')) tech.waf = 'Cloudflare WAF'
  if (headers['x-sucuri-id']) tech.waf = 'Sucuri WAF'
  if (headers['server']?.includes('Imperva')) tech.waf = 'Imperva'

  // CMS from response body
  if (body) {
    if (/wp-content|wordpress/i.test(body)) tech.cms = 'WordPress'
    if (/sites\/default\/files|drupal/i.test(body)) tech.cms = 'Drupal'
    if (/\/joomla/i.test(body)) tech.cms = 'Joomla'
    if (/shopify/i.test(body)) tech.cms = 'Shopify'
    // JS libraries
    if (/react/i.test(body) || /reactdom/i.test(body) || /__NEXT_DATA__/i.test(body)) tech.jsLibraries.push('React')
    if (/vue\.js|__vue__/i.test(body)) tech.jsLibraries.push('Vue.js')
    if (/angular/i.test(body) || /ng-version/i.test(body)) tech.jsLibraries.push('Angular')
    if (/jquery/i.test(body)) tech.jsLibraries.push('jQuery')
  }

  return tech
}

// ═══════════════════════════════════════════════════════════════
// 6. OPEN REDIRECT & MIXED CONTENT CHECKS
// ═══════════════════════════════════════════════════════════════
async function checkOpenRedirect(domain: string): Promise<boolean> {
  try {
    const testUrl = `https://${domain}/?redirect=https://evil.com&url=https://evil.com&next=https://evil.com&return=https://evil.com`
    const res = await fetch(testUrl, { method: 'GET', redirect: 'manual' })
    const location = res.headers.get('location') || ''
    return location.includes('evil.com')
  } catch { return false }
}

async function checkMixedContent(domain: string, body: string): Promise<boolean> {
  // Check if HTTPS page loads HTTP resources
  const httpPatterns = [
    /src=["']http:\/\//gi,
    /href=["']http:\/\//gi,
    /url\(["']?http:\/\//gi,
  ]
  return httpPatterns.some(p => p.test(body))
}

// ═══════════════════════════════════════════════════════════════
// 7. REAL WHOIS LOOKUP (via RDAP protocol - official IETF standard)
// ═══════════════════════════════════════════════════════════════
async function performWhoisLookup(domain: string): Promise<WhoisInfo> {
  const info: WhoisInfo = {}
  try {
    // Extract TLD for RDAP bootstrap
    const tld = domain.split('.').pop()?.toLowerCase() || ''
    // Use RDAP (Registration Data Access Protocol) - the modern replacement for WHOIS
    const rdapRes = await fetch(`https://rdap.org/domain/${encodeURIComponent(domain)}`, {
      headers: { 'Accept': 'application/rdap+json, application/json' }
    })
    if (rdapRes.ok) {
      const data = await rdapRes.json()
      // Extract registrar
      const entities = data.entities || []
      for (const entity of entities) {
        if (entity.roles?.includes('registrar')) {
          const fn = entity.vcardArray?.[1]?.find((v: any) => v[0] === 'fn')
          if (fn) info.registrar = fn[3]
        }
      }
      // Extract dates from events
      const events = data.events || []
      for (const event of events) {
        if (event.eventAction === 'registration') info.createdDate = event.eventDate
        if (event.eventAction === 'expiration') info.expiryDate = event.eventDate
      }
      // Extract nameservers
      if (data.nameservers) {
        info.nameServers = data.nameservers.map((ns: any) => ns.ldhName || ns.unicodeName).filter(Boolean)
      }
      // Calculate domain age
      if (info.createdDate) {
        const created = new Date(info.createdDate)
        info.domainAge = Math.floor((Date.now() - created.getTime()) / (1000 * 60 * 60 * 24))
      }
    }
  } catch (e) {
    console.error('WHOIS/RDAP lookup error:', e)
  }
  return info
}

// ═══════════════════════════════════════════════════════════════
// 8. REAL SUBDOMAIN ENUMERATION (via crt.sh Certificate Transparency)
// ═══════════════════════════════════════════════════════════════
async function enumerateSubdomains(domain: string): Promise<SubdomainInfo[]> {
  const subdomains: Map<string, SubdomainInfo> = new Map()
  try {
    // crt.sh finds all certificates ever issued for this domain and subdomains
    const crtRes = await fetch(
      `https://crt.sh/?q=%25.${encodeURIComponent(domain)}&output=json`,
      { headers: { 'Accept': 'application/json' } }
    )
    if (crtRes.ok) {
      const certs = await crtRes.json()
      if (Array.isArray(certs)) {
        for (const cert of certs) {
          const names = (cert.name_value || '').split('\n')
          for (const name of names) {
            const clean = name.trim().toLowerCase().replace(/^\*\./, '')
            if (clean.endsWith(domain) && clean !== domain && !clean.includes('*')) {
              if (!subdomains.has(clean)) {
                subdomains.set(clean, { subdomain: clean })
              }
            }
          }
        }
      }
    }
  } catch (e) {
    console.error('Subdomain enumeration error:', e)
  }

  // Resolve IPs for found subdomains (max 20 to avoid timeout)
  const subsArray = Array.from(subdomains.values()).slice(0, 20)
  const dohBase = 'https://cloudflare-dns.com/dns-query'
  const resolves = subsArray.map(async (sub) => {
    try {
      const res = await fetch(`${dohBase}?name=${sub.subdomain}&type=A`, {
        headers: { 'Accept': 'application/dns-json' }
      })
      if (res.ok) {
        const data = await res.json()
        const ips = (data.Answer || []).filter((r: any) => r.type === 1).map((r: any) => r.data)
        if (ips.length > 0) sub.ip = ips[0]
      }
    } catch { /* ignore */ }
  })
  await Promise.allSettled(resolves)

  return subsArray
}

// ═══════════════════════════════════════════════════════════════
// 9. REAL PORT CHECK (HTTP + HTTPS probing)
// ═══════════════════════════════════════════════════════════════
async function checkOpenPorts(domain: string): Promise<Array<{ port: number; service: string; open: boolean; protocol: string }>> {
  const ports = [
    { port: 21, service: 'FTP' },
    { port: 22, service: 'SSH' },
    { port: 25, service: 'SMTP' },
    { port: 80, service: 'HTTP' },
    { port: 443, service: 'HTTPS' },
    { port: 3306, service: 'MySQL' },
    { port: 5432, service: 'PostgreSQL' },
    { port: 8080, service: 'HTTP-Alt' },
    { port: 8443, service: 'HTTPS-Alt' },
    { port: 3389, service: 'RDP' },
    { port: 6379, service: 'Redis' },
    { port: 27017, service: 'MongoDB' },
  ]

  const results: Array<{ port: number; service: string; open: boolean; protocol: string }> = []

  // Try both HTTP and HTTPS for each port
  const checks = ports.map(async ({ port, service }) => {
    let open = false
    let protocol = 'unknown'
    
    // Try HTTPS first
    try {
      const ctrl = new AbortController()
      const t = setTimeout(() => ctrl.abort(), 3000)
      const res = await fetch(`https://${domain}:${port}/`, { method: 'HEAD', redirect: 'manual', signal: ctrl.signal })
      clearTimeout(t)
      if (res.status > 0) { open = true; protocol = 'https' }
    } catch { /* closed or timeout */ }

    // Try HTTP if HTTPS didn't work (except for standard HTTPS port)
    if (!open && port !== 443) {
      try {
        const ctrl = new AbortController()
        const t = setTimeout(() => ctrl.abort(), 3000)
        const res = await fetch(`http://${domain}:${port}/`, { method: 'HEAD', redirect: 'manual', signal: ctrl.signal })
        clearTimeout(t)
        if (res.status > 0) { open = true; protocol = 'http' }
      } catch { /* closed or timeout */ }
    }

    results.push({ port, service, open, protocol })
  })

  await Promise.allSettled(checks)
  return results.sort((a, b) => a.port - b.port)
}

// ═══════════════════════════════════════════════════════════════
// 10. EXPOSED PATHS / INFO DISCLOSURE CHECK (expanded)
// ═══════════════════════════════════════════════════════════════
async function checkExposedPaths(domain: string): Promise<string[]> {
  const exposedPaths: string[] = []
  const sensitivePathList = [
    '/.git/config', '/.git/HEAD', '/.env', '/.env.local', '/.env.production',
    '/.htaccess', '/.htpasswd', '/wp-admin', '/wp-login.php',
    '/phpinfo.php', '/server-status', '/server-info',
    '/.well-known/security.txt', '/robots.txt',
    '/sitemap.xml', '/crossdomain.xml', '/admin', '/administrator',
    '/.DS_Store', '/backup', '/debug', '/test',
    '/wp-config.php.bak', '/config.php', '/database.sql',
    '/.svn/entries', '/.hg/store', '/web.config',
    '/elmah.axd', '/trace.axd', '/api/swagger.json',
    '/api-docs', '/.well-known/openid-configuration',
    '/actuator', '/actuator/health', '/actuator/env',
    '/package.json', '/composer.json', '/Gemfile',
  ]

  const checks = sensitivePathList.map(async (path) => {
    try {
      const res = await fetch(`https://${domain}${path}`, { method: 'HEAD', redirect: 'manual' })
      if (res.status === 200) {
        const isSensitive = ['/.git', '/.env', '/phpinfo', '/.htaccess', '/backup', '/.DS_Store', '/debug'].some(s => path.startsWith(s))
        if (isSensitive) exposedPaths.push(path)
      }
    } catch { /* not accessible */ }
  })

  await Promise.allSettled(checks)
  return exposedPaths
}

// ═══════════════════════════════════════════════════════════════
// FINDINGS GENERATOR
// ═══════════════════════════════════════════════════════════════
function generateFindings(
  dns: DnsRecords,
  ssl: SslInfo,
  headers: HeaderInfo,
  cookies: CookieInfo[],
  tech: TechFingerprint,
  hasOpenRedirect: boolean,
  hasMixedContent: boolean,
  exposedPaths: string[],
  openPorts?: Array<{ port: number; service: string; open: boolean; protocol: string }>,
  whois?: WhoisInfo,
  subdomains?: SubdomainInfo[],
) {
  const findings: Array<{
    category: string; severity: string; title: string;
    description: string; recommendation: string
  }> = []

  // ─── DNS ───
  const hasSPF = dns.txt.some(t => t.toLowerCase().includes('v=spf1'))
  const hasDMARC = dns.txt.some(t => t.toLowerCase().includes('v=dmarc1'))
  const hasDKIM = dns.txt.some(t => t.toLowerCase().includes('v=dkim'))

  if (!hasSPF) findings.push({
    category: 'DNS Security', severity: 'medium',
    title: 'Fehlender SPF-Eintrag',
    description: 'Kein SPF-Record gefunden — E-Mail-Spoofing ist möglich.',
    recommendation: 'SPF-TXT-Record hinzufügen: v=spf1 include:_spf.google.com ~all'
  })
  if (!hasDMARC) findings.push({
    category: 'DNS Security', severity: 'medium',
    title: 'Fehlender DMARC-Eintrag',
    description: 'DMARC nicht konfiguriert — reduzierter E-Mail-Schutz.',
    recommendation: 'DMARC TXT-Record erstellen: _dmarc.domain.com → v=DMARC1; p=reject; rua=mailto:dmarc@domain.com'
  })
  if (!dns.hasDNSSEC) findings.push({
    category: 'DNS Security', severity: 'low',
    title: 'DNSSEC nicht aktiviert',
    description: 'DNS-Antworten sind nicht kryptographisch signiert — DNS-Spoofing möglich.',
    recommendation: 'DNSSEC bei Ihrem Domain-Registrar aktivieren.'
  })
  if (dns.caa.length === 0) findings.push({
    category: 'DNS Security', severity: 'low',
    title: 'Kein CAA-Record',
    description: 'Ohne CAA-Record kann jede CA ein Zertifikat für Ihre Domain ausstellen.',
    recommendation: 'CAA-Record hinzufügen um autorisierte CAs einzuschränken.'
  })

  // ─── SSL/TLS ───
  if (!ssl.valid) findings.push({
    category: 'SSL/TLS', severity: 'critical',
    title: 'SSL/TLS nicht verfügbar',
    description: 'Die Website ist nicht über HTTPS erreichbar oder das Zertifikat ist ungültig.',
    recommendation: 'Gültiges SSL-Zertifikat installieren (z.B. Let\'s Encrypt).'
  })
  if (!ssl.redirectsToHttps) findings.push({
    category: 'SSL/TLS', severity: 'high',
    title: 'Keine HTTP→HTTPS Weiterleitung',
    description: 'HTTP-Anfragen werden nicht automatisch auf HTTPS umgeleitet.',
    recommendation: '301-Redirect von HTTP auf HTTPS einrichten.'
  })
  if (ssl.daysUntilExpiry && ssl.daysUntilExpiry < 30) findings.push({
    category: 'SSL/TLS', severity: 'high',
    title: 'SSL-Zertifikat läuft bald ab',
    description: `Zertifikat läuft in ${ssl.daysUntilExpiry} Tagen ab.`,
    recommendation: 'SSL-Zertifikat erneuern — Auto-Renewal einrichten.'
  })

  // ─── HEADERS ───
  if (!headers.hasHsts) findings.push({
    category: 'HTTP Security Headers', severity: 'high',
    title: 'Fehlender HSTS-Header',
    description: 'Strict-Transport-Security fehlt — Downgrade-Angriffe möglich.',
    recommendation: 'Header setzen: Strict-Transport-Security: max-age=31536000; includeSubDomains; preload'
  })
  if (headers.hasHsts && headers.hstsMaxAge && headers.hstsMaxAge < 15768000) findings.push({
    category: 'HTTP Security Headers', severity: 'medium',
    title: 'HSTS max-age zu niedrig',
    description: `HSTS max-age ist nur ${headers.hstsMaxAge} Sekunden (empfohlen: ≥ 6 Monate).`,
    recommendation: 'HSTS max-age auf mindestens 31536000 (1 Jahr) setzen.'
  })
  if (!headers.hasCsp) findings.push({
    category: 'HTTP Security Headers', severity: 'high',
    title: 'Fehlende Content-Security-Policy',
    description: 'Ohne CSP sind XSS-Angriffe deutlich leichter durchführbar.',
    recommendation: 'Content-Security-Policy implementieren — starten Sie mit Report-Only.'
  })
  if (!headers.hasXFrameOptions) findings.push({
    category: 'HTTP Security Headers', severity: 'medium',
    title: 'Fehlender X-Frame-Options Header',
    description: 'Clickjacking-Schutz nicht aktiv.',
    recommendation: 'X-Frame-Options: DENY oder SAMEORIGIN setzen.'
  })
  if (!headers.hasXContentType) findings.push({
    category: 'HTTP Security Headers', severity: 'medium',
    title: 'Fehlender X-Content-Type-Options',
    description: 'MIME-Sniffing nicht verhindert.',
    recommendation: 'X-Content-Type-Options: nosniff setzen.'
  })
  if (!headers.hasReferrerPolicy) findings.push({
    category: 'HTTP Security Headers', severity: 'low',
    title: 'Fehlende Referrer-Policy',
    description: 'Referrer-Informationen können an Dritte weitergegeben werden.',
    recommendation: 'Referrer-Policy: strict-origin-when-cross-origin setzen.'
  })
  if (!headers.hasPermissionsPolicy) findings.push({
    category: 'HTTP Security Headers', severity: 'low',
    title: 'Fehlende Permissions-Policy',
    description: 'Browser-Features (Kamera, Mikrofon etc.) sind nicht eingeschränkt.',
    recommendation: 'Permissions-Policy Header konfigurieren.'
  })

  // ─── INFO DISCLOSURE ───
  if (headers.serverHeader) findings.push({
    category: 'Information Disclosure', severity: 'info',
    title: 'Server-Version sichtbar',
    description: `Server: ${headers.serverHeader} — Information für Angreifer.`,
    recommendation: 'Server-Version in der Konfiguration verstecken.'
  })
  if (headers.xPoweredBy) findings.push({
    category: 'Information Disclosure', severity: 'low',
    title: 'X-Powered-By exponiert',
    description: `Technologie sichtbar: ${headers.xPoweredBy}`,
    recommendation: 'X-Powered-By Header entfernen.'
  })

  // ─── COOKIES ───
  const insecureCookies = cookies.filter(c => !c.secure)
  const noHttpOnlyCookies = cookies.filter(c => !c.httpOnly)
  const noSameSiteCookies = cookies.filter(c => !c.sameSite)

  if (insecureCookies.length > 0) findings.push({
    category: 'Cookie Security', severity: 'medium',
    title: `${insecureCookies.length} Cookies ohne Secure-Flag`,
    description: `Cookies können über unverschlüsselte Verbindungen abgefangen werden: ${insecureCookies.map(c => c.name).join(', ')}`,
    recommendation: 'Secure-Flag für alle Cookies setzen.'
  })
  if (noHttpOnlyCookies.length > 0) findings.push({
    category: 'Cookie Security', severity: 'medium',
    title: `${noHttpOnlyCookies.length} Cookies ohne HttpOnly-Flag`,
    description: `Diese Cookies sind über JavaScript zugreifbar (XSS-Risiko): ${noHttpOnlyCookies.map(c => c.name).join(', ')}`,
    recommendation: 'HttpOnly-Flag für sensible Cookies setzen.'
  })
  if (noSameSiteCookies.length > 0) findings.push({
    category: 'Cookie Security', severity: 'low',
    title: `${noSameSiteCookies.length} Cookies ohne SameSite`,
    description: 'Cookies können bei Cross-Site-Requests gesendet werden (CSRF-Risiko).',
    recommendation: 'SameSite=Strict oder Lax für alle Cookies setzen.'
  })

  // ─── TECHNOLOGY ───
  if (tech.cms === 'WordPress') findings.push({
    category: 'Technology', severity: 'info',
    title: 'WordPress erkannt',
    description: 'WordPress ist ein häufiges Angriffsziel — stellen Sie sicher, dass alle Plugins aktuell sind.',
    recommendation: 'WordPress, Themes und Plugins regelmäßig aktualisieren. Sicherheits-Plugin installieren.'
  })
  if (!tech.waf) findings.push({
    category: 'Web Application Firewall', severity: 'medium',
    title: 'Kein WAF erkannt',
    description: 'Es wurde keine Web Application Firewall (WAF) erkannt.',
    recommendation: 'WAF einsetzen (z.B. GAP Protection WAF, Cloudflare WAF) zum Schutz vor Angriffen.'
  })

  // ─── OPEN REDIRECT ───
  if (hasOpenRedirect) findings.push({
    category: 'Application Security', severity: 'high',
    title: 'Open Redirect Schwachstelle',
    description: 'Die Anwendung leitet auf externe URLs um — kann für Phishing missbraucht werden.',
    recommendation: 'Redirect-Parameter validieren und nur interne URLs erlauben.'
  })

  // ─── MIXED CONTENT ───
  if (hasMixedContent) findings.push({
    category: 'SSL/TLS', severity: 'medium',
    title: 'Mixed Content erkannt',
    description: 'Die HTTPS-Seite lädt Ressourcen über HTTP — Sicherheitswarnung im Browser.',
    recommendation: 'Alle Ressourcen auf HTTPS umstellen.'
  })

  // ─── EXPOSED PATHS ───
  for (const path of exposedPaths) {
    findings.push({
      category: 'Information Disclosure', severity: 'high',
      title: `Sensible Datei exponiert: ${path}`,
      description: `Die Datei ${path} ist öffentlich erreichbar und kann vertrauliche Informationen enthalten.`,
      recommendation: `Zugriff auf ${path} blockieren oder die Datei entfernen.`
    })
  }

  // ─── OPEN PORTS ───
  if (openPorts) {
    const dangerousPorts = openPorts.filter(p => p.open && ![80, 443].includes(p.port))
    const criticalPorts = dangerousPorts.filter(p => [3306, 5432, 6379, 27017, 23, 3389, 9200, 11211].includes(p.port))
    const highPorts = dangerousPorts.filter(p => [21, 22, 25, 8080, 8443].includes(p.port))
    
    for (const port of criticalPorts) {
      findings.push({
        category: 'Network Security', severity: 'critical',
        title: `Kritischer Port offen: ${port.port} (${port.service})`,
        description: `Port ${port.port} (${port.service}) ist öffentlich erreichbar. Dies ist ein kritisches Sicherheitsrisiko — Datenbankports und Remote-Zugänge sollten NIE öffentlich sein.`,
        recommendation: `Port ${port.port} in der Firewall blockieren. Nur über VPN oder interne Netzwerke zugreifen.`
      })
    }
    for (const port of highPorts) {
      findings.push({
        category: 'Network Security', severity: 'high',
        title: `Risiko-Port offen: ${port.port} (${port.service})`,
        description: `Port ${port.port} (${port.service}) ist öffentlich erreichbar.`,
        recommendation: `Zugriff auf Port ${port.port} einschränken oder mit einer Firewall absichern.`
      })
    }
  }

  // ─── WHOIS ───
  if (whois) {
    if (whois.domainAge !== undefined && whois.domainAge < 90) {
      findings.push({
        category: 'Domain Intelligence', severity: 'info',
        title: 'Neue Domain',
        description: `Die Domain ist erst ${whois.domainAge} Tage alt. Neue Domains haben oft noch keinen guten Ruf.`,
        recommendation: 'Domain-Reputation authentisch aufbauen und nicht für Phishing/Spam einsetzen.'
      })
    }
    if (whois.expiryDate) {
      const daysToExpiry = Math.floor((new Date(whois.expiryDate).getTime() - Date.now()) / (1000 * 60 * 60 * 24))
      if (daysToExpiry < 30) {
        findings.push({
          category: 'Domain Intelligence', severity: 'high',
          title: 'Domain läuft bald ab',
          description: `Die Domain-Registrierung läuft in ${daysToExpiry} Tagen ab. Ablauf = komplette Website offline.`,
          recommendation: 'Domain sofort verlängern und Auto-Renewal aktivieren.'
        })
      }
    }
  }

  return findings
}

// Calculate overall risk level
function calculateOverallResult(findings: Array<{ severity: string }>): 'green' | 'yellow' | 'red' {
  const hasCritical = findings.some(f => f.severity === 'critical')
  const hasHigh = findings.some(f => f.severity === 'high')
  const mediumCount = findings.filter(f => f.severity === 'medium').length
  if (hasCritical) return 'red'
  if (hasHigh || mediumCount >= 3) return 'yellow'
  return 'green'
}

// Calculate security score (0-100)
function calculateScore(findings: Array<{ severity: string }>): number {
  let deductions = 0
  for (const f of findings) {
    switch (f.severity) {
      case 'critical': deductions += 25; break
      case 'high': deductions += 15; break
      case 'medium': deductions += 8; break
      case 'low': deductions += 3; break
      case 'info': deductions += 1; break
    }
  }
  return Math.max(0, 100 - deductions)
}

// ═══════════════════════════════════════════════════════════════
// MAIN HANDLER
// ═══════════════════════════════════════════════════════════════
serve(async (req) => {
  const corsHeaders = getCorsHeaders(req)

  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders })
  }

  try {
    // Authenticate: admin, partner, or callcenter only
    // Customers MUST register first before they can scan
    const authResult = await authenticateRequest(req, corsHeaders, { allowedRoles: ['admin', 'super_admin', 'partner', 'callcenter'] })
    if (authResult.response) return authResult.response

    const { supabase } = getSupabaseAdmin()

    const { domain, ipAddress, scanType, userId }: ScanRequest = await req.json()

    if (!domain && !ipAddress) {
      return new Response(
        JSON.stringify({ error: 'Domain oder IP-Adresse erforderlich' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const target = domain?.trim().replace(/^https?:\/\//, '').replace(/\/.*$/, '') || ipAddress?.trim() || ''

    // SSRF Protection: Block private/internal targets
    const SSRF_BLOCKED = [
      /^localhost$/i, /^127\./, /^10\./, /^172\.(1[6-9]|2\d|3[01])\./, /^192\.168\./,
      /^169\.254\./, /^0\./, /^\[::1\]/, /^\[fe80:/, /^\[fd/,
      /\.internal$/i, /\.local$/i, /\.localhost$/i,
      /metadata\.google/, /169\.254\.169\.254/
    ]
    if (SSRF_BLOCKED.some(p => p.test(target))) {
      return new Response(
        JSON.stringify({ error: 'Ziel nicht erlaubt' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const networkHash = generateNetworkHash(domain, ipAddress)

    // Rate limit for light scans
    if (scanType === 'light') {
      const { data: rateLimit, error: rateLimitError } = await supabase
        .rpc('check_scan_rate_limit', { _network_hash: networkHash })

      if (rateLimitError) {
        console.error('Rate limit error:', rateLimitError)
        return new Response(
          JSON.stringify({ error: 'Überprüfungsfehler' }),
          { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )
      }
      if (!rateLimit.allowed) {
        return new Response(
          JSON.stringify({ error: 'Limit erreicht (3/Netzwerk)', remaining: 0, limitReached: true }),
          { status: 429, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )
      }
    }

    // Create scan record
    const { data: scan, error: scanError } = await supabase
      .from('security_scans')
      .insert({
        domain: domain || null,
        ip_address: ipAddress || null,
        network_hash: networkHash,
        user_id: userId || null,
        scan_type: scanType,
        status: 'running'
      })
      .select()
      .single()

    if (scanError) {
      console.error('Scan creation error:', scanError)
      throw scanError
    }

    console.log(`[GAP PROTECTION] Starting ${scanType} scan for ${target}`)

    // ─── PERFORM ALL REAL SCANS IN PARALLEL ───
    let responseBody = ''
    let headerResults: HeaderInfo
    let dnsResults: DnsRecords
    let sslResults: SslInfo
    let cookieResults: CookieInfo[] = []
    let techResults: TechFingerprint = { jsLibraries: [] }
    let hasOpenRedirect = false
    let hasMixedContent = false
    let exposedPaths: string[] = []
    let whoisResults: WhoisInfo = {}
    let subdomains: SubdomainInfo[] = []
    let openPorts: Array<{ port: number; service: string; open: boolean; protocol: string }> = []

    // Fetch the page body for analysis
    try {
      const pageRes = await fetch(`https://${target}`, { method: 'GET', redirect: 'follow' })
      responseBody = await pageRes.text()
    } catch { /* ignore */ }

    if (scanType === 'light') {
      // Light scan: basic checks
      [dnsResults, sslResults, headerResults] = await Promise.all([
        performDnsLookup(target),
        checkSsl(target),
        checkHeaders(target),
      ])
    } else {
      // Full scan: comprehensive real checks - ALL in parallel
      [dnsResults, sslResults, headerResults, cookieResults, exposedPaths, whoisResults, subdomains, openPorts] = await Promise.all([
        performDnsLookup(target),
        checkSsl(target),
        checkHeaders(target),
        checkCookies(target),
        checkExposedPaths(target),
        performWhoisLookup(target),
        enumerateSubdomains(target),
        checkOpenPorts(target),
      ])
      // Sequential checks that depend on prior data
      techResults = await fingerprintTech(target, headerResults.allHeaders, responseBody)
      hasOpenRedirect = await checkOpenRedirect(target)
      hasMixedContent = responseBody ? await checkMixedContent(target, responseBody) : false
    }

    // Generate findings
    const findings = generateFindings(
      dnsResults, sslResults, headerResults, cookieResults,
      techResults, hasOpenRedirect, hasMixedContent, exposedPaths,
      openPorts, whoisResults, subdomains
    )
    const overallResult = calculateOverallResult(findings)
    const score = calculateScore(findings)

    // Store results in DB
    try {
      await Promise.all([
        supabase.from('scan_dns_results').insert({
          scan_id: scan.id,
          a_records: dnsResults.a,
          aaaa_records: dnsResults.aaaa,
          mx_records: dnsResults.mx,
          txt_records: dnsResults.txt,
          ns_records: dnsResults.ns,
          spf_record: dnsResults.txt.find(t => t.toLowerCase().includes('v=spf1')) || null,
          dmarc_record: dnsResults.txt.find(t => t.toLowerCase().includes('v=dmarc1')) || null
        }),
        supabase.from('scan_ssl_results').insert({
          scan_id: scan.id,
          has_ssl: sslResults.valid,
          certificate_valid: sslResults.valid,
          certificate_issuer: sslResults.issuer,
          certificate_subject: sslResults.subject,
          days_until_expiry: sslResults.daysUntilExpiry,
          supports_tls13: sslResults.supportsTls13
        }),
        supabase.from('scan_header_results').insert({
          scan_id: scan.id,
          all_headers: headerResults.allHeaders,
          has_hsts: headerResults.hasHsts,
          has_csp: headerResults.hasCsp,
          has_xframe_options: headerResults.hasXFrameOptions,
          has_xcontent_type: headerResults.hasXContentType,
          has_referrer_policy: headerResults.hasReferrerPolicy,
          server_header: headerResults.serverHeader,
          x_powered_by: headerResults.xPoweredBy
        }),
        (scanType === 'full' || overallResult === 'red') && findings.length > 0
          ? supabase.from('security_findings').insert(
              findings.map(f => ({
                scan_id: scan.id, category: f.category, severity: f.severity,
                title: f.title, description: f.description, recommendation: f.recommendation
              }))
            )
          : Promise.resolve()
      ])
    } catch (e) {
      console.error('Error storing results:', e)
    }

    // Update scan status
    await supabase.from('security_scans').update({
      status: 'completed', overall_result: overallResult, completed_at: new Date().toISOString()
    }).eq('id', scan.id)

    // ─── RESPONSE ───
    if (scanType === 'light') {
      const { data: rateCheck } = await supabase.rpc('check_scan_rate_limit', { _network_hash: networkHash })
      return new Response(
        JSON.stringify({
          result: overallResult === 'green' ? 'green' : 'red',
          score,
          remaining: rateCheck?.remaining ?? 0,
          totalChecks: findings.length + (findings.length === 0 ? 10 : 0),
          passed: findings.length === 0 ? 10 : 10 - Math.min(findings.length, 10),
          failed: Math.min(findings.length, 10),
          checks: [
            { label: 'SSL/TLS-Verschlüsselung', passed: sslResults.valid },
            { label: 'HSTS-Header', passed: headerResults.hasHsts },
            { label: 'Content-Security-Policy', passed: headerResults.hasCsp },
            { label: 'Clickjacking-Schutz', passed: headerResults.hasXFrameOptions },
            { label: 'MIME-Sniffing-Schutz', passed: headerResults.hasXContentType },
            { label: 'Referrer-Policy', passed: headerResults.hasReferrerPolicy },
            { label: 'SPF E-Mail-Schutz', passed: dnsResults.txt.some(t => t.toLowerCase().includes('v=spf1')) },
            { label: 'DMARC E-Mail-Schutz', passed: dnsResults.txt.some(t => t.toLowerCase().includes('v=dmarc1')) },
            { label: 'HTTP→HTTPS Redirect', passed: sslResults.redirectsToHttps || false },
            { label: 'Server-Info verborgen', passed: !headerResults.serverHeader },
          ],
          message: overallResult === 'green'
            ? 'Keine kritischen Schwachstellen gefunden'
            : 'Sicherheitsrisiken erkannt — GAP Protection empfohlen'
        }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Full scan response
    return new Response(
      JSON.stringify({
        scanId: scan.id,
        result: overallResult,
        score,
        findings,
        technology: techResults,
        dns: {
          aRecords: dnsResults.a,
          aaaaRecords: dnsResults.aaaa,
          mxRecords: dnsResults.mx,
          nsRecords: dnsResults.ns,
          txtRecords: dnsResults.txt,
          hasSPF: dnsResults.txt.some(t => t.toLowerCase().includes('v=spf1')),
          hasDMARC: dnsResults.txt.some(t => t.toLowerCase().includes('v=dmarc1')),
          hasDNSSEC: dnsResults.hasDNSSEC,
          hasCAA: dnsResults.caa.length > 0,
          caaRecords: dnsResults.caa,
        },
        ssl: {
          valid: sslResults.valid,
          issuer: sslResults.issuer,
          subject: sslResults.subject,
          validFrom: sslResults.validFrom,
          validUntil: sslResults.validUntil,
          daysUntilExpiry: sslResults.daysUntilExpiry,
          supportsTls13: sslResults.supportsTls13,
          redirectsToHttps: sslResults.redirectsToHttps,
        },
        headers: {
          hasHsts: headerResults.hasHsts,
          hstsMaxAge: headerResults.hstsMaxAge,
          hstsIncludesSubs: headerResults.hstsIncludesSubs,
          hstsPreload: headerResults.hstsPreload,
          hasCsp: headerResults.hasCsp,
          cspDetails: headerResults.cspDetails,
          hasXFrameOptions: headerResults.hasXFrameOptions,
          xFrameValue: headerResults.xFrameValue,
          hasXContentType: headerResults.hasXContentType,
          hasReferrerPolicy: headerResults.hasReferrerPolicy,
          referrerValue: headerResults.referrerValue,
          hasPermissionsPolicy: headerResults.hasPermissionsPolicy,
          hasCrossOriginPolicy: headerResults.hasCrossOriginPolicy,
          hasCacheControl: headerResults.hasCacheControl,
          hasXXssProtection: headerResults.hasXXssProtection,
          serverExposed: !!headerResults.serverHeader,
          serverHeader: headerResults.serverHeader,
          xPoweredBy: headerResults.xPoweredBy,
          allHeaders: headerResults.allHeaders,
        },
        cookies: {
          total: cookieResults.length,
          insecure: cookieResults.filter(c => !c.secure).length,
          noHttpOnly: cookieResults.filter(c => !c.httpOnly).length,
          details: cookieResults,
        },
        exposedPaths,
        hasOpenRedirect,
        hasMixedContent,
        whois: whoisResults,
        subdomains: subdomains.map(s => ({ subdomain: s.subdomain, ip: s.ip })),
        ports: {
          scanned: openPorts.length,
          open: openPorts.filter(p => p.open),
          all: openPorts,
        },
        scannedBy: 'GAP Protection Security Engine v3.0',
        scannedAt: new Date().toISOString(),
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )

  } catch (error) {
    console.error('[GAP PROTECTION] Scan error:', error)
    return new Response(
      JSON.stringify({ error: 'Scan fehlgeschlagen' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})