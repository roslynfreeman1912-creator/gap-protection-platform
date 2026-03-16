import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { getCorsHeaders, jsonResponse, authenticateRequest, getSupabaseAdmin } from '../_shared/auth.ts'

interface SimulationRequest {
  domain: string
  profileId: string
  simulationType: 'reconnaissance' | 'brute-force-detection' | 'injection-test' | 'full'
}

interface SimulationResult {
  type: string
  passed: boolean
  details: string
  severity: 'info' | 'low' | 'medium' | 'high' | 'critical'
  recommendation?: string
}

// Simulate reconnaissance attack patterns
async function runReconnaissance(domain: string): Promise<SimulationResult[]> {
  const results: SimulationResult[] = []
  
  // Check for exposed directories
  const commonPaths = [
    '/.git/config',
    '/.env',
    '/wp-admin',
    '/admin',
    '/backup',
    '/phpinfo.php',
    '/.htaccess',
    '/robots.txt',
    '/sitemap.xml',
    '/.well-known/security.txt'
  ]

  for (const path of commonPaths) {
    try {
      const response = await fetch(`https://${domain}${path}`, {
        method: 'HEAD',
        redirect: 'manual'
      })
      
      if (response.status === 200) {
        const isSensitive = ['.git', '.env', 'phpinfo', '.htaccess', 'backup'].some(s => path.includes(s))
        results.push({
          type: 'Exposed Path',
          passed: !isSensitive,
          details: `${path} is accessible (Status: ${response.status})`,
          severity: isSensitive ? 'high' : 'info',
          recommendation: isSensitive ? `Remove or restrict access to ${path}` : undefined
        })
      }
    } catch {
      // Path not accessible - good
    }
  }

  // Real WHOIS/RDAP Privacy Check
  try {
    const rdapRes = await fetch(`https://rdap.org/domain/${encodeURIComponent(domain)}`, {
      headers: { 'Accept': 'application/rdap+json, application/json' }
    })
    if (rdapRes.ok) {
      const data = await rdapRes.json()
      const entities = data.entities || []
      let hasPrivacy = false
      let registrar = 'Unknown'
      for (const entity of entities) {
        if (entity.roles?.includes('registrar')) {
          const fn = entity.vcardArray?.[1]?.find((v: any) => v[0] === 'fn')
          if (fn) registrar = fn[3]
        }
        if (entity.roles?.includes('registrant')) {
          const remarks = entity.remarks || []
          hasPrivacy = remarks.some((r: any) => /privacy|redact|withheld/i.test(r.description?.join(' ') || r.title || ''))
          if (!hasPrivacy) {
            // Check if personal info is exposed
            const vcards = entity.vcardArray?.[1] || []
            const hasEmail = vcards.some((v: any) => v[0] === 'email')
            const hasPhone = vcards.some((v: any) => v[0] === 'tel')
            if (hasEmail || hasPhone) {
              results.push({
                type: 'WHOIS Privacy',
                passed: false,
                details: `Domain registrant contact info is publicly visible (Registrar: ${registrar}). Personal email/phone exposed.`,
                severity: 'medium',
                recommendation: 'Enable WHOIS privacy protection to hide personal contact information'
              })
            } else {
              hasPrivacy = true
            }
          }
        }
      }
      if (hasPrivacy || !entities.some((e: any) => e.roles?.includes('registrant'))) {
        results.push({
          type: 'WHOIS Privacy',
          passed: true,
          details: `WHOIS privacy is active or registrant data is redacted (Registrar: ${registrar})`,
          severity: 'info'
        })
      }
    } else {
      results.push({
        type: 'WHOIS Privacy',
        passed: true,
        details: 'RDAP/WHOIS lookup returned no registrant data (likely privacy-protected)',
        severity: 'info'
      })
    }
  } catch {
    results.push({
      type: 'WHOIS Privacy',
      passed: true,
      details: 'WHOIS/RDAP lookup failed — privacy status unknown',
      severity: 'info'
    })
  }

  return results
}

