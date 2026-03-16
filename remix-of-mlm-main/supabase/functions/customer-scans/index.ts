import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { getCorsHeaders, jsonResponse, authenticateRequest, getSupabaseAdmin } from '../_shared/auth.ts'

serve(async (req) => {
  const corsHeaders = getCorsHeaders(req)

  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders })
  }

  try {
    const { supabase } = getSupabaseAdmin()

    // Authenticate user
    const authResult = await authenticateRequest(req, corsHeaders)
    if (authResult.response) return authResult.response
    const { auth } = authResult
    const profile = { id: auth.profileId }

    const { action, ...params } = await req.json()

    console.log('Customer Scans action:', action, 'User:', auth.user?.id)

    switch (action) {
      case 'start-scan': {
        // Neuen Scan starten
        const { target_url } = params

        if (!target_url) {
          return new Response(
            JSON.stringify({ error: 'URL erforderlich' }),
            { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          )
        }

        // URL validieren (SSRF-Schutz)
        const validationResult = validateUrl(target_url)
        if (!validationResult.valid) {
          return new Response(
            JSON.stringify({ error: validationResult.reason }),
            { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          )
        }

        // Scan erstellen
        const { data: scan, error } = await supabase
          .from('customer_scans')
          .insert({
            user_id: profile.id,
            target_url: validationResult.url,
            status: 'running'
          })
          .select()
          .single()

        if (error) {
          console.error('Error creating scan:', error)
          return new Response(
            JSON.stringify({ error: 'Fehler beim Erstellen des Scans' }),
            { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          )
        }

        // Scan simulieren (in Produktion: echten Scan ausführen)
        const scanResult = await performScan(validationResult.url)

        // Ergebnis speichern
        const { error: updateError } = await supabase
          .from('customer_scans')
          .update({
            status: 'done',
            completed_at: new Date().toISOString(),
            rating: scanResult.rating,
            score: scanResult.score,
            summary: scanResult.summary,
            findings: scanResult.findings,
            high_count: scanResult.high_count,
            critical_count: scanResult.critical_count
          })
          .eq('id', scan.id)

        if (updateError) {
          console.error('Error updating scan:', updateError)
        }

        return new Response(
          JSON.stringify({
            success: true,
            scan_id: scan.id,
            rating: scanResult.rating,
            score: scanResult.score,
            summary: scanResult.summary
          }),
          { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )
      }

      case 'get-history': {
        // Scan-Historie des Nutzers
        const { limit = 50, offset = 0, rating_filter } = params

        let query = supabase
          .from('customer_scans')
          .select('*', { count: 'exact' })
          .eq('user_id', profile.id)
          .order('requested_at', { ascending: false })
          .range(offset, offset + limit - 1)

        if (rating_filter && rating_filter !== 'all') {
          query = query.eq('rating', rating_filter)
        }

        const { data: scans, count, error } = await query

        if (error) {
          return new Response(
            JSON.stringify({ error: error.message }),
            { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          )
        }

        return new Response(
          JSON.stringify({ scans: scans || [], total: count || 0 }),
          { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )
      }

      case 'get-scan': {
        // Einzelnen Scan abrufen
        const { scan_id } = params

        const { data: scan, error } = await supabase
          .from('customer_scans')
          .select('*')
          .eq('id', scan_id)
          .eq('user_id', profile.id)
          .single()

        if (error || !scan) {
          return new Response(
            JSON.stringify({ error: 'Scan nicht gefunden' }),
            { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          )
        }

        return new Response(
          JSON.stringify({ scan }),
          { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )
      }

      case 'get-stats': {
        // Statistiken für Dashboard
        const { data: scans } = await supabase
          .from('customer_scans')
          .select('rating, requested_at')
          .eq('user_id', profile.id)

        const stats = {
          total: scans?.length || 0,
          green: scans?.filter(s => s.rating === 'green').length || 0,
          red: scans?.filter(s => s.rating === 'red').length || 0,
          this_month: scans?.filter(s => {
            const scanDate = new Date(s.requested_at)
            const now = new Date()
            return scanDate.getMonth() === now.getMonth() && scanDate.getFullYear() === now.getFullYear()
          }).length || 0
        }

        return new Response(
          JSON.stringify({ stats }),
          { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )
      }

      case 'get-monthly-report': {
        // Monatsreport abrufen
        const { month } = params // Format: YYYY-MM

        const targetMonth = month || getCurrentMonth()

        // Prüfen ob Report existiert
        let { data: report } = await supabase
          .from('customer_monthly_reports')
          .select('*')
          .eq('user_id', profile.id)
          .eq('report_month', targetMonth)
          .single()

        if (!report) {
          // Report generieren
          report = await generateMonthlyReport(supabase, profile.id, targetMonth)
        }

        return new Response(
          JSON.stringify({ report }),
          { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )
      }

      case 'list-reports': {
        // Alle verfügbaren Reports
        const { data: reports } = await supabase
          .from('customer_monthly_reports')
          .select('*')
          .eq('user_id', profile.id)
          .order('report_month', { ascending: false })

        return new Response(
          JSON.stringify({ reports: reports || [] }),
          { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )
      }

      default:
        return new Response(
          JSON.stringify({ error: 'Unbekannte Aktion' }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )
    }
  } catch (error) {
    console.error('Customer Scans error:', error)
    return new Response(
      JSON.stringify({ error: 'Interner Serverfehler' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})

function validateUrl(url: string): { valid: boolean; reason?: string; url?: string } {
  try {
    const parsed = new URL(url.startsWith('http') ? url : `https://${url}`)
    
    // SSRF-Schutz: Keine lokalen Adressen
    const hostname = parsed.hostname.toLowerCase()
    const blockedPatterns = [
      'localhost', '127.0.0.1', '0.0.0.0', '::1',
      '10.', '172.16.', '172.17.', '172.18.', '172.19.',
      '172.20.', '172.21.', '172.22.', '172.23.', '172.24.',
      '172.25.', '172.26.', '172.27.', '172.28.', '172.29.',
      '172.30.', '172.31.', '192.168.', 'internal', 'local'
    ]

    for (const pattern of blockedPatterns) {
      if (hostname.includes(pattern) || hostname.startsWith(pattern)) {
        return { valid: false, reason: 'Lokale/interne Adressen sind nicht erlaubt' }
      }
    }

    // Nur http/https erlauben
    if (!['http:', 'https:'].includes(parsed.protocol)) {
      return { valid: false, reason: 'Nur HTTP/HTTPS URLs erlaubt' }
    }

    return { valid: true, url: parsed.toString() }
  } catch {
    return { valid: false, reason: 'Ungültige URL' }
  }
}

async function performScan(url: string): Promise<{
  rating: 'green' | 'red'
  score: number
  summary: object
  findings: object
  high_count: number
  critical_count: number
}> {
  const findings: Array<{ severity: string; title: string; description: string; recommendation?: string }> = []
  let highCount = 0
  let criticalCount = 0

  const parsed = new URL(url)
  const domain = parsed.hostname

  // 1. SSL/TLS Check
  try {
    const sslRes = await fetch(url, { method: 'HEAD', redirect: 'follow' })
    const hsts = sslRes.headers.get('strict-transport-security')
    if (!hsts) {
      findings.push({ severity: 'medium', title: 'Fehlender HSTS Header', description: 'Strict-Transport-Security Header ist nicht gesetzt.', recommendation: 'HSTS aktivieren mit max-age >= 31536000' })
    }
    if (!url.startsWith('https://')) {
      findings.push({ severity: 'high', title: 'Keine HTTPS-Verbindung', description: 'Die Website verwendet kein HTTPS.', recommendation: 'SSL/TLS-Zertifikat einrichten und HTTPS erzwingen' })
      highCount++
    }
  } catch {
    findings.push({ severity: 'critical', title: 'Webseite nicht erreichbar', description: `${url} konnte nicht erreicht werden.`, recommendation: 'Überprüfen Sie die DNS-Konfiguration und den Server-Status' })
    criticalCount++
  }

  // 2. Security Headers Check
  try {
    const res = await fetch(url, { method: 'GET', redirect: 'follow' })
    const requiredHeaders = [
      { name: 'x-content-type-options', severity: 'medium', title: 'Fehlender X-Content-Type-Options Header' },
      { name: 'x-frame-options', severity: 'medium', title: 'Fehlender X-Frame-Options Header' },
      { name: 'content-security-policy', severity: 'high', title: 'Fehlende Content-Security-Policy' },
      { name: 'referrer-policy', severity: 'low', title: 'Fehlender Referrer-Policy Header' },
      { name: 'permissions-policy', severity: 'low', title: 'Fehlender Permissions-Policy Header' },
    ]
    for (const h of requiredHeaders) {
      if (!res.headers.has(h.name)) {
        findings.push({
          severity: h.severity,
          title: h.title,
          description: `Der Header "${h.name}" fehlt in der Server-Antwort.`,
          recommendation: `Setzen Sie den ${h.name} Header in Ihrer Webserver-Konfiguration.`
        })
        if (h.severity === 'high') highCount++
      }
    }

    // Check for information leakage
    const server = res.headers.get('server')
    const poweredBy = res.headers.get('x-powered-by')
    if (server) {
      findings.push({ severity: 'low', title: 'Server-Header exponiert', description: `Server-Typ sichtbar: ${server}`, recommendation: 'Server-Header entfernen oder anonymisieren' })
    }
    if (poweredBy) {
      findings.push({ severity: 'medium', title: 'X-Powered-By Header exponiert', description: `Technologie sichtbar: ${poweredBy}`, recommendation: 'X-Powered-By Header entfernen' })
    }
  } catch {
    // Already reported above
  }

  // 3. DNS Security Check
  try {
    const dnsRes = await fetch(`https://cloudflare-dns.com/dns-query?name=${domain}&type=TXT`, {
      headers: { 'Accept': 'application/dns-json' }
    })
    if (dnsRes.ok) {
      const dnsData = await dnsRes.json()
      const txtRecords = (dnsData.Answer || []).map((a: any) => a.data || '')
      const hasSPF = txtRecords.some((r: string) => r.includes('v=spf1'))
      if (!hasSPF) {
        findings.push({ severity: 'medium', title: 'Fehlender SPF Record', description: 'Kein SPF (Sender Policy Framework) DNS-Record gefunden.', recommendation: 'SPF Record konfigurieren um E-Mail-Spoofing zu verhindern' })
      }
    }
    // Check DMARC
    const dmarcRes = await fetch(`https://cloudflare-dns.com/dns-query?name=_dmarc.${domain}&type=TXT`, {
      headers: { 'Accept': 'application/dns-json' }
    })
    if (dmarcRes.ok) {
      const dmarcData = await dmarcRes.json()
      const hasDMARC = (dmarcData.Answer || []).some((a: any) => (a.data || '').includes('v=DMARC1'))
      if (!hasDMARC) {
        findings.push({ severity: 'medium', title: 'Fehlender DMARC Record', description: 'Kein DMARC DNS-Record gefunden.', recommendation: 'DMARC-Richtlinie konfigurieren' })
      }
    }
  } catch {
    // DNS check failed - non-critical
  }

  // 4. Exposed Files Check
  const sensitivePaths = [
    '/.env', '/.git/config', '/wp-config.php', '/robots.txt', '/sitemap.xml',
    '/.htaccess', '/server-status', '/phpinfo.php', '/web.config',
    '/backup.zip', '/database.sql', '/.DS_Store'
  ]
  for (const filePath of sensitivePaths) {
    try {
      const ctrl = new AbortController()
      const timeout = setTimeout(() => ctrl.abort(), 3000)
      const fileRes = await fetch(`${parsed.origin}${filePath}`, { 
        method: 'HEAD', redirect: 'manual', signal: ctrl.signal 
      })
      clearTimeout(timeout)
      if (fileRes.status === 200 && !['/robots.txt', '/sitemap.xml'].includes(filePath)) {
        const sev = ['.env', '.git/config', 'wp-config', 'database.sql', 'backup.zip'].some(s => filePath.includes(s)) ? 'critical' : 'high'
        findings.push({
          severity: sev,
          title: `Sensible Datei exponiert: ${filePath}`,
          description: `Die Datei ${filePath} ist öffentlich zugänglich.`,
          recommendation: `Zugriff auf ${filePath} blockieren über Webserver-Konfiguration`
        })
        if (sev === 'critical') criticalCount++
        else highCount++
      }
    } catch {
      // Timeout or network error - file not accessible (good)
    }
  }

  // 5. Cookie Security Check
  try {
    const cookieRes = await fetch(url, { method: 'GET', redirect: 'follow' })
    const setCookies = cookieRes.headers.get('set-cookie')
    if (setCookies) {
      if (!setCookies.toLowerCase().includes('httponly')) {
        findings.push({ severity: 'medium', title: 'Cookies ohne HttpOnly Flag', description: 'Cookies sind ohne HttpOnly-Flag gesetzt.', recommendation: 'HttpOnly-Flag für alle sensiblen Cookies aktivieren' })
      }
      if (!setCookies.toLowerCase().includes('secure')) {
        findings.push({ severity: 'medium', title: 'Cookies ohne Secure Flag', description: 'Cookies werden ohne Secure-Flag gesetzt.', recommendation: 'Secure-Flag für alle Cookies aktivieren' })
      }
      if (!setCookies.toLowerCase().includes('samesite')) {
        findings.push({ severity: 'low', title: 'Cookies ohne SameSite Attribut', description: 'SameSite-Attribut fehlt bei Cookies.', recommendation: 'SameSite=Strict oder Lax für Cookies setzen' })
      }
    }
  } catch {
    // Cookie check failed
  }

  // Calculate score
  const criticalWeight = 25
  const highWeight = 15
  const mediumWeight = 5
  const lowWeight = 2
  const mediumCount = findings.filter(f => f.severity === 'medium').length
  const lowCountVal = findings.filter(f => f.severity === 'low').length
  const deduction = (criticalCount * criticalWeight) + (highCount * highWeight) + (mediumCount * mediumWeight) + (lowCountVal * lowWeight)
  const score = Math.max(0, Math.min(100, 100 - deduction))
  const rating = (criticalCount > 0 || highCount > 0) ? 'red' : 'green'

  return {
    rating,
    score,
    summary: {
      url,
      scanned_at: new Date().toISOString(),
      total_findings: findings.length,
      critical: criticalCount,
      high: highCount,
      medium: mediumCount,
      low: lowCountVal,
      recommendation: rating === 'green'
        ? 'Keine kritischen Probleme gefunden. Sicherheitslage gut.'
        : 'Sicherheitsprobleme erkannt. Bitte umgehend beheben.'
    },
    findings: findings,
    high_count: highCount,
    critical_count: criticalCount
  }
}

function getCurrentMonth(): string {
  const now = new Date()
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
}

async function generateMonthlyReport(supabase: any, userId: string, month: string): Promise<any> {
  // Scans des Monats laden
  const [year, monthNum] = month.split('-').map(Number)
  const startDate = new Date(year, monthNum - 1, 1)
  const endDate = new Date(year, monthNum, 0, 23, 59, 59)

  const { data: scans } = await supabase
    .from('customer_scans')
    .select('*')
    .eq('user_id', userId)
    .gte('requested_at', startDate.toISOString())
    .lte('requested_at', endDate.toISOString())

  const greenCount = scans?.filter((s: any) => s.rating === 'green').length || 0
  const redCount = scans?.filter((s: any) => s.rating === 'red').length || 0

  // Top Findings sammeln
  const allFindings: any[] = []
  scans?.forEach((scan: any) => {
    if (scan.findings && Array.isArray(scan.findings)) {
      allFindings.push(...scan.findings)
    }
  })

  // Report speichern
  const { data: report, error } = await supabase
    .from('customer_monthly_reports')
    .insert({
      user_id: userId,
      report_month: month,
      total_scans: scans?.length || 0,
      green_count: greenCount,
      red_count: redCount,
      top_findings: allFindings.slice(0, 10),
      status: 'generated'
    })
    .select()
    .single()

  if (error) {
    console.error('Error generating report:', error)
    return null
  }

  return report
}
