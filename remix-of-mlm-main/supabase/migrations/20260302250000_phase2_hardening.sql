-- ============================================================================
-- PHASE 2: DATABASE HARD GUARANTEES
-- Immutable financial ledger, remaining RLS cleanup, role separation
-- ============================================================================

BEGIN;

-- ============================================================================
-- 1. DROP ALL REMAINING PERMISSIVE TRUE POLICIES
-- ============================================================================

-- scan_attempts: old permissive policies conflict with new restrictive ones
DROP POLICY IF EXISTS "Anyone can insert scan attempts" ON scan_attempts;
DROP POLICY IF EXISTS "Anyone can view scan attempts by hash" ON scan_attempts;
DROP POLICY IF EXISTS "Anyone can update scan attempts" ON scan_attempts;

-- security_tests: remaining permissive policies
DROP POLICY IF EXISTS "Anyone can query security tests by network hash" ON security_tests;
DROP POLICY IF EXISTS "Anyone can update security test count" ON security_tests;
DROP POLICY IF EXISTS "Authenticated users can insert own security test" ON security_tests;
DROP POLICY IF EXISTS "Anonymous can insert security test" ON security_tests;

-- security_tests: add proper restrictive policies
DO $$ BEGIN
  CREATE POLICY "security_tests_service_only_update" ON security_tests
    FOR UPDATE USING (false);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- groups: restrict SELECT to authenticated only (not TRUE)
DROP POLICY IF EXISTS "Authenticated users can view groups" ON groups;
DO $$ BEGIN
  CREATE POLICY "authenticated_view_groups" ON groups
    FOR SELECT USING (auth.uid() IS NOT NULL);
EXCEPTION WHEN duplicate_object THEN NULL;
  WHEN undefined_table THEN NULL;
END $$;

-- commission_models/rules: restrict to authenticated (not TRUE)
DROP POLICY IF EXISTS "Authenticated can view models" ON commission_models;
DROP POLICY IF EXISTS "Authenticated can view rules" ON commission_rules;

DO $$ BEGIN
  CREATE POLICY "authenticated_view_commission_models" ON commission_models
    FOR SELECT USING (auth.uid() IS NOT NULL);
EXCEPTION WHEN duplicate_object THEN NULL;
  WHEN undefined_table THEN NULL;
END $$;

DO $$ BEGIN
  CREATE POLICY "authenticated_view_commission_rules" ON commission_rules
    FOR SELECT USING (auth.uid() IS NOT NULL);
EXCEPTION WHEN duplicate_object THEN NULL;
  WHEN undefined_table THEN NULL;
END $$;

-- ============================================================================
-- 2. IMMUTABLE FINANCIAL LEDGER
-- Append-only table for all financial state changes
-- No UPDATE or DELETE allowed — enforced by trigger
-- ============================================================================

CREATE TABLE IF NOT EXISTS financial_ledger (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  ledger_type TEXT NOT NULL CHECK (ledger_type IN (
    'wallet_credit', 'wallet_debit', 'wallet_withdrawal',
    'commission_created', 'commission_approved', 'commission_paid',
    'transaction_created', 'transaction_completed', 'transaction_refunded'
  )),
  profile_id UUID NOT NULL,
  amount NUMERIC NOT NULL CHECK (amount > 0 AND amount <= 10000000),
  currency TEXT NOT NULL DEFAULT 'EUR',
  reference_type TEXT,
  reference_id TEXT,
  balance_before NUMERIC,
  balance_after NUMERIC,
  metadata JSONB DEFAULT '{}',
  checksum TEXT NOT NULL DEFAULT ''
);

-- Immutability enforcement: block UPDATE and DELETE
CREATE OR REPLACE FUNCTION prevent_ledger_mutation()
RETURNS TRIGGER AS $$
BEGIN
  RAISE EXCEPTION 'Financial ledger is immutable. UPDATE and DELETE are not permitted.';
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_prevent_ledger_update ON financial_ledger;
CREATE TRIGGER trg_prevent_ledger_update
  BEFORE UPDATE OR DELETE ON financial_ledger
  FOR EACH ROW
  EXECUTE FUNCTION prevent_ledger_mutation();

