import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { getCorsHeaders, jsonResponse, authenticateRequest, getSupabaseAdmin } from '../_shared/auth.ts'

// Get comprehensive dashboard statistics for a partner
serve(async (req) => {
  const corsHeaders = getCorsHeaders(req)

  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders })
  }

  try {
    const { supabase } = getSupabaseAdmin()

    // Authenticate user
    const authResult = await authenticateRequest(req, corsHeaders)
    if (authResult.response) return authResult.response
    const { auth } = authResult

    // Get profile
    const { data: profile } = await supabase
      .from('profiles')
      .select('*')
      .eq('user_id', auth.user.id)
      .single()

    if (!profile) {
      return jsonResponse({ error: 'Profil nicht gefunden' }, 404, corsHeaders)
    }
    
    // Get hierarchy (people under this partner)
    const { data: hierarchy } = await supabase
      .from('user_hierarchy')
      .select(`
        id,
        user_id,
        level_number,
        is_active_for_commission
      `)
      .eq('ancestor_id', profile.id)
    
    // Get commissions
    const { data: commissions } = await supabase
      .from('commissions')
      .select('*')
      .eq('partner_id', profile.id)
    
    // Get promotion code usage
    const { data: promoCodes } = await supabase
      .from('promotion_codes')
      .select('code, usage_count, max_uses')
      .eq('partner_id', profile.id)
    
    // Get transactions (own + team)
    const teamUserIds = hierarchy?.map(h => h.user_id) || []
    const { data: teamTransactions } = await supabase
      .from('transactions')
      .select('amount, status')
      .in('customer_id', [...teamUserIds, profile.id])
      .eq('status', 'completed')
    
    // Calculate stats
    const level1Partners = hierarchy?.filter(h => h.level_number === 1).length || 0
    const level2Partners = hierarchy?.filter(h => h.level_number === 2).length || 0
    const level3Partners = hierarchy?.filter(h => h.level_number === 3).length || 0
    const level4Partners = hierarchy?.filter(h => h.level_number === 4).length || 0
    const level5Partners = hierarchy?.filter(h => h.level_number === 5).length || 0
    const activeForCommission = hierarchy?.filter(h => h.is_active_for_commission).length || 0
    
    const pendingCommissions = commissions?.filter(c => c.status === 'pending')
      .reduce((sum, c) => sum + Number(c.commission_amount), 0) || 0
    const approvedCommissions = commissions?.filter(c => c.status === 'approved')
      .reduce((sum, c) => sum + Number(c.commission_amount), 0) || 0
    const paidCommissions = commissions?.filter(c => c.status === 'paid')
      .reduce((sum, c) => sum + Number(c.commission_amount), 0) || 0
    
    const totalTeamRevenue = teamTransactions?.reduce((sum, t) => sum + Number(t.amount), 0) || 0
    
    // Leadership qualification check
    const totalTeamContracts = hierarchy?.length || 0
    let qualificationLevel = 'none'
    let sharesCount = 0
    
    // Business Partner Plus: 5 direct partners + 500 team contracts
    if (level1Partners >= 5 && totalTeamContracts >= 500) {
      qualificationLevel = 'business_partner_plus'
      sharesCount = 1
    }
    
    // National Partner: Level 1 criteria + 1500 contracts + 3 Level 1 partners
    const activeLevel1 = hierarchy?.filter(h => h.level_number === 1 && h.is_active_for_commission).length || 0
    if (level1Partners >= 5 && totalTeamContracts >= 1500 && activeLevel1 >= 3) {
      qualificationLevel = 'national_partner'
      sharesCount = 3
    }
    
    // World Partner: 7 direct (5 L1 + 3 L2) + 7500 contracts
    if (level1Partners >= 5 && level2Partners >= 3 && totalTeamContracts >= 7500) {
      qualificationLevel = 'world_partner'
      sharesCount = 7
    }
    
    return new Response(
      JSON.stringify({
        profile: {
          id: profile.id,
          firstName: profile.first_name,
          lastName: profile.last_name,
          email: profile.email,
          domain: profile.domain,
          status: profile.status,
          role: profile.role,
        },
        hierarchy: {
          total: hierarchy?.length || 0,
          activeForCommission,
          level1: level1Partners,
          level2: level2Partners,
          level3: level3Partners,
          level4: level4Partners,
          level5: level5Partners,
        },
        commissions: {
          pending: pendingCommissions,
          approved: approvedCommissions,
          paid: paidCommissions,
          total: pendingCommissions + approvedCommissions + paidCommissions,
          count: commissions?.length || 0,
        },
        promotionCodes: promoCodes || [],
        revenue: {
          team: totalTeamRevenue,
          contracts: totalTeamContracts,
        },
        leadership: {
          level: qualificationLevel,
          shares: sharesCount,
          progress: {
            directPartners: level1Partners,
            directPartnersRequired: qualificationLevel === 'none' ? 5 : 
              (qualificationLevel === 'business_partner_plus' ? 5 : 7),
            teamContracts: totalTeamContracts,
            teamContractsRequired: qualificationLevel === 'none' ? 500 : 
              (qualificationLevel === 'business_partner_plus' ? 1500 : 7500),
          }
        }
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
    
  } catch (error) {
    console.error('Get dashboard stats error:', error)
    return new Response(
      JSON.stringify({ error: 'Dashboard-Daten konnten nicht geladen werden' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})
