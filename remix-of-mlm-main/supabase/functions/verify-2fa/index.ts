// ═══════════════════════════════════════════════════════════════
// 🔐 2FA Verification Function (Login)
// ═══════════════════════════════════════════════════════════════

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";
import { authenticator } from "npm:otplib@12.0.1";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { email, password, token, backupCode } = await req.json();

    // Create admin client for authentication
    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    // Step 1: Authenticate with email/password
    const { data: authData, error: authError } = await supabaseAdmin.auth.signInWithPassword({
      email,
      password,
    });

    if (authError || !authData.user) {
      return new Response(
        JSON.stringify({ error: 'Invalid credentials' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Step 2: Check if 2FA is enabled
    const { data: twoFAData, error: fetchError } = await supabaseAdmin
      .from('user_2fa')
      .select('secret, enabled, locked_until, failed_attempts, backup_codes, used_backup_codes')
      .eq('user_id', authData.user.id)
      .single();

    // If 2FA not enabled, allow login
    if (fetchError || !twoFAData?.enabled) {
      return new Response(
        JSON.stringify({
          success: true,
          session: authData.session,
          requires_2fa: false,
        }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Step 3: Check if account is locked
    if (twoFAData.locked_until && new Date(twoFAData.locked_until) > new Date()) {
      const minutesLeft = Math.ceil(
        (new Date(twoFAData.locked_until).getTime() - Date.now()) / 60000
      );

      // Sign out
      await supabaseAdmin.auth.signOut();

      return new Response(
        JSON.stringify({
          error: `Account locked due to too many failed attempts. Try again in ${minutesLeft} minutes.`,
        }),
        { status: 429, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Step 4: If no token provided, require 2FA
    if (!token && !backupCode) {
      // Sign out temporarily
      await supabaseAdmin.auth.signOut();

      return new Response(
        JSON.stringify({
          requires_2fa: true,
          message: '2FA token required',
        }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Step 5: Verify backup code if provided
    if (backupCode) {
      const isValidBackup = twoFAData.backup_codes?.includes(backupCode) &&
        !twoFAData.used_backup_codes?.includes(backupCode);

      if (!isValidBackup) {
        // Record failure
        await supabaseAdmin.rpc('record_2fa_failure', {
          p_user_id: authData.user.id,
        });

        await supabaseAdmin.auth.signOut();

        return new Response(
          JSON.stringify({ error: 'Invalid backup code' }),
          { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      // Mark backup code as used
      await supabaseAdmin
        .from('user_2fa')
        .update({
          used_backup_codes: [...(twoFAData.used_backup_codes || []), backupCode],
          last_used_at: new Date().toISOString(),
          failed_attempts: 0,
        })
        .eq('user_id', authData.user.id);

      // Log event
      await supabaseAdmin.rpc('log_2fa_event', {
        p_user_id: authData.user.id,
        p_action: 'backup_used',
        p_success: true,
      });

      return new Response(
        JSON.stringify({
          success: true,
          session: authData.session,
          warning: 'Backup code used. Please regenerate backup codes.',
        }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Step 6: Verify TOTP token
    const isValid = authenticator.verify({
      token: token!,
      secret: twoFAData.secret,
    });

    if (!isValid) {
      // Record failure
      await supabaseAdmin.rpc('record_2fa_failure', {
        p_user_id: authData.user.id,
      });

      // Sign out
      await supabaseAdmin.auth.signOut();

      return new Response(
        JSON.stringify({
          error: 'Invalid 2FA token',
          attempts_left: Math.max(0, 5 - (twoFAData.failed_attempts + 1)),
        }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Step 7: Success - reset failed attempts
    await supabaseAdmin
      .from('user_2fa')
      .update({
        last_used_at: new Date().toISOString(),
        failed_attempts: 0,
        locked_until: null,
      })
      .eq('user_id', authData.user.id);

    // Log success
    await supabaseAdmin.rpc('log_2fa_event', {
      p_user_id: authData.user.id,
      p_action: 'verified',
      p_success: true,
    });

    return new Response(
      JSON.stringify({
        success: true,
        session: authData.session,
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Error:', error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
