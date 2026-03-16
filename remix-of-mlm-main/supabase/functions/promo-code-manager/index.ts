import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { getCorsHeaders, jsonResponse, authenticateRequest, authenticateServiceCall, getSupabaseAdmin, checkRateLimit } from '../_shared/auth.ts'

serve(async (req) => {
  const corsHeaders = getCorsHeaders(req)

  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders })
  }

  try {
    const { supabase } = getSupabaseAdmin()

    const { action, ...params } = await req.json()

    console.log('Promo-Code Manager action:', action)

    // ========== AUTH CLASSIFICATION ==========
    // Public (rate-limited): validate
    // Service-only: use (internal call from register function)
    // Admin + Service: get-current, rotate, create-fixed, list-fixed, list-usages, deactivate, delete

    if (action === 'validate') {
      // --- PUBLIC: Rate limited, no auth ---
      const ip = req.headers.get('x-forwarded-for') || req.headers.get('cf-connecting-ip') || 'unknown'
      if (!checkRateLimit(`promo-validate:${ip}`, 10, 60_000)) {
        return jsonResponse({ error: 'Zu viele Anfragen' }, 429, corsHeaders)
      }

      const { code, email, ip_address, user_agent } = params

      if (!code) {
        return jsonResponse({ valid: false, reason: 'Kein Code angegeben' }, 400, corsHeaders)
      }

      const { data: codeRecord, error } = await supabase
        .from('rotating_promo_codes')
        .select('*')
        .eq('code', code.toUpperCase())
        .eq('is_active', true)
        .gte('valid_to', new Date().toISOString())
        .lte('valid_from', new Date().toISOString())
        .single()

      if (error || !codeRecord) {
        if (email) {
          const { data: anyCode } = await supabase
            .from('rotating_promo_codes')
            .select('id')
            .eq('code', code.toUpperCase())
            .limit(1)
            .maybeSingle()

          await supabase.from('promo_code_usages').insert({
            promo_code_id: anyCode?.id || null,
            user_email: email,
            ip_address,
            user_agent,
            result: 'fail',
            fail_reason: 'Code ungültig oder abgelaufen',
            code_type: 'unknown'
          }).catch(() => {})
        }

        return jsonResponse({ valid: false, reason: 'Code ungültig oder abgelaufen' }, 200, corsHeaders)
      }

      if (codeRecord.max_uses && codeRecord.use_count >= codeRecord.max_uses) {
        return jsonResponse({ valid: false, reason: 'Code-Limit erreicht' }, 200, corsHeaders)
      }

      return jsonResponse({
        valid: true,
        code_id: codeRecord.id,
        code_type: codeRecord.code_type,
        expires_at: codeRecord.valid_to
      }, 200, corsHeaders)
    }

    if (action === 'use') {
      // --- SERVICE-ONLY: Called internally by register function ---
      const serviceAuth = authenticateServiceCall(req, corsHeaders)
      if (!serviceAuth.ok) {
        return jsonResponse({ error: 'Nur interne Service-Aufrufe erlaubt' }, 403, corsHeaders)
      }

      const { code_id, user_id, email, ip_address, user_agent, code_type } = params

      if (!code_id) {
        return jsonResponse({ error: 'code_id erforderlich' }, 400, corsHeaders)
      }

      // Atomic use_count increment via RPC to prevent TOCTOU
      const { error: rpcError } = await supabase.rpc('increment_promo_use_count', { p_code_id: code_id })
      if (rpcError) {
        // Fallback: non-atomic increment
        const { data: current } = await supabase
          .from('rotating_promo_codes')
          .select('use_count')
          .eq('id', code_id)
          .single()

        if (current) {
          await supabase
            .from('rotating_promo_codes')
            .update({ use_count: (current.use_count || 0) + 1 })
            .eq('id', code_id)
        }
      }

      await supabase.from('promo_code_usages').insert({
        promo_code_id: code_id,
        user_id,
        user_email: email,
        ip_address,
        user_agent,
        result: 'success',
        code_type: code_type || 'rotating'
      })

      await supabase.from('audit_log').insert({
        action: 'PROMO_CODE_USED',
        table_name: 'rotating_promo_codes',
        record_id: code_id,
        new_data: { email, code_type, user_id }
      })

      return jsonResponse({ success: true }, 200, corsHeaders)
    }

    // --- ALL REMAINING ACTIONS: Admin + Service auth required ---
    const serviceAuth = authenticateServiceCall(req, corsHeaders)
    if (!serviceAuth.ok) {
      const authResult = await authenticateRequest(req, corsHeaders, { allowedRoles: ['admin', 'super_admin'] })
      if (authResult.response) return authResult.response
    }

    switch (action) {
      case 'get-current': {
        const { data: currentCode } = await supabase
          .from('rotating_promo_codes')
          .select('*')
          .eq('code_type', 'rotating')
          .eq('is_active', true)
          .gte('valid_to', new Date().toISOString())
          .order('created_at', { ascending: false })
          .limit(1)
          .single()

        if (!currentCode) {
          const newCode = generateCode()
          const validTo = new Date(Date.now() + 10 * 60 * 1000)

          const { data: created, error } = await supabase
            .from('rotating_promo_codes')
            .insert({
              code: newCode,
              code_hash: await hashCode(newCode),
              code_type: 'rotating',
              valid_from: new Date().toISOString(),
              valid_to: validTo.toISOString()
            })
            .select()
            .single()

          if (error) {
            console.error('Error creating rotating code:', error)
            return jsonResponse({ error: 'Fehler beim Erstellen des Codes' }, 500, corsHeaders)
          }

          return jsonResponse({
            code: newCode,
            valid_until: validTo.toISOString(),
            seconds_remaining: 600
          }, 200, corsHeaders)
        }

        const secondsRemaining = Math.max(0, Math.floor((new Date(currentCode.valid_to).getTime() - Date.now()) / 1000))

        return jsonResponse({
          code: currentCode.code,
          valid_until: currentCode.valid_to,
          seconds_remaining: secondsRemaining,
          use_count: currentCode.use_count
        }, 200, corsHeaders)
      }

      case 'rotate': {
        await supabase
          .from('rotating_promo_codes')
          .update({ is_active: false })
          .eq('code_type', 'rotating')
          .lt('valid_to', new Date().toISOString())

        const { data: current } = await supabase
          .from('rotating_promo_codes')
          .select('*')
          .eq('code_type', 'rotating')
          .eq('is_active', true)
          .gte('valid_to', new Date().toISOString())
          .single()

        if (current) {
          const secondsRemaining = Math.floor((new Date(current.valid_to).getTime() - Date.now()) / 1000)
          return jsonResponse({
            message: 'Aktueller Code noch gültig',
            code: current.code,
            seconds_remaining: secondsRemaining
          }, 200, corsHeaders)
        }

        const newCode = generateCode()
        const validTo = new Date(Date.now() + 10 * 60 * 1000)

        const { data: created, error } = await supabase
          .from('rotating_promo_codes')
          .insert({
            code: newCode,
            code_hash: await hashCode(newCode),
            code_type: 'rotating',
            valid_from: new Date().toISOString(),
            valid_to: validTo.toISOString()
          })
          .select()
          .single()

        if (error) {
          console.error('Error rotating code:', error)
          return jsonResponse({ error: 'Fehler bei Code-Rotation' }, 500, corsHeaders)
        }

        console.log('New rotating code created:', newCode)

        return jsonResponse({
          success: true,
          code: newCode,
          valid_until: validTo.toISOString()
        }, 200, corsHeaders)
      }

      case 'create-fixed': {
        const { code, valid_from, valid_to, max_uses, description } = params

        const finalCode = code?.toUpperCase() || generateCode()

        const { data: created, error } = await supabase
          .from('rotating_promo_codes')
          .insert({
            code: finalCode,
            code_hash: await hashCode(finalCode),
            code_type: 'fixed',
            valid_from: valid_from || new Date().toISOString(),
            valid_to,
            max_uses: max_uses || null,
            description,
          })
          .select()
          .single()

        if (error) {
          console.error('Error creating fixed code:', error)
          return jsonResponse({ error: error.message }, 400, corsHeaders)
        }

        await supabase.from('audit_log').insert({
          action: 'FIXED_CODE_CREATED',
          table_name: 'rotating_promo_codes',
          record_id: created.id,
          new_data: { code: finalCode, valid_from, valid_to, max_uses }
        })

        return jsonResponse({ success: true, code: created }, 200, corsHeaders)
      }

      case 'list-fixed': {
        const { data: codes, error } = await supabase
          .from('rotating_promo_codes')
          .select('*')
          .eq('code_type', 'fixed')
          .order('created_at', { ascending: false })

        return jsonResponse({ codes: codes || [] }, 200, corsHeaders)
      }

      case 'list-usages': {
        const { limit = 100, code_id } = params

        let query = supabase
          .from('promo_code_usages')
          .select(`
            *,
            promo_code:rotating_promo_codes(code, code_type)
          `)
          .order('used_at', { ascending: false })
          .limit(limit)

        if (code_id) {
          query = query.eq('promo_code_id', code_id)
        }

        const { data: usages, error } = await query

        return jsonResponse({ usages: usages || [] }, 200, corsHeaders)
      }

      case 'deactivate': {
        const { code_id } = params
        if (!code_id) return jsonResponse({ error: 'code_id erforderlich' }, 400, corsHeaders)

        const { error } = await supabase
          .from('rotating_promo_codes')
          .update({ is_active: false })
          .eq('id', code_id)

        if (error) {
          return jsonResponse({ error: error.message }, 400, corsHeaders)
        }

        return jsonResponse({ success: true }, 200, corsHeaders)
      }

      case 'delete': {
        const { code_id } = params
        if (!code_id) return jsonResponse({ error: 'code_id erforderlich' }, 400, corsHeaders)

        const { error } = await supabase
          .from('rotating_promo_codes')
          .delete()
          .eq('id', code_id)

        if (error) {
          return jsonResponse({ error: error.message }, 400, corsHeaders)
        }

        return jsonResponse({ success: true }, 200, corsHeaders)
      }

      default:
        return jsonResponse({ error: 'Unbekannte Aktion' }, 400, corsHeaders)
    }
  } catch (error) {
    console.error('Promo-Code Manager error:', error)
    return jsonResponse({ error: 'Interner Serverfehler' }, 500, corsHeaders)
  }
})

function generateCode(): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789'
  let result = 'GEP-'
  for (let i = 0; i < 6; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length))
  }
  return result
}

async function hashCode(code: string): Promise<string> {
  const encoder = new TextEncoder()
  const data = encoder.encode(code)
  const hashBuffer = await crypto.subtle.digest('SHA-256', data)
  const hashArray = Array.from(new Uint8Array(hashBuffer))
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('')
}
