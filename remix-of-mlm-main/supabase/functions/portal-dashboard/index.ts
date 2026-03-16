import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"
import { getCorsHeaders, jsonResponse, authenticateRequest, getSupabaseAdmin } from "../_shared/auth.ts"

type PortalMemberRole = "owner" | "admin" | "editor" | "viewer"

function portalEmail(username: string, portalSlug: string) {
  const u = username.trim().toLowerCase().replace(/[^a-z0-9._-]/g, "")
  const p = portalSlug.trim().toLowerCase().replace(/[^a-z0-9-]/g, "")
  return `${u}+${p}@portals.gapprotection.local`
}

function hasAnyRole(role: PortalMemberRole, allowed: PortalMemberRole[]) {
  return allowed.includes(role)
}

serve(async (req) => {
  const corsHeaders = getCorsHeaders(req)
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders })

  try {
    const body = await req.json()
    const { action } = body || {}

    const url = Deno.env.get("SUPABASE_URL")!
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    const adminClient = createClient(url, serviceKey)

    // ══════════════════════════════════════════
    // LOGIN — no authentication required
    // ══════════════════════════════════════════
    if (action === "login") {
      const { portalSlug, username, password } = body as { portalSlug: string; username: string; password: string }
      if (!portalSlug || !username || !password) {
        return jsonResponse({ error: "portalSlug, username und password erforderlich" }, 400, corsHeaders)
      }

      const { data: portal } = await adminClient
        .from("portals")
        .select("id, slug, is_active")
        .eq("slug", portalSlug.trim().toLowerCase())
        .maybeSingle()

      if (!portal || portal.is_active !== true) {
        return jsonResponse({ error: "Portal nicht gefunden oder deaktiviert" }, 404, corsHeaders)
      }

      const email = portalEmail(username, portal.slug)

      const signInRes = await fetch(`${url}/auth/v1/token?grant_type=password`, {
        method: "POST",
        headers: { "Content-Type": "application/json", apikey: anonKey },
        body: JSON.stringify({ email, password }),
      })
      const signInData = await signInRes.json()

      if (!signInRes.ok) {
        return jsonResponse({ error: signInData.error_description || "Ungültige Anmeldedaten" }, 401, corsHeaders)
      }

      const authUserId = signInData.user?.id as string | undefined
      if (!authUserId) {
        return jsonResponse({ error: "Login fehlgeschlagen" }, 401, corsHeaders)
      }

      const { data: profile } = await adminClient.from("profiles").select("id").eq("user_id", authUserId).maybeSingle()
      if (!profile) return jsonResponse({ error: "Profil nicht gefunden" }, 404, corsHeaders)

      const { data: member } = await adminClient
        .from("portal_members")
        .select("id, role, is_active")
        .eq("portal_id", portal.id)
        .eq("profile_id", profile.id)
        .maybeSingle()

      if (!member || member.is_active !== true) {
        return jsonResponse({ error: "Kein Zugriff auf dieses Portal" }, 403, corsHeaders)
      }

      return jsonResponse(
        {
          access_token: signInData.access_token,
          refresh_token: signInData.refresh_token,
          expires_in: signInData.expires_in,
          portal: { id: portal.id, slug: portal.slug },
          member: { role: member.role },
        },
        200,
        corsHeaders,
      )
    }

    // ══════════════════════════════════════════
    // ALL OTHER ACTIONS — authentication required
    // ══════════════════════════════════════════
    const { supabase } = getSupabaseAdmin()
    const authResult = await authenticateRequest(req, corsHeaders)
    if (authResult.response) return authResult.response
    const { profileId } = authResult.auth

    const portalSlug = (body.portalSlug || body.slug || "").toString().trim().toLowerCase()
    if (!portalSlug) return jsonResponse({ error: "portalSlug erforderlich" }, 400, corsHeaders)

    const { data: portal } = await supabase
      .from("portals")
      .select("id, slug, name, portal_type, is_active, modules, settings, created_at, updated_at")
      .eq("slug", portalSlug)
      .maybeSingle()

    if (!portal || portal.is_active !== true) {
      return jsonResponse({ error: "Portal nicht gefunden oder deaktiviert" }, 404, corsHeaders)
    }

    const { data: membership } = await supabase
      .from("portal_members")
      .select("id, role, is_active")
      .eq("portal_id", portal.id)
      .eq("profile_id", profileId)
      .maybeSingle()

    if (!membership || membership.is_active !== true) {
      return jsonResponse({ error: "Kein Zugriff auf dieses Portal" }, 403, corsHeaders)
    }

    const memberRole = membership.role as PortalMemberRole

    if (action === "get_portal") {
      const { data: pages } = await supabase
        .from("portal_pages")
        .select("id, slug, title, is_published, updated_at")
        .eq("portal_id", portal.id)
        .order("updated_at", { ascending: false })

      return jsonResponse({ portal, pages: pages || [], member: { role: memberRole } }, 200, corsHeaders)
    }

    if (action === "get_page") {
      const pageSlug = (body.pageSlug || "home").toString().trim().toLowerCase()
      const { data: page } = await supabase
        .from("portal_pages")
        .select("*")
        .eq("portal_id", portal.id)
        .eq("slug", pageSlug)
        .maybeSingle()

      if (!page) return jsonResponse({ error: "Seite nicht gefunden" }, 404, corsHeaders)
      if (!page.is_published && !hasAnyRole(memberRole, ["owner", "admin", "editor"])) {
        return jsonResponse({ error: "Keine Berechtigung" }, 403, corsHeaders)
      }

      return jsonResponse({ portal, page, member: { role: memberRole } }, 200, corsHeaders)
    }

    if (action === "upsert_page") {
      if (!hasAnyRole(memberRole, ["owner", "admin", "editor"])) {
        return jsonResponse({ error: "Keine Berechtigung" }, 403, corsHeaders)
      }
      const { pageSlug, title, content, is_published } = body as {
        pageSlug: string
        title: string
        content: unknown
        is_published?: boolean
      }
      if (!pageSlug || !title) return jsonResponse({ error: "pageSlug und title erforderlich" }, 400, corsHeaders)

      const normalized = pageSlug.trim().toLowerCase().replace(/[^a-z0-9-]/g, "-").replace(/-+/g, "-").replace(/^-|-$/g, "")
      if (!normalized) return jsonResponse({ error: "Ungültiger pageSlug" }, 400, corsHeaders)

      const { data: existing } = await supabase
        .from("portal_pages")
        .select("id")
        .eq("portal_id", portal.id)
        .eq("slug", normalized)
        .maybeSingle()

      if (existing) {
        const { data: updated, error } = await supabase
          .from("portal_pages")
          .update({
            title: title.trim(),
            content: content ?? {},
            is_published: is_published ?? true,
            updated_by: profileId,
          })
          .eq("id", existing.id)
          .select("*")
          .single()
        if (error) throw error
        return jsonResponse({ success: true, page: updated }, 200, corsHeaders)
      }

      const { data: created, error } = await supabase
        .from("portal_pages")
        .insert({
          portal_id: portal.id,
          slug: normalized,
          title: title.trim(),
          content: content ?? {},
          is_published: is_published ?? true,
          created_by: profileId,
          updated_by: profileId,
        })
        .select("*")
        .single()
      if (error) throw error
      return jsonResponse({ success: true, page: created }, 201, corsHeaders)
    }

    if (action === "delete_page") {
      if (!hasAnyRole(memberRole, ["owner", "admin"])) {
        return jsonResponse({ error: "Keine Berechtigung" }, 403, corsHeaders)
      }
      const pageId = (body.pageId || "").toString()
      if (!pageId) return jsonResponse({ error: "pageId erforderlich" }, 400, corsHeaders)

      const { error } = await supabase.from("portal_pages").delete().eq("id", pageId).eq("portal_id", portal.id)
      if (error) throw error
      return jsonResponse({ success: true }, 200, corsHeaders)
    }

    if (action === "list_members") {
      if (!hasAnyRole(memberRole, ["owner", "admin"])) {
        return jsonResponse({ error: "Keine Berechtigung" }, 403, corsHeaders)
      }
      const { data: members } = await supabase
        .from("portal_members")
        .select("id, role, is_active, created_at, profile:profiles(id, first_name, last_name, email, status)")
        .eq("portal_id", portal.id)
        .order("created_at", { ascending: false })
      return jsonResponse({ portal, members: members || [] }, 200, corsHeaders)
    }

    if (action === "create_member") {
      if (!hasAnyRole(memberRole, ["owner", "admin"])) {
        return jsonResponse({ error: "Keine Berechtigung" }, 403, corsHeaders)
      }
      const { username, password, first_name, last_name, role } = body as {
        username: string
        password: string
        first_name?: string
        last_name?: string
        role?: PortalMemberRole
      }
      if (!username || !password) return jsonResponse({ error: "username und password erforderlich" }, 400, corsHeaders)
      if (password.length < 8) return jsonResponse({ error: "Passwort muss mindestens 8 Zeichen lang sein" }, 400, corsHeaders)

      const email = portalEmail(username, portal.slug)

      const { data: created, error: createErr } = await adminClient.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
        user_metadata: { username, portal_slug: portal.slug },
      })
      if (createErr) return jsonResponse({ error: createErr.message }, 500, corsHeaders)

      await new Promise((r) => setTimeout(r, 800))

      const { data: prof } = await supabase.from("profiles").select("id").eq("user_id", created.user.id).maybeSingle()

      const fn = (first_name || username).toString().trim()
      const ln = (last_name || "User").toString().trim()
      let memberProfileId = prof?.id as string | undefined

      if (memberProfileId) {
        await supabase.from("profiles").update({ first_name: fn, last_name: ln, email, status: "active" }).eq("id", memberProfileId)
      } else {
        const { data: inserted, error: insErr } = await supabase
          .from("profiles")
          .insert({
            user_id: created.user.id,
            first_name: fn,
            last_name: ln,
            email,
            status: "active",
            terms_accepted: true,
            privacy_accepted: true,
          })
          .select("id")
          .single()
        if (insErr) throw insErr
        memberProfileId = inserted.id
      }

      const memberRoleToSet: PortalMemberRole = role && ["owner", "admin", "editor", "viewer"].includes(role) ? role : "viewer"

      await supabase.from("portal_members").upsert(
        {
          portal_id: portal.id,
          profile_id: memberProfileId!,
          role: memberRoleToSet,
          is_active: true,
          created_by: profileId,
        },
        { onConflict: "portal_id,profile_id" },
      )

      return jsonResponse(
        { success: true, member: { profile_id: memberProfileId, email, username, role: memberRoleToSet } },
        201,
        corsHeaders,
      )
    }

    if (action === "update_member") {
      if (!hasAnyRole(memberRole, ["owner", "admin"])) {
        return jsonResponse({ error: "Keine Berechtigung" }, 403, corsHeaders)
      }
      const { memberId, role, is_active } = body as { memberId: string; role?: PortalMemberRole; is_active?: boolean }
      if (!memberId) return jsonResponse({ error: "memberId erforderlich" }, 400, corsHeaders)

      const safe: Record<string, unknown> = {}
      if (role && ["owner", "admin", "editor", "viewer"].includes(role)) safe.role = role
      if (typeof is_active === "boolean") safe.is_active = is_active
      if (!Object.keys(safe).length) return jsonResponse({ error: "Keine Änderungen" }, 400, corsHeaders)

      // Prevent removing yourself from the portal by accident
      const { data: row } = await supabase
        .from("portal_members")
        .select("profile_id")
        .eq("id", memberId)
        .eq("portal_id", portal.id)
        .maybeSingle()
      if (row?.profile_id === profileId && safe.is_active === false) {
        return jsonResponse({ error: "Sie können sich nicht selbst deaktivieren" }, 400, corsHeaders)
      }

      const { error } = await supabase.from("portal_members").update(safe).eq("id", memberId).eq("portal_id", portal.id)
      if (error) throw error
      return jsonResponse({ success: true }, 200, corsHeaders)
    }

    return jsonResponse({ error: "Unbekannte Aktion" }, 400, corsHeaders)
  } catch (error: any) {
    console.error("Portal dashboard error:", error)
    return jsonResponse({ error: error.message || "Interner Fehler" }, 500, getCorsHeaders(req))
  }
})

