// ═══════════════════════════════════════════════════════════════
// 🔐 2FA Setup Function
// ═══════════════════════════════════════════════════════════════

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";
import { authenticator } from "npm:otplib@12.0.1";
import QRCode from "npm:qrcode@1.5.3";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  // Handle CORS
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Create Supabase client
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      {
        global: {
          headers: { Authorization: req.headers.get('Authorization')! },
        },
      }
    );

    // Get authenticated user
    const {
      data: { user },
      error: authError,
    } = await supabaseClient.auth.getUser();

    if (authError || !user) {
      return new Response(
        JSON.stringify({ error: 'Unauthorized' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const { action } = await req.json();

    // ═══ Generate 2FA Secret ═══
    if (action === 'generate_secret') {
      const secret = authenticator.generateSecret();
      
      // Generate backup codes
      const backupCodes = Array.from({ length: 10 }, () =>
        Math.random().toString(36).substring(2, 10).toUpperCase()
      );

      // Save to database
      const { error: dbError } = await supabaseClient
        .from('user_2fa')
        .upsert({
          user_id: user.id,
          secret: secret,
          enabled: false,
          backup_codes: backupCodes,
        });

      if (dbError) {
        throw new Error(`Database error: ${dbError.message}`);
      }

      // Generate QR code
      const otpauth = authenticator.keyuri(
        user.email!,
        'GAP Protection',
        secret
      );

      const qrCode = await QRCode.toDataURL(otpauth);

      return new Response(
        JSON.stringify({
          secret,
          qrCode,
          backupCodes,
        }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // ═══ Verify and Enable 2FA ═══

    if (action === 'verify_and_enable') {
      const { token } = await req.json();

      // Get 2FA data
      const { data: twoFAData, error: fetchError } = await supabaseClient
        .from('user_2fa')
        .select('secret')
        .eq('user_id', user.id)
        .single();

      if (fetchError || !twoFAData) {
        return new Response(
          JSON.stringify({ error: '2FA not set up' }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      // Verify token
      const isValid = authenticator.verify({
        token,
        secret: twoFAData.secret,
      });

      if (!isValid) {
        return new Response(
          JSON.stringify({ error: 'Invalid token' }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      // Enable 2FA
      const { error: updateError } = await supabaseClient
        .from('user_2fa')
        .update({
          enabled: true,
          enabled_at: new Date().toISOString(),
          failed_attempts: 0,
          locked_until: null,
        })
        .eq('user_id', user.id);

      if (updateError) {
        throw new Error(`Failed to enable 2FA: ${updateError.message}`);
      }

      // Log event
      await supabaseClient.rpc('log_2fa_event', {
        p_user_id: user.id,
        p_action: 'enabled',
        p_success: true,
      });

      return new Response(
        JSON.stringify({ success: true, message: '2FA enabled successfully' }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // ═══ Disable 2FA ═══
    if (action === 'disable') {
      const { password } = await req.json();

      // Verify password
      const { error: signInError } = await supabaseClient.auth.signInWithPassword({
        email: user.email!,
        password,
      });

      if (signInError) {
        return new Response(
          JSON.stringify({ error: 'Invalid password' }),
          { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      // Disable 2FA
      const { error: deleteError } = await supabaseClient
        .from('user_2fa')
        .delete()
        .eq('user_id', user.id);

      if (deleteError) {
        throw new Error(`Failed to disable 2FA: ${deleteError.message}`);
      }

      // Log event
      await supabaseClient.rpc('log_2fa_event', {
        p_user_id: user.id,
        p_action: 'disabled',
        p_success: true,
      });

      return new Response(
        JSON.stringify({ success: true, message: '2FA disabled successfully' }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // ═══ Get 2FA Status ═══
    if (action === 'status') {
      const { data: twoFAData } = await supabaseClient
        .from('user_2fa')
        .select('enabled, enabled_at, last_used_at, failed_attempts, locked_until')
        .eq('user_id', user.id)
        .single();

      return new Response(
        JSON.stringify({
          enabled: twoFAData?.enabled || false,
          enabled_at: twoFAData?.enabled_at,
          last_used_at: twoFAData?.last_used_at,
          is_locked: twoFAData?.locked_until ? new Date(twoFAData.locked_until) > new Date() : false,
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
