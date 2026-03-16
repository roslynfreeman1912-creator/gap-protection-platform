-- ============================================================================
-- SECURITY HARDENING MIGRATION
-- Phase 1B: CHECK constraints, UNIQUE constraints, FK integrity, audit protection
-- Phase 1C: Wallet stored procedures with SELECT ... FOR UPDATE
-- Phase 1D: RLS rewrite & role self-escalation block
-- Phase 2:  Idempotency keys, double-spend prevention
-- ============================================================================

BEGIN;

-- ============================================================================
-- 1. BLOCK ROLE SELF-ESCALATION ON PROFILES
-- Users must NOT be able to update their own role or status
-- ============================================================================

-- Drop any existing permissive update policy on profiles
DROP POLICY IF EXISTS "Users can update own profile" ON profiles;
DROP POLICY IF EXISTS "users_update_own" ON profiles;

-- Recreate: users can update their own profile but NOT role/status fields
CREATE POLICY "users_update_own_safe" ON profiles
  FOR UPDATE USING (
    user_id = auth.uid()
  )
  WITH CHECK (
    user_id = auth.uid()
    AND role = (SELECT p.role FROM profiles p WHERE p.user_id = auth.uid())
    AND status = (SELECT p.status FROM profiles p WHERE p.user_id = auth.uid())
  );

-- Admin update policy (admins can change any profile including role/status)
DROP POLICY IF EXISTS "Admins can update all profiles" ON profiles;
CREATE POLICY "admins_update_all" ON profiles
  FOR UPDATE USING (
    EXISTS (SELECT 1 FROM profiles p WHERE p.user_id = auth.uid() AND p.role = 'admin')
  );

-- ============================================================================
-- 2. CHECK CONSTRAINTS ON FINANCIAL TABLES
-- ============================================================================

-- Wallets: balances must be non-negative
ALTER TABLE wallets
  ADD CONSTRAINT chk_wallet_available_balance CHECK (available_balance >= 0),
  ADD CONSTRAINT chk_wallet_pending_balance CHECK (pending_balance >= 0),
  ADD CONSTRAINT chk_wallet_total_earned CHECK (total_earned >= 0),
  ADD CONSTRAINT chk_wallet_total_withdrawn CHECK (total_withdrawn >= 0);

-- Wallet transactions: amounts must be positive
ALTER TABLE wallet_transactions
  ADD CONSTRAINT chk_wallet_tx_amount CHECK (amount > 0);

-- Transactions: amount must be positive
ALTER TABLE transactions
  ADD CONSTRAINT chk_transaction_amount CHECK (amount > 0);

-- Commissions: amounts must be non-negative
ALTER TABLE commissions
  ADD CONSTRAINT chk_commission_amount CHECK (commission_amount >= 0),
  ADD CONSTRAINT chk_commission_base_amount CHECK (base_amount >= 0);

-- Credit notes: amounts must be non-negative
ALTER TABLE credit_notes
  ADD CONSTRAINT chk_cn_net_amount CHECK (net_amount >= 0),
  ADD CONSTRAINT chk_cn_vat_amount CHECK (vat_amount >= 0),
  ADD CONSTRAINT chk_cn_gross_amount CHECK (gross_amount >= 0);

-- Withdrawal requests: amounts must be positive with minimum
ALTER TABLE withdrawal_requests
  ADD CONSTRAINT chk_withdrawal_amount CHECK (amount >= 50);

-- Pool payouts: amounts must be non-negative
ALTER TABLE pool_payouts
  ADD CONSTRAINT chk_pool_payout_amount CHECK (payout_amount >= 0),
  ADD CONSTRAINT chk_pool_share_value CHECK (share_value >= 0);

-- CC commissions: amounts must be non-negative
ALTER TABLE cc_commissions
  ADD CONSTRAINT chk_cc_commission_amount CHECK (commission_amount >= 0),
  ADD CONSTRAINT chk_cc_base_amount CHECK (base_amount >= 0);

-- ============================================================================
-- 3. UNIQUE CONSTRAINTS TO PREVENT DUPLICATES
-- ============================================================================

-- One wallet per profile
CREATE UNIQUE INDEX IF NOT EXISTS idx_wallets_profile_unique ON wallets (profile_id);

-- One commission per transaction+partner+level (prevent duplicate commissions)
CREATE UNIQUE INDEX IF NOT EXISTS idx_commissions_tx_partner_level
  ON commissions (transaction_id, partner_id, level_number);

-- One pool payout per user per period
CREATE UNIQUE INDEX IF NOT EXISTS idx_pool_payouts_user_period
  ON pool_payouts (user_id, period_month);

-- Promotion codes must be unique
CREATE UNIQUE INDEX IF NOT EXISTS idx_promo_codes_unique ON promotion_codes (code);

-- One CC commission per transaction+employee+type
CREATE UNIQUE INDEX IF NOT EXISTS idx_cc_commissions_tx_emp_type
  ON cc_commissions (transaction_id, employee_id, commission_type);

