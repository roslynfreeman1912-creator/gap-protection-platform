import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { getCorsHeaders, jsonResponse, authenticateServiceCall, getSupabaseAdmin } from '../_shared/auth.ts'

// ═══════════════════════════════════════════════════════════════
// GAP Protection — Email Service (Resend API)
// Sends real emails via Resend for all notification types.
// ═══════════════════════════════════════════════════════════════

const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY') || 're_eazhVLoY_81mit1yQBhLy184jpNCUp1kT'
// Use onboarding@resend.dev until gap-protection.com domain is verified in Resend
const FROM_EMAIL = Deno.env.get('RESEND_FROM_EMAIL') || 'onboarding@resend.dev'
const KONTAKT_EMAIL = 'kontakt@gap-protection.com'
const RECHNUNG_EMAIL = 'rechnung@gap-protection.com'

interface SendEmailRequest {
  profileId?: string
  type: 'welcome' | 'contract' | 'payment_confirmed' | 'monthly_invoice' | 'registration_notification' | 'scan_report' | 'invoice_notification'
  // For scan_report type
  reportHtml?: string
  domain?: string
  // For custom recipients
  customTo?: string
  customSubject?: string
  customHtml?: string
}

/** Send an email via Resend API */
async function sendViaResend(to: string | string[], subject: string, html: string, replyTo?: string): Promise<{ success: boolean; id?: string; error?: string }> {
  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${RESEND_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: `GAP Protection <${FROM_EMAIL}>`,
        to: Array.isArray(to) ? to : [to],
        subject,
        html,
        reply_to: replyTo || KONTAKT_EMAIL,
      }),
    })

    if (!res.ok) {
      const err = await res.text()
      console.error(`Resend API error [${res.status}]:`, err)
      return { success: false, error: `Resend ${res.status}: ${err}` }
    }

    const data = await res.json()
    console.log(`Email sent via Resend: ${data.id} → ${to}`)
    return { success: true, id: data.id }
  } catch (err) {
    console.error('Resend network error:', err)
    return { success: false, error: (err as Error).message }
  }
}

