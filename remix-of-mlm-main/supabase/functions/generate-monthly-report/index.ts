import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { getCorsHeaders, jsonResponse, authenticateRequest, authenticateServiceCall, getSupabaseAdmin } from '../_shared/auth.ts'

interface MonthlyReportRequest {
  partnerId?: string
  month?: string // Format: YYYY-MM
  action?: 'generate' | 'list' | 'single'
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

    const { partnerId, month, action = 'generate' }: MonthlyReportRequest = await req.json()
    const targetPartnerId = partnerId || 'unknown'
    const targetMonth = month || new Date().toISOString().slice(0, 7)

    console.log('Monthly report:', action, 'Partner:', targetPartnerId, 'Month:', targetMonth)

    switch (action) {
      case 'list': {
        // Get all available reports for this partner
        const { data: reports, error } = await supabase
          .from('customer_monthly_reports')
          .select('*')
          .eq('user_id', targetPartnerId)
          .order('report_month', { ascending: false })
          .limit(24)

        if (error) throw error

        return new Response(
          JSON.stringify({ reports: reports || [] }),
          { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )
      }

      case 'single': {
        const { data: report } = await supabase
          .from('customer_monthly_reports')
          .select('*')
          .eq('user_id', targetPartnerId)
          .eq('report_month', targetMonth)
          .single()

        return new Response(
          JSON.stringify({ report }),
          { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )
      }

      case 'generate': {
        // Calculate date range
        const [year, monthNum] = targetMonth.split('-').map(Number)
        const startDate = new Date(year, monthNum - 1, 1).toISOString()
        const endDate = new Date(year, monthNum, 0, 23, 59, 59).toISOString()

        // Get partner info
        const { data: partnerInfo } = await supabase
          .from('profiles')
          .select('first_name, last_name, email')
          .eq('id', targetPartnerId)
          .single()

        // Get commissions for this month
        const { data: commissions } = await supabase
          .from('commissions')
          .select(`
            *,
            transaction:transactions!commissions_transaction_id_fkey (
              id, amount, created_at,
              customer:profiles!transactions_customer_id_fkey (first_name, last_name)
            )
          `)
          .eq('partner_id', targetPartnerId)
          .gte('created_at', startDate)
          .lte('created_at', endDate)

        // Get hierarchy changes
        const { data: newPartners } = await supabase
          .from('user_hierarchy')
          .select(`
            level_number, created_at,
            user:profiles!user_hierarchy_user_id_fkey (first_name, last_name, email)
          `)
          .eq('ancestor_id', targetPartnerId)
          .gte('created_at', startDate)
          .lte('created_at', endDate)

        // Get transactions in team
        const { data: teamHierarchy } = await supabase
          .from('user_hierarchy')
          .select('user_id')
          .eq('ancestor_id', targetPartnerId)

        const teamUserIds = teamHierarchy?.map(h => h.user_id) || []
        
        const { data: teamTransactions } = await supabase
          .from('transactions')
          .select('id, amount, status, created_at')
          .in('customer_id', [...teamUserIds, targetPartnerId])
          .gte('created_at', startDate)
          .lte('created_at', endDate)
          .eq('status', 'completed')

        // Calculate VAT (19%)
        const VAT_RATE = 0.19
        const commissionsArray = commissions || []
        
        const pendingAmount = commissionsArray.filter(c => c.status === 'pending')
          .reduce((sum, c) => sum + Number(c.commission_amount), 0)
        const approvedAmount = commissionsArray.filter(c => c.status === 'approved')
          .reduce((sum, c) => sum + Number(c.commission_amount), 0)
        const paidAmount = commissionsArray.filter(c => c.status === 'paid')
          .reduce((sum, c) => sum + Number(c.commission_amount), 0)
        const totalCommission = pendingAmount + approvedAmount + paidAmount

        const teamRevenue = (teamTransactions || [])
          .reduce((sum, t) => sum + Number(t.amount), 0)

        // Level breakdown
        const levelBreakdown: Record<number, number> = {}
        commissionsArray.forEach(c => {
          levelBreakdown[c.level_number] = (levelBreakdown[c.level_number] || 0) + Number(c.commission_amount)
        })

        // Report data
        const reportData = {
          period: targetMonth,
          generatedAt: new Date().toISOString(),
          partner: {
            id: targetPartnerId,
            name: `${partnerInfo?.first_name} ${partnerInfo?.last_name}`,
            email: partnerInfo?.email
          },
          summary: {
            totalCommission: {
              gross: totalCommission,
              vat: totalCommission * VAT_RATE,
              net: totalCommission * (1 - VAT_RATE)
            },
            byStatus: {
              pending: pendingAmount,
              approved: approvedAmount,
              paid: paidAmount
            },
            byLevel: levelBreakdown,
            transactionCount: commissionsArray.length
          },
          team: {
            newPartners: (newPartners || []).length,
            teamRevenue: {
              gross: teamRevenue,
              vat: teamRevenue * VAT_RATE,
              net: teamRevenue * (1 - VAT_RATE)
            },
            teamTransactionCount: (teamTransactions || []).length
          },
          details: {
            commissions: commissionsArray.slice(0, 50).map(c => ({
              date: c.created_at,
              amount: c.commission_amount,
              level: c.level_number,
              status: c.status,
              customer: c.transaction?.customer
            })),
            newPartners: (newPartners || []).slice(0, 20)
          }
        }

        // Save/update report
        const { error: upsertError } = await supabase
          .from('customer_monthly_reports')
          .upsert({
            user_id: targetPartnerId,
            report_month: targetMonth,
            generated_at: new Date().toISOString(),
            status: 'generated',
            total_scans: commissionsArray.length,
            green_count: (teamTransactions || []).length,
            red_count: 0,
            top_findings: reportData
          }, {
            onConflict: 'user_id,report_month'
          })

        if (upsertError) {
          console.error('Upsert error:', upsertError)
        }

        // Log to audit
        await supabase.from('audit_log').insert({
          action: 'MONTHLY_REPORT_GENERATED',
          table_name: 'customer_monthly_reports',
          record_id: targetPartnerId,
          new_data: { month: targetMonth, totalCommission },
          user_id: profile.id
        })

        return new Response(
          JSON.stringify({ 
            success: true, 
            report: reportData,
            message: `Bericht für ${targetMonth} wurde generiert`
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
    console.error('Monthly Report Error:', error)
    const message = error instanceof Error ? error.message : 'Interner Serverfehler'
    return new Response(
      JSON.stringify({ error: message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})
