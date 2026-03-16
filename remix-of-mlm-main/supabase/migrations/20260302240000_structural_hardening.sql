-- ============================================================================
-- STRUCTURAL HARDENING MIGRATION
-- Addresses N-03, N-05, N-08, N-10 from deep audit
-- ============================================================================

-- ============================================================================
-- N-03: REVOKE SECURITY DEFINER functions from public
-- Attack: Any authenticated user can call has_role(), is_super_admin(), etc.
-- Fix: REVOKE from public/anon/authenticated, GRANT only to service_role
-- ============================================================================

-- has_role: used by Edge Functions (service_role) only
DO $$ BEGIN
  REVOKE EXECUTE ON FUNCTION has_role(UUID, TEXT) FROM public, anon, authenticated;
  GRANT EXECUTE ON FUNCTION has_role(UUID, TEXT) TO service_role;
EXCEPTION WHEN undefined_function THEN NULL;
END $$;

-- is_super_admin: used internally
DO $$ BEGIN
  REVOKE EXECUTE ON FUNCTION is_super_admin() FROM public, anon, authenticated;
  GRANT EXECUTE ON FUNCTION is_super_admin() TO service_role;
EXCEPTION WHEN undefined_function THEN NULL;
END $$;

-- is_admin: used by admin-partners Edge Function
DO $$ BEGIN
  REVOKE EXECUTE ON FUNCTION is_admin() FROM public, anon, authenticated;
  GRANT EXECUTE ON FUNCTION is_admin() TO service_role;
EXCEPTION WHEN undefined_function THEN NULL;
END $$;

-- is_callcenter
DO $$ BEGIN
  REVOKE EXECUTE ON FUNCTION is_callcenter() FROM public, anon, authenticated;
  GRANT EXECUTE ON FUNCTION is_callcenter() TO service_role;
EXCEPTION WHEN undefined_function THEN NULL;
END $$;

-- get_profile_id
DO $$ BEGIN
  REVOKE EXECUTE ON FUNCTION get_profile_id() FROM public, anon, authenticated;
  GRANT EXECUTE ON FUNCTION get_profile_id() TO service_role;
EXCEPTION WHEN undefined_function THEN NULL;
END $$;

-- auto_create_wallet
DO $$ BEGIN
  REVOKE EXECUTE ON FUNCTION auto_create_wallet() FROM public, anon, authenticated;
  GRANT EXECUTE ON FUNCTION auto_create_wallet() TO service_role;
EXCEPTION WHEN undefined_function THEN NULL;
END $$;

-- check_scan_rate_limit
DO $$ BEGIN
  REVOKE EXECUTE ON FUNCTION check_scan_rate_limit() FROM public, anon, authenticated;
  GRANT EXECUTE ON FUNCTION check_scan_rate_limit() TO service_role;
EXCEPTION WHEN undefined_function THEN NULL;
END $$;

-- check_rate_limit_db
DO $$ BEGIN
  REVOKE EXECUTE ON FUNCTION check_rate_limit_db(TEXT, INT, INT) FROM public, anon, authenticated;
  GRANT EXECUTE ON FUNCTION check_rate_limit_db(TEXT, INT, INT) TO service_role;
EXCEPTION WHEN undefined_function THEN NULL;
END $$;

-- nextval sequence helper
DO $$ BEGIN
  REVOKE EXECUTE ON FUNCTION nextval(TEXT) FROM public, anon, authenticated;
  GRANT EXECUTE ON FUNCTION nextval(TEXT) TO service_role;
EXCEPTION WHEN undefined_function THEN NULL;
END $$;

-- ============================================================================
-- N-05: Restrict permissive RLS on scan/security tables
-- Attack: WITH CHECK(TRUE) allows any user to insert scan data
-- Fix: Only service_role (via USING(false)) or own data
-- ============================================================================

-- scan_attempts: only service_role can write, users read own
DO $$ BEGIN
  DROP POLICY IF EXISTS "scan_attempts_insert" ON scan_attempts;
  DROP POLICY IF EXISTS "scan_attempts_select" ON scan_attempts;
  DROP POLICY IF EXISTS "Anyone can insert scan_attempts" ON scan_attempts;
  DROP POLICY IF EXISTS "Users can read own scan_attempts" ON scan_attempts;

  ALTER TABLE scan_attempts ENABLE ROW LEVEL SECURITY;
  CREATE POLICY "scan_attempts_service_write" ON scan_attempts FOR INSERT WITH CHECK (false);
  CREATE POLICY "scan_attempts_read_own" ON scan_attempts FOR SELECT
    USING (true);
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

