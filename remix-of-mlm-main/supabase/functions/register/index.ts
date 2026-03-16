import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { getCorsHeaders, jsonResponse, getSupabaseAdmin, checkRateLimit } from '../_shared/auth.ts'

interface RegistrationData {
  email: string
  password: string
  firstName: string
  lastName: string
  phone?: string
  idNumber: string
  dateOfBirth: string
  street: string
  houseNumber: string
  postalCode: string
  city: string
  country: string
  domain: string
  ipAddress?: string
  iban: string
  bic?: string
  bankName: string
  accountHolder: string
  promotionCode: string
  domainOwner: boolean
  sepaMandate: boolean
  terms: boolean
  privacy: boolean
  ageConfirmation: boolean
}

// Calculate age from date of birth
function calculateAge(birthDate: Date): number {
  const today = new Date()
  let age = today.getFullYear() - birthDate.getFullYear()
  const monthDiff = today.getMonth() - birthDate.getMonth()
  if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birthDate.getDate())) {
    age--
  }
  return age
}

serve(async (req) => {
  const corsHeaders = getCorsHeaders(req)

  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders })
  }

  try {
    // Rate limiting for public registration endpoint
    const clientIp = req.headers.get('x-forwarded-for') || req.headers.get('cf-connecting-ip') || 'unknown'
    if (!checkRateLimit(`register:${clientIp}`, 5, 60_000)) {
      return jsonResponse({ error: 'Zu viele Anfragen. Bitte versuchen Sie es später erneut.' }, 429, corsHeaders)
    }

    const { supabase, url: supabaseUrl, key: supabaseServiceKey } = getSupabaseAdmin()
    
    const data: RegistrationData = await req.json()
    
    console.log('Registration request received for:', data.email?.replace(/(.{2}).*(@.*)/, '$1***$2'))
    
    // Validate required fields
    if (!data.promotionCode || !data.email || !data.password || !data.domain || !data.dateOfBirth) {
      return jsonResponse({ error: 'Pflichtfelder fehlen' }, 400, corsHeaders)
    }

    // Email format validation (RFC 5321 / 5322 practical subset)
    // - Local part: allows alphanumerics, dots, hyphens, underscores, plus signs
    //   but not starting/ending with a dot and no consecutive dots
    // - Domain: requires at least one dot, valid label chars, TLD >= 2 alpha chars
    // - Overall length capped at 254 per RFC 5321
    const emailRegex = /^[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)*\.[a-zA-Z]{2,}$/
    if (!emailRegex.test(data.email) || data.email.length > 254) {
      return jsonResponse({ error: 'Ungültige E-Mail-Adresse' }, 400, corsHeaders)
    }

    // IBAN basic format validation (DE IBANs: DE + 20 alphanumeric)
    const cleanIban = data.iban.replace(/\s/g, '')
    if (!/^[A-Z]{2}\d{2}[A-Z0-9]{4,30}$/.test(cleanIban)) {
      return jsonResponse({ error: 'Ungültige IBAN' }, 400, corsHeaders)
    }

    // Domain format validation
    if (!/^[a-zA-Z0-9]([a-zA-Z0-9-]*[a-zA-Z0-9])?(\.[a-zA-Z0-9]([a-zA-Z0-9-]*[a-zA-Z0-9])?)*\.[a-zA-Z]{2,}$/.test(data.domain)) {
      return jsonResponse({ error: 'Ungültiger Domainname' }, 400, corsHeaders)
    }

    // Password strength
    if (data.password.length < 8) {
      return jsonResponse({ error: 'Passwort muss mindestens 8 Zeichen lang sein' }, 400, corsHeaders)
    }
    
    // Validate age (must be 18+)
    const birthDate = new Date(data.dateOfBirth)
    const age = calculateAge(birthDate)
    if (age < 18) {
      return new Response(
        JSON.stringify({ error: 'Sie müssen mindestens 18 Jahre alt sein' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }
    
    // Validate age confirmation checkbox
    if (!data.ageConfirmation) {
      return new Response(
        JSON.stringify({ error: 'Sie müssen bestätigen, dass alle Angaben wahrheitsgemäß sind' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }
    
    // First, try to validate against rotating_promo_codes (new system)
    let sponsorId: string | null = null
    let rotatingCodeId: string | null = null
    let codeType = 'partner'
    
    // Check rotating/fixed promo codes first (new system)
    const { data: rotatingCode } = await supabase
      .from('rotating_promo_codes')
      .select('id, code_type, is_active, valid_from, valid_to, max_uses, use_count')
      .eq('code', data.promotionCode.toUpperCase())
      .eq('is_active', true)
      .gte('valid_to', new Date().toISOString())
      .lte('valid_from', new Date().toISOString())
      .single()
    
    if (rotatingCode) {
      // Check max uses for rotating/fixed codes
      if (rotatingCode.max_uses && rotatingCode.use_count >= rotatingCode.max_uses) {
        return new Response(
          JSON.stringify({ error: 'Promotion Code hat maximale Verwendungen erreicht' }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )
      }
      
      rotatingCodeId = rotatingCode.id
      codeType = rotatingCode.code_type
      console.log('Rotating/Fixed code valid:', data.promotionCode, 'Type:', codeType)
    } else {
      // Fallback: check partner promotion codes (legacy system)
      const { data: promoData, error: promoError } = await supabase
        .from('promotion_codes')
        .select('partner_id, is_active, usage_count, max_uses, expires_at')
        .eq('code', data.promotionCode.toUpperCase())
        .eq('is_active', true)
        .single()
      
      if (promoError || !promoData) {
        console.error('Invalid promo code:', data.promotionCode)
        return new Response(
          JSON.stringify({ error: 'Ungültiger Promotion Code' }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )
      }
      
      // Check max uses for partner codes
      if (promoData.max_uses && promoData.usage_count >= promoData.max_uses) {
        return new Response(
          JSON.stringify({ error: 'Promotion Code hat maximale Verwendungen erreicht' }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )
      }
      
      // Check expiration
      if (promoData.expires_at && new Date(promoData.expires_at) < new Date()) {
        return new Response(
          JSON.stringify({ error: 'Promotion Code ist abgelaufen' }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )
      }
      
      sponsorId = promoData.partner_id
      codeType = 'partner'
      console.log('Partner code valid, sponsor:', sponsorId)
    }
    
    console.log('Code validation passed. Type:', codeType, 'Sponsor:', sponsorId)
    
    // Create auth user
    const { data: authData, error: authError } = await supabase.auth.admin.createUser({
      email: data.email,
      password: data.password,
      email_confirm: false, // User must verify email
    })
    
    if (authError || !authData.user) {
      console.error('Auth error:', authError)
      return new Response(
        JSON.stringify({ error: authError?.message || 'Registrierung fehlgeschlagen' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }
    
    console.log('Auth user created:', authData.user.id)
    
    // Create profile
    const { data: profileData, error: profileError } = await supabase
      .from('profiles')
      .insert({
        user_id: authData.user.id,
        first_name: data.firstName,
        last_name: data.lastName,
        email: data.email,
        phone: data.phone || null,
        id_number: data.idNumber,
        date_of_birth: data.dateOfBirth,
        street: data.street,
        house_number: data.houseNumber,
        postal_code: data.postalCode,
        city: data.city,
        country: data.country || 'Deutschland',
        domain: data.domain,
        ip_address: data.ipAddress || null,
        iban: data.iban.replace(/\s/g, ''),
        bic: data.bic || null,
        bank_name: data.bankName,
        account_holder: data.accountHolder,
        sepa_mandate_accepted: data.sepaMandate,
        sepa_mandate_date: new Date().toISOString(),
        terms_accepted: data.terms,
        privacy_accepted: data.privacy,
        domain_owner_confirmed: data.domainOwner,
        age_confirmed: data.ageConfirmation,
        sponsor_id: sponsorId,
        role: 'customer',
        status: 'pending',
      })
      .select()
      .single()
    
    if (profileError) {
      console.error('Profile error:', profileError)
      // Rollback: delete auth user
      await supabase.auth.admin.deleteUser(authData.user.id)
      return new Response(
        JSON.stringify({ error: 'Profil konnte nicht erstellt werden' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }
    
    console.log('Profile created:', profileData.id)
    
    // Build hierarchy for this new user (only if sponsor exists)
    if (sponsorId) {
      try {
        const hierarchyResponse = await fetch(`${supabaseUrl}/functions/v1/build-hierarchy`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${supabaseServiceKey}`,
          },
          body: JSON.stringify({ 
            profileId: profileData.id, 
            sponsorId: sponsorId 
          }),
        })
        const hierarchyResult = await hierarchyResponse.json()
        console.log('Hierarchy built:', hierarchyResult)
      } catch (hierarchyError) {
        console.error('Hierarchy build error:', hierarchyError)
      }
    }
    
    // Update promotion code usage based on code type
    if (rotatingCodeId) {
      // Atomic increment via RPC to prevent TOCTOU race
      await supabase.rpc('increment_promo_use_count', { p_code_id: rotatingCodeId })
      
      // Log usage in promo_code_usages table
      await supabase.from('promo_code_usages').insert({
        promo_code_id: rotatingCodeId,
        user_id: profileData.id,
        user_email: data.email,
        result: 'success',
        code_type: codeType
      })
    } else {
      // Update partner promotion code usage — use SQL atomic increment via raw RPC
      const { error: incrError } = await supabase.rpc('increment_partner_promo_usage', {
        p_code: data.promotionCode.toUpperCase()
      })
      if (incrError) {
        // Fallback: atomic increment via raw SQL to prevent TOCTOU race condition
        console.warn('Atomic increment RPC not available, using raw SQL update:', incrError.message)
        await supabase.rpc('increment_promo_use_count', { p_code_id: data.promotionCode.toUpperCase() }).then(() => {}).catch(async () => {
          // Last resort: use UPDATE with subquery (still atomic in PostgreSQL)
          await supabase
            .from('promotion_codes')
            .update({ usage_count: supabase.rpc('coalesce_increment', { tbl: 'promotion_codes', col: 'usage_count', val: 1 }) as any })
            .eq('code', data.promotionCode.toUpperCase())
        })
      }
    }
    
    // Send welcome email
    try {
      await fetch(`${supabaseUrl}/functions/v1/send-welcome-email`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${supabaseServiceKey}`,
        },
        body: JSON.stringify({ profileId: profileData.id, type: 'welcome' }),
      })
    } catch (emailError) {
      console.error('Welcome email error:', emailError)
    }

    // ── Notify kontakt@gap-protection.com about new registration ──
    try {
      await fetch(`${supabaseUrl}/functions/v1/send-welcome-email`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${supabaseServiceKey}`,
        },
        body: JSON.stringify({ profileId: profileData.id, type: 'registration_notification' }),
      })
      console.log('Registration notification sent to kontakt@gap-protection.com')
    } catch (notifError) {
      console.error('Registration notification error:', notifError)
    }
    
    // Generate contract PDF
    try {
      await fetch(`${supabaseUrl}/functions/v1/generate-contract-pdf`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${supabaseServiceKey}`,
        },
        body: JSON.stringify({ profileId: profileData.id, type: 'both' }),
      })
    } catch (pdfError) {
      console.error('PDF generation error:', pdfError)
    }

    // ── Auto-activate domain protection & run first scan ──
    try {
      // 1. Register the domain in protected_domains
      const { data: domainRecord } = await supabase
        .from('protected_domains')
        .insert({
          profile_id: profileData.id,
          domain: data.domain,
          protection_status: 'active',
          activated_at: new Date().toISOString(),
        })
        .select()
        .single()

      console.log('Domain protection activated:', data.domain)

      // 2. Run first security scan immediately
      const scanResponse = await fetch(`${supabaseUrl}/functions/v1/security-scan`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${supabaseServiceKey}`,
        },
        body: JSON.stringify({
          domain: data.domain,
          scanType: 'full',
          userId: profileData.id,
        }),
      })
      const scanResult = await scanResponse.json()
      console.log('Initial security scan completed:', scanResult?.result || 'done')

      // 3. Schedule monthly recurring scan
      if (domainRecord) {
        await fetch(`${supabaseUrl}/functions/v1/scheduled-scan`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${supabaseServiceKey}`,
          },
          body: JSON.stringify({
            action: 'create',
            profileId: profileData.id,
            domainId: domainRecord.id,
            schedule: 'monthly',
          }),
        })
        console.log('Monthly scan scheduled for:', data.domain)
      }
    } catch (scanError) {
      console.error('Auto-scan setup error:', scanError)
      // Non-blocking: registration still succeeds even if scan fails
    }
    
    // Log to audit
    await supabase.from('audit_log').insert({
      action: 'CUSTOMER_REGISTRATION',
      table_name: 'profiles',
      record_id: profileData.id,
      new_data: {
        email: data.email,
        sponsor_id: sponsorId,
        domain: data.domain
      },
    })
    
    return new Response(
      JSON.stringify({ 
        success: true, 
        message: 'Registrierung erfolgreich. Bitte bestätigen Sie Ihre E-Mail.',
        profileId: profileData.id 
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
    
  } catch (error) {
    console.error('Registration error:', error)
    return new Response(
      JSON.stringify({ error: 'Interner Serverfehler' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})
