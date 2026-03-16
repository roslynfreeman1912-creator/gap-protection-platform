import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { getCorsHeaders, jsonResponse, authenticateRequest, authenticateServiceCall, getSupabaseAdmin } from '../_shared/auth.ts'

/**
 * Centralized API for ALL security dashboard mutations.
 * Replaces 30+ direct frontend supabase.from().insert/update/delete calls.
 * Every mutation goes through auth + validation + audit logging.
 */

const ALLOWED_TABLES: Record<string, { insert?: boolean; update?: boolean; delete?: boolean; fields?: string[] }> = {
  protected_domains: { insert: true, update: true, delete: true, fields: ['domain', 'profile_id', 'protection_status', 'waf_enabled', 'ddos_protection', 'ssl_managed', 'activated_at'] },
  waf_rules: { insert: true, update: true, delete: true, fields: ['domain_id', 'rule_name', 'rule_type', 'pattern', 'action', 'is_active', 'priority', 'description'] },
  cache_settings: { insert: true, update: true, fields: ['domain_id', 'cache_level', 'browser_ttl', 'edge_ttl', 'development_mode', 'always_online', 'minify_js', 'minify_css', 'minify_html'] },
  ip_access_rules: { insert: true, delete: true, fields: ['domain_id', 'ip_address', 'action', 'notes'] },
  rate_limit_rules: { insert: true, update: true, delete: true, fields: ['domain_id', 'url_pattern', 'requests_per_period', 'period_seconds', 'action', 'action_timeout', 'methods', 'description', 'is_active'] },
  bot_management_config: { insert: true, update: true, fields: ['domain_id', 'bot_fight_mode', 'super_bot_fight_mode', 'javascript_detection', 'verified_bots_allowed', 'ai_bots_action', 'static_resource_protection', 'challenge_passage_ttl', 'custom_bot_rules', 'known_good_bots'] },
  ddos_protection_config: { insert: true, update: true, fields: ['domain_id', 'sensitivity_level', 'challenge_passage_ttl', 'under_attack_mode', 'layer7_protection', 'layer3_4_protection', 'syn_flood_protection', 'udp_flood_protection', 'dns_amplification_protection', 'slowloris_protection', 'http_flood_threshold', 'auto_mitigation', 'alert_on_attack'] },
  compliance_checks: { insert: true, update: true, fields: ['domain_id', 'framework', 'control_id', 'control_name', 'category', 'description', 'status', 'evidence', 'evidence_url', 'responsible', 'last_assessed_at', 'next_review_at', 'notes', 'risk_level', 'automated'] },
  dns_records: { insert: true, update: true, delete: true, fields: ['domain_id', 'record_type', 'name', 'content', 'ttl', 'proxied', 'priority'] },
  email_security_config: { insert: true, update: true, fields: ['domain_id', 'spf_record', 'spf_status', 'dkim_enabled', 'dkim_selector', 'dkim_public_key', 'dmarc_policy', 'dmarc_rua', 'dmarc_ruf', 'dmarc_percentage', 'dane_enabled', 'mta_sts_enabled', 'mta_sts_mode', 'bimi_enabled', 'bimi_logo_url', 'anti_phishing_enabled', 'quarantine_suspicious', 'scan_attachments', 'block_executables', 'spoofing_protection'] },
  security_incidents: { insert: true, update: true, fields: ['domain_id', 'title', 'severity', 'status', 'description', 'resolved_at', 'resolution_notes'] },
  page_rules: { insert: true, update: true, delete: true, fields: ['domain_id', 'url_pattern', 'actions', 'is_active', 'priority'] },
  security_reports: { insert: true, fields: ['report_type', 'profile_id', 'domain_id', 'period_start', 'period_end'] },
  ssl_certificates: { insert: true, update: true, fields: ['domain_id', 'certificate_type', 'status', 'auto_renew', 'min_tls_version'] },
  threat_intel_feeds: { insert: true, delete: true, fields: ['domain_id', 'feed_name', 'feed_url', 'feed_type', 'is_active'] },
  vulnerability_findings: { insert: true, update: true, fields: ['domain_id', 'title', 'severity', 'status', 'description', 'remediation', 'resolved_at'] },
  zero_trust_policies: { insert: true, update: true, delete: true, fields: ['domain_id', 'name', 'description', 'policy_type', 'conditions', 'action', 'require_mfa', 'require_device_posture', 'allowed_countries', 'blocked_countries', 'allowed_ip_ranges', 'session_duration', 'risk_score_threshold', 'is_active', 'priority'] },
  firewall_analytics: { insert: true, update: true, fields: ['domain_id', 'date', 'total_requests', 'blocked_requests', 'challenged_requests'] },
  security_assets: { insert: true, update: true, fields: ['profile_id', 'asset_name', 'asset_type', 'os_type', 'ip_address', 'mac_address', 'hostname', 'location', 'status', 'protection_level', 'risk_score', 'tags'] },
  threat_events: { insert: true, update: true, fields: ['asset_id', 'profile_id', 'event_type', 'severity', 'title', 'description', 'source_ip', 'destination_ip', 'attack_vector', 'action_taken', 'mitre_tactic', 'mitre_technique', 'ioc_type', 'ioc_value', 'confidence_score', 'is_false_positive', 'resolved_at', 'resolution_notes'] },
  security_alerts: { insert: true, update: true, fields: ['threat_event_id', 'asset_id', 'profile_id', 'alert_type', 'severity', 'title', 'description', 'status', 'priority', 'assigned_to', 'resolved_at', 'resolution'] },
  threat_intel: { insert: true, update: true, fields: ['indicator_type', 'indicator_value', 'threat_type', 'severity', 'confidence', 'source', 'description', 'tags', 'is_active', 'created_by'] },
  support_tickets: { insert: true, fields: ['profile_id', 'subject', 'message', 'priority', 'status'] },
  chat_messages: { insert: true, fields: ['profile_id', 'ticket_id', 'role', 'content'] },

  // ══════ Enterprise Security Tables ══════
  fraud_risk_profiles: { insert: true, update: true, fields: ['profile_id', 'composite_score', 'velocity_score', 'behavioral_score', 'network_score', 'device_score', 'financial_score', 'identity_score', 'risk_factors', 'is_frozen'] },
  fraud_rules: { insert: true, update: true, fields: ['rule_name', 'description', 'category', 'condition_sql', 'score_weight', 'threshold', 'cooldown_minutes', 'is_active'] },
  fraud_rule_triggers: { insert: true, fields: ['rule_id', 'profile_id', 'score_contribution', 'context_data'] },
  siem_correlated_alerts: { insert: true, update: true, fields: ['rule_name', 'severity', 'description', 'correlated_events', 'recommended_action', 'status', 'resolved_at'] },
  siem_correlation_rules: { insert: true, update: true, fields: ['rule_name', 'description', 'event_pattern', 'time_window_minutes', 'min_events', 'severity', 'is_active'] },
  ioc_database: { insert: true, update: true, fields: ['indicator_type', 'indicator_value', 'threat_type', 'severity', 'source', 'description', 'is_active', 'tags', 'first_seen', 'last_seen'] },
  ip_reputation: { insert: true, update: true, fields: ['ip_address', 'reputation_score', 'is_tor', 'is_vpn', 'is_proxy', 'is_datacenter', 'abuse_reports', 'country_code', 'last_checked'] },
  geo_blocking_rules: { insert: true, update: true, delete: true, fields: ['country_code', 'country_name', 'action', 'reason', 'is_active'] },
  kyc_verifications: { insert: true, update: true, fields: ['profile_id', 'kyc_level', 'status', 'full_name', 'date_of_birth', 'nationality', 'country', 'address', 'document_type', 'document_number', 'reviewer_notes', 'reviewed_at', 'reviewed_by'] },
  aml_watchlist: { insert: true, update: true, fields: ['entity_name', 'entity_type', 'source', 'risk_level', 'aliases', 'description', 'is_active'] },
  active_sessions: { insert: true, update: true, fields: ['profile_id', 'is_active', 'revoked_at', 'revoke_reason'] },
  known_devices: { insert: true, update: true, fields: ['profile_id', 'device_fingerprint', 'device_name', 'is_trusted', 'is_blocked', 'block_reason'] },
  dsar_requests: { insert: true, update: true, fields: ['profile_id', 'request_type', 'status', 'completed_at', 'response_data'] },
  data_classification_policies: { insert: true, update: true, fields: ['table_name', 'column_name', 'classification', 'retention_days', 'requires_encryption', 'mask_in_logs'] },
  compliance_reports: { insert: true, update: true, fields: ['report_type', 'status', 'generated_by', 'report_data', 'generated_at'] },
  api_keys: { insert: true, update: true, fields: ['profile_id', 'key_name', 'permissions', 'is_active', 'revoked_at', 'rate_limit_per_minute'] },
  notification_channels: { insert: true, update: true, delete: true, fields: ['channel_type', 'channel_name', 'config', 'is_active'] },
  notification_rules: { insert: true, update: true, delete: true, fields: ['channel_id', 'event_type', 'severity_filter', 'is_active'] },
  incident_timeline: { insert: true, fields: ['incident_id', 'entry_type', 'description', 'actor_id', 'metadata'] },
  vulnerability_templates: { insert: true, update: true, delete: true, fields: ['name', 'type', 'severity', 'cve_id', 'description', 'payloads', 'paths', 'methods', 'headers', 'matchers', 'target', 'source_file', 'is_active'] },
}