// Test for common injection vulnerabilities using DB templates + fallback
async function runInjectionTests(domain: string): Promise<SimulationResult[]> {
  const results: SimulationResult[] = []
  const { supabase } = getSupabaseAdmin()

  // Fetch active templates from DB (limit to key types for simulation)
  const targetTypes = ['xss', 'sql', 'sql-injection', 'sql_injection', 'command-injection', 'ssti', 'lfi', 'path-traversal']
  const { data: templates } = await supabase
    .from('vulnerability_templates')
    .select('name, type, severity, payloads, paths, matchers')
    .in('type', targetTypes)
    .eq('is_active', true)
    .limit(20)

  // Fallback payloads if no templates in DB yet
  const xssPayloads = templates?.filter(t => t.type === 'xss')?.flatMap(t => t.payloads || []) || []
  const sqlPayloads = templates?.filter(t => ['sql', 'sql-injection', 'sql_injection'].includes(t.type))?.flatMap(t => t.payloads || []) || []
  const sqlMatchers = templates?.filter(t => ['sql', 'sql-injection', 'sql_injection'].includes(t.type))?.flatMap(t => t.matchers || []) || []

  if (xssPayloads.length === 0) xssPayloads.push('<script>alert(1)</script>')
  if (sqlPayloads.length === 0) sqlPayloads.push("' OR '1'='1")
  if (sqlMatchers.length === 0) sqlMatchers.push('SQL syntax', 'mysql_fetch', 'ORA-', 'PostgreSQL', 'sqlite3', 'SQLSTATE')

  // XSS tests (sample up to 5 payloads)
  const xssSample = xssPayloads.sort(() => Math.random() - 0.5).slice(0, 5)
  for (const payload of xssSample) {
    try {
      const response = await fetch(`https://${domain}/?test=${encodeURIComponent(payload)}`, { method: 'GET' })
      const body = await response.text()
      if (body.includes(payload)) {
        results.push({
          type: 'XSS Vulnerability',
          passed: false,
          details: `Reflected content detected with payload: ${payload.substring(0, 40)}...`,
          severity: 'high',
          recommendation: 'Implement input sanitization and Content-Security-Policy'
        })
      }
    } catch { /* skip */ }
  }
  if (!results.some(r => r.type === 'XSS Vulnerability')) {
    results.push({ type: 'XSS Protection', passed: true, details: `No reflected content detected (${xssSample.length} payloads tested)`, severity: 'info' })
  }

  // SQL injection tests (sample up to 5 payloads)
  const sqlSample = sqlPayloads.sort(() => Math.random() - 0.5).slice(0, 5)
  for (const payload of sqlSample) {
    try {
      const response = await fetch(`https://${domain}/?id=${encodeURIComponent(payload)}`, { method: 'GET' })
      const body = (await response.text().catch(() => '')).toLowerCase()
      const hasError = sqlMatchers.some(m => body.includes(m.toLowerCase()))
      if (hasError) {
        results.push({
          type: 'SQL Error Exposure',
          passed: false,
          details: `SQL error messages exposed with payload: ${payload.substring(0, 40)}`,
          severity: 'critical',
          recommendation: 'Use prepared statements and hide error messages'
        })
      }
    } catch { /* skip */ }
  }
  if (!results.some(r => r.type === 'SQL Error Exposure')) {
    results.push({ type: 'SQL Error Handling', passed: true, details: `No SQL error messages exposed (${sqlSample.length} payloads tested)`, severity: 'info' })
  }

  // Additional template-based tests (command injection, SSTI, LFI, path traversal)
  const extraTypes = ['command-injection', 'ssti', 'lfi', 'path-traversal']
  for (const etype of extraTypes) {
    const tpls = templates?.filter(t => t.type === etype) || []
    if (tpls.length === 0) continue
    const payloads = tpls.flatMap(t => t.payloads || []).sort(() => Math.random() - 0.5).slice(0, 3)
    const matchers = tpls.flatMap(t => t.matchers || [])
    let found = false
    for (const payload of payloads) {
      try {
        const response = await fetch(`https://${domain}/?input=${encodeURIComponent(payload)}`, { method: 'GET' })
        const body = (await response.text().catch(() => '')).toLowerCase()
        if (matchers.length > 0 && matchers.some(m => body.includes(m.toLowerCase()))) {
          results.push({
            type: `${etype} Vulnerability`,
            passed: false,
            details: `Potential ${etype} detected`,
            severity: tpls[0]?.severity === 'critical' ? 'critical' : 'high',
            recommendation: `Remediate ${etype} vulnerability`
          })
          found = true
          break
        }
      } catch { /* skip */ }
    }
    if (!found && payloads.length > 0) {
      results.push({ type: `${etype} Protection`, passed: true, details: `No ${etype} indicators (${payloads.length} payloads tested)`, severity: 'info' })
    }
  }

  return results
}

