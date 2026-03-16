import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { getCorsHeaders, jsonResponse, authenticateRequest, getSupabaseAdmin } from '../_shared/auth.ts'

serve(async (req) => {
  const corsHeaders = getCorsHeaders(req)
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders })

  try {
    const { supabase } = getSupabaseAdmin()

    const authResult = await authenticateRequest(req, corsHeaders, {
      allowedRoles: ['cc_broker', 'admin', 'super_admin']
    })
    if (authResult.response) return authResult.response
    const { auth } = authResult

    const isAdmin = auth.roles.includes('admin') || auth.roles.includes('super_admin')
    const isBroker = auth.roles.includes('cc_broker')
    const profileId = auth.profileId

    const body = req.method === 'POST' ? await req.json() : {}
    const url = new URL(req.url)
    const action = body.action || url.searchParams.get('action') || 'stats'

    // Get broker record
    let brokerId: string | null = null
    if (isBroker && !isAdmin) {
      const { data: broker } = await supabase
        .from('cc_brokers')
        .select('id')
        .eq('profile_id', profileId)
        .single()
      if (!broker) return jsonResponse({ error: 'Kein Broker-Konto gefunden' }, 404, corsHeaders)
      brokerId = broker.id
    } else if (body.broker_id) {
      brokerId = body.broker_id
    }

    // ── STATS ──────────────────────────────────────────────────────────────
    if (action === 'stats') {
      let query = supabase.from('broker_dashboard').select('*')
      if (brokerId) query = query.eq('broker_id', brokerId)

      const { data, error } = await query
      if (error) throw error

      // For admin: list all brokers with stats
      if (isAdmin && !brokerId) {
        const { data: brokers } = await supabase
          .from('cc_brokers')
          .select('*, profile:profiles!profile_id(first_name, last_name, email)')
          .order('created_at', { ascending: false })
        return jsonResponse({ success: true, brokers: brokers || [], dashboard: data || [] }, 200, corsHeaders)
      }

      return jsonResponse({ success: true, dashboard: data?.[0] || null }, 200, corsHeaders)
    }

    // ── LIST CALL CENTERS ──────────────────────────────────────────────────
    if (action === 'list_callcenters') {
      let query = supabase
        .from('call_centers')
        .select('id, name, is_active, email, phone, created_at, broker_commission_rate')
        .order('name')

      if (brokerId) query = query.eq('broker_id', brokerId)

      const { data, error } = await query
      if (error) throw error
      return jsonResponse({ success: true, callCenters: data || [] }, 200, corsHeaders)
    }

    // ── CREATE CALL CENTER ─────────────────────────────────────────────────
    if (action === 'create_callcenter') {
      if (!brokerId) return jsonResponse({ error: 'broker_id erforderlich' }, 400, corsHeaders)
      const { name, email, phone, commission_rate } = body
      if (!name) return jsonResponse({ error: 'Name erforderlich' }, 400, corsHeaders)

      const { data, error } = await supabase
        .from('call_centers')
        .insert({
          name,
          email: email || null,
          phone: phone || null,
          broker_id: brokerId,
          broker_commission_rate: commission_rate || 0,
          is_active: true,
        })
        .select()
        .single()

      if (error) throw error

      await supabase.from('audit_log').insert({
        action: 'BROKER_CREATE_CALLCENTER',
        table_name: 'call_centers',
        record_id: data.id,
        new_data: { broker_id: brokerId, name }
      })

      return jsonResponse({ success: true, callCenter: data }, 200, corsHeaders)
    }

    // ── SET COMMISSION ─────────────────────────────────────────────────────
    if (action === 'set_commission') {
      const { call_center_id, commission_rate } = body
      if (!call_center_id || commission_rate === undefined) {
        return jsonResponse({ error: 'call_center_id und commission_rate erforderlich' }, 400, corsHeaders)
      }

      // Verify broker owns this CC
      let updateQuery = supabase
        .from('call_centers')
        .update({ broker_commission_rate: commission_rate })
        .eq('id', call_center_id)

      if (brokerId) updateQuery = updateQuery.eq('broker_id', brokerId)

      const { error } = await updateQuery
      if (error) throw error

      return jsonResponse({ success: true }, 200, corsHeaders)
    }

    // ── LIST COMMISSIONS ───────────────────────────────────────────────────
    if (action === 'list_commissions') {
      let query = supabase
        .from('broker_commissions')
        .select(`
          id, base_amount, commission_rate, commission_amount, status,
          period_start, period_end, created_at,
          call_center:call_centers!call_center_id(id, name)
        `)
        .order('created_at', { ascending: false })
        .limit(200)

      if (brokerId) query = query.eq('broker_id', brokerId)

      const { data, error } = await query
      if (error) throw error
      return jsonResponse({ success: true, commissions: data || [] }, 200, corsHeaders)
    }

    // ── CREATE BROKER (admin only) ─────────────────────────────────────────
    if (action === 'create_broker') {
      if (!isAdmin) return jsonResponse({ error: 'Nur Admins können Broker anlegen' }, 403, corsHeaders)
      const { profile_id, commission_rate, notes } = body
      if (!profile_id) return jsonResponse({ error: 'profile_id erforderlich' }, 400, corsHeaders)

      // Assign cc_broker role
      await supabase.from('user_roles').upsert({ user_id: profile_id, role: 'cc_broker' })

      const { data, error } = await supabase
        .from('cc_brokers')
        .insert({
          profile_id,
          commission_rate: commission_rate || 5.00,
          notes: notes || null,
          created_by: profileId,
        })
        .select()
        .single()

      if (error) throw error
      return jsonResponse({ success: true, broker: data }, 200, corsHeaders)
    }

    return jsonResponse({ error: 'Unbekannte Aktion' }, 400, corsHeaders)

  } catch (error) {
    console.error('Broker dashboard error:', (error as Error).message)
    return jsonResponse({ error: 'Interner Fehler' }, 500, getCorsHeaders(req))
  }
})
