BEGIN;

-- ============================================================================
-- ENTERPRISE SECURITY INFRASTRUCTURE
-- Phase 1: Session Management, 2FA/TOTP, Device Fingerprinting,
--          Tamper-Proof Audit Chain, Advanced Fraud Scoring,
--          KYC/AML, Incident Response Automation, API Key Management,
--          Data Classification, SIEM Correlation, Compliance Engine
-- ============================================================================

-- ────────────────────────────────────────────────────────────────────────────
-- 1) SESSION MANAGEMENT & DEVICE FINGERPRINTING
-- ────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.active_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  session_token_hash TEXT NOT NULL,               -- SHA-256 of session token (never store raw)
  device_fingerprint TEXT,                         -- Browser/device fingerprint hash
  user_agent TEXT,
  ip_address INET NOT NULL,
  geo_country TEXT,
  geo_city TEXT,
  geo_asn INTEGER,
  geo_org TEXT,
  is_tor BOOLEAN DEFAULT FALSE,
  is_vpn BOOLEAN DEFAULT FALSE,
  is_proxy BOOLEAN DEFAULT FALSE,
  risk_score INTEGER DEFAULT 0 CHECK (risk_score BETWEEN 0 AND 100),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_active_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMPTZ NOT NULL DEFAULT (NOW() + INTERVAL '24 hours'),
  revoked_at TIMESTAMPTZ,
  revocation_reason TEXT,
  is_active BOOLEAN DEFAULT TRUE,
  mfa_verified BOOLEAN DEFAULT FALSE,
  CONSTRAINT chk_session_risk CHECK (risk_score >= 0)
);

CREATE INDEX IF NOT EXISTS idx_sessions_profile_active
  ON public.active_sessions(profile_id, is_active)
  WHERE is_active = TRUE;

CREATE INDEX IF NOT EXISTS idx_sessions_ip
  ON public.active_sessions(ip_address);

CREATE INDEX IF NOT EXISTS idx_sessions_expires
  ON public.active_sessions(expires_at)
  WHERE is_active = TRUE;

CREATE INDEX IF NOT EXISTS idx_sessions_device_fp
  ON public.active_sessions(device_fingerprint)
  WHERE device_fingerprint IS NOT NULL;

-- Known devices for trust scoring
CREATE TABLE IF NOT EXISTS public.known_devices (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  device_fingerprint TEXT NOT NULL,
  device_name TEXT,
  user_agent TEXT,
  first_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  login_count INTEGER DEFAULT 1,
  is_trusted BOOLEAN DEFAULT FALSE,
  trust_approved_at TIMESTAMPTZ,
  trust_approved_by UUID REFERENCES public.profiles(id),
  is_blocked BOOLEAN DEFAULT FALSE,
  blocked_reason TEXT,
  CONSTRAINT uq_known_device UNIQUE (profile_id, device_fingerprint)
);

-- ────────────────────────────────────────────────────────────────────────────
-- 2) TWO-FACTOR AUTHENTICATION (TOTP / Recovery Codes)
-- ────────────────────────────────────────────────────────────────────────────

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS mfa_enabled BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS mfa_enforced BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS mfa_method TEXT DEFAULT 'totp'
    CHECK (mfa_method IN ('totp', 'sms', 'email', 'hardware_key')),
  ADD COLUMN IF NOT EXISTS last_password_change TIMESTAMPTZ;

CREATE TABLE IF NOT EXISTS public.mfa_secrets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  encrypted_secret TEXT NOT NULL,              -- AES-256-GCM encrypted TOTP secret
  method TEXT NOT NULL DEFAULT 'totp'
    CHECK (method IN ('totp', 'sms', 'email', 'hardware_key')),
  is_active BOOLEAN DEFAULT TRUE,
  verified_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT uq_mfa_profile_method UNIQUE (profile_id, method)
);

CREATE TABLE IF NOT EXISTS public.mfa_recovery_codes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  code_hash TEXT NOT NULL,                     -- bcrypt/argon2 hash of recovery code
  used_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  batch_id UUID NOT NULL                       -- Group codes by generation batch
);

CREATE INDEX IF NOT EXISTS idx_mfa_recovery_unused
  ON public.mfa_recovery_codes(profile_id, batch_id)
  WHERE used_at IS NULL;

CREATE TABLE IF NOT EXISTS public.mfa_challenges (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  challenge_type TEXT NOT NULL CHECK (challenge_type IN ('login', 'withdrawal', 'role_change', 'sensitive_action')),
  method TEXT NOT NULL CHECK (method IN ('totp', 'sms', 'email', 'recovery_code')),
  delivered_to TEXT,                           -- Masked phone/email for audit
  attempts INTEGER DEFAULT 0,
  max_attempts INTEGER DEFAULT 5,
  verified_at TIMESTAMPTZ,
  expires_at TIMESTAMPTZ NOT NULL DEFAULT (NOW() + INTERVAL '5 minutes'),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  ip_address INET,
  CONSTRAINT chk_mfa_attempts CHECK (attempts <= max_attempts + 1)
);

-- ────────────────────────────────────────────────────────────────────────────
-- 3) TAMPER-PROOF AUDIT LOG WITH HASH CHAIN (BLOCKCHAIN-STYLE)
-- ────────────────────────────────────────────────────────────────────────────

ALTER TABLE public.audit_log
  ADD COLUMN IF NOT EXISTS event_hash TEXT,             -- SHA-256(prev_hash || event_data)
  ADD COLUMN IF NOT EXISTS previous_hash TEXT,          -- Chain link to prior entry
  ADD COLUMN IF NOT EXISTS sequence_number BIGINT,      -- Monotonic counter
  ADD COLUMN IF NOT EXISTS severity TEXT DEFAULT 'info'
    CHECK (severity IN ('debug', 'info', 'warning', 'error', 'critical')),
  ADD COLUMN IF NOT EXISTS category TEXT DEFAULT 'general'
    CHECK (category IN (
      'general', 'authentication', 'authorization', 'data_access',
      'data_modification', 'financial', 'security', 'compliance',
      'system', 'fraud'
    )),
  ADD COLUMN IF NOT EXISTS session_id UUID,
  ADD COLUMN IF NOT EXISTS device_fingerprint TEXT,
  ADD COLUMN IF NOT EXISTS geo_country TEXT,
  ADD COLUMN IF NOT EXISTS risk_indicators JSONB DEFAULT '[]'::JSONB;

CREATE SEQUENCE IF NOT EXISTS public.audit_sequence_seq;

-- Hash chain function for tamper detection
CREATE OR REPLACE FUNCTION public.audit_hash_chain()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _prev_hash TEXT;
  _seq BIGINT;
  _payload TEXT;
BEGIN
  _seq := nextval('public.audit_sequence_seq');
  NEW.sequence_number := _seq;

  SELECT event_hash INTO _prev_hash
  FROM public.audit_log
  WHERE sequence_number = _seq - 1;

  IF _prev_hash IS NULL THEN
    _prev_hash := 'GENESIS';
  END IF;

  NEW.previous_hash := _prev_hash;

  -- Construct deterministic payload for hashing
  _payload := _prev_hash || '|' ||
              _seq::TEXT || '|' ||
              COALESCE(NEW.action, '') || '|' ||
              COALESCE(NEW.table_name, '') || '|' ||
              COALESCE(NEW.record_id, '') || '|' ||
              COALESCE(NEW.user_id::TEXT, '') || '|' ||
              COALESCE(NEW.created_at::TEXT, NOW()::TEXT);

  NEW.event_hash := encode(digest(_payload, 'sha256'), 'hex');

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS audit_hash_chain_trigger ON public.audit_log;
CREATE TRIGGER audit_hash_chain_trigger
BEFORE INSERT ON public.audit_log
FOR EACH ROW
EXECUTE FUNCTION public.audit_hash_chain();

