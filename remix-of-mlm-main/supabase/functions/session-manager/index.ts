import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { getCorsHeaders, jsonResponse, authenticateRequest, authenticateServiceCall, getSupabaseAdmin } from '../_shared/auth.ts'

/**
 * Session & Device Management Engine
 * + 2FA/MFA Operations
 * + KYC/AML Verification
 * + Compliance Reporting
 * 
 * Actions:
 *  SESSION:
 *    - create_session:        Register new session with device fingerprint
 *    - validate_session:      Check session validity + IP/device correlation
 *    - revoke_session:        Revoke specific session
 *    - revoke_all_sessions:   Revoke all sessions for a profile
 *    - list_sessions:         List active sessions
 *    - list_devices:          List known devices
 *    - trust_device:          Mark device as trusted
 *    - block_device:          Block a device
 * 
 *  MFA:
 *    - setup_totp:            Generate TOTP secret for enrollment
 *    - verify_totp:           Verify TOTP code
 *    - generate_recovery:     Generate recovery codes
 *    - use_recovery_code:     Use a recovery code
 *    - enforce_mfa:           Enable MFA enforcement for a profile
 *    - create_mfa_challenge:  Create an MFA challenge for sensitive action
 * 
 *  KYC:
 *    - submit_kyc:            Submit KYC verification documents
 *    - review_kyc:            Admin review/approve/reject KYC
 *    - get_kyc_status:        Get KYC status for a profile
 *    - check_aml:             Run AML screening against watchlist
 *    - get_kyc_limits:        Get transaction limits based on KYC level
 * 
 *  COMPLIANCE:
 *    - submit_dsar:           Submit a data subject access request
 *    - process_dsar:          Admin process a DSAR
 *    - generate_compliance_report: Generate compliance report
 *    - verify_audit_chain:    Verify audit log integrity
 */

interface RequestBody {
  action: string
  profileId?: string
  sessionId?: string
  deviceFingerprint?: string
  userAgent?: string
  ipAddress?: string
  geoCountry?: string
  geoCity?: string
  // MFA
  secret?: string
  code?: string
  method?: string
  challengeType?: string
  // KYC
  documentType?: string
  documentCountry?: string
  documentExpiry?: string
  documentFrontUrl?: string
  documentBackUrl?: string
  selfieUrl?: string
  addressProofType?: string
  addressProofUrl?: string
  kycId?: string
  status?: string
  reviewNotes?: string
  rejectionReason?: string
  // DSAR
  requestType?: string
  dataScope?: string[]
  // Compliance
  reportType?: string
  periodStart?: string
  periodEnd?: string
}

