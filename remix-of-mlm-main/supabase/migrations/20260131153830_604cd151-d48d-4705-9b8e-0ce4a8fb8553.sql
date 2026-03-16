-- Drop all problematic policies first
DROP POLICY IF EXISTS "Admins can view all profiles" ON profiles;
DROP POLICY IF EXISTS "Admins can update all profiles" ON profiles;
DROP POLICY IF EXISTS "Users can view own profile" ON profiles;
DROP POLICY IF EXISTS "Users can update own profile" ON profiles;

-- Create a simpler function that checks admin without querying profiles
CREATE OR REPLACE FUNCTION public.is_admin_user()
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.user_roles ur
    JOIN public.profiles p ON ur.user_id = p.id
    WHERE p.user_id = auth.uid()
      AND ur.role = 'admin'
  )
$$;

-- Simple policy: Users can view their own profile (no recursion)
CREATE POLICY "Users can view own profile" 
ON profiles FOR SELECT 
TO authenticated
USING (auth.uid() = user_id);

-- Simple policy: Users can update their own profile
CREATE POLICY "Users can update own profile" 
ON profiles FOR UPDATE 
TO authenticated
USING (auth.uid() = user_id);

-- Admin policy: uses SECURITY DEFINER function to avoid recursion
CREATE POLICY "Admins can view all profiles" 
ON profiles FOR SELECT 
TO authenticated
USING (public.is_admin_user());

-- Admin update policy
CREATE POLICY "Admins can update all profiles" 
ON profiles FOR UPDATE 
TO authenticated
USING (public.is_admin_user());