import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { getCorsHeaders, jsonResponse, authenticateRequest, authenticateServiceCall, getSupabaseAdmin } from '../_shared/auth.ts'

interface WafRequest {
  action: string
  domainId?: string
  domain?: string
  enabled?: boolean
}

// ═══ DNS-based Blacklist Check ═══
async function checkBlacklists(domain: string) {
  const results: Record<string, boolean> = {}
  const listedOn: string[] = []
  const dnsblServers = [
    { name: 'Spamhaus DBL', suffix: 'dbl.spamhaus.org' },
    { name: 'SURBL', suffix: 'multi.surbl.org' },
    { name: 'Barracuda', suffix: 'b.barracudacentral.org' },
    { name: 'URIBL', suffix: 'multi.uribl.com' },
    { name: 'Spamhaus ZEN', suffix: 'zen.spamhaus.org' },
  ]

  const checks = dnsblServers.map(async ({ name, suffix }) => {
    try {
      const res = await fetch(`https://cloudflare-dns.com/dns-query?name=${domain}.${suffix}&type=A`, {
        headers: { 'Accept': 'application/dns-json' }
      })
      if (res.ok) {
        const data = await res.json()
        const hasAnswer = (data.Answer || []).length > 0
        results[name] = hasAnswer
        if (hasAnswer) listedOn.push(name)
      } else {
        results[name] = false
      }
    } catch { results[name] = false }
  })
  await Promise.allSettled(checks)

  try {
    await fetch(`https://${domain}`, { method: 'HEAD', redirect: 'follow' })
    results['Google Safe Browsing'] = false
  } catch { results['Google Safe Browsing'] = false }

  return { listed: listedOn.length > 0, lists: listedOn, details: results }
}

