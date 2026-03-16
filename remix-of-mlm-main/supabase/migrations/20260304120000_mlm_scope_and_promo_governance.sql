BEGIN;

-- ============================================================================
-- GAP PROTECTION: MLM Governance + Scoped Visibility + Promo/Employee Binding
-- ============================================================================

-- 1) Employee number for deterministic partner identity/promo-code policy
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS employee_number TEXT;

CREATE SEQUENCE IF NOT EXISTS public.employee_number_seq START 100001;

-- Backfill missing employee numbers for existing partner/admin records.
UPDATE public.profiles
SET employee_number = 'EMP-' || LPAD(nextval('public.employee_number_seq')::TEXT, 6, '0')
WHERE employee_number IS NULL
  AND role IN ('partner', 'admin');

CREATE UNIQUE INDEX IF NOT EXISTS idx_profiles_employee_number_unique
  ON public.profiles(employee_number)
  WHERE employee_number IS NOT NULL;

-- 2) Hierarchy scope separation (MLM vs callcenter)
ALTER TABLE public.user_hierarchy
  ADD COLUMN IF NOT EXISTS hierarchy_type TEXT NOT NULL DEFAULT 'mlm'
  CHECK (hierarchy_type IN ('mlm', 'callcenter'));

UPDATE public.user_hierarchy
SET hierarchy_type = 'mlm'
WHERE hierarchy_type IS NULL;

ALTER TABLE public.user_hierarchy
  DROP CONSTRAINT IF EXISTS user_hierarchy_user_id_ancestor_id_key;

ALTER TABLE public.user_hierarchy
  ADD CONSTRAINT user_hierarchy_user_ancestor_scope_uniq
  UNIQUE (user_id, ancestor_id, hierarchy_type);

CREATE INDEX IF NOT EXISTS idx_user_hierarchy_ancestor_scope
  ON public.user_hierarchy(ancestor_id, hierarchy_type, level_number);

-- 3) Prevent sponsor-chain cycles and self sponsorship
CREATE OR REPLACE FUNCTION public.prevent_sponsor_cycle()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.sponsor_id IS NULL THEN
    RETURN NEW;
  END IF;

  IF NEW.sponsor_id = NEW.id THEN
    RAISE EXCEPTION 'A profile cannot sponsor itself';
  END IF;

  IF EXISTS (
    WITH RECURSIVE sponsor_chain AS (
      SELECT p.id, p.sponsor_id
      FROM public.profiles p
      WHERE p.id = NEW.sponsor_id
      UNION ALL
      SELECT p2.id, p2.sponsor_id
      FROM public.profiles p2
      INNER JOIN sponsor_chain sc ON sc.sponsor_id = p2.id
      WHERE p2.sponsor_id IS NOT NULL
    )
    SELECT 1 FROM sponsor_chain WHERE id = NEW.id
  ) THEN
    RAISE EXCEPTION 'Sponsor cycle detected';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS prevent_sponsor_cycle_trigger ON public.profiles;
CREATE TRIGGER prevent_sponsor_cycle_trigger
BEFORE INSERT OR UPDATE OF sponsor_id ON public.profiles
FOR EACH ROW
EXECUTE FUNCTION public.prevent_sponsor_cycle();

-- 4) Employee number assignment and promo alignment on insert
CREATE OR REPLACE FUNCTION public.assign_employee_number_if_missing()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.employee_number IS NULL AND NEW.role IN ('partner', 'admin') THEN
    NEW.employee_number := 'EMP-' || LPAD(nextval('public.employee_number_seq')::TEXT, 6, '0');
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS assign_employee_number_before_insert ON public.profiles;
CREATE TRIGGER assign_employee_number_before_insert
BEFORE INSERT ON public.profiles
FOR EACH ROW
EXECUTE FUNCTION public.assign_employee_number_if_missing();

-- Promo code should follow employee number when available.
CREATE OR REPLACE FUNCTION public.generate_promotion_code()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  new_code TEXT;
BEGIN
  IF NEW.role IN ('partner', 'admin') THEN
    IF NEW.employee_number IS NOT NULL THEN
      new_code := NEW.employee_number;
    ELSE
      new_code := 'ML-' || UPPER(SUBSTRING(MD5(RANDOM()::TEXT) FROM 1 FOR 6));
      WHILE EXISTS (SELECT 1 FROM public.profiles WHERE promotion_code = new_code) LOOP
        new_code := 'ML-' || UPPER(SUBSTRING(MD5(RANDOM()::TEXT) FROM 1 FOR 6));
      END LOOP;
    END IF;
    NEW.promotion_code := new_code;
  END IF;

  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.create_promotion_code_record()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.role IN ('partner', 'admin') AND NEW.promotion_code IS NOT NULL THEN
    INSERT INTO public.promotion_codes (code, partner_id)
    VALUES (NEW.promotion_code, NEW.id)
    ON CONFLICT (code) DO UPDATE
      SET partner_id = EXCLUDED.partner_id,
          is_active = true;
  END IF;

  RETURN NEW;
END;
$$;

-- Keep partner/admin promo rows aligned with employee number for existing records.
UPDATE public.profiles
SET promotion_code = employee_number
WHERE role IN ('partner', 'admin')
  AND employee_number IS NOT NULL
  AND promotion_code IS DISTINCT FROM employee_number;