// Tables that ONLY admins can mutate (not regular users)
const ADMIN_ONLY_TABLES = new Set([
  'waf_rules', 'protected_domains', 'security_assets', 'threat_events',
  'security_alerts', 'threat_intel', 'compliance_checks',
  'fraud_risk_profiles', 'fraud_rules', 'siem_correlated_alerts', 'siem_correlation_rules',
  'ioc_database', 'ip_reputation', 'geo_blocking_rules', 'kyc_verifications', 'aml_watchlist',
  'data_classification_policies', 'compliance_reports', 'api_keys',
  'notification_channels', 'notification_rules', 'incident_timeline',
  'vulnerability_templates',
])

serve(async (req) => {
  const corsHeaders = getCorsHeaders(req)
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders })
  }

  try {
    const { supabase } = getSupabaseAdmin()

    // AUTH: Authenticate before parsing body
    const serviceAuth = authenticateServiceCall(req, corsHeaders)
    let authProfileId = ''
    let isAdmin = false
    if (!serviceAuth.ok) {
      const authResult = await authenticateRequest(req, corsHeaders)
      if (authResult.response) return authResult.response
      authProfileId = authResult.auth.profileId
      isAdmin = authResult.auth.roles.includes('admin') || authResult.auth.roles.includes('super_admin') || authResult.auth.role === 'admin'
    } else {
      isAdmin = true
    }

    const { action, table, id, data, records } = await req.json()

    // Validate table is allowed
    if (!table || !ALLOWED_TABLES[table]) {
      return jsonResponse({ error: 'Ungültige Tabelle' }, 400, corsHeaders)
    }

    const tableConfig = ALLOWED_TABLES[table]

    // Admin-only tables require admin role
    if (ADMIN_ONLY_TABLES.has(table) && !isAdmin) {
      return jsonResponse({ error: 'Nur Administratoren erlaubt' }, 403, corsHeaders)
    }

    // Sanitize data: only allow whitelisted fields
    function sanitize(input: Record<string, unknown>): Record<string, unknown> {
      const safe: Record<string, unknown> = {}
      for (const field of tableConfig.fields || []) {
        if (input[field] !== undefined) safe[field] = input[field]
      }
      return safe
    }

    switch (action) {
      case 'insert': {
        if (!tableConfig.insert) return jsonResponse({ error: 'INSERT nicht erlaubt' }, 403, corsHeaders)

        // Support batch insert
        const rows = records ? records.map(sanitize) : [sanitize(data || {})]
        if (rows.length === 0) return jsonResponse({ error: 'Keine Daten' }, 400, corsHeaders)

        const { data: result, error } = await supabase.from(table).insert(rows).select()
        if (error) throw error

        await supabase.from('audit_log').insert({
          action: `SECURITY_API_INSERT`,
          table_name: table,
          record_id: result?.[0]?.id || 'batch',
          new_data: { count: rows.length, by: authProfileId || 'service' },
        })

        return jsonResponse({ success: true, data: result }, 200, corsHeaders)
      }

      case 'update': {
        if (!tableConfig.update) return jsonResponse({ error: 'UPDATE nicht erlaubt' }, 403, corsHeaders)
        if (!id) return jsonResponse({ error: 'ID erforderlich' }, 400, corsHeaders)

        const safeData = sanitize(data || {})
        const { data: result, error } = await supabase.from(table).update(safeData).eq('id', id).select()
        if (error) throw error

        await supabase.from('audit_log').insert({
          action: `SECURITY_API_UPDATE`,
          table_name: table,
          record_id: id,
          new_data: { fields: Object.keys(safeData), by: authProfileId || 'service' },
        })

        return jsonResponse({ success: true, data: result }, 200, corsHeaders)
      }

      case 'upsert': {
        if (!tableConfig.insert && !tableConfig.update) return jsonResponse({ error: 'UPSERT nicht erlaubt' }, 403, corsHeaders)

        const rows = records ? records.map(sanitize) : [sanitize(data || {})]
        const { data: result, error } = await supabase.from(table).upsert(rows).select()
        if (error) throw error

        return jsonResponse({ success: true, data: result }, 200, corsHeaders)
      }

      case 'delete': {
        if (!tableConfig.delete) return jsonResponse({ error: 'DELETE nicht erlaubt' }, 403, corsHeaders)
        if (!id) return jsonResponse({ error: 'ID erforderlich' }, 400, corsHeaders)

        const { error } = await supabase.from(table).delete().eq('id', id)
        if (error) throw error

        await supabase.from('audit_log').insert({
          action: `SECURITY_API_DELETE`,
          table_name: table,
          record_id: id,
          new_data: { by: authProfileId || 'service' },
        })

        return jsonResponse({ success: true }, 200, corsHeaders)
      }

      default:
        return jsonResponse({ error: 'Ungültige Aktion' }, 400, corsHeaders)
    }

  } catch (error) {
    console.error('Security Dashboard API error:', (error as Error).message)
    return jsonResponse({ error: 'Interner Fehler' }, 500, getCorsHeaders(req))
  }
})