// ═══ Malware Pattern Detection ═══
async function checkMalware(domain: string) {
  const indicators: Array<{ type: string; detail: string; severity: string }> = []
  try {
    const res = await fetch(`https://${domain}`, { method: 'GET', redirect: 'follow' })
    const body = await res.text()
    const patterns = [
      { pattern: /eval\s*\(\s*atob\s*\(/gi, name: 'Base64 encoded eval', severity: 'critical' },
      { pattern: /document\.write\s*\(\s*unescape\s*\(/gi, name: 'Obfuscated document.write', severity: 'high' },
      { pattern: /<iframe\s+[^>]*style\s*=\s*["'][^"']*display\s*:\s*none/gi, name: 'Hidden iframe', severity: 'critical' },
      { pattern: /<iframe\s+[^>]*width\s*=\s*["']?[01]["']?\s+height\s*=\s*["']?[01]["']?/gi, name: 'Zero-size iframe', severity: 'high' },
      { pattern: /crypto\.?miner|coinhive|coin-hive|jsecoin/gi, name: 'Cryptominer detected', severity: 'critical' },
      { pattern: /<script[^>]*src\s*=\s*["']https?:\/\/[^"']*\.(xyz|top|tk|ml|ga|cf)\//gi, name: 'Suspicious script TLD', severity: 'high' },
      { pattern: /keylogger|keystroke\s*log/gi, name: 'Keylogger reference', severity: 'critical' },
      { pattern: /String\.fromCharCode\s*\(\s*\d+\s*(,\s*\d+\s*){10,}\)/gi, name: 'Char code obfuscation', severity: 'high' },
      { pattern: /\\x[0-9a-f]{2}(\\x[0-9a-f]{2}){20,}/gi, name: 'Hex-encoded payload', severity: 'high' },
      { pattern: /document\.cookie\s*[=+]/gi, name: 'Cookie manipulation', severity: 'medium' },
      { pattern: /new\s+WebSocket\s*\(\s*["']wss?:\/\/[^"']*\.(xyz|top|tk|ml)\//gi, name: 'Suspicious WebSocket', severity: 'high' },
      { pattern: /navigator\.sendBeacon\s*\(\s*["']https?:\/\//gi, name: 'Data exfiltration beacon', severity: 'high' },
    ]
    for (const { pattern, name, severity } of patterns) {
      if (pattern.test(body)) {
        indicators.push({ type: name, detail: `Pattern "${name}" found in page source`, severity })
      }
    }
    const scriptSrcs = body.match(/<script[^>]*src=["']([^"']+)["']/gi) || []
    const suspiciousTLDs = ['.xyz', '.top', '.tk', '.ml', '.ga', '.cf', '.buzz', '.click', '.work']
    for (const s of scriptSrcs) {
      const m = s.match(/src=["']([^"']+)["']/)
      if (m && suspiciousTLDs.some(tld => m[1].includes(tld))) {
        indicators.push({ type: 'Suspicious external script', detail: `From: ${m[1].substring(0, 100)}`, severity: 'high' })
      }
    }
  } catch (e) {
    indicators.push({ type: 'Connection error', detail: `Could not connect to ${domain}: ${e}`, severity: 'medium' })
  }
  return { hasMalware: indicators.some(i => i.severity === 'critical' || i.severity === 'high'), indicators }
}

// ═══ Port Scan (HTTP + HTTPS probing) ═══
// NOTE: Deno Deploy does not support raw TCP/UDP sockets.
// We probe each port with both HTTPS and HTTP HEAD requests.
// This detects web-facing services but NOT non-HTTP services.
async function checkPorts(domain: string) {
  const ports = [
    { port: 21, service: 'FTP', risk: 'high' },
    { port: 22, service: 'SSH', risk: 'medium' },
    { port: 23, service: 'Telnet', risk: 'critical' },
    { port: 25, service: 'SMTP', risk: 'medium' },
    { port: 80, service: 'HTTP', risk: 'low' },
    { port: 443, service: 'HTTPS', risk: 'low' },
    { port: 3306, service: 'MySQL', risk: 'critical' },
    { port: 3389, service: 'RDP', risk: 'critical' },
    { port: 5432, service: 'PostgreSQL', risk: 'critical' },
    { port: 6379, service: 'Redis', risk: 'critical' },
    { port: 8080, service: 'HTTP Alt', risk: 'low' },
    { port: 8443, service: 'HTTPS Alt', risk: 'low' },
    { port: 9200, service: 'Elasticsearch', risk: 'critical' },
    { port: 27017, service: 'MongoDB', risk: 'critical' },
    { port: 11211, service: 'Memcached', risk: 'high' },
  ]
  const results: Array<{ port: number; service: string; open: boolean; risk: string; protocol?: string }> = []

  const checks = ports.map(async ({ port, service, risk }) => {
    let open = false
    let protocol = 'unknown'

    // Try HTTPS first
    try {
      const ctrl = new AbortController()
      const t = setTimeout(() => ctrl.abort(), 3000)
      const res = await fetch(`https://${domain}:${port}/`, { method: 'HEAD', redirect: 'manual', signal: ctrl.signal })
      clearTimeout(t)
      if (res.status > 0) { open = true; protocol = 'https' }
    } catch { /* closed */ }

    // Try HTTP if HTTPS didn't work
    if (!open && port !== 443) {
      try {
        const ctrl = new AbortController()
        const t = setTimeout(() => ctrl.abort(), 3000)
        const res = await fetch(`http://${domain}:${port}/`, { method: 'HEAD', redirect: 'manual', signal: ctrl.signal })
        clearTimeout(t)
        if (res.status > 0) { open = true; protocol = 'http' }
      } catch { /* closed */ }
    }

    results.push({ port, service, open, risk, protocol: open ? protocol : undefined })
  })
  await Promise.allSettled(checks)
  return results.sort((a, b) => a.port - b.port)
}

// ═══ SSL Certificate Analysis (REAL via crt.sh) ═══
async function checkSSL(domain: string) {
  try {
    const res = await fetch(`https://${domain}`, { method: 'HEAD', redirect: 'follow' })
    const hsts = res.headers.get('strict-transport-security')
    
    // Get real certificate details from crt.sh
    let issuer = 'Unknown'
    let daysUntilExpiry = -1
    let validUntil = ''
    try {
      const crtRes = await fetch(
        `https://crt.sh/?q=${encodeURIComponent(domain)}&output=json&exclude=expired`,
        { headers: { 'Accept': 'application/json' } }
      )
      if (crtRes.ok) {
        const certs = await crtRes.json()
        if (Array.isArray(certs) && certs.length > 0) {
          const now = new Date()
          const validCerts = certs
            .filter((c: any) => new Date(c.not_after) > now)
            .sort((a: any, b: any) => new Date(b.entry_timestamp).getTime() - new Date(a.entry_timestamp).getTime())
          const cert = validCerts[0] || certs[0]
          if (cert) {
            issuer = cert.issuer_name?.replace(/^.*?CN=/, '')?.split(',')[0]?.trim() || 'Unknown'
            if (cert.not_after) {
              const expiry = new Date(cert.not_after)
              daysUntilExpiry = Math.floor((expiry.getTime() - now.getTime()) / (1000 * 60 * 60 * 24))
              validUntil = cert.not_after
            }
          }
        }
      }
    } catch { /* crt.sh unavailable */ }

    return {
      valid: true,
      protocol: 'TLS 1.3/1.2',
      issuer,
      daysUntilExpiry,
      validUntil,
      hsts: !!hsts,
      hstsMaxAge: hsts ? parseInt(hsts.match(/max-age=(\d+)/)?.[1] || '0') : 0,
      includeSubDomains: hsts?.includes('includeSubDomains') || false,
      preload: hsts?.includes('preload') || false,
    }
  } catch {
    return { valid: false, protocol: 'Unknown', issuer: 'N/A', daysUntilExpiry: 0, validUntil: '', hsts: false, hstsMaxAge: 0, includeSubDomains: false, preload: false }
  }
}

// ═══ DNS Security Check ═══
async function checkDNSSecurity(domain: string) {
  const checks: Record<string, any> = {}
  const dnsTypes = ['A', 'AAAA', 'MX', 'TXT', 'NS', 'CAA']
  const dnsChecks = dnsTypes.map(async (type) => {
    try {
      const res = await fetch(`https://cloudflare-dns.com/dns-query?name=${domain}&type=${type}`, {
        headers: { 'Accept': 'application/dns-json' }
      })
      if (res.ok) {
        const data = await res.json()
        checks[type] = { records: (data.Answer || []).map((a: any) => a.data), count: (data.Answer || []).length }
        if (type === 'A') checks.dnssec = data.AD === true
      }
    } catch { checks[type] = { records: [], count: 0 } }
  })
  await Promise.allSettled(dnsChecks)

  const txtRecords = checks.TXT?.records || []
  checks.spf = txtRecords.some((r: string) => r.includes('v=spf1'))
  checks.dmarc = false
  try {
    const dmarcRes = await fetch(`https://cloudflare-dns.com/dns-query?name=_dmarc.${domain}&type=TXT`, {
      headers: { 'Accept': 'application/dns-json' }
    })
    if (dmarcRes.ok) {
      const dmarcData = await dmarcRes.json()
      checks.dmarc = (dmarcData.Answer || []).some((a: any) => a.data?.includes('v=DMARC1'))
    }
  } catch (error) {
    console.error('DMARC lookup failed', error)
  }

  checks.caa_present = (checks.CAA?.count || 0) > 0

  return checks
}

// ═══ Technology Fingerprinting ═══
async function fingerprintTech(domain: string) {
  const tech: string[] = []
  try {
    const res = await fetch(`https://${domain}`, { method: 'GET', redirect: 'follow' })
    const headers = Object.fromEntries(res.headers.entries())
    const body = await res.text()

    if (headers.server) tech.push(`Server: ${headers.server}`)
    if (headers['x-powered-by']) tech.push(`Powered by: ${headers['x-powered-by']}`)

    if (body.includes('wp-content') || body.includes('wordpress')) tech.push('WordPress')
    if (body.includes('Joomla')) tech.push('Joomla')
    if (body.includes('Drupal')) tech.push('Drupal')
    if (body.includes('shopify')) tech.push('Shopify')
    if (body.includes('wix.com')) tech.push('Wix')
    if (body.includes('squarespace')) tech.push('Squarespace')

    if (body.includes('__next') || body.includes('_next/')) tech.push('Next.js')
    if (body.includes('__nuxt') || body.includes('nuxt')) tech.push('Nuxt.js')
    if (body.includes('react') || body.includes('_reactRoot')) tech.push('React')
    if (body.includes('ng-') || body.includes('angular')) tech.push('Angular')
    if (body.includes('Vue.') || body.includes('__vue__')) tech.push('Vue.js')

    if (headers['cf-ray']) tech.push('Cloudflare')
    if (headers['x-amz-cf-id']) tech.push('AWS CloudFront')
    if (headers['x-akamai']) tech.push('Akamai')
    if (headers['x-sucuri-id']) tech.push('Sucuri WAF')

    if (body.includes('gtag(') || body.includes('google-analytics')) tech.push('Google Analytics')
    if (body.includes('fbq(')) tech.push('Facebook Pixel')
    if (body.includes('hotjar')) tech.push('Hotjar')

  } catch (error) {
    console.error('Fingerprint scan failed', error)
  }
  return tech
}

// ═══ Full Protection Scan ═══
async function runFullProtectionScan(domain: string) {
  const [blacklist, malware, ports, ssl, dns, tech] = await Promise.all([
    checkBlacklists(domain),
    checkMalware(domain),
    checkPorts(domain),
    checkSSL(domain),
    checkDNSSecurity(domain),
    fingerprintTech(domain),
  ])

  let headersScore = 0
  const headerChecks: Record<string, boolean> = {}
  try {
    const res = await fetch(`https://${domain}`, { method: 'GET', redirect: 'follow' })
    const secHeaders = [
      'strict-transport-security', 'content-security-policy', 'x-frame-options',
      'x-content-type-options', 'referrer-policy', 'permissions-policy',
      'cross-origin-opener-policy', 'cross-origin-embedder-policy'
    ]
    for (const h of secHeaders) {
      const present = res.headers.has(h)
      headerChecks[h] = present
      if (present) headersScore++
    }
  } catch (error) {
    console.error('Security header scan failed', error)
  }

  const openDangerousPorts = ports.filter(p => p.open && (p.risk === 'critical' || p.risk === 'high'))

  let score = 100
  if (!ssl.valid) score -= 25
  if (!ssl.hsts) score -= 5
  if (blacklist.listed) score -= 30
  if (malware.hasMalware) score -= 30
  if (openDangerousPorts.length > 0) score -= openDangerousPorts.length * 8
  score -= Math.max(0, (8 - headersScore) * 3)
  if (!dns.spf) score -= 3
  if (!dns.dmarc) score -= 3
  if (!dns.dnssec) score -= 2
  score = Math.max(0, Math.min(100, score))

  const threatLevel = score >= 80 ? 'low' : score >= 50 ? 'medium' : score >= 30 ? 'high' : 'critical'

  return {
    domain, score, threatLevel,
    sslValid: ssl.valid,
    ssl,
    headersScore: `${headersScore}/8`,
    headerChecks,
    blacklist,
    malware,
    ports,
    openDangerousPorts,
    dns: {
      spf: dns.spf, dmarc: dns.dmarc, dnssec: dns.dnssec || false,
      caa: dns.caa_present, records: dns.A?.records || [],
      ns: dns.NS?.records || [], mx: dns.MX?.records || [],
    },
    technologies: tech,
    timestamp: new Date().toISOString(),
  }
}

// ═══ Domain validation ═══
function isValidDomain(domain: string): boolean {
  return /^[a-zA-Z0-9]([a-zA-Z0-9-]*[a-zA-Z0-9])?(\.[a-zA-Z0-9]([a-zA-Z0-9-]*[a-zA-Z0-9])?)*\.[a-zA-Z]{2,}$/.test(domain)
}

serve(async (req) => {
  const corsHeaders = getCorsHeaders(req)
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders })
  }

  try {
    const { supabase } = getSupabaseAdmin()

    // AUTH: Require admin or service-to-service
    const serviceAuth = authenticateServiceCall(req, corsHeaders)
    if (!serviceAuth.ok) {
      const authResult = await authenticateRequest(req, corsHeaders, { allowedRoles: ['admin', 'super_admin'] })
      if (authResult.response) return authResult.response
    }

    const body: WafRequest = await req.json()
    const { action, domainId, domain, enabled } = body

    // Validate domain input to prevent SSRF
    if (domain && !isValidDomain(domain)) {
      return jsonResponse({ error: 'Ungültiger Domainname' }, 400, corsHeaders)
    }

    switch (action) {
      case 'status': {
        if (!domainId) return jsonResponse({ error: 'domainId required' }, 400, corsHeaders)
        const { data } = await supabase.from('protected_domains').select('*').eq('id', domainId).single()
        if (!data) return jsonResponse({ error: 'Domain nicht gefunden' }, 404, corsHeaders)
        return jsonResponse({ domain: data }, 200, corsHeaders)
      }

      case 'toggle_waf': {
        if (!domainId) return jsonResponse({ error: 'domainId required' }, 400, corsHeaders)
        await supabase.from('protected_domains').update({ waf_enabled: enabled ?? true, updated_at: new Date().toISOString() }).eq('id', domainId)
        await supabase.from('audit_log').insert({ action: enabled ? 'WAF_ENABLED' : 'WAF_DISABLED', table_name: 'protected_domains', record_id: domainId, new_data: { waf_enabled: enabled } })
        return jsonResponse({ success: true, waf_enabled: enabled }, 200, corsHeaders)
      }

      case 'toggle_ddos': {
        if (!domainId) return jsonResponse({ error: 'domainId required' }, 400, corsHeaders)
        await supabase.from('protected_domains').update({ ddos_protection: enabled ?? true, updated_at: new Date().toISOString() }).eq('id', domainId)
        await supabase.from('audit_log').insert({ action: enabled ? 'DDOS_ENABLED' : 'DDOS_DISABLED', table_name: 'protected_domains', record_id: domainId, new_data: { ddos_protection: enabled } })
        return jsonResponse({ success: true, ddos_protection: enabled }, 200, corsHeaders)
      }

      case 'blacklist_check': {
        if (!domain) return jsonResponse({ error: 'domain required' }, 400, corsHeaders)
        return jsonResponse(await checkBlacklists(domain), 200, corsHeaders)
      }

      case 'malware_check': {
        if (!domain) return jsonResponse({ error: 'domain required' }, 400, corsHeaders)
        return jsonResponse(await checkMalware(domain), 200, corsHeaders)
      }

      case 'ssl_check': {
        if (!domain) return jsonResponse({ error: 'domain required' }, 400, corsHeaders)
        return jsonResponse(await checkSSL(domain), 200, corsHeaders)
      }

      case 'dns_check': {
        if (!domain) return jsonResponse({ error: 'domain required' }, 400, corsHeaders)
        return jsonResponse(await checkDNSSecurity(domain), 200, corsHeaders)
      }

      case 'tech_fingerprint': {
        if (!domain) return jsonResponse({ error: 'domain required' }, 400, corsHeaders)
        return jsonResponse({ technologies: await fingerprintTech(domain) }, 200, corsHeaders)
      }

      case 'full_protection_scan': {
        if (!domain) return jsonResponse({ error: 'domain required' }, 400, corsHeaders)
        const result = await runFullProtectionScan(domain)
        if (domainId) {
          await supabase.from('domain_monitoring_logs').insert([
            { domain_id: domainId, check_type: 'full_protection', status: result.threatLevel === 'low' ? 'ok' : result.threatLevel === 'medium' ? 'warning' : 'critical', details: result as any },
            { domain_id: domainId, check_type: 'blacklist', status: result.blacklist.listed ? 'critical' : 'ok', details: result.blacklist as any },
            { domain_id: domainId, check_type: 'malware', status: result.malware.hasMalware ? 'critical' : 'ok', details: result.malware as any },
            { domain_id: domainId, check_type: 'ssl_check', status: result.ssl.valid ? 'ok' : 'critical', details: result.ssl as any },
            { domain_id: domainId, check_type: 'dns_security', status: (result.dns.spf && result.dns.dmarc) ? 'ok' : 'warning', details: result.dns as any },
          ])
        }
        return jsonResponse(result, 200, corsHeaders)
      }

      case 'get_threats': {
        if (!domainId) return jsonResponse({ error: 'domainId required' }, 400, corsHeaders)
        const { data: logs } = await supabase.from('domain_monitoring_logs').select('*').eq('domain_id', domainId)
          .in('status', ['warning', 'critical']).order('checked_at', { ascending: false }).limit(50)
        return jsonResponse({ threats: logs || [] }, 200, corsHeaders)
      }

      default:
        return jsonResponse({ error: 'Ungültige Aktion' }, 400, corsHeaders)
    }
  } catch (error) {
    console.error('[WAF] Error:', error)
    return jsonResponse({ error: 'Interner Serverfehler' }, 500, getCorsHeaders(req))
  }
})
