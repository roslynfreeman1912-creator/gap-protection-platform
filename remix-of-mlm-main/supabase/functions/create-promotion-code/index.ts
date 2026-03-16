import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { getCorsHeaders, jsonResponse, authenticateRequest, authenticateServiceCall, getSupabaseAdmin } from '../_shared/auth.ts'

interface CreateCodeRequest {
  code: string
  partnerId?: string // Optional - if not provided, use authenticated user's profile
  maxUses?: number | null
  expiresAt?: string | null
}

serve(async (req) => {
  const corsHeaders = getCorsHeaders(req)

  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders })
  }

  try {
    // Authenticated: admin or partner
    const authResult = await authenticateRequest(req, corsHeaders, { allowedRoles: ['admin', 'super_admin', 'partner'] })
    if (authResult.response) return authResult.response

    const { profileId, roles } = authResult.auth
    const hasAdminRole = roles.includes('admin') || roles.includes('super_admin')

    const { supabase } = getSupabaseAdmin()

    const { code, partnerId, maxUses, expiresAt }: CreateCodeRequest = await req.json()

    if (!code) {
      return jsonResponse({ error: 'Code ist erforderlich' }, 400, corsHeaders)
    }

    // Validate code format: GP-XXXXXX (alphanumeric, 3-20 chars after GP-)
    const codeUpper = code.toUpperCase().trim()
    if (!/^GP-[A-Z0-9]{3,20}$/.test(codeUpper)) {
      return jsonResponse({ error: 'Code muss im Format GP-XXXXXX sein (3-20 Zeichen, nur Buchstaben und Zahlen)' }, 400, corsHeaders)
    }

    // Determine the target partner ID
    let targetPartnerId = profileId // Default: create for self

    if (partnerId && partnerId !== profileId) {
      // Only admins can create codes for other partners
      if (!hasAdminRole) {
        return jsonResponse({ error: 'Nur Admins können Codes für andere Partner erstellen' }, 403, corsHeaders)
      }

      // Verify partner exists
      const { data: partner } = await supabase
        .from('profiles')
        .select('id')
        .eq('id', partnerId)
        .single()

      if (!partner) {
        return jsonResponse({ error: 'Partner nicht gefunden' }, 404, corsHeaders)
      }

      targetPartnerId = partnerId
    }

    // Check if code already exists
    const { data: existing } = await supabase
      .from('promotion_codes')
      .select('id')
      .eq('code', codeUpper)
      .single()

    if (existing) {
      return jsonResponse({ error: 'Dieser Code existiert bereits. Bitte wählen Sie einen anderen.' }, 400, corsHeaders)
    }

    // Create the code
    const { data: newCode, error: insertError } = await supabase
      .from('promotion_codes')
      .insert({
        code: codeUpper,
        partner_id: targetPartnerId,
        max_uses: maxUses || null,
        expires_at: expiresAt ? new Date(expiresAt).toISOString() : null,
        is_active: true,
        usage_count: 0,
      })
      .select()
      .single()

    if (insertError) {
      console.error('Insert error:', insertError)
      throw insertError
    }

    // Log to audit
    await supabase.from('audit_log').insert({
      action: 'PROMOTION_CODE_CREATED',
      table_name: 'promotion_codes',
      record_id: newCode.id,
      user_id: profileId,
      new_data: {
        code: newCode.code,
        partnerId: targetPartnerId,
        createdBy: profileId,
        maxUses,
        expiresAt
      },
    })

    console.log(`Promotion code ${newCode.code} created by ${profileId} for partner ${targetPartnerId}`)

    return jsonResponse({ success: true, code: newCode }, 200, corsHeaders)

  } catch (error) {
    console.error('Create promotion code error:', error)
    return jsonResponse({ error: 'Fehler beim Erstellen des Codes' }, 500, corsHeaders)
  }
})
