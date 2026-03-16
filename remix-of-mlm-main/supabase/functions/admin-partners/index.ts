import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { getCorsHeaders, jsonResponse, authenticateRequest, authenticateServiceCall, getSupabaseAdmin, sanitizeSearchInput } from '../_shared/auth.ts'

interface PartnerAction {
  action: 'list' | 'get' | 'update' | 'delete' | 'promote' | 'demote' | 'activate' | 'suspend' | 'create'
  profileId?: string
  data?: Record<string, any>
  filters?: {
    role?: string
    status?: string
    search?: string
    page?: number
    limit?: number
  }
}

serve(async (req) => {
  const corsHeaders = getCorsHeaders(req)
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders })
  }

  try {
    const { supabase } = getSupabaseAdmin()
    let authContext: { profileId: string; role: string; roles: string[] } | null = null

    // AUTH: Only admins or service-to-service calls
    const serviceAuth = authenticateServiceCall(req, corsHeaders)
    if (!serviceAuth.ok) {
      const authResult = await authenticateRequest(req, corsHeaders, { allowedRoles: ['admin', 'super_admin'] })
      if (authResult.response) return authResult.response
      authContext = authResult.auth
    }

    const isServiceCall = serviceAuth.ok
    const isSuperAdmin = isServiceCall || !!authContext?.roles?.includes('super_admin') || authContext?.role === 'super_admin'

    const getScopedProfileIds = async (): Promise<string[] | null> => {
      if (isSuperAdmin || !authContext) return null

      const ids = new Set<string>([authContext.profileId])

      const { data: downlineRows } = await supabase
        .from('user_hierarchy')
        .select('user_id')
        .eq('ancestor_id', authContext.profileId)
        .eq('hierarchy_type', 'mlm')
        .lte('level_number', 5)

      for (const row of downlineRows || []) {
        if (row.user_id) ids.add(row.user_id)
      }

      if (authContext.roles?.includes('callcenter')) {
        const { data: employeeRows } = await supabase
          .from('call_center_employees')
          .select('call_center_id')
          .eq('profile_id', authContext.profileId)
          .eq('is_active', true)

        const callCenterIds = (employeeRows || []).map((r) => r.call_center_id).filter(Boolean)
        if (callCenterIds.length > 0) {
          const { data: sameCenterRows } = await supabase
            .from('call_center_employees')
            .select('profile_id')
            .in('call_center_id', callCenterIds)
            .eq('is_active', true)

          for (const row of sameCenterRows || []) {
            if (row.profile_id) ids.add(row.profile_id)
          }
        }
      }

      return Array.from(ids)
    }

    const canAccessProfile = async (targetProfileId: string): Promise<boolean> => {
      if (isSuperAdmin) return true
      const scopedIds = await getScopedProfileIds()
      return !!scopedIds?.includes(targetProfileId)
    }

    const ensureEmployeeNumber = async (targetProfileId: string): Promise<string> => {
      const { data: existing } = await supabase
        .from('profiles')
        .select('employee_number')
        .eq('id', targetProfileId)
        .single()

      if (existing?.employee_number) return existing.employee_number

      for (let i = 0; i < 5; i++) {
        const candidate = 'EMP-' + Math.floor(100000 + Math.random() * 900000).toString()
        const { data: collision } = await supabase
          .from('profiles')
          .select('id')
          .eq('employee_number', candidate)
          .maybeSingle()

        if (!collision) {
          const { error } = await supabase
            .from('profiles')
            .update({ employee_number: candidate })
            .eq('id', targetProfileId)
          if (!error) return candidate
        }
      }

      throw new Error('Mitarbeiternummer konnte nicht erzeugt werden')
    }

    const { action, profileId, data, filters }: PartnerAction = await req.json()
    console.log('Admin Partners Action:', action, profileId)

    switch (action) {
      case 'list': {
        const page = filters?.page || 1
        const limit = filters?.limit || 50
        const offset = (page - 1) * limit

        let query = supabase
          .from('profiles')
          .select(`
            *,
            promotion_codes (
              id, code, usage_count, max_uses, is_active
            )
          `, { count: 'exact' })
          .order('created_at', { ascending: false })
          .range(offset, offset + limit - 1)

        if (filters?.status) {
          query = query.eq('status', filters.status)
        }
        if (filters?.search) {
          const sanitized = sanitizeSearchInput(filters.search)
          if (sanitized) {
            query = query.or(`first_name.ilike.%${sanitized}%,last_name.ilike.%${sanitized}%,email.ilike.%${sanitized}%`)
          }
        }

        const scopedIds = await getScopedProfileIds()
        if (scopedIds && scopedIds.length > 0) {
          query = query.in('id', scopedIds)
        }

        if (scopedIds && scopedIds.length === 0) {
          return jsonResponse({
            profiles: [],
            pagination: { page, limit, total: 0 },
            stats: { total: 0, partners: 0, pending: 0, active: 0 }
          }, 200, corsHeaders)
        }

        const { data: profiles, count, error } = await query

        if (error) throw error

        const profilesWithExtras = await Promise.all(
          (profiles || []).map(async (profile) => {
            const [rolesResult, sponsorResult] = await Promise.all([
              supabase.from('user_roles').select('role').eq('user_id', profile.id),
              profile.sponsor_id
                ? supabase.from('profiles').select('id, first_name, last_name, email').eq('id', profile.sponsor_id).single()
                : Promise.resolve({ data: null })
            ])
            return {
              ...profile,
              roles: rolesResult.data?.map(r => r.role) || [],
              sponsor: sponsorResult.data
            }
          })
        )

        const { count: totalPartners } = await supabase.from('user_roles').select('*', { count: 'exact', head: true }).eq('role', 'partner')
        const { count: pendingCount } = await supabase.from('profiles').select('*', { count: 'exact', head: true }).eq('status', 'pending')
        const { count: activeCount } = await supabase.from('profiles').select('*', { count: 'exact', head: true }).eq('status', 'active')

        return jsonResponse({
          profiles: profilesWithExtras,
          pagination: { page, limit, total: count },
          stats: {
            total: count,
            partners: totalPartners || 0,
            pending: pendingCount || 0,
            active: activeCount || 0
          }
        }, 200, corsHeaders)
      }

      case 'get': {
        if (!profileId) return jsonResponse({ error: 'Profil-ID erforderlich' }, 400, corsHeaders)
        if (!(await canAccessProfile(profileId))) {
          return jsonResponse({ error: 'Keine Berechtigung auf dieses Profil' }, 403, corsHeaders)
        }

        const { data: profile, error } = await supabase
          .from('profiles')
          .select(`
            *,
            promotion_codes (*),
            commissions (
              id, commission_amount, commission_type, level_number, status, created_at
            )
          `)
          .eq('id', profileId)
          .single()

        if (error) throw error

        let sponsor = null
        if (profile.sponsor_id) {
          const { data: sponsorData } = await supabase
            .from('profiles')
            .select('id, first_name, last_name, email')
            .eq('id', profile.sponsor_id)
            .single()
          sponsor = sponsorData
        }

        const { data: transactions } = await supabase
          .from('transactions')
          .select('*')
          .eq('customer_id', profileId)

        const { data: roles } = await supabase
          .from('user_roles')
          .select('role')
          .eq('user_id', profileId)

        const { data: hierarchyData } = await supabase
          .from('user_hierarchy')
          .select('*')
          .eq('ancestor_id', profileId)

        const downline = await Promise.all(
          (hierarchyData || []).map(async (h) => {
            const { data: userProfile } = await supabase
              .from('profiles')
              .select('id, first_name, last_name, email, status')
              .eq('id', h.user_id)
              .single()
            return { ...h, user: userProfile }
          })
        )

        return jsonResponse({
          profile: {
            ...profile,
            sponsor,
            transactions: transactions || [],
            roles: roles?.map(r => r.role) || [],
            downline
          }
        }, 200, corsHeaders)
      }

      case 'update': {
        if (!profileId || !data) return jsonResponse({ error: 'Profil-ID und Daten erforderlich' }, 400, corsHeaders)
        if (!(await canAccessProfile(profileId))) {
          return jsonResponse({ error: 'Keine Berechtigung auf dieses Profil' }, 403, corsHeaders)
        }

        const { data: oldProfile } = await supabase
          .from('profiles')
          .select('*')
          .eq('id', profileId)
          .single()

        const allowedFields = ['first_name', 'last_name', 'email', 'phone', 'status', 'city', 'country', 'street', 'house_number', 'postal_code', 'domain', 'iban', 'bic', 'bank_name', 'account_holder']
        const safeData: Record<string, unknown> = {}
        for (const key of allowedFields) {
          if (data[key] !== undefined) safeData[key] = data[key]
        }

        const { data: updated, error } = await supabase
          .from('profiles')
          .update(safeData)
          .eq('id', profileId)
          .select()
          .single()

        if (error) throw error

        await supabase.from('audit_log').insert({
          action: 'PROFILE_UPDATED',
          table_name: 'profiles',
          record_id: profileId,
          old_data: oldProfile,
          new_data: updated
        })

        return jsonResponse({ success: true, profile: updated }, 200, corsHeaders)
      }

      case 'delete': {
        if (!profileId) return jsonResponse({ error: 'Profil-ID erforderlich' }, 400, corsHeaders)
        if (!(await canAccessProfile(profileId))) {
          return jsonResponse({ error: 'Keine Berechtigung auf dieses Profil' }, 403, corsHeaders)
        }

        const { data: isTargetAdmin } = await supabase
          .from('user_roles')
          .select('id')
          .eq('user_id', profileId)
          .eq('role', 'admin')
          .single()

        if (isTargetAdmin) {
          return jsonResponse({ error: 'Administratoren können nicht gelöscht werden' }, 400, corsHeaders)
        }

        await supabase.from('promotion_codes').delete().eq('partner_id', profileId)
        await supabase.from('user_roles').delete().eq('user_id', profileId)
        await supabase.from('user_hierarchy').delete().eq('user_id', profileId)
        await supabase.from('user_hierarchy').delete().eq('ancestor_id', profileId)
        await supabase.from('commissions').delete().eq('partner_id', profileId)
        await supabase.from('leadership_qualifications').delete().eq('partner_id', profileId)
        await supabase.from('leadership_pool_payouts').delete().eq('partner_id', profileId)

        const { error } = await supabase
          .from('profiles')
          .delete()
          .eq('id', profileId)

        if (error) throw error

        await supabase.from('audit_log').insert({
          action: 'PROFILE_DELETED',
          table_name: 'profiles',
          record_id: profileId
        })

        return jsonResponse({ success: true }, 200, corsHeaders)
      }

      case 'promote': {
        if (!profileId) return jsonResponse({ error: 'Profil-ID erforderlich' }, 400, corsHeaders)
        if (!(await canAccessProfile(profileId))) {
          return jsonResponse({ error: 'Keine Berechtigung auf dieses Profil' }, 403, corsHeaders)
        }

        const { data: existingRole } = await supabase
          .from('user_roles')
          .select('id')
          .eq('user_id', profileId)
          .eq('role', 'partner')
          .single()

        if (existingRole) {
          return jsonResponse({ error: 'Benutzer ist bereits Partner' }, 400, corsHeaders)
        }

        await supabase.from('user_roles').insert({ user_id: profileId, role: 'partner' })

        const employeeNumber = await ensureEmployeeNumber(profileId)
        const code = employeeNumber
        await supabase.from('promotion_codes').insert({
          code,
          partner_id: profileId,
          is_active: true
        })

        await supabase.from('profiles').update({ status: 'active', promotion_code: code }).eq('id', profileId)

        await supabase.from('audit_log').insert({
          action: 'PARTNER_PROMOTED',
          table_name: 'user_roles',
          record_id: profileId,
          new_data: { role: 'partner', promotion_code: code }
        })

        return jsonResponse({ success: true, promotionCode: code }, 200, corsHeaders)
      }

      case 'demote': {
        if (!profileId) return jsonResponse({ error: 'Profil-ID erforderlich' }, 400, corsHeaders)
        if (!(await canAccessProfile(profileId))) {
          return jsonResponse({ error: 'Keine Berechtigung auf dieses Profil' }, 403, corsHeaders)
        }

        await supabase
          .from('user_roles')
          .delete()
          .eq('user_id', profileId)
          .eq('role', 'partner')

        await supabase
          .from('promotion_codes')
          .update({ is_active: false })
          .eq('partner_id', profileId)

        await supabase.from('audit_log').insert({
          action: 'PARTNER_DEMOTED',
          table_name: 'user_roles',
          record_id: profileId
        })

        return jsonResponse({ success: true }, 200, corsHeaders)
      }

      case 'activate': {
        if (!profileId) return jsonResponse({ error: 'Profil-ID erforderlich' }, 400, corsHeaders)
        if (!(await canAccessProfile(profileId))) {
          return jsonResponse({ error: 'Keine Berechtigung auf dieses Profil' }, 403, corsHeaders)
        }

        const { error } = await supabase
          .from('profiles')
          .update({ status: 'active' })
          .eq('id', profileId)

        if (error) throw error

        await supabase.from('audit_log').insert({
          action: 'PROFILE_ACTIVATED',
          table_name: 'profiles',
          record_id: profileId
        })

        return jsonResponse({ success: true }, 200, corsHeaders)
      }

      case 'suspend': {
        if (!profileId) return jsonResponse({ error: 'Profil-ID erforderlich' }, 400, corsHeaders)
        if (!(await canAccessProfile(profileId))) {
          return jsonResponse({ error: 'Keine Berechtigung auf dieses Profil' }, 403, corsHeaders)
        }

        const { error } = await supabase
          .from('profiles')
          .update({ status: 'suspended' })
          .eq('id', profileId)

        if (error) throw error

        await supabase.from('audit_log').insert({
          action: 'PROFILE_SUSPENDED',
          table_name: 'profiles',
          record_id: profileId
        })

        return jsonResponse({ success: true }, 200, corsHeaders)
      }

      case 'create': {
        if (!data?.email || !data?.password || !data?.first_name || !data?.last_name) {
          return jsonResponse({ error: 'E-Mail, Passwort, Vorname und Nachname sind erforderlich' }, 400, corsHeaders)
        }

        const { data: authData, error: authError } = await supabase.auth.admin.createUser({
          email: data.email,
          password: data.password,
          email_confirm: true,
        })

        if (authError || !authData.user) {
          return jsonResponse({ error: authError?.message || 'Benutzer konnte nicht erstellt werden' }, 500, corsHeaders)
        }

        const { data: newProfile, error: profileError } = await supabase
          .from('profiles')
          .insert({
            user_id: authData.user.id,
            first_name: data.first_name,
            last_name: data.last_name,
            email: data.email,
            phone: data.phone || null,
            street: data.street || null,
            house_number: data.house_number || null,
            postal_code: data.postal_code || null,
            city: data.city || null,
            country: data.country || 'Deutschland',
            domain: data.domain || null,
            terms_accepted: true,
            privacy_accepted: true,
            age_confirmed: true,
            domain_owner_confirmed: true,
            role: 'customer',
            status: 'active',
          })
          .select()
          .single()

        if (profileError) {
          await supabase.auth.admin.deleteUser(authData.user.id)
          return jsonResponse({ error: 'Profil konnte nicht erstellt werden: ' + profileError.message }, 500, corsHeaders)
        }

        let promotionCode = null
        if (data.make_partner) {
          await supabase.from('user_roles').insert({ user_id: newProfile.id, role: 'partner' })

          const code = await ensureEmployeeNumber(newProfile.id)
          await supabase.from('promotion_codes').insert({
            code,
            partner_id: newProfile.id,
            is_active: true
          })
          await supabase.from('profiles').update({ promotion_code: code }).eq('id', newProfile.id)
          promotionCode = code
        }

        await supabase.from('audit_log').insert({
          action: 'ADMIN_CREATE_PARTNER',
          table_name: 'profiles',
          record_id: newProfile.id,
          new_data: { email: data.email, make_partner: data.make_partner, promotion_code: promotionCode }
        })

        return jsonResponse({ success: true, profileId: newProfile.id, promotionCode }, 200, corsHeaders)
      }

      default:
        return jsonResponse({ error: 'Ungültige Aktion' }, 400, corsHeaders)
    }

  } catch (error: unknown) {
    console.error('Admin Partners Error:', error)
    const message = error instanceof Error ? error.message : 'Interner Serverfehler'
    return jsonResponse({ error: message }, 500, getCorsHeaders(req))
  }
})
