import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { getCorsHeaders, jsonResponse, authenticateRequest, authenticateServiceCall, getSupabaseAdmin, checkMaintenanceMode } from '../_shared/auth.ts'

serve(async (req) => {
  const corsHeaders = getCorsHeaders(req)
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders })
  }

  const maintenanceResponse = checkMaintenanceMode('generate-credit-notes', corsHeaders)
  if (maintenanceResponse) return maintenanceResponse

  try {
    const { supabase, url: supabaseUrl, key: supabaseServiceKey } = getSupabaseAdmin()

    // AUTH: Only admins or service-to-service calls
    const serviceAuth = authenticateServiceCall(req, corsHeaders)
    if (!serviceAuth.ok) {
      const authResult = await authenticateRequest(req, corsHeaders, { allowedRoles: ['admin', 'super_admin'] })
      if (authResult.response) return authResult.response
    }

    const { action, partnerId, commissionIds, creditNoteId, periodStart, periodEnd } = await req.json()

    if (action === 'generate') {
      if (!partnerId) {
        return jsonResponse({ error: 'partnerId erforderlich' }, 400, corsHeaders)
      }

      let query = supabase
        .from('commissions')
        .select('id, commission_amount, partner_id')
        .eq('partner_id', partnerId)
        .in('status', ['approved'])

      if (commissionIds && commissionIds.length > 0) {
        query = query.in('id', commissionIds)
      }

      const { data: commissions, error } = await query
      if (error) throw error

      if (!commissions || commissions.length === 0) {
        return jsonResponse({ success: false, error: 'Keine offenen Provisionen gefunden' }, 400, corsHeaders)
      }

      const { data: partner } = await supabase
        .from('profiles')
        .select('first_name, last_name, iban_encrypted, bic_encrypted, account_holder_encrypted')
        .eq('id', partnerId)
        .single()

      const netAmount = commissions.reduce((s, c) => s + Number(c.commission_amount), 0)
      const vatRate = 19
      const vatAmount = Math.round(netAmount * (vatRate / 100) * 100) / 100
      const grossAmount = Math.round((netAmount + vatAmount) * 100) / 100

      const { data: seqData } = await supabase.rpc('nextval', { seq_name: 'credit_note_seq' }).single() as any
      const seq = seqData || Date.now()
      const year = new Date().getFullYear()
      const creditNoteNumber = `GS-${year}-${String(seq).padStart(5, '0')}`

      const { data: creditNote, error: cnError } = await supabase
        .from('credit_notes')
        .insert({
          partner_id: partnerId,
          commission_ids: commissions.map(c => c.id),
          credit_note_number: creditNoteNumber,
          net_amount: netAmount,
          vat_rate: vatRate,
          vat_amount: vatAmount,
          gross_amount: grossAmount,
          status: 'draft',
          period_start: periodStart || null,
          period_end: periodEnd || null,
          iban: partner?.iban_encrypted || null,
          bic: partner?.bic_encrypted || null,
          account_holder: partner?.account_holder_encrypted || `${partner?.first_name} ${partner?.last_name}`,
        })
        .select('id, credit_note_number, net_amount, vat_amount, gross_amount, status')
        .single()

      if (cnError) throw cnError

      await supabase.from('audit_log').insert({
        action: 'CREDIT_NOTE_GENERATED',
        table_name: 'credit_notes',
        record_id: creditNote.id,
        new_data: { creditNoteNumber, netAmount, grossAmount, commissionCount: commissions.length }
      })

      return jsonResponse({ success: true, creditNote }, 200, corsHeaders)
    }

    if (action === 'approve') {
      if (!creditNoteId) return jsonResponse({ error: 'creditNoteId erforderlich' }, 400, corsHeaders)

      const { data: cn, error } = await supabase
        .from('credit_notes')
        .update({ status: 'approved' })
        .eq('id', creditNoteId)
        .select('id, status, commission_ids')
        .single()

      if (error) throw error

      if ((cn as any).commission_ids?.length > 0) {
        await supabase.from('commissions').update({ status: 'approved' }).in('id', (cn as any).commission_ids)
      }

      return jsonResponse({ success: true, creditNote: cn }, 200, corsHeaders)
    }

    if (action === 'mark-paid') {
      if (!creditNoteId) return jsonResponse({ error: 'creditNoteId erforderlich' }, 400, corsHeaders)

      const { data: cn, error } = await supabase
        .from('credit_notes')
        .update({ status: 'paid', paid_at: new Date().toISOString() })
        .eq('id', creditNoteId)
        .select()
        .single()

      if (error) throw error

      if (cn.commission_ids && cn.commission_ids.length > 0) {
        await supabase.from('commissions')
          .update({ status: 'paid', paid_at: new Date().toISOString() })
          .in('id', cn.commission_ids)
      }

      return jsonResponse({ success: true }, 200, corsHeaders)
    }

    if (action === 'list') {
      let query = supabase
        .from('credit_notes')
        .select('id, credit_note_number, net_amount, gross_amount, status, created_at, partner:profiles!partner_id(first_name, last_name)')
        .order('created_at', { ascending: false })

      if (partnerId) query = query.eq('partner_id', partnerId)

      const { data, error } = await query.limit(100)
      if (error) throw error

      return jsonResponse({ success: true, creditNotes: data }, 200, corsHeaders)
    }

    if (action === 'generate-batch') {
      const { data: pendingCommissions } = await supabase
        .from('commissions')
        .select('id, commission_amount, partner_id')
        .in('status', ['approved'])

      if (!pendingCommissions || pendingCommissions.length === 0) {
        return jsonResponse({ success: true, generated: 0 }, 200, corsHeaders)
      }

      const byPartner: Record<string, typeof pendingCommissions> = {}
      for (const c of pendingCommissions) {
        if (!byPartner[c.partner_id]) byPartner[c.partner_id] = []
        byPartner[c.partner_id].push(c)
      }

      let generated = 0
      for (const [pid, comms] of Object.entries(byPartner)) {
        try {
          await fetch(`${supabaseUrl}/functions/v1/generate-credit-notes`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${supabaseServiceKey}`,
            },
            body: JSON.stringify({ action: 'generate', partnerId: pid, commissionIds: comms.map(c => c.id), periodStart, periodEnd })
          })
          generated++
        } catch (_e) {
          // Continue
        }
      }

      return jsonResponse({ success: true, generated }, 200, corsHeaders)
    }

    return jsonResponse({ error: 'Unbekannte Aktion' }, 400, corsHeaders)

  } catch (error) {
    console.error('Credit note error:', (error as Error).message)
    return jsonResponse({ error: 'Gutschrift-Erstellung fehlgeschlagen' }, 500, getCorsHeaders(req))
  }
})
