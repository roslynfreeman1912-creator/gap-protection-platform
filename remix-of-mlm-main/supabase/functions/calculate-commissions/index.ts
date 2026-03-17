import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { getCorsHeaders, jsonResponse, authenticateRequest, authenticateServiceCall, getSupabaseAdmin, checkMaintenanceMode } from '../_shared/auth.ts'

interface TransactionData {
  transactionId: string
}

// Rolling 5-Level Sliding Window — FIXED EURO AMOUNTS per level
// Basis: 299 € Vertrag → 100 € Strukturprovision verteilt auf 5 Ebenen
// Level 1 = 45 €, Level 2 = 20 €, Level 3 = 15 €, Level 4 = 10 €, Level 5 = 10 €
// Gesamt: 100 € pro Vertrag/Monat
// Loaded from mlm_settings at runtime; these are fallback defaults
const DEFAULT_FIXED_AMOUNTS: Record<number, number> = {
  1: 45, // direkter Sponsor
  2: 20,
  3: 15,
  4: 10,
  5: 10, // oberstes Fenster
}

// One-time bonus for first sale
const DEFAULT_ONE_TIME_BONUS = 50 // €

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
      const authResult = await authenticateRequest(req, corsHeaders, { allowedRoles: ['admin', 'super_admin', 'mlm_manager'] })
      if (authResult.response) return authResult.response
    }

    const { transactionId }: TransactionData = await req.json()

    if (!transactionId) {
      return jsonResponse({ error: 'Transaction ID erforderlich' }, 400, corsHeaders)
    }

    // Atomic lock — prevent double processing
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

    // Get transaction
    const { data: transaction, error: txError } = await supabase
      .from('transactions')
      .select('*, customer:profiles!customer_id(*)')
      .eq('id', transactionId)
      .single()

    if (txError || !transaction) {
      return jsonResponse({ error: 'Transaktion nicht gefunden' }, 404, corsHeaders)
    }

    // Only calculate commissions for completed transactions
    if (transaction.status !== 'completed') {
      return jsonResponse({
        success: true,
        message: 'Provisionen nur für abgeschlossene Transaktionen',
        commissionsCreated: 0,
        commissions: [],
        bonusPaid: false,
        skippedReason: 'transaction_not_completed'
      }, 200, corsHeaders)
    }

    // Load commission settings from mlm_settings
    const { data: settings } = await supabase
      .from('mlm_settings')
      .select('key, value')
      .in('key', [
        'commission_rate_level_1', 'commission_rate_level_2', 'commission_rate_level_3',
        'commission_rate_level_4', 'commission_rate_level_5',
        'commission_mode', 'one_time_bonus'
      ])

    const runtimeAmounts: Record<number, number> = { ...DEFAULT_FIXED_AMOUNTS }
    let commissionMode = 0 // 0 = fixed amount, 1 = percentage
    let oneTimeBonus = DEFAULT_ONE_TIME_BONUS

    if (settings) {
      for (const s of settings) {
        if (s.key === 'commission_mode') { commissionMode = Number(s.value); continue }
        if (s.key === 'one_time_bonus') { oneTimeBonus = Number(s.value); continue }
        const level = parseInt(s.key.replace('commission_rate_level_', ''))
        if (level >= 1 && level <= 5) runtimeAmounts[level] = Number(s.value)
      }
    }

    // Get customer's ancestors (sliding window: only is_active_for_commission = true)
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

    // Get active commission model
    const { data: model } = await supabase
      .from('commission_models')
      .select('id, name')
      .eq('is_active', true)
      .limit(1)
      .maybeSingle()

    const commissionsCreated: any[] = []

    if (d > 0) {
      const maxLevels = Math.min(d, 5)

      for (let i = 0; i < maxLevels; i++) {
        const ancestor = ancestors![i]
        const levelNum = ancestor.level_number

        // Calculate commission amount
        let commissionAmount: number
        if (commissionMode === 1) {
          // Percentage mode: amount = transaction.amount * rate / 100
          commissionAmount = Math.round((transaction.amount * runtimeAmounts[levelNum] / 100) * 100) / 100
        } else {
          // Fixed amount mode: use fixed euro amounts (45/20/15/10/10)
          commissionAmount = runtimeAmounts[levelNum] ?? 0
        }

        if (!commissionAmount || commissionAmount <= 0) continue

        // Check role eligibility (partner, admin, mlm_manager, verkaufsleiter, agent)
        const eligibleRoles = ['partner', 'admin', 'super_admin', 'mlm_manager', 'verkaufsleiter', 'agent']
        let hasEligibleRole = false
        for (const role of eligibleRoles) {
          const { data } = await supabase.rpc('has_role', { _user_id: ancestor.ancestor_id, _role: role })
          if (data) { hasEligibleRole = true; break }
        }

        if (!hasEligibleRole) continue

        const { data: commission, error: commError } = await supabase
          .from('commissions')
          .insert({
            transaction_id: transactionId,
            partner_id: ancestor.ancestor_id,
            model_id: model?.id || null,
            level_number: levelNum,
            commission_type: commissionMode === 1 ? 'percentage' : 'fixed',
            base_amount: transaction.amount,
            commission_amount: commissionAmount,
            status: 'pending',
          })
          .select()
          .single()

        if (!commError && commission) {
          commissionsCreated.push({
            partnerId: ancestor.ancestor_id,
            level: levelNum,
            amount: commissionAmount,
            type: commissionMode === 1 ? 'percentage' : 'fixed',
          })
        }
      }
    }

    // ONE-TIME BONUS: 50 € für den direkten Sponsor beim ersten Verkauf
    let bonusPaid = false
    let bonusRecipientId: string | null = null

    if (d > 0 && oneTimeBonus > 0) {
      const directSponsor = ancestors![0] // Level 1 = direkter Sponsor

      // Prüfen ob erster Verkauf des Sponsors
      const { data: isFirst } = await supabase.rpc('is_first_sale', {
        p_partner_id: directSponsor.ancestor_id
      })

      if (isFirst) {
        // Bonus eintragen
        const { error: bonusError } = await supabase
          .from('first_sale_bonuses')
          .insert({
            partner_id: directSponsor.ancestor_id,
            transaction_id: transactionId,
            bonus_amount: oneTimeBonus,
            status: 'pending',
          })

        if (!bonusError) {
          bonusPaid = true
          bonusRecipientId = directSponsor.ancestor_id

          // Auch als Commission eintragen (Typ: one_time_bonus)
          await supabase.from('commissions').insert({
            transaction_id: transactionId,
            partner_id: directSponsor.ancestor_id,
            model_id: model?.id || null,
            level_number: 0, // 0 = Bonus (kein Level)
            commission_type: 'one_time_bonus',
            base_amount: transaction.amount,
            commission_amount: oneTimeBonus,
            status: 'pending',
          })
        }
      }
    }

    // Audit log
    await supabase.from('audit_log').insert({
      action: 'COMMISSIONS_CALCULATED',
      table_name: 'commissions',
      record_id: transactionId,
      new_data: {
        depth: d,
        commissionsCount: commissionsCreated.length,
        totalAmount: commissionsCreated.reduce((sum: number, c: any) => sum + c.amount, 0),
        bonusPaid,
        bonusAmount: bonusPaid ? oneTimeBonus : 0,
        matrix: 'sliding-window-fixed-45-20-15-10-10',
      },
    })

    return jsonResponse({
      success: true,
      depth: d,
      commissionsCreated: commissionsCreated.length,
      commissions: commissionsCreated,
      bonusPaid,
      bonusRecipientId,
      bonusAmount: bonusPaid ? oneTimeBonus : 0,
    }, 200, corsHeaders)

  } catch (error) {
    console.error('Commission calculation error:', error)
    return jsonResponse({ error: 'Provisionsberechnung fehlgeschlagen' }, 500, corsHeaders)
  }
})