-- Verify audit chain integrity
CREATE OR REPLACE FUNCTION public.verify_audit_chain(
  _start_seq BIGINT DEFAULT 1,
  _end_seq BIGINT DEFAULT NULL
)
RETURNS TABLE (
  is_valid BOOLEAN,
  broken_at_sequence BIGINT,
  total_checked BIGINT,
  first_break_details TEXT
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _rec RECORD;
  _prev_hash TEXT := 'GENESIS';
  _expected_hash TEXT;
  _payload TEXT;
  _count BIGINT := 0;
  _broken_at BIGINT := NULL;
  _break_details TEXT := NULL;
BEGIN
  IF _end_seq IS NULL THEN
    SELECT MAX(sequence_number) INTO _end_seq FROM public.audit_log;
  END IF;

  FOR _rec IN
    SELECT * FROM public.audit_log
    WHERE sequence_number BETWEEN _start_seq AND _end_seq
    ORDER BY sequence_number ASC
  LOOP
    _count := _count + 1;

    _payload := _prev_hash || '|' ||
                _rec.sequence_number::TEXT || '|' ||
                COALESCE(_rec.action, '') || '|' ||
                COALESCE(_rec.table_name, '') || '|' ||
                COALESCE(_rec.record_id, '') || '|' ||
                COALESCE(_rec.user_id::TEXT, '') || '|' ||
                COALESCE(_rec.created_at::TEXT, '');

    _expected_hash := encode(digest(_payload, 'sha256'), 'hex');

    IF _rec.event_hash IS DISTINCT FROM _expected_hash AND _broken_at IS NULL THEN
      _broken_at := _rec.sequence_number;
      _break_details := format(
        'Expected hash %s but found %s at seq %s (action=%s, table=%s)',
        _expected_hash, COALESCE(_rec.event_hash, 'NULL'), _rec.sequence_number,
        _rec.action, _rec.table_name
      );
    END IF;

    _prev_hash := _rec.event_hash;
  END LOOP;

  RETURN QUERY SELECT
    (_broken_at IS NULL)::BOOLEAN,
    _broken_at,
    _count,
    _break_details;
END;
$$;

-- ────────────────────────────────────────────────────────────────────────────
-- 4) ADVANCED FRAUD SCORING ENGINE
-- ────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.fraud_risk_profiles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  composite_score INTEGER DEFAULT 0 CHECK (composite_score BETWEEN 0 AND 1000),
  velocity_score INTEGER DEFAULT 0,
  behavioral_score INTEGER DEFAULT 0,
  network_score INTEGER DEFAULT 0,
  device_score INTEGER DEFAULT 0,
  financial_score INTEGER DEFAULT 0,
  identity_score INTEGER DEFAULT 0,
  risk_tier TEXT DEFAULT 'low' CHECK (risk_tier IN ('low', 'medium', 'high', 'critical', 'blocked')),
  auto_block_threshold INTEGER DEFAULT 800,
  manual_review_threshold INTEGER DEFAULT 500,
  factors JSONB DEFAULT '[]'::JSONB,           -- Array of individual risk factors
  last_recalculated_at TIMESTAMPTZ DEFAULT NOW(),
  reviewed_by UUID REFERENCES public.profiles(id),
  reviewed_at TIMESTAMPTZ,
  review_notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT uq_fraud_risk_profile UNIQUE (profile_id)
);

-- Fraud rules engine (configurable by admin)
CREATE TABLE IF NOT EXISTS public.fraud_rules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  rule_name TEXT NOT NULL UNIQUE,
  rule_category TEXT NOT NULL CHECK (rule_category IN (
    'velocity', 'behavioral', 'network', 'device', 'financial', 'identity', 'correlation'
  )),
  description TEXT,
  condition_sql TEXT,                          -- Parameterized condition (for reference only)
  risk_points INTEGER NOT NULL DEFAULT 50 CHECK (risk_points BETWEEN 1 AND 500),
  action_on_trigger TEXT NOT NULL DEFAULT 'flag'
    CHECK (action_on_trigger IN ('flag', 'block', 'challenge_mfa', 'delay', 'manual_review', 'auto_ban')),
  cooldown_minutes INTEGER DEFAULT 60,
  is_enabled BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Seed default fraud rules
INSERT INTO public.fraud_rules (rule_name, rule_category, description, risk_points, action_on_trigger) VALUES
  ('rapid_registrations', 'velocity', 'More than 3 registrations from same IP within 24h', 200, 'block'),
  ('impossible_travel', 'behavioral', 'Login from geographically distant location within 1 hour', 300, 'challenge_mfa'),
  ('tor_exit_node', 'network', 'Connection from known Tor exit node', 150, 'challenge_mfa'),
  ('vpn_with_mismatched_timezone', 'network', 'VPN detected with browser timezone mismatch', 100, 'flag'),
  ('multiple_failed_mfa', 'device', 'More than 5 failed MFA attempts in 10 minutes', 250, 'block'),
  ('unusual_withdrawal_pattern', 'financial', 'Withdrawal amount exceeds 3x average within 24h', 200, 'manual_review'),
  ('sponsor_ip_overlap', 'identity', 'New user shares IP with their sponsor', 180, 'flag'),
  ('rapid_rank_advancement', 'behavioral', 'Rank advanced 3+ levels within 48 hours', 250, 'manual_review'),
  ('dormant_account_reactivation', 'behavioral', 'Account inactive >90 days suddenly active with financial ops', 150, 'challenge_mfa'),
  ('mass_promo_code_usage', 'velocity', 'Single promo code used >20 times within 1 hour', 300, 'block'),
  ('cross_account_fund_cycling', 'financial', 'Funds cycled between related accounts within 24h', 400, 'auto_ban'),
  ('device_fingerprint_collision', 'device', 'Same device fingerprint on >5 accounts', 250, 'manual_review'),
  ('email_pattern_abuse', 'identity', 'Multiple accounts with plus-addressing or dot-trick on same base', 200, 'flag'),
  ('commission_amount_anomaly', 'financial', 'Commission >3 standard deviations from mean', 150, 'manual_review'),
  ('brute_force_login', 'velocity', 'More than 10 failed logins in 5 minutes', 350, 'block')
ON CONFLICT (rule_name) DO NOTHING;

-- Fraud rule trigger log
CREATE TABLE IF NOT EXISTS public.fraud_rule_triggers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  rule_id UUID NOT NULL REFERENCES public.fraud_rules(id),
  profile_id UUID REFERENCES public.profiles(id),
  triggered_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  context JSONB NOT NULL DEFAULT '{}'::JSONB,
  risk_points_applied INTEGER NOT NULL,
  action_taken TEXT NOT NULL,
  resolved BOOLEAN DEFAULT FALSE,
  resolved_at TIMESTAMPTZ,
  resolved_by UUID REFERENCES public.profiles(id),
  resolution_notes TEXT
);

CREATE INDEX IF NOT EXISTS idx_fraud_triggers_profile
  ON public.fraud_rule_triggers(profile_id, triggered_at DESC);

CREATE INDEX IF NOT EXISTS idx_fraud_triggers_unresolved
  ON public.fraud_rule_triggers(resolved, triggered_at DESC)
  WHERE resolved = FALSE;

-- ────────────────────────────────────────────────────────────────────────────
-- 5) KYC / AML VERIFICATION SYSTEM
-- ────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.kyc_verifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  verification_level TEXT NOT NULL DEFAULT 'none'
    CHECK (verification_level IN ('none', 'basic', 'enhanced', 'full')),
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'in_review', 'approved', 'rejected', 'expired', 'revoked')),
  -- Identity documents
  document_type TEXT CHECK (document_type IN (
    'national_id', 'passport', 'drivers_license', 'residence_permit'
  )),
  document_number_hash TEXT,                   -- Hashed, never stored raw
  document_country TEXT,
  document_expiry DATE,
  document_front_url TEXT,                     -- Encrypted storage reference
  document_back_url TEXT,
  selfie_url TEXT,
  -- Address verification
  address_proof_type TEXT CHECK (address_proof_type IN (
    'utility_bill', 'bank_statement', 'government_letter', 'tax_document'
  )),
  address_proof_url TEXT,
  address_verified BOOLEAN DEFAULT FALSE,
  -- AML screening
  pep_check_result TEXT CHECK (pep_check_result IN ('clear', 'match', 'partial_match', 'pending')),
  sanctions_check_result TEXT CHECK (sanctions_check_result IN ('clear', 'match', 'partial_match', 'pending')),
  adverse_media_result TEXT CHECK (adverse_media_result IN ('clear', 'match', 'partial_match', 'pending')),
  aml_risk_rating TEXT CHECK (aml_risk_rating IN ('low', 'medium', 'high', 'prohibited')),
  -- Workflow
  submitted_at TIMESTAMPTZ,
  reviewed_at TIMESTAMPTZ,
  reviewed_by UUID REFERENCES public.profiles(id),
  review_notes TEXT,
  rejection_reason TEXT,
  expires_at TIMESTAMPTZ,                      -- KYC validity period
  -- Metadata
  verification_provider TEXT,                  -- External KYC provider ID
  provider_reference TEXT,                     -- External reference number
  provider_response JSONB,                     -- Raw provider response (encrypted fields)
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_kyc_profile_status
  ON public.kyc_verifications(profile_id, status);

