import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { getCorsHeaders, jsonResponse, authenticateRequest, authenticateServiceCall, getSupabaseAdmin } from '../_shared/auth.ts'

interface PromoteRequest {
  profileId: string
}

serve(async (req) => {
  const corsHeaders = getCorsHeaders(req)

  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders })
  }

  try {
    // ADMIN only (or service call)
    const serviceAuth = authenticateServiceCall(req, corsHeaders)
    if (!serviceAuth.ok) {
      const authResult = await authenticateRequest(req, corsHeaders, { allowedRoles: ['admin', 'super_admin'] })
      if (authResult.response) return authResult.response
    }

    const { supabase } = getSupabaseAdmin()

    const { profileId }: PromoteRequest = await req.json()

    if (!profileId) {
      return jsonResponse({ error: 'Profil-ID erforderlich' }, 400, corsHeaders)
    }

    // Call the promote function
    const { data: result, error: promoteError } = await supabase
      .rpc('promote_to_partner', { _profile_id: profileId })

    if (promoteError) {
      console.error('Promote error:', promoteError)
      return jsonResponse({ error: 'Beförderung fehlgeschlagen' }, 500, corsHeaders)
    }

    // Get the generated promotion code
    const { data: promoCode } = await supabase
      .from('promotion_codes')
      .select('code')
      .eq('partner_id', profileId)
      .single()

    return jsonResponse({
      success: true,
      message: 'Benutzer wurde zum Partner befördert',
      promotionCode: promoCode?.code
    }, 200, corsHeaders)

  } catch (error) {
    console.error('Promote partner error:', error)
    return jsonResponse({ error: 'Interner Serverfehler' }, 500, corsHeaders)
  }
})
