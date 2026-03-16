import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { getCorsHeaders, jsonResponse, authenticateRequest, authenticateServiceCall, getSupabaseAdmin } from '../_shared/auth.ts'

interface MonitorRequest {
  action: 'check_all' | 'check_domain' | 'scan_domain'
  domainId?: string
}

// Check uptime and response time
async function checkUptime(domain: string): Promise<{ status: string; responseTime: number; httpStatus: number }> {
  const start = Date.now()
  try {
    const res = await fetch(`https://${domain}`, { method: 'HEAD', redirect: 'follow' })
    const responseTime = Date.now() - start
    const status = res.ok ? 'ok' : res.status >= 500 ? 'critical' : 'warning'
    return { status, responseTime, httpStatus: res.status }
  } catch {
    return { status: 'critical', responseTime: Date.now() - start, httpStatus: 0 }
  }
}

// Check SSL certificate expiry using REAL crt.sh Certificate Transparency data
async function checkSslExpiry(domain: string): Promise<{ status: string; daysRemaining: number; issuer?: string; validUntil?: string }> {
  try {
    // First check if HTTPS works at all
    const res = await fetch(`https://${domain}`, { method: 'HEAD', redirect: 'manual' })
    if (!(res.ok || res.status < 500)) {
      return { status: 'critical', daysRemaining: 0 }
    }

    // Get real certificate data from crt.sh (Certificate Transparency logs)
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
          if (cert?.not_after) {
            const expiry = new Date(cert.not_after)
            const days = Math.floor((expiry.getTime() - now.getTime()) / (1000 * 60 * 60 * 24))
            const status = days <= 7 ? 'critical' : days <= 30 ? 'warning' : 'ok'
            const issuer = cert.issuer_name?.replace(/^.*?CN=/, '')?.split(',')[0]?.trim()
            return { status, daysRemaining: days, issuer, validUntil: cert.not_after }
          }
        }
      }
    } catch (e) {
      console.error('crt.sh lookup failed for monitoring:', e)
    }

    // Fallback: HTTPS works but couldn't get cert details
    return { status: 'ok', daysRemaining: -1 }
  } catch {
    return { status: 'critical', daysRemaining: 0 }
  }
}

// Check for DNS changes
async function checkDns(domain: string): Promise<{ status: string; details: Record<string, unknown> }> {
  try {
    const dohBase = 'https://cloudflare-dns.com/dns-query'
    const res = await fetch(`${dohBase}?name=${domain}&type=A`, { headers: { 'Accept': 'application/dns-json' } })
    if (!res.ok) return { status: 'error', details: { error: 'DNS lookup failed' } }
    const data = await res.json()
    const ips = (data.Answer || []).filter((r: { type: number }) => r.type === 1).map((r: { data: string }) => r.data)
    return { status: 'ok', details: { ips, recordCount: ips.length } }
  } catch {
    return { status: 'error', details: { error: 'DNS check failed' } }
  }
}

// Quick security headers check
async function checkSecurityHeaders(domain: string): Promise<{ status: string; details: Record<string, boolean> }> {
  try {
    const res = await fetch(`https://${domain}`, { method: 'GET', redirect: 'follow' })
    await res.text()
    const checks = {
      hsts: res.headers.has('strict-transport-security'),
      csp: res.headers.has('content-security-policy'),
      xframe: res.headers.has('x-frame-options'),
      xcontent: res.headers.has('x-content-type-options'),
      referrer: res.headers.has('referrer-policy'),
    }
    const passed = Object.values(checks).filter(Boolean).length
    const status = passed >= 4 ? 'ok' : passed >= 2 ? 'warning' : 'critical'
    return { status, details: checks }
  } catch {
    return { status: 'error', details: {} }
  }
}

// Check for common vulnerabilities
async function quickVulnCheck(domain: string): Promise<{ status: string; details: Record<string, unknown> }> {
  const vulnerabilities: string[] = []
  
  // Check exposed sensitive files
  const sensitivePaths = ['/.env', '/.git/config', '/wp-admin/install.php', '/phpinfo.php', '/.htaccess']
  const checks = sensitivePaths.map(async (path) => {
    try {
      const res = await fetch(`https://${domain}${path}`, { method: 'HEAD', redirect: 'manual' })
      if (res.status === 200) vulnerabilities.push(path)
    } catch { /* ignore */ }
  })
  await Promise.allSettled(checks)

  // Check HTTP to HTTPS redirect
  try {
    const httpRes = await fetch(`http://${domain}`, { method: 'HEAD', redirect: 'manual' })
    const loc = httpRes.headers.get('location') || ''
    if (!(httpRes.status >= 300 && httpRes.status < 400 && loc.startsWith('https'))) {
      vulnerabilities.push('no-https-redirect')
    }
  } catch { /* ignore */ }

  const status = vulnerabilities.length === 0 ? 'ok' : vulnerabilities.length <= 2 ? 'warning' : 'critical'
  return { status, details: { vulnerabilities, count: vulnerabilities.length } }
}

