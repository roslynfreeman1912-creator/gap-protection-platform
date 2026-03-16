import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { getCorsHeaders, jsonResponse, authenticateRequest, getSupabaseAdmin } from '../_shared/auth.ts'

serve(async (req) => {
  const corsHeaders = getCorsHeaders(req)

  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders })
  }

  try {
    const { supabase } = getSupabaseAdmin()

    // Authenticate and require admin role
    const authResult = await authenticateRequest(req, corsHeaders, { requiredRole: 'admin' })
    if (authResult.response) return authResult.response
    
    // Get all users with partner or admin role
    const { data: partnerRoles, error: rolesError } = await supabase
      .from('user_roles')
      .select('user_id')
      .in('role', ['partner', 'admin'])
    
    if (rolesError) throw rolesError
    
    const partnerIds = [...new Set(partnerRoles?.map(r => r.user_id) || [])]
    
    if (partnerIds.length === 0) {
      return new Response(
        JSON.stringify({ partners: [] }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }
    
    // Get partner profiles
    const { data: partners, error: profilesError } = await supabase
      .from('profiles')
      .select('id, first_name, last_name, email')
      .in('id', partnerIds)
      .order('last_name')
    
    if (profilesError) throw profilesError
    
    return new Response(
      JSON.stringify({ partners: partners || [] }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
    
  } catch (error) {
    console.error('Get partners list error:', error)
    return new Response(
      JSON.stringify({ error: 'Fehler beim Laden der Partner' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})
