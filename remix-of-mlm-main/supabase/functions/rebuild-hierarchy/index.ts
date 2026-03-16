import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { getCorsHeaders, jsonResponse, authenticateRequest, authenticateServiceCall, getSupabaseAdmin } from '../_shared/auth.ts'

// Rebuild hierarchy for a single user — FIXED 5-LEVEL MODEL (Breite statt Tiefe)
// Die Hierarchie hat genau 5 feste Ebenen:
//   Ebene 1: Geschäftsführer
//   Ebene 2: Verkaufsleiter
//   Ebene 3: Regional Manager
//   Ebene 4: Teamleiter
//   Ebene 5: Agent
// Jeder kann unbegrenzt viele direkte Untergebene haben (Breite).
// Niemand fällt raus — alle 5 Ebenen sind immer aktiv.
async function buildUserHierarchy(supabase: any, userId: string, sponsorId: string | null) {
  if (!sponsorId) return 0

  let currentSponsorId = sponsorId
  let level = 1
  let entriesCreated = 0

  // Max 5 Schritte nach oben (da max 5 Ebenen)
  while (currentSponsorId && level <= 5) {
    const { error } = await supabase
      .from('user_hierarchy')
      .upsert({
        user_id: userId,
        ancestor_id: currentSponsorId,
        level_number: level,
        is_active_for_commission: true,  // Alle 5 Ebenen immer aktiv
      }, {
        onConflict: 'user_id,ancestor_id'
      })

    if (!error) entriesCreated++

    const { data: nextProfile } = await supabase
      .from('profiles')
      .select('sponsor_id')
      .eq('id', currentSponsorId)
      .single()

    currentSponsorId = nextProfile?.sponsor_id
    level++
  }

  return entriesCreated
}

serve(async (req) => {
  const corsHeaders = getCorsHeaders(req)

  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders })
  }

  try {
    // ADMIN or SERVICE-ONLY
    const serviceAuth = authenticateServiceCall(req, corsHeaders)
    if (!serviceAuth.ok) {
      const authResult = await authenticateRequest(req, corsHeaders, { allowedRoles: ['admin', 'super_admin'] })
      if (authResult.response) return authResult.response
    }

    const { supabase } = getSupabaseAdmin()

    // Clear existing hierarchy
    await supabase.from('user_hierarchy').delete().neq('id', '00000000-0000-0000-0000-000000000000')

    // Get all profiles with sponsors
    const { data: profiles, error: profilesError } = await supabase
      .from('profiles')
      .select('id, sponsor_id')
      .not('sponsor_id', 'is', null)
      .order('created_at', { ascending: true })

    if (profilesError) {
      console.error('Profiles error:', profilesError)
      return jsonResponse({ error: 'Fehler beim Laden der Profile' }, 500, corsHeaders)
    }

    let totalEntries = 0
    let processedUsers = 0

    for (const profile of profiles || []) {
      const entries = await buildUserHierarchy(supabase, profile.id, profile.sponsor_id)
      totalEntries += entries
      processedUsers++
    }

    // Log the rebuild
    await supabase.from('audit_log').insert({
      action: 'HIERARCHY_REBUILT',
      table_name: 'user_hierarchy',
      record_id: 'system',
      new_data: {
        processed_users: processedUsers,
        entries_created: totalEntries
      },
    })

    return jsonResponse({
      success: true,
      message: 'Hierarchie erfolgreich neu aufgebaut',
      stats: {
        processedUsers,
        entriesCreated: totalEntries
      }
    }, 200, corsHeaders)

  } catch (error) {
    console.error('Rebuild hierarchy error:', error)
    return jsonResponse({ error: 'Fehler beim Neuaufbau der Hierarchie' }, 500, corsHeaders)
  }
})
