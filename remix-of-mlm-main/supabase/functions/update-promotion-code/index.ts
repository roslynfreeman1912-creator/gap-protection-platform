import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { getCorsHeaders, jsonResponse, authenticateRequest, authenticateServiceCall, getSupabaseAdmin } from '../_shared/auth.ts'

interface UpdateCodeRequest {
  codeId: string
  isActive?: boolean
  maxUses?: number | null
  expiresAt?: string | null
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

    const { codeId, isActive, maxUses, expiresAt }: UpdateCodeRequest = await req.json()

    if (!codeId) {
      return jsonResponse({ error: 'Code ID erforderlich' }, 400, corsHeaders)
    }

    // Get current code
    const { data: currentCode } = await supabase
      .from('promotion_codes')
      .select('*')
      .eq('id', codeId)
      .single()

    if (!currentCode) {
      return jsonResponse({ error: 'Code nicht gefunden' }, 404, corsHeaders)
    }

    // Build update object
    const updates: Record<string, any> = {}
    if (typeof isActive === 'boolean') updates.is_active = isActive
    if (maxUses !== undefined) updates.max_uses = maxUses
    if (expiresAt !== undefined) updates.expires_at = expiresAt ? new Date(expiresAt).toISOString() : null

    // Update the code
    const { data: updatedCode, error: updateError } = await supabase
      .from('promotion_codes')
      .update(updates)
      .eq('id', codeId)
      .select()
      .single()

    if (updateError) throw updateError

    // Log to audit
    await supabase.from('audit_log').insert({
      action: 'PROMOTION_CODE_UPDATED',
      table_name: 'promotion_codes',
      record_id: codeId,
      old_data: currentCode,
      new_data: updatedCode,
    })

    return jsonResponse({ success: true, code: updatedCode }, 200, corsHeaders)

  } catch (error) {
    console.error('Update promotion code error:', error)
    return jsonResponse({ error: 'Fehler beim Aktualisieren des Codes' }, 500, corsHeaders)
  }
})
