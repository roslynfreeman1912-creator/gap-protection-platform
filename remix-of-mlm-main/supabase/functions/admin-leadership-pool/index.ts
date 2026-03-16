import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { getCorsHeaders, jsonResponse, authenticateRequest, authenticateServiceCall, getSupabaseAdmin } from '../_shared/auth.ts'

interface PoolAction {
  action: 'list-qualifications' | 'list-payouts' | 'calculate' | 'update-qualification' | 'create-qualification' | 'delete-qualification' | 'create-payout' | 'create-single-payout' | 'update-payout' | 'delete-payout' | 'pay-payout' | 'stats' | 'config'
  qualificationId?: string
  payoutId?: string
  partnerId?: string
  data?: Record<string, any>
  filters?: {
    poolLevel?: string
    isQualified?: boolean
    page?: number
    limit?: number
  }
}

const POOL_LEVELS = {
  business_partner_plus: {
    name: 'Business Partner Plus',
    shares: 1,
    directPartners: 5,
    activeContracts: 500
  },
  national_partner: {
    name: 'National Partner',
    shares: 3,
    directPartners: 5,
    activeContracts: 1500,
    level1Partners: 3
  },
  world_partner: {
    name: 'World Partner',
    shares: 7,
    directPartners: 7,
    activeContracts: 7500,
    level1Partners: 5,
    level2Partners: 3
  }
}

