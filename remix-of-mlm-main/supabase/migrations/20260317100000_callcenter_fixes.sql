-- =============================================
-- CALLCENTER FIXES
-- =============================================

-- 1. Sicherstellen dass call_center_employees alle Spalten hat
ALTER TABLE public.call_center_employees
  ADD COLUMN IF NOT EXISTS parent_employee_id UUID REFERENCES public.call_center_employees(id),
  ADD COLUMN IF NOT EXISTS level INTEGER DEFAULT 1,
  ADD COLUMN IF NOT EXISTS override_rate NUMERIC(5,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS total_commissions NUMERIC(12,2) DEFAULT 0;

-- 2. Sicherstellen dass leads alle Spalten hat
ALTER TABLE public.leads
  ADD COLUMN IF NOT EXISTS company_name TEXT,
  ADD COLUMN IF NOT EXISTS contact_person TEXT,
  ADD COLUMN IF NOT EXISTS domain TEXT,
  ADD COLUMN IF NOT EXISTS priority INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS assigned_employee_id UUID REFERENCES public.call_center_employees(id);

-- 3. call_center_id in promotion_codes und transactions
ALTER TABLE public.promotion_codes
  ADD COLUMN IF NOT EXISTS call_center_id UUID REFERENCES public.call_centers(id);

ALTER TABLE public.transactions
  ADD COLUMN IF NOT EXISTS call_center_id UUID REFERENCES public.call_centers(id);

-- 4. RLS Policies für call_centers — Employees können ihr Center sehen
DROP POLICY IF EXISTS "CC employees can view their center" ON public.call_centers;
CREATE POLICY "CC employees can view their center" ON public.call_centers
  FOR SELECT USING (
    id IN (
      SELECT call_center_id FROM public.call_center_employees
      WHERE profile_id = (SELECT id FROM public.profiles WHERE user_id = auth.uid())
        AND is_active = true
    )
    OR owner_id = (SELECT id FROM public.profiles WHERE user_id = auth.uid())
    OR public.is_admin()
  );

-- 5. RLS für call_center_employees — Employees können ihre Kollegen sehen
DROP POLICY IF EXISTS "CC employees can view colleagues" ON public.call_center_employees;
CREATE POLICY "CC employees can view colleagues" ON public.call_center_employees
  FOR SELECT USING (
    call_center_id IN (
      SELECT call_center_id FROM public.call_center_employees
      WHERE profile_id = (SELECT id FROM public.profiles WHERE user_id = auth.uid())
    )
    OR call_center_id IN (
      SELECT id FROM public.call_centers
      WHERE owner_id = (SELECT id FROM public.profiles WHERE user_id = auth.uid())
    )
    OR public.is_admin()
  );

-- 6. RLS für leads
DROP POLICY IF EXISTS "CC can manage own leads" ON public.leads;
CREATE POLICY "CC can manage own leads" ON public.leads
  FOR ALL USING (
    call_center_id IN (
      SELECT id FROM public.call_centers
      WHERE owner_id = (SELECT id FROM public.profiles WHERE user_id = auth.uid())
    )
    OR call_center_id IN (
      SELECT call_center_id FROM public.call_center_employees
      WHERE profile_id = (SELECT id FROM public.profiles WHERE user_id = auth.uid())
        AND is_active = true
    )
    OR public.is_admin()
  );

-- 7. RLS für promotion_codes — CC kann eigene Codes sehen
DROP POLICY IF EXISTS "CC can view own promo codes" ON public.promotion_codes;
CREATE POLICY "CC can view own promo codes" ON public.promotion_codes
  FOR SELECT USING (
    call_center_id IN (
      SELECT id FROM public.call_centers
      WHERE owner_id = (SELECT id FROM public.profiles WHERE user_id = auth.uid())
    )
    OR call_center_id IN (
      SELECT call_center_id FROM public.call_center_employees
      WHERE profile_id = (SELECT id FROM public.profiles WHERE user_id = auth.uid())
        AND is_active = true
    )
    OR partner_id = (SELECT id FROM public.profiles WHERE user_id = auth.uid())
    OR public.is_admin()
  );

-- 8. RLS für cc_commissions — Employees können eigene Provisionen sehen
DROP POLICY IF EXISTS "CC employees can view own commissions" ON public.cc_commissions;
CREATE POLICY "CC employees can view own commissions" ON public.cc_commissions
  FOR SELECT USING (
    employee_id IN (
      SELECT id FROM public.call_center_employees
      WHERE profile_id = (SELECT id FROM public.profiles WHERE user_id = auth.uid())
    )
    OR call_center_id IN (
      SELECT id FROM public.call_centers
      WHERE owner_id = (SELECT id FROM public.profiles WHERE user_id = auth.uid())
    )
    OR public.is_admin()
  );

-- 9. Index für Performance
CREATE INDEX IF NOT EXISTS idx_call_center_employees_profile ON public.call_center_employees(profile_id);
CREATE INDEX IF NOT EXISTS idx_call_center_employees_center ON public.call_center_employees(call_center_id);
CREATE INDEX IF NOT EXISTS idx_leads_call_center ON public.leads(call_center_id);
CREATE INDEX IF NOT EXISTS idx_leads_status ON public.leads(status);
CREATE INDEX IF NOT EXISTS idx_promotion_codes_call_center ON public.promotion_codes(call_center_id);
CREATE INDEX IF NOT EXISTS idx_transactions_call_center ON public.transactions(call_center_id);
CREATE INDEX IF NOT EXISTS idx_cc_commissions_employee ON public.cc_commissions(employee_id);
CREATE INDEX IF NOT EXISTS idx_cc_commissions_call_center ON public.cc_commissions(call_center_id);

-- =============================================
-- FERTIG: CallCenter Fixes angewendet
-- =============================================