INSERT INTO public.promotion_codes (code, partner_id, is_active)
SELECT p.promotion_code, p.id, true
FROM public.profiles p
WHERE p.role IN ('partner', 'admin')
  AND p.promotion_code IS NOT NULL
ON CONFLICT (code) DO UPDATE
  SET partner_id = EXCLUDED.partner_id,
      is_active = true;

-- 5) Scoped visibility helpers
CREATE OR REPLACE FUNCTION public.can_view_profile_scoped(_target_profile_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _me UUID;
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN FALSE;
  END IF;

  SELECT public.get_profile_id(auth.uid()) INTO _me;
  IF _me IS NULL THEN
    RETURN FALSE;
  END IF;

  IF _target_profile_id = _me THEN
    RETURN TRUE;
  END IF;

  IF public.is_super_admin() THEN
    RETURN TRUE;
  END IF;

  -- MLM admins: only their own downline tree.
  IF public.has_role(_me, 'admin'::app_role) THEN
    RETURN EXISTS (
      SELECT 1
      FROM public.user_hierarchy uh
      WHERE uh.ancestor_id = _me
        AND uh.user_id = _target_profile_id
        AND uh.hierarchy_type = 'mlm'
        AND uh.level_number BETWEEN 1 AND 5
    );
  END IF;

  -- Callcenter users: only same call center tree.
  IF public.has_role(_me, 'callcenter'::app_role) THEN
    RETURN EXISTS (
      SELECT 1
      FROM public.call_center_employees c1
      JOIN public.call_center_employees c2
        ON c1.call_center_id = c2.call_center_id
      WHERE c1.profile_id = _me
        AND c2.profile_id = _target_profile_id
        AND c1.is_active = true
        AND c2.is_active = true
    )
    OR EXISTS (
      SELECT 1
      FROM public.call_centers cc
      JOIN public.call_center_employees c2 ON c2.call_center_id = cc.id
      WHERE cc.owner_id = _me
        AND c2.profile_id = _target_profile_id
        AND c2.is_active = true
    );
  END IF;

  RETURN FALSE;
END;
$$;

-- 6) Core profile immutability for self-service dashboard updates
CREATE OR REPLACE FUNCTION public.enforce_profile_immutability()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN NEW;
  END IF;

  -- User may edit mutable fields only on own profile.
  IF NEW.user_id = auth.uid() THEN
    IF NEW.first_name IS DISTINCT FROM OLD.first_name
      OR NEW.last_name IS DISTINCT FROM OLD.last_name
      OR NEW.email IS DISTINCT FROM OLD.email
      OR NEW.id_number IS DISTINCT FROM OLD.id_number
      OR NEW.user_id IS DISTINCT FROM OLD.user_id
      OR NEW.sponsor_id IS DISTINCT FROM OLD.sponsor_id
      OR NEW.promotion_code IS DISTINCT FROM OLD.promotion_code
      OR NEW.employee_number IS DISTINCT FROM OLD.employee_number THEN
      RAISE EXCEPTION 'Core identity fields are immutable. Only mutable profile fields can be updated.';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS enforce_profile_immutability_trigger ON public.profiles;
CREATE TRIGGER enforce_profile_immutability_trigger
BEFORE UPDATE ON public.profiles
FOR EACH ROW
EXECUTE FUNCTION public.enforce_profile_immutability();

-- 7) Replace broad admin profile access with scoped policy
DROP POLICY IF EXISTS "Admins can view all profiles" ON public.profiles;
DROP POLICY IF EXISTS "Admins can update all profiles" ON public.profiles;
DROP POLICY IF EXISTS "admins_update_all" ON public.profiles;

CREATE POLICY "Scoped admin profile read"
ON public.profiles FOR SELECT
TO authenticated
USING (public.can_view_profile_scoped(id));

CREATE POLICY "Scoped admin profile update"
ON public.profiles FOR UPDATE
TO authenticated
USING (public.can_view_profile_scoped(id))
WITH CHECK (public.can_view_profile_scoped(id));

-- 8) Scoped visibility for hierarchy, commissions, transactions, promo codes
CREATE POLICY "Scoped hierarchy read"
ON public.user_hierarchy FOR SELECT
TO authenticated
USING (
  user_id = public.get_profile_id(auth.uid())
  OR ancestor_id = public.get_profile_id(auth.uid())
  OR public.is_super_admin()
);

CREATE POLICY "Scoped commissions read"
ON public.commissions FOR SELECT
TO authenticated
USING (
  partner_id = public.get_profile_id(auth.uid())
  OR public.is_super_admin()
  OR public.can_view_profile_scoped(partner_id)
);

CREATE POLICY "Scoped transactions read"
ON public.transactions FOR SELECT
TO authenticated
USING (
  customer_id = public.get_profile_id(auth.uid())
  OR public.is_super_admin()
  OR (customer_id IS NOT NULL AND public.can_view_profile_scoped(customer_id))
);

DROP POLICY IF EXISTS "Call center sees own promo codes" ON public.promotion_codes;
CREATE POLICY "Scoped promotion code read"
ON public.promotion_codes FOR SELECT
TO authenticated
USING (
  partner_id = public.get_profile_id(auth.uid())
  OR public.is_super_admin()
  OR public.can_view_profile_scoped(partner_id)
  OR (
    call_center_id IS NOT NULL
    AND call_center_id = public.get_user_call_center_id()
  )
);

COMMIT;
