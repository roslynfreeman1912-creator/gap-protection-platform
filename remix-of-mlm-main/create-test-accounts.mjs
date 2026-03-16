// create-test-accounts.mjs
// Run: node create-test-accounts.mjs
// Creates test accounts for all roles in Supabase

const SUPABASE_URL = 'https://pqnzsihfryjnnhdubisk.supabase.co'
const ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBxbnpzaWhmcnlqbm5oZHViaXNrIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzI1MjY4NDQsImV4cCI6MjA4ODEwMjg0NH0.AzmcvzIC3Ve5CwZuLVrDfpq9RJ5W-oy8KmJlK1cUINg'

// We'll use signUp + direct DB insert via REST
const accounts = [
  { email: 'superadmin@gap-protection.com', password: 'GapAdmin2024!', first_name: 'Super', last_name: 'Admin', role: 'super_admin' },
  { email: 'admin@gap-protection.com',      password: 'GapAdmin2024!', first_name: 'Max',   last_name: 'Mueller', role: 'admin' },
  { email: 'partner@gap-protection.com',    password: 'GapPartner2024!', first_name: 'Stefan', last_name: 'Grimm', role: 'partner' },
  { email: 'callcenter@gap-protection.com', password: 'GapCall2024!', first_name: 'Thomas', last_name: 'Weber', role: 'callcenter' },
]

async function createAccount(acc) {
  console.log(`\n→ Creating: ${acc.email} [${acc.role}]`)
  
  // 1. Sign up the user
  const signupRes = await fetch(`${SUPABASE_URL}/auth/v1/signup`, {
    method: 'POST',
    headers: {
      'apikey': ANON_KEY,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      email: acc.email,
      password: acc.password,
      data: { first_name: acc.first_name, last_name: acc.last_name, role: acc.role }
    })
  })
  
  const signupData = await signupRes.json()
  
  if (signupData.error) {
    console.log(`  ✗ Signup error: ${signupData.error.message || signupData.msg}`)
    if (signupData.msg?.includes('already registered') || signupData.error?.message?.includes('already registered')) {
      console.log('  → User already exists, trying sign in...')
      // Try to sign in to get the user
      const signinRes = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=password`, {
        method: 'POST',
        headers: { 'apikey': ANON_KEY, 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: acc.email, password: acc.password })
      })
      const signinData = await signinRes.json()
      if (signinData.access_token) {
        console.log(`  ✓ Signed in existing user: ${acc.email}`)
        return { ...acc, access_token: signinData.access_token, user_id: signinData.user?.id }
      }
    }
    return null
  }
  
  const user_id = signupData?.user?.id
  const access_token = signupData?.session?.access_token
  
  if (!user_id) {
    console.log('  ✗ No user ID returned')
    return null
  }
  
  console.log(`  ✓ User created: ${user_id}`)
  return { ...acc, user_id, access_token }
}

async function run() {
  console.log('═══════════════════════════════════════════')
  console.log(' GAP Protection — Creating Test Accounts')
  console.log('═══════════════════════════════════════════')
  
  const created = []
  for (const acc of accounts) {
    const result = await createAccount(acc)
    if (result) created.push(result)
  }
  
  console.log('\n═══════════════════════════════════════════')
  console.log(' Summary')
  console.log('═══════════════════════════════════════════')
  for (const acc of created) {
    console.log(`  ${acc.role.padEnd(12)} | ${acc.email} | ${acc.password}`)
  }
  console.log('\n Jetzt im Browser anmelden mit obigen Daten')
}

run().catch(console.error)