// Send email notifications
serve(async (req) => {
  const corsHeaders = getCorsHeaders(req)

  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders })
  }

  try {
    const { supabase } = getSupabaseAdmin()

    // Service-only: only allow service-role key
    const serviceAuth = authenticateServiceCall(req, corsHeaders)
    if (!serviceAuth.ok) {
      return serviceAuth.response || jsonResponse({ error: 'Nicht autorisiert' }, 401, corsHeaders)
    }
    
    const body: SendEmailRequest = await req.json()
    const { type, profileId, reportHtml, domain, customTo, customSubject, customHtml } = body

    // ── Handle custom email (e.g. invoice notification to rechnung@) ──
    if (type === 'invoice_notification' && customTo && customSubject && customHtml) {
      const result = await sendViaResend(customTo, customSubject, customHtml)
      await supabase.from('audit_log').insert({
        action: 'EMAIL_SENT',
        table_name: 'system',
        record_id: 'invoice',
        new_data: { type, recipient: customTo, subject: customSubject, resend_id: result.id },
      })
      return jsonResponse({ success: result.success, resendId: result.id, error: result.error }, result.success ? 200 : 500, corsHeaders)
    }

    if (!profileId) {
      return jsonResponse({ error: 'Profil-ID erforderlich' }, 400, corsHeaders)
    }
    
    // Get profile data
    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', profileId)
      .single()
    
    if (profileError || !profile) {
      return jsonResponse({ error: 'Profil nicht gefunden' }, 404, corsHeaders)
    }

    // ── Handle scan report email to customer ──
    if (type === 'scan_report' && reportHtml) {
      const scanSubject = `Ihr monatlicher Sicherheitsbericht – ${domain || profile.domain || 'Alle Domains'}`
      const result = await sendViaResend(profile.email, scanSubject, reportHtml)
      await supabase.from('audit_log').insert({
        action: 'EMAIL_SENT',
        table_name: 'profiles',
        record_id: profileId,
        new_data: { type, recipient: profile.email, subject: scanSubject, resend_id: result.id },
      })
      return jsonResponse({ success: result.success, resendId: result.id }, result.success ? 200 : 500, corsHeaders)
    }

    // ── Handle registration notification to kontakt@ ──
    if (type === 'registration_notification') {
      const notifSubject = `Neue Kundenregistrierung: ${profile.first_name} ${profile.last_name}`
      const notifHtml = buildRegistrationNotificationHtml(profile)
      const result = await sendViaResend(KONTAKT_EMAIL, notifSubject, notifHtml)
      await supabase.from('audit_log').insert({
        action: 'EMAIL_SENT',
        table_name: 'profiles',
        record_id: profileId,
        new_data: { type, recipient: KONTAKT_EMAIL, subject: notifSubject, resend_id: result.id },
      })
      return jsonResponse({ success: result.success, resendId: result.id }, result.success ? 200 : 500, corsHeaders)
    }
    
    let subject = ''
    let htmlContent = ''
    let ccRecipients: string[] = []
    
    switch (type) {
      case 'welcome':
        subject = 'Willkommen bei GAP-Protection - Ihre Registrierung'
        htmlContent = `
<!DOCTYPE html>
<html>
<head>
  <style>
    body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
    .container { max-width: 600px; margin: 0 auto; padding: 20px; }
    .header { background: linear-gradient(135deg, #1a365d 0%, #2c5282 100%); color: white; padding: 30px; text-align: center; border-radius: 10px 10px 0 0; }
    .content { background: #f7fafc; padding: 30px; border-radius: 0 0 10px 10px; }
    .button { display: inline-block; background: #3182ce; color: white; padding: 12px 30px; text-decoration: none; border-radius: 5px; margin: 20px 0; }
    .footer { text-align: center; margin-top: 20px; font-size: 12px; color: #718096; }
    .info-box { background: white; padding: 15px; border-radius: 5px; margin: 15px 0; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>🛡️ GAP-Protection</h1>
      <p>Willkommen in der Zukunft der Cyber-Sicherheit</p>
    </div>
    <div class="content">
      <h2>Hallo ${profile.first_name} ${profile.last_name}!</h2>
      <p>Vielen Dank für Ihre Registrierung bei GAP-Protection. Wir freuen uns, Sie als neuen Kunden begrüßen zu dürfen.</p>
      
      <div class="info-box">
        <strong>Ihre Registrierungsdaten:</strong><br>
        E-Mail: ${profile.email}<br>
        Domain: ${profile.domain}<br>
        Status: Ausstehende Aktivierung
      </div>
      
      <p><strong>Nächste Schritte:</strong></p>
      <ol>
        <li>Bitte bestätigen Sie Ihre E-Mail-Adresse</li>
        <li>Wir werden Ihre erste Zahlung per SEPA-Lastschrift einziehen</li>
        <li>Nach Zahlungseingang beginnt der Schutz Ihrer Domain</li>
      </ol>
      
      <p>Bei Fragen stehen wir Ihnen jederzeit zur Verfügung.</p>
      
      <p>Mit freundlichen Grüßen,<br>
      Ihr GAP-Protection Team</p>
    </div>
    <div class="footer">
      <p>GAP-Protection GmbH | Musterstraße 123 | 10115 Berlin</p>
      <p>Diese E-Mail wurde automatisch generiert.</p>
    </div>
  </div>
</body>
</html>
        `
        break
        
      case 'contract':
        subject = 'Ihr GAP-Protection Vertrag und SEPA-Mandat'
        htmlContent = `
<!DOCTYPE html>
<html>
<head>
  <style>
    body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
    .container { max-width: 600px; margin: 0 auto; padding: 20px; }
    .header { background: linear-gradient(135deg, #1a365d 0%, #2c5282 100%); color: white; padding: 30px; text-align: center; border-radius: 10px 10px 0 0; }
    .content { background: #f7fafc; padding: 30px; border-radius: 0 0 10px 10px; }
    .attachment-box { background: white; padding: 15px; border: 1px solid #e2e8f0; border-radius: 5px; margin: 15px 0; }
    .footer { text-align: center; margin-top: 20px; font-size: 12px; color: #718096; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>📄 Ihre Vertragsunterlagen</h1>
    </div>
    <div class="content">
      <h2>Hallo ${profile.first_name} ${profile.last_name},</h2>
      <p>anbei erhalten Sie Ihre Vertragsunterlagen:</p>
      
      <div class="attachment-box">
        📎 <strong>GAP-Protection_Vertrag.pdf</strong> - Ihr Dienstleistungsvertrag<br>
        📎 <strong>SEPA-Mandat.pdf</strong> - SEPA-Lastschriftmandat
      </div>
      
      <p>Bitte bewahren Sie diese Dokumente für Ihre Unterlagen auf.</p>
      
      <p>Mit freundlichen Grüßen,<br>
      Ihr GAP-Protection Team</p>
    </div>
    <div class="footer">
      <p>GAP-Protection GmbH | Musterstraße 123 | 10115 Berlin</p>
    </div>
  </div>
</body>
</html>
        `
        break
        
      case 'payment_confirmed':
        subject = 'Zahlung erhalten - Ihr Schutz ist aktiviert!'
        htmlContent = `
<!DOCTYPE html>
<html>
<head>
  <style>
    body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
    .container { max-width: 600px; margin: 0 auto; padding: 20px; }
    .header { background: linear-gradient(135deg, #276749 0%, #38a169 100%); color: white; padding: 30px; text-align: center; border-radius: 10px 10px 0 0; }
    .content { background: #f7fafc; padding: 30px; border-radius: 0 0 10px 10px; }
    .success-icon { font-size: 48px; margin-bottom: 15px; }
    .footer { text-align: center; margin-top: 20px; font-size: 12px; color: #718096; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <div class="success-icon">✅</div>
      <h1>Zahlung bestätigt!</h1>
    </div>
    <div class="content">
      <h2>Hallo ${profile.first_name} ${profile.last_name},</h2>
      <p>Wir haben Ihre Zahlung erhalten. Ihr Schutz ist nun <strong>aktiv</strong>!</p>
      
      <p><strong>Was passiert jetzt?</strong></p>
      <ul>
        <li>🔍 Wir führen einen ersten Scan Ihrer Domain durch</li>
        <li>🛡️ 24/7 Überwachung wird aktiviert</li>
        <li>📊 Sie erhalten Ihren ersten Bericht innerhalb von 48 Stunden</li>
      </ul>
      
      <p>Loggen Sie sich in Ihr Dashboard ein, um den Status zu verfolgen.</p>
      
      <p>Mit freundlichen Grüßen,<br>
      Ihr GAP-Protection Team</p>
    </div>
    <div class="footer">
      <p>GAP-Protection GmbH | Musterstraße 123 | 10115 Berlin</p>
    </div>
  </div>
</body>
</html>
        `
        break
        
      case 'monthly_invoice':
        subject = 'Ihre monatliche GAP-Protection Rechnung'
        // CC to rechnung@ for accounting
        ccRecipients = [RECHNUNG_EMAIL]
        htmlContent = `
<!DOCTYPE html>
<html>
<head>
  <style>
    body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
    .container { max-width: 600px; margin: 0 auto; padding: 20px; }
    .header { background: linear-gradient(135deg, #1a365d 0%, #2c5282 100%); color: white; padding: 30px; text-align: center; border-radius: 10px 10px 0 0; }
    .content { background: #f7fafc; padding: 30px; border-radius: 0 0 10px 10px; }
    .invoice-box { background: white; padding: 20px; border: 1px solid #e2e8f0; border-radius: 5px; margin: 15px 0; }
    .amount { font-size: 24px; font-weight: bold; color: #2c5282; }
    .footer { text-align: center; margin-top: 20px; font-size: 12px; color: #718096; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>📄 Monatliche Rechnung</h1>
    </div>
    <div class="content">
      <h2>Hallo ${profile.first_name} ${profile.last_name},</h2>
      <p>anbei erhalten Sie Ihre monatliche Rechnung für GAP-Protection.</p>
      
      <div class="invoice-box">
        <strong>GAP-Protection Cyber-Sicherheitsdienst</strong><br>
        Monat: ${new Date().toLocaleDateString('de-DE', { month: 'long', year: 'numeric' })}<br>
        <div class="amount">299,00 EUR</div>
        <small>Der Betrag wird per SEPA-Lastschrift eingezogen.</small>
      </div>
      
      <p>Mit freundlichen Grüßen,<br>
      Ihr GAP-Protection Team</p>
    </div>
    <div class="footer">
      <p>GAP Protection Ltd. | kontakt@gap-protection.com</p>
    </div>
  </div>
</body>
</html>
        `
        break
    }

    // ── Send via Resend API ──
    const recipients = [profile.email, ...ccRecipients]
    const result = await sendViaResend(recipients, subject, htmlContent)
    
    // Log to audit
    await supabase.from('audit_log').insert({
      action: 'EMAIL_SENT',
      table_name: 'profiles',
      record_id: profileId,
      new_data: { 
        type,
        recipient: profile.email,
        cc: ccRecipients,
        subject,
        resend_id: result.id,
        delivered: result.success,
      },
    })
    
    if (!result.success) {
      console.error(`Email delivery failed for ${type}:`, result.error)
    }
    
    return jsonResponse({ 
      success: result.success,
      message: result.success 
        ? `E-Mail vom Typ "${type}" wurde an ${profile.email} gesendet`
        : `E-Mail-Versand fehlgeschlagen: ${result.error}`,
      emailDetails: {
        to: profile.email,
        cc: ccRecipients,
        subject,
        resendId: result.id,
      }
    }, result.success ? 200 : 500, corsHeaders)
    
  } catch (error) {
    console.error('Send email error:', error)
    return jsonResponse({ error: 'E-Mail-Versand fehlgeschlagen' }, 500, getCorsHeaders(req))
  }
})