serve(async (req) => {
  const corsHeaders = getCorsHeaders(req)

  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders })
  }

  try {
    // Authenticate: admin or service call
    const serviceAuth = authenticateServiceCall(req, corsHeaders)
    if (!serviceAuth.ok) {
      const authResult = await authenticateRequest(req, corsHeaders, { requiredRole: 'admin' })
      if (authResult.response) return authResult.response
    }

    const { supabase, url: supabaseUrl, key: supabaseServiceKey } = getSupabaseAdmin()

    const { action, domainId }: MonitorRequest = await req.json()

    if (action === 'check_all' || action === 'check_domain') {
      // Get domains to check
      let query = supabase.from('protected_domains').select('*').eq('protection_status', 'active')
      if (domainId) query = query.eq('id', domainId)
      
      const { data: domains, error } = await query
      if (error) throw error

      const results = []
      for (const domain of (domains || [])) {
        console.log(`[GAP MONITOR] Checking ${domain.domain}`)
        
        // Run all checks in parallel
        const [uptime, ssl, dns, headers, vulns] = await Promise.all([
          checkUptime(domain.domain),
          checkSslExpiry(domain.domain),
          checkDns(domain.domain),
          checkSecurityHeaders(domain.domain),
          quickVulnCheck(domain.domain),
        ])

        // Store monitoring logs
        const logs = [
          {
            domain_id: domain.id,
            check_type: 'uptime',
            status: uptime.status,
            response_time_ms: uptime.responseTime,
            http_status: uptime.httpStatus,
            details: { responseTime: uptime.responseTime },
          },
          {
            domain_id: domain.id,
            check_type: 'ssl_expiry',
            status: ssl.status,
            ssl_days_remaining: ssl.daysRemaining,
            details: { daysRemaining: ssl.daysRemaining },
          },
          {
            domain_id: domain.id,
            check_type: 'dns_check',
            status: dns.status,
            details: dns.details,
          },
          {
            domain_id: domain.id,
            check_type: 'security_headers',
            status: headers.status,
            details: headers.details,
          },
          {
            domain_id: domain.id,
            check_type: 'vulnerability',
            status: vulns.status,
            details: vulns.details,
          },
        ]

        await supabase.from('domain_monitoring_logs').insert(logs)

        results.push({
          domain: domain.domain,
          domainId: domain.id,
          uptime,
          ssl,
          dns,
          headers,
          vulnerabilities: vulns,
          overallStatus: [uptime.status, ssl.status, headers.status, vulns.status].includes('critical') 
            ? 'critical' 
            : [uptime.status, ssl.status, headers.status, vulns.status].includes('warning') 
              ? 'warning' 
              : 'ok'
        })
      }

      return new Response(
        JSON.stringify({ success: true, results, checkedAt: new Date().toISOString() }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    if (action === 'scan_domain' && domainId) {
      // Trigger a full security scan for a specific domain
      const { data: domain } = await supabase
        .from('protected_domains')
        .select('domain')
        .eq('id', domainId)
        .single()

      if (!domain) {
        return new Response(
          JSON.stringify({ error: 'Domain nicht gefunden' }),
          { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )
      }

      // Call the security-scan function internally
      const scanRes = await fetch(`${supabaseUrl}/functions/v1/security-scan`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${supabaseServiceKey}`,
        },
        body: JSON.stringify({ domain: domain.domain, scanType: 'full' }),
      })

      const scanData = await scanRes.json()
      return new Response(
        JSON.stringify({ success: true, scan: scanData }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    return new Response(
      JSON.stringify({ error: 'Ungültige Aktion' }),
      { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  } catch (error) {
    console.error('[GAP MONITOR] Error:', error)
    return new Response(
      JSON.stringify({ error: 'Monitoring fehlgeschlagen' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})