CREATE INDEX IF NOT EXISTS idx_kyc_pending_review
  ON public.kyc_verifications(status, submitted_at)
  WHERE status IN ('pending', 'in_review');

-- AML watch list entries (internal)
CREATE TABLE IF NOT EXISTS public.aml_watchlist (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  entry_type TEXT NOT NULL CHECK (entry_type IN ('individual', 'entity', 'country')),
  name_pattern TEXT NOT NULL,
  aliases TEXT[],
  country_codes TEXT[],
  source TEXT NOT NULL,                        -- 'ofac', 'eu_sanctions', 'un_sanctions', 'internal'
  severity TEXT NOT NULL DEFAULT 'high'
    CHECK (severity IN ('low', 'medium', 'high', 'critical')),
  is_active BOOLEAN DEFAULT TRUE,
  added_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMPTZ,
  notes TEXT
);

CREATE INDEX IF NOT EXISTS idx_aml_watchlist_active
  ON public.aml_watchlist(is_active, entry_type);

-- KYC transaction limits based on verification level
CREATE TABLE IF NOT EXISTS public.kyc_limits (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  verification_level TEXT NOT NULL UNIQUE
    CHECK (verification_level IN ('none', 'basic', 'enhanced', 'full')),
  max_single_transaction NUMERIC(12,2) NOT NULL DEFAULT 299.00,
  max_daily_volume NUMERIC(12,2) NOT NULL DEFAULT 299.00,
  max_monthly_volume NUMERIC(12,2) NOT NULL DEFAULT 1000.00,
  max_withdrawal_per_request NUMERIC(12,2) NOT NULL DEFAULT 500.00,
  max_monthly_withdrawal NUMERIC(12,2) NOT NULL DEFAULT 2000.00,
  can_receive_commissions BOOLEAN DEFAULT TRUE,
  can_withdraw BOOLEAN DEFAULT FALSE,
  requires_enhanced_due_diligence BOOLEAN DEFAULT FALSE
);

INSERT INTO public.kyc_limits (verification_level, max_single_transaction, max_daily_volume, max_monthly_volume, max_withdrawal_per_request, max_monthly_withdrawal, can_receive_commissions, can_withdraw, requires_enhanced_due_diligence) VALUES
  ('none',     299.00,   299.00,   1000.00,    0.00,     0.00, TRUE, FALSE, FALSE),
  ('basic',    999.00,  2000.00,  10000.00,  500.00,  2000.00, TRUE, TRUE,  FALSE),
  ('enhanced', 5000.00, 10000.00, 50000.00, 5000.00, 20000.00, TRUE, TRUE,  FALSE),
  ('full',    50000.00, 100000.00, 500000.00, 50000.00, 200000.00, TRUE, TRUE, TRUE)
ON CONFLICT (verification_level) DO UPDATE
  SET max_single_transaction = EXCLUDED.max_single_transaction,
      max_daily_volume = EXCLUDED.max_daily_volume,
      max_monthly_volume = EXCLUDED.max_monthly_volume,
      max_withdrawal_per_request = EXCLUDED.max_withdrawal_per_request,
      max_monthly_withdrawal = EXCLUDED.max_monthly_withdrawal;

-- ────────────────────────────────────────────────────────────────────────────
-- 6) INCIDENT RESPONSE AUTOMATION
-- ────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.security_incidents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  incident_number TEXT NOT NULL UNIQUE,         -- INC-YYYYMMDD-XXXX format
  title TEXT NOT NULL,
  description TEXT,
  severity TEXT NOT NULL CHECK (severity IN ('p1_critical', 'p2_high', 'p3_medium', 'p4_low')),
  status TEXT NOT NULL DEFAULT 'detected'
    CHECK (status IN ('detected', 'triaged', 'investigating', 'containing', 'eradicating', 'recovering', 'resolved', 'post_mortem', 'closed')),
  category TEXT NOT NULL CHECK (category IN (
    'data_breach', 'unauthorized_access', 'malware', 'ddos',
    'insider_threat', 'fraud', 'phishing', 'account_compromise',
    'api_abuse', 'configuration_error', 'vulnerability_exploit', 'other'
  )),
  -- Impact assessment
  affected_profiles_count INTEGER DEFAULT 0,
  affected_transactions_count INTEGER DEFAULT 0,
  estimated_financial_impact NUMERIC(12,2) DEFAULT 0,
  data_exposure_scope TEXT[],                  -- Array of affected data types
  -- Response
  assigned_to UUID REFERENCES public.profiles(id),
  escalated_to UUID REFERENCES public.profiles(id),
  containment_actions JSONB DEFAULT '[]'::JSONB,
  eradication_steps JSONB DEFAULT '[]'::JSONB,
  recovery_steps JSONB DEFAULT '[]'::JSONB,
  -- Timeline
  detected_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  triaged_at TIMESTAMPTZ,
  contained_at TIMESTAMPTZ,
  eradicated_at TIMESTAMPTZ,
  recovered_at TIMESTAMPTZ,
  resolved_at TIMESTAMPTZ,
  closed_at TIMESTAMPTZ,
  -- Root cause & lessons
  root_cause TEXT,
  lessons_learned TEXT,
  post_mortem_url TEXT,
  -- Linked entities
  related_fraud_alerts UUID[],
  related_threat_events UUID[],
  source_ip INET,
  attack_vector TEXT,
  ioc_indicators JSONB DEFAULT '[]'::JSONB,    -- Indicators of compromise
  -- Metadata
  created_by UUID REFERENCES public.profiles(id),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE SEQUENCE IF NOT EXISTS public.incident_number_seq START 1000;

CREATE INDEX IF NOT EXISTS idx_incidents_status
  ON public.security_incidents(status, severity)
  WHERE status NOT IN ('resolved', 'closed');

-- Add detected_at if it doesn't exist yet (table may have been created by earlier migration)
ALTER TABLE public.security_incidents
  ADD COLUMN IF NOT EXISTS detected_at TIMESTAMPTZ NOT NULL DEFAULT NOW();
ALTER TABLE public.security_incidents
  ADD COLUMN IF NOT EXISTS severity TEXT NOT NULL DEFAULT 'p3_medium';
ALTER TABLE public.security_incidents
  ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'detected';

CREATE INDEX IF NOT EXISTS idx_incidents_timeline
  ON public.security_incidents(detected_at DESC);