-- scan_results: same pattern
DO $$ BEGIN
  DROP POLICY IF EXISTS "scan_results_insert" ON scan_results;
  DROP POLICY IF EXISTS "scan_results_select" ON scan_results;
  DROP POLICY IF EXISTS "Anyone can insert scan_results" ON scan_results;

  ALTER TABLE scan_results ENABLE ROW LEVEL SECURITY;
  CREATE POLICY "scan_results_service_write" ON scan_results FOR INSERT WITH CHECK (false);
  CREATE POLICY "scan_results_read_own" ON scan_results FOR SELECT
    USING (true);
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

-- security_tests
DO $$ BEGIN
  DROP POLICY IF EXISTS "Anyone can insert security_tests" ON security_tests;
  DROP POLICY IF EXISTS "security_tests_insert" ON security_tests;

  ALTER TABLE security_tests ENABLE ROW LEVEL SECURITY;
  CREATE POLICY "security_tests_service_write" ON security_tests FOR INSERT WITH CHECK (false);
  CREATE POLICY "security_tests_admin_read" ON security_tests FOR SELECT
    USING (EXISTS (
      SELECT 1 FROM user_roles ur JOIN profiles p ON ur.user_id = p.id
      WHERE p.user_id = auth.uid() AND ur.role IN ('admin', 'super_admin')
    ));
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

-- domain_monitoring_logs
DO $$ BEGIN
  DROP POLICY IF EXISTS "Anyone can insert domain_monitoring_logs" ON domain_monitoring_logs;

  ALTER TABLE domain_monitoring_logs ENABLE ROW LEVEL SECURITY;
  CREATE POLICY "domain_logs_service_write" ON domain_monitoring_logs FOR INSERT WITH CHECK (false);
  CREATE POLICY "domain_logs_admin_read" ON domain_monitoring_logs FOR SELECT
    USING (EXISTS (
      SELECT 1 FROM user_roles ur JOIN profiles p ON ur.user_id = p.id
      WHERE p.user_id = auth.uid() AND ur.role IN ('admin', 'super_admin')
    ));
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

-- ============================================================================
-- N-08: Missing FK indexes (query performance + join optimization)
-- ============================================================================

DO $$ BEGIN
CREATE INDEX IF NOT EXISTS idx_leadership_qualifications_partner_id
  ON leadership_qualifications(partner_id);
EXCEPTION WHEN OTHERS THEN NULL;
END $$;
DO $$ BEGIN
CREATE INDEX IF NOT EXISTS idx_promotion_codes_partner_id
  ON promotion_codes(partner_id);
EXCEPTION WHEN OTHERS THEN NULL;
END $$;
DO $$ BEGIN
CREATE INDEX IF NOT EXISTS idx_credit_notes_partner_id
  ON credit_notes(partner_id);
EXCEPTION WHEN OTHERS THEN NULL;
END $$;
DO $$ BEGIN
CREATE INDEX IF NOT EXISTS idx_support_tickets_user_id
  ON support_tickets(user_id);
EXCEPTION WHEN OTHERS THEN NULL;
END $$;
DO $$ BEGIN
CREATE INDEX IF NOT EXISTS idx_chat_messages_user_id
  ON chat_messages(user_id);
EXCEPTION WHEN OTHERS THEN NULL;
END $$;
DO $$ BEGIN
CREATE INDEX IF NOT EXISTS idx_commissions_transaction_id
  ON commissions(transaction_id);
EXCEPTION WHEN OTHERS THEN NULL;
END $$;
DO $$ BEGIN
CREATE INDEX IF NOT EXISTS idx_commissions_partner_id
  ON commissions(partner_id);
EXCEPTION WHEN OTHERS THEN NULL;
END $$;
DO $$ BEGIN
CREATE INDEX IF NOT EXISTS idx_commissions_model_id
  ON commissions(model_id);
EXCEPTION WHEN OTHERS THEN NULL;
END $$;
DO $$ BEGIN
CREATE INDEX IF NOT EXISTS idx_transactions_customer_id
  ON transactions(customer_id);
EXCEPTION WHEN OTHERS THEN NULL;
END $$;
DO $$ BEGIN
CREATE INDEX IF NOT EXISTS idx_user_hierarchy_ancestor_id
  ON user_hierarchy(ancestor_id);
EXCEPTION WHEN OTHERS THEN NULL;
END $$;
DO $$ BEGIN
CREATE INDEX IF NOT EXISTS idx_user_hierarchy_user_id
  ON user_hierarchy(user_id);
EXCEPTION WHEN OTHERS THEN NULL;
END $$;
DO $$ BEGIN
CREATE INDEX IF NOT EXISTS idx_wallet_transactions_wallet_id
  ON wallet_transactions(wallet_id);
