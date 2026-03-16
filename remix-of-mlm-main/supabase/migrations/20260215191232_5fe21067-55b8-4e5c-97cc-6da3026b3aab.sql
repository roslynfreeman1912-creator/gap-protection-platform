-- Fix overly permissive RLS policies on adversary_simulations
DROP POLICY IF EXISTS "Service role can manage simulations" ON public.adversary_simulations;

CREATE POLICY "Admins can manage simulations"
ON public.adversary_simulations
FOR ALL
TO authenticated
USING (public.is_admin())
WITH CHECK (public.is_admin());

CREATE POLICY "Users can view own simulations"
ON public.adversary_simulations
FOR SELECT
TO authenticated
USING (profile_id = public.get_profile_id(auth.uid()));

-- Fix overly permissive RLS policies on scheduled_scans
DROP POLICY IF EXISTS "Service role can manage scheduled scans" ON public.scheduled_scans;

CREATE POLICY "Admins can manage all scheduled scans"
ON public.scheduled_scans
FOR ALL
TO authenticated
USING (public.is_admin())
WITH CHECK (public.is_admin());

CREATE POLICY "Users can manage own scheduled scans"
ON public.scheduled_scans
FOR ALL
TO authenticated
USING (profile_id = public.get_profile_id(auth.uid()))
WITH CHECK (profile_id = public.get_profile_id(auth.uid()));

-- Fix overly permissive RLS policies on security_reports
DROP POLICY IF EXISTS "Service role can manage reports" ON public.security_reports;

CREATE POLICY "Admins can manage all reports"
ON public.security_reports
FOR ALL
TO authenticated
USING (public.is_admin())
WITH CHECK (public.is_admin());