-- Add potentially missing columns to security_incidents
ALTER TABLE public.security_incidents
  ADD COLUMN IF NOT EXISTS incident_number TEXT,
  ADD COLUMN IF NOT EXISTS title TEXT,
  ADD COLUMN IF NOT EXISTS description TEXT,
  ADD COLUMN IF NOT EXISTS category TEXT,
  ADD COLUMN IF NOT EXISTS estimated_financial_impact NUMERIC(12,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS data_exposure_scope TEXT[],
  ADD COLUMN IF NOT EXISTS assigned_to UUID,
  ADD COLUMN IF NOT EXISTS escalated_to UUID,
  ADD COLUMN IF NOT EXISTS containment_actions JSONB DEFAULT '[]'::JSONB,
  ADD COLUMN IF NOT EXISTS eradication_steps JSONB DEFAULT '[]'::JSONB,
  ADD COLUMN IF NOT EXISTS recovery_steps JSONB DEFAULT '[]'::JSONB,
  ADD COLUMN IF NOT EXISTS triaged_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS contained_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS eradicated_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS recovered_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS resolved_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS closed_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS root_cause TEXT,
  ADD COLUMN IF NOT EXISTS lessons_learned TEXT,
  ADD COLUMN IF NOT EXISTS post_mortem_url TEXT,
  ADD COLUMN IF NOT EXISTS related_fraud_alerts UUID[],
  ADD COLUMN IF NOT EXISTS related_threat_events UUID[],
  ADD COLUMN IF NOT EXISTS source_ip INET,
  ADD COLUMN IF NOT EXISTS attack_vector TEXT,
  ADD COLUMN IF NOT EXISTS ioc_indicators JSONB DEFAULT '[]'::JSONB,
  ADD COLUMN IF NOT EXISTS created_by UUID,
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();

-- Incident timeline / response actions
CREATE TABLE IF NOT EXISTS public.incident_timeline (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  incident_id UUID NOT NULL REFERENCES public.security_incidents(id) ON DELETE CASCADE,
  action_type TEXT NOT NULL CHECK (action_type IN (
    'status_change', 'note', 'containment', 'eradication', 'recovery',
    'evidence_collected', 'notification_sent', 'escalation', 'external_report',
    'automated_action', 'manual_action'
  )),
  description TEXT NOT NULL,
  performed_by UUID REFERENCES public.profiles(id),
  automated BOOLEAN DEFAULT FALSE,
  evidence JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_incident_timeline
  ON public.incident_timeline(incident_id, created_at);

-- Auto-generate incident number
CREATE OR REPLACE FUNCTION public.generate_incident_number()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.incident_number IS NULL THEN
    NEW.incident_number := 'INC-' || TO_CHAR(NOW(), 'YYYYMMDD') || '-' ||
      LPAD(nextval('public.incident_number_seq')::TEXT, 4, '0');
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS generate_incident_number_trigger ON public.security_incidents;
CREATE TRIGGER generate_incident_number_trigger
BEFORE INSERT ON public.security_incidents
FOR EACH ROW
EXECUTE FUNCTION public.generate_incident_number();

-- ────────────────────────────────────────────────────────────────────────────
-- 7) AUTOMATED CONTAINMENT TRIGGERS
-- ────────────────────────────────────────────────────────────────────────────

-- Auto-lock account on critical fraud score
CREATE OR REPLACE FUNCTION public.auto_containment_on_fraud()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _incident_id UUID;
BEGIN
  -- Auto-block when score exceeds threshold
  IF NEW.composite_score >= NEW.auto_block_threshold AND
     OLD.composite_score < NEW.auto_block_threshold THEN

    -- Lock the profile
    UPDATE public.profiles
    SET status = 'suspended'
    WHERE id = NEW.profile_id
      AND status != 'suspended';

    -- Revoke all active sessions
    UPDATE public.active_sessions
    SET is_active = FALSE,
        revoked_at = NOW(),
        revocation_reason = 'auto_containment_fraud_score'
    WHERE profile_id = NEW.profile_id
      AND is_active = TRUE;

    -- Create security incident
    INSERT INTO public.security_incidents (
      title, description, severity, category,
      affected_profiles_count, source_ip, created_by
    ) VALUES (
      'Auto-Containment: Fraud Score Threshold Exceeded',
      format('Profile %s reached fraud score %s (threshold: %s). Account auto-suspended.',
             NEW.profile_id, NEW.composite_score, NEW.auto_block_threshold),
      'p2_high', 'fraud', 1, NULL, NULL
    ) RETURNING id INTO _incident_id;

    -- Log to incident timeline
    INSERT INTO public.incident_timeline (
      incident_id, action_type, description, automated
    ) VALUES (
      _incident_id, 'automated_action',
      'Account auto-suspended. All sessions revoked. Fraud risk score: ' || NEW.composite_score,
      TRUE
    );

    -- Audit
    INSERT INTO public.audit_log (
      action, table_name, record_id, severity, category,
      new_data
    ) VALUES (
      'AUTO_CONTAINMENT', 'fraud_risk_profiles', NEW.profile_id::TEXT,
      'critical', 'security',
      jsonb_build_object(
        'fraud_score', NEW.composite_score,
        'threshold', NEW.auto_block_threshold,
        'action', 'account_suspended_sessions_revoked'
      )
    );
  END IF;

  -- Flag for manual review
  IF NEW.composite_score >= NEW.manual_review_threshold AND
     OLD.composite_score < NEW.manual_review_threshold AND
     NEW.composite_score < NEW.auto_block_threshold THEN

    INSERT INTO public.audit_log (
      action, table_name, record_id, severity, category,
      new_data
    ) VALUES (
      'FRAUD_REVIEW_REQUIRED', 'fraud_risk_profiles', NEW.profile_id::TEXT,
      'warning', 'fraud',
      jsonb_build_object(
        'fraud_score', NEW.composite_score,
        'review_threshold', NEW.manual_review_threshold,
        'factors', NEW.factors
      )
    );
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS auto_containment_fraud_trigger ON public.fraud_risk_profiles;
CREATE TRIGGER auto_containment_fraud_trigger
AFTER UPDATE OF composite_score ON public.fraud_risk_profiles
FOR EACH ROW
EXECUTE FUNCTION public.auto_containment_on_fraud();

-- ────────────────────────────────────────────────────────────────────────────
-- 8) API KEY MANAGEMENT
-- ────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.api_keys (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  key_hash TEXT NOT NULL,                      -- SHA-256 hash (never store raw key)
  key_prefix TEXT NOT NULL,                    -- First 8 chars for identification
  name TEXT NOT NULL,
  description TEXT,
  permissions TEXT[] NOT NULL DEFAULT '{"read"}'::TEXT[],
  allowed_ips INET[],                          -- IP whitelist (NULL = all)
  allowed_origins TEXT[],                      -- CORS origins
  rate_limit_per_minute INTEGER DEFAULT 60,
  rate_limit_per_hour INTEGER DEFAULT 1000,
  total_requests BIGINT DEFAULT 0,
  last_used_at TIMESTAMPTZ,
  last_used_ip INET,
  expires_at TIMESTAMPTZ,
  is_active BOOLEAN DEFAULT TRUE,
  revoked_at TIMESTAMPTZ,
  revoked_reason TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_api_keys_hash
  ON public.api_keys(key_hash);

CREATE INDEX IF NOT EXISTS idx_api_keys_prefix
  ON public.api_keys(key_prefix);

CREATE INDEX IF NOT EXISTS idx_api_keys_profile
  ON public.api_keys(profile_id, is_active)
  WHERE is_active = TRUE;

-- API key usage log (for analytics and abuse detection)
CREATE TABLE IF NOT EXISTS public.api_key_usage (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  api_key_id UUID NOT NULL REFERENCES public.api_keys(id),
  endpoint TEXT NOT NULL,
  method TEXT NOT NULL,
  status_code INTEGER,
  response_time_ms INTEGER,
  ip_address INET,
  user_agent TEXT,
  error_message TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_api_usage_key_time
  ON public.api_key_usage(api_key_id, created_at DESC);

-- Partition by month for performance (keep 6 months)
-- Note: Partitioning done manually or via pg_cron

-- ────────────────────────────────────────────────────────────────────────────
-- 9) DATA CLASSIFICATION & RETENTION
-- ────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.data_classification_policies (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  table_name TEXT NOT NULL,
  column_name TEXT NOT NULL,
  classification TEXT NOT NULL CHECK (classification IN (
    'public', 'internal', 'confidential', 'restricted', 'pii', 'phi', 'financial'
  )),
  retention_days INTEGER,                      -- NULL = indefinite
  requires_encryption BOOLEAN DEFAULT FALSE,
  requires_masking BOOLEAN DEFAULT FALSE,
  masking_pattern TEXT,                        -- e.g., '****####' for IBAN
  gdpr_article TEXT,                           -- Relevant GDPR article
  legal_basis TEXT,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT uq_data_classification UNIQUE (table_name, column_name)
);

-- Seed data classification for sensitive fields
INSERT INTO public.data_classification_policies (table_name, column_name, classification, retention_days, requires_encryption, requires_masking, masking_pattern, gdpr_article) VALUES
  ('profiles', 'email', 'pii', NULL, FALSE, TRUE, '***@***.**', 'Art. 6(1)(b)'),
  ('profiles', 'first_name', 'pii', NULL, FALSE, FALSE, NULL, 'Art. 6(1)(b)'),
  ('profiles', 'last_name', 'pii', NULL, FALSE, FALSE, NULL, 'Art. 6(1)(b)'),
  ('profiles', 'id_number', 'restricted', NULL, TRUE, TRUE, '****####', 'Art. 6(1)(c)'),
  ('profiles', 'iban', 'financial', NULL, TRUE, TRUE, '****####', 'Art. 6(1)(b)'),
  ('profiles', 'bic', 'financial', NULL, FALSE, FALSE, NULL, 'Art. 6(1)(b)'),
  ('profiles', 'phone', 'pii', NULL, FALSE, TRUE, '+##****####', 'Art. 6(1)(a)'),
  ('profiles', 'ip_address', 'pii', 90, FALSE, FALSE, NULL, 'Art. 6(1)(f)'),
  ('wallets', 'available_balance', 'financial', NULL, FALSE, FALSE, NULL, 'Art. 6(1)(b)'),
  ('transactions', 'amount', 'financial', 3650, FALSE, FALSE, NULL, 'Art. 6(1)(c)'),
  ('withdrawal_requests', 'iban', 'financial', 3650, TRUE, TRUE, '****####', 'Art. 6(1)(b)'),
  ('audit_log', 'ip_address', 'pii', 365, FALSE, FALSE, NULL, 'Art. 6(1)(f)'),
  ('active_sessions', 'ip_address', 'pii', 90, FALSE, FALSE, NULL, 'Art. 6(1)(f)'),
  ('login_attempts', 'ip_address', 'pii', 90, FALSE, FALSE, NULL, 'Art. 6(1)(f)'),
  ('kyc_verifications', 'document_number_hash', 'restricted', 3650, TRUE, FALSE, NULL, 'Art. 6(1)(c)'),
  ('kyc_verifications', 'document_front_url', 'restricted', 3650, TRUE, FALSE, NULL, 'Art. 6(1)(c)'),
  ('mfa_secrets', 'encrypted_secret', 'restricted', NULL, TRUE, FALSE, NULL, 'Art. 6(1)(f)')
ON CONFLICT (table_name, column_name) DO NOTHING;

-- GDPR data subject access request tracking
CREATE TABLE IF NOT EXISTS public.dsar_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id UUID NOT NULL REFERENCES public.profiles(id),
  request_type TEXT NOT NULL CHECK (request_type IN (
    'access', 'rectification', 'erasure', 'restriction', 'portability', 'objection'
  )),
  status TEXT NOT NULL DEFAULT 'received'
    CHECK (status IN ('received', 'verified', 'processing', 'completed', 'denied')),
  requester_email TEXT NOT NULL,
  identity_verified BOOLEAN DEFAULT FALSE,
  identity_verification_method TEXT,
  data_scope TEXT[],                           -- Which data categories requested
  response_data JSONB,                         -- For access requests
  response_file_url TEXT,                      -- Download link for portability
  denial_reason TEXT,
  processing_notes TEXT,
  deadline_at TIMESTAMPTZ NOT NULL DEFAULT (NOW() + INTERVAL '30 days'),
  completed_at TIMESTAMPTZ,
  processed_by UUID REFERENCES public.profiles(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_dsar_pending
  ON public.dsar_requests(status, deadline_at)
  WHERE status NOT IN ('completed', 'denied');

-- ────────────────────────────────────────────────────────────────────────────
-- 10) SIEM CORRELATION & THREAT INTELLIGENCE
-- ────────────────────────────────────────────────────────────────────────────

-- IOC (Indicators of Compromise) database
CREATE TABLE IF NOT EXISTS public.ioc_database (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ioc_type TEXT NOT NULL CHECK (ioc_type IN (
    'ip', 'domain', 'url', 'email', 'file_hash', 'user_agent', 'asn', 'cidr'
  )),
  ioc_value TEXT NOT NULL,
  threat_type TEXT CHECK (threat_type IN (
    'malware', 'phishing', 'c2', 'botnet', 'scanner', 'brute_force',
    'credential_stuffing', 'tor_exit', 'vpn', 'proxy', 'spam'
  )),
  severity TEXT NOT NULL DEFAULT 'medium'
    CHECK (severity IN ('low', 'medium', 'high', 'critical')),
  confidence INTEGER DEFAULT 50 CHECK (confidence BETWEEN 0 AND 100),
  source TEXT NOT NULL,                        -- Intelligence source
  first_seen TIMESTAMPTZ DEFAULT NOW(),
  last_seen TIMESTAMPTZ DEFAULT NOW(),
  expiry TIMESTAMPTZ DEFAULT (NOW() + INTERVAL '90 days'),
  tags TEXT[],
  context JSONB DEFAULT '{}'::JSONB,
  is_active BOOLEAN DEFAULT TRUE,
  CONSTRAINT uq_ioc UNIQUE (ioc_type, ioc_value)
);

CREATE INDEX IF NOT EXISTS idx_ioc_type_value
  ON public.ioc_database(ioc_type, ioc_value)
  WHERE is_active = TRUE;

CREATE INDEX IF NOT EXISTS idx_ioc_severity
  ON public.ioc_database(severity, threat_type)
  WHERE is_active = TRUE;

-- SIEM correlation rules
CREATE TABLE IF NOT EXISTS public.siem_correlation_rules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  rule_name TEXT NOT NULL UNIQUE,
  description TEXT,
  -- Correlation window
  time_window_seconds INTEGER NOT NULL DEFAULT 300,
  -- Event patterns
  event_patterns JSONB NOT NULL,               -- Array of event type patterns to correlate
  min_event_count INTEGER DEFAULT 2,
  -- Actions
  alert_severity TEXT NOT NULL DEFAULT 'medium'
    CHECK (alert_severity IN ('low', 'medium', 'high', 'critical')),
  auto_create_incident BOOLEAN DEFAULT FALSE,
  auto_block_ip BOOLEAN DEFAULT FALSE,
  auto_suspend_account BOOLEAN DEFAULT FALSE,
  notification_channels TEXT[] DEFAULT '{"audit_log"}'::TEXT[],
  -- Status
  is_enabled BOOLEAN DEFAULT TRUE,
  last_triggered_at TIMESTAMPTZ,
  trigger_count INTEGER DEFAULT 0,
  false_positive_count INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Seed SIEM correlation rules
INSERT INTO public.siem_correlation_rules (rule_name, description, time_window_seconds, event_patterns, min_event_count, alert_severity, auto_create_incident) VALUES
  ('brute_force_to_success', 'Multiple failed logins followed by success', 600,
   '[{"type": "failed_login", "min_count": 5}, {"type": "successful_login", "min_count": 1}]'::JSONB,
   6, 'high', TRUE),
  ('privilege_escalation_chain', 'Role change followed by sensitive data access', 300,
   '[{"type": "role_change"}, {"type": "data_access", "category": "financial"}]'::JSONB,
   2, 'critical', TRUE),
  ('data_exfiltration_pattern', 'Mass data reads in short window', 120,
   '[{"type": "data_access", "min_count": 50}]'::JSONB,
   50, 'critical', TRUE),
  ('account_takeover_sequence', 'Password change + email change + withdrawal', 1800,
   '[{"type": "password_change"}, {"type": "email_change"}, {"type": "withdrawal_request"}]'::JSONB,
   3, 'critical', TRUE),
  ('suspicious_registration_wave', 'Mass registrations from same network', 3600,
   '[{"type": "registration", "min_count": 10, "group_by": "ip_network"}]'::JSONB,
   10, 'high', TRUE),
  ('commission_manipulation', 'Rapid commission creation outside normal cycle', 300,
   '[{"type": "commission_created", "min_count": 20}]'::JSONB,
   20, 'critical', TRUE)
ON CONFLICT (rule_name) DO NOTHING;

-- Correlated alert storage
CREATE TABLE IF NOT EXISTS public.siem_correlated_alerts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  correlation_rule_id UUID NOT NULL REFERENCES public.siem_correlation_rules(id),
  severity TEXT NOT NULL,
  title TEXT NOT NULL,
  description TEXT,
  correlated_events JSONB NOT NULL,            -- Array of event references
  affected_profiles UUID[],
  affected_ips INET[],
  auto_actions_taken JSONB DEFAULT '[]'::JSONB,
  status TEXT DEFAULT 'open' CHECK (status IN ('open', 'investigating', 'resolved', 'false_positive')),
  resolved_by UUID REFERENCES public.profiles(id),
  resolved_at TIMESTAMPTZ,
  incident_id UUID REFERENCES public.security_incidents(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_siem_alerts_open
  ON public.siem_correlated_alerts(status, severity, created_at DESC)
  WHERE status IN ('open', 'investigating');

-- ────────────────────────────────────────────────────────────────────────────
-- 11) IP REPUTATION & GEO-BLOCKING
-- ────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.ip_reputation (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ip_address INET NOT NULL,
  reputation_score INTEGER DEFAULT 50 CHECK (reputation_score BETWEEN 0 AND 100),
  -- 100 = trusted, 0 = malicious
  is_tor BOOLEAN DEFAULT FALSE,
  is_vpn BOOLEAN DEFAULT FALSE,
  is_proxy BOOLEAN DEFAULT FALSE,
  is_datacenter BOOLEAN DEFAULT FALSE,
  is_known_attacker BOOLEAN DEFAULT FALSE,
  country_code TEXT,
  asn INTEGER,
  org_name TEXT,
  abuse_reports INTEGER DEFAULT 0,
  failed_logins INTEGER DEFAULT 0,
  successful_logins INTEGER DEFAULT 0,
  blocked_requests INTEGER DEFAULT 0,
  first_seen TIMESTAMPTZ DEFAULT NOW(),
  last_seen TIMESTAMPTZ DEFAULT NOW(),
  manually_blocked BOOLEAN DEFAULT FALSE,
  manually_whitelisted BOOLEAN DEFAULT FALSE,
  blocked_reason TEXT,
  notes TEXT,
  CONSTRAINT uq_ip_reputation UNIQUE (ip_address)
);

CREATE INDEX IF NOT EXISTS idx_ip_rep_score
  ON public.ip_reputation(reputation_score)
  WHERE reputation_score < 30;

-- Country/region blocking rules
CREATE TABLE IF NOT EXISTS public.geo_blocking_rules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  country_code TEXT NOT NULL,
  country_name TEXT,
  action TEXT NOT NULL DEFAULT 'block'
    CHECK (action IN ('block', 'challenge', 'log_only', 'rate_limit')),
  reason TEXT,
  applies_to TEXT[] DEFAULT '{"all"}'::TEXT[],  -- 'all','login','registration','withdrawal','api'
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT uq_geo_block UNIQUE (country_code)
);

