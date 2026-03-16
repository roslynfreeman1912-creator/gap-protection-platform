import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { getCorsHeaders, jsonResponse, authenticateRequest, authenticateServiceCall, getSupabaseAdmin } from '../_shared/auth.ts'

interface CommissionAction {
  action: 'list' | 'get' | 'create' | 'update' | 'delete' | 'update-status' | 'pay' | 'pay-batch' | 'stats'
  commissionId?: string
  commissionIds?: string[]
  status?: 'pending' | 'approved' | 'paid' | 'cancelled'
  data?: {
    partner_id?: string
    commission_amount?: number
    commission_type?: string
    level_number?: number
    status?: string
  }
  filters?: {
    partnerId?: string
    status?: string
    dateFrom?: string
    dateTo?: string
    page?: number
    limit?: number
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

    const { action, commissionId, commissionIds, status, data, filters }: CommissionAction = await req.json()
    console.log('Admin Commissions Action:', action)

    switch (action) {
      case 'list': {
        const page = filters?.page || 1
        const limit = filters?.limit || 50
        const offset = (page - 1) * limit

        let query = supabase
          .from('commissions')
          .select(`
            *,
            partner:profiles!commissions_partner_id_fkey (
              id, first_name, last_name, email
            ),
            transaction:transactions!commissions_transaction_id_fkey (
              id, amount, status, created_at,
              customer:profiles!transactions_customer_id_fkey (
                first_name, last_name
              )
            )
          `, { count: 'exact' })
          .order('created_at', { ascending: false })
          .range(offset, offset + limit - 1)

        if (filters?.partnerId) {
          query = query.eq('partner_id', filters.partnerId)
        }
        if (filters?.status) {
          query = query.eq('status', filters.status)
        }
        if (filters?.dateFrom) {
          query = query.gte('created_at', filters.dateFrom)
        }
        if (filters?.dateTo) {
          query = query.lte('created_at', filters.dateTo)
        }

        const { data: commissions, count, error } = await query
        if (error) throw error

        return new Response(
          JSON.stringify({
            commissions,
            pagination: { page, limit, total: count }
          }),
          { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )
      }

      case 'stats': {
        const { data: pendingData } = await supabase
          .from('commissions')
          .select('commission_amount')
          .eq('status', 'pending')

        const { data: approvedData } = await supabase
          .from('commissions')
          .select('commission_amount')
          .eq('status', 'approved')

        const { data: paidData } = await supabase
          .from('commissions')
          .select('commission_amount')
          .eq('status', 'paid')

        const pendingAmount = pendingData?.reduce((sum, c) => sum + Number(c.commission_amount), 0) || 0
        const approvedAmount = approvedData?.reduce((sum, c) => sum + Number(c.commission_amount), 0) || 0
        const paidAmount = paidData?.reduce((sum, c) => sum + Number(c.commission_amount), 0) || 0

        const { count: pendingCount } = await supabase.from('commissions').select('*', { count: 'exact', head: true }).eq('status', 'pending')
        const { count: approvedCount } = await supabase.from('commissions').select('*', { count: 'exact', head: true }).eq('status', 'approved')
        const { count: paidCount } = await supabase.from('commissions').select('*', { count: 'exact', head: true }).eq('status', 'paid')

        return new Response(
          JSON.stringify({
            stats: {
              pending: { count: pendingCount || 0, amount: pendingAmount },
              approved: { count: approvedCount || 0, amount: approvedAmount },
              paid: { count: paidCount || 0, amount: paidAmount },
              total: { 
                count: (pendingCount || 0) + (approvedCount || 0) + (paidCount || 0),
                amount: pendingAmount + approvedAmount + paidAmount
              }
            }
          }),
          { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )
      }

      case 'create': {
        if (!data?.partner_id || !data?.commission_amount) {
          throw new Error('Partner-ID und Betrag erforderlich')
        }

        // Create a dummy transaction for manual commissions
        const { data: transaction, error: txError } = await supabase
          .from('transactions')
          .insert({
            customer_id: data.partner_id,
            amount: data.commission_amount,
            status: 'completed',
            payment_method: 'manual'
          })
          .select()
          .single()

        if (txError) throw txError

        const { data: commission, error } = await supabase
          .from('commissions')
          .insert({
            partner_id: data.partner_id,
            transaction_id: transaction.id,
            commission_amount: data.commission_amount,
            base_amount: data.commission_amount,
            commission_type: data.commission_type || 'fixed',
            level_number: data.level_number || 1,
            status: data.status || 'pending'
          })
          .select()
          .single()

        if (error) throw error

        await supabase.from('audit_log').insert({
          action: 'COMMISSION_CREATED',
          table_name: 'commissions',
          record_id: commission.id,
          new_data: commission
        })

        return new Response(
          JSON.stringify({ success: true, commission }),
          { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )
      }

      case 'update': {
        if (!commissionId) throw new Error('Commission-ID erforderlich')

        const { data: oldCommission } = await supabase
          .from('commissions')
          .select('*')
          .eq('id', commissionId)
          .single()

        const updateData: any = {}
        if (data?.commission_amount !== undefined) updateData.commission_amount = data.commission_amount
        if (data?.commission_type !== undefined) updateData.commission_type = data.commission_type
        if (data?.level_number !== undefined) updateData.level_number = data.level_number
        if (data?.status !== undefined) {
          updateData.status = data.status
          if (data.status === 'paid') {
            updateData.paid_at = new Date().toISOString()
          }
        }

        const { data: updated, error } = await supabase
          .from('commissions')
          .update(updateData)
          .eq('id', commissionId)
          .select()
          .single()

        if (error) throw error

        await supabase.from('audit_log').insert({
          action: 'COMMISSION_UPDATED',
          table_name: 'commissions',
          record_id: commissionId,
          old_data: oldCommission,
          new_data: updated
        })

        return new Response(
          JSON.stringify({ success: true, commission: updated }),
          { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )
      }

      case 'delete': {
        if (!commissionId) throw new Error('Commission-ID erforderlich')

        const { data: commission } = await supabase
          .from('commissions')
          .select('*')
          .eq('id', commissionId)
          .single()

        const { error } = await supabase
          .from('commissions')
          .delete()
          .eq('id', commissionId)

        if (error) throw error

        await supabase.from('audit_log').insert({
          action: 'COMMISSION_DELETED',
          table_name: 'commissions',
          record_id: commissionId,
          old_data: commission
        })

        return new Response(
          JSON.stringify({ success: true }),
          { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )
      }

      case 'update-status': {
        if (!commissionId || !status) throw new Error('Commission-ID und Status erforderlich')

        const { data: oldCommission } = await supabase
          .from('commissions')
          .select('*')
          .eq('id', commissionId)
          .single()

        const updateData: any = { status }
        if (status === 'paid') {
          updateData.paid_at = new Date().toISOString()
        }

        const { data: updated, error } = await supabase
          .from('commissions')
          .update(updateData)
          .eq('id', commissionId)
          .select()
          .single()

        if (error) throw error

        await supabase.from('audit_log').insert({
          action: 'COMMISSION_STATUS_UPDATED',
          table_name: 'commissions',
          record_id: commissionId,
          old_data: oldCommission,
          new_data: updated
        })

        return new Response(
          JSON.stringify({ success: true, commission: updated }),
          { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )
      }

      case 'pay-batch': {
        if (!commissionIds?.length) throw new Error('Commission-IDs erforderlich')

        const { data: updated, error } = await supabase
          .from('commissions')
          .update({ status: 'paid', paid_at: new Date().toISOString() })
          .in('id', commissionIds)
          .eq('status', 'approved')
          .select()

        if (error) throw error

        await supabase.from('audit_log').insert({
          action: 'COMMISSION_BATCH_PAID',
          table_name: 'commissions',
          record_id: commissionIds[0],
          new_data: { paid_count: updated?.length || 0, commission_ids: commissionIds }
        })

        return new Response(
          JSON.stringify({ success: true, paidCount: updated?.length || 0 }),
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
    console.error('Admin Commissions Error:', error)
    const message = error instanceof Error ? error.message : 'Interner Serverfehler'
    return new Response(
      JSON.stringify({ error: message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})