-- Auto-generate checksum on insert
CREATE OR REPLACE FUNCTION generate_ledger_checksum()
RETURNS TRIGGER AS $$
BEGIN
  NEW.checksum := encode(
    digest(
      NEW.id::TEXT || NEW.ledger_type || NEW.profile_id::TEXT || NEW.amount::TEXT || NEW.created_at::TEXT,
      'sha256'
    ),
    'hex'
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_ledger_checksum ON financial_ledger;
CREATE TRIGGER trg_ledger_checksum
  BEFORE INSERT ON financial_ledger
  FOR EACH ROW
  EXECUTE FUNCTION generate_ledger_checksum();

-- RLS: service_role only
ALTER TABLE financial_ledger ENABLE ROW LEVEL SECURITY;
CREATE POLICY "ledger_service_insert" ON financial_ledger FOR INSERT WITH CHECK (false);
CREATE POLICY "ledger_admin_read" ON financial_ledger FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM user_roles ur JOIN profiles p ON ur.user_id = p.id
    WHERE p.user_id = auth.uid() AND ur.role IN ('admin', 'super_admin')
  ));

-- Index for reconciliation queries
CREATE INDEX IF NOT EXISTS idx_ledger_profile_id ON financial_ledger(profile_id);
CREATE INDEX IF NOT EXISTS idx_ledger_type ON financial_ledger(ledger_type);
CREATE INDEX IF NOT EXISTS idx_ledger_created_at ON financial_ledger(created_at);
CREATE INDEX IF NOT EXISTS idx_ledger_reference ON financial_ledger(reference_type, reference_id);

-- ============================================================================
-- 3. AUTO-APPEND TO LEDGER ON WALLET MUTATIONS
-- Trigger on wallet_transactions to maintain ledger automatically
-- ============================================================================

CREATE OR REPLACE FUNCTION append_to_financial_ledger()
RETURNS TRIGGER AS $$
DECLARE
  v_profile_id UUID;
  v_balance_before NUMERIC;
BEGIN
  -- Get profile_id from wallet
  SELECT profile_id INTO v_profile_id FROM wallets WHERE id = NEW.wallet_id;

  INSERT INTO financial_ledger (
    ledger_type, profile_id, amount, reference_type, reference_id,
    balance_before, balance_after, metadata
  ) VALUES (
    CASE
      WHEN NEW.transaction_type IN ('commission', 'bonus', 'credit', 'refund') THEN 'wallet_credit'
      WHEN NEW.transaction_type = 'withdrawal' THEN 'wallet_withdrawal'
      ELSE 'wallet_debit'
    END,
    v_profile_id,
    NEW.amount,
    NEW.reference_type,
    NEW.reference_id,
    COALESCE(NEW.balance_after - NEW.amount, 0),
    NEW.balance_after,
    jsonb_build_object('transaction_type', NEW.transaction_type, 'description', NEW.description)
  );

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trg_ledger_on_wallet_tx ON wallet_transactions;
CREATE TRIGGER trg_ledger_on_wallet_tx
  AFTER INSERT ON wallet_transactions
  FOR EACH ROW
  EXECUTE FUNCTION append_to_financial_ledger();

