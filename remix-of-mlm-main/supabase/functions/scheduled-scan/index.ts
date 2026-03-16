import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { getCorsHeaders, jsonResponse, authenticateRequest, authenticateServiceCall, getSupabaseAdmin } from '../_shared/auth.ts'

interface ScheduledScanRequest {
  action: 'create' | 'list' | 'delete' | 'run-pending'
  profileId?: string
  domainId?: string
  scanId?: string // for delete action — the scheduled_scans.id
  schedule?: 'daily' | 'weekly' | 'monthly'
}

serve(async (req) => {
  const corsHeaders = getCorsHeaders(req)

  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders })
  }

  try {
    // Authenticate: admin or service call
    const serviceAuth = authenticateServiceCall(req, corsHeaders)
    if (!serviceAuth.ok) {
      const authResult = await authenticateRequest(req, corsHeaders, { requiredRole: 'admin' })
      if (authResult.response) return authResult.response
    }

    const { supabase } = getSupabaseAdmin()

    const { action, profileId, domainId, scanId, schedule }: ScheduledScanRequest = await req.json()

    console.log(`Scheduled scan action: ${action}`)

    if (action === 'create') {
      // Create a scheduled scan for a domain
      if (!domainId || !profileId || !schedule) {
        return new Response(
          JSON.stringify({ error: 'domainId, profileId, and schedule are required' }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )
      }

      // Get domain info
      const { data: domain, error: domainError } = await supabase
        .from('protected_domains')
        .select('*')
        .eq('id', domainId)
        .single()

      if (domainError || !domain) {
        return new Response(
          JSON.stringify({ error: 'Domain not found' }),
          { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )
      }

      // Calculate next run time
      const now = new Date()
      const nextRun = new Date()
      switch (schedule) {
        case 'daily':
          nextRun.setDate(now.getDate() + 1)
          nextRun.setHours(2, 0, 0, 0) // 2 AM
          break
        case 'weekly':
          nextRun.setDate(now.getDate() + 7)
          nextRun.setHours(2, 0, 0, 0)
          break
        case 'monthly':
          nextRun.setMonth(now.getMonth() + 1)
          nextRun.setHours(2, 0, 0, 0)
          break
      }

      // Insert scheduled scan
      const { data: scheduledScan, error: insertError } = await supabase
        .from('scheduled_scans')
        .insert({
          profile_id: profileId,
          domain_id: domainId,
          domain: domain.domain,
          schedule_type: schedule,
          next_run_at: nextRun.toISOString(),
          is_active: true
        })
        .select()
        .single()

      if (insertError) {
        console.error('Insert error:', insertError)
        throw insertError
      }

      return new Response(
        JSON.stringify({ 
          success: true, 
          scheduled: scheduledScan,
          message: `Scan scheduled ${schedule} starting ${nextRun.toLocaleString('de-DE')}`
        }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    if (action === 'list') {
      // List scheduled scans for a profile
      const query = supabase
        .from('scheduled_scans')
        .select('*, protected_domains(domain, protection_status)')
        .order('next_run_at', { ascending: true })

      if (profileId) {
        query.eq('profile_id', profileId)
      }

      const { data: scans, error: listError } = await query

      if (listError) {
        throw listError
      }

      return new Response(
        JSON.stringify({ scans }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    if (action === 'delete') {
      // scanId is the scheduled_scans.id; domainId kept for backward compat
      const targetId = scanId || domainId
      if (!targetId) {
        return new Response(
          JSON.stringify({ error: 'scanId required' }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )
      }

      const { error: deleteError } = await supabase
        .from('scheduled_scans')
        .delete()
        .eq('id', targetId)

      if (deleteError) {
        throw deleteError
      }

      return new Response(
        JSON.stringify({ success: true }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    if (action === 'run-pending') {
      // Run all pending scheduled scans (called by cron)
      const now = new Date().toISOString()
      
      const { data: pendingScans, error: fetchError } = await supabase
        .from('scheduled_scans')
        .select('*')
        .eq('is_active', true)
        .lte('next_run_at', now)

      if (fetchError) {
        throw fetchError
      }

      console.log(`Found ${pendingScans?.length || 0} pending scans`)

      const results = []
      for (const scan of pendingScans || []) {
        try {
          // Trigger security scan using direct fetch with service role key
          const { url: supabaseUrl, key: serviceKey } = getSupabaseAdmin()
          const scanResponse = await fetch(`${supabaseUrl}/functions/v1/security-scan`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${serviceKey}`,
              'apikey': serviceKey,
            },
            body: JSON.stringify({
              domain: scan.domain,
              scanType: 'full',
              userId: scan.profile_id
            })
          })
          const scanResult = scanResponse.ok ? await scanResponse.json() : null
          const scanError = scanResponse.ok ? null : `HTTP ${scanResponse.status}`

          // Update next run time
          const nextRun = new Date()
          switch (scan.schedule_type) {
            case 'daily':
              nextRun.setDate(nextRun.getDate() + 1)
              break
            case 'weekly':
              nextRun.setDate(nextRun.getDate() + 7)
              break
            case 'monthly':
              nextRun.setMonth(nextRun.getMonth() + 1)
              break
          }

          await supabase
            .from('scheduled_scans')
            .update({
              last_run_at: now,
              next_run_at: nextRun.toISOString(),
              last_result: scanError ? 'error' : scanResult?.result
            })
            .eq('id', scan.id)

          results.push({ domain: scan.domain, success: !scanError })
        } catch (err: unknown) {
          console.error(`Error scanning ${scan.domain}:`, err)
          const errorMessage = err instanceof Error ? err.message : 'Unknown error'
          results.push({ domain: scan.domain, success: false, error: errorMessage })
        }
      }

      return new Response(
        JSON.stringify({ executed: results.length, results }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    return new Response(
      JSON.stringify({ error: 'Invalid action' }),
      { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )

  } catch (error: unknown) {
    console.error('Scheduled scan error:', error)
    const errorMessage = error instanceof Error ? error.message : 'Unknown error'
    return new Response(
      JSON.stringify({ error: errorMessage }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})
