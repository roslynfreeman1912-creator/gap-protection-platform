import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { getCorsHeaders, jsonResponse, authenticateRequest, getSupabaseAdmin } from '../_shared/auth.ts'

interface ReportRequest {
  profileId: string
  domainId?: string
  reportType: 'monthly' | 'scan' | 'simulation'
  startDate?: string
  endDate?: string
}

function generateHtmlReport(data: any): string {
  const { profile, domain, scans, findings, simulations, period } = data
  
  const criticalCount = findings.filter((f: any) => f.severity === 'critical').length
  const highCount = findings.filter((f: any) => f.severity === 'high').length
  const mediumCount = findings.filter((f: any) => f.severity === 'medium').length
  const lowCount = findings.filter((f: any) => f.severity === 'low').length

  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <title>Sicherheitsbericht - ${domain || 'Alle Domains'}</title>
  <style>
    body {
      font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
      margin: 0;
      padding: 40px;
      color: #1a1a2e;
      background: #f5f5f5;
    }
    .container {
      max-width: 800px;
      margin: 0 auto;
      background: white;
      padding: 40px;
      border-radius: 8px;
      box-shadow: 0 2px 10px rgba(0,0,0,0.1);
    }
    .header {
      text-align: center;
      border-bottom: 3px solid #16213e;
      padding-bottom: 20px;
      margin-bottom: 30px;
    }
    .header h1 {
      color: #16213e;
      margin: 0;
      font-size: 28px;
    }
    .header .subtitle {
      color: #666;
      margin-top: 10px;
    }
    .section {
      margin-bottom: 30px;
    }
    .section h2 {
      color: #16213e;
      border-bottom: 2px solid #e94560;
      padding-bottom: 10px;
    }
    .stats-grid {
      display: grid;
      grid-template-columns: repeat(4, 1fr);
      gap: 15px;
      margin: 20px 0;
    }
    .stat-box {
      text-align: center;
      padding: 20px;
      border-radius: 8px;
      background: #f8f9fa;
    }
    .stat-box.critical { background: #ffe6e6; border: 2px solid #dc3545; }
    .stat-box.high { background: #fff3e0; border: 2px solid #ff9800; }
    .stat-box.medium { background: #fff8e1; border: 2px solid #ffc107; }
    .stat-box.low { background: #e8f5e9; border: 2px solid #4caf50; }
    .stat-number {
      font-size: 32px;
      font-weight: bold;
    }
    .stat-label {
      font-size: 12px;
      color: #666;
      text-transform: uppercase;
    }
    .finding {
      background: #f8f9fa;
      padding: 15px;
      margin: 10px 0;
      border-radius: 8px;
      border-left: 4px solid #666;
    }
    .finding.critical { border-left-color: #dc3545; }
    .finding.high { border-left-color: #ff9800; }
    .finding.medium { border-left-color: #ffc107; }
    .finding.low { border-left-color: #4caf50; }
    .finding-title {
      font-weight: bold;
      margin-bottom: 5px;
    }
    .finding-description {
      color: #666;
      font-size: 14px;
    }
    .finding-recommendation {
      background: #e3f2fd;
      padding: 10px;
      margin-top: 10px;
      border-radius: 4px;
      font-size: 13px;
    }
    .footer {
      text-align: center;
      margin-top: 40px;
      padding-top: 20px;
      border-top: 1px solid #ddd;
      color: #666;
      font-size: 12px;
    }
    table {
      width: 100%;
      border-collapse: collapse;
      margin: 20px 0;
    }
    th, td {
      padding: 12px;
      text-align: left;
      border-bottom: 1px solid #ddd;
    }
    th {
      background: #16213e;
      color: white;
    }
    tr:hover {
      background: #f5f5f5;
    }
    .badge {
      display: inline-block;
      padding: 4px 8px;
      border-radius: 4px;
      font-size: 12px;
      font-weight: bold;
    }
    .badge-green { background: #4caf50; color: white; }
    .badge-yellow { background: #ffc107; color: black; }
    .badge-red { background: #dc3545; color: white; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>🛡️ GAP Protection</h1>
      <h2>Monatlicher Sicherheitsbericht</h2>
      <p class="subtitle">
        ${domain ? `Domain: ${domain}` : 'Alle geschützten Domains'}<br>
        Zeitraum: ${period.start} - ${period.end}<br>
        Erstellt: ${new Date().toLocaleDateString('de-DE')}
      </p>
    </div>

    <div class="section">
      <h2>📊 Zusammenfassung</h2>
      <div class="stats-grid">
        <div class="stat-box critical">
          <div class="stat-number">${criticalCount}</div>
          <div class="stat-label">Kritisch</div>
        </div>
        <div class="stat-box high">
          <div class="stat-number">${highCount}</div>
          <div class="stat-label">Hoch</div>
        </div>
        <div class="stat-box medium">
          <div class="stat-number">${mediumCount}</div>
          <div class="stat-label">Mittel</div>
        </div>
        <div class="stat-box low">
          <div class="stat-number">${lowCount}</div>
          <div class="stat-label">Niedrig</div>
        </div>
      </div>
      <p>
        <strong>Durchgeführte Scans:</strong> ${scans.length}<br>
        <strong>Adversary Simulations:</strong> ${simulations.length}<br>
        <strong>Gesamte Findings:</strong> ${findings.length}
      </p>
    </div>

    <div class="section">
      <h2>🔍 Scan-Verlauf</h2>
      <table>
        <thead>
          <tr>
            <th>Datum</th>
            <th>Domain</th>
            <th>Typ</th>
            <th>Ergebnis</th>
          </tr>
        </thead>
        <tbody>
          ${scans.map((scan: any) => `
            <tr>
              <td>${new Date(scan.created_at).toLocaleDateString('de-DE')}</td>
              <td>${scan.domain || scan.ip_address}</td>
              <td>${scan.scan_type}</td>
              <td>
                <span class="badge badge-${scan.overall_result === 'green' ? 'green' : scan.overall_result === 'yellow' ? 'yellow' : 'red'}">
                  ${scan.overall_result?.toUpperCase() || 'N/A'}
                </span>
              </td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    </div>

    ${findings.length > 0 ? `
    <div class="section">
      <h2>⚠️ Gefundene Schwachstellen</h2>
      ${findings.map((f: any) => `
        <div class="finding ${f.severity}">
          <div class="finding-title">${f.title}</div>
          <div class="finding-description">${f.description}</div>
          ${f.recommendation ? `
            <div class="finding-recommendation">
              <strong>Empfehlung:</strong> ${f.recommendation}
            </div>
          ` : ''}
        </div>
      `).join('')}
    </div>
    ` : ''}

    ${simulations.length > 0 ? `
    <div class="section">
      <h2>🎯 Adversary Simulations</h2>
      <table>
        <thead>
          <tr>
            <th>Datum</th>
            <th>Domain</th>
            <th>Typ</th>
            <th>Tests Bestanden</th>
            <th>Status</th>
          </tr>
        </thead>
        <tbody>
          ${simulations.map((sim: any) => `
            <tr>
              <td>${new Date(sim.started_at).toLocaleDateString('de-DE')}</td>
              <td>${sim.domain}</td>
              <td>${sim.simulation_type}</td>
              <td>${sim.tests_passed || 0}/${sim.tests_total || 0}</td>
              <td>
                <span class="badge badge-${sim.overall_status === 'passed' ? 'green' : sim.overall_status === 'warning' ? 'yellow' : 'red'}">
                  ${sim.overall_status?.toUpperCase() || 'N/A'}
                </span>
              </td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    </div>
    ` : ''}

    <div class="section">
      <h2>📋 Empfehlungen</h2>
      <ul>
        ${criticalCount > 0 ? '<li><strong>Dringend:</strong> Beheben Sie die kritischen Schwachstellen sofort.</li>' : ''}
        ${highCount > 0 ? '<li><strong>Wichtig:</strong> Planen Sie die Behebung der hohen Risiken innerhalb von 7 Tagen.</li>' : ''}
        ${mediumCount > 0 ? '<li>Überprüfen Sie die mittleren Risiken bei der nächsten Wartung.</li>' : ''}
        <li>Führen Sie regelmäßige Sicherheitsaudits durch.</li>
        <li>Halten Sie alle Systeme und Software aktuell.</li>
        <li>Schulen Sie Mitarbeiter in Sicherheitsbewusstsein.</li>
      </ul>
    </div>

    <div class="footer">
      <p>
        Dieser Bericht wurde automatisch von GAP Protection generiert.<br>
        Bei Fragen kontaktieren Sie uns unter support@gap-protection.com<br>
        © ${new Date().getFullYear()} GAP Protection - Alle Rechte vorbehalten
      </p>
    </div>
  </div>
</body>
</html>
  `
}

serve(async (req) => {
  const corsHeaders = getCorsHeaders(req)

  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders })
  }

  try {
    // Authenticate: admin only
    const authResult = await authenticateRequest(req, corsHeaders, { requiredRole: 'admin' })
    if (authResult.response) return authResult.response

    const { supabase } = getSupabaseAdmin()

    const { profileId, domainId, reportType, startDate, endDate }: ReportRequest = await req.json()

    if (!profileId) {
      return new Response(
        JSON.stringify({ error: 'profileId is required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Calculate date range
    const end = endDate ? new Date(endDate) : new Date()
    const start = startDate ? new Date(startDate) : new Date(end.getTime() - 30 * 24 * 60 * 60 * 1000)

    console.log(`Generating ${reportType} report for profile ${profileId}`)

    // Get profile info
    const { data: profile } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', profileId)
      .single()

    // Get domain info if specified
    let domain = null
    if (domainId) {
      const { data: domainData } = await supabase
        .from('protected_domains')
        .select('*')
        .eq('id', domainId)
        .single()
      domain = domainData?.domain
    }

    // Get scans
    let scansQuery = supabase
      .from('security_scans')
      .select('*')
      .eq('user_id', profileId)
      .gte('created_at', start.toISOString())
      .lte('created_at', end.toISOString())
      .order('created_at', { ascending: false })

    if (domain) {
      scansQuery = scansQuery.eq('domain', domain)
    }

    const { data: scans } = await scansQuery

    // Get findings from those scans
    const scanIds = (scans || []).map(s => s.id)
    let findings: any[] = []
    
    if (scanIds.length > 0) {
      const { data: findingsData } = await supabase
        .from('security_findings')
        .select('*')
        .in('scan_id', scanIds)
      findings = findingsData || []
    }

    // Get adversary simulations
    let simsQuery = supabase
      .from('adversary_simulations')
      .select('*')
      .eq('profile_id', profileId)
      .gte('started_at', start.toISOString())
      .lte('started_at', end.toISOString())
      .order('started_at', { ascending: false })

    if (domain) {
      simsQuery = simsQuery.eq('domain', domain)
    }

    const { data: simulations } = await simsQuery

    // Generate HTML report
    const htmlContent = generateHtmlReport({
      profile,
      domain,
      scans: scans || [],
      findings,
      simulations: simulations || [],
      period: {
        start: start.toLocaleDateString('de-DE'),
        end: end.toLocaleDateString('de-DE')
      }
    })

    // Store report record
    const { data: report, error: reportError } = await supabase
      .from('security_reports')
      .insert({
        profile_id: profileId,
        domain_id: domainId,
        report_type: reportType,
        period_start: start.toISOString(),
        period_end: end.toISOString(),
        total_scans: scans?.length || 0,
        total_findings: findings.length,
        critical_count: findings.filter(f => f.severity === 'critical').length,
        high_count: findings.filter(f => f.severity === 'high').length
      })
      .select()
      .single()

    return new Response(htmlContent, {
      status: 200,
      headers: {
        ...corsHeaders,
        'Content-Type': 'text/html; charset=utf-8',
        'Content-Disposition': `inline; filename="security-report-${new Date().toISOString().split('T')[0]}.html"`
      }
    })

  } catch (error: unknown) {
    console.error('Report generation error:', error)
    const errorMessage = error instanceof Error ? error.message : 'Unknown error'
    return new Response(
      JSON.stringify({ error: errorMessage }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})
