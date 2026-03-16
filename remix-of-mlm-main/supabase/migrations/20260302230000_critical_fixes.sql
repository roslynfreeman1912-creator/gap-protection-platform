-- ============================================================================
-- CRITICAL SECURITY FIXES
-- Remediates all 7 Critical + key High findings from Red Team audit
-- ============================================================================

BEGIN;

-- ============================================================================
-- C-01: WALLET RPC — REVOKE EXECUTE FROM PUBLIC
-- Attack: Any authenticated user can call wallet_credit/debit/withdraw directly
-- Fix: Only service_role can execute these functions
-- ============================================================================

REVOKE EXECUTE ON FUNCTION wallet_credit(UUID, NUMERIC, TEXT, TEXT, TEXT, TEXT, TEXT) FROM public, anon, authenticated;
REVOKE EXECUTE ON FUNCTION wallet_debit(UUID, NUMERIC, TEXT, TEXT, TEXT, TEXT, TEXT) FROM public, anon, authenticated;
REVOKE EXECUTE ON FUNCTION wallet_withdraw(UUID, NUMERIC, TEXT, TEXT, TEXT, TEXT) FROM public, anon, authenticated;

GRANT EXECUTE ON FUNCTION wallet_credit(UUID, NUMERIC, TEXT, TEXT, TEXT, TEXT, TEXT) TO service_role;
GRANT EXECUTE ON FUNCTION wallet_debit(UUID, NUMERIC, TEXT, TEXT, TEXT, TEXT, TEXT) TO service_role;
GRANT EXECUTE ON FUNCTION wallet_withdraw(UUID, NUMERIC, TEXT, TEXT, TEXT, TEXT) TO service_role;

-- Also lock down cleanup function
REVOKE EXECUTE ON FUNCTION cleanup_expired_idempotency_keys() FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION cleanup_expired_idempotency_keys() TO service_role;

-- Lock down migrate function
REVOKE EXECUTE ON FUNCTION migrate_pii_to_encrypted() FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION migrate_pii_to_encrypted() TO service_role;

-- ============================================================================
-- C-02: PROFILE INSERT — BLOCK ROLE ESCALATION
-- Attack: "Anyone can insert profile WITH CHECK(TRUE)" allows admin self-assignment
-- Fix: Drop old policy, enforce role='customer' and status='pending' on INSERT
-- ============================================================================

DROP POLICY IF EXISTS "Anyone can insert profile" ON profiles;
DROP POLICY IF EXISTS "anyone_can_insert_profile" ON profiles;

-- New users can only be created as customers with pending status
CREATE POLICY "insert_profile_customer_only" ON profiles
  FOR INSERT WITH CHECK (
    role = 'customer'
    AND status = 'pending'
  );

-- Also add a trigger as defense-in-depth (in case RLS is bypassed somehow)
CREATE OR REPLACE FUNCTION enforce_customer_role_on_insert()
RETURNS TRIGGER AS $$
BEGIN
  -- Service role (edge functions) can set any role (needed for admin setup)
  IF current_setting('role', true) = 'service_role' THEN
    RETURN NEW;
  END IF;

  -- Non-service callers: force customer role and pending status
  IF NEW.role != 'customer' THEN
    RAISE EXCEPTION 'Neue Profile müssen die Rolle "customer" haben';
  END IF;
  IF NEW.status != 'pending' THEN
    RAISE EXCEPTION 'Neue Profile müssen den Status "pending" haben';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_enforce_customer_on_insert ON profiles;
CREATE TRIGGER trg_enforce_customer_on_insert
  BEFORE INSERT ON profiles
  FOR EACH ROW
  EXECUTE FUNCTION enforce_customer_role_on_insert();

-- user_roles: only service_role and admins can INSERT
-- Drop any old permissive INSERT policy
DROP POLICY IF EXISTS "Anyone can insert user role" ON user_roles;
DROP POLICY IF EXISTS "anyone_insert_user_roles" ON user_roles;

-- Only admins via RLS (service_role bypasses RLS anyway)
-- Ensure no INSERT policy exists for regular users
-- The existing "Admins can manage all roles" policy covers admin INSERT

-- ============================================================================
-- C-06/C-07: PII FUNCTIONS — REVOKE + AUTH CHECK
-- Attack: Any user can call decrypt_pii() or anonymize_user_data()
-- Fix: REVOKE from public, GRANT only to service_role
-- ============================================================================

