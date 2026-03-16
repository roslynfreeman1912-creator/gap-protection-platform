
-- =============================================
-- GAP Protection MLM Enterprise Extension
-- Wallet, Volume Tracking, Rank Engine, Bonuses, Fraud Detection
-- =============================================

-- 1. WALLET SYSTEM
CREATE TABLE public.wallets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  available_balance NUMERIC(12,2) NOT NULL DEFAULT 0,
  pending_balance NUMERIC(12,2) NOT NULL DEFAULT 0,
  total_earned NUMERIC(12,2) NOT NULL DEFAULT 0,
  total_withdrawn NUMERIC(12,2) NOT NULL DEFAULT 0,
  currency TEXT NOT NULL DEFAULT 'EUR',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(profile_id)
);

ALTER TABLE public.wallets ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own wallet" ON public.wallets
  FOR SELECT USING (profile_id = get_profile_id(auth.uid()));

CREATE POLICY "Admins can manage all wallets" ON public.wallets
  FOR ALL USING (is_admin()) WITH CHECK (is_admin());

-- 2. WALLET TRANSACTIONS (ledger)
CREATE TABLE public.wallet_transactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  wallet_id UUID NOT NULL REFERENCES public.wallets(id) ON DELETE CASCADE,
  profile_id UUID NOT NULL REFERENCES public.profiles(id),
  transaction_type TEXT NOT NULL CHECK (transaction_type IN ('commission', 'bonus', 'withdrawal', 'adjustment', 'reversal', 'pool_payout')),
  amount NUMERIC(12,2) NOT NULL,
  balance_after NUMERIC(12,2) NOT NULL DEFAULT 0,
  reference_id UUID,
  reference_type TEXT,
  description TEXT,
  status TEXT NOT NULL DEFAULT 'completed' CHECK (status IN ('pending', 'completed', 'reversed', 'failed')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.wallet_transactions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own wallet transactions" ON public.wallet_transactions
  FOR SELECT USING (profile_id = get_profile_id(auth.uid()));

CREATE POLICY "Admins can manage wallet transactions" ON public.wallet_transactions
  FOR ALL USING (is_admin()) WITH CHECK (is_admin());

-- 3. WITHDRAWAL REQUESTS
CREATE TABLE public.withdrawal_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id UUID NOT NULL REFERENCES public.profiles(id),
  wallet_id UUID NOT NULL REFERENCES public.wallets(id),
  amount NUMERIC(12,2) NOT NULL,
  net_amount NUMERIC(12,2) NOT NULL DEFAULT 0,
  vat_amount NUMERIC(12,2) NOT NULL DEFAULT 0,
  vat_rate NUMERIC(5,2) NOT NULL DEFAULT 19.00,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'processing', 'paid', 'rejected', 'cancelled')),
  payment_method TEXT NOT NULL DEFAULT 'sepa',
  iban TEXT,
  bic TEXT,
  account_holder TEXT,
  bank_name TEXT,
  rejection_reason TEXT,
  requested_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  approved_at TIMESTAMPTZ,
  approved_by UUID,
  processed_at TIMESTAMPTZ,
  paid_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.withdrawal_requests ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own withdrawals" ON public.withdrawal_requests
  FOR SELECT USING (profile_id = get_profile_id(auth.uid()));

CREATE POLICY "Users can create own withdrawals" ON public.withdrawal_requests
  FOR INSERT WITH CHECK (profile_id = get_profile_id(auth.uid()));

CREATE POLICY "Admins can manage all withdrawals" ON public.withdrawal_requests
  FOR ALL USING (is_admin()) WITH CHECK (is_admin());

-- 4. VOLUME TRACKING (PV / GV)
CREATE TABLE public.volume_tracking (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id UUID NOT NULL REFERENCES public.profiles(id),
  period_month DATE NOT NULL,
  personal_volume NUMERIC(12,2) NOT NULL DEFAULT 0,
  group_volume NUMERIC(12,2) NOT NULL DEFAULT 0,
  direct_referrals_count INT NOT NULL DEFAULT 0,
  active_legs INT NOT NULL DEFAULT 0,
  total_team_size INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(profile_id, period_month)
);

