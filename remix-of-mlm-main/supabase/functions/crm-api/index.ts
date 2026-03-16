import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { getCorsHeaders, jsonResponse, getSupabaseAdmin, authenticateRequest } from '../_shared/auth.ts'

// ═══════════════════════════════════════════════════════════════
// GAP Protection — CRM API
// Full CRUD for contacts, notes, reminders + email + export
// ═══════════════════════════════════════════════════════════════

const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY') || ''
const FROM_EMAIL = Deno.env.get('RESEND_FROM_EMAIL') || 'onboarding@resend.dev'

serve(async (req: Request) => {
  const corsHeaders = getCorsHeaders(req)
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders })

  try {
    const authResult = await authenticateRequest(req, corsHeaders)
    if (authResult.response) return authResult.response
    const { auth } = authResult
    const profileId = auth.profileId
    const isAdmin = auth.roles.includes('admin') || auth.roles.includes('super_admin')
    const { supabase } = getSupabaseAdmin()

    const body = await req.json()
    const { action } = body

    switch (action) {
      // ── LIST CONTACTS ──
      case 'list': {
        let query = supabase
          .from('crm_contacts')
          .select('*, crm_notes(count), crm_reminders(count)')
          .order('updated_at', { ascending: false })

        if (!isAdmin) query = query.eq('owner_id', profileId)
        if (body.status) query = query.eq('status', body.status)
        if (body.search) {
          query = query.or(`company_name.ilike.%${body.search}%,email.ilike.%${body.search}%,city.ilike.%${body.search}%,phone.ilike.%${body.search}%`)
        }

        const { data, error } = await query.limit(500)
        if (error) return jsonResponse({ error: error.message }, 500, corsHeaders)
        return jsonResponse({ contacts: data }, 200, corsHeaders)
      }

      // ── GET CONTACT DETAIL ──
      case 'get': {
        const { contactId } = body
        if (!contactId) return jsonResponse({ error: 'contactId required' }, 400, corsHeaders)

        let query = supabase
          .from('crm_contacts')
          .select('*')
          .eq('id', contactId)
        if (!isAdmin) query = query.eq('owner_id', profileId)

        const { data: contact, error } = await query.single()
        if (error) return jsonResponse({ error: error.message }, 404, corsHeaders)

        // Get notes
        const { data: notes } = await supabase
          .from('crm_notes')
          .select('*, user:user_id(first_name, last_name)')
          .eq('contact_id', contactId)
          .order('created_at', { ascending: false })

        // Get reminders
        const { data: reminders } = await supabase
          .from('crm_reminders')
          .select('*, user:user_id(first_name, last_name)')
          .eq('contact_id', contactId)
          .order('reminder_date', { ascending: true })

        return jsonResponse({ contact, notes: notes || [], reminders: reminders || [] }, 200, corsHeaders)
      }

      // ── CREATE CONTACT ──
      case 'create': {
        const { data, error } = await supabase
          .from('crm_contacts')
          .insert({ ...body.contact, owner_id: profileId })
          .select()
          .single()
        if (error) return jsonResponse({ error: error.message }, 500, corsHeaders)
        return jsonResponse({ contact: data }, 201, corsHeaders)
      }

      // ── UPDATE CONTACT ──
      case 'update': {
        const { contactId, contact } = body
        let query = supabase.from('crm_contacts').update(contact).eq('id', contactId)
        if (!isAdmin) query = query.eq('owner_id', profileId)
        const { data, error } = await query.select().single()
        if (error) return jsonResponse({ error: error.message }, 500, corsHeaders)
        return jsonResponse({ contact: data }, 200, corsHeaders)
      }

      // ── DELETE CONTACT ──
      case 'delete': {
        let query = supabase.from('crm_contacts').delete().eq('id', body.contactId)
        if (!isAdmin) query = query.eq('owner_id', profileId)
        const { error } = await query
        if (error) return jsonResponse({ error: error.message }, 500, corsHeaders)
        return jsonResponse({ success: true }, 200, corsHeaders)
      }

      // ── ADD NOTE ──
      case 'add-note': {
        const { data, error } = await supabase
          .from('crm_notes')
          .insert({ contact_id: body.contactId, user_id: profileId, note_text: body.text })
          .select('*, user:user_id(first_name, last_name)')
          .single()
        if (error) return jsonResponse({ error: error.message }, 500, corsHeaders)
        return jsonResponse({ note: data }, 201, corsHeaders)
      }

      // ── ADD REMINDER ──
      case 'add-reminder': {
        const { data, error } = await supabase
          .from('crm_reminders')
          .insert({
            contact_id: body.contactId,
            user_id: profileId,
            title: body.title,
            reminder_date: body.reminderDate,
          })
          .select('*, user:user_id(first_name, last_name)')
          .single()
        if (error) return jsonResponse({ error: error.message }, 500, corsHeaders)
        return jsonResponse({ reminder: data }, 201, corsHeaders)
      }

      // ── COMPLETE REMINDER ──
      case 'complete-reminder': {
        const { data, error } = await supabase
          .from('crm_reminders')
          .update({ is_completed: body.completed ?? true })
          .eq('id', body.reminderId)
          .select()
          .single()
        if (error) return jsonResponse({ error: error.message }, 500, corsHeaders)
        return jsonResponse({ reminder: data }, 200, corsHeaders)
      }

      // ── SEND EMAIL ──
      case 'send-email': {
        const { contactId, subject, htmlBody, templateType } = body

        let emailTo = body.emailTo
        if (contactId && !emailTo) {
          const { data: c } = await supabase.from('crm_contacts').select('email, company_name').eq('id', contactId).single()
          emailTo = c?.email
        }
        if (!emailTo) return jsonResponse({ error: 'No email address' }, 400, corsHeaders)

        // Get sender profile for reply-to
        const { data: sender } = await supabase.from('profiles').select('email, first_name, last_name').eq('id', profileId).single()
        const replyTo = sender?.email || 'kontakt@gap-protection.com'

        let finalSubject = subject || 'Nachricht von GAP Protection'
        let finalHtml = htmlBody || ''

        // Pre-built templates
        if (templateType === 'penetration_vollmacht') {
          finalSubject = 'Vollmacht zum Penetrationstest — GAP Protection'
          finalHtml = `<!DOCTYPE html><html><head><style>body{font-family:Arial,sans-serif;line-height:1.6;color:#333}.container{max-width:600px;margin:0 auto;padding:20px}.header{background:linear-gradient(135deg,#1a365d,#2c5282);color:#fff;padding:30px;text-align:center;border-radius:10px 10px 0 0}.content{background:#f7fafc;padding:30px;border-radius:0 0 10px 10px}.footer{text-align:center;margin-top:20px;font-size:12px;color:#718096}</style></head><body><div class="container"><div class="header"><h1>🛡️ Vollmacht zum Penetrationstest</h1><p>GAP Protection Ltd.</p></div><div class="content"><h2>Sehr geehrte Damen und Herren,</h2><p>hiermit übermitteln wir Ihnen die <strong>Vollmacht zur Durchführung eines Penetrationstests</strong> für Ihre IT-Infrastruktur.</p><p>Bitte füllen Sie das beigefügte Formular aus und senden Sie es unterschrieben an uns zurück. Nach Eingang der Vollmacht werden wir den Penetrationstest zeitnah durchführen.</p><div style="background:#fff;padding:15px;border:1px solid #e2e8f0;border-radius:5px;margin:15px 0"><strong>Was wird geprüft?</strong><ul><li>Netzwerk- & Infrastruktursicherheit</li><li>Webanwendungen & APIs</li><li>E-Mail-Sicherheit (SPF, DKIM, DMARC)</li><li>SSL/TLS-Konfiguration</li><li>Bekannte Schwachstellen (CVE-Datenbank)</li></ul></div><p>Bei Fragen stehen wir Ihnen jederzeit zur Verfügung.</p><p>Mit freundlichen Grüßen,<br><strong>${sender?.first_name} ${sender?.last_name}</strong><br>GAP Protection Ltd.</p></div><div class="footer"><p>GAP Protection Ltd. | kontakt@gap-protection.com</p></div></div></body></html>`
        }

        // Send via Resend
        const res = await fetch('https://api.resend.com/emails', {
          method: 'POST',
          headers: { 'Authorization': `Bearer ${RESEND_API_KEY}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({
            from: `GAP Protection <${FROM_EMAIL}>`,
            to: [emailTo],
            subject: finalSubject,
            html: finalHtml,
            reply_to: replyTo,
          }),
        })

        const resData = await res.json()
        // Log
        await supabase.from('audit_log').insert({
          action: 'CRM_EMAIL_SENT', table_name: 'crm_contacts',
          record_id: contactId || '00000000-0000-0000-0000-000000000000',
          user_id: profileId,
          new_data: { to: emailTo, subject: finalSubject, resend_id: resData?.id, sender: replyTo },
        })
        return jsonResponse({ success: res.ok, resendId: resData?.id }, res.ok ? 200 : 500, corsHeaders)
      }

      // ── EXPORT CSV ──
      case 'export-csv': {
        let query = supabase.from('crm_contacts').select('*').order('company_name')
        if (!isAdmin) query = query.eq('owner_id', profileId)
        const { data: contacts, error } = await query
        if (error) return jsonResponse({ error: error.message }, 500, corsHeaders)

        const headers = ['Firmenname','Straße','Hausnr','PLZ','Ort','Telefon','E-Mail','Fax','Notizen','Penetrationstest','Bedrohung','Abo-Datum','Status']
        const rows = (contacts || []).map((c: any) => [
          c.company_name, c.street, c.house_number, c.postal_code, c.city,
          c.phone, c.email, c.fax, c.notes?.replace(/[\n\r]/g,' '),
          c.penetration_test_date || '', c.threat_level || '', c.subscription_date || '', c.status
        ].map((v: any) => `"${String(v || '').replace(/"/g,'""')}"`).join(';'))

        const csv = [headers.join(';'), ...rows].join('\n')
        return jsonResponse({ csv }, 200, corsHeaders)
      }

      // ── IMPORT CSV ──
      case 'import-csv': {
        const { rows } = body // array of objects
        if (!rows?.length) return jsonResponse({ error: 'No rows' }, 400, corsHeaders)
        const inserts = rows.map((r: any) => ({
          owner_id: profileId,
          company_name: r.Firmenname || r.company_name || '',
          street: r['Straße'] || r.street || '',
          house_number: r.Hausnr || r.house_number || '',
          postal_code: r.PLZ || r.postal_code || '',
          city: r.Ort || r.city || '',
          phone: r.Telefon || r.phone || '',
          email: r['E-Mail'] || r.email || '',
          fax: r.Fax || r.fax || '',
          notes: r.Notizen || r.notes || '',
          status: 'new',
        }))
        const { data, error } = await supabase.from('crm_contacts').insert(inserts).select()
        if (error) return jsonResponse({ error: error.message }, 500, corsHeaders)
        return jsonResponse({ imported: data?.length || 0 }, 201, corsHeaders)
      }

      // ── UPCOMING REMINDERS ──
      case 'upcoming-reminders': {
        let query = supabase
          .from('crm_reminders')
          .select('*, contact:contact_id(company_name, email, phone), user:user_id(first_name, last_name)')
          .eq('is_completed', false)
          .gte('reminder_date', new Date().toISOString())
          .order('reminder_date', { ascending: true })
          .limit(50)
        if (!isAdmin) query = query.eq('user_id', profileId)
        const { data, error } = await query
        if (error) return jsonResponse({ error: error.message }, 500, corsHeaders)
        return jsonResponse({ reminders: data || [] }, 200, corsHeaders)
      }

      default:
        return jsonResponse({ error: `Unknown action: ${action}` }, 400, corsHeaders)
    }
  } catch (err: any) {
    console.error('CRM API Error:', err)
    return jsonResponse({ error: err.message || 'Server error' }, 500, getCorsHeaders(req))
  }
})
