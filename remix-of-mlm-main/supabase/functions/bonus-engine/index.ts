import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { getCorsHeaders, jsonResponse, authenticateRequest, authenticateServiceCall, getSupabaseAdmin, checkMaintenanceMode } from '../_shared/auth.ts'

interface BonusRequest {
  action: 'calculate_fast_start' | 'calculate_matching' | 'calculate_performance' | 'check_rank_advancement' | 'process_all'
  profileId?: string
  transactionId?: string
  periodMonth?: string
}

serve(async (req) => {
  const corsHeaders = getCorsHeaders(req)
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders })
  }

  const maintenanceResponse = checkMaintenanceMode('bonus-engine', corsHeaders)
  if (maintenanceResponse) return maintenanceResponse

  try {
    const { supabase, url: supabaseUrl, key: supabaseServiceKey } = getSupabaseAdmin()

    // AUTH: Only admins or service-to-service calls
    const serviceAuth = authenticateServiceCall(req, corsHeaders)
    if (!serviceAuth.ok) {
      const authResult = await authenticateRequest(req, corsHeaders, { allowedRoles: ['admin', 'super_admin'] })
      if (authResult.response) return authResult.response
    }

    const { action, profileId, transactionId, periodMonth }: BonusRequest = await req.json()

    const { data: bonusConfigs } = await supabase
      .from('bonus_config')
      .select('*')
      .eq('is_active', true)

    const getConfig = (type: string) => bonusConfigs?.find((c: any) => c.bonus_type === type)

    switch (action) {
      case 'calculate_fast_start': {
        if (!transactionId) {
          return jsonResponse({ error: 'transactionId erforderlich' }, 400, corsHeaders)
        }

        const config = getConfig('fast_start')
        if (!config) {
          return jsonResponse({ message: 'Fast Start Bonus deaktiviert' }, 200, corsHeaders)
        }

        const { data: transaction } = await supabase
          .from('transactions')
          .select('*, customer:profiles!customer_id(*)')
          .eq('id', transactionId)
          .single()

        if (!transaction) {
          return jsonResponse({ error: 'Transaktion nicht gefunden' }, 404, corsHeaders)
        }

        const customer = transaction.customer
        if (!customer?.sponsor_id || !customer?.created_at) {
          return jsonResponse({ message: 'Kein Sponsor oder Erstelldatum' }, 200, corsHeaders)
        }

        const daysSinceRegistration = Math.floor(
          (Date.now() - new Date(customer.created_at).getTime()) / (1000 * 60 * 60 * 24)
        )

        if (daysSinceRegistration > (config.qualifying_days || 30)) {
          return jsonResponse({ message: 'Fast Start Zeitfenster abgelaufen' }, 200, corsHeaders)
        }

        const { data: existing } = await supabase
          .from('bonus_payouts')
          .select('id')
          .eq('trigger_transaction_id', transactionId)
          .eq('bonus_type', 'fast_start')
          .maybeSingle()

        if (existing) {
          return jsonResponse({ message: 'Fast Start Bonus bereits vergeben' }, 200, corsHeaders)
        }

        const bonusAmount = config.calculation_type === 'percentage'
          ? transaction.amount * (config.value / 100)
          : config.value

        await supabase.from('bonus_payouts').insert({
          profile_id: customer.sponsor_id,
          bonus_config_id: config.id,
          bonus_type: 'fast_start',
          amount: bonusAmount,
          trigger_transaction_id: transactionId,
          trigger_profile_id: customer.id,
          description: 'Fast Start Bonus',
        })

        const walletOk = await creditWallet(supabaseUrl, supabaseServiceKey, customer.sponsor_id, bonusAmount, 'bonus', transactionId, 'fast_start_bonus')

        return jsonResponse({ success: true, bonus_amount: bonusAmount, sponsor_id: customer.sponsor_id, wallet_credited: walletOk }, 200, corsHeaders)
      }

      case 'calculate_matching': {
        if (!profileId) {
          return jsonResponse({ error: 'profileId erforderlich' }, 400, corsHeaders)
        }

        const config = getConfig('matching')
        if (!config) {
          return jsonResponse({ message: 'Matching Bonus deaktiviert' }, 200, corsHeaders)
        }

        const month = periodMonth || new Date().toISOString().substring(0, 7) + '-01'

        const { data: directDownline } = await supabase
          .from('user_hierarchy')
          .select('user_id')
          .eq('ancestor_id', profileId)
          .eq('level_number', 1)

        if (!directDownline || directDownline.length === 0) {
          return jsonResponse({ message: 'Keine direkte Downline' }, 200, corsHeaders)
        }

        const downlineIds = directDownline.map((d: any) => d.user_id)

        const { data: downlineCommissions } = await supabase
          .from('commissions')
          .select('commission_amount')
          .in('partner_id', downlineIds)
          .gte('created_at', month)

        if (!downlineCommissions || downlineCommissions.length === 0) {
          return jsonResponse({ message: 'Keine Downline-Provisionen im Zeitraum' }, 200, corsHeaders)
        }

        const totalDownlineCommissions = downlineCommissions.reduce((sum: number, c: any) => sum + Number(c.commission_amount), 0)
        const matchingBonus = totalDownlineCommissions * (config.value / 100)

        if (matchingBonus <= 0) {
          return jsonResponse({ message: 'Matching Bonus ist 0' }, 200, corsHeaders)
        }

        const { data: existingBonus } = await supabase
          .from('bonus_payouts')
          .select('id')
          .eq('profile_id', profileId)
          .eq('bonus_type', 'matching')
          .eq('period_month', month)
          .maybeSingle()

        if (existingBonus) {
          return jsonResponse({ message: 'Matching Bonus bereits berechnet für diesen Monat' }, 200, corsHeaders)
        }

        await supabase.from('bonus_payouts').insert({
          profile_id: profileId,
          bonus_config_id: config.id,
          bonus_type: 'matching',
          amount: matchingBonus,
          period_month: month,
          description: `Matching Bonus: ${config.value}%`,
        })

        const walletOk = await creditWallet(supabaseUrl, supabaseServiceKey, profileId, matchingBonus, 'bonus', null, 'matching_bonus')

        return jsonResponse({
          success: true,
          matching_bonus: matchingBonus,
          downline_commissions: totalDownlineCommissions,
          percentage: config.value,
          wallet_credited: walletOk
        }, 200, corsHeaders)
      }

      case 'calculate_performance': {
        if (!profileId) {
          return jsonResponse({ error: 'profileId erforderlich' }, 400, corsHeaders)
        }

        const config = getConfig('performance')
        if (!config) {
          return jsonResponse({ message: 'Performance Bonus deaktiviert' }, 200, corsHeaders)
        }

        const month = periodMonth || new Date().toISOString().substring(0, 7) + '-01'

        const { data: volume } = await supabase
          .from('volume_tracking')
          .select('*')
          .eq('profile_id', profileId)
          .eq('period_month', month)
          .single()

        if (!volume) {
          return jsonResponse({ message: 'Keine Volumendaten für diesen Monat' }, 200, corsHeaders)
        }

        if (Number(volume.group_volume) < Number(config.min_group_volume || 0)) {
          return jsonResponse({
            message: 'Gruppenvolumen-Ziel nicht erreicht',
            current_gv: volume.group_volume,
            required_gv: config.min_group_volume
          }, 200, corsHeaders)
        }

        const bonusAmount = config.calculation_type === 'percentage'
          ? Number(volume.group_volume) * (config.value / 100)
          : config.value

        const { data: existing } = await supabase
          .from('bonus_payouts')
          .select('id')
          .eq('profile_id', profileId)
          .eq('bonus_type', 'performance')
          .eq('period_month', month)
          .maybeSingle()

        if (existing) {
          return jsonResponse({ message: 'Performance Bonus bereits vergeben' }, 200, corsHeaders)
        }

        await supabase.from('bonus_payouts').insert({
          profile_id: profileId,
          bonus_config_id: config.id,
          bonus_type: 'performance',
          amount: bonusAmount,
          period_month: month,
          description: `Performance Bonus: GV €${volume.group_volume}`,
        })

        const walletOk = await creditWallet(supabaseUrl, supabaseServiceKey, profileId, bonusAmount, 'bonus', null, 'performance_bonus')

        return jsonResponse({ success: true, bonus_amount: bonusAmount, group_volume: volume.group_volume, wallet_credited: walletOk }, 200, corsHeaders)
      }

      case 'check_rank_advancement': {
        if (!profileId) {
          return jsonResponse({ error: 'profileId erforderlich' }, 400, corsHeaders)
        }

        const { data: ranks } = await supabase
          .from('ranks')
          .select('*')
          .order('level', { ascending: true })

        if (!ranks || ranks.length === 0) {
          return jsonResponse({ message: 'Keine Ränge konfiguriert' }, 200, corsHeaders)
        }

        const { data: currentRankHistory } = await supabase
          .from('rank_history')
          .select('*, rank:ranks!rank_id(*)')
          .eq('profile_id', profileId)
          .order('achieved_at', { ascending: false })
          .limit(1)

        const currentRankLevel = (currentRankHistory as any)?.[0]?.rank?.level || 0

        const { data: directPartners } = await supabase
          .from('user_hierarchy')
          .select('user_id')
          .eq('ancestor_id', profileId)
          .eq('level_number', 1)
          .eq('is_active_for_commission', true)

        const { data: allDownline } = await supabase
          .from('user_hierarchy')
          .select('user_id')
          .eq('ancestor_id', profileId)

        const directCount = directPartners?.length || 0
        const teamSize = allDownline?.length || 0

        let qualifiedRank: any = null
        for (const rank of ranks) {
          if ((rank as any).level <= currentRankLevel) continue
          if (directCount >= (rank as any).min_direct_partners && teamSize >= (rank as any).min_team_contracts) {
            qualifiedRank = rank
          }
        }

        if (!qualifiedRank) {
          return jsonResponse({
            message: 'Kein Rang-Aufstieg qualifiziert',
            current_rank_level: currentRankLevel,
            direct_partners: directCount,
            team_size: teamSize,
          }, 200, corsHeaders)
        }

        await supabase.from('rank_history').insert({
          profile_id: profileId,
          rank_id: qualifiedRank.id,
          previous_rank_id: (currentRankHistory as any)?.[0]?.rank_id || null,
          rank_name: qualifiedRank.name,
          previous_rank_name: (currentRankHistory as any)?.[0]?.rank_name || 'Kein Rang',
          qualification_snapshot: {
            direct_partners: directCount,
            team_size: teamSize,
          },
        })

        const advancementConfig = getConfig('rank_advancement')
        if (advancementConfig) {
          const bonusAmount = advancementConfig.value * qualifiedRank.level
          await supabase.from('bonus_payouts').insert({
            profile_id: profileId,
            bonus_config_id: advancementConfig.id,
            bonus_type: 'rank_advancement',
            amount: bonusAmount,
            description: `Rang-Aufstieg: ${qualifiedRank.name}`,
          })
          const walletOk = await creditWallet(supabaseUrl, supabaseServiceKey, profileId, bonusAmount, 'bonus', null, 'rank_advancement_bonus')
          if (!walletOk) console.error('Rank advancement wallet credit failed for', profileId)
        }

        await supabase.from('audit_log').insert({
          action: 'RANK_ADVANCEMENT',
          table_name: 'rank_history',
          record_id: profileId,
          new_data: { new_rank: qualifiedRank.name, level: qualifiedRank.level },
        })

        return jsonResponse({
          success: true,
          new_rank: qualifiedRank.name,
          rank_level: qualifiedRank.level,
          bonus_applied: !!advancementConfig,
        }, 200, corsHeaders)
      }

      default:
        return jsonResponse({ error: 'Unbekannte Aktion' }, 400, corsHeaders)
    }

  } catch (error) {
    console.error('Bonus engine error:', (error as Error).message)
    return jsonResponse({ error: 'Bonus-Engine Fehler' }, 500, getCorsHeaders(req))
  }
})

async function creditWallet(
  supabaseUrl: string,
  supabaseServiceKey: string,
  profileId: string,
  amount: number,
  transactionType: string,
  referenceId: string | null,
  referenceType: string
): Promise<boolean> {
  try {
    const res = await fetch(`${supabaseUrl}/functions/v1/wallet-engine`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${supabaseServiceKey}`,
      },
      body: JSON.stringify({
        action: 'credit',
        profileId,
        amount,
        transactionType,
        referenceId,
        referenceType,
        description: `${referenceType}: €${amount.toFixed(2)}`,
      }),
    })
    if (!res.ok) {
      const errBody = await res.text()
      console.error(`creditWallet failed for ${referenceType}:`, res.status, errBody)
      return false
    }
    return true
  } catch (e) {
    console.error('creditWallet network error:', (e as Error).message)
    return false
  }
}
