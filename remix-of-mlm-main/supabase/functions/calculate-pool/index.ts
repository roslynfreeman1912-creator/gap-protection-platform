import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { getCorsHeaders, jsonResponse, authenticateRequest, authenticateServiceCall, getSupabaseAdmin, checkMaintenanceMode } from '../_shared/auth.ts'

interface PoolCalculationRequest {
  periodMonth: string // Format: YYYY-MM-01
}

serve(async (req) => {
  const corsHeaders = getCorsHeaders(req)
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders })
  }

  const maintenanceResponse = checkMaintenanceMode('calculate-pool', corsHeaders)
  if (maintenanceResponse) return maintenanceResponse

  try {
    const { supabase } = getSupabaseAdmin()

    // AUTH: Only admins or service-to-service calls
    const serviceAuth = authenticateServiceCall(req, corsHeaders)
    if (!serviceAuth.ok) {
      const authResult = await authenticateRequest(req, corsHeaders, { allowedRoles: ['admin', 'super_admin'] })
      if (authResult.response) return authResult.response
    }

    const { periodMonth }: PoolCalculationRequest = await req.json()

    if (!periodMonth || !/^\d{4}-\d{2}-01$/.test(periodMonth)) {
      return jsonResponse({ error: 'periodMonth muss im Format YYYY-MM-01 sein' }, 400, corsHeaders)
    }

    // Get pool config (2% cap)
    const { data: poolConfig } = await supabase
      .from('pool_config')
      .select('percentage_cap')
      .eq('name', 'leadership_pool')
      .eq('is_active', true)
      .single()

    const percentageCap = poolConfig?.percentage_cap || 2

    // Calculate total monthly revenue
    const periodStart = new Date(periodMonth)
    const periodEnd = new Date(periodStart)
    periodEnd.setMonth(periodEnd.getMonth() + 1)

    const { data: transactions } = await supabase
      .from('transactions')
      .select('amount')
      .eq('status', 'completed')
      .gte('created_at', periodStart.toISOString())
      .lt('created_at', periodEnd.toISOString())

    const totalRevenue = transactions?.reduce((sum, t) => sum + Number(t.amount), 0) || 0
    const poolAmount = totalRevenue * (percentageCap / 100)

    // Get all qualified partners with their ranks
    const { data: qualifiedPartners } = await supabase
      .from('user_rank_history')
      .select(`
        user_id,
        rank_id,
        rank:ranks(id, name, shares_count, level)
      `)
      .eq('is_current', true)

    if (!qualifiedPartners || qualifiedPartners.length === 0) {
      return jsonResponse({ poolAmount, totalShares: 0, payouts: [] }, 200, corsHeaders)
    }

    // Calculate total shares
    let totalShares = 0
    const partnerShares: { userId: string; rankId: string; shares: number; rankName: string }[] = []

    for (const partner of qualifiedPartners) {
      const rank = partner.rank as any
      if (rank && rank.shares_count) {
        totalShares += rank.shares_count
        partnerShares.push({
          userId: partner.user_id,
          rankId: partner.rank_id,
          shares: rank.shares_count,
          rankName: rank.name
        })
      }
    }

    if (totalShares === 0) {
      return jsonResponse({ poolAmount, totalShares: 0, payouts: [] }, 200, corsHeaders)
    }

    const shareValue = poolAmount / totalShares
    const payouts: any[] = []

    for (const partner of partnerShares) {
      const payoutAmount = partner.shares * shareValue

      const { data: payout, error: payoutError } = await supabase
        .from('pool_payouts')
        .insert({
          user_id: partner.userId,
          rank_id: partner.rankId,
          period_month: periodMonth,
          total_pool_amount: poolAmount,
          total_shares: totalShares,
          user_shares: partner.shares,
          share_value: shareValue,
          payout_amount: payoutAmount,
          status: 'pending'
        })
        .select()
        .single()

      if (!payoutError && payout) {
        payouts.push({
          rank: partner.rankName,
          shares: partner.shares,
          amount: payoutAmount
        })
      }
    }

    await supabase.from('audit_log').insert({
      action: 'POOL_CALCULATED',
      table_name: 'pool_payouts',
      record_id: periodMonth,
      new_data: { poolAmount, totalShares, shareValue, payoutsCount: payouts.length },
    })

    return jsonResponse({ success: true, poolAmount, totalShares, shareValue, payouts }, 200, corsHeaders)

  } catch (error) {
    console.error('Pool calculation error:', (error as Error).message)
    return jsonResponse({ error: 'Pool-Berechnung fehlgeschlagen' }, 500, getCorsHeaders(req))
  }
})
