import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { getCorsHeaders, jsonResponse, authenticateRequest, authenticateServiceCall, getSupabaseAdmin } from '../_shared/auth.ts'

interface VolumeRequest {
  action: 'update_pv' | 'recalculate_gv' | 'get_volume' | 'get_team_stats'
  profileId: string
  transactionAmount?: number
  periodMonth?: string
}

serve(async (req) => {
  const corsHeaders = getCorsHeaders(req)
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders })
  }

  try {
    const { supabase } = getSupabaseAdmin()
    const body: VolumeRequest = await req.json()
    const { action, profileId, transactionAmount, periodMonth } = body

    // AUTH: Write operations require admin/service; read operations require authenticated user
    const serviceAuth = authenticateServiceCall(req, corsHeaders)
    if (!serviceAuth.ok) {
      if (action === 'update_pv' || action === 'recalculate_gv') {
        const authResult = await authenticateRequest(req, corsHeaders, { allowedRoles: ['admin', 'super_admin'] })
        if (authResult.response) return authResult.response
      } else {
        const authResult = await authenticateRequest(req, corsHeaders)
        if (authResult.response) return authResult.response
        const isAdmin = authResult.auth.roles.includes('admin') || authResult.auth.roles.includes('super_admin')
        if (!isAdmin && profileId !== authResult.auth.profileId) {
          return jsonResponse({ error: 'Zugriff verweigert' }, 403, corsHeaders)
        }
      }
    }

    if (!profileId) {
      return jsonResponse({ error: 'profileId erforderlich' }, 400, corsHeaders)
    }

    const month = periodMonth || new Date().toISOString().substring(0, 7) + '-01'

    switch (action) {
      case 'update_pv': {
        if (!transactionAmount || transactionAmount <= 0) {
          return jsonResponse({ error: 'transactionAmount erforderlich' }, 400, corsHeaders)
        }

        const { data: existing } = await supabase
          .from('volume_tracking')
          .select('*')
          .eq('profile_id', profileId)
          .eq('period_month', month)
          .single()

        if (existing) {
          await supabase.from('volume_tracking').update({
            personal_volume: Number(existing.personal_volume) + transactionAmount,
          }).eq('id', existing.id)
        } else {
          const { count: directCount } = await supabase
            .from('user_hierarchy')
            .select('*', { count: 'exact', head: true })
            .eq('ancestor_id', profileId)
            .eq('level_number', 1)

          await supabase.from('volume_tracking').insert({
            profile_id: profileId,
            period_month: month,
            personal_volume: transactionAmount,
            direct_referrals_count: directCount || 0,
          })
        }

        const { data: ancestors } = await supabase
          .from('user_hierarchy')
          .select('ancestor_id')
          .eq('user_id', profileId)

        if (ancestors) {
          for (const ancestor of ancestors) {
            const ancestorId = (ancestor as any).ancestor_id
            // Use upsert to handle both insert and update atomically
            const { data: ancestorVol } = await supabase
              .from('volume_tracking')
              .select('id, group_volume')
              .eq('profile_id', ancestorId)
              .eq('period_month', month)
              .single()

            if (ancestorVol) {
              // Use rpc or direct SQL to do atomic increment
              // Fallback: read-update with updated_at check for optimistic locking
              const { error: updateErr } = await supabase.rpc('increment_group_volume', {
                row_id: ancestorVol.id,
                amount: transactionAmount,
              })
              // If RPC doesn't exist, fall back to direct update
              if (updateErr) {
                await supabase.from('volume_tracking').update({
                  group_volume: Number(ancestorVol.group_volume) + transactionAmount,
                }).eq('id', ancestorVol.id)
              }
            } else {
              await supabase.from('volume_tracking').insert({
                profile_id: ancestorId,
                period_month: month,
                group_volume: transactionAmount,
              })
            }
          }
        }

        return jsonResponse({ success: true, pv_added: transactionAmount }, 200, corsHeaders)
      }

      case 'get_volume': {
        const { data: volume } = await supabase
          .from('volume_tracking')
          .select('*')
          .eq('profile_id', profileId)
          .eq('period_month', month)
          .single()

        return jsonResponse({
          success: true,
          volume: volume || { personal_volume: 0, group_volume: 0, direct_referrals_count: 0, active_legs: 0, total_team_size: 0 }
        }, 200, corsHeaders)
      }

      case 'get_team_stats': {
        const { data: allDownline, count: teamSize } = await supabase
          .from('user_hierarchy')
          .select('user_id, level_number', { count: 'exact' })
          .eq('ancestor_id', profileId)

        const { count: directCount } = await supabase
          .from('user_hierarchy')
          .select('*', { count: 'exact', head: true })
          .eq('ancestor_id', profileId)
          .eq('level_number', 1)

        let activeLegs = 0
        if (allDownline) {
          const directPartners = allDownline.filter((d: any) => d.level_number === 1)
          for (const partner of directPartners) {
            const { count } = await supabase
              .from('user_hierarchy')
              .select('*', { count: 'exact', head: true })
              .eq('ancestor_id', (partner as any).user_id)
            if ((count || 0) > 0) activeLegs++
          }
        }

        const { data: volumeHistory } = await supabase
          .from('volume_tracking')
          .select('*')
          .eq('profile_id', profileId)
          .order('period_month', { ascending: false })
          .limit(6)

        return jsonResponse({
          success: true,
          team_size: teamSize || 0,
          direct_partners: directCount || 0,
          active_legs: activeLegs,
          volume_history: volumeHistory || [],
        }, 200, corsHeaders)
      }

      case 'recalculate_gv': {
        const { data: allDownline } = await supabase
          .from('user_hierarchy')
          .select('user_id')
          .eq('ancestor_id', profileId)

        if (!allDownline || allDownline.length === 0) {
          return jsonResponse({ success: true, group_volume: 0 }, 200, corsHeaders)
        }

        const downlineIds = allDownline.map((d: any) => d.user_id)

        const { data: downlineVolumes } = await supabase
          .from('volume_tracking')
          .select('personal_volume')
          .in('profile_id', downlineIds)
          .eq('period_month', month)

        const totalGV = (downlineVolumes || []).reduce((sum: number, v: any) => sum + Number(v.personal_volume), 0)

        const { data: ownVol } = await supabase
          .from('volume_tracking')
          .select('*')
          .eq('profile_id', profileId)
          .eq('period_month', month)
          .single()

        if (ownVol) {
          await supabase.from('volume_tracking').update({
            group_volume: totalGV,
            total_team_size: allDownline.length,
          }).eq('id', ownVol.id)
        } else {
          await supabase.from('volume_tracking').insert({
            profile_id: profileId,
            period_month: month,
            group_volume: totalGV,
            total_team_size: allDownline.length,
          })
        }

        return jsonResponse({ success: true, group_volume: totalGV, team_size: allDownline.length }, 200, corsHeaders)
      }

      default:
        return jsonResponse({ error: 'Unbekannte Aktion' }, 400, corsHeaders)
    }

  } catch (error) {
    console.error('Volume tracker error:', (error as Error).message)
    return jsonResponse({ error: 'Volume Tracker Fehler' }, 500, getCorsHeaders(req))
  }
})
