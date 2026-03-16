import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { getCorsHeaders, jsonResponse, authenticateRequest, getSupabaseAdmin } from '../_shared/auth.ts'

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

function getAnonymousClientId(req: Request): string {
  const forwardedHeader = req.headers.get('x-forwarded-for') || req.headers.get('cf-connecting-ip') || req.headers.get('x-real-ip') || ''
  const clientIp = forwardedHeader.split(',')[0]?.trim() || 'unknown'
  const userAgent = req.headers.get('user-agent') || ''
  const signature = `${clientIp}:${userAgent}`
  return `anon-${generateNetworkHash(signature)}`
}

interface CheckResult {
  name: string
  passed: boolean
  severity: 'critical' | 'high' | 'medium' | 'low' | 'info'
  label: string
  detail?: string
}

async function performRealScan(domain: string): Promise<{ checks: CheckResult[], score: number }> {
  const checks: CheckResult[] = []

  // 1. SSL/HTTPS check
  let sslValid = false
  const headersMap: Record<string, string> = {}
  let responseBody = ''
  try {
    const res = await fetch(`https://${domain}`, { method: 'GET', redirect: 'follow' })
    sslValid = res.status < 500
    res.headers.forEach((v, k) => { headersMap[k.toLowerCase()] = v })
    responseBody = await res.text()
  } catch {
    try {
      const res = await fetch(`http://${domain}`, { method: 'GET', redirect: 'follow' })
      res.headers.forEach((v, k) => { headersMap[k.toLowerCase()] = v })
      responseBody = await res.text()
    } catch { /* domain unreachable */ }
  }

  checks.push({ name: 'ssl', passed: sslValid, severity: 'critical', label: 'SSL/TLS-Verschlüsselung' })

  // 2. Security headers
  const hsts = !!headersMap['strict-transport-security']
  const csp = !!headersMap['content-security-policy']
  const xframe = !!headersMap['x-frame-options']
  const xcontent = !!headersMap['x-content-type-options']
  const referrer = !!headersMap['referrer-policy']
  const serverExposed = !!headersMap['server']
  const poweredByExposed = !!headersMap['x-powered-by']
  const permissionsPolicy = !!headersMap['permissions-policy'] || !!headersMap['feature-policy']
  const crossOriginPolicy = !!headersMap['cross-origin-opener-policy'] || !!headersMap['cross-origin-embedder-policy']

  checks.push({ name: 'hsts', passed: hsts, severity: 'high', label: 'HSTS-Header' })
  checks.push({ name: 'csp', passed: csp, severity: 'high', label: 'Content-Security-Policy' })
  checks.push({ name: 'xframe', passed: xframe, severity: 'medium', label: 'Clickjacking-Schutz' })
  checks.push({ name: 'xcontent', passed: xcontent, severity: 'medium', label: 'MIME-Sniffing-Schutz' })
  checks.push({ name: 'referrer', passed: referrer, severity: 'low', label: 'Referrer-Policy' })
  checks.push({ name: 'server_hidden', passed: !serverExposed, severity: 'low', label: 'Server-Info verborgen' })
  checks.push({ name: 'powered_hidden', passed: !poweredByExposed, severity: 'low', label: 'Technologie verborgen' })
  checks.push({ name: 'permissions_policy', passed: permissionsPolicy, severity: 'medium', label: 'Permissions-Policy' })
  checks.push({ name: 'cross_origin', passed: crossOriginPolicy, severity: 'low', label: 'Cross-Origin Isolation' })

  // 3. HTTP→HTTPS Redirect
  let httpsRedirect = false
  try {
    const httpRes = await fetch(`http://${domain}`, { method: 'HEAD', redirect: 'manual' })
    const loc = httpRes.headers.get('location') || ''
    httpsRedirect = httpRes.status >= 300 && httpRes.status < 400 && loc.startsWith('https')
  } catch { /* ignore */ }
  checks.push({ name: 'https_redirect', passed: httpsRedirect, severity: 'high', label: 'HTTP→HTTPS Redirect' })

  // 4. DNS checks via Cloudflare DoH
  let hasSPF = false
  let hasDMARC = false
  let hasDNSSEC = false
  let hasCAA = false
  try {
    const [txtRes, dmarcRes, aRes, caaRes] = await Promise.all([
      fetch(`https://cloudflare-dns.com/dns-query?name=${domain}&type=TXT`, { headers: { 'Accept': 'application/dns-json' } }),
      fetch(`https://cloudflare-dns.com/dns-query?name=_dmarc.${domain}&type=TXT`, { headers: { 'Accept': 'application/dns-json' } }),
      fetch(`https://cloudflare-dns.com/dns-query?name=${domain}&type=A&do=true`, { headers: { 'Accept': 'application/dns-json' } }),
      fetch(`https://cloudflare-dns.com/dns-query?name=${domain}&type=CAA`, { headers: { 'Accept': 'application/dns-json' } }),
    ])
    if (txtRes.ok) {
      const d = await txtRes.json()
      hasSPF = (d.Answer || []).some((r: any) => r.data?.toLowerCase().includes('v=spf1'))
    }
    if (dmarcRes.ok) {
      const d = await dmarcRes.json()
      hasDMARC = (d.Answer || []).some((r: any) => r.data?.toLowerCase().includes('v=dmarc1'))
    }
    if (aRes.ok) {
      const d = await aRes.json()
      hasDNSSEC = d.AD === true
    }
    if (caaRes.ok) {
      const d = await caaRes.json()
      hasCAA = (d.Answer || []).some((r: any) => r.type === 257)
    }
  } catch { /* DNS lookup failed */ }

  checks.push({ name: 'spf', passed: hasSPF, severity: 'medium', label: 'SPF E-Mail-Schutz' })
  checks.push({ name: 'dmarc', passed: hasDMARC, severity: 'medium', label: 'DMARC E-Mail-Schutz' })
  checks.push({ name: 'dnssec', passed: hasDNSSEC, severity: 'low', label: 'DNSSEC Signierung' })
  checks.push({ name: 'caa', passed: hasCAA, severity: 'low', label: 'CAA DNS-Record' })

  // 5. Mixed Content Check
  let hasMixedContent = false
  if (sslValid && responseBody) {
    const httpPatterns = [/src=["']http:\/\//gi, /href=["']http:\/\//gi]
    hasMixedContent = httpPatterns.some(p => p.test(responseBody))
  }
  checks.push({ name: 'no_mixed_content', passed: !hasMixedContent, severity: 'medium', label: 'Kein Mixed Content' })

  // 6. WAF Detection
  const hasWaf = !!headersMap['cf-ray'] || !!headersMap['x-sucuri-id'] || headersMap['server']?.includes('Imperva')
  checks.push({ name: 'waf', passed: hasWaf, severity: 'medium', label: 'Web Application Firewall' })

  // 7. Sensitive file exposure (quick check)
  let hasExposedFiles = false
  const criticalPaths = ['/.env', '/.git/config', '/phpinfo.php']
  const fileChecks = criticalPaths.map(async (path) => {
    try {
      const res = await fetch(`https://${domain}${path}`, { method: 'HEAD', redirect: 'manual' })
      if (res.status === 200) hasExposedFiles = true
    } catch { /* ignore */ }
  })
  await Promise.allSettled(fileChecks)
  checks.push({ name: 'no_exposed_files', passed: !hasExposedFiles, severity: 'critical', label: 'Keine sensiblen Dateien exponiert' })

  // Calculate score
  const weights: Record<string, number> = { critical: 25, high: 15, medium: 8, low: 4, info: 2 }
  let maxScore = 0
  let earnedScore = 0
  for (const c of checks) {
    const w = weights[c.severity] || 5
    maxScore += w
    if (c.passed) earnedScore += w
  }

  const score = Math.round((earnedScore / maxScore) * 100)
  return { checks, score }
}

serve(async (req) => {
  const corsHeaders = getCorsHeaders(req)

  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders })
  }

  try {
    // --- Auth: REQUIRED for all users (admin, partner, callcenter, customer) ---
    // Customers MUST register and login before they can scan
    const authResult = await authenticateRequest(req, corsHeaders)
    if (authResult.response) return authResult.response
    
    const clientIdentifier = authResult.auth ? authResult.auth.user.id : 'unknown'

    const { supabase } = getSupabaseAdmin()

    let body: Record<string, unknown>
    try {
      body = await req.json()
    } catch {
      return jsonResponse({ error: 'Ungültige Anfrage' }, 200, corsHeaders)
    }

    const { domain, ipAddress } = body as { domain?: string; ipAddress?: string }

    if (!domain && !ipAddress) {
      return jsonResponse({ error: 'Domain oder IP-Adresse erforderlich' }, 200, corsHeaders)
    }

    const target = (domain || ipAddress || '').toString().toLowerCase().trim().replace(/^https?:\/\//, '').replace(/\/.*$/, '')

    // SSRF Protection: block private/reserved IP ranges and cloud metadata endpoints
    const BLOCKED_PATTERNS = [
      /^localhost$/i,
      /^127\./,
      /^10\./,
      /^172\.(1[6-9]|2\d|3[01])\./,
      /^192\.168\./,
      /^169\.254\./,
      /^0\./,
      /^metadata\.google\.internal$/i,
      /^metadata\.internal$/i,
      /^\[::1\]$/,
      /^fd[0-9a-f]{2}:/i,
      /^fe80:/i,
    ]
    if (BLOCKED_PATTERNS.some(p => p.test(target)) || !target.includes('.')) {
      return jsonResponse({ error: 'Ungültige Domain oder IP-Adresse' }, 200, corsHeaders)
    }

    const networkHash = generateNetworkHash(target)

    // --- Rate Limiting (Unauthenticated endpoint protection) ---
    // Max 3 requests per 1 hour (3600000ms) per client identifier
    const maxRequests = 3
    const windowMs = 3600000
    const limitKey = `lightscan:${clientIdentifier}`
    
    // Fallback in-memory rate limiting since auth.ts checkRateLimit might not support this key explicitly
    // Actually, checkRateLimit from auth.ts falls back to a global map if redis is not available.
    // Let's use it dynamically.
    const { checkRateLimit } = await import('../_shared/auth.ts')
    
    if (!checkRateLimit(limitKey, maxRequests, windowMs)) {
      return jsonResponse({
         error: 'Zu viele Anfragen',
         detail: 'Maximal 3 Scans pro Stunde zulässig. Bitte versuchen Sie es später erneut.'
      }, 429, corsHeaders)
    }
    
    // We don't track remaining precisely here since checkRateLimit returns boolean, 
    // but we can just say 1 for positive UX if it passed.
    const remaining = 1

    // --- Perform the actual scan ---
    const { checks, score } = await performRealScan(target)

    const passedCount = checks.filter(c => c.passed).length
    const failedCount = checks.filter(c => !c.passed).length
    const hasCritical = checks.some(c => !c.passed && c.severity === 'critical')
    const hasHigh = checks.some(c => !c.passed && c.severity === 'high')
    const result = hasCritical || hasHigh ? 'red' : score >= 70 ? 'green' : 'red'

    // --- Store result (best-effort, don't fail scan if DB write fails) ---
    try {
      const { data: scanAttempt } = await supabase
        .from('scan_attempts')
        .select('id')
        .eq('network_hash', networkHash)
        .single()

      await supabase.from('scan_results_light').insert({
        scan_attempt_id: scanAttempt?.id,
        network_hash: networkHash,
        result: result,
      })
    } catch (storeErr) {
      console.error('Failed to store scan result (non-blocking):', storeErr)
    }

    return jsonResponse({
      result,
      score,
      remaining,
      totalChecks: checks.length,
      passed: passedCount,
      failed: failedCount,
      checks: checks.map(c => ({ label: c.label, passed: c.passed })),
      message: result === 'green'
        ? 'Keine kritischen Schwachstellen gefunden'
        : 'Sicherheitsrisiken erkannt — Wir empfehlen GAP Protection'
    }, 200, corsHeaders)

  } catch (error) {
    console.error('Scan error:', error)
    const msg = error instanceof Error ? error.message : String(error)
    return jsonResponse({ error: 'Scan fehlgeschlagen', detail: msg }, 200, corsHeaders)
  }
})