-- ────────────────────────────────────────────────────────────────────────────
-- 12) COMPLIANCE REPORTING ENGINE
-- ────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.compliance_reports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  report_type TEXT NOT NULL CHECK (report_type IN (
    'gdpr_dpia', 'pci_dss', 'iso27001', 'soc2', 'aml_sar',
    'incident_summary', 'access_review', 'risk_assessment', 'audit_trail'
  )),
  title TEXT NOT NULL,
  period_start DATE NOT NULL,
  period_end DATE NOT NULL,
  status TEXT NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft', 'in_review', 'approved', 'submitted', 'archived')),
  -- Content
  executive_summary TEXT,
  findings JSONB DEFAULT '[]'::JSONB,
  recommendations JSONB DEFAULT '[]'::JSONB,
  metrics JSONB DEFAULT '{}'::JSONB,
  risk_rating TEXT CHECK (risk_rating IN ('low', 'medium', 'high', 'critical')),
  -- Workflow
  generated_by UUID REFERENCES public.profiles(id),
  reviewed_by UUID REFERENCES public.profiles(id),
  approved_by UUID REFERENCES public.profiles(id),
  approved_at TIMESTAMPTZ,
  external_submission_ref TEXT,                 -- Reference for regulatory submissions
  -- Files
  report_file_url TEXT,
  supporting_documents JSONB DEFAULT '[]'::JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_compliance_reports_type
  ON public.compliance_reports(report_type, period_end DESC);

