-- ============================================================================
-- COMPREHENSIVE SCHEMA FIX MIGRATION
-- Fixes CRITICAL issues found in full schema audit:
--   1. Re-GRANT SECURITY DEFINER helper functions to authenticated (RLS depends on them)
--   2. Fix wallet functions missing profile_id in INSERTs
--   3. Create missing RPCs (increment_partner_promo_usage)
--   4. Fix wrong column names in indexes
-- ============================================================================

BEGIN;

-- ============================================================================
-- FIX 1: RE-GRANT SECURITY DEFINER FUNCTIONS TO AUTHENTICATED
--
-- The structural_hardening migration (20260302240000) REVOKED execute on
-- is_admin(), get_profile_id(), has_role(), is_callcenter(), is_super_admin(),
-- is_admin_user(), check_is_admin() from the 'authenticated' role.
--
-- PROBLEM: 30+ RLS policies call these SECURITY DEFINER functions.
-- RLS policies evaluate in the caller's role context. When authenticated
-- users query tables, the RLS policy calls e.g. is_admin(), but since
-- execute was revoked, the call fails → table returns 0 rows → "Profil
-- nicht gefunden" and all other data inaccessible.
--
-- SECURITY NOTE: These functions are SECURITY DEFINER with SET search_path,
-- so they are safe to call from authenticated context. They only return
-- boolean and cannot leak data. Revoking them broke the entire RLS layer.
-- ============================================================================

-- is_admin() — used by RLS on wallets, wallet_transactions, withdrawal_requests,
--   volume_tracking, rank_history, bonus_payouts, groups, user_groups, ranks,
--   pool_config, pool_payouts, call_centers, leads, billing_config, daily_revenue,
--   support_tickets, chat_messages, rotating_promo_codes, customer_scans,
--   commission_matrix, credit_notes, cc_commissions, protected_domains,
--   waf_rules, dns_records, ssl_certificates, page_rules, ip_access_rules,
--   rate_limit_rules, cache_settings, firewall_analytics, bot_management_config,
--   ddos_protection_config, security tables, etc.
DO $$ BEGIN
  GRANT EXECUTE ON FUNCTION is_admin() TO authenticated;
EXCEPTION WHEN undefined_function THEN NULL;
END $$;

-- is_admin_user() — used by RLS on profiles (admin view/update policies)
DO $$ BEGIN
  GRANT EXECUTE ON FUNCTION is_admin_user() TO authenticated;
EXCEPTION WHEN undefined_function THEN NULL;
END $$;

-- check_is_admin() — alternative admin check used in some policies
DO $$ BEGIN
  GRANT EXECUTE ON FUNCTION check_is_admin() TO authenticated;
EXCEPTION WHEN undefined_function THEN NULL;
END $$;

-- has_role(UUID, app_role) — used by several RLS policies
DO $$ BEGIN
  GRANT EXECUTE ON FUNCTION has_role(UUID, app_role) TO authenticated;
EXCEPTION WHEN undefined_function THEN NULL;
END $$;

-- get_profile_id(UUID) — used by RLS on wallet_transactions, withdrawal_requests,
--   volume_tracking, rank_history, bonus_payouts, protected_domains, etc.
DO $$ BEGIN
  GRANT EXECUTE ON FUNCTION get_profile_id(UUID) TO authenticated;
EXCEPTION WHEN undefined_function THEN NULL;
END $$;

-- is_super_admin() — used by some RLS policies
DO $$ BEGIN
  GRANT EXECUTE ON FUNCTION is_super_admin() TO authenticated;
EXCEPTION WHEN undefined_function THEN NULL;
END $$;

-- is_callcenter() — used by RLS on call center tables
DO $$ BEGIN
  GRANT EXECUTE ON FUNCTION is_callcenter() TO authenticated;
EXCEPTION WHEN undefined_function THEN NULL;
END $$;

-- check_scan_rate_limit(TEXT) — used by light-scan edge function
DO $$ BEGIN
  GRANT EXECUTE ON FUNCTION check_scan_rate_limit(TEXT) TO authenticated;
EXCEPTION WHEN undefined_function THEN NULL;
END $$;

-- ============================================================================
-- FIX 2: WALLET FUNCTIONS — ADD MISSING profile_id TO INSERTs
--
-- wallet_transactions table has profile_id UUID NOT NULL, but wallet_credit,
-- wallet_debit, wallet_withdraw all omit it → INSERT fails at runtime.
-- withdrawal_requests also has profile_id NOT NULL but wallet_withdraw omits it.
-- Also: reference_id is UUID in the table but functions pass TEXT → fix cast.
-- ============================================================================

