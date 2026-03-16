import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { getCorsHeaders, jsonResponse, authenticateRequest, authenticateServiceCall, getSupabaseAdmin, checkMaintenanceMode } from '../_shared/auth.ts'

serve(async (req) => {
  const corsHeaders = getCorsHeaders(req)
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders })
  }

  const maintenanceResponse = checkMaintenanceMode('cc-commissions', corsHeaders)
  if (maintenanceResponse) return maintenanceResponse

  try {
    const { supabase } = getSupabaseAdmin()

    // AUTH: Only admins or service-to-service calls
    const serviceAuth = authenticateServiceCall(req, corsHeaders)
    if (!serviceAuth.ok) {
      const authResult = await authenticateRequest(req, corsHeaders, { allowedRoles: ['admin', 'super_admin'] })
      if (authResult.response) return authResult.response
    }

    const { action, callCenterId, periodStart, periodEnd } = await req.json()

    if (action === 'calculate') {
      if (!callCenterId) return jsonResponse({ error: 'callCenterId erforderlich' }, 400, corsHeaders)

      const { data: promoCodes } = await supabase
        .from('promotion_codes')
        .select('code, partner_id')
        .eq('call_center_id', callCenterId)

      if (!promoCodes || promoCodes.length === 0) {
        return jsonResponse({ success: true, results: { processed: 0 } }, 200, corsHeaders)
      }

      const codes = promoCodes.map(p => p.code)
      const { data: customers } = await supabase
        .from('profiles')
        .select('id, promotion_code')
        .in('promotion_code', codes)

      if (!customers || customers.length === 0) {
        return jsonResponse({ success: true, results: { processed: 0 } }, 200, corsHeaders)
      }

      const customerIds = customers.map(c => c.id)

      let txQuery = supabase
        .from('transactions')
        .select('*')
        .in('customer_id', customerIds)
        .eq('status', 'completed')

      if (periodStart) txQuery = txQuery.gte('created_at', periodStart)
      if (periodEnd) txQuery = txQuery.lte('created_at', periodEnd)

      const { data: transactions } = await txQuery

      if (!transactions || transactions.length === 0) {
        return jsonResponse({ success: true, results: { processed: 0 } }, 200, corsHeaders)
      }

      const { data: employees } = await supabase
        .from('call_center_employees')
        .select('id, profile_id, role, commission_rate, override_rate, parent_employee_id, level, is_active')
        .eq('call_center_id', callCenterId)
        .eq('is_active', true)

      const results = { processed: 0, directCommissions: 0, overrideCommissions: 0, totalAmount: 0 }

      for (const tx of transactions) {
        const customer = customers.find(c => c.id === tx.customer_id)
        const promoCode = promoCodes.find(p => p.code === customer?.promotion_code)
        const directEmployee = employees?.find(e => e.profile_id === promoCode?.partner_id)

        if (!directEmployee) continue

        // Check duplicate
        const { data: existing } = await supabase
          .from('cc_commissions')
          .select('id')
          .eq('transaction_id', tx.id)
          .eq('employee_id', directEmployee.id)
          .limit(1)

        if (existing && existing.length > 0) continue

        // Direct commission
        const directAmount = tx.amount * (directEmployee.commission_rate / 100)
        if (directAmount > 0) {
          await supabase.from('cc_commissions').insert({
            employee_id: directEmployee.id,
            call_center_id: callCenterId,
            transaction_id: tx.id,
            commission_type: 'direct',
            base_amount: tx.amount,
            commission_rate: directEmployee.commission_rate,
            commission_amount: directAmount,
            status: 'pending'
          })
          results.directCommissions++
          results.totalAmount += directAmount
        }

        // Override commissions up hierarchy
        let currentParentId = directEmployee.parent_employee_id
        let overrideLevel = 1

        while (currentParentId && overrideLevel <= 5) {
          const parentEmployee = employees?.find(e => e.id === currentParentId)
          if (!parentEmployee || parentEmployee.override_rate <= 0) break

          const overrideAmount = tx.amount * (parentEmployee.override_rate / 100)
          if (overrideAmount > 0) {
            await supabase.from('cc_commissions').insert({
              employee_id: parentEmployee.id,
              call_center_id: callCenterId,
              transaction_id: tx.id,
              commission_type: 'override',
              base_amount: tx.amount,
              commission_rate: parentEmployee.override_rate,
              commission_amount: overrideAmount,
              override_from_employee_id: directEmployee.id,
              override_level: overrideLevel,
              status: 'pending'
            })
            results.overrideCommissions++
            results.totalAmount += overrideAmount
          }

          currentParentId = parentEmployee.parent_employee_id
          overrideLevel++
        }

        results.processed++
      }

      await supabase.from('audit_log').insert({
        action: 'CC_COMMISSIONS_CALCULATED',
        table_name: 'cc_commissions',
        record_id: callCenterId,
        new_data: { periodStart, periodEnd, ...results }
      })

      return jsonResponse({ success: true, results }, 200, corsHeaders)
    }

    if (action === 'list') {
      let query = supabase
        .from('cc_commissions')
        .select(`
          id, commission_type, commission_amount, status, created_at,
          employee:call_center_employees!employee_id (
            id, role, profile:profiles!profile_id (first_name, last_name)
          )
        `)
        .order('created_at', { ascending: false })

      if (callCenterId) query = query.eq('call_center_id', callCenterId)

      const { data, error } = await query.limit(200)
      if (error) throw error

      return jsonResponse({ success: true, commissions: data }, 200, corsHeaders)
    }

    if (action === 'summary') {
      if (!callCenterId) return jsonResponse({ error: 'callCenterId erforderlich' }, 400, corsHeaders)

      const { data } = await supabase
        .from('cc_commissions')
        .select('employee_id, commission_amount, status, commission_type')
        .eq('call_center_id', callCenterId)

      const summary = { totalPending: 0, totalPaid: 0, directTotal: 0, overrideTotal: 0, employeeCount: 0 }
      const employeeSet = new Set<string>()

      data?.forEach(c => {
        const amt = Number(c.commission_amount)
        if (c.status === 'pending') summary.totalPending += amt
        if (c.status === 'paid') summary.totalPaid += amt
        if (c.commission_type === 'direct') summary.directTotal += amt
        if (c.commission_type === 'override') summary.overrideTotal += amt
        employeeSet.add(c.employee_id)
      })
      summary.employeeCount = employeeSet.size

      return jsonResponse({ success: true, summary }, 200, corsHeaders)
    }

    return jsonResponse({ error: 'Unbekannte Aktion' }, 400, corsHeaders)

  } catch (error) {
    console.error('CC Commission error:', (error as Error).message)
    return jsonResponse({ error: 'CC-Provisionsberechnung fehlgeschlagen' }, 500, getCorsHeaders(req))
  }
})