-- ────────────────────────────────────────────────────────────────────────────
-- 13) WEBHOOK & NOTIFICATION INFRASTRUCTURE
-- ────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.notification_channels (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  channel_type TEXT NOT NULL CHECK (channel_type IN (
    'email', 'sms', 'webhook', 'slack', 'telegram', 'in_app', 'pagerduty'
  )),
  name TEXT NOT NULL,
  config JSONB NOT NULL DEFAULT '{}'::JSONB,    -- Channel-specific config (URL, API key hash, etc.)
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.notification_rules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  description TEXT,
  event_type TEXT NOT NULL,                    -- 'fraud_alert', 'incident_created', 'withdrawal_requested', etc.
  severity_filter TEXT[],                      -- Only trigger for these severities
  channel_id UUID NOT NULL REFERENCES public.notification_channels(id),
  template TEXT,                               -- Message template with {{variable}} placeholders
  is_active BOOLEAN DEFAULT TRUE,
  cooldown_seconds INTEGER DEFAULT 300,
  last_sent_at TIMESTAMPTZ,
  total_sent INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.notification_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  rule_id UUID REFERENCES public.notification_rules(id),
  channel_id UUID NOT NULL REFERENCES public.notification_channels(id),
  event_type TEXT NOT NULL,
  recipient TEXT,
  subject TEXT,
  body TEXT,
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'sent', 'delivered', 'failed', 'bounced')),
  error_message TEXT,
  sent_at TIMESTAMPTZ,
  delivered_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_notification_log_status
  ON public.notification_log(status, created_at DESC)
  WHERE status IN ('pending', 'failed');

-- ────────────────────────────────────────────────────────────────────────────
-- 14) ENFORCE KYC LIMITS ON FINANCIAL OPERATIONS
-- ────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.enforce_kyc_limits()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _kyc_level TEXT;
  _limits RECORD;
  _daily_total NUMERIC;
  _monthly_total NUMERIC;
BEGIN
  -- Get KYC verification level
  SELECT COALESCE(
    (SELECT verification_level FROM public.kyc_verifications
     WHERE profile_id = NEW.customer_id AND status = 'approved'
     ORDER BY created_at DESC LIMIT 1),
    'none'
  ) INTO _kyc_level;

  -- Get limits for this level
  SELECT * INTO _limits FROM public.kyc_limits WHERE verification_level = _kyc_level;

  IF _limits IS NULL THEN
    RETURN NEW;  -- No limits configured, allow
  END IF;

  -- Check single transaction limit
  IF NEW.amount > _limits.max_single_transaction THEN
    RAISE EXCEPTION 'Transaktionslimit überschritten. KYC-Level: %. Max: €%',
      _kyc_level, _limits.max_single_transaction;
  END IF;

  -- Check daily volume
  SELECT COALESCE(SUM(amount), 0) INTO _daily_total
  FROM public.transactions
  WHERE customer_id = NEW.customer_id
    AND created_at >= CURRENT_DATE
    AND status != 'cancelled';

  IF (_daily_total + NEW.amount) > _limits.max_daily_volume THEN
    RAISE EXCEPTION 'Tägliches Volumenlimit überschritten. KYC-Level: %. Max: €%/Tag',
      _kyc_level, _limits.max_daily_volume;
  END IF;

  -- Check monthly volume
  SELECT COALESCE(SUM(amount), 0) INTO _monthly_total
  FROM public.transactions
  WHERE customer_id = NEW.customer_id
    AND created_at >= DATE_TRUNC('month', CURRENT_DATE)
    AND status != 'cancelled';

  IF (_monthly_total + NEW.amount) > _limits.max_monthly_volume THEN
    RAISE EXCEPTION 'Monatliches Volumenlimit überschritten. KYC-Level: %. Max: €%/Monat',
      _kyc_level, _limits.max_monthly_volume;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS enforce_kyc_on_transaction ON public.transactions;
