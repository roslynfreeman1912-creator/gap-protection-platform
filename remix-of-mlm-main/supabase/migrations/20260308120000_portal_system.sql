-- Portal/Tenant system: partner/callcenter/mlm/custom portals with pages + members
BEGIN;

-- Enum for portal-scoped roles
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'portal_role') THEN
    CREATE TYPE public.portal_role AS ENUM ('owner', 'admin', 'editor', 'viewer');
  END IF;
END$$;

-- Portals table (tenant container)
CREATE TABLE IF NOT EXISTS public.portals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slug TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  portal_type TEXT NOT NULL DEFAULT 'custom',
  is_active BOOLEAN NOT NULL DEFAULT true,
  modules JSONB NOT NULL DEFAULT '[]'::jsonb,
  settings JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_portals_active ON public.portals(is_active) WHERE is_active = true;
CREATE INDEX IF NOT EXISTS idx_portals_type ON public.portals(portal_type);

-- Membership table
CREATE TABLE IF NOT EXISTS public.portal_members (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  portal_id UUID NOT NULL REFERENCES public.portals(id) ON DELETE CASCADE,
  profile_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  role public.portal_role NOT NULL DEFAULT 'viewer',
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (portal_id, profile_id)
);

CREATE INDEX IF NOT EXISTS idx_portal_members_portal ON public.portal_members(portal_id);
CREATE INDEX IF NOT EXISTS idx_portal_members_profile ON public.portal_members(profile_id);

-- Pages table (simple page builder via JSON)
CREATE TABLE IF NOT EXISTS public.portal_pages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  portal_id UUID NOT NULL REFERENCES public.portals(id) ON DELETE CASCADE,
  slug TEXT NOT NULL,
  title TEXT NOT NULL,
  content JSONB NOT NULL DEFAULT '{}'::jsonb,
  is_published BOOLEAN NOT NULL DEFAULT true,
  created_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  updated_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (portal_id, slug)
);

CREATE INDEX IF NOT EXISTS idx_portal_pages_portal ON public.portal_pages(portal_id);
CREATE INDEX IF NOT EXISTS idx_portal_pages_published ON public.portal_pages(is_published) WHERE is_published = true;

-- Helper functions (avoid RLS recursion)
CREATE OR REPLACE FUNCTION public.is_portal_member(_portal_id UUID)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.portal_members pm
    WHERE pm.portal_id = _portal_id
      AND pm.profile_id = public.get_profile_id(auth.uid())
      AND pm.is_active = true
  )
$$;

CREATE OR REPLACE FUNCTION public.has_any_portal_role(_portal_id UUID, _roles public.portal_role[])
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.portal_members pm
    WHERE pm.portal_id = _portal_id
      AND pm.profile_id = public.get_profile_id(auth.uid())
      AND pm.is_active = true
      AND pm.role = ANY (_roles)
  )
$$;

-- RLS
ALTER TABLE public.portals ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.portal_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.portal_pages ENABLE ROW LEVEL SECURITY;

-- Portals: members can view their portals, admins can manage
DROP POLICY IF EXISTS "Portal members can view portals" ON public.portals;
CREATE POLICY "Portal members can view portals"
  ON public.portals FOR SELECT
  USING (
    public.is_admin()
    OR public.is_super_admin()
    OR EXISTS (
      SELECT 1 FROM public.portal_members pm
      WHERE pm.portal_id = portals.id
        AND pm.profile_id = public.get_profile_id(auth.uid())
        AND pm.is_active = true
    )
  );

DROP POLICY IF EXISTS "Admins can manage portals" ON public.portals;
CREATE POLICY "Admins can manage portals"
  ON public.portals FOR ALL
  USING (public.is_admin() OR public.is_super_admin())
  WITH CHECK (public.is_admin() OR public.is_super_admin());

-- Portal members: user can view own membership, portal admins can manage, admins can manage
DROP POLICY IF EXISTS "Portal members can view own membership" ON public.portal_members;
CREATE POLICY "Portal members can view own membership"
  ON public.portal_members FOR SELECT
  USING (
    public.is_admin()
    OR public.is_super_admin()
    OR profile_id = public.get_profile_id(auth.uid())
    OR public.has_any_portal_role(portal_id, ARRAY['owner','admin']::public.portal_role[])
  );

DROP POLICY IF EXISTS "Portal admins can manage members" ON public.portal_members;
CREATE POLICY "Portal admins can manage members"
  ON public.portal_members FOR ALL
  USING (
    public.is_admin()
    OR public.is_super_admin()
    OR public.has_any_portal_role(portal_id, ARRAY['owner','admin']::public.portal_role[])
  )
  WITH CHECK (
    public.is_admin()
    OR public.is_super_admin()
    OR public.has_any_portal_role(portal_id, ARRAY['owner','admin']::public.portal_role[])
  );

-- Portal pages: members can read published pages; editors/admins can write; admins can manage all
DROP POLICY IF EXISTS "Portal members can view pages" ON public.portal_pages;
CREATE POLICY "Portal members can view pages"
  ON public.portal_pages FOR SELECT
  USING (
    public.is_admin()
    OR public.is_super_admin()
    OR (public.is_portal_member(portal_id) AND is_published = true)
    OR public.has_any_portal_role(portal_id, ARRAY['owner','admin','editor']::public.portal_role[])
  );

DROP POLICY IF EXISTS "Portal editors can manage pages" ON public.portal_pages;
CREATE POLICY "Portal editors can manage pages"
  ON public.portal_pages FOR ALL
  USING (
    public.is_admin()
    OR public.is_super_admin()
    OR public.has_any_portal_role(portal_id, ARRAY['owner','admin','editor']::public.portal_role[])
  )
  WITH CHECK (
    public.is_admin()
    OR public.is_super_admin()
    OR public.has_any_portal_role(portal_id, ARRAY['owner','admin','editor']::public.portal_role[])
  );

-- Auto-update timestamps
CREATE OR REPLACE FUNCTION public.update_portal_timestamp()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS portals_updated ON public.portals;
CREATE TRIGGER portals_updated
  BEFORE UPDATE ON public.portals
  FOR EACH ROW
  EXECUTE FUNCTION public.update_portal_timestamp();

DROP TRIGGER IF EXISTS portal_members_updated ON public.portal_members;
CREATE TRIGGER portal_members_updated
  BEFORE UPDATE ON public.portal_members
  FOR EACH ROW
  EXECUTE FUNCTION public.update_portal_timestamp();

DROP TRIGGER IF EXISTS portal_pages_updated ON public.portal_pages;
CREATE TRIGGER portal_pages_updated
  BEFORE UPDATE ON public.portal_pages
  FOR EACH ROW
  EXECUTE FUNCTION public.update_portal_timestamp();

COMMIT;

