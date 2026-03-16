import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { getCorsHeaders, jsonResponse, authenticateRequest, authenticateServiceCall, getSupabaseAdmin } from '../_shared/auth.ts'

interface ActivateRequest {
  profileId: string
  transactionId?: string
}

// Activate contract after payment confirmation
serve(async (req) => {
  const corsHeaders = getCorsHeaders(req)
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders })
  }

  try {
    const { supabase, url: supabaseUrl, key: supabaseServiceKey } = getSupabaseAdmin()

    // AUTH: Only admins or service-to-service calls
    const serviceAuth = authenticateServiceCall(req, corsHeaders)
    if (!serviceAuth.ok) {
      const authResult = await authenticateRequest(req, corsHeaders, { allowedRoles: ['admin', 'super_admin'] })
      if (authResult.response) return authResult.response
    }

    const { profileId, transactionId }: ActivateRequest = await req.json()

    if (!profileId) {
      return jsonResponse({ error: 'Profil-ID erforderlich' }, 400, corsHeaders)
    }

    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('id, status, domain')
      .eq('id', profileId)
      .single()

    if (profileError || !profile) {
      return jsonResponse({ error: 'Profil nicht gefunden' }, 404, corsHeaders)
    }

    if (profile.status === 'active') {
      return jsonResponse({
        success: true,
        message: 'Vertrag ist bereits aktiv',
        alreadyActive: true
      }, 200, corsHeaders)
    }

    const { error: updateError } = await supabase
      .from('profiles')
      .update({
        status: 'active',
        updated_at: new Date().toISOString()
      })
      .eq('id', profileId)

    if (updateError) {
      throw updateError
    }

    if (transactionId) {
      await fetch(`${supabaseUrl}/functions/v1/calculate-commissions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${supabaseServiceKey}`,
        },
        body: JSON.stringify({ transactionId }),
      })
    }

    try {
      await fetch(`${supabaseUrl}/functions/v1/send-welcome-email`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${supabaseServiceKey}`,
        },
        body: JSON.stringify({ profileId, type: 'payment_confirmed' }),
      })
    } catch (_emailError) {
      // Non-critical
    }

    await supabase.from('audit_log').insert({
      action: 'CONTRACT_ACTIVATED',
      table_name: 'profiles',
      record_id: profileId,
      new_data: {
        previous_status: profile.status,
        new_status: 'active',
        transaction_id: transactionId
      },
    })

    return jsonResponse({
      success: true,
      message: 'Vertrag wurde aktiviert',
      profile: { id: profileId, status: 'active', domain: profile.domain }
    }, 200, corsHeaders)

  } catch (error) {
    console.error('Activate contract error:', (error as Error).message)
    return jsonResponse({ error: 'Vertragsaktivierung fehlgeschlagen' }, 500, getCorsHeaders(req))
  }
})
