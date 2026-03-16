-- =============================================
-- CC BROKER (Callcenter Vermittler) SYSTEM
-- =============================================

-- 1. Add cc_broker to app_role enum
ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'cc_broker';

-- 2. CC Brokers table — unlimited brokers
CREATE TABLE IF NOT EXISTS public.cc_brokers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  broker_number TEXT UNIQUE NOT NULL DEFAULT 'BR-' || UPPER(SUBSTRING(gen_random_uuid()::TEXT, 1, 8)),
  commission_rate DECIMAL(5,2) DEFAULT 5.00,  -- % on each CC they bring
  is_active BOOLEAN DEFAULT true,
  notes TEXT,
  created_by UUID REFERENCES public.profiles(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(profile_id)
);

-- 3. Link call_centers to their broker (Vermittler)
ALTER TABLE public.call_centers
  ADD COLUMN IF NOT EXISTS broker_id UUID REFERENCES public.cc_brokers(id),
  ADD COLUMN IF NOT EXISTS broker_commission_rate DECIMAL(5,2) DEFAULT 0;

-- 4. Broker commissions table
CREATE TABLE IF NOT EXISTS public.broker_commissions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  broker_id UUID NOT NULL REFERENCES public.cc_brokers(id) ON DELETE CASCADE,
  call_center_id UUID NOT NULL REFERENCES public.call_centers(id) ON DELETE CASCADE,
  cc_commission_id UUID REFERENCES public.cc_commissions(id),
  base_amount DECIMAL(12,2) NOT NULL DEFAULT 0,
  commission_rate DECIMAL(5,2) NOT NULL DEFAULT 0,
  commission_amount DECIMAL(12,2) NOT NULL DEFAULT 0,
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'paid', 'cancelled')),
  period_start DATE,
  period_end DATE,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 5. RLS policies
ALTER TABLE public.cc_brokers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.broker_commissions ENABLE ROW LEVEL SECURITY;

-- Brokers can see their own record
CREATE POLICY "broker_own_read" ON public.cc_brokers
  FOR SELECT USING (
    profile_id = (SELECT id FROM public.profiles WHERE user_id = auth.uid())
    OR public.has_role(auth.uid(), 'admin')
    OR public.has_role(auth.uid(), 'super_admin')
  );

-- Admins can manage brokers
CREATE POLICY "admin_manage_brokers" ON public.cc_brokers
  FOR ALL USING (
    public.has_role(auth.uid(), 'admin')
    OR public.has_role(auth.uid(), 'super_admin')
  );

-- Broker commissions: broker sees own, admin sees all
CREATE POLICY "broker_commissions_read" ON public.broker_commissions
  FOR SELECT USING (
    broker_id IN (
      SELECT id FROM public.cc_brokers
      WHERE profile_id = (SELECT id FROM public.profiles WHERE user_id = auth.uid())
    )
    OR public.has_role(auth.uid(), 'admin')
    OR public.has_role(auth.uid(), 'super_admin')
  );

CREATE POLICY "admin_manage_broker_commissions" ON public.broker_commissions
  FOR ALL USING (
    public.has_role(auth.uid(), 'admin')
    OR public.has_role(auth.uid(), 'super_admin')
  );

-- 6. Broker can see their own call centers
CREATE POLICY "broker_see_own_callcenters" ON public.call_centers
  FOR SELECT USING (
    broker_id IN (
      SELECT id FROM public.cc_brokers
      WHERE profile_id = (SELECT id FROM public.profiles WHERE user_id = auth.uid())
    )
    OR public.has_role(auth.uid(), 'admin')
    OR public.has_role(auth.uid(), 'super_admin')
    OR owner_id = (SELECT id FROM public.profiles WHERE user_id = auth.uid())
  );

-- 7. Updated_at trigger
CREATE OR REPLACE FUNCTION public.update_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = NOW(); RETURN NEW; END;
$$;

CREATE TRIGGER cc_brokers_updated_at
  BEFORE UPDATE ON public.cc_brokers
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

CREATE TRIGGER broker_commissions_updated_at
  BEFORE UPDATE ON public.broker_commissions
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

-- 8. View: broker dashboard summary
CREATE OR REPLACE VIEW public.broker_dashboard AS
SELECT
  b.id AS broker_id,
  b.profile_id,
  b.broker_number,
  b.commission_rate,
  b.is_active,
  COUNT(DISTINCT cc.id) AS total_call_centers,
  COUNT(DISTINCT cc.id) FILTER (WHERE cc.is_active) AS active_call_centers,
  COUNT(DISTINCT cce.id) AS total_employees,
  COALESCE(SUM(bc.commission_amount) FILTER (WHERE bc.status = 'pending'), 0) AS pending_commissions,
  COALESCE(SUM(bc.commission_amount) FILTER (WHERE bc.status = 'paid'), 0) AS paid_commissions,
  COALESCE(SUM(bc.commission_amount), 0) AS total_commissions
FROM public.cc_brokers b
LEFT JOIN public.call_centers cc ON cc.broker_id = b.id
LEFT JOIN public.call_center_employees cce ON cce.call_center_id = cc.id AND cce.is_active
LEFT JOIN public.broker_commissions bc ON bc.broker_id = b.id
GROUP BY b.id, b.profile_id, b.broker_number, b.commission_rate, b.is_active;
