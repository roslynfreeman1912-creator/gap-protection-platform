import { supabase } from '@/integrations/supabase/client'

/**
 * Centralized Security Dashboard API client.
 * ALL frontend mutations MUST go through this layer.
 * Direct supabase.from().insert/update/delete is PROHIBITED.
 */

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL || ''
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY || ''

async function callSecurityApi(body: Record<string, unknown>) {
  const { data: { session } } = await supabase.auth.getSession()
  if (!session?.access_token) throw new Error('Nicht authentifiziert')

  const res = await fetch(`${SUPABASE_URL}/functions/v1/security-dashboard-api`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${session.access_token}`,
      'apikey': SUPABASE_ANON_KEY,
    },
    body: JSON.stringify(body),
  })

  const data = await res.json()
  if (!res.ok) throw new Error(data.error || 'API-Fehler')
  return data
}

async function callCallcenterApi(body: Record<string, unknown>) {
  const { data: { session } } = await supabase.auth.getSession()
  if (!session?.access_token) throw new Error('Nicht authentifiziert')

  const res = await fetch(`${SUPABASE_URL}/functions/v1/callcenter-api`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${session.access_token}`,
      'apikey': SUPABASE_ANON_KEY,
    },
    body: JSON.stringify(body),
  })

  const data = await res.json()
  if (!res.ok) throw new Error(data.error || 'API-Fehler')
  return data
}

// Generic CRUD operations via Edge Function
export const securityApi = {
  insert: (table: string, data: Record<string, unknown>) =>
    callSecurityApi({ action: 'insert', table, data }),

  batchInsert: (table: string, records: Record<string, unknown>[]) =>
    callSecurityApi({ action: 'insert', table, records }),

  update: (table: string, id: string, data: Record<string, unknown>) =>
    callSecurityApi({ action: 'update', table, id, data }),

  upsert: (table: string, data: Record<string, unknown>) =>
    callSecurityApi({ action: 'upsert', table, data }),

  delete: (table: string, id: string) =>
    callSecurityApi({ action: 'delete', table, id }),
}

// CallCenter operations via Edge Function
export const callcenterApi = {
  upsertCallcenter: (id: string | null, data: Record<string, unknown>) =>
    callCallcenterApi({ action: 'upsert_callcenter', id, data }),

  upsertEmployee: (id: string | null, data: Record<string, unknown>) =>
    callCallcenterApi({ action: 'upsert_employee', id, data }),

  upsertLead: (id: string | null, data: Record<string, unknown>) =>
    callCallcenterApi({ action: 'upsert_lead', id, data }),

  deleteCallcenter: (id: string) =>
    callCallcenterApi({ action: 'delete_callcenter', id }),

  deleteEmployee: (id: string) =>
    callCallcenterApi({ action: 'delete_employee', id }),

  deleteLead: (id: string) =>
    callCallcenterApi({ action: 'delete_lead', id }),
}
