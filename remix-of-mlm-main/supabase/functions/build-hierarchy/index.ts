import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { getCorsHeaders, jsonResponse, authenticateServiceCall, getSupabaseAdmin } from '../_shared/auth.ts'

interface BuildHierarchyRequest {
  profileId: string
  sponsorId: string
}

// Build hierarchy for a single user (called after registration)
serve(async (req) => {
  const corsHeaders = getCorsHeaders(req)

  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders })
  }

  try {
    // SERVICE-ONLY: only callable internally by other functions
    const serviceAuth = authenticateServiceCall(req, corsHeaders)
    if (!serviceAuth.ok) {
      return jsonResponse({ error: 'Nur interne Service-Aufrufe erlaubt' }, 403, corsHeaders)
    }

    const { supabase } = getSupabaseAdmin()

    const { profileId, sponsorId }: BuildHierarchyRequest = await req.json()

    if (!profileId || !sponsorId) {
      return jsonResponse({ error: 'profileId und sponsorId erforderlich' }, 400, corsHeaders)
    }

    console.log(`Building hierarchy for profile ${profileId} with sponsor ${sponsorId}`)

    let currentSponsorId = sponsorId
    let level = 1
    let entriesCreated = 0

    // Walk up the sponsor chain (max 10 levels to prevent infinite loops)
    while (currentSponsorId && level <= 10) {
      console.log(`Level ${level}: Adding ancestor ${currentSponsorId}`)

      // Insert hierarchy entry
      const { error } = await supabase
        .from('user_hierarchy')
        .upsert({
          user_id: profileId,
          ancestor_id: currentSponsorId,
          level_number: level,
          is_active_for_commission: level <= 5, // Only first 5 levels active for commission
        }, {
          onConflict: 'user_id,ancestor_id'
        })

      if (error) {
        console.error(`Error inserting hierarchy level ${level}:`, error)
      } else {
        entriesCreated++
      }

      // Get next sponsor
      const { data: nextProfile, error: nextError } = await supabase
        .from('profiles')
        .select('sponsor_id')
        .eq('id', currentSponsorId)
        .single()

      if (nextError || !nextProfile?.sponsor_id) {
        console.log(`No more sponsors at level ${level}`)
        break
      }

      currentSponsorId = nextProfile.sponsor_id
      level++
    }

    // If more than 5 levels, apply dynamic shift
    if (entriesCreated > 5) {
      console.log('Applying dynamic shift - deactivating levels > 5')

      await supabase
        .from('user_hierarchy')
        .update({ is_active_for_commission: false })
        .eq('user_id', profileId)
        .gt('level_number', 5)
    }

    // Log to audit
    await supabase.from('audit_log').insert({
      action: 'HIERARCHY_BUILT',
      table_name: 'user_hierarchy',
      record_id: profileId,
      new_data: {
        sponsor_id: sponsorId,
        levels_created: entriesCreated,
        active_levels: Math.min(entriesCreated, 5)
      },
    })

    return jsonResponse({
      success: true,
      levelsCreated: entriesCreated,
      activeLevels: Math.min(entriesCreated, 5)
    }, 200, corsHeaders)

  } catch (error) {
    console.error('Build hierarchy error:', error)
    return jsonResponse({ error: 'Hierarchieaufbau fehlgeschlagen' }, 500, corsHeaders)
  }
})
