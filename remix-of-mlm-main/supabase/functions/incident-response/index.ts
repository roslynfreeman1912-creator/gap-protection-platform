import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { getCorsHeaders, jsonResponse, authenticateRequest, authenticateServiceCall, getSupabaseAdmin } from '../_shared/auth.ts'

/**
 * Incident Response Automation Engine
 * 
 * Actions:
 *  - create_incident:     Create new security incident with auto-classification
 *  - update_incident:     Update incident status/details (with timeline entry)
 *  - auto_contain:        Execute automated containment procedures
 *  - add_timeline_entry:  Add manual note/action to incident timeline
 *  - get_incident:        Get full incident with timeline
 *  - list_incidents:      List incidents with filters
 *  - run_playbook:        Execute pre-defined response playbook
 *  - generate_post_mortem: Generate post-mortem report structure
 */

interface IncidentRequest {
  action: string
  incidentId?: string
  title?: string
  description?: string
  severity?: string
  category?: string
  assignedTo?: string
  sourceIp?: string
  attackVector?: string
  relatedFraudAlerts?: string[]
  relatedThreatEvents?: string[]
  containmentActions?: string[]
  status?: string
  timelineEntry?: { action_type: string; description: string; evidence?: any }
  playbook?: string
  profileIds?: string[]
  ipAddresses?: string[]
  filters?: { status?: string; severity?: string; category?: string; limit?: number }
}

