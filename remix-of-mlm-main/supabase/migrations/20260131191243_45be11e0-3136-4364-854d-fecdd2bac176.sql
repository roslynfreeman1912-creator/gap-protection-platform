-- Fix INSERT policies to be more restrictive (only allow service role or authenticated users)

-- Drop overly permissive policies
DROP POLICY IF EXISTS "Users can insert scans" ON public.security_scans;
DROP POLICY IF EXISTS "Insert findings" ON public.security_findings;
DROP POLICY IF EXISTS "Insert DNS results" ON public.scan_dns_results;
DROP POLICY IF EXISTS "Insert SSL results" ON public.scan_ssl_results;
DROP POLICY IF EXISTS "Insert header results" ON public.scan_header_results;

-- Recreate with proper restrictions - inserts only via service role (edge functions)
-- These tables are meant to be written by edge functions using service role key

-- No public INSERT policies - only service role can insert
-- This is intentional as all inserts come from edge functions