-- wallet_credit: fixed to include profile_id
CREATE OR REPLACE FUNCTION wallet_credit(
  p_profile_id UUID,
  p_amount NUMERIC,
  p_transaction_type TEXT,
  p_reference_id TEXT DEFAULT NULL,
  p_reference_type TEXT DEFAULT NULL,
  p_description TEXT DEFAULT NULL,
  p_idempotency_key TEXT DEFAULT NULL
) RETURNS JSONB AS $$
DECLARE
  v_wallet wallets%ROWTYPE;
  v_tx_id UUID;
  v_existing JSONB;
  v_func_name TEXT := 'wallet_credit';
  v_ref_uuid UUID;
BEGIN
  -- Check idempotency (scoped to function name)
  IF p_idempotency_key IS NOT NULL THEN
    SELECT response_body INTO v_existing
    FROM idempotency_keys
    WHERE key = p_idempotency_key AND function_name = v_func_name AND expires_at > now();
    IF FOUND THEN
      RETURN v_existing;
    END IF;
  END IF;

  IF p_amount <= 0 OR p_amount > 1000000 THEN
    RAISE EXCEPTION 'Ungültiger Betrag (muss > 0 und <= 1.000.000 sein)';
  END IF;

  -- Safe cast reference_id TEXT → UUID (NULL if not valid UUID)
  BEGIN
    v_ref_uuid := p_reference_id::UUID;
  EXCEPTION WHEN invalid_text_representation THEN
    v_ref_uuid := NULL;
  END;

  -- Lock wallet row
  SELECT * INTO v_wallet FROM wallets
    WHERE profile_id = p_profile_id
    FOR UPDATE;

  IF NOT FOUND THEN
    INSERT INTO wallets (profile_id, available_balance, pending_balance, total_earned, total_withdrawn)
    VALUES (p_profile_id, 0, 0, 0, 0)
    RETURNING * INTO v_wallet;
  END IF;

  UPDATE wallets SET
    available_balance = available_balance + p_amount,
    total_earned = total_earned + p_amount,
    updated_at = now()
  WHERE id = v_wallet.id;

  -- Fixed: include profile_id + safe UUID cast for reference_id
  INSERT INTO wallet_transactions (
    wallet_id, profile_id, transaction_type, amount, balance_after,
    reference_id, reference_type, description
  ) VALUES (
    v_wallet.id, p_profile_id, p_transaction_type, p_amount,
    v_wallet.available_balance + p_amount,
    v_ref_uuid, p_reference_type, p_description
  ) RETURNING id INTO v_tx_id;

  IF p_idempotency_key IS NOT NULL THEN
    INSERT INTO idempotency_keys (key, function_name, response_status, response_body)
    VALUES (p_idempotency_key, v_func_name, 200,
      jsonb_build_object('success', true, 'transaction_id', v_tx_id, 'new_balance', v_wallet.available_balance + p_amount))
    ON CONFLICT (key, function_name) DO NOTHING;
  END IF;

  RETURN jsonb_build_object(
    'success', true,
    'transaction_id', v_tx_id,
    'new_balance', v_wallet.available_balance + p_amount
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- wallet_debit: fixed to include profile_id
CREATE OR REPLACE FUNCTION wallet_debit(
  p_profile_id UUID,
  p_amount NUMERIC,
  p_transaction_type TEXT,
  p_reference_id TEXT DEFAULT NULL,
  p_reference_type TEXT DEFAULT NULL,
  p_description TEXT DEFAULT NULL,
  p_idempotency_key TEXT DEFAULT NULL
) RETURNS JSONB AS $$
DECLARE
  v_wallet wallets%ROWTYPE;
  v_tx_id UUID;
  v_existing JSONB;
  v_func_name TEXT := 'wallet_debit';
  v_ref_uuid UUID;
BEGIN
  IF p_idempotency_key IS NOT NULL THEN
    SELECT response_body INTO v_existing
    FROM idempotency_keys
    WHERE key = p_idempotency_key AND function_name = v_func_name AND expires_at > now();
    IF FOUND THEN
      RETURN v_existing;
    END IF;
  END IF;

  IF p_amount <= 0 OR p_amount > 1000000 THEN
    RAISE EXCEPTION 'Ungültiger Betrag';
  END IF;

  -- Safe cast reference_id TEXT → UUID
  BEGIN
    v_ref_uuid := p_reference_id::UUID;
  EXCEPTION WHEN invalid_text_representation THEN
    v_ref_uuid := NULL;
  END;

  SELECT * INTO v_wallet FROM wallets
    WHERE profile_id = p_profile_id
    FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Wallet nicht gefunden';
  END IF;

  IF v_wallet.available_balance < p_amount THEN
    RAISE EXCEPTION 'Unzureichendes Guthaben. Verfügbar: %, Angefordert: %',
      v_wallet.available_balance, p_amount;
  END IF;

  UPDATE wallets SET
    available_balance = available_balance - p_amount,
    updated_at = now()
  WHERE id = v_wallet.id;

  -- Fixed: include profile_id + safe UUID cast
  INSERT INTO wallet_transactions (
    wallet_id, profile_id, transaction_type, amount, balance_after,
    reference_id, reference_type, description
  ) VALUES (
    v_wallet.id, p_profile_id, p_transaction_type, p_amount,
    v_wallet.available_balance - p_amount,
    v_ref_uuid, p_reference_type, p_description
  ) RETURNING id INTO v_tx_id;

  IF p_idempotency_key IS NOT NULL THEN
    INSERT INTO idempotency_keys (key, function_name, response_status, response_body)
    VALUES (p_idempotency_key, v_func_name, 200,
      jsonb_build_object('success', true, 'transaction_id', v_tx_id, 'new_balance', v_wallet.available_balance - p_amount))
    ON CONFLICT (key, function_name) DO NOTHING;
  END IF;

  RETURN jsonb_build_object(
    'success', true,
    'transaction_id', v_tx_id,
    'new_balance', v_wallet.available_balance - p_amount
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- wallet_withdraw: fixed to include profile_id in both tables
CREATE OR REPLACE FUNCTION wallet_withdraw(
  p_profile_id UUID,
  p_amount NUMERIC,
  p_iban TEXT DEFAULT NULL,
  p_bic TEXT DEFAULT NULL,
  p_account_holder TEXT DEFAULT NULL,
  p_idempotency_key TEXT DEFAULT NULL
) RETURNS JSONB AS $$
DECLARE
  v_wallet wallets%ROWTYPE;
  v_withdrawal_id UUID;
  v_existing JSONB;
  v_vat_rate NUMERIC := 19;
  v_net_amount NUMERIC;
  v_vat_amount NUMERIC;
  v_func_name TEXT := 'wallet_withdraw';
BEGIN
  IF p_idempotency_key IS NOT NULL THEN
    SELECT response_body INTO v_existing
    FROM idempotency_keys
    WHERE key = p_idempotency_key AND function_name = v_func_name AND expires_at > now();
    IF FOUND THEN
      RETURN v_existing;
    END IF;
  END IF;

  IF p_amount < 50 OR p_amount > 1000000 THEN
    RAISE EXCEPTION 'Betrag muss zwischen 50€ und 1.000.000€ liegen';
  END IF;

  SELECT * INTO v_wallet FROM wallets
    WHERE profile_id = p_profile_id
    FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Wallet nicht gefunden';
  END IF;

  IF v_wallet.available_balance < p_amount THEN
    RAISE EXCEPTION 'Unzureichendes Guthaben';
  END IF;

  v_net_amount := ROUND(p_amount / (1 + v_vat_rate / 100), 2);
  v_vat_amount := p_amount - v_net_amount;

  UPDATE wallets SET
    available_balance = available_balance - p_amount,
    pending_balance = pending_balance + p_amount,
    updated_at = now()
  WHERE id = v_wallet.id;

  -- Fixed: include profile_id
  INSERT INTO withdrawal_requests (
    profile_id, wallet_id, amount, net_amount, vat_amount, vat_rate,
    iban, bic, account_holder, status
  ) VALUES (
    p_profile_id, v_wallet.id, p_amount, v_net_amount, v_vat_amount, v_vat_rate,
    p_iban, p_bic, p_account_holder, 'pending'
  ) RETURNING id INTO v_withdrawal_id;

  -- Fixed: include profile_id + proper UUID for reference_id
  INSERT INTO wallet_transactions (
    wallet_id, profile_id, transaction_type, amount, balance_after,
    reference_id, reference_type, description
  ) VALUES (
    v_wallet.id, p_profile_id, 'withdrawal', p_amount,
    v_wallet.available_balance - p_amount,
    v_withdrawal_id, 'withdrawal_request', 'Auszahlungsantrag'
  );

  IF p_idempotency_key IS NOT NULL THEN
    INSERT INTO idempotency_keys (key, function_name, response_status, response_body)
    VALUES (p_idempotency_key, v_func_name, 200,
      jsonb_build_object('success', true, 'withdrawal_id', v_withdrawal_id))
    ON CONFLICT (key, function_name) DO NOTHING;
  END IF;

  RETURN jsonb_build_object(
    'success', true,
    'withdrawal_id', v_withdrawal_id,
    'amount', p_amount,
    'net_amount', v_net_amount,
    'vat_amount', v_vat_amount
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Re-apply REVOKE/GRANT for wallet functions (service_role only)
REVOKE EXECUTE ON FUNCTION wallet_credit(UUID, NUMERIC, TEXT, TEXT, TEXT, TEXT, TEXT) FROM public, anon, authenticated;
REVOKE EXECUTE ON FUNCTION wallet_debit(UUID, NUMERIC, TEXT, TEXT, TEXT, TEXT, TEXT) FROM public, anon, authenticated;
REVOKE EXECUTE ON FUNCTION wallet_withdraw(UUID, NUMERIC, TEXT, TEXT, TEXT, TEXT) FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION wallet_credit(UUID, NUMERIC, TEXT, TEXT, TEXT, TEXT, TEXT) TO service_role;
GRANT EXECUTE ON FUNCTION wallet_debit(UUID, NUMERIC, TEXT, TEXT, TEXT, TEXT, TEXT) TO service_role;
GRANT EXECUTE ON FUNCTION wallet_withdraw(UUID, NUMERIC, TEXT, TEXT, TEXT, TEXT) TO service_role;


-- ============================================================================
-- FIX 3: CREATE MISSING RPC — increment_partner_promo_usage
--
-- Called in supabase/functions/register/index.ts line 278 but never defined.
-- Atomically increments usage_count on partner promotion_codes table.
-- ============================================================================

CREATE OR REPLACE FUNCTION increment_partner_promo_usage(p_code TEXT)
RETURNS void AS $$
BEGIN
  UPDATE promotion_codes
  SET usage_count = COALESCE(usage_count, 0) + 1
  WHERE code = p_code AND is_active = true;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

REVOKE EXECUTE ON FUNCTION increment_partner_promo_usage(TEXT) FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION increment_partner_promo_usage(TEXT) TO service_role;


-- ============================================================================
-- FIX 4: CORRECT INDEXES WITH WRONG COLUMN NAMES
--
-- The structural_hardening migration created indexes on non-existent columns
-- (silently failed due to EXCEPTION handlers). Create them on correct columns.
-- ============================================================================

-- support_tickets uses profile_id, not user_id
DO $$ BEGIN
  DROP INDEX IF EXISTS idx_support_tickets_user_id;
  CREATE INDEX IF NOT EXISTS idx_support_tickets_profile_id
    ON support_tickets(profile_id);
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

-- chat_messages uses profile_id, not user_id
DO $$ BEGIN
  DROP INDEX IF EXISTS idx_chat_messages_user_id;
  CREATE INDEX IF NOT EXISTS idx_chat_messages_profile_id
    ON chat_messages(profile_id);
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

-- security_tests has domain TEXT, not domain_id UUID
DO $$ BEGIN
  DROP INDEX IF EXISTS idx_security_tests_domain_id;
  CREATE INDEX IF NOT EXISTS idx_security_tests_domain
    ON security_tests(domain);
EXCEPTION WHEN OTHERS THEN NULL;
END $$;


-- ============================================================================
-- FIX 5: ENSURE profiles RLS POLICIES ARE INTACT
--
-- After all the hardening migrations, verify the basic "users can read own
-- profile" policy exists. This is the root policy that AuthContext needs.
-- ============================================================================

-- Drop and recreate to ensure clean state
DO $$ BEGIN
  DROP POLICY IF EXISTS "Users can view own profile" ON profiles;
  CREATE POLICY "Users can view own profile"
    ON profiles FOR SELECT
    TO authenticated
    USING (auth.uid() = user_id);
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

DO $$ BEGIN
  DROP POLICY IF EXISTS "Users can update own profile" ON profiles;
  CREATE POLICY "Users can update own profile"
    ON profiles FOR UPDATE
    TO authenticated
    USING (auth.uid() = user_id);
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

-- Admin view policy (uses SECURITY DEFINER function, safe with re-granted perms)
DO $$ BEGIN
  DROP POLICY IF EXISTS "Admins can view all profiles" ON profiles;
  CREATE POLICY "Admins can view all profiles"
    ON profiles FOR SELECT
    TO authenticated
    USING (public.is_admin_user());
EXCEPTION WHEN OTHERS THEN NULL;
END $$;


COMMIT;
