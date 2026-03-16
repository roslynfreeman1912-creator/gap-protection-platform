import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const DEFAULT_ORIGINS = [
  'https://pqnzsihfryjnnhdubisk.supabase.co',
  'https://app.gapprotection.de',
  'https://gapprotectionltd.com',
  'https://www.gapprotectionltd.com',
  'http://localhost:8080',
  'http://localhost:8081',
  'http://localhost:8082',
  'http://localhost:8083',
  'http://localhost:5173',
]

const ALLOWED_ORIGINS = (Deno.env.get('ALLOWED_ORIGINS') || '')
  .split(',')
  .map(origin => origin.trim())
  .filter(Boolean)
  .concat(DEFAULT_ORIGINS)
  .filter((origin, index, arr) => arr.indexOf(origin) === index)

export function getCorsHeaders(req: Request) {
  const origin = req.headers.get('Origin') || ''
  const allowedOrigin = ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0]
  return {
    'Access-Control-Allow-Origin': allowedOrigin,
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Vary': 'Origin',
  }
}

export function jsonResponse(data: unknown, status: number, corsHeaders: Record<string, string>) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}

export function getSupabaseAdmin() {
  const url = Deno.env.get('SUPABASE_URL')!
  const key = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  return { supabase: createClient(url, key), url, key }
}

export interface AuthResult {
  user: { id: string }
  profileId: string
  role: string
  roles: string[]
}

/**
 * Authenticate and authorize the request.
 * - Extracts and validates the JWT from the Authorization header.
 * - Fetches the user profile and roles from the database.
 * - Optionally checks for a required role.
 * Returns null + sends a response if auth fails.
 */
export async function authenticateRequest(
  req: Request,
  corsHeaders: Record<string, string>,
  options?: { requiredRole?: string; allowedRoles?: string[] }
): Promise<{ auth: AuthResult; response?: never } | { auth?: never; response: Response }> {
  const authHeader = req.headers.get('Authorization')
  if (!authHeader) {
    return { response: jsonResponse({ error: 'Nicht autorisiert' }, 401, corsHeaders) }
  }

  const { supabase } = getSupabaseAdmin()
  const token = authHeader.replace('Bearer ', '')
  const { data: { user }, error: authError } = await supabase.auth.getUser(token)

  if (authError || !user) {
    return { response: jsonResponse({ error: 'Ungültiges Token' }, 401, corsHeaders) }
  }

  // Get profile
  const { data: profile } = await supabase
    .from('profiles')
    .select('id, role')
    .eq('user_id', user.id)
    .single()

  if (!profile) {
    return { response: jsonResponse({ error: 'Profil nicht gefunden' }, 404, corsHeaders) }
  }

  // Get roles from user_roles table
  const { data: rolesData } = await supabase
    .from('user_roles')
    .select('role')
    .eq('user_id', profile.id)

  const roles = (rolesData || []).map((r: { role: string }) => r.role)

  // Check required role
  if (options?.requiredRole && !roles.includes(options.requiredRole) && profile.role !== options.requiredRole) {
    return { response: jsonResponse({ error: 'Keine Berechtigung' }, 403, corsHeaders) }
  }

  // Check allowed roles
  if (options?.allowedRoles) {
    const hasRole = options.allowedRoles.some(r => roles.includes(r) || profile.role === r)
    if (!hasRole) {
      return { response: jsonResponse({ error: 'Keine Berechtigung' }, 403, corsHeaders) }
    }
  }

  return {
    auth: {
      user: { id: user.id },
      profileId: profile.id,
      role: profile.role,
      roles,
    },
  }
}

/**
 * Authenticate server-to-server calls using service role key.
 * Used for internal function-to-function calls (e.g., monthly-billing → calculate-commissions).
 */
export function authenticateServiceCall(req: Request, corsHeaders: Record<string, string>): { ok: boolean; response?: Response } {
  const authHeader = req.headers.get('Authorization')
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')

  if (!authHeader) {
    return { ok: false, response: jsonResponse({ error: 'Nicht autorisiert' }, 401, corsHeaders) }
  }

  const token = authHeader.replace('Bearer ', '')

  // Allow service role key for internal calls — constant-time comparison to prevent timing attacks
  if (serviceKey && token.length === serviceKey.length) {
    const encoder = new TextEncoder()
    const a = encoder.encode(token)
    const b = encoder.encode(serviceKey)
    let mismatch = 0
    for (let i = 0; i < a.length; i++) {
      mismatch |= a[i] ^ b[i]
    }
    if (mismatch === 0) {
      return { ok: true }
    }
  }

  return { ok: false, response: jsonResponse({ error: 'Ungültiger Service-Schlüssel' }, 401, corsHeaders) }
}

/**
 * PHASE 0 – MAINTENANCE MODE
 * Financial functions are disabled until security hardening is complete.
 * Set MAINTENANCE_MODE=false in env to re-enable after Phase 1.
 */
const FINANCIAL_FUNCTIONS = [
  'wallet-engine', 'bonus-engine', 'monthly-billing', 'calculate-pool',
  'generate-credit-notes', 'cc-commissions', 'create-transaction',
]

export function checkMaintenanceMode(functionName: string, corsHeaders: Record<string, string>): Response | null {
  const maintenanceMode = Deno.env.get('MAINTENANCE_MODE') === 'true'
  if (maintenanceMode && FINANCIAL_FUNCTIONS.includes(functionName)) {
    return jsonResponse(
      { error: 'System befindet sich im Wartungsmodus. Finanzielle Operationen sind vorübergehend deaktiviert.' },
      503, corsHeaders
    )
  }
  return null
}

// H-07 FIX: DB-backed rate limiting (replaces ineffective in-memory per-instance store)
// Falls back to in-memory if DB call fails
const rateLimitStore = new Map<string, { count: number; resetAt: number }>()

export async function checkRateLimitDb(
  key: string,
  maxRequests: number = 60,
  windowMs: number = 60_000
): Promise<boolean> {
  try {
    const { supabase } = getSupabaseAdmin()
    const { data, error } = await supabase.rpc('check_rate_limit_db', {
      p_key: key,
      p_max_requests: maxRequests,
      p_window_ms: windowMs,
    })
    if (!error && data !== null) return data as boolean
  } catch (_e) {
    // Fallback to in-memory
  }
  return checkRateLimit(key, maxRequests, windowMs)
}

export function checkRateLimit(
  key: string,
  maxRequests: number = 60,
  windowMs: number = 60_000
): boolean {
  const now = Date.now()
  const entry = rateLimitStore.get(key)

  if (!entry || now > entry.resetAt) {
    rateLimitStore.set(key, { count: 1, resetAt: now + windowMs })
    return true
  }

  if (entry.count >= maxRequests) {
    return false
  }

  entry.count++
  return true
}

/**
 * Sanitize a search string for use in PostgREST ilike filters.
 * Removes characters that could manipulate the filter syntax.
 */
export function sanitizeSearchInput(input: string): string {
  return input.replace(/[%_(),.*\\'";[\]{}]/g, '').trim().substring(0, 100)
}