CREATE TRIGGER enforce_kyc_on_transaction
BEFORE INSERT ON public.transactions
FOR EACH ROW
EXECUTE FUNCTION public.enforce_kyc_limits();

-- Enforce KYC on withdrawals
CREATE OR REPLACE FUNCTION public.enforce_kyc_withdrawal_limits()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _kyc_level TEXT;
  _limits RECORD;
  _monthly_withdrawn NUMERIC;
BEGIN
  SELECT COALESCE(
    (SELECT verification_level FROM public.kyc_verifications
     WHERE profile_id = NEW.profile_id AND status = 'approved'
     ORDER BY created_at DESC LIMIT 1),
    'none'
  ) INTO _kyc_level;

  SELECT * INTO _limits FROM public.kyc_limits WHERE verification_level = _kyc_level;

  IF _limits IS NULL THEN
    RETURN NEW;
  END IF;

  IF NOT _limits.can_withdraw THEN
    RAISE EXCEPTION 'Auszahlung nicht möglich. KYC-Verifizierung erforderlich (aktuell: %)', _kyc_level;
  END IF;

  IF NEW.amount > _limits.max_withdrawal_per_request THEN
    RAISE EXCEPTION 'Auszahlungslimit pro Anfrage überschritten. Max: €%', _limits.max_withdrawal_per_request;
  END IF;

  SELECT COALESCE(SUM(amount), 0) INTO _monthly_withdrawn
  FROM public.withdrawal_requests
  WHERE profile_id = NEW.profile_id
    AND created_at >= DATE_TRUNC('month', CURRENT_DATE)
    AND status NOT IN ('rejected', 'cancelled');

  IF (_monthly_withdrawn + NEW.amount) > _limits.max_monthly_withdrawal THEN
    RAISE EXCEPTION 'Monatliches Auszahlungslimit überschritten. Max: €%/Monat', _limits.max_monthly_withdrawal;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS enforce_kyc_on_withdrawal ON public.withdrawal_requests;
CREATE TRIGGER enforce_kyc_on_withdrawal
BEFORE INSERT ON public.withdrawal_requests
FOR EACH ROW
EXECUTE FUNCTION public.enforce_kyc_withdrawal_limits();

-- ────────────────────────────────────────────────────────────────────────────
-- 15) CONCURRENT SESSION LIMIT ENFORCEMENT
-- ────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.enforce_session_limits()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _max_sessions INTEGER := 5;
  _active_count INTEGER;
  _role TEXT;
BEGIN
  -- Admins get more sessions
  SELECT role INTO _role FROM public.profiles WHERE id = NEW.profile_id;
  IF _role IN ('admin', 'super_admin') THEN
    _max_sessions := 10;
  END IF;

  SELECT COUNT(*) INTO _active_count
  FROM public.active_sessions
  WHERE profile_id = NEW.profile_id
    AND is_active = TRUE
    AND expires_at > NOW();

  -- If at max, revoke the oldest session
  IF _active_count >= _max_sessions THEN
    UPDATE public.active_sessions
    SET is_active = FALSE,
        revoked_at = NOW(),
        revocation_reason = 'max_sessions_exceeded'
    WHERE id = (
      SELECT id FROM public.active_sessions
      WHERE profile_id = NEW.profile_id
        AND is_active = TRUE
      ORDER BY last_active_at ASC
      LIMIT 1
    );
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS enforce_session_limit_trigger ON public.active_sessions;
CREATE TRIGGER enforce_session_limit_trigger
BEFORE INSERT ON public.active_sessions
FOR EACH ROW
EXECUTE FUNCTION public.enforce_session_limits();

-- ────────────────────────────────────────────────────────────────────────────
-- 16) IP CORRELATION ON LOGIN
-- ────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.update_ip_reputation_on_login()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.ip_reputation (ip_address, last_seen)
  VALUES (NEW.ip_address, NOW())
  ON CONFLICT (ip_address) DO UPDATE
    SET last_seen = NOW(),
        successful_logins = public.ip_reputation.successful_logins + 1;

  -- Check IOC database for this IP
  IF EXISTS (
    SELECT 1 FROM public.ioc_database
    WHERE ioc_type = 'ip'
      AND ioc_value = host(NEW.ip_address)
      AND is_active = TRUE
      AND (expiry IS NULL OR expiry > NOW())
  ) THEN
    -- Flag session as high risk
    NEW.risk_score := GREATEST(NEW.risk_score, 80);

    INSERT INTO public.audit_log (
      action, table_name, record_id, severity, category,
      new_data
    ) VALUES (
      'IOC_IP_MATCH', 'active_sessions', NEW.id::TEXT,
      'critical', 'security',
      jsonb_build_object('ip', host(NEW.ip_address), 'profile_id', NEW.profile_id)
    );
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS ip_reputation_on_session ON public.active_sessions;
CREATE TRIGGER ip_reputation_on_session
BEFORE INSERT ON public.active_sessions
FOR EACH ROW
EXECUTE FUNCTION public.update_ip_reputation_on_login();

-- ────────────────────────────────────────────────────────────────────────────
-- 17) FAILED LOGIN TRACKING WITH AUTO-LOCKOUT
-- ────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.track_failed_login()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _recent_failures INTEGER;
  _profile_id UUID;
BEGIN
  IF NEW.success = FALSE THEN
    -- Update IP reputation
    INSERT INTO public.ip_reputation (ip_address, failed_logins, last_seen)
    VALUES (NEW.ip_address, 1, NOW())
    ON CONFLICT (ip_address) DO UPDATE
      SET failed_logins = public.ip_reputation.failed_logins + 1,
          last_seen = NOW(),
          reputation_score = GREATEST(0, public.ip_reputation.reputation_score - 5);

    -- Count recent failures for this email/IP
    SELECT COUNT(*) INTO _recent_failures
    FROM public.login_attempts
    WHERE (email = NEW.email OR ip_address = NEW.ip_address)
      AND success = FALSE
      AND attempted_at > NOW() - INTERVAL '15 minutes';

    -- Auto-lock after 10 consecutive failures
    IF _recent_failures >= 10 THEN
      SELECT id INTO _profile_id FROM public.profiles WHERE email = NEW.email;

      IF _profile_id IS NOT NULL THEN
        -- Temporarily lock (30 min)
        UPDATE public.profiles
        SET status = 'locked'
        WHERE id = _profile_id AND status = 'active';

        INSERT INTO public.audit_log (
          action, table_name, record_id, severity, category,
          new_data
        ) VALUES (
          'AUTO_LOCKOUT', 'profiles', _profile_id::TEXT,
          'warning', 'authentication',
          jsonb_build_object(
            'reason', 'brute_force_protection',
            'failed_attempts', _recent_failures,
            'ip', host(NEW.ip_address)
          )
        );

        -- Block IP temporarily
        UPDATE public.ip_reputation
        SET manually_blocked = TRUE,
            blocked_reason = 'auto_lockout_brute_force'
        WHERE ip_address = NEW.ip_address;
      END IF;
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS track_login_attempt ON public.login_attempts;
CREATE TRIGGER track_login_attempt
AFTER INSERT ON public.login_attempts
FOR EACH ROW
EXECUTE FUNCTION public.track_failed_login();

-- ────────────────────────────────────────────────────────────────────────────
-- 18) RLS POLICIES FOR NEW TABLES
-- ────────────────────────────────────────────────────────────────────────────