serve(async (req) => {
  const corsHeaders = getCorsHeaders(req)

  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders })
  }

  try {
    const serviceAuth = authenticateServiceCall(req, corsHeaders)
    if (!serviceAuth.ok) {
      const authResult = await authenticateRequest(req, corsHeaders, { allowedRoles: ['admin', 'super_admin'] })
      if (authResult.response) return authResult.response
    }
    const { supabase } = getSupabaseAdmin()

    const { action, qualificationId, payoutId, partnerId, data, filters }: PoolAction = await req.json()
    console.log('Admin Leadership Pool Action:', action)

    switch (action) {
      case 'config': {
        const { data: config } = await supabase
          .from('pool_config')
          .select('*')
          .eq('is_active', true)
          .single()

        return new Response(
          JSON.stringify({ config, levels: POOL_LEVELS }),
          { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )
      }

      case 'list-qualifications': {
        const page = filters?.page || 1
        const limit = filters?.limit || 50
        const offset = (page - 1) * limit

        let query = supabase
          .from('leadership_qualifications')
          .select(`
            *,
            partner:profiles!leadership_qualifications_partner_id_fkey (
              id, first_name, last_name, email, status
            )
          `, { count: 'exact' })
          .order('shares_count', { ascending: false })
          .range(offset, offset + limit - 1)

        if (filters?.poolLevel) {
          query = query.eq('pool_level', filters.poolLevel)
        }
        if (typeof filters?.isQualified === 'boolean') {
          query = query.eq('is_qualified', filters.isQualified)
        }

        const { data: qualifications, count, error } = await query
        if (error) throw error

        return new Response(
          JSON.stringify({
            qualifications,
            pagination: { page, limit, total: count }
          }),
          { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )
      }

      case 'list-payouts': {
        const page = filters?.page || 1
        const limit = filters?.limit || 50
        const offset = (page - 1) * limit

        const { data: payouts, count, error } = await supabase
          .from('leadership_pool_payouts')
          .select(`
            *,
            partner:profiles!leadership_pool_payouts_partner_id_fkey (
              id, first_name, last_name, email
            )
          `, { count: 'exact' })
          .order('created_at', { ascending: false })
          .range(offset, offset + limit - 1)

        if (error) throw error

        return new Response(
          JSON.stringify({
            payouts,
            pagination: { page, limit, total: count }
          }),
          { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )
      }

      case 'stats': {
        const { data: transactions } = await supabase
          .from('transactions')
          .select('amount')
          .eq('status', 'completed')

        const totalRevenue = transactions?.reduce((sum, t) => sum + Number(t.amount), 0) || 0
        
        const { data: config } = await supabase
          .from('pool_config')
          .select('percentage_cap')
          .eq('is_active', true)
          .single()

        const poolPercentage = config?.percentage_cap || 2
        const poolAmount = totalRevenue * (poolPercentage / 100)

        const { data: qualifications } = await supabase
          .from('leadership_qualifications')
          .select('pool_level, shares_count, is_qualified')
          .eq('is_qualified', true)

        const bppCount = qualifications?.filter(q => q.pool_level === 'business_partner_plus').length || 0
        const npCount = qualifications?.filter(q => q.pool_level === 'national_partner').length || 0
        const wpCount = qualifications?.filter(q => q.pool_level === 'world_partner').length || 0

        const totalShares = (bppCount * 1) + (npCount * 3) + (wpCount * 7)
        const shareValue = totalShares > 0 ? poolAmount / totalShares : 0

        const { data: pendingPayouts } = await supabase
          .from('leadership_pool_payouts')
          .select('payout_amount')
          .eq('status', 'pending')

        const pendingAmount = pendingPayouts?.reduce((sum, p) => sum + Number(p.payout_amount), 0) || 0

        return new Response(
          JSON.stringify({
            stats: {
              totalRevenue,
              poolPercentage,
              poolAmount,
              totalShares,
              shareValue,
              pendingPayouts: pendingAmount,
              qualifiedPartners: {
                businessPartnerPlus: bppCount,
                nationalPartner: npCount,
                worldPartner: wpCount,
                total: bppCount + npCount + wpCount
              }
            }
          }),
          { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )
      }

      case 'create-qualification': {
        if (!data?.partner_id) throw new Error('Partner-ID erforderlich')

        const { data: qualification, error } = await supabase
          .from('leadership_qualifications')
          .insert({
            partner_id: data.partner_id,
            pool_level: data.pool_level || 'business_partner_plus',
            shares_count: data.shares_count || 1,
            is_qualified: data.is_qualified !== false,
            direct_partners_count: data.direct_partners_count || 0,
            active_contracts_count: data.active_contracts_count || 0,
            level1_partners_count: data.level1_partners_count || 0,
            level2_partners_count: data.level2_partners_count || 0,
            qualified_at: data.is_qualified !== false ? new Date().toISOString() : null
          })
          .select()
          .single()

        if (error) throw error

        await supabase.from('audit_log').insert({
          action: 'QUALIFICATION_CREATED',
          table_name: 'leadership_qualifications',
          record_id: qualification.id,
          new_data: qualification
        })

        return new Response(
          JSON.stringify({ success: true, qualification }),
          { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )
      }

      case 'update-qualification': {
        if (!qualificationId) throw new Error('Qualification-ID erforderlich')

        const { data: oldQual } = await supabase
          .from('leadership_qualifications')
          .select('*')
          .eq('id', qualificationId)
          .single()

        const updateData: any = {}
        if (data?.pool_level !== undefined) updateData.pool_level = data.pool_level
        if (data?.shares_count !== undefined) updateData.shares_count = data.shares_count
        if (data?.is_qualified !== undefined) updateData.is_qualified = data.is_qualified
        if (data?.direct_partners_count !== undefined) updateData.direct_partners_count = data.direct_partners_count
        if (data?.active_contracts_count !== undefined) updateData.active_contracts_count = data.active_contracts_count
        if (data?.level1_partners_count !== undefined) updateData.level1_partners_count = data.level1_partners_count
        if (data?.level2_partners_count !== undefined) updateData.level2_partners_count = data.level2_partners_count
        updateData.updated_at = new Date().toISOString()

        const { data: updated, error } = await supabase
          .from('leadership_qualifications')
          .update(updateData)
          .eq('id', qualificationId)
          .select()
          .single()

        if (error) throw error

        await supabase.from('audit_log').insert({
          action: 'QUALIFICATION_UPDATED',
          table_name: 'leadership_qualifications',
          record_id: qualificationId,
          old_data: oldQual,
          new_data: updated
        })

        return new Response(
          JSON.stringify({ success: true, qualification: updated }),
          { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )
      }

      case 'delete-qualification': {
        if (!qualificationId) throw new Error('Qualification-ID erforderlich')

        const { data: qual } = await supabase
          .from('leadership_qualifications')
          .select('*')
          .eq('id', qualificationId)
          .single()

        const { error } = await supabase
          .from('leadership_qualifications')
          .delete()
          .eq('id', qualificationId)

        if (error) throw error

        await supabase.from('audit_log').insert({
          action: 'QUALIFICATION_DELETED',
          table_name: 'leadership_qualifications',
          record_id: qualificationId,
          old_data: qual
        })

        return new Response(
          JSON.stringify({ success: true }),
          { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )
      }

      case 'create-single-payout': {
        if (!data?.partner_id || !data?.payout_amount) {
          throw new Error('Partner-ID und Betrag erforderlich')
        }

        const now = new Date()
        const periodStart = new Date(now.getFullYear(), now.getMonth(), 1)
        const periodEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0)

        const { data: payout, error } = await supabase
          .from('leadership_pool_payouts')
          .insert({
            partner_id: data.partner_id,
            pool_level: data.pool_level || 'business_partner_plus',
            period_start: periodStart.toISOString().split('T')[0],
            period_end: periodEnd.toISOString().split('T')[0],
            total_pool_amount: data.payout_amount,
            total_shares: data.partner_shares || 1,
            share_value: data.payout_amount / (data.partner_shares || 1),
            partner_shares: data.partner_shares || 1,
            payout_amount: data.payout_amount,
            status: data.status || 'pending'
          })
          .select()
          .single()

        if (error) throw error

        await supabase.from('audit_log').insert({
          action: 'PAYOUT_CREATED',
          table_name: 'leadership_pool_payouts',
          record_id: payout.id,
          new_data: payout
        })

        return new Response(
          JSON.stringify({ success: true, payout }),
          { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )
      }

      case 'update-payout': {
        if (!payoutId) throw new Error('Payout-ID erforderlich')

        const { data: oldPayout } = await supabase
          .from('leadership_pool_payouts')
          .select('*')
          .eq('id', payoutId)
          .single()

        const updateData: any = {}
        if (data?.payout_amount !== undefined) updateData.payout_amount = data.payout_amount
        if (data?.partner_shares !== undefined) updateData.partner_shares = data.partner_shares
        if (data?.status !== undefined) {
          updateData.status = data.status
          if (data.status === 'paid') {
            updateData.paid_at = new Date().toISOString()
          }
        }

        const { data: updated, error } = await supabase
          .from('leadership_pool_payouts')
          .update(updateData)
          .eq('id', payoutId)
          .select()
          .single()

        if (error) throw error

        await supabase.from('audit_log').insert({
          action: 'PAYOUT_UPDATED',
          table_name: 'leadership_pool_payouts',
          record_id: payoutId,
          old_data: oldPayout,
          new_data: updated
        })

        return new Response(
          JSON.stringify({ success: true, payout: updated }),
          { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )
      }

      case 'delete-payout': {
        if (!payoutId) throw new Error('Payout-ID erforderlich')

        const { data: payout } = await supabase
          .from('leadership_pool_payouts')
          .select('*')
          .eq('id', payoutId)
          .single()

        const { error } = await supabase
          .from('leadership_pool_payouts')
          .delete()
          .eq('id', payoutId)

        if (error) throw error

        await supabase.from('audit_log').insert({
          action: 'PAYOUT_DELETED',
          table_name: 'leadership_pool_payouts',
          record_id: payoutId,
          old_data: payout
        })

        return new Response(
          JSON.stringify({ success: true }),
          { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )
      }

      case 'pay-payout': {
        if (!payoutId) throw new Error('Payout-ID erforderlich')

        const { data: updated, error } = await supabase
          .from('leadership_pool_payouts')
          .update({ 
            status: 'paid',
            paid_at: new Date().toISOString()
          })
          .eq('id', payoutId)
          .select()
          .single()

        if (error) throw error

        await supabase.from('audit_log').insert({
          action: 'PAYOUT_PAID',
          table_name: 'leadership_pool_payouts',
          record_id: payoutId,
          new_data: updated
        })

        return new Response(
          JSON.stringify({ success: true, payout: updated }),
          { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )
      }

      case 'calculate': {
        const { data: partners } = await supabase
          .from('user_roles')
          .select('user_id')
          .eq('role', 'partner')

        if (!partners?.length) {
          return new Response(
            JSON.stringify({ success: true, processed: 0 }),
            { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          )
        }

        let processed = 0
        let qualified = 0

        for (const partner of partners) {
          const partnerId = partner.user_id

          const { count: directPartners } = await supabase
            .from('user_hierarchy')
            .select('*', { count: 'exact', head: true })
            .eq('ancestor_id', partnerId)
            .eq('level_number', 1)

          const { data: teamMembers } = await supabase
            .from('user_hierarchy')
            .select('user_id')
            .eq('ancestor_id', partnerId)

          const teamIds = teamMembers?.map(m => m.user_id) || []
          
          let activeContracts = 0
          if (teamIds.length > 0) {
            const { count } = await supabase
              .from('transactions')
              .select('*', { count: 'exact', head: true })
              .in('customer_id', teamIds)
              .eq('status', 'completed')
            activeContracts = count || 0
          }

          const { data: level1Data } = await supabase
            .from('user_hierarchy')
            .select('user_id')
            .eq('ancestor_id', partnerId)
            .eq('level_number', 1)

          let level1Partners = 0
          if (level1Data) {
            for (const l1 of level1Data) {
              const { data: hasPartnerRole } = await supabase
                .from('user_roles')
                .select('id')
                .eq('user_id', l1.user_id)
                .eq('role', 'partner')
                .single()
              if (hasPartnerRole) level1Partners++
            }
          }

          const { data: level2Data } = await supabase
            .from('user_hierarchy')
            .select('user_id')
            .eq('ancestor_id', partnerId)
            .eq('level_number', 2)

          let level2Partners = 0
          if (level2Data) {
            for (const l2 of level2Data) {
              const { data: hasPartnerRole } = await supabase
                .from('user_roles')
                .select('id')
                .eq('user_id', l2.user_id)
                .eq('role', 'partner')
                .single()
              if (hasPartnerRole) level2Partners++
            }
          }

          let poolLevel: 'business_partner_plus' | 'national_partner' | 'world_partner' | null = null
          let sharesCount = 0
          let isQualified = false

          if (
            (directPartners || 0) >= 7 &&
            activeContracts >= 7500 &&
            level1Partners >= 5 &&
            level2Partners >= 3
          ) {
            poolLevel = 'world_partner'
            sharesCount = 7
            isQualified = true
          }
          else if (
            (directPartners || 0) >= 5 &&
            activeContracts >= 1500 &&
            level1Partners >= 3
          ) {
            poolLevel = 'national_partner'
            sharesCount = 3
            isQualified = true
          }
          else if (
            (directPartners || 0) >= 5 &&
            activeContracts >= 500
          ) {
            poolLevel = 'business_partner_plus'
            sharesCount = 1
            isQualified = true
          }

          if (poolLevel) {
            await supabase.from('leadership_qualifications').upsert({
              partner_id: partnerId,
              pool_level: poolLevel,
              shares_count: sharesCount,
              is_qualified: isQualified,
              direct_partners_count: directPartners || 0,
              active_contracts_count: activeContracts,
              level1_partners_count: level1Partners,
              level2_partners_count: level2Partners,
              qualified_at: isQualified ? new Date().toISOString() : null,
              updated_at: new Date().toISOString()
            }, { onConflict: 'partner_id' })

            if (isQualified) qualified++
          }

          processed++
        }

        return new Response(
          JSON.stringify({ success: true, processed, qualified }),
          { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )
      }

      case 'create-payout': {
        const periodStart = new Date()
        periodStart.setDate(1)
        periodStart.setHours(0, 0, 0, 0)
        
        const periodEnd = new Date(periodStart)
        periodEnd.setMonth(periodEnd.getMonth() + 1)
        periodEnd.setDate(0)

        const { data: transactions } = await supabase
          .from('transactions')
          .select('amount')
          .eq('status', 'completed')
          .gte('created_at', periodStart.toISOString())
          .lte('created_at', periodEnd.toISOString())

        const monthlyRevenue = transactions?.reduce((sum, t) => sum + Number(t.amount), 0) || 0
        
        const { data: config } = await supabase
          .from('pool_config')
          .select('percentage_cap')
          .eq('is_active', true)
          .single()

        const poolAmount = monthlyRevenue * ((config?.percentage_cap || 2) / 100)

        const { data: qualifications } = await supabase
          .from('leadership_qualifications')
          .select('*')
          .eq('is_qualified', true)

        if (!qualifications?.length) {
          return new Response(
            JSON.stringify({ success: true, payoutsCreated: 0, message: 'Keine qualifizierten Partner' }),
            { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          )
        }

        const totalShares = qualifications.reduce((sum, q) => sum + q.shares_count, 0)
        const shareValue = totalShares > 0 ? poolAmount / totalShares : 0

        let payoutsCreated = 0
        for (const qual of qualifications) {
          const payoutAmount = shareValue * qual.shares_count

          await supabase.from('leadership_pool_payouts').insert({
            partner_id: qual.partner_id,
            pool_level: qual.pool_level,
            period_start: periodStart.toISOString().split('T')[0],
            period_end: periodEnd.toISOString().split('T')[0],
            total_pool_amount: poolAmount,
            total_shares: totalShares,
            share_value: shareValue,
            partner_shares: qual.shares_count,
            payout_amount: payoutAmount,
            status: 'pending'
          })

          payoutsCreated++
        }

        return new Response(
          JSON.stringify({ 
            success: true, 
            payoutsCreated, 
            poolAmount, 
            totalShares,
            shareValue 
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
    console.error('Admin Leadership Pool Error:', error)
    const message = error instanceof Error ? error.message : 'Interner Serverfehler'
    return new Response(
      JSON.stringify({ error: message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})