-- ============================================================================
-- 4. AUDIT LOG PROTECTION (append-only)
-- ============================================================================

-- Revoke UPDATE and DELETE on audit_log from all roles except service_role
ALTER TABLE audit_log ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "audit_log_insert_only" ON audit_log;
DROP POLICY IF EXISTS "audit_log_admin_read" ON audit_log;
DROP POLICY IF EXISTS "Admins can view audit log" ON audit_log;

-- Anyone authenticated can insert audit entries
CREATE POLICY "audit_log_insert" ON audit_log
  FOR INSERT WITH CHECK (true);

-- Only admins can read audit entries
CREATE POLICY "audit_log_admin_read" ON audit_log
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM profiles p WHERE p.user_id = auth.uid() AND p.role = 'admin')
  );

-- No UPDATE or DELETE policies = append-only for non-service-role

-- ============================================================================
-- 5. IDEMPOTENCY TABLE FOR FINANCIAL OPERATIONS
-- ============================================================================

CREATE TABLE IF NOT EXISTS idempotency_keys (
  key TEXT PRIMARY KEY,
  function_name TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  response_status INT,
  response_body JSONB,
  expires_at TIMESTAMPTZ NOT NULL DEFAULT (now() + interval '24 hours')
);

CREATE INDEX IF NOT EXISTS idx_idempotency_expires ON idempotency_keys (expires_at);

-- Auto-cleanup expired keys
CREATE OR REPLACE FUNCTION cleanup_expired_idempotency_keys()
RETURNS void AS $$
BEGIN
  DELETE FROM idempotency_keys WHERE expires_at < now();
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================================
-- 6. WALLET STORED PROCEDURES (atomic operations with SELECT ... FOR UPDATE)
-- ============================================================================