// Simulate brute-force detection test
async function runBruteForceDetection(domain: string): Promise<SimulationResult[]> {
  const results: SimulationResult[] = []
  
  // Check for rate limiting on login endpoints
  const loginPaths = ['/login', '/wp-login.php', '/admin/login', '/user/login', '/api/auth/login']
  
  for (const path of loginPaths) {
    try {
      const requests = []
      for (let i = 0; i < 5; i++) {
        requests.push(
          fetch(`https://${domain}${path}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username: 'test', password: 'test' })
          }).catch(() => null)
        )
      }
      
      const responses = await Promise.all(requests)
      const validResponses = responses.filter(r => r !== null)
      
      if (validResponses.length >= 5) {
        const hasRateLimit = validResponses.some(r => r && r.status === 429)
        
        if (!hasRateLimit) {
          results.push({
            type: 'Rate Limiting',
            passed: false,
            details: `${path} does not appear to have rate limiting`,
            severity: 'medium',
            recommendation: 'Implement rate limiting on authentication endpoints'
          })
        } else {
          results.push({
            type: 'Rate Limiting',
            passed: true,
            details: `${path} has rate limiting protection`,
            severity: 'info'
          })
        }
      }
    } catch {
      // Path not accessible
    }
  }

  if (results.length === 0) {
    results.push({
      type: 'Login Endpoints',
      passed: true,
      details: 'No standard login endpoints found exposed',
      severity: 'info'
    })
  }

  return results
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

    const { domain, profileId, simulationType }: SimulationRequest = await req.json()

    if (!domain) {
      return new Response(
        JSON.stringify({ error: 'Domain is required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Validate domain format (prevent SSRF)
    const domainRegex = /^[a-zA-Z0-9][a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/
    if (!domainRegex.test(domain)) {
      return new Response(
        JSON.stringify({ error: 'Invalid domain format' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Block private/internal domains
    const blockedPatterns = [
      /^localhost/i, /^127\./, /^10\./, /^172\.(1[6-9]|2\d|3[01])\./, /^192\.168\./,
      /^169\.254\./, /\.internal$/i, /\.local$/i, /\.localhost$/i
    ]
    if (blockedPatterns.some(p => p.test(domain))) {
      return new Response(
        JSON.stringify({ error: 'Domain not allowed' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Verify domain ownership - user must have this domain in their customer_scans or protected_domains
    const { data: ownedDomain } = await supabase
      .from('customer_scans')
      .select('id')
      .eq('user_id', authResult.auth.profileId)
      .eq('target_url', domain)
      .limit(1)

    const { data: protectedDomain } = await supabase
      .from('protected_domains')
      .select('id')
      .eq('profile_id', authResult.auth.profileId)
      .eq('domain', domain)
      .limit(1)

    if ((!ownedDomain || ownedDomain.length === 0) && (!protectedDomain || protectedDomain.length === 0)) {
      // Also check if user is admin (admins can scan any domain)
      const isAdmin = authResult.auth.roles?.includes('admin')
      if (!isAdmin) {
        return new Response(
          JSON.stringify({ error: 'Domain nicht in Ihrem Konto registriert. Bitte zuerst einen Domain-Scan durchführen.' }),
          { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )
      }
    }

    console.log(`Running ${simulationType} simulation on ${domain}`)

    // Create simulation record
    const { data: simulation, error: createError } = await supabase
      .from('adversary_simulations')
      .insert({
        profile_id: authResult.auth.profileId,
        domain,
        simulation_type: simulationType,
        status: 'running',
        started_at: new Date().toISOString()
      })
      .select()
      .single()

    if (createError) {
      console.error('Create simulation error:', createError)
    }

    let allResults: SimulationResult[] = []

    // Run simulations based on type
    if (simulationType === 'reconnaissance' || simulationType === 'full') {
      const reconResults = await runReconnaissance(domain)
      allResults = [...allResults, ...reconResults]
    }

    if (simulationType === 'injection-test' || simulationType === 'full') {
      const injectionResults = await runInjectionTests(domain)
      allResults = [...allResults, ...injectionResults]
    }

    if (simulationType === 'brute-force-detection' || simulationType === 'full') {
      const bruteForceResults = await runBruteForceDetection(domain)
      allResults = [...allResults, ...bruteForceResults]
    }

    // Calculate overall score
    const totalTests = allResults.length
    const passedTests = allResults.filter(r => r.passed).length
    const criticalIssues = allResults.filter(r => r.severity === 'critical').length
    const highIssues = allResults.filter(r => r.severity === 'high').length
    
    let overallStatus: 'passed' | 'warning' | 'failed'
    if (criticalIssues > 0) {
      overallStatus = 'failed'
    } else if (highIssues > 0) {
      overallStatus = 'warning'
    } else {
      overallStatus = 'passed'
    }

    // Update simulation record
    if (simulation) {
      await supabase
        .from('adversary_simulations')
        .update({
          status: 'completed',
          completed_at: new Date().toISOString(),
          results: allResults,
          overall_status: overallStatus,
          tests_passed: passedTests,
          tests_total: totalTests
        })
        .eq('id', simulation.id)
    }

    return new Response(
      JSON.stringify({
        simulationId: simulation?.id,
        domain,
        simulationType,
        results: allResults,
        summary: {
          total: totalTests,
          passed: passedTests,
          failed: totalTests - passedTests,
          critical: criticalIssues,
          high: highIssues,
          overallStatus
        }
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )

  } catch (error: unknown) {
    console.error('Adversary simulation error:', error)
    return new Response(
      JSON.stringify({ error: 'Simulation fehlgeschlagen' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})
