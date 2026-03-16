-- Drop all policies
DROP POLICY IF EXISTS "Admins can view all profiles" ON profiles;
DROP POLICY IF EXISTS "Admins can update all profiles" ON profiles;
DROP POLICY IF EXISTS "Users can view own profile" ON profiles;
DROP POLICY IF EXISTS "Users can update own profile" ON profiles;

-- Create a truly non-recursive function using user_roles.user_id directly (profile.id = user_roles.user_id)
CREATE OR REPLACE FUNCTION public.check_is_admin()
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  -- user_roles.user_id stores profile.id, not auth.uid()
  -- We need to first get profile.id from auth.uid() without causing recursion
  SELECT EXISTS (
    SELECT 1
    FROM public.user_roles ur
    WHERE ur.user_id IN (
      SELECT p.id FROM public.profiles p WHERE p.user_id = auth.uid()
    )
    AND ur.role = 'admin'
  )
$$;

-- Simple PERMISSIVE policies (not RESTRICTIVE) to allow OR logic
-- Users can view their own profile
CREATE POLICY "Users can view own profile" 
ON profiles FOR SELECT 
TO authenticated
USING (auth.uid() = user_id);

-- Users can update their own profile  
CREATE POLICY "Users can update own profile"
ON profiles FOR UPDATE 
TO authenticated
USING (auth.uid() = user_id);