-- Atomic wallet credit
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
BEGIN
  -- Check idempotency
  IF p_idempotency_key IS NOT NULL THEN
    SELECT response_body INTO v_existing
    FROM idempotency_keys
    WHERE key = p_idempotency_key AND expires_at > now();
    IF FOUND THEN
      RETURN v_existing;
    END IF;
  END IF;

  -- Validate amount
  IF p_amount <= 0 THEN
    RAISE EXCEPTION 'Betrag muss positiv sein';
  END IF;

  -- Lock wallet row
  SELECT * INTO v_wallet FROM wallets
    WHERE profile_id = p_profile_id
    FOR UPDATE;

  IF NOT FOUND THEN
    -- Create wallet if it doesn't exist
    INSERT INTO wallets (profile_id, available_balance, pending_balance, total_earned, total_withdrawn)
    VALUES (p_profile_id, 0, 0, 0, 0)
    RETURNING * INTO v_wallet;
  END IF;

  -- Update balance
  UPDATE wallets SET
    available_balance = available_balance + p_amount,
    total_earned = total_earned + p_amount,
    updated_at = now()
  WHERE id = v_wallet.id;

  -- Create transaction record
  INSERT INTO wallet_transactions (
    wallet_id, transaction_type, amount, balance_after,
    reference_id, reference_type, description
  ) VALUES (
    v_wallet.id, p_transaction_type, p_amount,
    v_wallet.available_balance + p_amount,
    p_reference_id, p_reference_type, p_description
  ) RETURNING id INTO v_tx_id;

  -- Store idempotency result
  IF p_idempotency_key IS NOT NULL THEN
    INSERT INTO idempotency_keys (key, function_name, response_status, response_body)
    VALUES (p_idempotency_key, 'wallet_credit', 200,
      jsonb_build_object('success', true, 'transaction_id', v_tx_id, 'new_balance', v_wallet.available_balance + p_amount))
    ON CONFLICT (key) DO NOTHING;
  END IF;

  RETURN jsonb_build_object(
    'success', true,
    'transaction_id', v_tx_id,
    'new_balance', v_wallet.available_balance + p_amount
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Atomic wallet debit (with double-spend prevention)
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
BEGIN
  -- Check idempotency
  IF p_idempotency_key IS NOT NULL THEN
    SELECT response_body INTO v_existing
    FROM idempotency_keys
    WHERE key = p_idempotency_key AND expires_at > now();
    IF FOUND THEN
      RETURN v_existing;
    END IF;
  END IF;

  IF p_amount <= 0 THEN
    RAISE EXCEPTION 'Betrag muss positiv sein';
  END IF;

  -- Lock wallet row (prevents double-spend)
  SELECT * INTO v_wallet FROM wallets
    WHERE profile_id = p_profile_id
    FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Wallet nicht gefunden';
  END IF;

  -- Check sufficient balance
  IF v_wallet.available_balance < p_amount THEN
    RAISE EXCEPTION 'Unzureichendes Guthaben. Verfügbar: %, Angefordert: %',
      v_wallet.available_balance, p_amount;
  END IF;

  -- Deduct
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
    VALUES (p_idempotency_key, 'wallet_debit', 200,
      jsonb_build_object('success', true, 'transaction_id', v_tx_id, 'new_balance', v_wallet.available_balance - p_amount))
    ON CONFLICT (key) DO NOTHING;
  END IF;

  RETURN jsonb_build_object(
    'success', true,
    'transaction_id', v_tx_id,
    'new_balance', v_wallet.available_balance - p_amount
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Atomic withdrawal request
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
BEGIN
  IF p_idempotency_key IS NOT NULL THEN
    SELECT response_body INTO v_existing
    FROM idempotency_keys
    WHERE key = p_idempotency_key AND expires_at > now();
    IF FOUND THEN
      RETURN v_existing;
    END IF;
  END IF;

  IF p_amount < 50 THEN
    RAISE EXCEPTION 'Mindestbetrag für Auszahlungen: 50€';
  END IF;

  -- Lock wallet
  SELECT * INTO v_wallet FROM wallets
    WHERE profile_id = p_profile_id
    FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Wallet nicht gefunden';
  END IF;

  IF v_wallet.available_balance < p_amount THEN
    RAISE EXCEPTION 'Unzureichendes Guthaben';
  END IF;

  -- Calculate VAT
  v_net_amount := ROUND(p_amount / (1 + v_vat_rate / 100), 2);
  v_vat_amount := p_amount - v_net_amount;

  -- Deduct from wallet
  UPDATE wallets SET
    available_balance = available_balance - p_amount,
    pending_balance = pending_balance + p_amount,
    updated_at = now()
  WHERE id = v_wallet.id;

  -- Create withdrawal request
  INSERT INTO withdrawal_requests (
    wallet_id, amount, net_amount, vat_amount, vat_rate,
    iban, bic, account_holder, status
  ) VALUES (
    v_wallet.id, p_amount, v_net_amount, v_vat_amount, v_vat_rate,
    p_iban, p_bic, p_account_holder, 'pending'
  ) RETURNING id INTO v_withdrawal_id;

  -- Record wallet transaction
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
    VALUES (p_idempotency_key, 'wallet_withdraw', 200,
      jsonb_build_object('success', true, 'withdrawal_id', v_withdrawal_id))
    ON CONFLICT (key) DO NOTHING;
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

-- ============================================================================
-- 7. ADDITIONAL RLS HARDENING
-- ============================================================================

-- Wallets: users can only view their own wallet
DROP POLICY IF EXISTS "Users can view own wallet" ON wallets;
CREATE POLICY "users_view_own_wallet" ON wallets
  FOR SELECT USING (
    profile_id = (SELECT id FROM profiles WHERE user_id = auth.uid())
    OR EXISTS (SELECT 1 FROM profiles p WHERE p.user_id = auth.uid() AND p.role = 'admin')
  );

-- No direct UPDATE on wallets from client (must use stored procedures)
DROP POLICY IF EXISTS "Users can update own wallet" ON wallets;
DROP POLICY IF EXISTS "Service can update wallets" ON wallets;

-- Wallet transactions: users can view their own
DROP POLICY IF EXISTS "Users can view own wallet transactions" ON wallet_transactions;
CREATE POLICY "users_view_own_wallet_txs" ON wallet_transactions
  FOR SELECT USING (
    wallet_id IN (SELECT id FROM wallets WHERE profile_id = (SELECT id FROM profiles WHERE user_id = auth.uid()))
    OR EXISTS (SELECT 1 FROM profiles p WHERE p.user_id = auth.uid() AND p.role = 'admin')
  );

-- Commissions: partners can view their own, admins can view all
DROP POLICY IF EXISTS "Partners can view own commissions" ON commissions;
DROP POLICY IF EXISTS "Users can view own commissions" ON commissions;
CREATE POLICY "users_view_own_commissions" ON commissions
  FOR SELECT USING (
    partner_id = (SELECT id FROM profiles WHERE user_id = auth.uid())
    OR EXISTS (SELECT 1 FROM profiles p WHERE p.user_id = auth.uid() AND p.role = 'admin')
  );

-- Transactions: users can view their own
DROP POLICY IF EXISTS "Users can view own transactions" ON transactions;
CREATE POLICY "users_view_own_transactions" ON transactions
  FOR SELECT USING (
    customer_id = (SELECT id FROM profiles WHERE user_id = auth.uid())
    OR EXISTS (SELECT 1 FROM profiles p WHERE p.user_id = auth.uid() AND p.role = 'admin')
  );

-- ============================================================================
-- 8. TRIGGER: Prevent role changes via direct SQL (defense in depth)
-- ============================================================================

CREATE OR REPLACE FUNCTION prevent_role_self_escalation()
RETURNS TRIGGER AS $$
BEGIN
  -- Only block if the caller is NOT service_role (service role = internal operations)
  IF current_setting('role', true) != 'service_role' THEN
    IF OLD.role IS DISTINCT FROM NEW.role THEN
      -- Check if the caller is an admin
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

DROP TRIGGER IF EXISTS trg_prevent_role_escalation ON profiles;
CREATE TRIGGER trg_prevent_role_escalation
  BEFORE UPDATE ON profiles
  FOR EACH ROW
  EXECUTE FUNCTION prevent_role_self_escalation();

COMMIT;
