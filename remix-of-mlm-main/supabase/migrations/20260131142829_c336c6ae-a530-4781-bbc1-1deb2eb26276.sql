-- Fix remaining RLS warning for security_tests authenticated insert
DROP POLICY IF EXISTS "Authenticated users can insert security test" ON public.security_tests;

-- More specific policy: authenticated users can only insert tests linked to themselves
CREATE POLICY "Authenticated users can insert own security test" ON public.security_tests
    FOR INSERT TO authenticated
    WITH CHECK (
        user_id IS NULL 
        OR user_id IN (SELECT id FROM public.profiles WHERE user_id = auth.uid())
    );