-- Also append on commission creation
CREATE OR REPLACE FUNCTION append_commission_to_ledger()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO financial_ledger (
    ledger_type, profile_id, amount, reference_type, reference_id,
    metadata
  ) VALUES (
    'commission_created',
    NEW.partner_id,
    NEW.commission_amount,
    'commission',
    NEW.id::TEXT,
    jsonb_build_object('transaction_id', NEW.transaction_id, 'level', NEW.level_number, 'type', NEW.commission_type)
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trg_ledger_on_commission ON commissions;
CREATE TRIGGER trg_ledger_on_commission
  AFTER INSERT ON commissions
  FOR EACH ROW
  EXECUTE FUNCTION append_commission_to_ledger();

-- ============================================================================
-- 4. MONITORING: Wallet drift detection function
-- Compares wallet balance vs ledger sum — callable by monitoring
-- ============================================================================

CREATE OR REPLACE FUNCTION check_wallet_drift()
RETURNS TABLE (
  profile_id UUID,
  wallet_balance NUMERIC,
  ledger_balance NUMERIC,
  drift NUMERIC
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    w.profile_id,
    w.available_balance AS wallet_balance,
    COALESCE(
      SUM(CASE
        WHEN fl.ledger_type IN ('wallet_credit') THEN fl.amount
        WHEN fl.ledger_type IN ('wallet_debit', 'wallet_withdrawal') THEN -fl.amount
        ELSE 0
      END),
      0
    ) AS ledger_balance,
    w.available_balance - COALESCE(
      SUM(CASE
        WHEN fl.ledger_type IN ('wallet_credit') THEN fl.amount
        WHEN fl.ledger_type IN ('wallet_debit', 'wallet_withdrawal') THEN -fl.amount
        ELSE 0
      END),
      0
    ) AS drift
  FROM wallets w
  LEFT JOIN financial_ledger fl ON fl.profile_id = w.profile_id
    AND fl.ledger_type IN ('wallet_credit', 'wallet_debit', 'wallet_withdrawal')
  GROUP BY w.profile_id, w.available_balance
  HAVING ABS(w.available_balance - COALESCE(
    SUM(CASE
      WHEN fl.ledger_type IN ('wallet_credit') THEN fl.amount
      WHEN fl.ledger_type IN ('wallet_debit', 'wallet_withdrawal') THEN -fl.amount
      ELSE 0
    END),
    0
  )) > 0.01;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

REVOKE EXECUTE ON FUNCTION check_wallet_drift() FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION check_wallet_drift() TO service_role;

-- ============================================================================
-- 5. MONITORING: Commission anomaly detection
-- Flags commissions that exceed expected bounds
-- ============================================================================

CREATE OR REPLACE FUNCTION check_commission_anomalies()
RETURNS TABLE (
  commission_id UUID,
  partner_id UUID,
  amount NUMERIC,
  anomaly_type TEXT
) AS $$
BEGIN
  -- Flag commissions > 100€ (max normal payout per level)
  RETURN QUERY
  SELECT c.id, c.partner_id, c.commission_amount,
    'AMOUNT_EXCEEDS_MAXIMUM'::TEXT AS anomaly_type
  FROM commissions c
  WHERE c.commission_amount > 100
    AND c.created_at > now() - interval '24 hours';

  -- Flag same partner receiving > 10 commissions in 1 hour
  RETURN QUERY
  SELECT NULL::UUID, c.partner_id, SUM(c.commission_amount),
    'VELOCITY_ANOMALY'::TEXT
  FROM commissions c
  WHERE c.created_at > now() - interval '1 hour'
  GROUP BY c.partner_id
  HAVING COUNT(*) > 10;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

REVOKE EXECUTE ON FUNCTION check_commission_anomalies() FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION check_commission_anomalies() TO service_role;

-- ============================================================================
-- 6. KEY ROTATION SUPPORT TABLE
-- Tracks encryption key versions for rotation
-- ============================================================================

CREATE TABLE IF NOT EXISTS encryption_key_versions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  key_version INT NOT NULL UNIQUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  rotated_at TIMESTAMPTZ,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'rotating', 'retired')),
  records_re_encrypted INT DEFAULT 0
);

ALTER TABLE encryption_key_versions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "key_versions_service_only" ON encryption_key_versions FOR ALL USING (false);

-- Insert initial key version
INSERT INTO encryption_key_versions (key_version, status)
VALUES (1, 'active')
ON CONFLICT DO NOTHING;

-- ============================================================================
-- 7. SECURITY: Restrict all security-dashboard tables to service_role writes
-- Frontend must go through security-dashboard-api Edge Function
-- ============================================================================

DO $$
DECLARE
  tbl TEXT;
  tables TEXT[] := ARRAY[
    'protected_domains', 'waf_rules', 'cache_settings', 'ip_access_rules',
    'rate_limit_rules', 'bot_management_config', 'ddos_protection_config',
    'compliance_checks', 'dns_records', 'email_security_config',
    'security_incidents', 'page_rules', 'security_reports', 'ssl_certificates',
    'threat_intel_feeds', 'vulnerability_findings', 'zero_trust_policies',
    'firewall_analytics', 'security_assets', 'threat_events', 'security_alerts',
    'threat_intel'
  ];
BEGIN
  FOREACH tbl IN ARRAY tables LOOP
    BEGIN
      EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', tbl);
      -- Drop any existing permissive INSERT policy
      EXECUTE format('DROP POLICY IF EXISTS "%s_user_insert" ON %I', tbl, tbl);
      EXECUTE format('DROP POLICY IF EXISTS "Anyone can insert %s" ON %I', tbl, tbl);
      -- Create restrictive INSERT (service_role only via RLS bypass)
      EXECUTE format(
        'CREATE POLICY "%s_service_write" ON %I FOR INSERT WITH CHECK (false)',
        tbl, tbl
      );
      -- Allow UPDATE only via service_role
      EXECUTE format(
        'CREATE POLICY "%s_service_update" ON %I FOR UPDATE USING (false)',
        tbl, tbl
      );
      -- Allow DELETE only via service_role
      EXECUTE format(
        'CREATE POLICY "%s_service_delete" ON %I FOR DELETE USING (false)',
        tbl, tbl
      );
    EXCEPTION WHEN undefined_table THEN
      RAISE NOTICE 'Table % does not exist, skipping', tbl;
    WHEN duplicate_object THEN
      RAISE NOTICE 'Policy already exists on %, skipping', tbl;
    END;
  END LOOP;
END $$;

COMMIT;
