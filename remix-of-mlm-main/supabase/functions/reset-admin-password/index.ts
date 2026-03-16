import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { getCorsHeaders, jsonResponse, getSupabaseAdmin, checkRateLimit } from '../_shared/auth.ts'

serve(async (req) => {
  const corsHeaders = getCorsHeaders(req)

  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders })
  }

  try {
    // Rate limiting by IP
    const clientIp = req.headers.get('x-forwarded-for') || req.headers.get('cf-connecting-ip') || 'unknown'
    if (!checkRateLimit(`reset-admin-password:${clientIp}`, 5, 300_000)) {
      return jsonResponse({ error: 'Zu viele Anfragen. Bitte warten Sie.' }, 429, corsHeaders)
    }

    const { supabase } = getSupabaseAdmin()
    const setupKey = Deno.env.get('ADMIN_SETUP_KEY')

    // Require setup key from environment variable — check BEFORE parsing body
    if (!setupKey) {
      return jsonResponse({ error: 'Setup-Schlüssel nicht konfiguriert' }, 500, corsHeaders)
    }

    const { action, currentEmail, newEmail, newPassword, setupKey: providedKey } = await req.json()

    if (!providedKey || providedKey !== setupKey) {
      return jsonResponse({ error: 'Ungültiger Setup-Schlüssel' }, 403, corsHeaders)
    }

    // Find the user by current email
    const targetEmail = currentEmail || 'admin@gapprotection.de'
    // Use listUsers with filter to avoid loading ALL users
    const { data: users } = await supabase.auth.admin.listUsers({ perPage: 1000 })
    const user = users?.users?.find(u => u.email === targetEmail)

    if (!user) {
      return jsonResponse({ error: `Benutzer ${targetEmail} nicht gefunden` }, 404, corsHeaders)
    }

    const updates: any = {}
    if (newPassword) {
      if (newPassword.length < 12) {
        return jsonResponse({ error: 'Passwort muss mindestens 12 Zeichen lang sein' }, 400, corsHeaders)
      }
      if (!/[A-Z]/.test(newPassword) || !/[a-z]/.test(newPassword) || !/[0-9]/.test(newPassword)) {
        return jsonResponse({ error: 'Passwort muss Groß-/Kleinbuchstaben und Zahlen enthalten' }, 400, corsHeaders)
      }
      updates.password = newPassword
    }
    if (newEmail) updates.email = newEmail

    if (Object.keys(updates).length === 0) {
      return jsonResponse({ error: 'Keine Änderungen angegeben' }, 400, corsHeaders)
    }

    // Update auth user
    const { error: updateError } = await supabase.auth.admin.updateUserById(user.id, updates)

    if (updateError) {
      console.error('Update error:', updateError)
      return jsonResponse({ error: updateError.message }, 400, corsHeaders)
    }

    // Also update profile email if email changed
    if (newEmail) {
      await supabase
        .from('profiles')
        .update({ email: newEmail })
        .eq('user_id', user.id)
    }

    // Log to audit
    await supabase.from('audit_log').insert({
      action: 'ADMIN_CREDENTIALS_UPDATED',
      table_name: 'auth.users',
      record_id: user.id,
      new_data: { email_changed: !!newEmail, password_changed: !!newPassword },
    })

    console.log('Admin credentials updated for:', newEmail || targetEmail)

    return jsonResponse({
      success: true,
      message: 'Zugangsdaten aktualisiert',
      email: newEmail || targetEmail,
    }, 200, corsHeaders)

  } catch (error) {
    console.error('Reset error:', error)
    return jsonResponse({ error: 'Aktualisierung fehlgeschlagen' }, 500, corsHeaders)
  }
})
