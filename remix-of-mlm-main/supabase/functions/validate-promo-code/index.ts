import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { getCorsHeaders, jsonResponse, getSupabaseAdmin, checkRateLimit } from '../_shared/auth.ts'

interface ValidateRequest {
  code: string
}

// Public endpoint (used during registration) but rate-limited and returns minimal data
serve(async (req) => {
  const corsHeaders = getCorsHeaders(req)
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders })
  }

  try {
    const clientIp = req.headers.get('x-forwarded-for') || 'unknown'
    if (!checkRateLimit(`validate-promo:${clientIp}`, 20, 60_000)) {
      return jsonResponse({ valid: false, error: 'Zu viele Anfragen' }, 429, corsHeaders)
    }

    const { supabase } = getSupabaseAdmin()
    const { code }: ValidateRequest = await req.json()

    if (!code) {
      return jsonResponse({ valid: false, error: 'Promotion Code erforderlich' }, 200, corsHeaders)
    }

    const normalizedCode = code.toUpperCase().trim()

    const { data: promoData, error: promoError } = await supabase
      .from('promotion_codes')
      .select(`
        id, code, partner_id, is_active, max_uses, usage_count, expires_at,
        partner:profiles!partner_id ( id, first_name, last_name )
      `)
      .eq('code', normalizedCode)
      .single()

    if (promoError || !promoData) {
      return jsonResponse({ valid: false, error: 'Promotion Code nicht gefunden' }, 200, corsHeaders)
    }

    if (!promoData.is_active) {
      return jsonResponse({ valid: false, error: 'Promotion Code ist nicht mehr aktiv' }, 200, corsHeaders)
    }

    if (promoData.max_uses && promoData.usage_count >= promoData.max_uses) {
      return jsonResponse({ valid: false, error: 'Promotion Code hat maximale Verwendungen erreicht' }, 200, corsHeaders)
    }

    if (promoData.expires_at && new Date(promoData.expires_at) < new Date()) {
      return jsonResponse({ valid: false, error: 'Promotion Code ist abgelaufen' }, 200, corsHeaders)
    }

    const partner = promoData.partner as any

    // Return minimal info - no email, no internal IDs
    // Privacy: only expose first name initial + last name to avoid leaking full identity
    let partnerDisplay = 'Partner'
    if (partner) {
      const firstInitial = partner.first_name ? partner.first_name.charAt(0) + '.' : ''
      const lastName = partner.last_name || ''
      partnerDisplay = `${firstInitial} ${lastName}`.trim() || 'Partner'
    }

    return jsonResponse({
      valid: true,
      code: promoData.code,
      partnerName: partnerDisplay,
    }, 200, corsHeaders)

  } catch (error) {
    console.error('Validate promo code error:', (error as Error).message)
    return jsonResponse({ valid: false, error: 'Validierung fehlgeschlagen' }, 200, getCorsHeaders(req))
  }
})
