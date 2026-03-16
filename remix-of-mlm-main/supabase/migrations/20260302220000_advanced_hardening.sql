-- ============================================================================
-- PHASE 4: ADVANCED HARDENING
-- Transaction limits, anomaly detection triggers, four-eyes principle
-- ============================================================================

BEGIN;

-- ============================================================================
-- 1. TRANSACTION LIMITS
-- ============================================================================

-- Daily withdrawal limit per user
CREATE OR REPLACE FUNCTION check_daily_withdrawal_limit()
RETURNS TRIGGER AS $$
DECLARE
  daily_total NUMERIC;
  daily_limit NUMERIC := 5000; -- €5000 daily limit
BEGIN
  SELECT COALESCE(SUM(amount), 0) INTO daily_total
  FROM withdrawal_requests
  WHERE wallet_id = NEW.wallet_id
    AND created_at >= CURRENT_DATE
    AND status NOT IN ('rejected', 'cancelled');

  IF daily_total + NEW.amount > daily_limit THEN
    RAISE EXCEPTION 'Tägliches Auszahlungslimit (€%) überschritten. Bereits ausgezahlt: €%',
      daily_limit, daily_total;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_check_withdrawal_limit ON withdrawal_requests;
CREATE TRIGGER trg_check_withdrawal_limit
  BEFORE INSERT ON withdrawal_requests
  FOR EACH ROW
  EXECUTE FUNCTION check_daily_withdrawal_limit();

-- ============================================================================
-- 2. FOUR-EYES PRINCIPLE FOR HIGH-VALUE OPERATIONS
-- ============================================================================

CREATE TABLE IF NOT EXISTS approval_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  action_type TEXT NOT NULL, -- 'withdrawal_approve', 'commission_pay_batch', 'credit_note_approve'
  record_id TEXT NOT NULL,
  requested_by UUID NOT NULL REFERENCES profiles(id),
  approved_by UUID REFERENCES profiles(id),
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
  amount NUMERIC,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  resolved_at TIMESTAMPTZ
);

ALTER TABLE approval_requests ENABLE ROW LEVEL SECURITY;

CREATE POLICY "admins_manage_approvals" ON approval_requests
  FOR ALL USING (
    EXISTS (SELECT 1 FROM profiles p WHERE p.user_id = auth.uid() AND p.role = 'admin')
  );

-- Ensure approver is different from requester
CREATE OR REPLACE FUNCTION enforce_four_eyes()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.status = 'approved' AND NEW.approved_by = NEW.requested_by THEN
    RAISE EXCEPTION 'Vier-Augen-Prinzip: Genehmiger und Antragsteller müssen verschieden sein';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_four_eyes ON approval_requests;
CREATE TRIGGER trg_four_eyes
  BEFORE UPDATE ON approval_requests
  FOR EACH ROW
  EXECUTE FUNCTION enforce_four_eyes();

-- ============================================================================
-- 3. ANOMALY DETECTION TRIGGERS
-- ============================================================================

-- Detect unusual commission amounts (>500€ single commission)
CREATE OR REPLACE FUNCTION detect_commission_anomaly()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.commission_amount > 500 THEN
    INSERT INTO fraud_alerts (profile_id, alert_type, severity, details)
    VALUES (NEW.partner_id, 'unusual_pattern', 'medium',
      jsonb_build_object(
        'reason', 'Ungewöhnlich hohe Provision',
        'amount', NEW.commission_amount,
        'commission_id', NEW.id
      ));
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_commission_anomaly ON commissions;
CREATE TRIGGER trg_commission_anomaly
  AFTER INSERT ON commissions
  FOR EACH ROW
  EXECUTE FUNCTION detect_commission_anomaly();

-- Detect rapid wallet activity (>10 transactions in 5 minutes)
CREATE OR REPLACE FUNCTION detect_wallet_velocity()
RETURNS TRIGGER AS $$
DECLARE
  recent_count INT;
BEGIN
  SELECT COUNT(*) INTO recent_count
  FROM wallet_transactions
  WHERE wallet_id = NEW.wallet_id
    AND created_at > now() - interval '5 minutes';

  IF recent_count > 10 THEN
    INSERT INTO fraud_alerts (
      profile_id, alert_type, severity, details
    ) SELECT
      w.profile_id, 'velocity_abuse', 'high',
      jsonb_build_object(
        'reason', 'Ungewöhnlich viele Wallet-Transaktionen',
        'count', recent_count,
        'window', '5 Minuten'
      )
    FROM wallets w WHERE w.id = NEW.wallet_id;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_wallet_velocity ON wallet_transactions;
CREATE TRIGGER trg_wallet_velocity
  AFTER INSERT ON wallet_transactions
  FOR EACH ROW
  EXECUTE FUNCTION detect_wallet_velocity();

-- ============================================================================
-- 4. SERVER-SIDE RATE LIMITING TABLE (replaces in-memory)
-- ============================================================================

CREATE TABLE IF NOT EXISTS rate_limits (
  key TEXT NOT NULL,
  window_start TIMESTAMPTZ NOT NULL,
  count INT NOT NULL DEFAULT 1,
  PRIMARY KEY (key, window_start)
);

CREATE INDEX IF NOT EXISTS idx_rate_limits_expiry ON rate_limits (window_start);

CREATE OR REPLACE FUNCTION check_rate_limit_db(
  p_key TEXT,
  p_max_requests INT DEFAULT 60,
  p_window_seconds INT DEFAULT 60
) RETURNS BOOLEAN AS $$
DECLARE
  v_window_start TIMESTAMPTZ;
  v_count INT;
BEGIN
  v_window_start := date_trunc('second', now()) - (EXTRACT(EPOCH FROM now())::INT % p_window_seconds) * interval '1 second';

  INSERT INTO rate_limits (key, window_start, count)
  VALUES (p_key, v_window_start, 1)
  ON CONFLICT (key, window_start) DO UPDATE SET count = rate_limits.count + 1
  RETURNING count INTO v_count;

  -- Cleanup old entries periodically
  IF random() < 0.01 THEN
    DELETE FROM rate_limits WHERE window_start < now() - interval '1 hour';
  END IF;

  RETURN v_count <= p_max_requests;
END;
$$ LANGUAGE plpgsql;

COMMIT;
