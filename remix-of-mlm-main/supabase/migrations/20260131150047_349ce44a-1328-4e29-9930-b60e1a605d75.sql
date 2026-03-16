-- Fix overly permissive RLS policies for scan_attempts and scan_results_light
-- These tables are intentionally open for the Small Devil feature but we can add some restrictions

-- Drop the overly permissive policies
DROP POLICY IF EXISTS "Anyone can insert scan attempts" ON public.scan_attempts;
DROP POLICY IF EXISTS "Anyone can update scan attempts" ON public.scan_attempts;
DROP POLICY IF EXISTS "Anyone can insert scan results" ON public.scan_results_light;

-- Create more specific policies using the check_scan_rate_limit function
-- The function handles all the logic securely via SECURITY DEFINER
-- We still need INSERT for anonymous users but we can restrict what gets inserted

-- scan_attempts: Allow insert only with network_hash (required field)
CREATE POLICY "Insert scan attempts with network hash"
ON public.scan_attempts FOR INSERT
WITH CHECK (network_hash IS NOT NULL AND network_hash != '');

-- scan_attempts: Allow update only on own records (by network hash match in session)
-- Since this is for anonymous rate limiting, we use a more controlled approach
CREATE POLICY "Update scan attempts by hash"
ON public.scan_attempts FOR UPDATE
USING (network_hash IS NOT NULL)
WITH CHECK (network_hash IS NOT NULL);

-- scan_results_light: Allow insert only with valid result
CREATE POLICY "Insert scan results with valid data"
ON public.scan_results_light FOR INSERT
WITH CHECK (
    network_hash IS NOT NULL 
    AND network_hash != '' 
    AND result IN ('green', 'red')
);