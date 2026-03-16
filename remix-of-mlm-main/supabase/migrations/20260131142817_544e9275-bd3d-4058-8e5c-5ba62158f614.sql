-- Fix RLS Policies: Restrict INSERT to authenticated users with proper checks

-- Drop the overly permissive policies
DROP POLICY IF EXISTS "Anyone can insert profile" ON public.profiles;
DROP POLICY IF EXISTS "Anyone can insert security test" ON public.security_tests;

-- Create more restrictive policies

-- Profiles: Only authenticated users can create their own profile
CREATE POLICY "Authenticated users can insert own profile" ON public.profiles
    FOR INSERT TO authenticated
    WITH CHECK (auth.uid() = user_id);

-- Security Tests: Authenticated users can insert, or allow anonymous for public tests
CREATE POLICY "Authenticated users can insert security test" ON public.security_tests
    FOR INSERT TO authenticated
    WITH CHECK (TRUE);

-- Allow anonymous security tests (for the "small devil" test without login)
CREATE POLICY "Anonymous can insert security test" ON public.security_tests
    FOR INSERT TO anon
    WITH CHECK (user_id IS NULL);