// ═══════════════════════════════════════════════════════════════
// Registration notification email template → kontakt@
// ═══════════════════════════════════════════════════════════════
function buildRegistrationNotificationHtml(profile: any): string {
  return `
<!DOCTYPE html>
<html>
<head>
  <style>
    body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
    .container { max-width: 600px; margin: 0 auto; padding: 20px; }
    .header { background: linear-gradient(135deg, #276749 0%, #38a169 100%); color: white; padding: 20px; text-align: center; border-radius: 10px 10px 0 0; }
    .content { background: #f7fafc; padding: 25px; border-radius: 0 0 10px 10px; }
    .info-row { padding: 8px 0; border-bottom: 1px solid #e2e8f0; }
    .info-row strong { display: inline-block; width: 140px; }
    .footer { text-align: center; margin-top: 15px; font-size: 11px; color: #a0aec0; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h2>🆕 Neue Kundenregistrierung</h2>
    </div>
    <div class="content">
      <p>Ein neuer Kunde hat sich registriert:</p>
      <div class="info-row"><strong>Name:</strong> ${profile.first_name} ${profile.last_name}</div>
      <div class="info-row"><strong>E-Mail:</strong> ${profile.email}</div>
      <div class="info-row"><strong>Telefon:</strong> ${profile.phone || '–'}</div>
      <div class="info-row"><strong>Domain:</strong> ${profile.domain}</div>
      <div class="info-row"><strong>Adresse:</strong> ${profile.street} ${profile.house_number}, ${profile.postal_code} ${profile.city}</div>
      <div class="info-row"><strong>Land:</strong> ${profile.country}</div>
      <div class="info-row"><strong>IBAN:</strong> ${profile.iban ? profile.iban.slice(0, 4) + '****' + profile.iban.slice(-4) : '–'}</div>
      <div class="info-row"><strong>SEPA Mandat:</strong> ${profile.sepa_mandate_accepted ? '✅ Erteilt' : '❌ Nicht erteilt'}</div>
      <div class="info-row"><strong>Sponsor:</strong> ${profile.sponsor_id || 'Keiner'}</div>
      <div class="info-row"><strong>Registriert am:</strong> ${new Date().toLocaleString('de-DE')}</div>
    </div>
    <div class="footer">
      <p>GAP Protection – Automatische Benachrichtigung</p>
    </div>
  </div>
</body>
</html>
  `
}