ALTER TABLE public.volume_tracking ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own volume" ON public.volume_tracking
  FOR SELECT USING (profile_id = get_profile_id(auth.uid()));

CREATE POLICY "Admins can manage volume" ON public.volume_tracking
  FOR ALL USING (is_admin()) WITH CHECK (is_admin());

-- 5. RANK HISTORY
CREATE TABLE public.rank_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id UUID NOT NULL REFERENCES public.profiles(id),
  rank_id UUID REFERENCES public.ranks(id),
  previous_rank_id UUID REFERENCES public.ranks(id),
  rank_name TEXT NOT NULL,
  previous_rank_name TEXT,
  achieved_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  qualification_snapshot JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.rank_history ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own rank history" ON public.rank_history
  FOR SELECT USING (profile_id = get_profile_id(auth.uid()));

CREATE POLICY "Admins can manage rank history" ON public.rank_history
  FOR ALL USING (is_admin()) WITH CHECK (is_admin());

-- 6. BONUS CONFIGURATION
CREATE TABLE public.bonus_config (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  bonus_type TEXT NOT NULL CHECK (bonus_type IN ('fast_start', 'matching', 'performance', 'rank_advancement', 'leadership_pool')),
  name TEXT NOT NULL,
  description TEXT,
  value NUMERIC(10,2) NOT NULL DEFAULT 0,
  calculation_type TEXT NOT NULL DEFAULT 'fixed' CHECK (calculation_type IN ('fixed', 'percentage')),
  qualifying_days INT DEFAULT 30,
  min_rank_level INT DEFAULT 0,
  min_personal_volume NUMERIC(10,2) DEFAULT 0,
  min_group_volume NUMERIC(10,2) DEFAULT 0,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.bonus_config ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can view active bonus config" ON public.bonus_config
  FOR SELECT USING (true);

CREATE POLICY "Admins can manage bonus config" ON public.bonus_config
  FOR ALL USING (is_admin()) WITH CHECK (is_admin());

-- 7. BONUS PAYOUTS
CREATE TABLE public.bonus_payouts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id UUID NOT NULL REFERENCES public.profiles(id),
  bonus_config_id UUID REFERENCES public.bonus_config(id),
  bonus_type TEXT NOT NULL,
  amount NUMERIC(12,2) NOT NULL,
  trigger_transaction_id UUID REFERENCES public.transactions(id),
  trigger_profile_id UUID REFERENCES public.profiles(id),
  period_month DATE,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'paid', 'reversed')),
  description TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.bonus_payouts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own bonus payouts" ON public.bonus_payouts
  FOR SELECT USING (profile_id = get_profile_id(auth.uid()));

CREATE POLICY "Admins can manage bonus payouts" ON public.bonus_payouts
  FOR ALL USING (is_admin()) WITH CHECK (is_admin());

-- 8. FRAUD ALERTS
CREATE TABLE public.fraud_alerts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id UUID REFERENCES public.profiles(id),
  alert_type TEXT NOT NULL CHECK (alert_type IN ('duplicate_account', 'velocity_abuse', 'ip_anomaly', 'commission_tampering', 'self_referral', 'unusual_pattern', 'multiple_devices')),
  severity TEXT NOT NULL DEFAULT 'medium' CHECK (severity IN ('low', 'medium', 'high', 'critical')),
  details JSONB,
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'investigating', 'resolved', 'false_positive')),
  resolved_by UUID,
  resolved_at TIMESTAMPTZ,
  resolution_notes TEXT,
  detected_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.fraud_alerts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can manage fraud alerts" ON public.fraud_alerts
  FOR ALL USING (is_admin()) WITH CHECK (is_admin());

-- 9. LOGIN ATTEMPTS (for 2FA & security)
CREATE TABLE public.login_attempts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID,
  email TEXT,
  ip_address TEXT,
  user_agent TEXT,
  success BOOLEAN NOT NULL DEFAULT false,
  failure_reason TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.login_attempts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can view login attempts" ON public.login_attempts
  FOR ALL USING (is_admin()) WITH CHECK (is_admin());

