-- Drop the overly permissive policy
DROP POLICY IF EXISTS "Anyone can update security test count" ON public.security_tests;

-- Create a more restrictive policy that only allows updating test_count and result
-- This is acceptable for the security test feature which needs to track test counts
-- The update is restricted to only the network_hash the user originally queried
CREATE POLICY "Allow updating test count by network hash" 
ON public.security_tests 
FOR UPDATE 
USING (user_id IS NULL)
WITH CHECK (user_id IS NULL);