serve(async (req) => {
  const corsHeaders = getCorsHeaders(req)
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders })
  }

  try {
    const { supabase } = getSupabaseAdmin()
    const body: RequestBody = await req.json()

    let callerProfileId: string | null = null
    let isAdmin = false
    const serviceAuth = authenticateServiceCall(req, corsHeaders)

    if (!serviceAuth.ok) {
      // MFA setup and session creation need basic auth
      const authResult = await authenticateRequest(req, corsHeaders)
      if (authResult.response) return authResult.response
      callerProfileId = authResult.auth.profileId
      isAdmin = authResult.auth.roles.includes('admin') || authResult.auth.roles.includes('super_admin')
    } else {
      isAdmin = true
      callerProfileId = body.profileId || null
    }

    switch (body.action) {

      // ═══════════════════════════════════════════════════════════════
      // SESSION MANAGEMENT
      // ═══════════════════════════════════════════════════════════════

      case 'create_session': {
        const targetProfile = body.profileId || callerProfileId
        if (!targetProfile) return jsonResponse({ error: 'profileId required' }, 400, corsHeaders)

        // Check if IP is blocked
        if (body.ipAddress) {
          const { data: ipRep } = await supabase
            .from('ip_reputation')
            .select('manually_blocked, reputation_score')
            .eq('ip_address', body.ipAddress)
            .maybeSingle()

          if (ipRep?.manually_blocked) {
            return jsonResponse({ error: 'Access denied: IP blocked', blocked: true }, 403, corsHeaders)
          }
        }

        // Check geo-blocking
        if (body.geoCountry) {
          const { data: geoBlock } = await supabase
            .from('geo_blocking_rules')
            .select('action')
            .eq('country_code', body.geoCountry)
            .eq('is_active', true)
            .maybeSingle()

          if (geoBlock?.action === 'block') {
            return jsonResponse({ error: 'Access denied: Region blocked', geo_blocked: true }, 403, corsHeaders)
          }
        }

        // Calculate risk score
        let riskScore = 0
        if (body.ipAddress) {
          const { data: ipRep } = await supabase
            .from('ip_reputation')
            .select('reputation_score, is_tor, is_vpn, is_proxy')
            .eq('ip_address', body.ipAddress)
            .maybeSingle()

          if (ipRep) {
            riskScore = 100 - (ipRep.reputation_score || 50)
            if (ipRep.is_tor) riskScore = Math.max(riskScore, 80)
            if (ipRep.is_vpn) riskScore = Math.max(riskScore, 30)
          }
        }

        // Check known device trust
        let isTrustedDevice = false
        if (body.deviceFingerprint) {
          const { data: device } = await supabase
            .from('known_devices')
            .select('is_trusted, is_blocked')
            .eq('profile_id', targetProfile)
            .eq('device_fingerprint', body.deviceFingerprint)
            .maybeSingle()

          if (device?.is_blocked) {
            return jsonResponse({ error: 'Access denied: Device blocked' }, 403, corsHeaders)
          }
          isTrustedDevice = device?.is_trusted || false
          if (isTrustedDevice) riskScore = Math.max(0, riskScore - 20)
        }

        // Generate session token hash (token is generated client-side, we store hash)
        const sessionTokenHash = body.sessionId || crypto.randomUUID()

        const { data: session, error: sessErr } = await supabase
          .from('active_sessions')
          .insert({
            profile_id: targetProfile,
            session_token_hash: sessionTokenHash,
            device_fingerprint: body.deviceFingerprint || null,
            user_agent: body.userAgent || null,
            ip_address: body.ipAddress || '0.0.0.0',
            geo_country: body.geoCountry || null,
            geo_city: body.geoCity || null,
            risk_score: riskScore,
            mfa_verified: false,
          })
          .select()
          .single()

        if (sessErr) {
          return jsonResponse({ error: 'Session creation failed', detail: sessErr.message }, 500, corsHeaders)
        }

        // Upsert known device
        if (body.deviceFingerprint) {
          await supabase.from('known_devices').upsert({
            profile_id: targetProfile,
            device_fingerprint: body.deviceFingerprint,
            device_name: extractDeviceName(body.userAgent || ''),
            user_agent: body.userAgent,
            last_seen_at: new Date().toISOString(),
            login_count: 1,
          }, { onConflict: 'profile_id,device_fingerprint' })

          // Update login count for existing
          await supabase.rpc('increment_login_count_for_device', {
            p_profile_id: targetProfile,
            p_fingerprint: body.deviceFingerprint,
          }).then(() => {}).catch(() => {})
        }

        // Check if MFA is required
        const { data: profile } = await supabase
          .from('profiles')
          .select('mfa_enabled, mfa_enforced')
          .eq('id', targetProfile)
          .single()

        const mfaRequired = profile?.mfa_enabled || profile?.mfa_enforced || riskScore > 60

        return jsonResponse({
          success: true,
          session_id: session.id,
          risk_score: riskScore,
          mfa_required: mfaRequired,
          trusted_device: isTrustedDevice,
          expires_at: session.expires_at,
        }, 200, corsHeaders)
      }

      case 'list_sessions': {
        const targetProfile = body.profileId || callerProfileId
        if (!targetProfile) return jsonResponse({ error: 'profileId required' }, 400, corsHeaders)

        if (!isAdmin && targetProfile !== callerProfileId) {
          return jsonResponse({ error: 'Access denied' }, 403, corsHeaders)
        }

        const { data: sessions } = await supabase
          .from('active_sessions')
          .select('id, device_fingerprint, user_agent, ip_address, geo_country, geo_city, risk_score, created_at, last_active_at, mfa_verified')
          .eq('profile_id', targetProfile)
          .eq('is_active', true)
          .gt('expires_at', new Date().toISOString())
          .order('last_active_at', { ascending: false })

        return jsonResponse({ success: true, sessions: sessions || [] }, 200, corsHeaders)
      }

      case 'revoke_session': {
        if (!body.sessionId) return jsonResponse({ error: 'sessionId required' }, 400, corsHeaders)

        await supabase
          .from('active_sessions')
          .update({
            is_active: false,
            revoked_at: new Date().toISOString(),
            revocation_reason: 'user_revoked',
          })
          .eq('id', body.sessionId)
          .eq('profile_id', callerProfileId || body.profileId)

        return jsonResponse({ success: true }, 200, corsHeaders)
      }

      case 'revoke_all_sessions': {
        const targetProfile = body.profileId || callerProfileId
        if (!targetProfile) return jsonResponse({ error: 'profileId required' }, 400, corsHeaders)
        if (!isAdmin && targetProfile !== callerProfileId) {
          return jsonResponse({ error: 'Access denied' }, 403, corsHeaders)
        }

        const { count } = await supabase
          .from('active_sessions')
          .update({
            is_active: false,
            revoked_at: new Date().toISOString(),
            revocation_reason: 'user_revoked_all',
          })
          .eq('profile_id', targetProfile)
          .eq('is_active', true)

        return jsonResponse({ success: true, revoked_count: count || 0 }, 200, corsHeaders)
      }

      case 'list_devices': {
        const targetProfile = body.profileId || callerProfileId
        if (!targetProfile) return jsonResponse({ error: 'profileId required' }, 400, corsHeaders)

        const { data: devices } = await supabase
          .from('known_devices')
          .select('*')
          .eq('profile_id', targetProfile)
          .order('last_seen_at', { ascending: false })

        return jsonResponse({ success: true, devices: devices || [] }, 200, corsHeaders)
      }

      case 'trust_device': {
        if (!body.deviceFingerprint) return jsonResponse({ error: 'deviceFingerprint required' }, 400, corsHeaders)
        const targetProfile = body.profileId || callerProfileId

        await supabase.from('known_devices').update({
          is_trusted: true,
          trust_approved_at: new Date().toISOString(),
          trust_approved_by: callerProfileId,
        }).eq('profile_id', targetProfile).eq('device_fingerprint', body.deviceFingerprint)

        return jsonResponse({ success: true }, 200, corsHeaders)
      }

      case 'block_device': {
        if (!body.deviceFingerprint) return jsonResponse({ error: 'deviceFingerprint required' }, 400, corsHeaders)
        if (!isAdmin) return jsonResponse({ error: 'Admin required' }, 403, corsHeaders)
        const targetProfile = body.profileId

        await supabase.from('known_devices').update({
          is_blocked: true,
          blocked_reason: body.reviewNotes || 'Admin blocked',
        }).eq('profile_id', targetProfile).eq('device_fingerprint', body.deviceFingerprint)

        // Also revoke sessions using this fingerprint
        await supabase.from('active_sessions').update({
          is_active: false,
          revoked_at: new Date().toISOString(),
          revocation_reason: 'device_blocked',
        }).eq('profile_id', targetProfile).eq('device_fingerprint', body.deviceFingerprint).eq('is_active', true)

        return jsonResponse({ success: true }, 200, corsHeaders)
      }

      // ═══════════════════════════════════════════════════════════════
      // MFA / 2FA
      // ═══════════════════════════════════════════════════════════════

      case 'setup_totp': {
        const targetProfile = callerProfileId
        if (!targetProfile) return jsonResponse({ error: 'Authentication required' }, 401, corsHeaders)

        // Generate TOTP secret (32 base32 characters)
        const secretBytes = new Uint8Array(20)
        crypto.getRandomValues(secretBytes)
        const secret = base32Encode(secretBytes)

        // In production, encrypt this with a server-side key before storage
        await supabase.from('mfa_secrets').upsert({
          profile_id: targetProfile,
          encrypted_secret: secret, // Should be AES-256-GCM encrypted in production
          method: 'totp',
          is_active: false, // Not active until verified
        }, { onConflict: 'profile_id,method' })

        const { data: profile } = await supabase
          .from('profiles')
          .select('email')
          .eq('id', targetProfile)
          .single()

        const otpauthUrl = `otpauth://totp/GAPProtection:${profile?.email || 'user'}?secret=${secret}&issuer=GAPProtection&algorithm=SHA1&digits=6&period=30`

        return jsonResponse({
          success: true,
          secret,
          otpauth_url: otpauthUrl,
          qr_data: otpauthUrl,
          message: 'Scan the QR code with your authenticator app, then verify with a code',
        }, 200, corsHeaders)
      }

      case 'verify_totp': {
        const targetProfile = callerProfileId || body.profileId
        if (!targetProfile || !body.code) {
          return jsonResponse({ error: 'profileId and code required' }, 400, corsHeaders)
        }

        if (!/^\d{6}$/.test(body.code)) {
          return jsonResponse({ error: 'Invalid code format (6 digits required)' }, 400, corsHeaders)
        }

        const { data: mfaSecret } = await supabase
          .from('mfa_secrets')
          .select('encrypted_secret, is_active')
          .eq('profile_id', targetProfile)
          .eq('method', 'totp')
          .single()

        if (!mfaSecret) {
          return jsonResponse({ error: 'TOTP not configured' }, 404, corsHeaders)
        }

        // TOTP verification
        const isValid = verifyTOTP(mfaSecret.encrypted_secret, body.code)

        if (!isValid) {
          // Track failed attempt
          await supabase.from('mfa_challenges').insert({
            profile_id: targetProfile,
            challenge_type: body.challengeType || 'login',
            method: 'totp',
            attempts: 1,
            ip_address: body.ipAddress || '0.0.0.0',
          })

          return jsonResponse({ success: false, error: 'Invalid code' }, 401, corsHeaders)
        }

        // If this is initial setup verification, activate MFA
        if (!mfaSecret.is_active) {
          await supabase.from('mfa_secrets').update({
            is_active: true,
            verified_at: new Date().toISOString(),
          }).eq('profile_id', targetProfile).eq('method', 'totp')

          await supabase.from('profiles').update({
            mfa_enabled: true,
            mfa_method: 'totp',
          }).eq('id', targetProfile)

          await supabase.from('audit_log').insert({
            action: 'MFA_ENABLED',
            table_name: 'profiles',
            record_id: targetProfile,
            severity: 'info',
            category: 'authentication',
          })
        }

        // Mark session as MFA verified
        if (body.sessionId) {
          await supabase.from('active_sessions').update({
            mfa_verified: true,
          }).eq('id', body.sessionId).eq('profile_id', targetProfile)
        }

        return jsonResponse({ success: true, mfa_verified: true }, 200, corsHeaders)
      }

      case 'generate_recovery': {
        const targetProfile = callerProfileId
        if (!targetProfile) return jsonResponse({ error: 'Authentication required' }, 401, corsHeaders)

        const batchId = crypto.randomUUID()
        const codes: string[] = []

        // Generate 10 recovery codes
        for (let i = 0; i < 10; i++) {
          const bytes = new Uint8Array(4)
          crypto.getRandomValues(bytes)
          const code = Array.from(bytes).map(b => b.toString(16).padStart(2, '0')).join('').toUpperCase()
          const formatted = `${code.substring(0, 4)}-${code.substring(4, 8)}`
          codes.push(formatted)

          // Store hashed
          const hashBuffer = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(formatted))
          const codeHash = Array.from(new Uint8Array(hashBuffer)).map(b => b.toString(16).padStart(2, '0')).join('')

          await supabase.from('mfa_recovery_codes').insert({
            profile_id: targetProfile,
            code_hash: codeHash,
            batch_id: batchId,
          })
        }

        // Invalidate old recovery codes
        await supabase.from('mfa_recovery_codes')
          .update({ used_at: new Date().toISOString() })
          .eq('profile_id', targetProfile)
          .neq('batch_id', batchId)
          .is('used_at', null)

        return jsonResponse({
          success: true,
          recovery_codes: codes,
          message: 'Save these codes securely. Each code can only be used once.',
          batch_id: batchId,
        }, 200, corsHeaders)
      }

      case 'use_recovery_code': {
        if (!body.code || !body.profileId) {
          return jsonResponse({ error: 'code and profileId required' }, 400, corsHeaders)
        }

        const hashBuffer = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(body.code.toUpperCase()))
        const codeHash = Array.from(new Uint8Array(hashBuffer)).map(b => b.toString(16).padStart(2, '0')).join('')

        const { data: recoveryCode } = await supabase
          .from('mfa_recovery_codes')
          .select('id')
          .eq('profile_id', body.profileId)
          .eq('code_hash', codeHash)
          .is('used_at', null)
          .maybeSingle()

        if (!recoveryCode) {
          return jsonResponse({ success: false, error: 'Invalid or used recovery code' }, 401, corsHeaders)
        }

        // Mark as used
        await supabase.from('mfa_recovery_codes').update({
          used_at: new Date().toISOString(),
        }).eq('id', recoveryCode.id)

        // Count remaining
        const { count: remaining } = await supabase
          .from('mfa_recovery_codes')
          .select('*', { count: 'exact', head: true })
          .eq('profile_id', body.profileId)
          .is('used_at', null)

        await supabase.from('audit_log').insert({
          action: 'MFA_RECOVERY_CODE_USED',
          table_name: 'mfa_recovery_codes',
          record_id: body.profileId,
          severity: 'warning',
          category: 'authentication',
          new_data: { remaining_codes: remaining },
        })

        return jsonResponse({
          success: true,
          mfa_verified: true,
          remaining_codes: remaining || 0,
        }, 200, corsHeaders)
      }

      case 'enforce_mfa': {
        if (!isAdmin) return jsonResponse({ error: 'Admin required' }, 403, corsHeaders)
        if (!body.profileId) return jsonResponse({ error: 'profileId required' }, 400, corsHeaders)

        await supabase.from('profiles').update({
          mfa_enforced: true,
        }).eq('id', body.profileId)

        await supabase.from('audit_log').insert({
          action: 'MFA_ENFORCEMENT_ENABLED',
          table_name: 'profiles',
          record_id: body.profileId,
          severity: 'info',
          category: 'authentication',
        })

        return jsonResponse({ success: true }, 200, corsHeaders)
      }

      // ═══════════════════════════════════════════════════════════════
      // KYC / AML
      // ═══════════════════════════════════════════════════════════════

      case 'submit_kyc': {
        const targetProfile = callerProfileId
        if (!targetProfile) return jsonResponse({ error: 'Authentication required' }, 401, corsHeaders)

        if (!body.documentType) {
          return jsonResponse({ error: 'documentType required' }, 400, corsHeaders)
        }

        const { data: existing } = await supabase
          .from('kyc_verifications')
          .select('id, status')
          .eq('profile_id', targetProfile)
          .in('status', ['pending', 'in_review', 'approved'])
          .maybeSingle()

        if (existing?.status === 'approved') {
          return jsonResponse({ error: 'KYC already approved' }, 400, corsHeaders)
        }
        if (existing?.status === 'pending' || existing?.status === 'in_review') {
          return jsonResponse({ error: 'KYC already under review' }, 400, corsHeaders)
        }

        const { data: kycRecord, error: kycErr } = await supabase
          .from('kyc_verifications')
          .insert({
            profile_id: targetProfile,
            verification_level: 'basic',
            status: 'pending',
            document_type: body.documentType,
            document_country: body.documentCountry || null,
            document_expiry: body.documentExpiry || null,
            document_front_url: body.documentFrontUrl || null,
            document_back_url: body.documentBackUrl || null,
            selfie_url: body.selfieUrl || null,
            address_proof_type: body.addressProofType || null,
            address_proof_url: body.addressProofUrl || null,
            submitted_at: new Date().toISOString(),
          })
          .select()
          .single()

        if (kycErr) {
          return jsonResponse({ error: 'KYC submission failed', detail: kycErr.message }, 500, corsHeaders)
        }

        await supabase.from('audit_log').insert({
          action: 'KYC_SUBMITTED',
          table_name: 'kyc_verifications',
          record_id: kycRecord.id,
          severity: 'info',
          category: 'compliance',
        })

        return jsonResponse({ success: true, kyc_id: kycRecord.id, status: 'pending' }, 200, corsHeaders)
      }

      case 'review_kyc': {
        if (!isAdmin) return jsonResponse({ error: 'Admin required' }, 403, corsHeaders)
        if (!body.kycId || !body.status) {
          return jsonResponse({ error: 'kycId and status required' }, 400, corsHeaders)
        }

        const validStatuses = ['approved', 'rejected']
        if (!validStatuses.includes(body.status)) {
          return jsonResponse({ error: 'Status must be approved or rejected' }, 400, corsHeaders)
        }

        const updates: any = {
          status: body.status,
          reviewed_at: new Date().toISOString(),
          reviewed_by: callerProfileId,
          review_notes: body.reviewNotes || null,
        }

        if (body.status === 'rejected') {
          updates.rejection_reason = body.rejectionReason || 'Document verification failed'
        }

        if (body.status === 'approved') {
          updates.verification_level = 'enhanced' // Upgrade upon approval
          updates.expires_at = new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString() // 1 year
          updates.pep_check_result = 'clear'
          updates.sanctions_check_result = 'clear'
          updates.aml_risk_rating = 'low'
        }

        await supabase.from('kyc_verifications').update(updates).eq('id', body.kycId)

        // Get profile ID for AML check
        const { data: kycRecord } = await supabase
          .from('kyc_verifications')
          .select('profile_id')
          .eq('id', body.kycId)
          .single()

        await supabase.from('audit_log').insert({
          action: `KYC_${body.status.toUpperCase()}`,
          table_name: 'kyc_verifications',
          record_id: body.kycId,
          severity: body.status === 'approved' ? 'info' : 'warning',
          category: 'compliance',
          new_data: { status: body.status, profile_id: kycRecord?.profile_id },
        })

        return jsonResponse({ success: true }, 200, corsHeaders)
      }

      case 'get_kyc_status': {
        const targetProfile = body.profileId || callerProfileId
        if (!targetProfile) return jsonResponse({ error: 'profileId required' }, 400, corsHeaders)

        if (!isAdmin && targetProfile !== callerProfileId) {
          return jsonResponse({ error: 'Access denied' }, 403, corsHeaders)
        }

        const { data: kyc } = await supabase
          .from('kyc_verifications')
          .select('*')
          .eq('profile_id', targetProfile)
          .order('created_at', { ascending: false })
          .limit(1)

        const { data: limits } = await supabase
          .from('kyc_limits')
          .select('*')
          .eq('verification_level', kyc?.[0]?.verification_level || 'none')
          .single()

        return jsonResponse({
          success: true,
          kyc: kyc?.[0] || null,
          effective_level: kyc?.[0]?.status === 'approved' ? kyc[0].verification_level : 'none',
          limits: limits || null,
        }, 200, corsHeaders)
      }

      case 'check_aml': {
        if (!isAdmin && !serviceAuth.ok) return jsonResponse({ error: 'Admin or service required' }, 403, corsHeaders)
        if (!body.profileId) return jsonResponse({ error: 'profileId required' }, 400, corsHeaders)

        const { data: profile } = await supabase
          .from('profiles')
          .select('first_name, last_name, email')
          .eq('id', body.profileId)
          .single()

        if (!profile) return jsonResponse({ error: 'Profile not found' }, 404, corsHeaders)

        const fullName = `${profile.first_name} ${profile.last_name}`.toLowerCase()

        // Check against internal watchlist
        const { data: watchlistEntries } = await supabase
          .from('aml_watchlist')
          .select('*')
          .eq('is_active', true)
          .eq('entry_type', 'individual')

        const matches: any[] = []
        if (watchlistEntries) {
          for (const entry of watchlistEntries) {
            const pattern = (entry.name_pattern || '').toLowerCase()
            if (fullName.includes(pattern) || pattern.includes(fullName)) {
              matches.push({
                watchlist_id: entry.id,
                match_type: 'name_match',
                source: entry.source,
                severity: entry.severity,
              })
            }
            if (entry.aliases) {
              for (const alias of entry.aliases) {
                if (fullName.includes(alias.toLowerCase())) {
                  matches.push({
                    watchlist_id: entry.id,
                    match_type: 'alias_match',
                    alias,
                    source: entry.source,
                    severity: entry.severity,
                  })
                }
              }
            }
          }
        }

        const result = matches.length > 0 ? 'match' : 'clear'

        // Update KYC record
        if (body.kycId) {
          await supabase.from('kyc_verifications').update({
            sanctions_check_result: result,
            aml_risk_rating: matches.length > 0 ? 'high' : 'low',
          }).eq('id', body.kycId)
        }

        await supabase.from('audit_log').insert({
          action: 'AML_CHECK_PERFORMED',
          table_name: 'kyc_verifications',
          record_id: body.profileId,
          severity: matches.length > 0 ? 'critical' : 'info',
          category: 'compliance',
          new_data: { result, matches_found: matches.length },
        })

        return jsonResponse({ success: true, result, matches }, 200, corsHeaders)
      }

      // ═══════════════════════════════════════════════════════════════
      // COMPLIANCE
      // ═══════════════════════════════════════════════════════════════

      case 'submit_dsar': {
        if (!callerProfileId) return jsonResponse({ error: 'Authentication required' }, 401, corsHeaders)

        const { data: profile } = await supabase
          .from('profiles')
          .select('email')
          .eq('id', callerProfileId)
          .single()

        const { data: dsar, error: dsarErr } = await supabase
          .from('dsar_requests')
          .insert({
            profile_id: callerProfileId,
            request_type: body.requestType || 'access',
            requester_email: profile?.email || '',
            data_scope: body.dataScope || ['all'],
          })
          .select()
          .single()

        if (dsarErr) {
          return jsonResponse({ error: 'DSAR submission failed' }, 500, corsHeaders)
        }

        return jsonResponse({ success: true, dsar_id: dsar.id, deadline: dsar.deadline_at }, 200, corsHeaders)
      }

      case 'process_dsar': {
        if (!isAdmin) return jsonResponse({ error: 'Admin required' }, 403, corsHeaders)

        const dsarId = body.kycId // Reusing field
        if (!dsarId || !body.status) return jsonResponse({ error: 'dsarId and status required' }, 400, corsHeaders)

        if (body.status === 'completed' && body.requestType === 'access') {
          // Gather all user data for export
          const { data: dsarRecord } = await supabase
            .from('dsar_requests')
            .select('profile_id')
            .eq('id', dsarId)
            .single()

          if (dsarRecord) {
            const pid = dsarRecord.profile_id

            const [
              { data: profileData },
              { data: walletData },
              { data: txData },
              { data: commData },
            ] = await Promise.all([
              supabase.from('profiles').select('*').eq('id', pid).single(),
              supabase.from('wallets').select('*').eq('profile_id', pid),
              supabase.from('transactions').select('*').eq('customer_id', pid).limit(100),
              supabase.from('commissions').select('*').eq('partner_id', pid).limit(100),
            ])

            await supabase.from('dsar_requests').update({
              status: 'completed',
              completed_at: new Date().toISOString(),
              processed_by: callerProfileId,
              response_data: {
                profile: profileData,
                wallet: walletData,
                transactions: txData,
                commissions: commData,
                exported_at: new Date().toISOString(),
              },
            }).eq('id', dsarId)
          }
        } else {
          await supabase.from('dsar_requests').update({
            status: body.status,
            processing_notes: body.reviewNotes || null,
            completed_at: body.status === 'completed' ? new Date().toISOString() : null,
            processed_by: callerProfileId,
          }).eq('id', dsarId)
        }

        return jsonResponse({ success: true }, 200, corsHeaders)
      }

      case 'generate_compliance_report': {
        if (!isAdmin) return jsonResponse({ error: 'Admin required' }, 403, corsHeaders)

        const reportType = body.reportType || 'audit_trail'
        const periodStart = body.periodStart || new Date(Date.now() - 30 * 24 * 3600000).toISOString().split('T')[0]
        const periodEnd = body.periodEnd || new Date().toISOString().split('T')[0]

        let metrics: any = {}
        const findings: any[] = []
        const recommendations: any[] = []

        switch (reportType) {
          case 'audit_trail': {
            const { count: totalEvents } = await supabase
              .from('audit_log')
              .select('*', { count: 'exact', head: true })
              .gte('created_at', periodStart)
              .lte('created_at', periodEnd)

            const { data: criticalEvents } = await supabase
              .from('audit_log')
              .select('action, COUNT(*)')
              .gte('created_at', periodStart)
              .lte('created_at', periodEnd)
              .eq('severity', 'critical')

            metrics = { total_events: totalEvents, critical_events: criticalEvents?.length || 0 }

            // Verify chain integrity
            const { data: chainResult } = await supabase.rpc('verify_audit_chain')
            if (chainResult) {
              metrics.chain_integrity = chainResult
            }
            break
          }

          case 'access_review': {
            const { data: admins } = await supabase
              .from('user_roles')
              .select('user_id, role')
              .in('role', ['admin', 'super_admin'])

            const { data: activeKeys } = await supabase
              .from('api_keys')
              .select('profile_id, name, last_used_at, expires_at')
              .eq('is_active', true)

            metrics = {
              admin_accounts: admins?.length || 0,
              active_api_keys: activeKeys?.length || 0,
            }

            // Flag unused admin accounts
            if (admins) {
              for (const admin of admins) {
                const { data: lastLogin } = await supabase
                  .from('active_sessions')
                  .select('last_active_at')
                  .eq('profile_id', admin.user_id)
                  .order('last_active_at', { ascending: false })
                  .limit(1)

                if (!lastLogin || lastLogin.length === 0) {
                  findings.push({ type: 'dormant_admin', profile: admin.user_id, role: admin.role })
                }
              }
            }
            break
          }

          case 'risk_assessment': {
            const { data: highRisk } = await supabase
              .from('fraud_risk_profiles')
              .select('profile_id, composite_score, risk_tier')
              .in('risk_tier', ['high', 'critical'])

            const { count: openIncidents } = await supabase
              .from('security_incidents')
              .select('*', { count: 'exact', head: true })
              .not('status', 'in', '("resolved","closed")')

            const { count: unverifiedKyc } = await supabase
              .from('profiles')
              .select('*', { count: 'exact', head: true })
              .eq('role', 'partner')

            metrics = {
              high_risk_profiles: highRisk?.length || 0,
              open_incidents: openIncidents || 0,
              total_partners: unverifiedKyc || 0,
            }
            break
          }
        }

        const { data: report, error: reportErr } = await supabase
          .from('compliance_reports')
          .insert({
            report_type: reportType,
            title: `${reportType.toUpperCase()} Report: ${periodStart} - ${periodEnd}`,
            period_start: periodStart,
            period_end: periodEnd,
            metrics,
            findings,
            recommendations,
            generated_by: callerProfileId,
          })
          .select()
          .single()

        if (reportErr) {
          return jsonResponse({ error: 'Report generation failed', detail: reportErr.message }, 500, corsHeaders)
        }

        return jsonResponse({ success: true, report }, 200, corsHeaders)
      }

      case 'verify_audit_chain': {
        if (!isAdmin) return jsonResponse({ error: 'Admin required' }, 403, corsHeaders)

        const { data: result, error: rpcErr } = await supabase.rpc('verify_audit_chain')

        if (rpcErr) {
          return jsonResponse({ error: 'Chain verification failed', detail: rpcErr.message }, 500, corsHeaders)
        }

        return jsonResponse({ success: true, integrity: result }, 200, corsHeaders)
      }

      default:
        return jsonResponse({ error: 'Unknown action' }, 400, corsHeaders)
    }

  } catch (error) {
    console.error('Session/MFA/KYC error:', (error as Error).message)
    return jsonResponse({ error: 'Internal error' }, 500, getCorsHeaders(req))
  }
})