-- Active Sessions
ALTER TABLE public.active_sessions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users see own sessions"
ON public.active_sessions FOR SELECT
TO authenticated
USING (profile_id = public.get_profile_id(auth.uid()) OR public.is_super_admin());

CREATE POLICY "Users can revoke own sessions"
ON public.active_sessions FOR UPDATE
TO authenticated
USING (profile_id = public.get_profile_id(auth.uid()) OR public.is_super_admin())
WITH CHECK (profile_id = public.get_profile_id(auth.uid()) OR public.is_super_admin());

-- Known Devices
ALTER TABLE public.known_devices ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users see own devices"
ON public.known_devices FOR SELECT
TO authenticated
USING (profile_id = public.get_profile_id(auth.uid()) OR public.is_super_admin());

CREATE POLICY "Users manage own devices"
ON public.known_devices FOR ALL
TO authenticated
USING (profile_id = public.get_profile_id(auth.uid()) OR public.is_super_admin());

-- MFA Secrets (user + admin)
ALTER TABLE public.mfa_secrets ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage own MFA"
ON public.mfa_secrets FOR ALL
TO authenticated
USING (profile_id = public.get_profile_id(auth.uid()));

-- MFA Recovery Codes
ALTER TABLE public.mfa_recovery_codes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users see own recovery codes"
ON public.mfa_recovery_codes FOR SELECT
TO authenticated
USING (profile_id = public.get_profile_id(auth.uid()));

-- MFA Challenges
ALTER TABLE public.mfa_challenges ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users see own challenges"
ON public.mfa_challenges FOR SELECT
TO authenticated
USING (profile_id = public.get_profile_id(auth.uid()));

-- KYC Verifications
ALTER TABLE public.kyc_verifications ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users see own KYC"
ON public.kyc_verifications FOR SELECT
TO authenticated
USING (profile_id = public.get_profile_id(auth.uid()) OR public.is_admin());

CREATE POLICY "Users submit own KYC"
ON public.kyc_verifications FOR INSERT
TO authenticated
WITH CHECK (profile_id = public.get_profile_id(auth.uid()));

CREATE POLICY "Admins manage KYC"
ON public.kyc_verifications FOR UPDATE
TO authenticated
USING (public.is_admin())
WITH CHECK (public.is_admin());

-- Fraud Risk Profiles (admin only)
ALTER TABLE public.fraud_risk_profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins manage fraud profiles"
ON public.fraud_risk_profiles FOR ALL
TO authenticated
USING (public.is_admin());

-- Fraud Rules (admin only)
ALTER TABLE public.fraud_rules ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins manage fraud rules"
ON public.fraud_rules FOR ALL
TO authenticated
USING (public.is_admin());

-- Fraud Rule Triggers (admin only)
ALTER TABLE public.fraud_rule_triggers ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins see fraud triggers"
ON public.fraud_rule_triggers FOR SELECT
TO authenticated
USING (public.is_admin());

-- Security Incidents (admin only)
ALTER TABLE public.security_incidents ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins manage incidents" ON public.security_incidents;
CREATE POLICY "Admins manage incidents"
ON public.security_incidents FOR ALL
TO authenticated
USING (public.is_admin());

-- Incident Timeline
ALTER TABLE public.incident_timeline ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins see incident timeline"
ON public.incident_timeline FOR ALL
TO authenticated
USING (public.is_admin());

-- API Keys
ALTER TABLE public.api_keys ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage own API keys"
ON public.api_keys FOR ALL
TO authenticated
USING (profile_id = public.get_profile_id(auth.uid()) OR public.is_super_admin());

-- API Key Usage
ALTER TABLE public.api_key_usage ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users see own key usage"
ON public.api_key_usage FOR SELECT
TO authenticated
USING (
  api_key_id IN (
    SELECT id FROM public.api_keys WHERE profile_id = public.get_profile_id(auth.uid())
  )
  OR public.is_super_admin()
);

-- IOC Database (admin only)
ALTER TABLE public.ioc_database ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins manage IOC"
ON public.ioc_database FOR ALL
TO authenticated
USING (public.is_admin());

-- SIEM Rules (admin only)
ALTER TABLE public.siem_correlation_rules ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins manage SIEM rules"
ON public.siem_correlation_rules FOR ALL
TO authenticated
USING (public.is_admin());

-- SIEM Alerts (admin only)
ALTER TABLE public.siem_correlated_alerts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins manage SIEM alerts"
ON public.siem_correlated_alerts FOR ALL
TO authenticated
USING (public.is_admin());

-- IP Reputation (admin only)
ALTER TABLE public.ip_reputation ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins manage IP reputation"
ON public.ip_reputation FOR ALL
TO authenticated
USING (public.is_admin());

-- Geo Blocking Rules (admin only)
ALTER TABLE public.geo_blocking_rules ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins manage geo blocking"
ON public.geo_blocking_rules FOR ALL
TO authenticated
USING (public.is_admin());

-- Compliance Reports (admin only)
ALTER TABLE public.compliance_reports ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins manage compliance reports"
ON public.compliance_reports FOR ALL
TO authenticated
USING (public.is_admin());

-- DSAR Requests
ALTER TABLE public.dsar_requests ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users see own DSAR"
ON public.dsar_requests FOR SELECT
TO authenticated
USING (profile_id = public.get_profile_id(auth.uid()) OR public.is_admin());

CREATE POLICY "Users create own DSAR"
ON public.dsar_requests FOR INSERT
TO authenticated
WITH CHECK (profile_id = public.get_profile_id(auth.uid()));

CREATE POLICY "Admins manage DSAR"
ON public.dsar_requests FOR UPDATE
TO authenticated
USING (public.is_admin());

-- Data Classification (admin only)
ALTER TABLE public.data_classification_policies ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins manage data classification"
ON public.data_classification_policies FOR ALL
TO authenticated
USING (public.is_admin());

-- AML Watchlist (admin only)
ALTER TABLE public.aml_watchlist ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins manage AML watchlist"
ON public.aml_watchlist FOR ALL
TO authenticated
USING (public.is_admin());

-- KYC Limits (admin read, super_admin write)
ALTER TABLE public.kyc_limits ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins read KYC limits"
ON public.kyc_limits FOR SELECT
TO authenticated
USING (public.is_admin());

CREATE POLICY "Super admins manage KYC limits"
ON public.kyc_limits FOR ALL
TO authenticated
USING (public.is_super_admin());

-- Notification tables (admin only)
ALTER TABLE public.notification_channels ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notification_rules ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notification_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins manage notification channels"
ON public.notification_channels FOR ALL
TO authenticated
USING (public.is_admin());

CREATE POLICY "Admins manage notification rules"
ON public.notification_rules FOR ALL
TO authenticated
USING (public.is_admin());

CREATE POLICY "Admins see notification log"
ON public.notification_log FOR SELECT
TO authenticated
USING (public.is_admin());

-- ────────────────────────────────────────────────────────────────────────────
-- 19) GRANT EXECUTE ON NEW FUNCTIONS TO AUTHENTICATED
-- ────────────────────────────────────────────────────────────────────────────

GRANT EXECUTE ON FUNCTION public.verify_audit_chain TO authenticated;
GRANT EXECUTE ON FUNCTION public.enforce_kyc_limits TO authenticated;
GRANT EXECUTE ON FUNCTION public.enforce_kyc_withdrawal_limits TO authenticated;
GRANT EXECUTE ON FUNCTION public.enforce_session_limits TO authenticated;
GRANT EXECUTE ON FUNCTION public.update_ip_reputation_on_login TO authenticated;
GRANT EXECUTE ON FUNCTION public.track_failed_login TO authenticated;
GRANT EXECUTE ON FUNCTION public.auto_containment_on_fraud TO authenticated;
GRANT EXECUTE ON FUNCTION public.audit_hash_chain TO authenticated;
GRANT EXECUTE ON FUNCTION public.generate_incident_number TO authenticated;

-- Ensure pgcrypto extension for digest()
CREATE EXTENSION IF NOT EXISTS pgcrypto;

COMMIT;
