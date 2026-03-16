import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { getCorsHeaders, jsonResponse, authenticateRequest, authenticateServiceCall, getSupabaseAdmin } from '../_shared/auth.ts'

serve(async (req) => {
  const corsHeaders = getCorsHeaders(req)

  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders })
  }

  try {
    // Authenticated: any role (partners see own codes, admins see all)
    const authResult = await authenticateRequest(req, corsHeaders)
    if (authResult.response) return authResult.response

    const { profileId, roles } = authResult.auth
    const isAdmin = roles.includes('admin') || roles.includes('super_admin')

    const { supabase } = getSupabaseAdmin()

    if (!isAdmin) {
      // Partners see their own codes
      const { data: codes } = await supabase
        .from('promotion_codes')
        .select('*')
        .eq('partner_id', profileId)
        .order('created_at', { ascending: false })

      return jsonResponse({ codes: codes || [] }, 200, corsHeaders)
    }

    // Admin: Get all codes with partner info
    const { data: codes, error } = await supabase
      .from('promotion_codes')
      .select(`
        *,
        partner:profiles!partner_id (
          first_name,
          last_name,
          email
        )
      `)
      .order('created_at', { ascending: false })

    if (error) throw error

    return jsonResponse({ codes: codes || [] }, 200, corsHeaders)

  } catch (error) {
    console.error('Get promotion codes error:', error)
    return jsonResponse({ error: 'Fehler beim Laden der Codes' }, 500, corsHeaders)
  }
})
