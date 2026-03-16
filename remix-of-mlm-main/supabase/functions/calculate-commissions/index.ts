import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { getCorsHeaders, jsonResponse, authenticateRequest, authenticateServiceCall, getSupabaseAdmin, checkMaintenanceMode } from '../_shared/auth.ts'

interface TransactionData {
  transactionId: string
}

// Rolling 5-Level Sliding Window — commission rates per level (relative to seller)
// Level 1 = direct sponsor, Level 5 = 5th ancestor (top of window)
// These are PERCENTAGES of the sale amount (e.g. 10 = 10%)
// Loaded from mlm_settings at runtime; these are fallback defaults
const DEFAULT_RATES: Record<number, number> = {
  1: 10, // direct sponsor
  2: 8,
  3: 6,
  4: 4,
  5: 2,  // top of sliding window
}

function getPayouts(depth: number, rates: Record<number, number>): number[] {
  // Return rates for levels 1..min(depth,5)
  const result: number[] = []
  for (let i = 1; i <= Math.min(depth, 5); i++) {
    result.push(rates[i] ?? DEFAULT_RATES[i] ?? 0)
  }
  return result
}

serve(async (req) => {
  const corsHeaders = getCorsHeaders(req)
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders })
  }

  const maintenanceResponse = checkMaintenanceMode('calculate-commissions', corsHeaders)
  if (maintenanceResponse) return maintenanceResponse

  try {
    const { supabase } = getSupabaseAdmin()

    // AUTH: Only admins or service-to-service calls
    const serviceAuth = authenticateServiceCall(req, corsHeaders)
    if (!serviceAuth.ok) {
      const authResult = await authenticateRequest(req, corsHeaders, { allowedRoles: ['admin', 'super_admin'] })
      if (authResult.response) return authResult.response
    }

    const { transactionId }: TransactionData = await req.json()

    if (!transactionId) {
      return jsonResponse({ error: 'Transaction ID erforderlich' }, 400, corsHeaders)
    }

    // H-01 FIX: Atomic lock — mark_commission_processed uses SELECT...FOR UPDATE
    // Returns true if we got the lock (not yet processed), false if already processed or not found
    const { data: lockResult, error: lockError } = await supabase.rpc('mark_commission_processed', {
      p_transaction_id: transactionId,
    })

    if (lockError) {
      console.error('mark_commission_processed error:', lockError.message)
      return jsonResponse({ error: 'Sperr-Fehler' }, 500, corsHeaders)
    }

    if (!lockResult) {
      return jsonResponse({ message: 'Provisionen bereits berechnet', alreadyProcessed: true }, 200, corsHeaders)
    }

    // Get transaction (already locked by the RPC above within its own tx, but we need the data)
    const { data: transaction, error: txError } = await supabase
      .from('transactions')
      .select('*, customer:profiles!customer_id(*)')
      .eq('id', transactionId)
      .single()

    if (txError || !transaction) {
      return jsonResponse({ error: 'Transaktion nicht gefunden' }, 404, corsHeaders)
    }

    // H-03 FIX: Only calculate commissions for completed transactions
    if (transaction.status !== 'completed') {
      return jsonResponse({
        success: true,
        message: 'Provisionen nur für abgeschlossene Transaktionen',
        commissionsCreated: 0,
        commissions: [],
        poolContribution: 0,
        skippedReason: 'transaction_not_completed'
      }, 200, corsHeaders)
    }

    // Get customer's ancestors
    const { data: ancestors, error: hierarchyError } = await supabase
      .from('user_hierarchy')
      .select(`
        ancestor_id,
        level_number,
        is_active_for_commission,
        ancestor:profiles!ancestor_id(id, first_name, last_name, sponsor_id)
      `)
      .eq('user_id', transaction.customer_id)
      .eq('is_active_for_commission', true)
      .order('level_number', { ascending: true })

    if (hierarchyError) {
      console.error('Hierarchy error:', hierarchyError)
      return jsonResponse({ error: 'Hierarchie konnte nicht geladen werden' }, 500, corsHeaders)
    }

    const d = ancestors?.length || 0

    if (d === 0) {
      return jsonResponse({
        success: true,
        commissionsCreated: 0,
        commissions: [],
        poolContribution: 0
      }, 200, corsHeaders)
    }

    // Load commission rates from mlm_settings (Sliding Window rates)
    const { data: rateSettings } = await supabase
      .from('mlm_settings')
      .select('key, value')
      .like('key', 'commission_rate_level_%')

    const runtimeRates: Record<number, number> = { ...DEFAULT_RATES }
    if (rateSettings && rateSettings.length > 0) {
      for (const s of rateSettings) {
        const level = parseInt(s.key.replace('commission_rate_level_', ''))
        if (level >= 1 && level <= 5) {
          runtimeRates[level] = Number(s.value)
        }
      }
    }

    // Get active commission model (optional, for audit)
    const { data: model } = await supabase
      .from('commission_models')
      .select('id, name')
      .eq('is_active', true)
      .limit(1)
      .maybeSingle()

    // Sliding Window: rates for levels 1..min(d,5) as percentages
    const payoutRates = getPayouts(d, runtimeRates)
    // Convert percentages to actual amounts
    const payouts = payoutRates.map(rate => Math.round((transaction.amount * rate / 100) * 100) / 100)
    const commissionsCreated: any[] = []
    const maxPayoutPositions = Math.min(payouts.length, d)

    for (let i = 0; i < maxPayoutPositions; i++) {
      const ancestor = ancestors![i]
      const commissionAmount = payouts[i]  // actual EUR amount
      const commissionRate   = payoutRates[i]  // percentage

      if (!commissionAmount || commissionAmount <= 0) continue

      const { data: hasPartnerRole } = await supabase
        .rpc('has_role', { _user_id: ancestor.ancestor_id, _role: 'partner' })
      const { data: hasAdminRole } = await supabase
        .rpc('has_role', { _user_id: ancestor.ancestor_id, _role: 'admin' })

      if (!hasPartnerRole && !hasAdminRole) continue

      const { data: commission, error: commError } = await supabase
        .from('commissions')
        .insert({
          transaction_id: transactionId,
          partner_id: ancestor.ancestor_id,
          model_id: model?.id || null,
          level_number: ancestor.level_number,
          commission_type: 'percentage',
          base_amount: transaction.amount,
          commission_amount: commissionAmount,  // EUR amount
          status: 'pending',
        })
        .select()
        .single()

      if (!commError && commission) {
        commissionsCreated.push({
          partnerId: ancestor.ancestor_id,
          level: ancestor.level_number,
          rate: commissionRate,
          amount: commissionAmount,
        })
      }
    }

    const totalPaid = payouts.slice(0, maxPayoutPositions).reduce((s, v) => s + (v || 0), 0)
    const poolContribution = 0  // Sliding Window: no pool, all goes to upline

    // Audit log
    await supabase.from('audit_log').insert({
      action: 'COMMISSIONS_CALCULATED',
      table_name: 'commissions',
      record_id: transactionId,
      new_data: {
        depth: d,
        commissionsCount: commissionsCreated.length,
        totalAmount: commissionsCreated.reduce((sum: number, c: any) => sum + c.amount, 0),
        poolContribution,
        matrix: 'sliding-window'
      },
    })

    return jsonResponse({
      success: true,
      depth: d,
      commissionsCreated: commissionsCreated.length,
      commissions: commissionsCreated,
      poolContribution
    }, 200, corsHeaders)

  } catch (error) {
    console.error('Commission calculation error:', error)
    return jsonResponse({ error: 'Provisionsberechnung fehlgeschlagen' }, 500, corsHeaders)
  }
})
