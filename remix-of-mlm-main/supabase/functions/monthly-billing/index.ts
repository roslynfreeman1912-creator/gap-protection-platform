import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { getCorsHeaders, jsonResponse, authenticateRequest, authenticateServiceCall, getSupabaseAdmin, checkMaintenanceMode } from '../_shared/auth.ts'

// Monthly billing job - creates transactions, sends invoices to rechnung@, and triggers monthly scan reports
serve(async (req) => {
  const corsHeaders = getCorsHeaders(req)
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders })
  }

  const maintenanceResponse = checkMaintenanceMode('monthly-billing', corsHeaders)
  if (maintenanceResponse) return maintenanceResponse

  try {
    const { supabase, url: supabaseUrl, key: supabaseServiceKey } = getSupabaseAdmin()

    // AUTH: Only admins or service-to-service calls
    const serviceAuth = authenticateServiceCall(req, corsHeaders)
    if (!serviceAuth.ok) {
      const authResult = await authenticateRequest(req, corsHeaders, { allowedRoles: ['admin', 'super_admin'] })
      if (authResult.response) return authResult.response
    }

    // Get all active profiles with SEPA mandate
    const { data: activeProfiles, error: profilesError } = await supabase
      .from('profiles')
      .select('id, first_name, last_name, domain, iban')
      .eq('status', 'active')
      .eq('sepa_mandate_accepted', true)

    if (profilesError) {
      throw profilesError
    }

    const billingResults = {
      processed: 0,
      skipped: 0,
      errors: 0,
      totalAmount: 0,
      commissionsGenerated: 0
    }

    const billingMonth = new Date().toISOString().slice(0, 7)
    const nextMonth = new Date()
    nextMonth.setMonth(nextMonth.getMonth() + 1)
    const nextMonthStr = nextMonth.toISOString().slice(0, 7)

    // H-02 FIX: Idempotency — check if this billing month was already run
    const { data: existingRun } = await supabase
      .from('audit_log')
      .select('id')
      .eq('action', 'MONTHLY_BILLING_RUN')
      .filter('new_data->>billing_month', 'eq', billingMonth)
      .limit(1)

    if (existingRun && existingRun.length > 0) {
      return jsonResponse({
        success: false,
        error: `Monatliche Abrechnung für ${billingMonth} wurde bereits ausgeführt`,
        billingMonth,
      }, 409, corsHeaders)
    }

    for (const profile of activeProfiles || []) {
      try {
        // Check if already billed this month
        const { data: existingTx } = await supabase
          .from('transactions')
          .select('id')
          .eq('customer_id', profile.id)
          .gte('created_at', `${billingMonth}-01`)
          .lt('created_at', `${nextMonthStr}-01`)
          .limit(1)

        if (existingTx && existingTx.length > 0) {
          billingResults.skipped++
          continue
        }

        const contractStart = new Date()
        const contractEnd = new Date(contractStart)
        contractEnd.setMonth(contractEnd.getMonth() + 1)

        const { data: transaction, error: txError } = await supabase
          .from('transactions')
          .insert({
            customer_id: profile.id,
            amount: 399,
            currency: 'EUR',
            status: 'pending',
            is_first_payment: false,
            contract_start_date: contractStart.toISOString(),
            contract_end_date: contractEnd.toISOString(),
            payment_method: 'sepa',
            invoice_date: new Date().toISOString(),
          })
          .select()
          .single()

        if (txError || !transaction) {
          billingResults.errors++
          continue
        }

        billingResults.processed++
        billingResults.totalAmount += 399

        // Send monthly invoice email to customer (CC to rechnung@)
        try {
          await fetch(`${supabaseUrl}/functions/v1/send-welcome-email`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${supabaseServiceKey}`,
            },
            body: JSON.stringify({ profileId: profile.id, type: 'monthly_invoice' }),
          })
        } catch (emailErr) {
          console.error(`Invoice email error for ${profile.id}:`, emailErr)
        }

        // H-03 FIX: Do NOT calculate commissions on pending transactions.
        // Transaction stays as 'pending' until SEPA payment is confirmed.
        // Commissions are calculated only when status becomes 'completed'.

      } catch (profileError) {
        billingResults.errors++
      }
    }

    // ── Run pending monthly scans & send reports to customers ──
    try {
      // Trigger pending scan execution
      const scanRunRes = await fetch(`${supabaseUrl}/functions/v1/scheduled-scan`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${supabaseServiceKey}`,
        },
        body: JSON.stringify({ action: 'run-pending' }),
      })
      const scanRunResult = await scanRunRes.json()
      console.log('Monthly scans executed:', scanRunResult?.executed || 0)

      // Generate & email security reports for all active customers
      for (const profile of activeProfiles || []) {
        try {
          // Generate HTML report
          const reportRes = await fetch(`${supabaseUrl}/functions/v1/generate-security-report`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${supabaseServiceKey}`,
            },
            body: JSON.stringify({
              profileId: profile.id,
              reportType: 'monthly',
            }),
          })

          if (reportRes.ok) {
            const reportHtml = await reportRes.text()

            // Email the report to the customer
            await fetch(`${supabaseUrl}/functions/v1/send-welcome-email`, {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${supabaseServiceKey}`,
              },
              body: JSON.stringify({
                profileId: profile.id,
                type: 'scan_report',
                reportHtml,
                domain: profile.domain,
              }),
            })
            console.log(`Monthly scan report sent to customer ${profile.id}`)
          }
        } catch (reportErr) {
          console.error(`Report email error for ${profile.id}:`, reportErr)
        }
      }
    } catch (scanErr) {
      console.error('Monthly scan/report batch error:', scanErr)
    }

    // ── Send billing summary to rechnung@ ──
    try {
      const summaryHtml = `
<!DOCTYPE html>
<html><head><style>
  body { font-family: Arial, sans-serif; color: #333; }
  .container { max-width: 600px; margin: 0 auto; padding: 20px; }
  .header { background: #1a365d; color: white; padding: 20px; text-align: center; border-radius: 10px 10px 0 0; }
  .content { background: #f7fafc; padding: 25px; border-radius: 0 0 10px 10px; }
  .stat { padding: 8px 0; border-bottom: 1px solid #e2e8f0; }
  .stat strong { display: inline-block; width: 200px; }
</style></head>
<body>
  <div class="container">
    <div class="header"><h2>Monatliche Abrechnung – Zusammenfassung</h2></div>
    <div class="content">
      <p><strong>Abrechnungsmonat:</strong> ${billingMonth}</p>
      <div class="stat"><strong>Verarbeitete Kunden:</strong> ${billingResults.processed}</div>
      <div class="stat"><strong>Übersprungen:</strong> ${billingResults.skipped}</div>
      <div class="stat"><strong>Fehler:</strong> ${billingResults.errors}</div>
      <div class="stat"><strong>Gesamtbetrag:</strong> ${billingResults.totalAmount.toLocaleString('de-DE')} EUR</div>
      <p style="margin-top:15px;font-size:12px;color:#666;">Automatischer Bericht – GAP Protection</p>
    </div>
  </div>
</body></html>`

      await fetch(`${supabaseUrl}/functions/v1/send-welcome-email`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${supabaseServiceKey}`,
        },
        body: JSON.stringify({
          type: 'invoice_notification',
          customTo: 'rechnung@gap-protection.com',
          customSubject: `Monatliche Abrechnung ${billingMonth} – ${billingResults.processed} Kunden – ${billingResults.totalAmount} EUR`,
          customHtml: summaryHtml,
        }),
      })
      console.log('Billing summary sent to rechnung@gap-protection.com')
    } catch (summaryErr) {
      console.error('Billing summary email error:', summaryErr)
    }

    // Log to audit
    await supabase.from('audit_log').insert({
      action: 'MONTHLY_BILLING_RUN',
      table_name: 'transactions',
      record_id: 'system',
      new_data: {
        billing_month: billingMonth,
        ...billingResults
      },
    })

    return jsonResponse({
      success: true,
      message: 'Monatliche Abrechnung abgeschlossen',
      billingMonth,
      results: billingResults
    }, 200, corsHeaders)

  } catch (error) {
    console.error('Monthly billing error:', (error as Error).message)
    return jsonResponse({ error: 'Monatliche Abrechnung fehlgeschlagen' }, 500, getCorsHeaders(req))
  }
})
