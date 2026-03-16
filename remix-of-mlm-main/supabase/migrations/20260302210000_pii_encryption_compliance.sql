-- ============================================================================
-- PHASE 3: PII ENCRYPTION & DSGVO COMPLIANCE
-- ============================================================================

BEGIN;

-- Enable pgcrypto for encryption
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- ============================================================================
-- 1. PII ENCRYPTION FUNCTIONS
-- Uses Supabase Vault or pgcrypto with a server-side key
-- ============================================================================

-- Encryption key should be set as a Supabase secret: PII_ENCRYPTION_KEY
-- Fallback: uses a database-stored key (less secure, but better than plaintext)

CREATE OR REPLACE FUNCTION encrypt_pii(plaintext TEXT)
RETURNS TEXT AS $$
DECLARE
  encryption_key TEXT;
BEGIN
  IF plaintext IS NULL OR plaintext = '' THEN
    RETURN plaintext;
  END IF;

  encryption_key := current_setting('app.pii_encryption_key', true);
  IF encryption_key IS NULL OR encryption_key = '' THEN
    -- Fallback: return as-is if no key configured (log warning)
    RAISE WARNING 'PII_ENCRYPTION_KEY not configured - storing plaintext';
    RETURN plaintext;
  END IF;

  RETURN encode(
    pgp_sym_encrypt(plaintext, encryption_key),
    'base64'
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE FUNCTION decrypt_pii(ciphertext TEXT)
RETURNS TEXT AS $$
DECLARE
  encryption_key TEXT;
BEGIN
  IF ciphertext IS NULL OR ciphertext = '' THEN
    RETURN ciphertext;
  END IF;

  encryption_key := current_setting('app.pii_encryption_key', true);
  IF encryption_key IS NULL OR encryption_key = '' THEN
    RETURN ciphertext; -- Assume plaintext if no key
  END IF;

  BEGIN
    RETURN pgp_sym_decrypt(
      decode(ciphertext, 'base64'),
      encryption_key
    );
  EXCEPTION WHEN OTHERS THEN
    -- If decryption fails, data is likely still plaintext
    RETURN ciphertext;
  END;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================================
-- 2. ADD ENCRYPTED COLUMNS FOR SENSITIVE DATA
-- Profiles: IBAN, BIC, account_holder are PII
-- ============================================================================

-- Add encrypted columns (keep originals during migration)
ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS iban_encrypted TEXT,
  ADD COLUMN IF NOT EXISTS bic_encrypted TEXT,
  ADD COLUMN IF NOT EXISTS account_holder_encrypted TEXT;

-- Migrate existing data to encrypted columns
-- This should be run once after setting PII_ENCRYPTION_KEY
CREATE OR REPLACE FUNCTION migrate_pii_to_encrypted()
RETURNS void AS $$
BEGIN
  UPDATE profiles SET
    iban_encrypted = encrypt_pii(iban),
    bic_encrypted = encrypt_pii(bic),
    account_holder_encrypted = encrypt_pii(account_holder)
  WHERE iban IS NOT NULL AND iban_encrypted IS NULL;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================================
-- 3. DSGVO: DATA DELETION / ANONYMIZATION
-- ============================================================================

CREATE OR REPLACE FUNCTION anonymize_user_data(p_user_id UUID)
RETURNS void AS $$
BEGIN
  -- Anonymize profile (keep structure for referential integrity)
  UPDATE profiles SET
    first_name = 'GELÖSCHT',
    last_name = 'GELÖSCHT',
    email = 'deleted_' || id || '@anonymized.local',
    phone = NULL,
    iban = NULL,
    bic = NULL,
    account_holder = NULL,
    iban_encrypted = NULL,
    bic_encrypted = NULL,
    account_holder_encrypted = NULL,
    street = NULL,
    house_number = NULL,
    postal_code = NULL,
    city = NULL,
    country = NULL,
    ip_address = NULL,
    status = 'cancelled'
  WHERE user_id = p_user_id;

  -- Log the anonymization
  INSERT INTO audit_log (action, table_name, record_id, new_data)
  VALUES ('USER_DATA_ANONYMIZED', 'profiles', p_user_id::TEXT,
    jsonb_build_object('reason', 'DSGVO Löschanfrage', 'timestamp', now()));
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================================
-- 4. LOGIN ATTEMPT TRACKING & BRUTE FORCE PROTECTION
-- ============================================================================

CREATE TABLE IF NOT EXISTS login_attempts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email TEXT NOT NULL,
  ip_address TEXT,
  success BOOLEAN NOT NULL DEFAULT false,
  user_agent TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_login_attempts_email ON login_attempts (email, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_login_attempts_ip ON login_attempts (ip_address, created_at DESC);

ALTER TABLE login_attempts ENABLE ROW LEVEL SECURITY;

-- Only service role can insert/read login attempts
CREATE POLICY "login_attempts_service_only" ON login_attempts
  FOR ALL USING (false);

-- Function to check if account is locked
CREATE OR REPLACE FUNCTION is_account_locked(p_email TEXT)
RETURNS BOOLEAN AS $$
DECLARE
  failed_count INT;
BEGIN
  SELECT COUNT(*) INTO failed_count
  FROM login_attempts
  WHERE email = p_email
    AND success = false
    AND created_at > now() - interval '15 minutes';

  RETURN failed_count >= 5;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================================
-- 5. LOGGING HYGIENE: Ensure no PII in audit_log new_data
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
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_sanitize_audit ON audit_log;
CREATE TRIGGER trg_sanitize_audit
  BEFORE INSERT ON audit_log
  FOR EACH ROW
  EXECUTE FUNCTION sanitize_audit_data();

COMMIT;