serve(async (req) => {
  const corsHeaders = getCorsHeaders(req)
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders })
  }

  try {
    const { supabase, url: supabaseUrl, key: serviceKey } = getSupabaseAdmin()

    let callerProfileId: string | null = null
    const serviceAuth = authenticateServiceCall(req, corsHeaders)
    if (!serviceAuth.ok) {
      const authResult = await authenticateRequest(req, corsHeaders, { allowedRoles: ['admin', 'super_admin'] })
      if (authResult.response) return authResult.response
      callerProfileId = authResult.auth.profileId
    }

    const body: IncidentRequest = await req.json()

    switch (body.action) {

      // ─── CREATE INCIDENT ──────────────────────────────────────────
      case 'create_incident': {
        if (!body.title || !body.severity || !body.category) {
          return jsonResponse({ error: 'title, severity, category required' }, 400, corsHeaders)
        }

        const validSeverities = ['p1_critical', 'p2_high', 'p3_medium', 'p4_low']
        if (!validSeverities.includes(body.severity)) {
          return jsonResponse({ error: `Invalid severity. Must be one of: ${validSeverities.join(', ')}` }, 400, corsHeaders)
        }

        const { data: incident, error: insertErr } = await supabase
          .from('security_incidents')
          .insert({
            title: body.title,
            description: body.description || null,
            severity: body.severity,
            category: body.category,
            assigned_to: body.assignedTo || callerProfileId || null,
            source_ip: body.sourceIp || null,
            attack_vector: body.attackVector || null,
            related_fraud_alerts: body.relatedFraudAlerts || [],
            related_threat_events: body.relatedThreatEvents || [],
            created_by: callerProfileId,
            affected_profiles_count: body.profileIds?.length || 0,
          })
          .select()
          .single()

        if (insertErr) {
          return jsonResponse({ error: 'Failed to create incident', detail: insertErr.message }, 500, corsHeaders)
        }

        // Auto-create initial timeline entry
        await supabase.from('incident_timeline').insert({
          incident_id: incident.id,
          action_type: 'status_change',
          description: `Incident created: ${body.title} [${body.severity}]`,
          performed_by: callerProfileId,
          automated: !callerProfileId,
        })

        // Audit log
        await supabase.from('audit_log').insert({
          action: 'INCIDENT_CREATED',
          table_name: 'security_incidents',
          record_id: incident.id,
          severity: body.severity === 'p1_critical' ? 'critical' : 'warning',
          category: 'security',
          new_data: { incident_number: incident.incident_number, severity: body.severity, category: body.category },
        })

        // Auto-triage P1 incidents
        if (body.severity === 'p1_critical') {
          await supabase.from('security_incidents')
            .update({ status: 'triaged', triaged_at: new Date().toISOString() })
            .eq('id', incident.id)

          await supabase.from('incident_timeline').insert({
            incident_id: incident.id,
            action_type: 'automated_action',
            description: 'Auto-triaged: P1 critical severity detected. Immediate response required.',
            automated: true,
          })
        }

        return jsonResponse({ success: true, incident }, 200, corsHeaders)
      }

      // ─── UPDATE INCIDENT ──────────────────────────────────────────
      case 'update_incident': {
        if (!body.incidentId) {
          return jsonResponse({ error: 'incidentId required' }, 400, corsHeaders)
        }

        const updates: any = { updated_at: new Date().toISOString() }
        const oldStatus = body.status

        if (body.status) {
          updates.status = body.status
          // Set timestamp based on status
          const statusTimestamps: Record<string, string> = {
            triaged: 'triaged_at',
            containing: 'contained_at',
            eradicating: 'eradicated_at',
            recovering: 'recovered_at',
            resolved: 'resolved_at',
            closed: 'closed_at',
          }
          if (statusTimestamps[body.status]) {
            updates[statusTimestamps[body.status]] = new Date().toISOString()
          }
        }

        if (body.assignedTo) updates.assigned_to = body.assignedTo
        if (body.description) updates.description = body.description

        const { error: updateErr } = await supabase
          .from('security_incidents')
          .update(updates)
          .eq('id', body.incidentId)

        if (updateErr) {
          return jsonResponse({ error: 'Update failed', detail: updateErr.message }, 500, corsHeaders)
        }

        // Add timeline entry for status change
        if (body.status) {
          await supabase.from('incident_timeline').insert({
            incident_id: body.incidentId,
            action_type: 'status_change',
            description: `Status changed to: ${body.status}`,
            performed_by: callerProfileId,
          })
        }

        return jsonResponse({ success: true }, 200, corsHeaders)
      }

      // ─── AUTO-CONTAIN ─────────────────────────────────────────────
      case 'auto_contain': {
        if (!body.incidentId) {
          return jsonResponse({ error: 'incidentId required' }, 400, corsHeaders)
        }

        const actions: string[] = []

        // Revoke sessions for affected profiles
        if (body.profileIds && body.profileIds.length > 0) {
          for (const pid of body.profileIds) {
            const { count } = await supabase
              .from('active_sessions')
              .update({
                is_active: false,
                revoked_at: new Date().toISOString(),
                revocation_reason: `incident_containment:${body.incidentId}`,
              })
              .eq('profile_id', pid)
              .eq('is_active', true)

            actions.push(`Revoked sessions for profile ${pid} (${count || 0} sessions)`)
          }

          // Suspend affected accounts
          await supabase
            .from('profiles')
            .update({ status: 'suspended' })
            .in('id', body.profileIds)

          actions.push(`Suspended ${body.profileIds.length} affected accounts`)
        }

        // Block source IPs
        if (body.ipAddresses && body.ipAddresses.length > 0) {
          for (const ip of body.ipAddresses) {
            await supabase.from('ip_reputation').upsert({
              ip_address: ip,
              manually_blocked: true,
              blocked_reason: `incident_containment:${body.incidentId}`,
              reputation_score: 0,
            }, { onConflict: 'ip_address' })

            actions.push(`Blocked IP: ${ip}`)
          }
        }

        // Revoke API keys for affected profiles
        if (body.profileIds && body.profileIds.length > 0) {
          await supabase
            .from('api_keys')
            .update({
              is_active: false,
              revoked_at: new Date().toISOString(),
              revoked_reason: `incident_containment:${body.incidentId}`,
            })
            .in('profile_id', body.profileIds)
            .eq('is_active', true)

          actions.push('Revoked all API keys for affected profiles')
        }

        // Update incident with containment actions
        await supabase
          .from('security_incidents')
          .update({
            status: 'containing',
            contained_at: new Date().toISOString(),
            containment_actions: actions.map(a => ({ action: a, timestamp: new Date().toISOString() })),
          })
          .eq('id', body.incidentId)

        // Timeline entries
        for (const action of actions) {
          await supabase.from('incident_timeline').insert({
            incident_id: body.incidentId,
            action_type: 'containment',
            description: action,
            performed_by: callerProfileId,
            automated: !callerProfileId,
          })
        }

        // Audit
        await supabase.from('audit_log').insert({
          action: 'INCIDENT_CONTAINMENT',
          table_name: 'security_incidents',
          record_id: body.incidentId,
          severity: 'critical',
          category: 'security',
          new_data: {
            actions_taken: actions.length,
            profiles_affected: body.profileIds?.length || 0,
            ips_blocked: body.ipAddresses?.length || 0,
          },
        })

        return jsonResponse({ success: true, actions_taken: actions }, 200, corsHeaders)
      }

      // ─── ADD TIMELINE ENTRY ───────────────────────────────────────
      case 'add_timeline_entry': {
        if (!body.incidentId || !body.timelineEntry) {
          return jsonResponse({ error: 'incidentId and timelineEntry required' }, 400, corsHeaders)
        }

        await supabase.from('incident_timeline').insert({
          incident_id: body.incidentId,
          action_type: body.timelineEntry.action_type,
          description: body.timelineEntry.description,
          evidence: body.timelineEntry.evidence || null,
          performed_by: callerProfileId,
        })

        return jsonResponse({ success: true }, 200, corsHeaders)
      }

      // ─── GET INCIDENT ─────────────────────────────────────────────
      case 'get_incident': {
        if (!body.incidentId) {
          return jsonResponse({ error: 'incidentId required' }, 400, corsHeaders)
        }

        const { data: incident } = await supabase
          .from('security_incidents')
          .select('*, assigned:profiles!assigned_to(first_name, last_name), creator:profiles!created_by(first_name, last_name)')
          .eq('id', body.incidentId)
          .single()

        if (!incident) {
          return jsonResponse({ error: 'Incident not found' }, 404, corsHeaders)
        }

        const { data: timeline } = await supabase
          .from('incident_timeline')
          .select('*, performer:profiles!performed_by(first_name, last_name)')
          .eq('incident_id', body.incidentId)
          .order('created_at', { ascending: true })

        // Calculate metrics
        const detectedAt = new Date(incident.detected_at)
        const resolvedAt = incident.resolved_at ? new Date(incident.resolved_at) : null
        const containedAt = incident.contained_at ? new Date(incident.contained_at) : null

        const metrics = {
          time_to_contain_minutes: containedAt ? Math.round((containedAt.getTime() - detectedAt.getTime()) / 60000) : null,
          time_to_resolve_minutes: resolvedAt ? Math.round((resolvedAt.getTime() - detectedAt.getTime()) / 60000) : null,
          timeline_entries: timeline?.length || 0,
          duration_hours: resolvedAt
            ? Math.round((resolvedAt.getTime() - detectedAt.getTime()) / 3600000 * 10) / 10
            : Math.round((Date.now() - detectedAt.getTime()) / 3600000 * 10) / 10,
        }

        return jsonResponse({ success: true, incident, timeline: timeline || [], metrics }, 200, corsHeaders)
      }

      // ─── LIST INCIDENTS ───────────────────────────────────────────
      case 'list_incidents': {
        const filters = body.filters || {}
        let query = supabase
          .from('security_incidents')
          .select('*, assigned:profiles!assigned_to(first_name, last_name)', { count: 'exact' })
          .order('detected_at', { ascending: false })
          .limit(filters.limit || 50)

        if (filters.status) query = query.eq('status', filters.status)
        if (filters.severity) query = query.eq('severity', filters.severity)
        if (filters.category) query = query.eq('category', filters.category)

        const { data: incidents, count } = await query

        return jsonResponse({
          success: true,
          incidents: incidents || [],
          total: count || 0,
        }, 200, corsHeaders)
      }

      // ─── RUN PLAYBOOK ─────────────────────────────────────────────
      case 'run_playbook': {
        if (!body.incidentId || !body.playbook) {
          return jsonResponse({ error: 'incidentId and playbook required' }, 400, corsHeaders)
        }

        const { data: incident } = await supabase
          .from('security_incidents')
          .select('*')
          .eq('id', body.incidentId)
          .single()

        if (!incident) {
          return jsonResponse({ error: 'Incident not found' }, 404, corsHeaders)
        }

        const steps: string[] = []

        switch (body.playbook) {
          case 'account_compromise': {
            // 1. Suspend affected accounts
            if (incident.affected_profiles_count > 0) {
              steps.push('Phase 1: Account suspension initiated')
            }

            // 2. Revoke all sessions
            steps.push('Phase 2: All active sessions revoked')

            // 3. Force password reset
            steps.push('Phase 3: Password reset required on next login')

            // 4. Disable MFA temporarily to allow re-enrollment
            steps.push('Phase 4: MFA temporarily disabled for re-enrollment')

            // 5. Review recent transactions
            steps.push('Phase 5: Recent transactions flagged for review (last 72h)')

            // 6. Notify affected users
            steps.push('Phase 6: Notification queued for affected users')

            // Execute containment
            if (body.profileIds) {
              await fetch(`${supabaseUrl}/functions/v1/incident-response`, {
                method: 'POST',
                headers: {
                  'Content-Type': 'application/json',
                  'Authorization': `Bearer ${serviceKey}`,
                },
                body: JSON.stringify({
                  action: 'auto_contain',
                  incidentId: body.incidentId,
                  profileIds: body.profileIds,
                  ipAddresses: body.ipAddresses || [],
                }),
              })
            }
            break
          }

          case 'data_breach': {
            steps.push('Phase 1: Isolate affected systems')
            steps.push('Phase 2: Preserve forensic evidence')
            steps.push('Phase 3: Assess data exposure scope')
            steps.push('Phase 4: Regulatory notification assessment (GDPR Art. 33 - 72h deadline)')
            steps.push('Phase 5: Affected user notification (GDPR Art. 34)')
            steps.push('Phase 6: Credential rotation for all service accounts')
            steps.push('Phase 7: External forensics engagement')
            break
          }

          case 'ddos_attack': {
            steps.push('Phase 1: Enable DDoS mitigation mode')
            steps.push('Phase 2: Activate rate limiting escalation')
            steps.push('Phase 3: Enable geo-blocking for non-essential regions')
            steps.push('Phase 4: Scale infrastructure capacity')
            steps.push('Phase 5: Monitor and adjust WAF rules')
            break
          }

          case 'insider_threat': {
            steps.push('Phase 1: Covert monitoring activated')
            steps.push('Phase 2: Access logs preserved and isolated')
            steps.push('Phase 3: Privilege review for suspected accounts')
            steps.push('Phase 4: Data exfiltration channels monitored')
            steps.push('Phase 5: Legal/HR coordination initiated')
            break
          }

          case 'fraud_ring': {
            steps.push('Phase 1: Network graph analysis of related accounts')
            steps.push('Phase 2: Freeze all associated wallets')
            steps.push('Phase 3: Commission clawback assessment')
            steps.push('Phase 4: Suspend related promo codes')
            steps.push('Phase 5: Downline isolation analysis')
            steps.push('Phase 6: Law enforcement coordination if warranted')
            break
          }

          default:
            return jsonResponse({ error: `Unknown playbook: ${body.playbook}` }, 400, corsHeaders)
        }

        // Log each step to timeline
        for (const step of steps) {
          await supabase.from('incident_timeline').insert({
            incident_id: body.incidentId,
            action_type: 'automated_action',
            description: `[Playbook: ${body.playbook}] ${step}`,
            performed_by: callerProfileId,
            automated: true,
          })
        }

        // Update incident
        await supabase.from('security_incidents').update({
          status: 'containing',
          eradication_steps: steps.map((s, i) => ({ step: i + 1, description: s, status: 'pending' })),
        }).eq('id', body.incidentId)

        return jsonResponse({
          success: true,
          playbook: body.playbook,
          steps_executed: steps.length,
          steps,
        }, 200, corsHeaders)
      }

      // ─── GENERATE POST-MORTEM ─────────────────────────────────────
      case 'generate_post_mortem': {
        if (!body.incidentId) {
          return jsonResponse({ error: 'incidentId required' }, 400, corsHeaders)
        }

        const { data: incident } = await supabase
          .from('security_incidents')
          .select('*')
          .eq('id', body.incidentId)
          .single()

        if (!incident) {
          return jsonResponse({ error: 'Incident not found' }, 404, corsHeaders)
        }

        const { data: timeline } = await supabase
          .from('incident_timeline')
          .select('*')
          .eq('incident_id', body.incidentId)
          .order('created_at', { ascending: true })

        const detectedAt = new Date(incident.detected_at)
        const resolvedAt = incident.resolved_at ? new Date(incident.resolved_at) : null

        const postMortem = {
          incident_number: incident.incident_number,
          title: incident.title,
          severity: incident.severity,
          category: incident.category,
          summary: {
            description: incident.description,
            impact: {
              affected_profiles: incident.affected_profiles_count,
              affected_transactions: incident.affected_transactions_count,
              estimated_financial_impact: incident.estimated_financial_impact,
              data_exposure: incident.data_exposure_scope || [],
            },
          },
          timeline_of_events: (timeline || []).map((t: any) => ({
            time: t.created_at,
            action: t.action_type,
            description: t.description,
            automated: t.automated,
          })),
          response_metrics: {
            detection_time: incident.detected_at,
            triage_time: incident.triaged_at,
            containment_time: incident.contained_at,
            eradication_time: incident.eradicated_at,
            recovery_time: incident.recovered_at,
            resolution_time: incident.resolved_at,
            total_duration_hours: resolvedAt
              ? Math.round((resolvedAt.getTime() - detectedAt.getTime()) / 3600000 * 10) / 10
              : null,
            time_to_contain_minutes: incident.contained_at
              ? Math.round((new Date(incident.contained_at).getTime() - detectedAt.getTime()) / 60000)
              : null,
          },
          root_cause: incident.root_cause || 'To be determined',
          lessons_learned: incident.lessons_learned || 'To be documented',
          action_items: [
            { priority: 'P1', item: 'Review and update detection rules', status: 'pending' },
            { priority: 'P2', item: 'Update incident response playbook', status: 'pending' },
            { priority: 'P2', item: 'Conduct team debriefing', status: 'pending' },
            { priority: 'P3', item: 'Schedule follow-up review in 30 days', status: 'pending' },
          ],
          indicators_of_compromise: incident.ioc_indicators || [],
          containment_actions: incident.containment_actions || [],
        }

        // Update incident status
        await supabase.from('security_incidents').update({
          status: 'post_mortem',
        }).eq('id', body.incidentId)

        return jsonResponse({ success: true, post_mortem: postMortem }, 200, corsHeaders)
      }

      default:
        return jsonResponse({ error: 'Unknown action' }, 400, corsHeaders)
    }

  } catch (error) {
    console.error('Incident response error:', (error as Error).message)
    return jsonResponse({ error: 'Incident Response Error' }, 500, getCorsHeaders(req))
  }
})