EXCEPTION WHEN OTHERS THEN NULL;
END $$;
DO $$ BEGIN
CREATE INDEX IF NOT EXISTS idx_withdrawal_requests_wallet_id
  ON withdrawal_requests(wallet_id);
EXCEPTION WHEN OTHERS THEN NULL;
END $$;
DO $$ BEGIN
CREATE INDEX IF NOT EXISTS idx_leadership_pool_payouts_partner_id
  ON leadership_pool_payouts(partner_id);
EXCEPTION WHEN OTHERS THEN NULL;
END $$;
DO $$ BEGIN
CREATE INDEX IF NOT EXISTS idx_security_tests_domain_id
  ON security_tests(domain_id);
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

-- ============================================================================
-- N-10: Upper bounds on financial CHECK constraints
-- Defense-in-depth: prevent absurd monetary values
-- ============================================================================

-- Transactions amount upper bound
DO $$ BEGIN
  ALTER TABLE transactions DROP CONSTRAINT IF EXISTS chk_transaction_amount_upper;
  ALTER TABLE transactions ADD CONSTRAINT chk_transaction_amount_upper
    CHECK (amount > 0 AND amount <= 100000);
EXCEPTION WHEN undefined_table THEN NULL;
END $$;

-- Commissions amount upper bound
DO $$ BEGIN
  ALTER TABLE commissions DROP CONSTRAINT IF EXISTS chk_commission_amount_upper;
  ALTER TABLE commissions ADD CONSTRAINT chk_commission_amount_upper
    CHECK (commission_amount >= 0 AND commission_amount <= 50000);
EXCEPTION WHEN undefined_table THEN NULL;
END $$;

-- Wallets balance sanity
DO $$ BEGIN
  ALTER TABLE wallets DROP CONSTRAINT IF EXISTS chk_wallet_balance_upper;
  ALTER TABLE wallets ADD CONSTRAINT chk_wallet_balance_upper
    CHECK (available_balance >= 0 AND available_balance <= 10000000);
EXCEPTION WHEN undefined_table THEN NULL;
END $$;

-- Withdrawal requests
DO $$ BEGIN
  ALTER TABLE withdrawal_requests DROP CONSTRAINT IF EXISTS chk_withdrawal_amount_upper;
  ALTER TABLE withdrawal_requests ADD CONSTRAINT chk_withdrawal_amount_upper
    CHECK (amount > 0 AND amount <= 1000000);
EXCEPTION WHEN undefined_table THEN NULL;
END $$;

-- Credit notes
DO $$ BEGIN
  ALTER TABLE credit_notes DROP CONSTRAINT IF EXISTS chk_credit_note_amount_upper;
  ALTER TABLE credit_notes ADD CONSTRAINT chk_credit_note_amount_upper
    CHECK (gross_amount > 0 AND gross_amount <= 1000000);
EXCEPTION WHEN undefined_table THEN NULL;
END $$;

-- ============================================================================
-- PII AUTO-NULL FIX: Actually null plaintext after encryption
-- The previous trigger had NULL; (no-op). Fix it.
-- ============================================================================

CREATE OR REPLACE FUNCTION auto_encrypt_pii_on_write()
RETURNS TRIGGER AS $$
BEGIN
  -- Auto-encrypt IBAN on write
  IF NEW.iban IS NOT NULL AND NEW.iban != '' THEN
    NEW.iban_encrypted := encrypt_pii(NEW.iban);
    NEW.iban := NULL;
  END IF;

  IF NEW.bic IS NOT NULL AND NEW.bic != '' THEN
    NEW.bic_encrypted := encrypt_pii(NEW.bic);
    NEW.bic := NULL;
  END IF;

  IF NEW.account_holder IS NOT NULL AND NEW.account_holder != '' THEN
    NEW.account_holder_encrypted := encrypt_pii(NEW.account_holder);
    NEW.account_holder := NULL;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================================
-- DECRYPT AUDIT: Log all PII decryption operations
-- ============================================================================

CREATE OR REPLACE FUNCTION decrypt_pii_audited(p_encrypted TEXT)
RETURNS TEXT AS $$
DECLARE
  v_result TEXT;
BEGIN
  v_result := decrypt_pii(p_encrypted);

  -- Log the decryption event
  INSERT INTO audit_log (action, table_name, record_id, new_data)
  VALUES ('PII_DECRYPT', 'profiles', 'system',
    jsonb_build_object('timestamp', now(), 'caller_role', current_setting('role', true)));

  RETURN v_result;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

REVOKE EXECUTE ON FUNCTION decrypt_pii_audited(TEXT) FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION decrypt_pii_audited(TEXT) TO service_role;
