import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { getCorsHeaders, jsonResponse, authenticateRequest, authenticateServiceCall, getSupabaseAdmin, checkMaintenanceMode } from '../_shared/auth.ts'

interface TransactionRequest {
  customerId: string
  amount?: number
  isFirstPayment?: boolean
  idempotencyKey?: string
}

const ALLOWED_AMOUNTS = [399]

serve(async (req) => {
  const corsHeaders = getCorsHeaders(req)
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders })
  }

  const maintenanceResponse = checkMaintenanceMode('create-transaction', corsHeaders)
  if (maintenanceResponse) return maintenanceResponse

  try {
    const { supabase, url: supabaseUrl, key: supabaseServiceKey } = getSupabaseAdmin()

    // AUTH: Only admins or service-to-service calls
    const serviceAuth = authenticateServiceCall(req, corsHeaders)
    if (!serviceAuth.ok) {
      const authResult = await authenticateRequest(req, corsHeaders, { allowedRoles: ['admin', 'super_admin'] })
      if (authResult.response) return authResult.response
    }

    const { customerId, amount = 399, idempotencyKey }: TransactionRequest = await req.json()

    if (!customerId) {
      return jsonResponse({ error: 'Kunden-ID erforderlich' }, 400, corsHeaders)
    }

    // Idempotency protection: if a key is provided, check for an existing transaction
    // with the same key to prevent duplicate charges from retried requests.
    if (idempotencyKey) {
      const { data: existingByKey } = await supabase
        .from('transactions')
        .select('id, amount, status')
        .eq('idempotency_key', idempotencyKey)
        .maybeSingle()

      if (existingByKey) {
        console.log('Idempotent hit — returning existing transaction:', existingByKey.id)
        return jsonResponse({ success: true, transaction: existingByKey, idempotent: true }, 200, corsHeaders)
      }
    }

    // Validate amount against allowed values
    if (!ALLOWED_AMOUNTS.includes(amount)) {
      return jsonResponse({ error: `Ungültiger Betrag. Erlaubt: ${ALLOWED_AMOUNTS.join(', ')}€` }, 400, corsHeaders)
    }

    // Verify customer exists
    const { data: customer, error: customerError } = await supabase
      .from('profiles')
      .select('id, sponsor_id')
      .eq('id', customerId)
      .single()

    if (customerError || !customer) {
      return jsonResponse({ error: 'Kunde nicht gefunden' }, 404, corsHeaders)
    }

    // Check if first payment
    const { data: existingTx } = await supabase
      .from('transactions')
      .select('id')
      .eq('customer_id', customerId)
      .limit(1)

    const isActuallyFirst = !existingTx || existingTx.length === 0

    const contractStart = new Date()
    const contractEnd = new Date(contractStart)
    contractEnd.setMonth(contractEnd.getMonth() + 24)

    const insertPayload: Record<string, unknown> = {
      customer_id: customerId,
      amount: amount,
      currency: 'EUR',
      status: 'pending',
      is_first_payment: isActuallyFirst,
      contract_start_date: contractStart.toISOString(),
      contract_end_date: contractEnd.toISOString(),
      payment_method: 'sepa',
      invoice_date: new Date().toISOString(),
    }
    // Attach idempotency key to the row so future requests can be de-duped
    if (idempotencyKey) {
      insertPayload.idempotency_key = idempotencyKey
    }

    const { data: transaction, error: txError } = await supabase
      .from('transactions')
      .insert(insertPayload)
      .select('id, amount, status')
      .single()

    if (txError || !transaction) {
      console.error('Transaction error:', txError?.message)
      return jsonResponse({ error: 'Transaktion konnte nicht erstellt werden' }, 500, corsHeaders)
    }

    // H-03 FIX: Do NOT calculate commissions on pending transactions.
    // Commissions are only calculated when transaction status becomes 'completed'
    // (triggered by payment gateway callback or admin confirmation).
    // The calculate-commissions function now enforces status='completed' check.

    await supabase.from('audit_log').insert({
      action: 'TRANSACTION_CREATED',
      table_name: 'transactions',
      record_id: transaction.id,
      new_data: { customer_id: customerId, amount, is_first_payment: isActuallyFirst },
    })

    return jsonResponse({ success: true, transaction }, 200, corsHeaders)

  } catch (error) {
    console.error('Create transaction error:', (error as Error).message)
    return jsonResponse({ error: 'Fehler beim Erstellen der Transaktion' }, 500, getCorsHeaders(req))
  }
})
