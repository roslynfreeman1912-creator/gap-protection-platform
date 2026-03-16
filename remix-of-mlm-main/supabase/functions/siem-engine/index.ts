import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { getCorsHeaders, jsonResponse, authenticateRequest, authenticateServiceCall, getSupabaseAdmin } from '../_shared/auth.ts'

/**
 * SIEM Correlation Engine - Enterprise Threat Intelligence
 * 
 * Actions:
 *  - correlate_events:     Run all active correlation rules against recent events
 *  - recalculate_fraud:    Recalculate fraud risk score for a profile
 *  - check_ip_reputation:  Real-time IP reputation check
 *  - ingest_ioc:           Ingest IOC indicators (bulk)
 *  - get_threat_landscape: Dashboard summary of current threat landscape
 *  - run_anomaly_detection: Run statistical anomaly detection across financial data
 */

interface SIEMRequest {
  action: string
  profileId?: string
  ipAddress?: string
  iocs?: Array<{ ioc_type: string; ioc_value: string; threat_type: string; severity: string; source: string }>
  timeWindowMinutes?: number
}

serve(async (req) => {
  const corsHeaders = getCorsHeaders(req)
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders })
  }

  try {
    const { supabase, url: supabaseUrl, key: serviceKey } = getSupabaseAdmin()

    const serviceAuth = authenticateServiceCall(req, corsHeaders)
    if (!serviceAuth.ok) {
      const authResult = await authenticateRequest(req, corsHeaders, { allowedRoles: ['admin', 'super_admin'] })
      if (authResult.response) return authResult.response
    }

    const body: SIEMRequest = await req.json()

    switch (body.action) {

      // ─── CORRELATE EVENTS ─────────────────────────────────────────
      case 'correlate_events': {
        const windowMinutes = body.timeWindowMinutes || 60

        const { data: rules } = await supabase
          .from('siem_correlation_rules')
          .select('*')
          .eq('is_enabled', true)

        if (!rules || rules.length === 0) {
          return jsonResponse({ success: true, message: 'No active correlation rules', alerts_created: 0 }, 200, corsHeaders)
        }

        const since = new Date(Date.now() - windowMinutes * 60 * 1000).toISOString()
        let alertsCreated = 0

        // ── Rule: brute_force_to_success ──
        const bruteForceRule = rules.find((r: any) => r.rule_name === 'brute_force_to_success')
        if (bruteForceRule) {
          const { data: failedLogins } = await supabase
            .from('login_attempts')
            .select('email, ip_address, COUNT(*)')
            .eq('success', false)
            .gte('attempted_at', since)

          // Group by email
          const { data: recentAttempts } = await supabase
            .from('login_attempts')
            .select('email, ip_address, success, attempted_at')
            .gte('attempted_at', since)
            .order('attempted_at', { ascending: true })

          if (recentAttempts) {
            const grouped = new Map<string, { failed: number; succeeded: boolean; ips: Set<string> }>()

            for (const attempt of recentAttempts) {
              const key = attempt.email || 'unknown'
              if (!grouped.has(key)) grouped.set(key, { failed: 0, succeeded: false, ips: new Set() })
              const entry = grouped.get(key)!
              if (!attempt.success) entry.failed++
              if (attempt.success) entry.succeeded = true
              if (attempt.ip_address) entry.ips.add(attempt.ip_address)
            }

            for (const [email, data] of grouped) {
              if (data.failed >= 5 && data.succeeded) {
                const { data: existing } = await supabase
                  .from('siem_correlated_alerts')
                  .select('id')
                  .eq('correlation_rule_id', bruteForceRule.id)
                  .gte('created_at', since)
                  .ilike('description', `%${email.substring(0, 20)}%`)
                  .limit(1)

                if (!existing || existing.length === 0) {
                  await supabase.from('siem_correlated_alerts').insert({
                    correlation_rule_id: bruteForceRule.id,
                    severity: bruteForceRule.alert_severity,
                    title: `Brute Force → Successful Login: ${email}`,
                    description: `${data.failed} failed attempts followed by success for ${email} from ${data.ips.size} IPs`,
                    correlated_events: { failed_count: data.failed, email, ips: Array.from(data.ips) },
                    affected_ips: Array.from(data.ips),
                  })
                  alertsCreated++
                }
              }
            }
          }
        }

        // ── Rule: suspicious_registration_wave ──
        const regWaveRule = rules.find((r: any) => r.rule_name === 'suspicious_registration_wave')
        if (regWaveRule) {
          const { data: recentProfiles } = await supabase
            .from('profiles')
            .select('id, ip_address, created_at')
            .gte('created_at', since)

          if (recentProfiles) {
            const ipGroups = new Map<string, string[]>()
            for (const p of recentProfiles) {
              if (p.ip_address) {
                if (!ipGroups.has(p.ip_address)) ipGroups.set(p.ip_address, [])
                ipGroups.get(p.ip_address)!.push(p.id)
              }
            }

            for (const [ip, profileIds] of ipGroups) {
              if (profileIds.length >= 10) {
                await supabase.from('siem_correlated_alerts').insert({
                  correlation_rule_id: regWaveRule.id,
                  severity: regWaveRule.alert_severity,
                  title: `Registration Wave: ${profileIds.length} accounts from ${ip}`,
                  description: `Mass registration detected: ${profileIds.length} profiles from IP ${ip} in ${windowMinutes}min`,
                  correlated_events: { ip, profile_count: profileIds.length, profile_ids: profileIds.slice(0, 20) },
                  affected_profiles: profileIds.slice(0, 50),
                  affected_ips: [ip],
                })
                alertsCreated++

                if (regWaveRule.auto_block_ip) {
                  await supabase.from('ip_reputation').upsert({
                    ip_address: ip,
                    manually_blocked: true,
                    blocked_reason: `auto_blocked_registration_wave_${profileIds.length}_accounts`,
                    reputation_score: 0,
                  }, { onConflict: 'ip_address' })
                }
              }
            }
          }
        }

        // ── Rule: commission_manipulation ──
        const commRule = rules.find((r: any) => r.rule_name === 'commission_manipulation')
        if (commRule) {
          const { data: recentCommissions } = await supabase
            .from('commissions')
            .select('id, partner_id, commission_amount, created_at')
            .gte('created_at', new Date(Date.now() - commRule.time_window_seconds * 1000).toISOString())

          if (recentCommissions && recentCommissions.length >= 20) {
            const partnerGroups = new Map<string, number>()
            for (const c of recentCommissions) {
              partnerGroups.set(c.partner_id, (partnerGroups.get(c.partner_id) || 0) + 1)
            }

            for (const [partnerId, count] of partnerGroups) {
              if (count >= 20) {
                await supabase.from('siem_correlated_alerts').insert({
                  correlation_rule_id: commRule.id,
                  severity: 'critical',
                  title: `Commission Anomaly: ${count} commissions for partner in ${commRule.time_window_seconds}s`,
                  description: `Partner ${partnerId} received ${count} commissions in rapid succession`,
                  correlated_events: { partner_id: partnerId, commission_count: count },
                  affected_profiles: [partnerId],
                })
                alertsCreated++
              }
            }
          }
        }

        // Update trigger counts
        await supabase.from('siem_correlation_rules')
          .update({ last_triggered_at: new Date().toISOString() })
          .in('id', rules.filter((_: any, i: number) => i < alertsCreated).map((r: any) => r.id))

        return jsonResponse({
          success: true,
          rules_evaluated: rules.length,
          alerts_created: alertsCreated,
          window_minutes: windowMinutes,
        }, 200, corsHeaders)
      }

      // ─── RECALCULATE FRAUD RISK SCORE ─────────────────────────────
      case 'recalculate_fraud': {
        if (!body.profileId) {
          return jsonResponse({ error: 'profileId required' }, 400, corsHeaders)
        }

        const profileId = body.profileId
        let totalScore = 0
        const factors: any[] = []
        const subscores = { velocity: 0, behavioral: 0, network: 0, device: 0, financial: 0, identity: 0 }

        // ── Velocity checks ──
        const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()
        const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString()

        const { count: loginFailures24h } = await supabase
          .from('login_attempts')
          .select('*', { count: 'exact', head: true })
          .eq('profile_id', profileId)
          .eq('success', false)
          .gte('attempted_at', oneDayAgo)

        if ((loginFailures24h || 0) > 10) {
          const pts = Math.min(300, (loginFailures24h || 0) * 15)
          subscores.velocity += pts
          factors.push({ rule: 'excessive_login_failures', points: pts, detail: `${loginFailures24h} failed logins in 24h` })
        }

        const { count: txCount1h } = await supabase
          .from('transactions')
          .select('*', { count: 'exact', head: true })
          .eq('customer_id', profileId)
          .gte('created_at', oneHourAgo)

        if ((txCount1h || 0) > 5) {
          const pts = Math.min(200, (txCount1h || 0) * 30)
          subscores.velocity += pts
          factors.push({ rule: 'high_tx_velocity', points: pts, detail: `${txCount1h} transactions in 1h` })
        }

        // ── Device checks ──
        const { count: deviceCount } = await supabase
          .from('known_devices')
          .select('*', { count: 'exact', head: true })
          .eq('profile_id', profileId)

        if ((deviceCount || 0) > 5) {
          const pts = 100
          subscores.device += pts
          factors.push({ rule: 'too_many_devices', points: pts, detail: `${deviceCount} known devices` })
        }

        // Check for shared device fingerprints across accounts
        const { data: profileDevices } = await supabase
          .from('known_devices')
          .select('device_fingerprint')
          .eq('profile_id', profileId)

        if (profileDevices) {
          for (const dev of profileDevices) {
            const { count: sharedCount } = await supabase
              .from('known_devices')
              .select('*', { count: 'exact', head: true })
              .eq('device_fingerprint', dev.device_fingerprint)
              .neq('profile_id', profileId)

            if ((sharedCount || 0) > 3) {
              const pts = 200
              subscores.device += pts
              factors.push({ rule: 'shared_device_fingerprint', points: pts, detail: `Device shared with ${sharedCount} other accounts` })
              break // Only flag once
            }
          }
        }

        // ── Network checks ──
        const { data: recentSessions } = await supabase
          .from('active_sessions')
          .select('ip_address, is_tor, is_vpn, is_proxy, geo_country')
          .eq('profile_id', profileId)
          .gte('created_at', oneDayAgo)
          .order('created_at', { ascending: false })
          .limit(20)

        if (recentSessions) {
          const torSessions = recentSessions.filter((s: any) => s.is_tor)
          if (torSessions.length > 0) {
            subscores.network += 150
            factors.push({ rule: 'tor_usage', points: 150, detail: `${torSessions.length} Tor sessions` })
          }

          const countries = new Set(recentSessions.map((s: any) => s.geo_country).filter(Boolean))
          if (countries.size > 3) {
            const pts = countries.size * 50
            subscores.network += pts
            factors.push({ rule: 'multi_country_access', points: pts, detail: `Access from ${countries.size} countries in 24h` })
          }
        }

        // ── Financial checks ──
        const { data: withdrawals30d } = await supabase
          .from('withdrawal_requests')
          .select('amount')
          .eq('profile_id', profileId)
          .gte('created_at', new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString())
          .not('status', 'in', '("rejected","cancelled")')

        if (withdrawals30d) {
          const totalWithdrawn = withdrawals30d.reduce((sum: number, w: any) => sum + Number(w.amount), 0)
          if (totalWithdrawn > 10000) {
            const pts = Math.min(300, Math.floor(totalWithdrawn / 1000) * 20)
            subscores.financial += pts
            factors.push({ rule: 'high_withdrawal_volume', points: pts, detail: `€${totalWithdrawn} withdrawn in 30 days` })
          }
        }

        // ── Identity checks ──
        const { data: profile } = await supabase
          .from('profiles')
          .select('sponsor_id, ip_address, email, created_at')
          .eq('id', profileId)
          .single()

        if (profile?.sponsor_id && profile?.ip_address) {
          const { data: sponsor } = await supabase
            .from('profiles')
            .select('ip_address')
            .eq('id', profile.sponsor_id)
            .single()

          if (sponsor?.ip_address === profile.ip_address) {
            subscores.identity += 180
            factors.push({ rule: 'sponsor_ip_match', points: 180, detail: 'Same IP as sponsor' })
          }
        }

        // Check for email pattern abuse (plus addressing)
        if (profile?.email) {
          const baseEmail = profile.email.split('+')[0].split('@')
          const sanitizedBase = baseEmail[0].replace(/\./g, '')
          const { count: similarCount } = await supabase
            .from('profiles')
            .select('*', { count: 'exact', head: true })
            .ilike('email', `%${sanitizedBase.substring(0, 15)}%@${baseEmail[1]}`)

          if ((similarCount || 0) > 2) {
            subscores.identity += 150
            factors.push({ rule: 'email_pattern_abuse', points: 150, detail: `${similarCount} similar email variants found` })
          }
        }

        // ── KYC check ──
        const { data: kyc } = await supabase
          .from('kyc_verifications')
          .select('status, verification_level')
          .eq('profile_id', profileId)
          .eq('status', 'approved')
          .limit(1)

        const hasKyc = kyc && kyc.length > 0
        if (!hasKyc) {
          subscores.identity += 50
          factors.push({ rule: 'no_kyc_verification', points: 50, detail: 'No approved KYC on file' })
        }

        // Calculate total
        totalScore = Object.values(subscores).reduce((s, v) => s + v, 0)
        const cappedScore = Math.min(1000, totalScore)

        let riskTier = 'low'
        if (cappedScore >= 800) riskTier = 'critical'
        else if (cappedScore >= 500) riskTier = 'high'
        else if (cappedScore >= 200) riskTier = 'medium'

        // Upsert fraud risk profile
        await supabase.from('fraud_risk_profiles').upsert({
          profile_id: profileId,
          composite_score: cappedScore,
          velocity_score: subscores.velocity,
          behavioral_score: subscores.behavioral,
          network_score: subscores.network,
          device_score: subscores.device,
          financial_score: subscores.financial,
          identity_score: subscores.identity,
          risk_tier: riskTier,
          factors,
          last_recalculated_at: new Date().toISOString(),
        }, { onConflict: 'profile_id' })

        // Log triggered rules
        const { data: matchedRules } = await supabase
          .from('fraud_rules')
          .select('id, rule_name, rule_category, risk_points, action_on_trigger')
          .eq('is_enabled', true)

        if (matchedRules) {
          for (const factor of factors) {
            const rule = matchedRules.find((r: any) => r.rule_name === factor.rule)
            if (rule) {
              await supabase.from('fraud_rule_triggers').insert({
                rule_id: rule.id,
                profile_id: profileId,
                risk_points_applied: factor.points,
                action_taken: rule.action_on_trigger,
                context: { detail: factor.detail },
              })
            }
          }
        }

        return jsonResponse({
          success: true,
          profile_id: profileId,
          composite_score: cappedScore,
          risk_tier: riskTier,
          subscores,
          factors_count: factors.length,
          factors,
        }, 200, corsHeaders)
      }

      // ─── CHECK IP REPUTATION ──────────────────────────────────────
      case 'check_ip_reputation': {
        if (!body.ipAddress) {
          return jsonResponse({ error: 'ipAddress required' }, 400, corsHeaders)
        }

        const ip = body.ipAddress

        // Check internal reputation
        const { data: rep } = await supabase
          .from('ip_reputation')
          .select('*')
          .eq('ip_address', ip)
          .maybeSingle()

        // Check IOC database
        const { data: iocMatch } = await supabase
          .from('ioc_database')
          .select('*')
          .eq('ioc_type', 'ip')
          .eq('ioc_value', ip)
          .eq('is_active', true)
          .maybeSingle()

        // Check geo-blocking
        let geoBlocked = false
        if (rep?.country_code) {
          const { data: geoRule } = await supabase
            .from('geo_blocking_rules')
            .select('*')
            .eq('country_code', rep.country_code)
            .eq('is_active', true)
            .maybeSingle()

          if (geoRule) geoBlocked = true
        }

        const result = {
          ip,
          reputation_score: rep?.reputation_score ?? 50,
          is_known: !!rep,
          is_blocked: rep?.manually_blocked || false,
          is_whitelisted: rep?.manually_whitelisted || false,
          is_tor: rep?.is_tor || false,
          is_vpn: rep?.is_vpn || false,
          is_proxy: rep?.is_proxy || false,
          is_datacenter: rep?.is_datacenter || false,
          is_known_attacker: rep?.is_known_attacker || false,
          country_code: rep?.country_code || null,
          asn: rep?.asn || null,
          org_name: rep?.org_name || null,
          abuse_reports: rep?.abuse_reports || 0,
          failed_logins: rep?.failed_logins || 0,
          geo_blocked: geoBlocked,
          ioc_match: iocMatch ? {
            threat_type: iocMatch.threat_type,
            severity: iocMatch.severity,
            confidence: iocMatch.confidence,
            source: iocMatch.source,
          } : null,
          risk_assessment: calculateIpRisk(rep, iocMatch, geoBlocked),
        }

        return jsonResponse({ success: true, ...result }, 200, corsHeaders)
      }

      // ─── INGEST IOC INDICATORS ────────────────────────────────────
      case 'ingest_ioc': {
        if (!body.iocs || !Array.isArray(body.iocs) || body.iocs.length === 0) {
          return jsonResponse({ error: 'iocs array required' }, 400, corsHeaders)
        }

        if (body.iocs.length > 1000) {
          return jsonResponse({ error: 'Maximum 1000 IOCs per batch' }, 400, corsHeaders)
        }

        const validTypes = ['ip', 'domain', 'url', 'email', 'file_hash', 'user_agent', 'asn', 'cidr']
        const records = body.iocs
          .filter((ioc: any) => validTypes.includes(ioc.ioc_type) && ioc.ioc_value)
          .map((ioc: any) => ({
            ioc_type: ioc.ioc_type,
            ioc_value: ioc.ioc_value.substring(0, 500),
            threat_type: ioc.threat_type || null,
            severity: ioc.severity || 'medium',
            source: ioc.source || 'manual_import',
            confidence: ioc.confidence || 50,
            tags: ioc.tags || [],
            context: ioc.context || {},
          }))

        const { error: insertError } = await supabase.from('ioc_database').upsert(records, {
          onConflict: 'ioc_type,ioc_value',
        })

        if (insertError) {
          return jsonResponse({ error: 'IOC ingestion failed', detail: insertError.message }, 500, corsHeaders)
        }

        await supabase.from('audit_log').insert({
          action: 'IOC_BULK_IMPORT',
          table_name: 'ioc_database',
          record_id: 'batch',
          severity: 'info',
          category: 'security',
          new_data: { imported_count: records.length },
        })

        return jsonResponse({ success: true, imported: records.length, skipped: body.iocs.length - records.length }, 200, corsHeaders)
      }

      // ─── THREAT LANDSCAPE DASHBOARD ───────────────────────────────
      case 'get_threat_landscape': {
        const last24h = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()
        const last7d = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString()

        // Open SIEM alerts
        const { data: openAlerts, count: openAlertCount } = await supabase
          .from('siem_correlated_alerts')
          .select('*', { count: 'exact' })
          .in('status', ['open', 'investigating'])
          .order('created_at', { ascending: false })
          .limit(20)

        // Active incidents
        const { data: activeIncidents, count: activeIncidentCount } = await supabase
          .from('security_incidents')
          .select('*', { count: 'exact' })
          .not('status', 'in', '("resolved","closed")')
          .order('detected_at', { ascending: false })
          .limit(10)

        // Fraud risk distribution
        const { data: fraudDist } = await supabase
          .from('fraud_risk_profiles')
          .select('risk_tier')

        const riskDistribution = { low: 0, medium: 0, high: 0, critical: 0, blocked: 0 }
        if (fraudDist) {
          for (const f of fraudDist) {
            const tier = (f as any).risk_tier as keyof typeof riskDistribution
            if (tier in riskDistribution) riskDistribution[tier]++
          }
        }

        // Recent fraud triggers
        const { data: recentTriggers, count: triggerCount24h } = await supabase
          .from('fraud_rule_triggers')
          .select('*, rule:fraud_rules!rule_id(rule_name, rule_category)', { count: 'exact' })
          .gte('triggered_at', last24h)
          .order('triggered_at', { ascending: false })
          .limit(20)

        // IOC stats
        const { count: activeIocCount } = await supabase
          .from('ioc_database')
          .select('*', { count: 'exact', head: true })
          .eq('is_active', true)

        // Failed logins 24h
        const { count: failedLogins24h } = await supabase
          .from('login_attempts')
          .select('*', { count: 'exact', head: true })
          .eq('success', false)
          .gte('attempted_at', last24h)

        // Blocked IPs
        const { count: blockedIps } = await supabase
          .from('ip_reputation')
          .select('*', { count: 'exact', head: true })
          .eq('manually_blocked', true)

        // Pending KYC
        const { count: pendingKyc } = await supabase
          .from('kyc_verifications')
          .select('*', { count: 'exact', head: true })
          .in('status', ['pending', 'in_review'])

        // Pending DSAR
        const { count: pendingDsar } = await supabase
          .from('dsar_requests')
          .select('*', { count: 'exact', head: true })
          .not('status', 'in', '("completed","denied")')

        return jsonResponse({
          success: true,
          landscape: {
            siem_alerts: { open: openAlertCount || 0, recent: openAlerts || [] },
            incidents: { active: activeIncidentCount || 0, recent: activeIncidents || [] },
            fraud: {
              risk_distribution: riskDistribution,
              triggers_24h: triggerCount24h || 0,
              recent_triggers: recentTriggers || [],
            },
            threat_intel: { active_iocs: activeIocCount || 0 },
            authentication: { failed_logins_24h: failedLogins24h || 0, blocked_ips: blockedIps || 0 },
            compliance: { pending_kyc: pendingKyc || 0, pending_dsar: pendingDsar || 0 },
          },
        }, 200, corsHeaders)
      }

      // ─── ANOMALY DETECTION ────────────────────────────────────────
      case 'run_anomaly_detection': {
        const last30d = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString()

        // Commission anomaly detection (z-score)
        const { data: commissions30d } = await supabase
          .from('commissions')
          .select('partner_id, commission_amount, created_at')
          .gte('created_at', last30d)

        const anomalies: any[] = []

        if (commissions30d && commissions30d.length > 10) {
          // Calculate mean and stddev
          const amounts = commissions30d.map((c: any) => Number(c.commission_amount))
          const mean = amounts.reduce((s, v) => s + v, 0) / amounts.length
          const variance = amounts.reduce((s, v) => s + Math.pow(v - mean, 2), 0) / amounts.length
          const stddev = Math.sqrt(variance)

          if (stddev > 0) {
            // Find entries with z-score > 3
            for (const c of commissions30d) {
              const z = Math.abs((Number(c.commission_amount) - mean) / stddev)
              if (z > 3) {
                anomalies.push({
                  type: 'commission_outlier',
                  partner_id: c.partner_id,
                  amount: c.commission_amount,
                  z_score: Math.round(z * 100) / 100,
                  mean: Math.round(mean * 100) / 100,
                  stddev: Math.round(stddev * 100) / 100,
                  created_at: c.created_at,
                })
              }
            }
          }

          // Per-partner velocity anomaly
          const partnerCounts = new Map<string, number>()
          for (const c of commissions30d) {
            partnerCounts.set(c.partner_id, (partnerCounts.get(c.partner_id) || 0) + 1)
          }

          const countValues = Array.from(partnerCounts.values())
          const countMean = countValues.reduce((s, v) => s + v, 0) / countValues.length
          const countStddev = Math.sqrt(countValues.reduce((s, v) => s + Math.pow(v - countMean, 2), 0) / countValues.length)

          if (countStddev > 0) {
            for (const [partnerId, count] of partnerCounts) {
              const z = (count - countMean) / countStddev
              if (z > 3) {
                anomalies.push({
                  type: 'commission_velocity_anomaly',
                  partner_id: partnerId,
                  commission_count: count,
                  z_score: Math.round(z * 100) / 100,
                  mean_count: Math.round(countMean * 100) / 100,
                })
              }
            }
          }
        }

        // Withdrawal anomaly detection
        const { data: withdrawals30d } = await supabase
          .from('withdrawal_requests')
          .select('profile_id, amount, created_at')
          .gte('created_at', last30d)
          .not('status', 'in', '("rejected","cancelled")')

        if (withdrawals30d && withdrawals30d.length > 5) {
          const amounts = withdrawals30d.map((w: any) => Number(w.amount))
          const mean = amounts.reduce((s, v) => s + v, 0) / amounts.length
          const stddev = Math.sqrt(amounts.reduce((s, v) => s + Math.pow(v - mean, 2), 0) / amounts.length)

          if (stddev > 0) {
            for (const w of withdrawals30d) {
              const z = (Number(w.amount) - mean) / stddev
              if (z > 3) {
                anomalies.push({
                  type: 'withdrawal_outlier',
                  profile_id: w.profile_id,
                  amount: w.amount,
                  z_score: Math.round(z * 100) / 100,
                  mean: Math.round(mean * 100) / 100,
                  created_at: w.created_at,
                })
              }
            }
          }
        }

        return jsonResponse({
          success: true,
          anomaly_count: anomalies.length,
          anomalies,
          analysis_period: '30_days',
          commission_records_analyzed: commissions30d?.length || 0,
          withdrawal_records_analyzed: withdrawals30d?.length || 0,
        }, 200, corsHeaders)
      }

      default:
        return jsonResponse({ error: 'Unknown action' }, 400, corsHeaders)
    }

  } catch (error) {
    console.error('SIEM engine error:', (error as Error).message)
    return jsonResponse({ error: 'SIEM Engine Error' }, 500, getCorsHeaders(req))
  }
})

