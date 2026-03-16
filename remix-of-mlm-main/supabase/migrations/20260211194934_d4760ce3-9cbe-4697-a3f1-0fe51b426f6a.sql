
-- Create helper function to check super_admin
CREATE OR REPLACE FUNCTION public.is_super_admin()
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.has_role(public.get_profile_id(auth.uid()), 'super_admin')
$$;

-- Create helper function to check callcenter role
CREATE OR REPLACE FUNCTION public.is_callcenter()
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.has_role(public.get_profile_id(auth.uid()), 'callcenter')
$$;

-- Function to get call center id for current user
CREATE OR REPLACE FUNCTION public.get_user_call_center_id()
RETURNS uuid
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT cc.id FROM public.call_centers cc
  WHERE cc.owner_id = public.get_profile_id(auth.uid())
  LIMIT 1
$$;

-- RLS on call_centers
ALTER TABLE public.call_centers ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Call center owners can view own" ON public.call_centers;
CREATE POLICY "Call center owners can view own" ON public.call_centers
FOR SELECT USING (
  owner_id = public.get_profile_id(auth.uid())
  OR public.is_admin()
  OR public.is_super_admin()
);

-- RLS on leads
ALTER TABLE public.leads ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Call center sees own leads" ON public.leads;
CREATE POLICY "Call center sees own leads" ON public.leads
FOR SELECT USING (
  call_center_id = public.get_user_call_center_id()
  OR public.is_admin()
  OR public.is_super_admin()
);

DROP POLICY IF EXISTS "Call center can insert leads" ON public.leads;
CREATE POLICY "Call center can insert leads" ON public.leads
FOR INSERT WITH CHECK (
  call_center_id = public.get_user_call_center_id()
  OR public.is_admin()
  OR public.is_super_admin()
);

DROP POLICY IF EXISTS "Call center can update own leads" ON public.leads;
CREATE POLICY "Call center can update own leads" ON public.leads
FOR UPDATE USING (
  call_center_id = public.get_user_call_center_id()
  OR public.is_admin()
  OR public.is_super_admin()
);

-- RLS on promotion_codes for call center isolation
DROP POLICY IF EXISTS "Call center sees own promo codes" ON public.promotion_codes;
CREATE POLICY "Call center sees own promo codes" ON public.promotion_codes
FOR SELECT USING (
  call_center_id = public.get_user_call_center_id()
  OR partner_id = public.get_profile_id(auth.uid())
  OR public.is_admin()
  OR public.is_super_admin()
);
