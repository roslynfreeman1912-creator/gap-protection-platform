import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { getCorsHeaders, jsonResponse, authenticateServiceCall, authenticateRequest, getSupabaseAdmin } from '../_shared/auth.ts'

interface GeneratePDFRequest {
  profileId: string
  type: 'contract' | 'sepa' | 'both'
}

// Generate contract and SEPA mandate PDF
serve(async (req) => {
  const corsHeaders = getCorsHeaders(req)

  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders })
  }

  try {
    const { supabase } = getSupabaseAdmin()

    // Allow service-role calls or admin users
    const serviceAuth = authenticateServiceCall(req, corsHeaders)
    if (!serviceAuth.ok) {
      const authResult = await authenticateRequest(req, corsHeaders, { requiredRole: 'admin' })
      if (authResult.response) return authResult.response
    }
    
    const { profileId, type = 'both' }: GeneratePDFRequest = await req.json()
    
    if (!profileId) {
      return new Response(
        JSON.stringify({ error: 'Profil-ID erforderlich' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }
    
    // Get profile data
    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', profileId)
      .single()
    
    if (profileError || !profile) {
      return new Response(
        JSON.stringify({ error: 'Profil nicht gefunden' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Load branding/settings from mlm_settings (optional, fallback to static values)
    const { data: settings } = await supabase
      .from('mlm_settings')
      .select('key, value')
      .in('key', ['company_name', 'company_subtitle', 'company_address', 'company_logo_url'])

    const settingsMap: Record<string, any> = {}
    for (const s of settings || []) {
      settingsMap[s.key] = typeof s.value === 'string' ? s.value : s.value
    }

    const companyName = settingsMap['company_name'] || 'GAP Protection GmbH'
    const companySubtitle = settingsMap['company_subtitle'] || 'Cyber-Sicherheit & Monitoring'
    const companyAddress = settingsMap['company_address'] || 'Musterstraße 123, 10115 Berlin, Deutschland'
    const companyLogoUrl = settingsMap['company_logo_url'] || ''

    const contractDate = new Date().toLocaleDateString('de-DE')
    const customerNumber = `GP-${Date.now().toString(36).toUpperCase()}`
    
    // Generate contract HTML
    const contractHTML = `
<!DOCTYPE html>
<html lang="de">
<head>
  <meta charset="UTF-8">
  <title>${companyName} · Vertrag</title>
  <style>
    body { font-family: Arial, sans-serif; margin: 40px; line-height: 1.6; }
    .header { text-align: center; margin-bottom: 40px; }
    .logo-text { font-size: 24px; font-weight: bold; color: #1a365d; }
    .logo-img { max-height: 48px; margin-bottom: 8px; }
    .contract-title { font-size: 20px; margin-top: 6px; color: #2d3748; }
    .company-subtitle { font-size: 12px; color: #4a5568; margin-top: 2px; }
    .section { margin-bottom: 20px; }
    .section-title { font-weight: bold; font-size: 14px; color: #1a365d; margin-bottom: 10px; border-bottom: 1px solid #e2e8f0; padding-bottom: 5px; }
    .data-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; }
    .data-item { margin-bottom: 8px; }
    .label { font-size: 12px; color: #718096; }
    .value { font-size: 14px; font-weight: 500; }
    .terms { font-size: 11px; margin-top: 30px; color: #4a5568; }
    .signature-section { margin-top: 50px; display: flex; justify-content: space-between; }
    .signature-box { width: 200px; }
    .signature-line { border-bottom: 1px solid #000; margin-top: 50px; }
    .signature-label { font-size: 12px; margin-top: 5px; }
  </style>
</head>
<body>
  <div class="header">
    ${
      companyLogoUrl
        ? `<img src="${companyLogoUrl}" alt="${companyName}" class="logo-img" />`
        : `<div class="logo-text">${companyName}</div>`
    }
    <div class="contract-title">Dienstleistungsvertrag für Cyber-Sicherheit</div>
    <div class="company-subtitle">${companySubtitle}</div>
  </div>
  
  <div class="section">
    <div class="section-title">Kundendaten</div>
    <div class="data-grid">
      <div class="data-item">
        <div class="label">Kundennummer</div>
        <div class="value">${customerNumber}</div>
      </div>
      <div class="data-item">
        <div class="label">Vertragsdatum</div>
        <div class="value">${contractDate}</div>
      </div>
      <div class="data-item">
        <div class="label">Name</div>
        <div class="value">${profile.first_name} ${profile.last_name}</div>
      </div>
      <div class="data-item">
        <div class="label">E-Mail</div>
        <div class="value">${profile.email}</div>
      </div>
      <div class="data-item">
        <div class="label">Adresse</div>
        <div class="value">${profile.street} ${profile.house_number}, ${profile.postal_code} ${profile.city}</div>
      </div>
      <div class="data-item">
        <div class="label">Ausweisnummer</div>
        <div class="value">${profile.id_number}</div>
      </div>
    </div>
  </div>
  
  <div class="section">
    <div class="section-title">Zu schützende Domain/IP</div>
    <div class="data-grid">
      <div class="data-item">
        <div class="label">Domain</div>
        <div class="value">${profile.domain}</div>
      </div>
      <div class="data-item">
        <div class="label">IP-Adresse</div>
        <div class="value">${profile.ip_address || 'Wird automatisch ermittelt'}</div>
      </div>
    </div>
  </div>
  
  <div class="section">
    <div class="section-title">Vertragskonditionen</div>
    <div class="data-grid">
      <div class="data-item">
        <div class="label">Monatliche Gebühr</div>
        <div class="value">299,00 EUR</div>
      </div>
      <div class="data-item">
        <div class="label">Vertragslaufzeit</div>
        <div class="value">24 Monate</div>
      </div>
      <div class="data-item">
        <div class="label">Zahlungsweise</div>
        <div class="value">SEPA-Lastschrift</div>
      </div>
    </div>
  </div>
  
  <div class="section">
    <div class="section-title">Leistungsumfang</div>
    <ul>
      <li>24/7 Überwachung und Erkennung von Cyber-Bedrohungen</li>
      <li>Automatische Malware-Entfernung</li>
      <li>Firewall-Optimierung und Patch-Management</li>
      <li>Monatliche Sicherheitsberichte</li>
      <li>Notfall-Hotline für kritische Vorfälle</li>
    </ul>
  </div>
  
  <div class="terms">
    Mit der Unterzeichnung dieses Vertrages erkläre ich mich mit den Allgemeinen Geschäftsbedingungen (AGB) 
    und der Datenschutzerklärung von ${companyName} einverstanden. Der Vertrag beginnt mit Eingang der ersten Zahlung.
  </div>
  
  <div class="signature-section">
    <div class="signature-box">
      <div class="signature-line"></div>
      <div class="signature-label">Ort, Datum</div>
    </div>
    <div class="signature-box">
      <div class="signature-line"></div>
      <div class="signature-label">Unterschrift Kunde</div>
    </div>
  </div>
</body>
</html>
    `
    
    // Generate SEPA mandate HTML
    const sepaHTML = `
<!DOCTYPE html>
<html lang="de">
<head>
  <meta charset="UTF-8">
  <title>SEPA-Firmenlastschriftmandat · ${companyName}</title>
  <style>
    body { font-family: Arial, sans-serif; margin: 40px; line-height: 1.6; }
    .header { text-align: center; margin-bottom: 30px; }
    .logo { font-size: 24px; font-weight: bold; color: #1a365d; }
    .mandate-title { font-size: 18px; margin-top: 10px; color: #2d3748; }
    .creditor-info { background: #f7fafc; padding: 15px; border-radius: 5px; margin-bottom: 20px; }
    .section { margin-bottom: 20px; }
    .section-title { font-weight: bold; font-size: 14px; color: #1a365d; margin-bottom: 10px; }
    .data-row { display: flex; margin-bottom: 8px; }
    .label { width: 200px; font-size: 12px; color: #718096; }
    .value { font-size: 14px; font-weight: 500; }
    .mandate-text { font-size: 12px; background: #f7fafc; padding: 15px; border-radius: 5px; margin: 20px 0; }
    .signature-section { margin-top: 40px; }
    .signature-box { margin-bottom: 30px; }
    .signature-line { border-bottom: 1px solid #000; width: 300px; margin-top: 40px; }
    .signature-label { font-size: 12px; margin-top: 5px; }
    .mandate-ref { font-family: monospace; font-size: 14px; background: #edf2f7; padding: 5px 10px; display: inline-block; }
  </style>
</head>
<body>
  <div class="header">
    ${
      companyLogoUrl
        ? `<img src="${companyLogoUrl}" alt="${companyName}" class="logo-img" />`
        : `<div class="logo">${companyName}</div>`
    }
    <div class="mandate-title">SEPA-Firmenlastschriftmandat</div>
  </div>
  
  <div class="creditor-info">
    <div class="section-title">Gläubiger-Identifikationsnummer</div>
    <div class="mandate-ref">DE98ZZZ09999999999</div>
    <div style="margin-top: 10px;">
      <strong>${companyName}</strong><br>
      ${companyAddress}<br>
    </div>
  </div>
  
  <div class="section">
    <div class="section-title">Mandatsreferenz</div>
    <div class="mandate-ref">SEPA-${customerNumber}</div>
  </div>
  
  <div class="section">
    <div class="section-title">Zahlungspflichtiger (Debtor)</div>
    <div class="data-row">
      <div class="label">Name/Firma</div>
      <div class="value">${profile.account_holder || `${profile.first_name} ${profile.last_name}`}</div>
    </div>
    <div class="data-row">
      <div class="label">Anschrift</div>
      <div class="value">${profile.street} ${profile.house_number}, ${profile.postal_code} ${profile.city}</div>
    </div>
  </div>
  
  <div class="section">
    <div class="section-title">Bankverbindung</div>
    <div class="data-row">
      <div class="label">IBAN</div>
      <div class="value">${profile.iban}</div>
    </div>
    <div class="data-row">
      <div class="label">BIC</div>
      <div class="value">${profile.bic || 'Wird automatisch ermittelt'}</div>
    </div>
    <div class="data-row">
      <div class="label">Kreditinstitut</div>
      <div class="value">${profile.bank_name}</div>
    </div>
  </div>
  
  <div class="mandate-text">
    <strong>SEPA-Lastschriftmandat</strong><br><br>
    Ich ermächtige GAP-Protection GmbH, Zahlungen von meinem Konto mittels Lastschrift einzuziehen. 
    Zugleich weise ich mein Kreditinstitut an, die von GAP-Protection GmbH auf mein Konto gezogenen 
    Lastschriften einzulösen.<br><br>
    <strong>Hinweis:</strong> Ich kann innerhalb von acht Wochen, beginnend mit dem Belastungsdatum, 
    die Erstattung des belasteten Betrages verlangen. Es gelten dabei die mit meinem Kreditinstitut 
    vereinbarten Bedingungen.<br><br>
    <strong>Art der Zahlung:</strong> Wiederkehrende Zahlung<br>
    <strong>Betrag:</strong> 299,00 EUR monatlich
  </div>
  
  <div class="signature-section">
    <div class="signature-box">
      <div class="signature-line"></div>
      <div class="signature-label">Ort, Datum: ${contractDate}</div>
    </div>
    <div class="signature-box">
      <div class="signature-line"></div>
      <div class="signature-label">Unterschrift des Zahlungspflichtigen</div>
    </div>
  </div>
  
  <div style="margin-top: 20px; font-size: 10px; color: #718096;">
    Mandatserteilung: ${new Date().toISOString()}<br>
    Elektronische Zustimmung erteilt: ${profile.sepa_mandate_accepted ? 'Ja' : 'Nein'}<br>
    IP-Adresse bei Zustimmung: ${profile.ip_address || 'N/A'}
  </div>
</body>
</html>
    `
    
    // Log to audit
    await supabase.from('audit_log').insert({
      action: 'PDF_GENERATED',
      table_name: 'profiles',
      record_id: profileId,
      new_data: { 
        type,
        customer_number: customerNumber
      },
    })
    
    const response: Record<string, string> = {}
    
    if (type === 'contract' || type === 'both') {
      response.contractHTML = contractHTML
    }
    if (type === 'sepa' || type === 'both') {
      response.sepaHTML = sepaHTML
    }
    response.customerNumber = customerNumber
    
    return new Response(
      JSON.stringify({ 
        success: true,
        ...response
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
    
  } catch (error) {
    console.error('Generate PDF error:', error)
    return new Response(
      JSON.stringify({ error: 'PDF-Generierung fehlgeschlagen' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})