function calculateIpRisk(
  rep: any | null,
  iocMatch: any | null,
  geoBlocked: boolean
): { score: number; level: string; reasons: string[] } {
  let score = 50
  const reasons: string[] = []

  if (!rep) return { score: 50, level: 'unknown', reasons: ['No reputation data'] }

  if (rep.manually_blocked) { score = 0; reasons.push('Manually blocked') }
  if (rep.manually_whitelisted) { score = 100; reasons.push('Manually whitelisted') }
  if (rep.is_tor) { score -= 30; reasons.push('Tor exit node') }
  if (rep.is_vpn) { score -= 10; reasons.push('VPN detected') }
  if (rep.is_proxy) { score -= 15; reasons.push('Proxy detected') }
  if (rep.is_datacenter) { score -= 5; reasons.push('Datacenter IP') }
  if (rep.is_known_attacker) { score -= 40; reasons.push('Known attacker') }
  if ((rep.failed_logins || 0) > 10) { score -= 20; reasons.push(`${rep.failed_logins} failed logins`) }
  if ((rep.abuse_reports || 0) > 0) { score -= rep.abuse_reports * 10; reasons.push(`${rep.abuse_reports} abuse reports`) }
  if (iocMatch) { score -= 40; reasons.push(`IOC match: ${iocMatch.threat_type}`) }
  if (geoBlocked) { score -= 30; reasons.push('Geo-blocked country') }

  score = Math.max(0, Math.min(100, score))

  let level = 'clean'
  if (score < 20) level = 'malicious'
  else if (score < 40) level = 'suspicious'
  else if (score < 60) level = 'neutral'
  else if (score < 80) level = 'likely_safe'
  else level = 'clean'

  return { score, level, reasons }
}
