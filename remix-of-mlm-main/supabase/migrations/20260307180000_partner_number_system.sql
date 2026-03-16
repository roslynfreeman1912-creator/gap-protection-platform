BEGIN;

-- ============================================================================
-- GAP PROTECTION: Partner Number System (1000+ Hierarchical Numbering)
-- ============================================================================
-- Each structure admin (Thomas=MLM, Jörg=Callcenter) gets a base number (1000, 2000, etc.)
-- All partners under them get numbers prefixed with that base.
-- The partner_number doubles as the promotion_code for clean assignment.

-- 1) Add partner_number column to profiles
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS partner_number TEXT;

-- Create unique index on partner_number
CREATE UNIQUE INDEX IF NOT EXISTS idx_profiles_partner_number_unique
  ON public.profiles(partner_number)
  WHERE partner_number IS NOT NULL;

-- 2) Create a sequence for auto-generating sub-numbers within each structure
CREATE SEQUENCE IF NOT EXISTS public.partner_sub_number_seq START 1;

-- 3) Create a table for structure admins (Dashboard-Betreiber)
CREATE TABLE IF NOT EXISTS public.structure_admins (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  base_number TEXT NOT NULL UNIQUE,  -- e.g. '1000', '2000', '3000'
  structure_name TEXT NOT NULL,       -- e.g. 'MLM', 'Callcenter'
  admin_name TEXT NOT NULL,           -- e.g. 'Thomas', 'Stefan', 'Jörg'
  description TEXT,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  CONSTRAINT valid_base_number CHECK (base_number ~ '^\d{4}$')
);

CREATE INDEX IF NOT EXISTS idx_structure_admins_profile
  ON public.structure_admins(profile_id);
CREATE INDEX IF NOT EXISTS idx_structure_admins_base_number
  ON public.structure_admins(base_number);

-- 4) Create a table for partner number assignments within structures
CREATE TABLE IF NOT EXISTS public.partner_numbers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  partner_number TEXT NOT NULL UNIQUE,
  structure_admin_id UUID NOT NULL REFERENCES public.structure_admins(id) ON DELETE CASCADE,
  base_number TEXT NOT NULL,  -- The structure prefix (e.g. '1000')
  sub_number TEXT NOT NULL,   -- The individual suffix
  level_in_structure INT DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  CONSTRAINT valid_partner_number CHECK (partner_number ~ '^\d+$')
);

CREATE INDEX IF NOT EXISTS idx_partner_numbers_base
  ON public.partner_numbers(base_number);
CREATE INDEX IF NOT EXISTS idx_partner_numbers_profile
  ON public.partner_numbers(profile_id);
CREATE INDEX IF NOT EXISTS idx_partner_numbers_structure_admin
  ON public.partner_numbers(structure_admin_id);

-- 5) Function to assign a partner number within a structure
CREATE OR REPLACE FUNCTION public.assign_partner_number(
  p_profile_id UUID,
  p_base_number TEXT
)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_structure_admin_id UUID;
  v_next_sub INT;
  v_partner_number TEXT;
  v_existing TEXT;
BEGIN
  -- Check if profile already has a partner number in this structure
  SELECT partner_number INTO v_existing
  FROM public.partner_numbers
  WHERE profile_id = p_profile_id AND base_number = p_base_number;
  
  IF v_existing IS NOT NULL THEN
    RETURN v_existing;
  END IF;

  -- Get structure admin
  SELECT id INTO v_structure_admin_id
  FROM public.structure_admins
  WHERE base_number = p_base_number AND is_active = true;

  IF v_structure_admin_id IS NULL THEN
    RAISE EXCEPTION 'No active structure found for base number %', p_base_number;
  END IF;

  -- Get the next sub-number (count existing + 1, padded)
  SELECT COALESCE(MAX(sub_number::INT), 0) + 1 INTO v_next_sub
  FROM public.partner_numbers
  WHERE base_number = p_base_number;

  -- Build the partner number: base + sub (e.g., 1000 + 01 = 100001)
  v_partner_number := p_base_number || LPAD(v_next_sub::TEXT, 2, '0');

  -- Insert the assignment
  INSERT INTO public.partner_numbers (profile_id, partner_number, structure_admin_id, base_number, sub_number)
  VALUES (p_profile_id, v_partner_number, v_structure_admin_id, p_base_number, v_next_sub::TEXT);

  -- Update the profile's partner_number
  UPDATE public.profiles
  SET partner_number = v_partner_number
  WHERE id = p_profile_id;

  RETURN v_partner_number;