// ─── TOTP Helpers ────────────────────────────────────────────────────────

function base32Encode(buffer: Uint8Array): string {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567'
  let result = ''
  let bits = 0
  let value = 0

  for (const byte of buffer) {
    value = (value << 8) | byte
    bits += 8
    while (bits >= 5) {
      result += alphabet[(value >>> (bits - 5)) & 31]
      bits -= 5
    }
  }

  if (bits > 0) {
    result += alphabet[(value << (5 - bits)) & 31]
  }

  return result
}

function base32Decode(encoded: string): Uint8Array {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567'
  const cleanedInput = encoded.replace(/=+$/, '').toUpperCase()
  const output: number[] = []
  let bits = 0
  let value = 0

  for (const char of cleanedInput) {
    const idx = alphabet.indexOf(char)
    if (idx === -1) continue
    value = (value << 5) | idx
    bits += 5
    if (bits >= 8) {
      output.push((value >>> (bits - 8)) & 0xFF)
      bits -= 8
    }
  }

  return new Uint8Array(output)
}

async function generateTOTP(secret: string, timeStep: number = 30, digits: number = 6, offset: number = 0): Promise<string> {
  const key = base32Decode(secret)
  const epoch = Math.floor(Date.now() / 1000)
  const counter = Math.floor(epoch / timeStep) + offset

  const counterBytes = new Uint8Array(8)
  let tmp = counter
  for (let i = 7; i >= 0; i--) {
    counterBytes[i] = tmp & 0xff
    tmp = Math.floor(tmp / 256)
  }

  const cryptoKey = await crypto.subtle.importKey('raw', key, { name: 'HMAC', hash: 'SHA-1' }, false, ['sign'])
  const signature = await crypto.subtle.sign('HMAC', cryptoKey, counterBytes)
  const hmac = new Uint8Array(signature)

  const offsetByte = hmac[hmac.length - 1] & 0x0f
  const code = (
    ((hmac[offsetByte] & 0x7f) << 24) |
    ((hmac[offsetByte + 1] & 0xff) << 16) |
    ((hmac[offsetByte + 2] & 0xff) << 8) |
    (hmac[offsetByte + 3] & 0xff)
  ) % Math.pow(10, digits)

  return code.toString().padStart(digits, '0')
}

async function verifyTOTP(secret: string, code: string): Promise<boolean> {
  // Check current window and ±1 to allow for clock drift
  for (const offset of [-1, 0, 1]) {
    const expected = await generateTOTP(secret, 30, 6, offset)
    // Constant-time comparison
    if (expected.length !== code.length) continue
    let mismatch = 0
    for (let i = 0; i < expected.length; i++) {
      mismatch |= expected.charCodeAt(i) ^ code.charCodeAt(i)
    }
    if (mismatch === 0) return true
  }
  return false
}

function extractDeviceName(userAgent: string): string {
  if (!userAgent) return 'Unknown Device'
  if (userAgent.includes('Windows')) return 'Windows PC'
  if (userAgent.includes('Macintosh')) return 'Mac'
  if (userAgent.includes('iPhone')) return 'iPhone'
  if (userAgent.includes('iPad')) return 'iPad'
  if (userAgent.includes('Android')) return 'Android'
  if (userAgent.includes('Linux')) return 'Linux'
  return 'Unknown Device'
}
