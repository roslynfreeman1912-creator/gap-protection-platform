-- Drop the problematic recursive policies
DROP POLICY IF EXISTS "Admins can view all profiles" ON profiles;
DROP POLICY IF EXISTS "Admins can update all profiles" ON profiles;
DROP POLICY IF EXISTS "Users can view own profile" ON profiles;
DROP POLICY IF EXISTS "Users can update own profile" ON profiles;

-- Create new non-recursive policies using user_roles table and has_role function
-- Allow users to view their own profile
CREATE POLICY "Users can view own profile" 
ON profiles FOR SELECT 
TO authenticated
USING (auth.uid() = user_id);

-- Allow users to update their own profile
CREATE POLICY "Users can update own profile" 
ON profiles FOR UPDATE 
TO authenticated
USING (auth.uid() = user_id);

-- Allow admins to view all profiles (using user_roles table, not profiles.role)
CREATE POLICY "Admins can view all profiles" 
ON profiles FOR SELECT 
TO authenticated
USING (
  public.has_role(
    (SELECT id FROM profiles WHERE user_id = auth.uid() LIMIT 1), 
    'admin'::app_role
  )
);

-- Allow admins to update all profiles
CREATE POLICY "Admins can update all profiles" 
ON profiles FOR UPDATE 
TO authenticated
USING (
  public.has_role(
    (SELECT id FROM profiles WHERE user_id = auth.uid() LIMIT 1), 
    'admin'::app_role
  )
);