END;
$$;

-- 6) Function to get all partners within a structure (by base_number prefix)
CREATE OR REPLACE FUNCTION public.get_structure_partners(
  p_base_number TEXT,
  p_include_customers BOOLEAN DEFAULT false
)
RETURNS TABLE (
  profile_id UUID,
  partner_number TEXT,
  first_name TEXT,
  last_name TEXT,
  email TEXT,
  phone TEXT,
  status TEXT,
  role TEXT,
  sponsor_id UUID,
  level_in_structure INT,
  created_at TIMESTAMPTZ
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  SELECT
    p.id AS profile_id,
    pn.partner_number,
    p.first_name,
    p.last_name,
    p.email,
    p.phone,
    p.status::TEXT,
    p.role::TEXT,
    p.sponsor_id,
    pn.level_in_structure,
    p.created_at
  FROM public.partner_numbers pn
  JOIN public.profiles p ON p.id = pn.profile_id
  WHERE pn.base_number = p_base_number
  ORDER BY pn.partner_number;
END;
$$;

-- 7) Function to check if a user is a structure admin
CREATE OR REPLACE FUNCTION public.is_structure_admin(p_profile_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM public.structure_admins
    WHERE profile_id = p_profile_id AND is_active = true
  );
END;
$$;

-- 8) Function to get structure admin info for a profile
CREATE OR REPLACE FUNCTION public.get_structure_admin_info(p_profile_id UUID)
RETURNS TABLE (
  admin_id UUID,
  base_number TEXT,
  structure_name TEXT,
  admin_name TEXT,
  is_active BOOLEAN
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  SELECT sa.id, sa.base_number, sa.structure_name, sa.admin_name, sa.is_active
  FROM public.structure_admins sa
  WHERE sa.profile_id = p_profile_id AND sa.is_active = true;
END;
$$;

-- 9) RLS policies for structure_admins
ALTER TABLE public.structure_admins ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Super admins can manage structure_admins"
  ON public.structure_admins
  FOR ALL
  USING (public.is_super_admin())
  WITH CHECK (public.is_super_admin());

CREATE POLICY "Structure admins can view own record"
  ON public.structure_admins
  FOR SELECT
  USING (
    profile_id = (SELECT id FROM profiles WHERE user_id = auth.uid())
  );

-- 10) RLS policies for partner_numbers
ALTER TABLE public.partner_numbers ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Super admins can manage partner_numbers"
  ON public.partner_numbers
  FOR ALL
  USING (public.is_super_admin())
  WITH CHECK (public.is_super_admin());

CREATE POLICY "Structure admins can view their structure partner_numbers"
  ON public.partner_numbers
  FOR SELECT
  USING (
    base_number IN (
      SELECT sa.base_number FROM public.structure_admins sa
      WHERE sa.profile_id = (SELECT id FROM profiles WHERE user_id = auth.uid())
      AND sa.is_active = true
    )
  );

CREATE POLICY "Partners can view own partner_number"
  ON public.partner_numbers
  FOR SELECT
  USING (
    profile_id = (SELECT id FROM profiles WHERE user_id = auth.uid())
  );

-- 11) Grant execute permissions
GRANT EXECUTE ON FUNCTION public.assign_partner_number TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_structure_partners TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_structure_admin TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_structure_admin_info TO authenticated;

COMMIT;