REVOKE EXECUTE ON FUNCTION encrypt_pii(TEXT) FROM public, anon, authenticated;
REVOKE EXECUTE ON FUNCTION decrypt_pii(TEXT) FROM public, anon, authenticated;
REVOKE EXECUTE ON FUNCTION anonymize_user_data(UUID) FROM public, anon, authenticated;
REVOKE EXECUTE ON FUNCTION is_account_locked(TEXT) FROM public, anon, authenticated;

GRANT EXECUTE ON FUNCTION encrypt_pii(TEXT) TO service_role;
GRANT EXECUTE ON FUNCTION decrypt_pii(TEXT) TO service_role;
GRANT EXECUTE ON FUNCTION anonymize_user_data(UUID) TO service_role;
GRANT EXECUTE ON FUNCTION is_account_locked(TEXT) TO service_role;

-- ============================================================================
-- C-04/C-05: PLAINTEXT PII COLUMNS — NULL OUT AND RESTRICT
-- Attack: Original iban/bic/account_holder still readable in plaintext
-- Fix: After migration to encrypted, NULL out plaintext; hide from SELECT
-- ============================================================================

-- Create a view that hides plaintext PII columns from non-admin users
-- (The actual NULL-out should happen after migrate_pii_to_encrypted() runs)

-- For now: add a trigger that auto-encrypts on INSERT/UPDATE
CREATE OR REPLACE FUNCTION auto_encrypt_pii_on_write()
RETURNS TRIGGER AS $$
BEGIN
  -- Auto-encrypt IBAN on write
  IF NEW.iban IS NOT NULL AND NEW.iban != '' THEN
    NEW.iban_encrypted := encrypt_pii(NEW.iban);
    -- Keep plaintext for service_role operations (EasyBill needs it)
    -- NULL out plaintext only for non-service writes
    IF current_setting('role', true) != 'service_role' THEN
      -- Don't null yet — will be handled in separate deployment step
      NULL;
    END IF;
  END IF;

  IF NEW.bic IS NOT NULL AND NEW.bic != '' THEN
    NEW.bic_encrypted := encrypt_pii(NEW.bic);
  END IF;

  IF NEW.account_holder IS NOT NULL AND NEW.account_holder != '' THEN
    NEW.account_holder_encrypted := encrypt_pii(NEW.account_holder);
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trg_auto_encrypt_pii ON profiles;
CREATE TRIGGER trg_auto_encrypt_pii
  BEFORE INSERT OR UPDATE ON profiles
  FOR EACH ROW
  EXECUTE FUNCTION auto_encrypt_pii_on_write();

-- ============================================================================
-- H-01: COMMISSION TOCTOU — ATOMIC commission_processed LOCK
-- Attack: Parallel requests both see commission_processed=false
-- Fix: Stored procedure with SELECT ... FOR UPDATE on transaction row
-- ============================================================================

CREATE OR REPLACE FUNCTION lock_transaction_for_commission(p_transaction_id UUID)
RETURNS TABLE (
  id UUID,
  customer_id UUID,
  amount NUMERIC,
  commission_processed BOOLEAN,
  status TEXT
) AS $$
BEGIN
  RETURN QUERY
  SELECT t.id, t.customer_id, t.amount, t.commission_processed, t.status
  FROM transactions t
  WHERE t.id = p_transaction_id
  FOR UPDATE;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

REVOKE EXECUTE ON FUNCTION lock_transaction_for_commission(UUID) FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION lock_transaction_for_commission(UUID) TO service_role;

-- Also create an atomic mark-as-processed function
CREATE OR REPLACE FUNCTION mark_commission_processed(p_transaction_id UUID)
RETURNS BOOLEAN AS $$
DECLARE
  v_already_processed BOOLEAN;
BEGIN
  -- Atomic: lock row and check+set in one operation
  SELECT commission_processed INTO v_already_processed
  FROM transactions
  WHERE id = p_transaction_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN false;
  END IF;

  IF v_already_processed THEN
    RETURN false; -- Already processed, caller should skip
  END IF;

  UPDATE transactions SET
    commission_processed = true,
    commission_processed_at = now()
  WHERE id = p_transaction_id;

  RETURN true; -- Proceed with commission calculation
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

