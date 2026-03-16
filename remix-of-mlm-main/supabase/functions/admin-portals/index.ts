import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"
import {
  getCorsHeaders,
  jsonResponse,
  authenticateRequest,
  authenticateServiceCall,
  getSupabaseAdmin,
  sanitizeSearchInput,
} from "../_shared/auth.ts"

type PortalModule = 'partners' | 'callcenter' | 'mlm' | 'custom'

function normalizeSlug(input: string) {
  return input
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9-]/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .substring(0, 60)
}

function portalEmail(username: string, portalSlug: string) {
  // The email does not have to be deliverable; it only must be unique and valid.
  const u = username.trim().toLowerCase().replace(/[^a-z0-9._-]/g, '')
  const p = portalSlug.trim().toLowerCase().replace(/[^a-z0-9-]/g, '')
  return `${u}+${p}@portals.gapprotection.local`
}

serve(async (req) => {
  const corsHeaders = getCorsHeaders(req)
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders })

  try {
    const { supabase } = getSupabaseAdmin()

    // AUTH: Only admins/super_admins or service-to-service calls
    const serviceAuth = authenticateServiceCall(req, corsHeaders)
    let authProfileId: string | null = null
    let authUserId: string | null = null
    if (!serviceAuth.ok) {
      const authResult = await authenticateRequest(req, corsHeaders, { allowedRoles: ["admin", "super_admin"] })
      if (authResult.response) return authResult.response
      authProfileId = authResult.auth.profileId
      authUserId = authResult.auth.user.id
    }

    const body = await req.json()
    const { action, ...params } = body || {}

    if (action === "list") {
      const { search, activeOnly } = params as { search?: string; activeOnly?: boolean }

      let query = supabase
        .from("portals")
        .select("id, slug, name, portal_type, is_active, modules, settings, created_at, updated_at", { count: "exact" })
        .order("created_at", { ascending: false })

      if (activeOnly) query = query.eq("is_active", true)
      if (search) {
        const s = sanitizeSearchInput(search)
        if (s) query = query.or(`slug.ilike.%${s}%,name.ilike.%${s}%,portal_type.ilike.%${s}%`)
      }

      const { data, count, error } = await query
      if (error) throw error

      const portalIds = (data || []).map((p: any) => p.id)
      const memberCounts: Record<string, number> = {}
      if (portalIds.length > 0) {
        const { data: members } = await supabase
          .from("portal_members")
          .select("portal_id")
          .in("portal_id", portalIds)
          .eq("is_active", true)
        for (const m of members || []) {
          memberCounts[m.portal_id] = (memberCounts[m.portal_id] || 0) + 1
        }
      }

      return jsonResponse(
        {
          portals: (data || []).map((p: any) => ({ ...p, member_count: memberCounts[p.id] || 0 })),
          total: count || 0,
        },
        200,
        corsHeaders,
      )
    }

    if (action === "create") {
      const {
        slug,
        name,
        portal_type = "custom",
        modules = ["custom"],
        settings = {},
        admin_username,
        admin_password,
        admin_first_name,
        admin_last_name,
      } = params as {
        slug: string
        name: string
        portal_type?: string
        modules?: PortalModule[]
        settings?: Record<string, unknown>
        admin_username?: string
        admin_password?: string
        admin_first_name?: string
        admin_last_name?: string
      }

      if (!slug || !name) {
        return jsonResponse({ error: "slug und name sind erforderlich" }, 400, corsHeaders)
      }

      const normalizedSlug = normalizeSlug(slug)
      if (!normalizedSlug) {
        return jsonResponse({ error: "Ungültiger slug" }, 400, corsHeaders)
      }

      const { data: existing } = await supabase.from("portals").select("id").eq("slug", normalizedSlug).maybeSingle()
      if (existing) return jsonResponse({ error: "slug bereits vergeben" }, 409, corsHeaders)

      const { data: portal, error: portalErr } = await supabase
        .from("portals")
        .insert({
          slug: normalizedSlug,
          name: name.trim(),
          portal_type,
          modules,
          settings,
          created_by: authProfileId,
          is_active: true,
        })
        .select("id, slug, name, portal_type, is_active, modules, settings, created_at")
        .single()
      if (portalErr) throw portalErr

      // Create a default home page
      await supabase.from("portal_pages").insert({
        portal_id: portal.id,
        slug: "home",
        title: portal.name,
        content: {
          blocks: [
            {
              type: "hero",
              title: portal.name,
              subtitle: "Portal Dashboard",
            },
          ],
        },
        is_published: true,
        created_by: authProfileId,
        updated_by: authProfileId,
      })

      let portalAdmin: any = null
      if (admin_username && admin_password) {
        if (admin_password.length < 8) {
          return jsonResponse({ error: "Admin-Passwort muss mindestens 8 Zeichen lang sein" }, 400, corsHeaders)
        }
        const url = Deno.env.get("SUPABASE_URL")!
        const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
        const adminClient = createClient(url, serviceKey)

        const email = portalEmail(admin_username, portal.slug)
        const { data: created, error: createErr } = await adminClient.auth.admin.createUser({
          email,
          password: admin_password,
          email_confirm: true,
          user_metadata: { username: admin_username, portal_slug: portal.slug },
        })
        if (createErr) {
          return jsonResponse({ error: createErr.message }, 500, corsHeaders)
        }

        // Wait for DB trigger that may create profile row, then upsert profile data
        await new Promise((r) => setTimeout(r, 800))

        const { data: prof } = await supabase
          .from("profiles")
          .select("id")
          .eq("user_id", created.user.id)
          .maybeSingle()

        const firstName = (admin_first_name || admin_username).trim()
        const lastName = (admin_last_name || "Portal Admin").trim()

        let profileId: string | null = prof?.id || null
        if (profileId) {
          await supabase.from("profiles").update({
            first_name: firstName,
            last_name: lastName,
            email,
            status: "active",
          }).eq("id", profileId)
        } else {
          const { data: inserted, error: insErr } = await supabase
            .from("profiles")
            .insert({
              user_id: created.user.id,
              first_name: firstName,
              last_name: lastName,
              email,
              status: "active",
              terms_accepted: true,
              privacy_accepted: true,
            })
            .select("id")
            .single()
          if (insErr) throw insErr
          profileId = inserted.id
        }

        if (profileId) {
          await supabase.from("portal_members").upsert(
            {
              portal_id: portal.id,
              profile_id: profileId,
              role: "owner",
              is_active: true,
              created_by: authProfileId,
            },
            { onConflict: "portal_id,profile_id" },
          )
        }

        portalAdmin = {
          email,
          username: admin_username,
          profile_id: profileId,
          user_id: created.user.id,
        }
      }

      await supabase.from("audit_log").insert({
        action: "CREATE_PORTAL",
        table_name: "portals",
        record_id: portal.id,
        user_id: authUserId || "service",
        new_data: {
          slug: portal.slug,
          name: portal.name,
          portal_type: portal.portal_type,
          modules: portal.modules,
          created_portal_admin: !!portalAdmin,
        },
      })

      return jsonResponse({ success: true, portal, portal_admin: portalAdmin }, 201, corsHeaders)
    }

    if (action === "update") {
      const { portalId, updates } = params as { portalId: string; updates: Record<string, unknown> }
      if (!portalId || !updates) return jsonResponse({ error: "portalId und updates erforderlich" }, 400, corsHeaders)

      const allowed = ["name", "portal_type", "is_active", "modules", "settings"] as const
      const safe: Record<string, unknown> = {}
      for (const k of allowed) {
        if (updates[k] !== undefined) safe[k] = updates[k]
      }

      const { data, error } = await supabase.from("portals").update(safe).eq("id", portalId).select().single()
      if (error) throw error

      await supabase.from("audit_log").insert({
        action: "UPDATE_PORTAL",
        table_name: "portals",
        record_id: portalId,
        user_id: authUserId || "service",
        new_data: safe,
      })

      return jsonResponse({ success: true, portal: data }, 200, corsHeaders)
    }

    if (action === "delete") {
      const { portalId } = params as { portalId: string }
      if (!portalId) return jsonResponse({ error: "portalId erforderlich" }, 400, corsHeaders)

      await supabase.from("audit_log").insert({
        action: "DELETE_PORTAL",
        table_name: "portals",
        record_id: portalId,
        user_id: authUserId || "service",
      })

      const { error } = await supabase.from("portals").delete().eq("id", portalId)
      if (error) throw error

      return jsonResponse({ success: true }, 200, corsHeaders)
    }

    return jsonResponse({ error: "Unbekannte Aktion" }, 400, corsHeaders)
  } catch (error: any) {
    console.error("Admin portals error:", error)
    return jsonResponse({ error: error.message || "Interner Fehler" }, 500, getCorsHeaders(req))
  }
})