-- 10. COMPENSATION PLAN CONFIG (Multi-Plan Support)
CREATE TABLE public.compensation_plans (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  plan_type TEXT NOT NULL CHECK (plan_type IN ('unilevel', 'binary', 'matrix', 'hybrid')),
  matrix_width INT DEFAULT 3,
  matrix_depth INT DEFAULT 3,
  max_levels INT NOT NULL DEFAULT 5,
  is_default BOOLEAN NOT NULL DEFAULT false,
  is_active BOOLEAN NOT NULL DEFAULT true,
  config JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.compensation_plans ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can view active plans" ON public.compensation_plans
  FOR SELECT USING (true);

CREATE POLICY "Admins can manage plans" ON public.compensation_plans
  FOR ALL USING (is_admin()) WITH CHECK (is_admin());

-- 11. PAYOUT CYCLES
CREATE TABLE public.payout_cycles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  cycle_type TEXT NOT NULL CHECK (cycle_type IN ('weekly', 'monthly')),
  period_start DATE NOT NULL,
  period_end DATE NOT NULL,
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'calculating', 'review', 'approved', 'processing', 'completed')),
  total_commissions NUMERIC(14,2) NOT NULL DEFAULT 0,
  total_bonuses NUMERIC(14,2) NOT NULL DEFAULT 0,
  total_pool NUMERIC(14,2) NOT NULL DEFAULT 0,
  total_payouts NUMERIC(14,2) NOT NULL DEFAULT 0,
  partners_count INT NOT NULL DEFAULT 0,
  approved_by UUID,
  approved_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.payout_cycles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can manage payout cycles" ON public.payout_cycles
  FOR ALL USING (is_admin()) WITH CHECK (is_admin());

CREATE POLICY "Partners can view completed cycles" ON public.payout_cycles
  FOR SELECT USING (status = 'completed');

-- Triggers for updated_at
CREATE TRIGGER update_wallets_updated_at BEFORE UPDATE ON public.wallets
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_withdrawal_requests_updated_at BEFORE UPDATE ON public.withdrawal_requests
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_volume_tracking_updated_at BEFORE UPDATE ON public.volume_tracking
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_bonus_config_updated_at BEFORE UPDATE ON public.bonus_config
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_compensation_plans_updated_at BEFORE UPDATE ON public.compensation_plans
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_payout_cycles_updated_at BEFORE UPDATE ON public.payout_cycles
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Auto-create wallet on profile creation
CREATE OR REPLACE FUNCTION public.auto_create_wallet()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.wallets (profile_id)
  VALUES (NEW.id)
  ON CONFLICT (profile_id) DO NOTHING;
  RETURN NEW;
END;
$$;

CREATE TRIGGER create_wallet_on_profile
  AFTER INSERT ON public.profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.auto_create_wallet();

-- Insert default bonus configurations
INSERT INTO public.bonus_config (bonus_type, name, description, value, calculation_type, qualifying_days, min_rank_level) VALUES
  ('fast_start', 'Fast Start Bonus', 'Bonus für die ersten 30 Tage nach Registrierung eines Partners', 50, 'fixed', 30, 0),
  ('matching', 'Matching Bonus', '10% auf Provisionen der direkten Downline', 10, 'percentage', 0, 1),
  ('performance', 'Performance Bonus', 'Monatlicher Bonus bei Erreichung des Gruppenvolumen-Ziels', 200, 'fixed', 0, 2),
  ('rank_advancement', 'Rang-Aufstiegs-Bonus', 'Einmaliger Bonus bei Rang-Aufstieg', 500, 'fixed', 0, 1);

-- Insert default compensation plan (existing Sliding Window as default)
INSERT INTO public.compensation_plans (name, plan_type, max_levels, is_default, config) VALUES
  ('GAP-Protection Sliding Window', 'unilevel', 5, true, '{"sliding_window": true, "payouts": {"1": [100], "2": [80, 20], "3": [45, 20, 15], "4": [45, 20, 15, 10], "5": [45, 20, 15, 10, 10]}}');
