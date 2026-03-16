// ═══════════════════════════════════════════════════════════════
// 📞 Call Center Management Function
// ═══════════════════════════════════════════════════════════════
// Manages call center accounts and their customers
// Only accessible by super_admin
// ═══════════════════════════════════════════════════════════════

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";
import * as bcrypt from "https://deno.land/x/bcrypt@v0.4.1/mod.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    // Authenticate user
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: 'Unauthorized' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const token = authHeader.replace('Bearer ', '');
    const { data: { user }, error: authError } = await supabaseAdmin.auth.getUser(token);

    if (authError || !user) {
      return new Response(
        JSON.stringify({ error: 'Unauthorized' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Check if user is super_admin
    const { data: profile } = await supabaseAdmin
      .from('profiles')
      .select('role')
      .eq('user_id', user.id)
      .single();

    if (!profile || profile.role !== 'super_admin') {
      return new Response(
        JSON.stringify({ error: 'Access denied. Super admin only.' }),
        { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const { action } = await req.json();

    // ═══ CREATE CALL CENTER ═══
    if (action === 'create') {
      const { accountName, username, password, maxCustomers, permissions } = await req.json();

      // Validate input
      if (!accountName || !username || !password) {
        return new Response(
          JSON.stringify({ error: 'Missing required fields' }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      // Hash password
      const passwordHash = await bcrypt.hash(password);

      // Create call center account
      const { data: callCenter, error: createError } = await supabaseAdmin
        .from('call_center_accounts')
        .insert({
          account_name: accountName,
          username: username,
          password_hash: passwordHash,
          created_by: user.id,
          max_customers: maxCustomers || 1000,
          permissions: permissions || {
            can_add_customers: true,
            can_edit_customers: true,
            can_view_scans: true,
            can_run_scans: true,
            can_view_reports: true,
          },
        })
        .select()
        .single();

      if (createError) {
        return new Response(
          JSON.stringify({ error: `Failed to create call center: ${createError.message}` }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      // Notify admin
      await supabaseAdmin.rpc('notify_admin', {
        p_notification_type: 'call_center_created',
        p_title: `New Call Center Created: ${accountName}`,
        p_message: `Username: ${username}, Max customers: ${maxCustomers}`,
        p_severity: 'info',
        p_source_type: 'call_center',
        p_source_id: callCenter.id,
      });

      return new Response(
        JSON.stringify({
          success: true,
          callCenter: {
            id: callCenter.id,
            accountName: callCenter.account_name,
            username: callCenter.username,
            maxCustomers: callCenter.max_customers,
          },
        }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // ═══ LIST CALL CENTERS ═══
    if (action === 'list') {
      const { data: callCenters, error: listError } = await supabaseAdmin
        .from('call_center_accounts')
        .select('*')
        .order('created_at', { ascending: false });

      if (listError) {
        throw new Error(`Failed to list call centers: ${listError.message}`);
      }

      // Get statistics for each
      const callCentersWithStats = await Promise.all(
        callCenters.map(async (cc) => {
          const { data: stats } = await supabaseAdmin
            .rpc('get_call_center_stats', { p_call_center_id: cc.id });

          return {
            ...cc,
            stats: stats?.[0] || {},
          };
        })
      );

      return new Response(
        JSON.stringify({ callCenters: callCentersWithStats }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // ═══ UPDATE CALL CENTER ═══
    if (action === 'update') {
      const { callCenterId, updates } = await req.json();

      if (!callCenterId) {
        return new Response(
          JSON.stringify({ error: 'Call center ID required' }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      // If password is being updated, hash it
      if (updates.password) {
        updates.password_hash = await bcrypt.hash(updates.password);
        delete updates.password;
      }

      updates.updated_at = new Date().toISOString();

      const { data: updated, error: updateError } = await supabaseAdmin
        .from('call_center_accounts')
        .update(updates)
        .eq('id', callCenterId)
        .select()
        .single();

      if (updateError) {
        throw new Error(`Failed to update call center: ${updateError.message}`);
      }

      return new Response(
        JSON.stringify({ success: true, callCenter: updated }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // ═══ DELETE/SUSPEND CALL CENTER ═══
    if (action === 'suspend' || action === 'delete') {
      const { callCenterId } = await req.json();

      const status = action === 'delete' ? 'deleted' : 'suspended';

      const { error: updateError } = await supabaseAdmin
        .from('call_center_accounts')
        .update({ status, updated_at: new Date().toISOString() })
        .eq('id', callCenterId);

      if (updateError) {
        throw new Error(`Failed to ${action} call center: ${updateError.message}`);
      }

      return new Response(
        JSON.stringify({ success: true, message: `Call center ${status}` }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // ═══ GET CALL CENTER DETAILS ═══
    if (action === 'details') {
      const { callCenterId } = await req.json();

      const { data: callCenter, error: fetchError } = await supabaseAdmin
        .from('call_center_accounts')
        .select('*')
        .eq('id', callCenterId)
        .single();

      if (fetchError) {
        throw new Error(`Failed to fetch call center: ${fetchError.message}`);
      }

      // Get statistics
      const { data: stats } = await supabaseAdmin
        .rpc('get_call_center_stats', { p_call_center_id: callCenterId });

      // Get customers
      const { data: customers } = await supabaseAdmin
        .from('profiles')
        .select('id, first_name, last_name, email, status, created_at')
        .eq('call_center_id', callCenterId)
        .order('created_at', { ascending: false });

      return new Response(
        JSON.stringify({
          callCenter,
          stats: stats?.[0] || {},
          customers: customers || [],
        }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // ═══ GET DASHBOARD DATA ═══
    if (action === 'dashboard') {
      const { data: dashboard } = await supabaseAdmin
        .from('call_center_dashboard')
        .select('*');

      const { data: recentActivity } = await supabaseAdmin
        .from('admin_notifications')
        .select('*')
        .eq('source_type', 'call_center')
        .order('created_at', { ascending: false })
        .limit(10);

      return new Response(
        JSON.stringify({
          dashboard: dashboard || [],
          recentActivity: recentActivity || [],
        }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    return new Response(
      JSON.stringify({ error: 'Invalid action' }),
      { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Error:', error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
