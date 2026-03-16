import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { getCorsHeaders, jsonResponse, authenticateRequest, authenticateServiceCall, getSupabaseAdmin, sanitizeSearchInput } from '../_shared/auth.ts'

serve(async (req) => {
  const corsHeaders = getCorsHeaders(req)
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders })

  try {
    const { supabase } = getSupabaseAdmin()

    // AUTH: Only admins or service-to-service calls
    const serviceAuth = authenticateServiceCall(req, corsHeaders)
    let isSuperAdmin = false
    let authUserId = ''
    if (!serviceAuth.ok) {
      const authResult = await authenticateRequest(req, corsHeaders, { allowedRoles: ['admin', 'super_admin'] })
      if (authResult.response) return authResult.response
      isSuperAdmin = authResult.auth.roles.includes('super_admin') || authResult.auth.role === 'super_admin'
      authUserId = authResult.auth.user.id
    } else {
      isSuperAdmin = true // service calls have full access
    }

    const { action, ...params } = await req.json()

    // ═══════════════════════════════════════
    // LIST ALL USERS
    // ═══════════════════════════════════════
    if (action === 'list_users') {
      const { search, role, status, page = 1, limit = 50 } = params
      const offset = (page - 1) * limit

      let query = supabase.from('profiles').select(`
        id, user_id, first_name, last_name, email, phone, status, role, domain,
        city, country, created_at, updated_at
      `, { count: 'exact' })

      if (search) {
        const sanitized = sanitizeSearchInput(search)
        if (sanitized) {
          query = query.or(`first_name.ilike.%${sanitized}%,last_name.ilike.%${sanitized}%,email.ilike.%${sanitized}%`)
        }
      }
      if (status && status !== 'all') query = query.eq('status', status)

      query = query.order('created_at', { ascending: false }).range(offset, offset + limit - 1)
      const { data: profiles, count, error } = await query
      if (error) throw error

      const profileIds = (profiles || []).map((p: any) => p.id)
      const { data: allRoles } = await supabase.from('user_roles').select('user_id, role').in('user_id', profileIds)

      const usersWithRoles = (profiles || []).map((p: any) => ({
        ...p,
        roles: (allRoles || []).filter((r: any) => r.user_id === p.id).map((r: any) => r.role)
      }))

      let filtered = usersWithRoles
      if (role && role !== 'all') {
        filtered = usersWithRoles.filter((u: any) => u.roles.includes(role))
      }

      return jsonResponse({ users: filtered, total: count || 0, page, limit }, 200, corsHeaders)
    }

    // ═══════════════════════════════════════
    // GET SINGLE USER DETAILS
    // ═══════════════════════════════════════
    if (action === 'get_user') {
      const { profileId } = params
      if (!profileId) return jsonResponse({ error: 'Profil-ID erforderlich' }, 400, corsHeaders)

      const { data: userProfile, error } = await supabase.from('profiles').select('*').eq('id', profileId).single()
      if (error) throw error

      const { data: roles } = await supabase.from('user_roles').select('role').eq('user_id', profileId)
      const { data: hierarchy } = await supabase.from('user_hierarchy').select('id, level_number').eq('ancestor_id', profileId)
      const { data: commissions } = await supabase.from('commissions').select('commission_amount, status').eq('partner_id', profileId)
      const { data: promoCodes } = await supabase.from('promotion_codes').select('code, usage_count, is_active').eq('partner_id', profileId)

      const totalPending = (commissions || []).filter((c: any) => c.status === 'pending').reduce((s: number, c: any) => s + Number(c.commission_amount), 0)
      const totalPaid = (commissions || []).filter((c: any) => c.status === 'paid').reduce((s: number, c: any) => s + Number(c.commission_amount), 0)

      return jsonResponse({
        profile: userProfile,
        roles: (roles || []).map((r: any) => r.role),
        stats: {
          teamSize: (hierarchy || []).length,
          level1: (hierarchy || []).filter((h: any) => h.level_number === 1).length,
          pendingCommissions: totalPending,
          paidCommissions: totalPaid,
          totalCommissions: totalPending + totalPaid,
          promoCodes: promoCodes || [],
        }
      }, 200, corsHeaders)
    }

    // ═══════════════════════════════════════
    // UPDATE USER PROFILE
    // ═══════════════════════════════════════
    if (action === 'update_user') {
      const { profileId, updates } = params
      if (!profileId || !updates) return jsonResponse({ error: 'Profil-ID und Updates erforderlich' }, 400, corsHeaders)

      if (!isSuperAdmin) {
        const { data: targetRoles } = await supabase.from('user_roles').select('role').eq('user_id', profileId)
        const isTargetAdmin = (targetRoles || []).some((r: any) => r.role === 'admin' || r.role === 'super_admin')
        if (isTargetAdmin) {
          return jsonResponse({ error: 'Nur Super Admin kann andere Admins bearbeiten' }, 403, corsHeaders)
        }
      }

      const allowedFields = ['first_name', 'last_name', 'email', 'phone', 'status', 'city', 'country', 'street', 'house_number', 'postal_code', 'domain']
      const safeUpdates: Record<string, unknown> = {}
      for (const key of allowedFields) {
        if (updates[key] !== undefined) safeUpdates[key] = updates[key]
      }

      const { error } = await supabase.from('profiles').update(safeUpdates).eq('id', profileId)
      if (error) throw error

      await supabase.from('audit_log').insert({
        action: 'UPDATE_USER', table_name: 'profiles', record_id: profileId,
        user_id: authUserId || 'service', new_data: safeUpdates
      })

      return jsonResponse({ success: true }, 200, corsHeaders)
    }

    // ═══════════════════════════════════════
    // CHANGE USER PASSWORD
    // ═══════════════════════════════════════
    if (action === 'change_password') {
      const { profileId, newPassword } = params
      if (!profileId || !newPassword) return jsonResponse({ error: 'Profil-ID und Passwort erforderlich' }, 400, corsHeaders)

      const { data: targetProfile } = await supabase.from('profiles').select('user_id, email').eq('id', profileId).single()
      if (!targetProfile) return jsonResponse({ error: 'Benutzer nicht gefunden' }, 404, corsHeaders)

      // Password strength validation
      if (!newPassword || newPassword.length < 8) {
        return jsonResponse({ error: 'Passwort muss mindestens 8 Zeichen lang sein' }, 400, corsHeaders)
      }
      if (!/[A-Z]/.test(newPassword) || !/[a-z]/.test(newPassword) || !/[0-9]/.test(newPassword)) {
        return jsonResponse({ error: 'Passwort muss Groß-/Kleinbuchstaben und Zahlen enthalten' }, 400, corsHeaders)
      }

      const { error } = await supabase.auth.admin.updateUserById(targetProfile.user_id, { password: newPassword })
      if (error) throw error

      await supabase.from('audit_log').insert({
        action: 'CHANGE_PASSWORD', table_name: 'profiles', record_id: profileId,
        user_id: authUserId || 'service', new_data: { email: targetProfile.email }
      })

      return jsonResponse({ success: true }, 200, corsHeaders)
    }

    // ═══════════════════════════════════════
    // CHANGE USER ROLE
    // ═══════════════════════════════════════
    if (action === 'change_role') {
      const { profileId, addRoles, removeRoles } = params
      if (!profileId) return jsonResponse({ error: 'Profil-ID erforderlich' }, 400, corsHeaders)

      if (addRoles?.length) {
        for (const role of addRoles) {
          await supabase.from('user_roles').upsert({ user_id: profileId, role }, { onConflict: 'user_id,role' })
        }
      }
      if (removeRoles?.length) {
        for (const role of removeRoles) {
          await supabase.from('user_roles').delete().eq('user_id', profileId).eq('role', role)
        }
      }

      await supabase.from('audit_log').insert({
        action: 'CHANGE_ROLE', table_name: 'user_roles', record_id: profileId,
        user_id: authUserId || 'service', new_data: { addRoles, removeRoles }
      })

      return jsonResponse({ success: true }, 200, corsHeaders)
    }

    // ═══════════════════════════════════════
    // DELETE USER
    // ═══════════════════════════════════════
    if (action === 'delete_user') {
      const { profileId } = params
      if (!profileId) return jsonResponse({ error: 'Profil-ID erforderlich' }, 400, corsHeaders)

      const { data: targetProfile } = await supabase.from('profiles').select('user_id, email').eq('id', profileId).single()
      if (!targetProfile) return jsonResponse({ error: 'Benutzer nicht gefunden' }, 404, corsHeaders)

      if (targetProfile.user_id === authUserId) {
        return jsonResponse({ error: 'Sie können sich nicht selbst löschen' }, 400, corsHeaders)
      }

      await supabase.from('audit_log').insert({
        action: 'DELETE_USER', table_name: 'profiles', record_id: profileId,
        user_id: authUserId || 'service', old_data: { email: targetProfile.email }
      })

      const { error } = await supabase.auth.admin.deleteUser(targetProfile.user_id)
      if (error) throw error

      return jsonResponse({ success: true }, 200, corsHeaders)
    }

    // ═══════════════════════════════════════
    // OVERVIEW STATS (Real-time)
    // ═══════════════════════════════════════
    if (action === 'overview_stats') {
      const [
        { count: totalUsers },
        { count: totalPartners },
        { count: activeUsers },
        { count: pendingUsers },
        { data: totalCommissions },
        { count: totalDomains },
        { count: totalLeads },
        { data: recentAudit },
        { data: recentUsers },
      ] = await Promise.all([
        supabase.from('profiles').select('id', { count: 'exact', head: true }),
        supabase.from('user_roles').select('id', { count: 'exact', head: true }).eq('role', 'partner'),
        supabase.from('profiles').select('id', { count: 'exact', head: true }).eq('status', 'active'),
        supabase.from('profiles').select('id', { count: 'exact', head: true }).eq('status', 'pending'),
        supabase.from('commissions').select('commission_amount, status'),
        supabase.from('protected_domains').select('id', { count: 'exact', head: true }),
        supabase.from('leads').select('id', { count: 'exact', head: true }),
        supabase.from('audit_log').select('*').order('created_at', { ascending: false }).limit(20),
        supabase.from('profiles').select('id, first_name, last_name, email, status, created_at').order('created_at', { ascending: false }).limit(10),
      ])

      const pending = (totalCommissions || []).filter((c: any) => c.status === 'pending').reduce((s: number, c: any) => s + Number(c.commission_amount), 0)
      const paid = (totalCommissions || []).filter((c: any) => c.status === 'paid').reduce((s: number, c: any) => s + Number(c.commission_amount), 0)
      const approved = (totalCommissions || []).filter((c: any) => c.status === 'approved').reduce((s: number, c: any) => s + Number(c.commission_amount), 0)

      return jsonResponse({
        users: { total: totalUsers || 0, active: activeUsers || 0, pending: pendingUsers || 0, partners: totalPartners || 0 },
        commissions: { pending, approved, paid, total: pending + approved + paid },
        domains: totalDomains || 0,
        leads: totalLeads || 0,
        recentAudit: recentAudit || [],
        recentUsers: recentUsers || [],
      }, 200, corsHeaders)
    }

    // ═══════════════════════════════════════
    // AUDIT LOG
    // ═══════════════════════════════════════
    if (action === 'audit_log') {
      const { limit = 50, offset = 0 } = params
      const { data, count, error } = await supabase
        .from('audit_log')
        .select('*', { count: 'exact' })
        .order('created_at', { ascending: false })
        .range(offset, offset + limit - 1)
      if (error) throw error

      return jsonResponse({ logs: data || [], total: count || 0 }, 200, corsHeaders)
    }

    // ═══════════════════════════════════════
    // CREATE NEW USER
    // ═══════════════════════════════════════
    if (action === 'create_user') {
      const { email, password, firstName, lastName, role: userRole, roles: userRoles } = params
      if (!email || !password || !firstName || !lastName) {
        return jsonResponse({ error: 'Email, Passwort, Vorname und Nachname erforderlich' }, 400, corsHeaders)
      }

      if (password.length < 8) {
        return jsonResponse({ error: 'Passwort muss mindestens 8 Zeichen lang sein' }, 400, corsHeaders)
      }

      // Create auth user
      const { data: authUser, error: authError } = await supabase.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
      })
      if (authError) throw authError

      // Create profile
      const profileRole = userRole || 'partner'
      const { data: profile, error: profileError } = await supabase
        .from('profiles')
        .insert({
          user_id: authUser.user.id,
          email,
          first_name: firstName,
          last_name: lastName,
          role: profileRole,
          status: 'active',
          terms_accepted: true,
          privacy_accepted: true,
        })
        .select('id')
        .single()

      if (profileError) {
        // Rollback: delete auth user if profile creation fails
        await supabase.auth.admin.deleteUser(authUser.user.id)
        throw profileError
      }

      // Create roles
      const rolesToAdd = userRoles?.length ? userRoles : [profileRole]
      for (const r of rolesToAdd) {
        await supabase.from('user_roles').upsert(
          { user_id: profile.id, role: r },
          { onConflict: 'user_id,role' }
        )
      }

      await supabase.from('audit_log').insert({
        action: 'CREATE_USER', table_name: 'profiles', record_id: profile.id,
        user_id: authUserId || 'service', new_data: { email, firstName, lastName, role: profileRole, roles: rolesToAdd }
      })

      return jsonResponse({ success: true, profileId: profile.id, userId: authUser.user.id }, 200, corsHeaders)
    }

    return jsonResponse({ error: 'Unbekannte Aktion' }, 400, corsHeaders)

  } catch (error: any) {
    console.error('Admin users error:', error)
    return jsonResponse({ error: error.message || 'Interner Fehler' }, 500, getCorsHeaders(req))
  }
})
