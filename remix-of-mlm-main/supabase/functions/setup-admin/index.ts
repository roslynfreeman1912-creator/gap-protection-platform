import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { getCorsHeaders, jsonResponse, getSupabaseAdmin, checkRateLimit } from '../_shared/auth.ts'

serve(async (req) => {
  const corsHeaders = getCorsHeaders(req)
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders })
  }

  try {
    const { supabase } = getSupabaseAdmin()
    const setupKey = Deno.env.get('ADMIN_SETUP_KEY')

    // CRITICAL: If ADMIN_SETUP_KEY is not configured, block all requests
    if (!setupKey) {
      return jsonResponse(
        { error: 'Admin-Setup ist nicht konfiguriert. ADMIN_SETUP_KEY muss als Umgebungsvariable gesetzt werden.' },
        503, corsHeaders
      )
    }

    // Rate limit setup attempts
    const clientIp = req.headers.get('x-forwarded-for') || 'unknown'
    if (!checkRateLimit(`setup-admin:${clientIp}`, 5, 300_000)) {
      return jsonResponse({ error: 'Zu viele Versuche. Bitte warten.' }, 429, corsHeaders)
    }

    const body = await req.json()
    const { email, password, setupKey: providedKey } = body

    // Verify setup key - always required
    if (providedKey !== setupKey) {
      return jsonResponse(
        { error: 'Ungültiger Setup-Schlüssel' },
        403, corsHeaders
      )
    }

    if (!email || !password) {
      return jsonResponse(
        { error: 'E-Mail und Passwort sind erforderlich' },
        400, corsHeaders
      )
    }

    // Password strength check
    if (password.length < 12) {
      return jsonResponse(
        { error: 'Admin-Passwort muss mindestens 12 Zeichen lang sein' },
        400, corsHeaders
      )
    }

    // One-time-use lockout: if an admin already exists, block setup
    const { data: existingAdmins } = await supabase
      .from('user_roles')
      .select('id')
      .eq('role', 'admin')
      .limit(1)

    if (existingAdmins && existingAdmins.length > 0) {
      return jsonResponse(
        { error: 'Admin-Setup wurde bereits durchgeführt. Verwenden Sie reset-admin-password zum Zurücksetzen.' },
        409, corsHeaders
      )
    }

    // Check if auth user exists - use perPage limit to avoid loading all users
    const { data: existingUsers } = await supabase.auth.admin.listUsers({ perPage: 1000 })
    const existingUser = existingUsers?.users?.find(u => u.email === email)

    let authUserId: string

    if (existingUser) {
      const { error } = await supabase.auth.admin.updateUserById(existingUser.id, {
        password,
        email_confirm: true
      })
      if (error) {
        return jsonResponse({ error: 'Benutzer-Update fehlgeschlagen' }, 400, corsHeaders)
      }
      authUserId = existingUser.id
    } else {
      const { data: authData, error: authError } = await supabase.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
      })
      if (authError) {
        return jsonResponse({ error: 'Benutzer-Erstellung fehlgeschlagen' }, 400, corsHeaders)
      }
      authUserId = authData.user.id
    }

    // Ensure profile exists
    const { data: existingProfile } = await supabase
      .from('profiles')
      .select('id')
      .eq('user_id', authUserId)
      .maybeSingle()

    let profileId: string

    if (existingProfile) {
      profileId = existingProfile.id
      await supabase.from('profiles').update({
        role: 'admin',
        status: 'active',
        email
      }).eq('id', profileId)
    } else {
      const { data: newProfile, error: profileError } = await supabase
        .from('profiles')
        .insert({
          user_id: authUserId,
          first_name: 'Admin',
          last_name: 'GAP',
          email,
          status: 'active',
          role: 'customer',
        })
        .select('id')
        .single()

      if (profileError) {
        return jsonResponse({ error: 'Profil konnte nicht erstellt werden' }, 500, corsHeaders)
      }

      profileId = newProfile.id
      await supabase.from('profiles').update({ role: 'admin' }).eq('id', profileId)
    }

    // Ensure admin role in user_roles
    await supabase
      .from('user_roles')
      .upsert({ user_id: profileId, role: 'admin' }, { onConflict: 'user_id,role' })

    // Audit log (no PII)
    await supabase.from('audit_log').insert({
      action: 'ADMIN_SETUP',
      table_name: 'profiles',
      record_id: profileId,
      new_data: { setup_completed: true },
    })

    return jsonResponse(
      { success: true, message: 'Admin eingerichtet' },
      200, corsHeaders
    )

  } catch (error) {
    console.error('Setup admin error:', (error as Error).message)
    return jsonResponse({ error: 'Setup fehlgeschlagen' }, 500, getCorsHeaders(req))
  }
})
