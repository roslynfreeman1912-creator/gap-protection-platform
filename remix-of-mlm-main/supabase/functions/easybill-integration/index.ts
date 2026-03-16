import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { getCorsHeaders, jsonResponse, authenticateRequest, authenticateServiceCall, getSupabaseAdmin } from '../_shared/auth.ts'

const EASYBILL_API_URL = 'https://api.easybill.de/rest/v1'

serve(async (req) => {
  const corsHeaders = getCorsHeaders(req)
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders })
  }

  try {
    const { supabase, url: supabaseUrl, key: supabaseServiceKey } = getSupabaseAdmin()
    const easybillApiKey = Deno.env.get('EASYBILL_API_KEY')

    // AUTH: Only admins or service-to-service calls
    const serviceAuth = authenticateServiceCall(req, corsHeaders)
    if (!serviceAuth.ok) {
      const authResult = await authenticateRequest(req, corsHeaders, { allowedRoles: ['admin', 'super_admin'] })
      if (authResult.response) return authResult.response
    }

    if (!easybillApiKey) {
      return jsonResponse(
        { error: 'EasyBill API-Key nicht konfiguriert. Bitte EASYBILL_API_KEY in den Secrets hinterlegen.' },
        400, corsHeaders
      )
    }

    const { action, creditNoteId } = await req.json()

    const easybillHeaders = {
      'Authorization': `Bearer ${easybillApiKey}`,
      'Content-Type': 'application/json',
    }

    if (action === 'sync-credit-note') {
      const { data: cn, error } = await supabase
        .from('credit_notes')
        .select('*, partner:profiles!partner_id(*)')
        .eq('id', creditNoteId)
        .single()

      if (error || !cn) {
        return jsonResponse({ error: 'Gutschrift nicht gefunden' }, 404, corsHeaders)
      }

      const customerSearchRes = await fetch(
        `${EASYBILL_API_URL}/customers?company_name=${encodeURIComponent(cn.account_holder || '')}`,
        { headers: easybillHeaders }
      )
      const customerSearch = await customerSearchRes.json()

      let easybillCustomerId: number
      if (customerSearch.items && customerSearch.items.length > 0) {
        easybillCustomerId = customerSearch.items[0].id
      } else {
        const createRes = await fetch(`${EASYBILL_API_URL}/customers`, {
          method: 'POST',
          headers: easybillHeaders,
          body: JSON.stringify({
            first_name: cn.partner?.first_name,
            last_name: cn.partner?.last_name,
            emails: [cn.partner?.email],
            bank_account: cn.iban || undefined,
            bank_bic: cn.bic || undefined,
            bank_account_owner: cn.account_holder || undefined,
          })
        })
        if (!createRes.ok) {
          throw new Error(`EasyBill Kunden-Erstellung fehlgeschlagen [${createRes.status}]`)
        }
        const newCustomer = await createRes.json()
        easybillCustomerId = newCustomer.id
      }

      const documentRes = await fetch(`${EASYBILL_API_URL}/documents`, {
        method: 'POST',
        headers: easybillHeaders,
        body: JSON.stringify({
          type: 'CREDIT',
          customer_id: easybillCustomerId,
          document_date: new Date().toISOString().split('T')[0],
          items: [{
            description: `Gutschrift ${cn.credit_note_number} - Provisionen`,
            quantity: 1,
            single_price_net: Math.round(cn.net_amount * 100),
            vat_percent: cn.vat_rate,
          }],
          bank_debit_form: cn.iban ? 'SEPA' : undefined,
        })
      })

      if (!documentRes.ok) {
        throw new Error(`EasyBill Dokument-Erstellung fehlgeschlagen [${documentRes.status}]`)
      }

      const document = await documentRes.json()

      await fetch(`${EASYBILL_API_URL}/documents/${document.id}/done`, {
        method: 'PUT',
        headers: easybillHeaders,
      })

      const pdfUrl = `${EASYBILL_API_URL}/documents/${document.id}/pdf`

      await supabase
        .from('credit_notes')
        .update({ easybill_document_id: String(document.id), easybill_pdf_url: pdfUrl, status: 'synced' })
        .eq('id', creditNoteId)

      await supabase.from('audit_log').insert({
        action: 'EASYBILL_CREDIT_NOTE_SYNCED',
        table_name: 'credit_notes',
        record_id: creditNoteId,
        new_data: { easybill_document_id: document.id }
      })

      return jsonResponse({ success: true, easybillDocumentId: document.id, pdfUrl }, 200, corsHeaders)
    }

    if (action === 'trigger-payout') {
      const { data: cn } = await supabase
        .from('credit_notes')
        .select('*')
        .eq('id', creditNoteId)
        .single()

      if (!cn || !cn.easybill_document_id) {
        return jsonResponse({ error: 'Gutschrift muss zuerst mit EasyBill synchronisiert werden' }, 400, corsHeaders)
      }

      const paymentRes = await fetch(`${EASYBILL_API_URL}/document-payments`, {
        method: 'POST',
        headers: easybillHeaders,
        body: JSON.stringify({
          document_id: parseInt(cn.easybill_document_id),
          amount: Math.round(cn.gross_amount * 100),
          payment_at: new Date().toISOString().split('T')[0],
          type: 'BANK_TRANSFER',
          reference: cn.credit_note_number,
        })
      })

      if (!paymentRes.ok) {
        throw new Error(`EasyBill Zahlung fehlgeschlagen [${paymentRes.status}]`)
      }

      await supabase.from('credit_notes')
        .update({ status: 'paid', paid_at: new Date().toISOString() })
        .eq('id', creditNoteId)

      if (cn.commission_ids && cn.commission_ids.length > 0) {
        await supabase.from('commissions')
          .update({ status: 'paid', paid_at: new Date().toISOString() })
          .in('id', cn.commission_ids)
      }

      await supabase.from('audit_log').insert({
        action: 'EASYBILL_PAYOUT_TRIGGERED',
        table_name: 'credit_notes',
        record_id: creditNoteId,
        new_data: { gross_amount: cn.gross_amount }
      })

      return jsonResponse({ success: true, message: 'Auszahlung erfolgreich veranlasst' }, 200, corsHeaders)
    }

    if (action === 'sync-batch') {
      const { data: approved } = await supabase
        .from('credit_notes')
        .select('id')
        .eq('status', 'approved')
        .is('easybill_document_id', null)

      let synced = 0
      for (const cn of approved || []) {
        try {
          await fetch(`${supabaseUrl}/functions/v1/easybill-integration`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${supabaseServiceKey}`,
            },
            body: JSON.stringify({ action: 'sync-credit-note', creditNoteId: (cn as any).id })
          })
          synced++
        } catch (_e) {
          // Continue
        }
      }

      return jsonResponse({ success: true, synced }, 200, corsHeaders)
    }

    return jsonResponse({ error: 'Unbekannte Aktion' }, 400, corsHeaders)

  } catch (error) {
    console.error('EasyBill integration error:', (error as Error).message)
    return jsonResponse({ error: 'EasyBill-Integration fehlgeschlagen' }, 500, getCorsHeaders(req))
  }
})
