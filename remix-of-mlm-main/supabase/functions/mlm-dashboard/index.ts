import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { getCorsHeaders, jsonResponse, authenticateRequest, getSupabaseAdmin } from '../_shared/auth.ts'

const FUNCTION_VERSION = 'v3.0-2026-03-07'

serve(async (req) => {
  const corsHeaders = getCorsHeaders(req)

  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders })
  }

  try {
    // Parse body FIRST to check action before auth
    const body = await req.json()
    const { action } = body

    // ══════════════════════════════════════════
    // LOGIN — no authentication required
    // ══════════════════════════════════════════
    if (action === 'login') {
      const { username, password } = body
      if (!username || !password) {
        return jsonResponse({ error: 'Benutzername und Passwort erforderlich' }, 400, corsHeaders)
      }

      const url = Deno.env.get('SUPABASE_URL')!
      const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!
      const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
      const adminClient = createClient(url, serviceKey)
      const email = `${username.toLowerCase()}@mlm.gapprotectionltd.com`

      // Check if auth user already exists
      const { data: userList } = await adminClient.auth.admin.listUsers({ perPage: 1000 })
      const existingUser = userList?.users?.find((u: any) => u.email === email)

      if (!existingUser) {
        // Create auth user
        const { data: newUser, error: createError } = await adminClient.auth.admin.createUser({
          email,
          password,
          email_confirm: true,
          user_metadata: { username, role: 'mlm_admin' },
        })
        if (createError) return jsonResponse({ error: createError.message }, 500, corsHeaders)

        // Create profile
        if (newUser?.user) {
          // Wait for trigger, then update profile
          await new Promise(r => setTimeout(r, 800))
          const { data: existingP } = await adminClient
            .from('profiles')
            .select('id')
            .eq('user_id', newUser.user.id)
            .maybeSingle()

          if (existingP) {
            await adminClient.from('profiles').update({
              first_name: username,
              last_name: 'Admin',
              email,
              role: 'admin',
              status: 'active',
              partner_number: '1000',
            }).eq('id', existingP.id)
          } else {
            await adminClient.from('profiles').insert({
              user_id: newUser.user.id,
              first_name: username,
              last_name: 'Admin',
              email,
              role: 'admin',
              status: 'active',
              partner_number: '1000',
            })
          }

          // Ensure user_roles entry
          const { data: prof } = await adminClient
            .from('profiles').select('id').eq('user_id', newUser.user.id).maybeSingle()
          if (prof) {
            // Check if role already exists
            const { data: existingRole } = await adminClient
              .from('user_roles')
              .select('id')
              .eq('user_id', prof.id)
              .eq('role', 'super_admin')
              .maybeSingle()
            if (!existingRole) {
              await adminClient.from('user_roles').insert(
                { user_id: prof.id, role: 'super_admin' }
              )
            }
          }
        }
      }

      // Sign in via Supabase REST API
      const signInRes = await fetch(`${url}/auth/v1/token?grant_type=password`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'apikey': anonKey },
        body: JSON.stringify({ email, password }),
      })
      const signInData = await signInRes.json()

      if (!signInRes.ok) {
        return jsonResponse({ error: signInData.error_description || 'Ungültige Anmeldedaten' }, 401, corsHeaders)
      }

      return jsonResponse({
        access_token: signInData.access_token,
        refresh_token: signInData.refresh_token,
        expires_in: signInData.expires_in,
        user: {
          id: signInData.user?.id,
          email: signInData.user?.email,
          username: signInData.user?.user_metadata?.username || username,
        },
        _version: FUNCTION_VERSION,
      }, 200, corsHeaders)
    }

    // ══════════════════════════════════════════
    // ALL OTHER ACTIONS — authentication required
    // ══════════════════════════════════════════
    const { supabase } = getSupabaseAdmin()
    const authResult = await authenticateRequest(req, corsHeaders)
    if (authResult.response) return authResult.response
    const { auth } = authResult

    // Get profile
    const { data: profile } = await supabase
      .from('profiles')
      .select('*')
      .eq('user_id', auth.user.id)
      .single()

    if (!profile) {
      return jsonResponse({ error: 'Profil nicht gefunden' }, 404, corsHeaders)
    }

    // Check if user is a structure admin
    const { data: structureAdmin } = await supabase
      .from('structure_admins')
      .select('*')
      .eq('profile_id', profile.id)
      .eq('is_active', true)
      .maybeSingle()

    const isSuperAdmin = auth.roles.includes('super_admin') || profile.role === 'super_admin'
    const isStructureAdmin = !!structureAdmin

    // Determine which base_number the user can access
    let accessibleBaseNumber: string | null = null
    if (isSuperAdmin) {
      accessibleBaseNumber = body.baseNumber || structureAdmin?.base_number || null
    } else if (isStructureAdmin) {
      accessibleBaseNumber = structureAdmin.base_number
    }

    switch (action) {
      case 'overview': {
        if (!accessibleBaseNumber && !isSuperAdmin) {
          // Regular partner - show own data
          const { data: ownNumber } = await supabase
            .from('partner_numbers')
            .select('*')
            .eq('profile_id', profile.id)
            .maybeSingle()

          const { data: hierarchy } = await supabase
            .from('user_hierarchy')
            .select('id, user_id, level_number, is_active_for_commission')
            .eq('ancestor_id', profile.id)
            .lte('level_number', 5)

          const { data: commissions } = await supabase
            .from('commissions')
            .select('commission_amount, status')
            .eq('partner_id', profile.id)

          const pendingComm = commissions?.filter(c => c.status === 'pending').reduce((s, c) => s + Number(c.commission_amount), 0) || 0
          const paidComm = commissions?.filter(c => c.status === 'paid').reduce((s, c) => s + Number(c.commission_amount), 0) || 0
          const approvedComm = commissions?.filter(c => c.status === 'approved').reduce((s, c) => s + Number(c.commission_amount), 0) || 0

          return jsonResponse({
            profile: {
              id: profile.id,
              first_name: profile.first_name,
              last_name: profile.last_name,
              email: profile.email,
              phone: profile.phone,
              partner_number: ownNumber?.partner_number || profile.partner_number,
              role: profile.role,
              status: profile.status,
            },
            isStructureAdmin: false,
            isSuperAdmin: false,
            stats: {
              totalDownline: hierarchy?.length || 0,
              level1: hierarchy?.filter(h => h.level_number === 1).length || 0,
              level2: hierarchy?.filter(h => h.level_number === 2).length || 0,
              level3: hierarchy?.filter(h => h.level_number === 3).length || 0,
              level4: hierarchy?.filter(h => h.level_number === 4).length || 0,
              level5: hierarchy?.filter(h => h.level_number === 5).length || 0,
              pendingCommissions: pendingComm,
              approvedCommissions: approvedComm,
              paidCommissions: paidComm,
              totalCommissions: pendingComm + approvedComm + paidComm,
            }
          }, 200, corsHeaders)
        }

        // Structure admin or super admin - show structure stats
        let partnersQuery = supabase.from('partner_numbers').select('*, profile:profiles(*)')
        if (accessibleBaseNumber) {
          partnersQuery = partnersQuery.eq('base_number', accessibleBaseNumber)
        }
        const { data: structurePartners } = await partnersQuery

        const partnerIds = structurePartners?.map(p => p.profile_id) || []
        let totalCommissions = 0
        let pendingCommissions = 0
        let paidCommissions = 0

        if (partnerIds.length > 0) {
          const { data: commissions } = await supabase
            .from('commissions')
            .select('partner_id, commission_amount, status')
            .in('partner_id', partnerIds)

          totalCommissions = commissions?.reduce((s, c) => s + Number(c.commission_amount), 0) || 0
          pendingCommissions = commissions?.filter(c => c.status === 'pending').reduce((s, c) => s + Number(c.commission_amount), 0) || 0
          paidCommissions = commissions?.filter(c => c.status === 'paid').reduce((s, c) => s + Number(c.commission_amount), 0) || 0
        }

        let structures: any[] = []
        if (isSuperAdmin) {
          const { data: allStructures } = await supabase
            .from('structure_admins')
            .select('*')
            .eq('is_active', true)
          structures = allStructures || []
        }

        return jsonResponse({
          profile: {
            id: profile.id,
            first_name: profile.first_name,
            last_name: profile.last_name,
            email: profile.email,
            partner_number: profile.partner_number,
            role: profile.role,
          },
          isStructureAdmin,
          isSuperAdmin,
          structureAdmin: structureAdmin ? {
            base_number: structureAdmin.base_number,
            structure_name: structureAdmin.structure_name,
            admin_name: structureAdmin.admin_name,
          } : null,
          structures,
          stats: {
            totalPartners: structurePartners?.length || 0,
            activePartners: structurePartners?.filter(p => (p as any).profile?.status === 'active').length || 0,
            totalCommissions,
            pendingCommissions,
            paidCommissions,
          }
        }, 200, corsHeaders)
      }

      case 'downline': {
        if (!accessibleBaseNumber && !isSuperAdmin) {
          const { data: hierarchy } = await supabase
            .from('user_hierarchy')
            .select(`
              id, user_id, level_number, is_active_for_commission,
              user:profiles!user_hierarchy_user_id_fkey (
                id, first_name, last_name, email, status, partner_number, phone, city
              )
            `)
            .eq('ancestor_id', profile.id)
            .lte('level_number', 5)
            .order('level_number')

          return jsonResponse({ downline: hierarchy || [] }, 200, corsHeaders)
        }

        const { data: partners } = await supabase
          .from('partner_numbers')
          .select(`
            partner_number, sub_number, level_in_structure,
            profile:profiles (
              id, first_name, last_name, email, phone, city, status, role, sponsor_id, 
              partner_number, created_at
            )
          `)
          .eq('base_number', accessibleBaseNumber!)
          .order('partner_number')

        return jsonResponse({ downline: partners || [], baseNumber: accessibleBaseNumber }, 200, corsHeaders)
      }

      case 'tree': {
        const targetId = body.partnerId || profile.id

        const { data: children } = await supabase
          .from('user_hierarchy')
          .select(`
            id, user_id, level_number, is_active_for_commission,
            user:profiles!user_hierarchy_user_id_fkey (
              id, first_name, last_name, email, status, partner_number
            )
          `)
          .eq('ancestor_id', targetId)
          .lte('level_number', 5)
          .order('level_number')

        const treeNodes: Record<string, any> = {}
        const rootChildren: any[] = []

        children?.forEach((child: any) => {
          const node = {
            id: child.user_id,
            name: `${child.user?.first_name || ''} ${child.user?.last_name || ''}`.trim(),
            email: child.user?.email,
            status: child.user?.status,
            partner_number: child.user?.partner_number,
            level: child.level_number,
            is_active: child.is_active_for_commission,
            children: [] as any[],
          }
          treeNodes[child.user_id] = node

          if (child.level_number === 1) {
            rootChildren.push(node)
          }
        })

        // Link children to parents for levels 2-5
        for (const child of children || []) {
          if (child.level_number > 1) {
            const parentHierarchy = children?.find(
              (c: any) => c.user_id !== child.user_id && c.level_number === child.level_number - 1
            )
            if (parentHierarchy && treeNodes[parentHierarchy.user_id]) {
              treeNodes[parentHierarchy.user_id].children.push(treeNodes[child.user_id])
            } else {
              rootChildren.push(treeNodes[child.user_id])
            }
          }
        }

        return jsonResponse({
          tree: {
            id: targetId,
            name: `${profile.first_name} ${profile.last_name}`,
            partner_number: profile.partner_number,
            status: profile.status,
            level: 0,
            children: rootChildren,
          }
        }, 200, corsHeaders)
      }

      case 'commissions': {
        let query = supabase
          .from('commissions')
          .select(`
            *,
            transaction:transactions!commissions_transaction_id_fkey (
              id, amount, created_at,
              customer:profiles!transactions_customer_id_fkey (
                first_name, last_name, partner_number
              )
            )
          `)
          .order('created_at', { ascending: false })
          .limit(200)

        if (!isSuperAdmin && !isStructureAdmin) {
          query = query.eq('partner_id', profile.id)
        } else if (isStructureAdmin && accessibleBaseNumber) {
          const { data: pnums } = await supabase
            .from('partner_numbers')
            .select('profile_id')
            .eq('base_number', accessibleBaseNumber)
          
          if (pnums && pnums.length > 0) {
            query = query.in('partner_id', pnums.map(p => p.profile_id))
          }
        }

        const { data: commissions } = await query

        const levelStats: Record<number, { count: number, total: number }> = {}
        commissions?.forEach((c: any) => {
          const level = c.level_number || 1
          if (!levelStats[level]) levelStats[level] = { count: 0, total: 0 }
          levelStats[level].count++
          levelStats[level].total += Number(c.commission_amount)
        })

        return jsonResponse({
          commissions: commissions || [],
          levelStats,
        }, 200, corsHeaders)
      }

      case 'edit-profile': {
        const { profileData: updates } = body
        if (!updates) {
          return jsonResponse({ error: 'Keine Daten zum Aktualisieren' }, 400, corsHeaders)
        }

        const allowedFields = ['phone', 'street', 'house_number', 'postal_code', 'city', 'email']
        const safeUpdates: Record<string, string> = {}
        
        for (const [key, value] of Object.entries(updates)) {
          if (allowedFields.includes(key) && typeof value === 'string') {
            safeUpdates[key] = value.trim()
          }
        }

        if (Object.keys(safeUpdates).length === 0) {
          return jsonResponse({ error: 'Keine erlaubten Felder zum Aktualisieren' }, 400, corsHeaders)
        }

        const { error: updateError } = await supabase
          .from('profiles')
          .update(safeUpdates)
          .eq('id', profile.id)

        if (updateError) {
          return jsonResponse({ error: updateError.message }, 500, corsHeaders)
        }

        return jsonResponse({ success: true, updated: Object.keys(safeUpdates) }, 200, corsHeaders)
      }

      case 'stats': {
        // Load commission rates from DB
        const { data: rateSettings } = await supabase
          .from('mlm_settings')
          .select('key, value')
          .like('key', 'commission_rate_level_%')
        
        const commissionsByLevel: Record<number, number> = {}
        if (rateSettings && rateSettings.length > 0) {
          for (const s of rateSettings) {
            const level = parseInt(s.key.replace('commission_rate_level_', ''))
            commissionsByLevel[level] = Number(s.value)
          }
        } else {
          // Fallback defaults
          Object.assign(commissionsByLevel, { 1: 10, 2: 5, 3: 4, 4: 3, 5: 2 })
        }

        const { data: maxLevelSetting } = await supabase
          .from('mlm_settings')
          .select('value')
          .eq('key', 'max_levels')
          .maybeSingle()

        return jsonResponse({
          commissionRates: commissionsByLevel,
          levels: maxLevelSetting ? Number(maxLevelSetting.value) : 5,
          structure: isStructureAdmin ? structureAdmin?.structure_name : 'MLM',
        }, 200, corsHeaders)
      }

      // ══════════════════════════════════════════
      // SETTINGS — Get and update configurable settings
      // ══════════════════════════════════════════

      case 'get-settings': {
        const { data: allSettings } = await supabase
          .from('mlm_settings')
          .select('key, value, label, category')
          .order('category')
          .order('key')
        
        // Group by category
        const grouped: Record<string, Array<{ key: string; value: any; label: string }>> = {}
        for (const s of (allSettings || [])) {
          if (!grouped[s.category]) grouped[s.category] = []
          grouped[s.category].push({ key: s.key, value: s.value, label: s.label })
        }

        return jsonResponse({ settings: allSettings || [], grouped }, 200, corsHeaders)
      }

      case 'update-settings': {
        if (!isSuperAdmin) {
          return jsonResponse({ error: 'Nur Super-Admins können Einstellungen ändern' }, 403, corsHeaders)
        }

        const { settings: settingsToUpdate } = body
        if (!settingsToUpdate || !Array.isArray(settingsToUpdate)) {
          return jsonResponse({ error: 'settings Array erforderlich' }, 400, corsHeaders)
        }

        const errors: string[] = []
        let updated = 0

        for (const item of settingsToUpdate) {
          if (!item.key || item.value === undefined) {
            errors.push(`Ungültiger Eintrag: ${JSON.stringify(item)}`)
            continue
          }

          // Normalize value for JSONB column:
          // - numbers stay numbers
          // - JSON strings like '{"a":1}' or 'true' become parsed JSON
          // - all other strings are stored as plain text
          let normalizedValue: any = item.value
          if (typeof normalizedValue === 'string') {
            const trimmed = normalizedValue.trim()
            try {
              // Try parse simple JSON (object/array/number/bool/null)
              normalizedValue = JSON.parse(trimmed)
            } catch {
              // Fallback: keep as plain string, without extra JSON.stringify
              normalizedValue = trimmed
            }
          }

          const { error: upErr } = await supabase
            .from('mlm_settings')
            .update({ 
              value: normalizedValue,
              updated_at: new Date().toISOString(),
              updated_by: profile.id,
            })
            .eq('key', item.key)

          if (upErr) {
            errors.push(`${item.key}: ${upErr.message}`)
          } else {
            updated++
          }
        }

        return jsonResponse({ 
          success: errors.length === 0, 
          updated, 
          errors: errors.length > 0 ? errors : undefined 
        }, errors.length > 0 && updated === 0 ? 500 : 200, corsHeaders)
      }

      case 'add-setting': {
        if (!isSuperAdmin) {
          return jsonResponse({ error: 'Nur Super-Admins können Einstellungen hinzufügen' }, 403, corsHeaders)
        }

        const { key: newKey, value: newValue, label: newLabel, category: newCategory } = body
        if (!newKey || newValue === undefined) {
          return jsonResponse({ error: 'key und value erforderlich' }, 400, corsHeaders)
        }

        // Normalize new setting value in the same way as update-settings
        let normalizedNewValue: any = newValue
        if (typeof normalizedNewValue === 'string') {
          const trimmed = normalizedNewValue.trim()
          try {
            normalizedNewValue = JSON.parse(trimmed)
          } catch {
            normalizedNewValue = trimmed
          }
        }

        const { error: insErr } = await supabase
          .from('mlm_settings')
          .insert({
            key: newKey,
            value: normalizedNewValue,
            label: newLabel || newKey,
            category: newCategory || 'general',
            updated_by: profile.id,
          })

        if (insErr) return jsonResponse({ error: insErr.message }, 500, corsHeaders)
        return jsonResponse({ success: true }, 201, corsHeaders)
      }

      case 'delete-setting': {
        if (!isSuperAdmin) {
          return jsonResponse({ error: 'Nur Super-Admins können Einstellungen löschen' }, 403, corsHeaders)
        }

        const { key: delKey } = body
        if (!delKey) return jsonResponse({ error: 'key erforderlich' }, 400, corsHeaders)

        const { error: delSettErr } = await supabase
          .from('mlm_settings')
          .delete()
          .eq('key', delKey)

        if (delSettErr) return jsonResponse({ error: delSettErr.message }, 500, corsHeaders)
        return jsonResponse({ success: true }, 200, corsHeaders)
      }

      // ══════════════════════════════════════════
      // CRUD — Partner Management
      // ══════════════════════════════════════════

      case 'add-partner': {
        const { partnerData } = body
        if (!partnerData?.first_name || !partnerData?.last_name || !partnerData?.email) {
          return jsonResponse({ error: 'Vorname, Nachname und E-Mail sind Pflichtfelder' }, 400, corsHeaders)
        }

        const partnerEmail = partnerData.email.trim().toLowerCase()

        const { data: existing } = await supabase
          .from('profiles')
          .select('id')
          .eq('email', partnerEmail)
          .maybeSingle()
        if (existing) {
          return jsonResponse({ error: 'E-Mail bereits vergeben' }, 409, corsHeaders)
        }

        // Auto-generate partner number
        let nextPN = '1001'
        try {
          const { data: maxPN } = await supabase
            .from('profiles')
            .select('partner_number')
            .not('partner_number', 'is', null)
            .order('partner_number', { ascending: false })
            .limit(1)
            .maybeSingle()
          if (maxPN?.partner_number) {
            nextPN = String(Math.max(Number(maxPN.partner_number) + 1, 1001))
          }
        } catch (e: any) {
          console.warn('Could not auto-generate partner number, using default:', e?.message)
        }

        // Create auth user for the partner
        const serviceKey2 = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
        const adminClient2 = createClient(Deno.env.get('SUPABASE_URL')!, serviceKey2)

        const tempPassword = `Partner${nextPN}!`
        let authUserId: string

        const { data: authUser, error: authErr } = await adminClient2.auth.admin.createUser({
          email: partnerEmail,
          password: tempPassword,
          email_confirm: true,
          user_metadata: { role: 'partner' },
        })

        if (authErr) {
          // If user already exists in auth, try to find them
          if (authErr.message?.includes('already') || authErr.message?.includes('registered')) {
            const { data: userList } = await adminClient2.auth.admin.listUsers({ perPage: 1000 })
            const found = userList?.users?.find((u: any) => u.email === partnerEmail)
            if (found) {
              authUserId = found.id
            } else {
              return jsonResponse({ error: `Auth-Fehler: ${authErr.message}` }, 500, corsHeaders)
            }
          } else {
            return jsonResponse({ error: `Auth-Fehler: ${authErr.message}` }, 500, corsHeaders)
          }
        } else {
          authUserId = authUser.user.id
        }

        // Wait for trigger to create profile, then update it
        await new Promise(r => setTimeout(r, 1000))

        const profilePayload = {
          first_name: partnerData.first_name.trim(),
          last_name: partnerData.last_name.trim(),
          email: partnerEmail,
          phone: partnerData.phone?.trim() || null,
          city: partnerData.city?.trim() || null,
          street: partnerData.street?.trim() || null,
          house_number: partnerData.house_number?.trim() || null,
          postal_code: partnerData.postal_code?.trim() || null,
          role: 'partner',
          status: 'active',
          partner_number: partnerData.partner_number || nextPN,
          sponsor_id: profile.id,
        }

        // Check if trigger already created a profile row
        const { data: existingProfile } = await supabase
          .from('profiles')
          .select('id')
          .eq('user_id', authUserId)
          .maybeSingle()

        let newP: any
        let insErr: any

        if (existingProfile) {
          const result = await supabase
            .from('profiles')
            .update(profilePayload)
            .eq('id', existingProfile.id)
            .select()
            .single()
          newP = result.data
          insErr = result.error
        } else {
          const result = await supabase
            .from('profiles')
            .insert({ user_id: authUserId, ...profilePayload })
            .select()
            .single()
          newP = result.data
          insErr = result.error
        }

        if (insErr) {
          console.error('Profile insert/update error:', insErr)
          return jsonResponse({ error: `Profil-Fehler: ${insErr.message}` }, 500, corsHeaders)
        }

        // ── Create user_hierarchy entries ──
        if (newP?.id && profile.id) {
          try {
            await supabase.from('user_hierarchy').upsert({
              user_id: newP.id,
              ancestor_id: profile.id,
              level_number: 1,
              is_active_for_commission: true,
            }, { onConflict: 'user_id,ancestor_id' })

            const { data: sponsorChain } = await supabase
              .from('user_hierarchy')
              .select('ancestor_id, level_number')
              .eq('user_id', profile.id)
              .lte('level_number', 4)
              .order('level_number')

            for (const ancestor of (sponsorChain || [])) {
              const newLevel = ancestor.level_number + 1
              await supabase.from('user_hierarchy').upsert({
                user_id: newP.id,
                ancestor_id: ancestor.ancestor_id,
                level_number: newLevel,
                is_active_for_commission: newLevel <= 5,
              }, { onConflict: 'user_id,ancestor_id' })
            }
          } catch (e: any) {
            console.warn('Hierarchy creation warning:', e?.message)
          }
        }

        // ── Assign partner_numbers entry ──
        if (newP?.id && accessibleBaseNumber) {
          try {
            await supabase.rpc('assign_partner_number', {
              p_profile_id: newP.id,
              p_base_number: accessibleBaseNumber,
            })
          } catch (e: any) {
            console.warn('assign_partner_number skipped:', e?.message)
          }
        }

        // ── Create user_roles entry ──
        if (newP?.id) {
          try {
            await supabase.from('user_roles').upsert(
              { user_id: newP.id, role: 'partner' },
              { onConflict: 'user_id,role' }
            )
          } catch (e: any) {
            console.warn('user_roles upsert warning:', e?.message)
          }
        }

        return jsonResponse({ success: true, partner: newP, tempPassword }, 201, corsHeaders)
      }

      case 'edit-partner': {
        if (!isSuperAdmin && !isStructureAdmin) {
          return jsonResponse({ error: 'Keine Berechtigung' }, 403, corsHeaders)
        }
        const { partnerId, partnerData: pData } = body
        if (!partnerId || !pData) {
          return jsonResponse({ error: 'Partner-ID und Daten erforderlich' }, 400, corsHeaders)
        }

        const allowed = ['first_name', 'last_name', 'email', 'phone', 'city', 'street', 'house_number', 'postal_code', 'role', 'status', 'partner_number']
        const safe: Record<string, any> = {}
        for (const [k, v] of Object.entries(pData)) {
          if (allowed.includes(k)) safe[k] = typeof v === 'string' ? v.trim() : v
        }

        if (!Object.keys(safe).length) {
          return jsonResponse({ error: 'Keine erlaubten Felder' }, 400, corsHeaders)
        }

        const { error: upErr } = await supabase.from('profiles').update(safe).eq('id', partnerId)
        if (upErr) return jsonResponse({ error: upErr.message }, 500, corsHeaders)

        return jsonResponse({ success: true }, 200, corsHeaders)
      }

      case 'delete-partner': {
        if (!isSuperAdmin && !isStructureAdmin) {
          return jsonResponse({ error: 'Keine Berechtigung' }, 403, corsHeaders)
        }
        const { partnerId: delId } = body
        if (!delId) return jsonResponse({ error: 'Partner-ID erforderlich' }, 400, corsHeaders)

        const { error: delErr } = await supabase.from('profiles').update({ status: 'deleted' }).eq('id', delId)
        if (delErr) return jsonResponse({ error: delErr.message }, 500, corsHeaders)

        return jsonResponse({ success: true }, 200, corsHeaders)
      }

      // ══════════════════════════════════════════
      // CREDENTIALS — Change password/email
      // ══════════════════════════════════════════

      case 'change-credentials': {
        const { newPassword, newEmail, newUsername } = body
        const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
        const adminClient = createClient(Deno.env.get('SUPABASE_URL')!, serviceKey)

        const updates: Record<string, any> = {}
        if (newPassword) updates.password = newPassword
        if (newEmail) updates.email = newEmail
        if (newUsername) updates.user_metadata = { username: newUsername }

        if (!Object.keys(updates).length) {
          return jsonResponse({ error: 'Keine Änderungen' }, 400, corsHeaders)
        }

        const { error: credErr } = await adminClient.auth.admin.updateUserById(auth.user.id, updates)
        if (credErr) return jsonResponse({ error: credErr.message }, 500, corsHeaders)

        if (newEmail) {
          await supabase.from('profiles').update({ email: newEmail }).eq('id', profile.id)
        }

        return jsonResponse({ success: true }, 200, corsHeaders)
      }

      default:
        return jsonResponse({ error: 'Unbekannte Aktion', version: FUNCTION_VERSION }, 400, corsHeaders)
    }

  } catch (error: any) {
    console.error('MLM Dashboard error:', error)
    return jsonResponse({ error: error.message }, 500, getCorsHeaders(req))
  }
})
