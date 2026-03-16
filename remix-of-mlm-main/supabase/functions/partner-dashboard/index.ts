import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { getCorsHeaders, jsonResponse, authenticateRequest, getSupabaseAdmin } from '../_shared/auth.ts'

interface DashboardAction {
  action: 'stats' | 'hierarchy' | 'commissions' | 'codes' | 'leadership' | 'full'
}

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

    // Check if partner
    const isPartner = auth.roles.includes('partner') || auth.roles.includes('admin')
    const isAdmin = auth.roles.includes('admin')

    const { action }: DashboardAction = await req.json()
    console.log('Partner Dashboard Action:', action, 'Profile:', profile.id)

    // Get hierarchy data (team under this partner)
    const getHierarchy = async () => {
      const { data: hierarchy } = await supabase
        .from('user_hierarchy')
        .select(`
          id,
          user_id,
          level_number,
          is_active_for_commission,
          created_at,
          user:profiles!user_hierarchy_user_id_fkey (
            id, first_name, last_name, email, status, created_at
          )
        `)
        .eq('ancestor_id', profile.id)
        .order('level_number', { ascending: true })

      return hierarchy || []
    }

    // Get commissions
    const getCommissions = async () => {
      const { data: commissions } = await supabase
        .from('commissions')
        .select(`
          *,
          transaction:transactions!commissions_transaction_id_fkey (
            id, amount, created_at,
            customer:profiles!transactions_customer_id_fkey (
              first_name, last_name
            )
          )
        `)
        .eq('partner_id', profile.id)
        .order('created_at', { ascending: false })
        .limit(100)

      return commissions || []
    }

    // Get promotion codes
    const getCodes = async () => {
      const { data: codes } = await supabase
        .from('promotion_codes')
        .select('*')
        .eq('partner_id', profile.id)
        .order('created_at', { ascending: false })

      return codes || []
    }

    // Get leadership qualification
    const getLeadership = async () => {
      const { data: qualification } = await supabase
        .from('leadership_qualifications')
        .select('*')
        .eq('partner_id', profile.id)
        .single()

      const { data: payouts } = await supabase
        .from('leadership_pool_payouts')
        .select('*')
        .eq('partner_id', profile.id)
        .order('created_at', { ascending: false })
        .limit(12)

      return { qualification, payouts: payouts || [] }
    }

    // Calculate stats — accepts optional pre-fetched data to avoid redundant DB queries
    // (e.g. when called from the 'full' action that already fetches hierarchy/commissions/codes)
    const getStats = async (
      prefetchedHierarchy?: Awaited<ReturnType<typeof getHierarchy>>,
      prefetchedCommissions?: Awaited<ReturnType<typeof getCommissions>>,
      prefetchedCodes?: Awaited<ReturnType<typeof getCodes>>,
    ) => {
      const hierarchy = prefetchedHierarchy ?? await getHierarchy()
      const commissions = prefetchedCommissions ?? await getCommissions()
      const codes = prefetchedCodes ?? await getCodes()

      const level1Partners = hierarchy.filter(h => h.level_number === 1).length
      const level2Partners = hierarchy.filter(h => h.level_number === 2).length
      const totalTeam = hierarchy.length

      const pendingCommissions = commissions
        .filter(c => c.status === 'pending')
        .reduce((sum, c) => sum + Number(c.commission_amount), 0)
      
      const approvedCommissions = commissions
        .filter(c => c.status === 'approved')
        .reduce((sum, c) => sum + Number(c.commission_amount), 0)
      
      const paidCommissions = commissions
        .filter(c => c.status === 'paid')
        .reduce((sum, c) => sum + Number(c.commission_amount), 0)

      const totalCodeUsage = codes.reduce((sum, c) => sum + (c.usage_count || 0), 0)
      const activeCodes = codes.filter(c => c.is_active).length

      return {
        directPartners: level1Partners,
        level1Partners,
        level2Partners,
        totalTeam,
        pendingCommissions,
        approvedCommissions,
        paidCommissions,
        totalCommissions: pendingCommissions + approvedCommissions + paidCommissions,
        activeCodes,
        totalCodeUsage
      }
    }

    switch (action) {
      case 'stats': {
        const stats = await getStats()
        return new Response(
          JSON.stringify({ stats, isPartner, isAdmin }),
          { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )
      }

      case 'hierarchy': {
        const hierarchy = await getHierarchy()
        return new Response(
          JSON.stringify({ hierarchy }),
          { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )
      }

      case 'commissions': {
        const commissions = await getCommissions()
        return new Response(
          JSON.stringify({ commissions }),
          { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )
      }

      case 'codes': {
        const codes = await getCodes()
        return new Response(
          JSON.stringify({ codes }),
          { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )
      }

      case 'leadership': {
        const leadership = await getLeadership()
        return new Response(
          JSON.stringify(leadership),
          { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )
      }

      case 'full': {
        // Fetch each dataset once, then pass into getStats to avoid redundant queries
        const [hierarchy, commissions, codes, leadership] = await Promise.all([
          getHierarchy(),
          getCommissions(),
          getCodes(),
          getLeadership()
        ])
        const stats = await getStats(hierarchy, commissions, codes)

        return new Response(
          JSON.stringify({
            profile,
            roles: auth.roles || [],
            isPartner,
            isAdmin,
            stats,
            hierarchy,
            commissions,
            codes,
            leadership
          }),
          { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )
      }

      default:
        return new Response(
          JSON.stringify({ error: 'Ungültige Aktion' }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )
    }

  } catch (error: unknown) {
    console.error('Partner Dashboard Error:', error)
    const message = error instanceof Error ? error.message : 'Interner Serverfehler'
    return new Response(
      JSON.stringify({ error: message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})
