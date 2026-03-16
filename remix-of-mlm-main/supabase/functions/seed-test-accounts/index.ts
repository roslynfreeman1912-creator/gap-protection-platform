import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

// ═══════════════════════════════════════════════════
// GAP Protection — Seed Test Accounts
// Creates admin, partner, and callcenter test users
// ═══════════════════════════════════════════════════

serve(async (req: Request) => {
  const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  }
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders })

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  const supabase = createClient(supabaseUrl, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false }
  })

  const results: any[] = []

  // ── Test accounts to create ──
  const accounts = [
    {
      email: 'superadmin@gap-protection.com',
      password: 'GapAdmin2024!',
      first_name: 'Super',
      last_name: 'Admin',
      role: 'super_admin',
    },
    {
      email: 'admin@gap-protection.com',
      password: 'GapAdmin2024!',
      first_name: 'Max',
      last_name: 'Mueller',
      role: 'admin',
    },
    {
      email: 'partner@gap-protection.com',
      password: 'GapPartner2024!',
      first_name: 'Stefan',
      last_name: 'Grimm',
      role: 'partner',
    },
    {
      email: 'callcenter@gap-protection.com',
      password: 'GapCall2024!',
      first_name: 'Thomas',
      last_name: 'Weber',
      role: 'callcenter',
    },
  ]

  for (const acc of accounts) {
    try {
      // 1. Create auth user (or get existing)
      const { data: authData, error: authErr } = await supabase.auth.admin.createUser({
        email: acc.email,
        password: acc.password,
        email_confirm: true,
        user_metadata: { first_name: acc.first_name, last_name: acc.last_name },
      })

      if (authErr && !authErr.message.includes('already been registered')) {
        results.push({ email: acc.email, status: 'ERROR', error: authErr.message })
        continue
      }

      // If already exists, get the user
      let userId = authData?.user?.id
      if (!userId) {
        const { data: existingUsers } = await supabase.auth.admin.listUsers()
        const existing = existingUsers?.users?.find((u: any) => u.email === acc.email)
        userId = existing?.id
      }

      if (!userId) {
        results.push({ email: acc.email, status: 'ERROR', error: 'Could not get user ID' })
        continue
      }

      // 2. Upsert profile
      const { error: profileErr } = await supabase.from('profiles').upsert({
        user_id: userId,
        first_name: acc.first_name,
        last_name: acc.last_name,
        email: acc.email,
        role: acc.role,
        status: 'active',
      }, { onConflict: 'user_id' })

      if (profileErr) {
        results.push({ email: acc.email, status: 'PROFILE_ERROR', error: profileErr.message })
        continue
      }

      // 3. Get profile id
      const { data: profile } = await supabase
        .from('profiles').select('id').eq('user_id', userId).single()

      if (profile?.id) {
        // 4. Upsert user_role
        await supabase.from('user_roles').upsert({
          user_id: profile.id,
          role: acc.role,
        }, { onConflict: 'user_id,role' })
      }

      results.push({
        email: acc.email,
        status: 'OK',
        role: acc.role,
        userId,
        password: acc.password,
      })
    } catch (e: any) {
      results.push({ email: acc.email, status: 'EXCEPTION', error: e.message })
    }
  }

  return new Response(JSON.stringify({ success: true, accounts: results }, null, 2), {
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
})