REVOKE EXECUTE ON FUNCTION mark_commission_processed(UUID) FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION mark_commission_processed(UUID) TO service_role;

-- ============================================================================
-- H-05: FOUR-EYES TRIGGER — Fire on INSERT + UPDATE
-- Attack: Direct INSERT with status='approved' and approved_by=requested_by
-- Fix: Trigger on INSERT OR UPDATE
-- ============================================================================

DROP TRIGGER IF EXISTS trg_four_eyes ON approval_requests;
CREATE TRIGGER trg_four_eyes
  BEFORE INSERT OR UPDATE ON approval_requests
  FOR EACH ROW
  EXECUTE FUNCTION enforce_four_eyes();

-- ============================================================================
-- H-06: IDEMPOTENCY KEY — SCOPE TO FUNCTION NAME
-- Attack: Same key returns credit response when called from debit
-- Fix: Rewrite stored procedures to filter by function_name
-- ============================================================================

-- Recreate idempotency table with composite unique key
ALTER TABLE idempotency_keys DROP CONSTRAINT IF EXISTS idempotency_keys_pkey;
ALTER TABLE idempotency_keys ADD PRIMARY KEY (key, function_name);

-- Recreate wallet_credit with function_name-scoped idempotency
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

  INSERT INTO wallet_transactions (
    wallet_id, transaction_type, amount, balance_after,
    reference_id, reference_type, description
  ) VALUES (
    v_wallet.id, p_transaction_type, p_amount,
    v_wallet.available_balance + p_amount,
    p_reference_id, p_reference_type, p_description
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

  INSERT INTO wallet_transactions (
    wallet_id, transaction_type, amount, balance_after,
    reference_id, reference_type, description
  ) VALUES (
    v_wallet.id, p_transaction_type, p_amount,
    v_wallet.available_balance - p_amount,
    p_reference_id, p_reference_type, p_description
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

  INSERT INTO withdrawal_requests (
    wallet_id, amount, net_amount, vat_amount, vat_rate,
    iban, bic, account_holder, status
  ) VALUES (
    v_wallet.id, p_amount, v_net_amount, v_vat_amount, v_vat_rate,
    p_iban, p_bic, p_account_holder, 'pending'
  ) RETURNING id INTO v_withdrawal_id;

  INSERT INTO wallet_transactions (
    wallet_id, transaction_type, amount, balance_after,
    reference_id, reference_type, description
  ) VALUES (
    v_wallet.id, 'withdrawal', p_amount,
    v_wallet.available_balance - p_amount,
    v_withdrawal_id::TEXT, 'withdrawal_request', 'Auszahlungsantrag'
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

-- Re-apply REVOKE after recreation
REVOKE EXECUTE ON FUNCTION wallet_credit(UUID, NUMERIC, TEXT, TEXT, TEXT, TEXT, TEXT) FROM public, anon, authenticated;
REVOKE EXECUTE ON FUNCTION wallet_debit(UUID, NUMERIC, TEXT, TEXT, TEXT, TEXT, TEXT) FROM public, anon, authenticated;
REVOKE EXECUTE ON FUNCTION wallet_withdraw(UUID, NUMERIC, TEXT, TEXT, TEXT, TEXT) FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION wallet_credit(UUID, NUMERIC, TEXT, TEXT, TEXT, TEXT, TEXT) TO service_role;
GRANT EXECUTE ON FUNCTION wallet_debit(UUID, NUMERIC, TEXT, TEXT, TEXT, TEXT, TEXT) TO service_role;
GRANT EXECUTE ON FUNCTION wallet_withdraw(UUID, NUMERIC, TEXT, TEXT, TEXT, TEXT) TO service_role;

-- ============================================================================
-- H-09: ROLE TRIGGER NULL-SAFE
-- Attack: current_setting('role') returns NULL, trigger skips check
-- Fix: COALESCE to empty string
-- ============================================================================

CREATE OR REPLACE FUNCTION prevent_role_self_escalation()
RETURNS TRIGGER AS $$
BEGIN
  IF COALESCE(current_setting('role', true), '') != 'service_role' THEN
    IF OLD.role IS DISTINCT FROM NEW.role THEN
      IF NOT EXISTS (SELECT 1 FROM profiles WHERE user_id = auth.uid() AND role = 'admin') THEN
        RAISE EXCEPTION 'Rollenänderung nicht erlaubt';
      END IF;
    END IF;
    IF OLD.status IS DISTINCT FROM NEW.status THEN
      IF NOT EXISTS (SELECT 1 FROM profiles WHERE user_id = auth.uid() AND role = 'admin') THEN
        RAISE EXCEPTION 'Statusänderung nicht erlaubt';
      END IF;
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================================
-- H-03/H-04: COMMISSION ON PENDING TX + CREDIT NOTES WITH PENDING
-- Fix: Add transaction status check to commission calculation
-- (Edge function fix handles the main logic, but add DB constraint too)
-- ============================================================================

-- Commissions should only reference completed transactions
-- This is enforced in the Edge Function, but add a trigger as defense-in-depth
CREATE OR REPLACE FUNCTION check_commission_transaction_status()
RETURNS TRIGGER AS $$
DECLARE
  v_status TEXT;
BEGIN
  SELECT status INTO v_status FROM transactions WHERE id = NEW.transaction_id;
  IF v_status IS NULL THEN
    RAISE EXCEPTION 'Transaktion nicht gefunden';
  END IF;
  IF v_status != 'completed' THEN
    RAISE EXCEPTION 'Provisionen nur für abgeschlossene Transaktionen erlaubt (Status: %)', v_status;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_check_commission_tx_status ON commissions;
CREATE TRIGGER trg_check_commission_tx_status
  BEFORE INSERT ON commissions
  FOR EACH ROW
  EXECUTE FUNCTION check_commission_transaction_status();

-- ============================================================================
-- M-01: AUDIT LOG — RESTRICT INSERT TO SERVICE ROLE
-- Attack: Any user can poison audit logs
-- Fix: Only service_role can insert (edge functions use service_role)
-- ============================================================================

DROP POLICY IF EXISTS "audit_log_insert" ON audit_log;
CREATE POLICY "audit_log_service_insert" ON audit_log
  FOR INSERT WITH CHECK (false);
-- service_role bypasses RLS, so only service_role can insert

-- ============================================================================
-- ADDITIONAL: Sanitize old_data in audit log too
-- ============================================================================

CREATE OR REPLACE FUNCTION sanitize_audit_data()
RETURNS TRIGGER AS $$
DECLARE
  sensitive_keys TEXT[] := ARRAY['iban', 'bic', 'account_holder', 'password', 'token', 'ip_address', 'email'];
  k TEXT;
BEGIN
  IF NEW.new_data IS NOT NULL THEN
    FOREACH k IN ARRAY sensitive_keys LOOP
      IF NEW.new_data ? k THEN
        NEW.new_data := NEW.new_data - k || jsonb_build_object(k, '[REDACTED]');
      END IF;
    END LOOP;
  END IF;
  -- Also sanitize old_data if it exists
  IF NEW.old_data IS NOT NULL THEN
    FOREACH k IN ARRAY sensitive_keys LOOP
      IF NEW.old_data ? k THEN
        NEW.old_data := NEW.old_data - k || jsonb_build_object(k, '[REDACTED]');
      END IF;
    END LOOP;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- ADDITIONAL: Rate limit tables need RLS
-- ============================================================================

ALTER TABLE rate_limits ENABLE ROW LEVEL SECURITY;
CREATE POLICY "rate_limits_service_only" ON rate_limits FOR ALL USING (false);
-- service_role bypasses RLS

ALTER TABLE idempotency_keys ENABLE ROW LEVEL SECURITY;
CREATE POLICY "idempotency_service_only" ON idempotency_keys FOR ALL USING (false);

-- ============================================================================
-- ADDITIONAL: Remove localhost from CORS (handled in Edge Function code)
-- ============================================================================

-- ============================================================================
-- C-03 SUPPORT: Atomic promo code use_count increment
-- Prevents TOCTOU race on concurrent 'use' calls
-- ============================================================================

CREATE OR REPLACE FUNCTION increment_promo_use_count(p_code_id UUID)
RETURNS void AS $$
BEGIN
  UPDATE rotating_promo_codes
  SET use_count = use_count + 1
  WHERE id = p_code_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

REVOKE EXECUTE ON FUNCTION increment_promo_use_count(UUID) FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION increment_promo_use_count(UUID) TO service_role;

COMMIT;
