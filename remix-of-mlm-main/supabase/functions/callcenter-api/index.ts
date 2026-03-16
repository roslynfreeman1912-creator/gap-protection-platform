import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { getCorsHeaders, jsonResponse, authenticateRequest, authenticateServiceCall, getSupabaseAdmin } from '../_shared/auth.ts'

/**
 * Centralized API for CallCenter mutations.
 * Replaces direct frontend mutations in CallCenterManager.tsx.
 */

serve(async (req) => {
  const corsHeaders = getCorsHeaders(req)
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders })
  }

  try {
    const { supabase } = getSupabaseAdmin()

    // AUTH
    const serviceAuth = authenticateServiceCall(req, corsHeaders)
    if (!serviceAuth.ok) {
      const authResult = await authenticateRequest(req, corsHeaders, { allowedRoles: ['admin', 'super_admin', 'callcenter'] })
      if (authResult.response) return authResult.response
    }

    const { action, ...params } = await req.json()

    switch (action) {
      case 'upsert_callcenter': {
        const { id, data } = params
        const safe = {
          name: data?.name, owner_id: data?.owner_id, phone: data?.phone,
          email: data?.email, address: data?.address, is_active: data?.is_active,
        }
        if (id) {
          const { data: result, error } = await supabase.from('call_centers').update(safe).eq('id', id).select().single()
          if (error) throw error
          return jsonResponse({ success: true, data: result }, 200, corsHeaders)
        } else {
          const { data: result, error } = await supabase.from('call_centers').insert(safe).select().single()
          if (error) throw error
          // Auto-assign role
          if (data?.owner_id) {
            await supabase.from('user_roles').upsert({ user_id: data.owner_id, role: 'callcenter' }, { onConflict: 'user_id,role' })
          }
          return jsonResponse({ success: true, data: result }, 200, corsHeaders)
        }
      }

      case 'upsert_employee': {
        const { id, data } = params
        const safe = {
          call_center_id: data?.call_center_id, profile_id: data?.profile_id,
          role: data?.role, is_active: data?.is_active,
        }
        if (id) {
          const { data: result, error } = await supabase.from('call_center_employees').update(safe).eq('id', id).select().single()
          if (error) throw error
          return jsonResponse({ success: true, data: result }, 200, corsHeaders)
        } else {
          const { data: result, error } = await supabase.from('call_center_employees').insert(safe).select().single()
          if (error) throw error
          return jsonResponse({ success: true, data: result }, 200, corsHeaders)
        }
      }

      case 'upsert_lead': {
        const { id, data } = params
        const safe = {
          call_center_id: data?.call_center_id, first_name: data?.first_name,
          last_name: data?.last_name, email: data?.email, phone: data?.phone,
          status: data?.status, notes: data?.notes, assigned_to: data?.assigned_to,
        }
        if (id) {
          const { data: result, error } = await supabase.from('leads').update(safe).eq('id', id).select().single()
          if (error) throw error
          return jsonResponse({ success: true, data: result }, 200, corsHeaders)
        } else {
          const { data: result, error } = await supabase.from('leads').insert(safe).select().single()
          if (error) throw error
          return jsonResponse({ success: true, data: result }, 200, corsHeaders)
        }
      }

      case 'delete_callcenter': {
        const { id } = params
        if (!id) return jsonResponse({ error: 'ID erforderlich' }, 400, corsHeaders)
        const { error } = await supabase.from('call_centers').delete().eq('id', id)
        if (error) throw error
        await supabase.from('audit_log').insert({ action: 'CALLCENTER_DELETED', table_name: 'call_centers', record_id: id })
        return jsonResponse({ success: true }, 200, corsHeaders)
      }

      case 'delete_employee': {
        const { id } = params
        if (!id) return jsonResponse({ error: 'ID erforderlich' }, 400, corsHeaders)
        const { error } = await supabase.from('call_center_employees').delete().eq('id', id)
        if (error) throw error
        return jsonResponse({ success: true }, 200, corsHeaders)
      }

      case 'delete_lead': {
        const { id } = params
        if (!id) return jsonResponse({ error: 'ID erforderlich' }, 400, corsHeaders)
        const { error } = await supabase.from('leads').delete().eq('id', id)
        if (error) throw error
        return jsonResponse({ success: true }, 200, corsHeaders)
      }

      default:
        return jsonResponse({ error: 'Ungültige Aktion' }, 400, corsHeaders)
    }

  } catch (error) {
    console.error('CallCenter API error:', (error as Error).message)
    return jsonResponse({ error: 'Interner Fehler' }, 500, getCorsHeaders(req))
  }
})
