
-- Remove the foreign key constraint from profiles to allow manual admin creation
ALTER TABLE public.profiles DROP CONSTRAINT IF EXISTS profiles_user_id_fkey;

-- Create a test admin profile (no auth user needed for system admin)
INSERT INTO profiles (id, user_id, first_name, last_name, email, status)
VALUES (
  'a0000000-0000-0000-0000-000000000001',
  'a0000000-0000-0000-0000-000000000001',
  'System',
  'Admin',
  'admin@gapprotection.de',
  'active'
) ON CONFLICT (id) DO NOTHING;

-- Add admin role
INSERT INTO user_roles (user_id, role)
VALUES ('a0000000-0000-0000-0000-000000000001', 'admin')
ON CONFLICT (user_id, role) DO NOTHING;

-- Create a test promotion code for registration testing
INSERT INTO promotion_codes (code, partner_id, is_active)
VALUES ('GP-TEST01', 'a0000000-0000-0000-0000-000000000001', true)
ON CONFLICT (code) DO NOTHING;
