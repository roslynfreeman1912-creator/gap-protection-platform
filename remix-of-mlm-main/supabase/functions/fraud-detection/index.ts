import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { getCorsHeaders, jsonResponse, authenticateRequest, authenticateServiceCall, getSupabaseAdmin } from '../_shared/auth.ts'

interface FraudCheckRequest {
  action: 'check_registration' | 'check_transaction' | 'check_velocity' | 'get_alerts' | 'resolve_alert'
  profileId?: string
  transactionId?: string
  alertId?: string
  email?: string
  ipAddress?: string
  resolution?: string
  resolutionNotes?: string
}

const THRESHOLDS = {
  MAX_REGISTRATIONS_PER_IP_PER_DAY: 3,
  MAX_TRANSACTIONS_PER_HOUR: 10,
  SUSPICIOUS_AMOUNT_THRESHOLD: 10000,
}

serve(async (req) => {
  const corsHeaders = getCorsHeaders(req)
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders })
  }

  try {
    const { supabase } = getSupabaseAdmin()

    // AUTH: Must authenticate BEFORE parsing body
    const serviceAuth = authenticateServiceCall(req, corsHeaders)
    if (!serviceAuth.ok) {
      // Non-service calls must be admin (we check action-specific access after parsing)
      const authResult = await authenticateRequest(req, corsHeaders, { allowedRoles: ['admin', 'super_admin'] })
      if (authResult.response) return authResult.response
    }

    const body: FraudCheckRequest = await req.json()

    // Service-only actions: block admin users from calling internal checks
    if (!serviceAuth.ok && (body.action === 'check_registration' || body.action === 'check_transaction' || body.action === 'check_velocity')) {
      return jsonResponse({ error: 'Nur interne Service-Aufrufe erlaubt' }, 403, corsHeaders)
    }

    switch (body.action) {
      case 'check_registration': {
        const alerts: any[] = []

        if (body.email) {
          const baseEmail = body.email.split('+')[0].split('@')
          const sanitizedBase = baseEmail[0].replace(/[%_(),.*\\]/g, '').replace(/\./g, '')
          const { data: similarEmails } = await supabase
            .from('profiles')
            .select('id, created_at')
            .ilike('email', `%${sanitizedBase}%@${baseEmail[1]}`)

          if (similarEmails && similarEmails.length > 1) {
            alerts.push({
              alert_type: 'duplicate_account',
              severity: 'high',
              details: { reason: 'Ähnliche E-Mail-Adressen erkannt', similar_count: similarEmails.length }
            })
          }
        }

        if (body.ipAddress) {
          const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()
          const { data: recentRegistrations } = await supabase
            .from('profiles')
            .select('id')
            .eq('ip_address', body.ipAddress)
            .gte('created_at', oneDayAgo)

          if (recentRegistrations && recentRegistrations.length >= THRESHOLDS.MAX_REGISTRATIONS_PER_IP_PER_DAY) {
            alerts.push({
              alert_type: 'velocity_abuse',
              severity: 'critical',
              details: { reason: 'Zu viele Registrierungen von dieser IP', count: recentRegistrations.length }
            })
          }
        }

        if (body.profileId) {
          const { data: profile } = await supabase
            .from('profiles')
            .select('sponsor_id, ip_address')
            .eq('id', body.profileId)
            .single()

          if (profile?.sponsor_id) {
            const { data: sponsor } = await supabase
              .from('profiles')
              .select('ip_address')
              .eq('id', profile.sponsor_id)
              .single()

            if (sponsor && sponsor.ip_address === profile.ip_address) {
              alerts.push({
                alert_type: 'self_referral',
                severity: 'high',
                details: { reason: 'Sponsor und Kunde haben gleiche IP-Adresse' }
              })
            }
          }
        }

        for (const alert of alerts) {
          await supabase.from('fraud_alerts').insert({ profile_id: body.profileId || null, ...alert })
        }

        return jsonResponse({
          success: true,
          alerts_count: alerts.length,
          alerts,
          blocked: alerts.some((a: any) => a.severity === 'critical'),
        }, 200, corsHeaders)
      }

      case 'check_transaction': {
        if (!body.transactionId) {
          return jsonResponse({ error: 'transactionId erforderlich' }, 400, corsHeaders)
        }

        const alerts: any[] = []
        const { data: transaction } = await supabase
          .from('transactions')
          .select('*')
          .eq('id', body.transactionId)
          .single()

        if (!transaction) {
          return jsonResponse({ error: 'Transaktion nicht gefunden' }, 404, corsHeaders)
        }

        if (Number(transaction.amount) > THRESHOLDS.SUSPICIOUS_AMOUNT_THRESHOLD) {
          alerts.push({
            alert_type: 'unusual_pattern',
            severity: 'medium',
            details: { reason: 'Ungewöhnlich hoher Transaktionsbetrag', amount: transaction.amount }
          })
        }

        const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString()
        const { count: recentTxCount } = await supabase
          .from('transactions')
          .select('*', { count: 'exact', head: true })
          .eq('customer_id', transaction.customer_id)
          .gte('created_at', oneHourAgo)

        if ((recentTxCount || 0) >= THRESHOLDS.MAX_TRANSACTIONS_PER_HOUR) {
          alerts.push({
            alert_type: 'velocity_abuse',
            severity: 'high',
            details: { reason: 'Zu viele Transaktionen pro Stunde', count: recentTxCount }
          })
        }

        for (const alert of alerts) {
          await supabase.from('fraud_alerts').insert({ profile_id: transaction.customer_id, ...alert })
        }

        return jsonResponse({
          success: true, alerts_count: alerts.length, alerts,
          blocked: alerts.some((a: any) => a.severity === 'critical'),
        }, 200, corsHeaders)
      }

      case 'get_alerts': {
        const query = supabase
          .from('fraud_alerts')
          .select('*, profile:profiles!profile_id(first_name, last_name, email)')
          .order('detected_at', { ascending: false })
          .limit(100)

        if (body.profileId) {
          query.eq('profile_id', body.profileId)
        }

        const { data: alerts } = await query
        return jsonResponse({ success: true, alerts: alerts || [] }, 200, corsHeaders)
      }

      case 'resolve_alert': {
        if (!body.alertId) {
          return jsonResponse({ error: 'alertId erforderlich' }, 400, corsHeaders)
        }

        await supabase.from('fraud_alerts').update({
          status: body.resolution || 'resolved',
          resolution_notes: body.resolutionNotes || null,
          resolved_at: new Date().toISOString(),
        }).eq('id', body.alertId)

        await supabase.from('audit_log').insert({
          action: 'FRAUD_ALERT_RESOLVED',
          table_name: 'fraud_alerts',
          record_id: body.alertId,
          new_data: { resolution: body.resolution },
        })

        return jsonResponse({ success: true }, 200, corsHeaders)
      }

      default:
        return jsonResponse({ error: 'Unbekannte Aktion' }, 400, corsHeaders)
    }

  } catch (error) {
    console.error('Fraud detection error:', (error as Error).message)
    return jsonResponse({ error: 'Fraud Detection Fehler' }, 500, getCorsHeaders(req))
  }
})
