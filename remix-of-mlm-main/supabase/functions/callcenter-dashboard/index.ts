import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { getCorsHeaders, jsonResponse, authenticateRequest, getSupabaseAdmin } from '../_shared/auth.ts'

serve(async (req) => {
  const corsHeaders = getCorsHeaders(req)

  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders })
  }

  try {
    const { supabase } = getSupabaseAdmin()

    // Authenticate and require admin, super_admin, or callcenter role
    const authResult = await authenticateRequest(req, corsHeaders, { allowedRoles: ['admin', 'super_admin', 'callcenter', 'cc_broker'] })
    if (authResult.response) return authResult.response
    const { auth } = authResult

    const isAdmin = auth.roles.includes('admin')
    const isSuperAdmin = auth.roles.includes('super_admin')
    const isCallcenter = auth.roles.includes('callcenter')
    const profile = { id: auth.profileId }

    // Handle POST actions (create employee, etc.)
    if (req.method === 'POST') {
      const body = await req.json()
      const action = body.action

      if (action === 'create_employee') {
        // CC Admin can create employees for their own center
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
            .eq('owner_id', profile.id)
            .single()
          if (!ownCenter) return jsonResponse({ error: 'Kein Zugriff auf dieses Call Center' }, 403, corsHeaders)
        }

        // Create auth user
        const tempPassword = Math.random().toString(36).slice(-10) + 'A1!'
        const { data: newUser, error: userErr } = await supabase.auth.admin.createUser({
          email,
          password: tempPassword,
          email_confirm: true,
        })
        if (userErr) return jsonResponse({ error: userErr.message }, 400, corsHeaders)

        // Create profile
        const { data: newProfile, error: profErr } = await supabase
          .from('profiles')
          .insert({ user_id: newUser.user.id, first_name, last_name, email, role: 'customer' })
          .select()
          .single()
        if (profErr) return jsonResponse({ error: profErr.message }, 400, corsHeaders)

        // Add to call_center_employees
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

      return jsonResponse({ error: 'Unbekannte Aktion' }, 400, corsHeaders)
    }

    const url = new URL(req.url)
    const callCenterId = url.searchParams.get('call_center_id')

    // If callcenter role, only allow own center
    let targetCenterId = callCenterId
    if (isCallcenter && !isAdmin && !isSuperAdmin) {
      const { data: ownCenter } = await supabase
        .from('call_centers')
        .select('id')
        .eq('owner_id', profile.id)
        .single()
      
      if (!ownCenter) {
        return new Response(JSON.stringify({ error: 'Kein Call Center zugeordnet' }), 
          { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
      }
      targetCenterId = ownCenter.id
    }

    // Build queries based on role
    const isGlobalView = (isAdmin || isSuperAdmin) && !targetCenterId

    // Get call center info
    let centerInfo = null
    if (targetCenterId) {
      const { data } = await supabase
        .from('call_centers')
        .select('*')
        .eq('id', targetCenterId)
        .single()
      centerInfo = data
    }

    // Get all call centers (admin/super_admin only)
    let allCenters: any[] = []
    if (isAdmin || isSuperAdmin) {
      const { data } = await supabase
        .from('call_centers')
        .select('id, name, is_active, owner_id, email, phone')
        .order('name')
      allCenters = data || []
    }

    // Leads count - with pagination limit
    let leadsQuery = supabase.from('leads').select('id, status, created_at', { count: 'exact' })
    if (targetCenterId) leadsQuery = leadsQuery.eq('call_center_id', targetCenterId)
    const { data: leads, count: leadsCount } = await leadsQuery.order('created_at', { ascending: false }).limit(1000)

    // Promo codes - with limit
    let promoQuery = supabase.from('promotion_codes').select('*')
    if (targetCenterId) promoQuery = promoQuery.eq('call_center_id', targetCenterId)
    const { data: promoCodes } = await promoQuery.limit(500)

    // Employees - with limit + their commissions
    let empQuery = supabase.from('call_center_employees').select('*, profile:profiles!profile_id(first_name, last_name, email)')
    if (targetCenterId) empQuery = empQuery.eq('call_center_id', targetCenterId)
    const { data: employees } = await empQuery.limit(500)

    // Employee commissions summary
    let empCommissions: Record<string, number> = {}
    if (targetCenterId && employees && employees.length > 0) {
      const empIds = employees.map((e: any) => e.id)
      const { data: commData } = await supabase
        .from('cc_commissions')
        .select('employee_id, commission_amount, status')
        .in('employee_id', empIds)
      ;(commData || []).forEach((c: any) => {
        if (!empCommissions[c.employee_id]) empCommissions[c.employee_id] = 0
        empCommissions[c.employee_id] += Number(c.commission_amount)
      })
    }

    // Transactions / Revenue - with limit
    let txQuery = supabase.from('transactions').select('id, amount, created_at, status')
    if (targetCenterId) txQuery = txQuery.eq('call_center_id', targetCenterId)
    const { data: transactions } = await txQuery.order('created_at', { ascending: false }).limit(5000)

    // Calculate stats
    const totalRevenue = (transactions || []).reduce((sum: number, t: any) => sum + (t.amount || 0), 0)
    const leadsByStatus: Record<string, number> = {}
    ;(leads || []).forEach((l: any) => {
      leadsByStatus[l.status || 'unknown'] = (leadsByStatus[l.status || 'unknown'] || 0) + 1
    })

    const totalPromoUsage = (promoCodes || []).reduce((sum: number, p: any) => sum + (p.usage_count || 0), 0)

    return new Response(JSON.stringify({
      role: isSuperAdmin ? 'super_admin' : isAdmin ? 'admin' : 'callcenter',
      centerInfo,
      allCenters,
      stats: {
        totalLeads: leadsCount || 0,
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
    }), { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })

  } catch (error) {
    console.error('Callcenter dashboard error:', error)
    return new Response(JSON.stringify({ error: 'Interner Fehler' }), 
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
  }
})
