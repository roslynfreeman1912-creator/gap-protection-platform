import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { getCorsHeaders, jsonResponse, authenticateRequest, getSupabaseAdmin } from '../_shared/auth.ts'

serve(async (req) => {
  const corsHeaders = getCorsHeaders(req)

  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders })
  }

  try {
    const { supabase } = getSupabaseAdmin()

    const authResult = await authenticateRequest(req, corsHeaders, {
      allowedRoles: ['admin', 'super_admin', 'callcenter', 'cc_broker']
    })
    if (authResult.response) return authResult.response
    const { auth } = authResult

    const isAdmin = auth.roles.includes('admin')
    const isSuperAdmin = auth.roles.includes('super_admin')
    const isCallcenter = auth.roles.includes('callcenter')
    const profileId = auth.profileId

    // ─── POST: Actions ───────────────────────────────────────────
    if (req.method === 'POST') {
      const body = await req.json()
      const action = body.action

      if (action === 'create_employee') {
        const { call_center_id, email, first_name, last_name, role, commission_rate } = body
        if (!call_center_id || !email || !first_name || !last_name) {
          return jsonResponse({ error: 'Pflichtfelder fehlen' }, 400, corsHeaders)
        }

        // Verify caller has rights to this CC
        if (!isAdmin && !isSuperAdmin) {
          const { data: ownCenter } = await supabase
            .from('call_centers')
            .select('id')
            .eq('id', call_center_id)
            .eq('owner_id', profileId)
            .single()
          if (!ownCenter) return jsonResponse({ error: 'Kein Zugriff auf dieses Call Center' }, 403, corsHeaders)
        }

        const tempPassword = Math.random().toString(36).slice(-8) + 'A1!'
        const { data: newUser, error: userErr } = await supabase.auth.admin.createUser({
          email,
          password: tempPassword,
          email_confirm: true,
        })
        if (userErr) return jsonResponse({ error: userErr.message }, 400, corsHeaders)

        const { data: newProfile, error: profErr } = await supabase
          .from('profiles')
          .insert({ user_id: newUser.user.id, first_name, last_name, email, role: 'customer' })
          .select()
          .single()
        if (profErr) return jsonResponse({ error: profErr.message }, 400, corsHeaders)

        const { data: emp, error: empErr } = await supabase
          .from('call_center_employees')
          .insert({
            call_center_id,
            profile_id: newProfile.id,
            role: role || 'agent',
            commission_rate: commission_rate || 0,
            is_active: true,
          })
          .select()
          .single()
        if (empErr) return jsonResponse({ error: empErr.message }, 400, corsHeaders)

        return jsonResponse({ success: true, employee: emp, tempPassword }, 200, corsHeaders)
      }

      if (action === 'update_lead_status') {
        const { lead_id, status } = body
        if (!lead_id || !status) return jsonResponse({ error: 'lead_id und status erforderlich' }, 400, corsHeaders)
        const { error } = await supabase.from('leads').update({ status, updated_at: new Date().toISOString() }).eq('id', lead_id)
        if (error) return jsonResponse({ error: error.message }, 400, corsHeaders)
        return jsonResponse({ success: true }, 200, corsHeaders)
      }

      if (action === 'create_lead') {
        const { call_center_id, company_name, contact_person, email, phone, domain, status, notes, priority } = body
        if (!call_center_id) return jsonResponse({ error: 'call_center_id erforderlich' }, 400, corsHeaders)
        const { data, error } = await supabase.from('leads').insert({
          call_center_id, company_name, contact_person, email, phone, domain,
          status: status || 'new', notes, priority: priority || 0
        }).select().single()
        if (error) return jsonResponse({ error: error.message }, 400, corsHeaders)
        return jsonResponse({ success: true, lead: data }, 200, corsHeaders)
      }

      return jsonResponse({ error: 'Unbekannte Aktion' }, 400, corsHeaders)
    }

    // ─── GET: Dashboard data ──────────────────────────────────────
    const url = new URL(req.url)
    const callCenterId = url.searchParams.get('call_center_id')

    // Resolve target center for callcenter role
    let targetCenterId = callCenterId && callCenterId !== 'all' ? callCenterId : null

    if (isCallcenter && !isAdmin && !isSuperAdmin) {
      // Try owner first
      const { data: ownCenter } = await supabase
        .from('call_centers')
        .select('id')
        .eq('owner_id', profileId)
        .maybeSingle()

      if (ownCenter) {
        targetCenterId = ownCenter.id
      } else {
        // Try employee
        const { data: empCenter } = await supabase
          .from('call_center_employees')
          .select('call_center_id')
          .eq('profile_id', profileId)
          .eq('is_active', true)
          .maybeSingle()

        if (empCenter) {
          targetCenterId = empCenter.call_center_id
        } else {
          return jsonResponse({ error: 'Kein Call Center zugeordnet' }, 404, corsHeaders)
        }
      }
    }

    // Get call center info
    let centerInfo = null
    if (targetCenterId) {
      const { data } = await supabase.from('call_centers').select('*').eq('id', targetCenterId).single()
      centerInfo = data
    }

    // All centers (admin only)
    let allCenters: any[] = []
    if (isAdmin || isSuperAdmin) {
      const { data } = await supabase
        .from('call_centers')
        .select('id, name, is_active, owner_id, email, phone')
        .order('name')
      allCenters = data || []
    }

    // Leads
    let leadsQuery = supabase
      .from('leads')
      .select('id, company_name, contact_person, email, phone, domain, status, priority, created_at', { count: 'exact' })
    if (targetCenterId) leadsQuery = leadsQuery.eq('call_center_id', targetCenterId)
    const { data: leads, count: leadsCount } = await leadsQuery
      .order('created_at', { ascending: false })
      .limit(500)

    // Promo codes
    let promoQuery = supabase.from('promotion_codes').select('id, code, usage_count, max_uses, is_active, created_at')
    if (targetCenterId) promoQuery = promoQuery.eq('call_center_id', targetCenterId)
    const { data: promoCodes } = await promoQuery.limit(200)

    // Employees
    let empQuery = supabase
      .from('call_center_employees')
      .select('id, call_center_id, profile_id, role, commission_rate, override_rate, is_active, profile:profiles!profile_id(first_name, last_name, email)')
    if (targetCenterId) empQuery = empQuery.eq('call_center_id', targetCenterId)
    const { data: employees } = await empQuery.limit(200)

    // Employee commissions
    let empCommissions: Record<string, number> = {}
    if (employees && employees.length > 0) {
      const empIds = employees.map((e: any) => e.id)
      const { data: commData } = await supabase
        .from('cc_commissions')
        .select('employee_id, commission_amount, status')
        .in('employee_id', empIds)
      ;(commData || []).forEach((c: any) => {
        empCommissions[c.employee_id] = (empCommissions[c.employee_id] || 0) + Number(c.commission_amount)
      })
    }

    // Transactions
    let txQuery = supabase
      .from('transactions')
      .select('id, amount, created_at, status')
    if (targetCenterId) txQuery = txQuery.eq('call_center_id', targetCenterId)
    const { data: transactions } = await txQuery
      .eq('status', 'completed')
      .order('created_at', { ascending: false })
      .limit(1000)

    // Stats
    const totalRevenue = (transactions || []).reduce((sum: number, t: any) => sum + Number(t.amount || 0), 0)
    const leadsByStatus: Record<string, number> = {}
    ;(leads || []).forEach((l: any) => {
      const s = l.status || 'unknown'
      leadsByStatus[s] = (leadsByStatus[s] || 0) + 1
    })
    const totalPromoUsage = (promoCodes || []).reduce((sum: number, p: any) => sum + (p.usage_count || 0), 0)

    return jsonResponse({
      role: isSuperAdmin ? 'super_admin' : isAdmin ? 'admin' : 'callcenter',
      centerInfo,
      allCenters,
      stats: {
        totalLeads: leadsCount || (leads || []).length,
        leadsByStatus,
        totalEmployees: (employees || []).length,
        totalRevenue,
        totalPromoCodes: (promoCodes || []).length,
        totalPromoUsage,
        totalTransactions: (transactions || []).length,
      },
      leads: leads || [],
      promoCodes: promoCodes || [],
      employees: (employees || []).map((e: any) => ({
        ...e,
        total_commissions: empCommissions[e.id] || 0,
      })),
      transactions: transactions || [],
    }, 200, corsHeaders)

  } catch (error) {
    console.error('Callcenter dashboard error:', error)
    return jsonResponse({ error: 'Interner Fehler' }, 500, getCorsHeaders(req))
  }
})
