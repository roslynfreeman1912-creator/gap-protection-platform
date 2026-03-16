import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { getCorsHeaders, jsonResponse, authenticateRequest, authenticateServiceCall, getSupabaseAdmin, checkRateLimit, checkMaintenanceMode } from '../_shared/auth.ts'

interface WalletAction {
  action: 'credit' | 'debit' | 'withdraw' | 'get_balance' | 'get_transactions'
  profileId: string
  amount?: number
  transactionType?: string
  referenceId?: string
  referenceType?: string
  description?: string
  idempotencyKey?: string
}

serve(async (req) => {
  const corsHeaders = getCorsHeaders(req)
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders })
  }

  const maintenanceResponse = checkMaintenanceMode('wallet-engine', corsHeaders)
  if (maintenanceResponse) return maintenanceResponse

  try {
    const { supabase } = getSupabaseAdmin()
    const body: WalletAction = await req.json()
    const { action, profileId, amount, transactionType, referenceId, referenceType, description, idempotencyKey } = body

    // --- AUTH ---
    const serviceAuth = authenticateServiceCall(req, corsHeaders)
    let callerProfileId: string | null = null
    let isAdmin = false

    if (serviceAuth.ok) {
      callerProfileId = profileId
      isAdmin = true // service calls have full admin privileges
    } else {
      const authResult = await authenticateRequest(req, corsHeaders)
      if (authResult.response) return authResult.response

      callerProfileId = authResult.auth.profileId
      isAdmin = authResult.auth.roles.includes('admin') || authResult.auth.roles.includes('super_admin')

      if (!isAdmin && profileId !== callerProfileId) {
        return jsonResponse({ error: 'Zugriff verweigert' }, 403, corsHeaders)
      }

      if (!checkRateLimit(`wallet:${callerProfileId}`, 30, 60_000)) {
        return jsonResponse({ error: 'Zu viele Anfragen' }, 429, corsHeaders)
      }
    }

    if (!profileId) {
      return jsonResponse({ error: 'profileId erforderlich' }, 400, corsHeaders)
    }

    switch (action) {
      case 'get_balance': {
        const { data: wallet } = await supabase
          .from('wallets')
          .select('available_balance, pending_balance, total_earned, total_withdrawn, currency')
          .eq('profile_id', profileId)
          .single()

        if (!wallet) {
          return jsonResponse({
            success: true,
            wallet: { available_balance: 0, pending_balance: 0, total_earned: 0, total_withdrawn: 0, currency: 'EUR' }
          }, 200, corsHeaders)
        }

        return jsonResponse({ success: true, wallet }, 200, corsHeaders)
      }

      case 'credit': {
        if (!amount || amount <= 0) {
          return jsonResponse({ error: 'Gültiger Betrag erforderlich' }, 400, corsHeaders)
        }

        // Only service calls or admins can credit
        if (!isAdmin) {
          return jsonResponse({ error: 'Nur Admins oder interne Services können Gutschriften erstellen' }, 403, corsHeaders)
        }

        // Use atomic stored procedure (SELECT ... FOR UPDATE inside)
        const { data: result, error: rpcError } = await supabase.rpc('wallet_credit', {
          p_profile_id: profileId,
          p_amount: amount,
          p_transaction_type: transactionType || 'commission',
          p_reference_id: referenceId || null,
          p_reference_type: referenceType || null,
          p_description: description || 'Gutschrift',
          p_idempotency_key: idempotencyKey || null,
        })

        if (rpcError) {
          console.error('wallet_credit RPC error:', rpcError.message)
          return jsonResponse({ error: 'Gutschrift fehlgeschlagen' }, 500, corsHeaders)
        }

        return jsonResponse(result, 200, corsHeaders)
      }

      case 'debit': {
        if (!amount || amount <= 0) {
          return jsonResponse({ error: 'Gültiger Betrag erforderlich' }, 400, corsHeaders)
        }

        if (!isAdmin) {
          return jsonResponse({ error: 'Nur Admins oder interne Services können Belastungen erstellen' }, 403, corsHeaders)
        }

        // Use atomic stored procedure (prevents double-spend via SELECT ... FOR UPDATE)
        const { data: result, error: rpcError } = await supabase.rpc('wallet_debit', {
          p_profile_id: profileId,
          p_amount: amount,
          p_transaction_type: transactionType || 'adjustment',
          p_reference_id: referenceId || null,
          p_reference_type: referenceType || null,
          p_description: description || 'Belastung',
          p_idempotency_key: idempotencyKey || null,
        })

        if (rpcError) {
          const msg = rpcError.message
          if (msg.includes('Unzureichendes Guthaben')) {
            return jsonResponse({ error: 'Unzureichendes Guthaben' }, 400, corsHeaders)
          }
          console.error('wallet_debit RPC error:', msg)
          return jsonResponse({ error: 'Belastung fehlgeschlagen' }, 500, corsHeaders)
        }

        return jsonResponse(result, 200, corsHeaders)
      }

      case 'withdraw': {
        if (!amount || amount < 50) {
          return jsonResponse({ error: 'Mindestauszahlung: €50' }, 400, corsHeaders)
        }

        // Get bank details
        const { data: profile } = await supabase
          .from('profiles')
          .select('iban, bic, account_holder')
          .eq('id', profileId)
          .single()

        if (!profile?.iban) {
          return jsonResponse({ error: 'Keine Bankdaten hinterlegt' }, 400, corsHeaders)
        }

        // Use atomic stored procedure
        const { data: result, error: rpcError } = await supabase.rpc('wallet_withdraw', {
          p_profile_id: profileId,
          p_amount: amount,
          p_iban: profile.iban,
          p_bic: profile.bic,
          p_account_holder: profile.account_holder,
          p_idempotency_key: idempotencyKey || null,
        })

        if (rpcError) {
          const msg = rpcError.message
          if (msg.includes('Unzureichendes Guthaben') || msg.includes('Mindestbetrag')) {
            return jsonResponse({ error: msg }, 400, corsHeaders)
          }
          console.error('wallet_withdraw RPC error:', msg)
          return jsonResponse({ error: 'Auszahlung fehlgeschlagen' }, 500, corsHeaders)
        }

        // Audit
        await supabase.from('audit_log').insert({
          action: 'WITHDRAWAL_REQUESTED',
          table_name: 'withdrawal_requests',
          record_id: result.withdrawal_id,
          new_data: { amount, net_amount: result.net_amount, vat_amount: result.vat_amount },
        })

        return jsonResponse(result, 200, corsHeaders)
      }

      case 'get_transactions': {
        const { data: wallet } = await supabase
          .from('wallets')
          .select('id')
          .eq('profile_id', profileId)
          .single()

        if (!wallet?.id) {
          return jsonResponse({ success: true, transactions: [] }, 200, corsHeaders)
        }

        const { data: transactions } = await supabase
          .from('wallet_transactions')
          .select('id, transaction_type, amount, balance_after, description, created_at, status')
          .eq('wallet_id', wallet.id)
          .order('created_at', { ascending: false })
          .limit(50)

        return jsonResponse({ success: true, transactions: transactions || [] }, 200, corsHeaders)
      }

      default:
        return jsonResponse({ error: 'Unbekannte Aktion' }, 400, corsHeaders)
    }

  } catch (error) {
    console.error('Wallet engine error:', (error as Error).message)
    return jsonResponse({ error: 'Interner Serverfehler' }, 500, getCorsHeaders(req))
  }
})
