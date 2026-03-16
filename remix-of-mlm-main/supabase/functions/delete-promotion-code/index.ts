import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { getCorsHeaders, jsonResponse, authenticateRequest, authenticateServiceCall, getSupabaseAdmin } from '../_shared/auth.ts'

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

    const { codeId }: { codeId: string } = await req.json()

    if (!codeId) {
      return jsonResponse({ error: 'Code ID erforderlich' }, 400, corsHeaders)
    }

    // Get current code for validation and audit log
    const { data: currentCode } = await supabase
      .from('promotion_codes')
      .select('*')
      .eq('id', codeId)
      .single()

    if (!currentCode) {
      return jsonResponse({ error: 'Code nicht gefunden' }, 404, corsHeaders)
    }

    // Partners can only delete their own codes, admins can delete any
    if (!hasAdminRole && currentCode.partner_id !== profileId) {
      return jsonResponse({ error: 'Sie können nur Ihre eigenen Codes löschen' }, 403, corsHeaders)
    }

    // Delete the code
    const { error: deleteError } = await supabase
      .from('promotion_codes')
      .delete()
      .eq('id', codeId)

    if (deleteError) throw deleteError

    // Log to audit
    await supabase.from('audit_log').insert({
      action: 'PROMOTION_CODE_DELETED',
      table_name: 'promotion_codes',
      record_id: codeId,
      user_id: profileId,
      old_data: currentCode,
    })

    console.log(`Promotion code ${currentCode.code} deleted by user ${profileId}`)

    return jsonResponse({ success: true, deletedCode: currentCode.code }, 200, corsHeaders)

  } catch (error) {
    console.error('Delete promotion code error:', error)
    return jsonResponse({ error: 'Fehler beim Löschen des Codes' }, 500, corsHeaders)
  }
})
