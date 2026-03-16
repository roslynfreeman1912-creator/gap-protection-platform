-- =============================================
-- GAP PROTECTION - COMPLETE SECURE DATABASE SCHEMA
-- =============================================

-- 1. Create enum for roles (user_roles table based approach)
CREATE TYPE public.app_role AS ENUM ('admin', 'partner', 'customer');

-- 2. Create user_roles table (CRITICAL: Separate from profiles for security)
CREATE TABLE public.user_roles (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL,
    role app_role NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
    UNIQUE (user_id, role)
);

-- Enable RLS on user_roles
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

-- 3. Security definer function to check roles (prevents RLS recursion)
CREATE OR REPLACE FUNCTION public.has_role(_user_id UUID, _role app_role)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.user_roles
    WHERE user_id = _user_id
      AND role = _role
  )
$$;

-- 4. Function to get user profile id from auth id
CREATE OR REPLACE FUNCTION public.get_profile_id(_auth_user_id UUID)
RETURNS UUID
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT id FROM public.profiles WHERE user_id = _auth_user_id LIMIT 1
$$;

-- 5. Create groups table (unlimited groups support)
CREATE TABLE public.groups (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    description TEXT,
    commission_model_id UUID REFERENCES public.commission_models(id),
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

ALTER TABLE public.groups ENABLE ROW LEVEL SECURITY;

-- 6. Create user_groups junction table (user can be in multiple groups)
CREATE TABLE public.user_groups (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    group_id UUID NOT NULL REFERENCES public.groups(id) ON DELETE CASCADE,
    joined_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
    UNIQUE(user_id, group_id)
);

ALTER TABLE public.user_groups ENABLE ROW LEVEL SECURITY;

-- 7. Create scan_attempts table for Small Devil rate limiting
CREATE TABLE public.scan_attempts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    network_hash TEXT NOT NULL,
    ip_address TEXT,
    domain TEXT,
    attempt_count INTEGER DEFAULT 1,
    last_attempt_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
    first_attempt_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

CREATE UNIQUE INDEX idx_scan_attempts_network_hash ON public.scan_attempts(network_hash);
ALTER TABLE public.scan_attempts ENABLE ROW LEVEL SECURITY;

-- 8. Create scan_results_light table (only green/red for Small Devil)
CREATE TABLE public.scan_results_light (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    scan_attempt_id UUID REFERENCES public.scan_attempts(id),
    network_hash TEXT NOT NULL,
    result TEXT NOT NULL CHECK (result IN ('green', 'red')),
    scanned_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

ALTER TABLE public.scan_results_light ENABLE ROW LEVEL SECURITY;

-- 9. Create ranks table for Leadership Pool
CREATE TABLE public.ranks (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL UNIQUE,
    level INTEGER NOT NULL UNIQUE,
    shares_count INTEGER NOT NULL DEFAULT 1,
    min_direct_partners INTEGER NOT NULL,
    min_team_contracts INTEGER NOT NULL,
    min_level1_partners INTEGER DEFAULT 0,
    min_level2_partners INTEGER DEFAULT 0,
    description TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

ALTER TABLE public.ranks ENABLE ROW LEVEL SECURITY;

-- 10. Insert default ranks
INSERT INTO public.ranks (name, level, shares_count, min_direct_partners, min_team_contracts, min_level1_partners, min_level2_partners, description) VALUES
('Business Partner Plus', 1, 1, 5, 500, 0, 0, 'Pool Level 1 - 1 Share'),
('National Partner', 2, 3, 5, 1500, 3, 0, 'Pool Level 2 - 3 Shares'),
('World Partner', 3, 7, 7, 7500, 5, 3, 'Pool Level 3 - 7 Shares');

-- 11. Create user_rank_history table
CREATE TABLE public.user_rank_history (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    rank_id UUID NOT NULL REFERENCES public.ranks(id),
    qualified_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
    is_current BOOLEAN DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

ALTER TABLE public.user_rank_history ENABLE ROW LEVEL SECURITY;

-- 12. Create pool_config table
CREATE TABLE public.pool_config (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL UNIQUE DEFAULT 'leadership_pool',
    percentage_cap DECIMAL(5,2) NOT NULL DEFAULT 2.00,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

INSERT INTO public.pool_config (name, percentage_cap) VALUES ('leadership_pool', 2.00);
ALTER TABLE public.pool_config ENABLE ROW LEVEL SECURITY;

-- 13. Create pool_payouts table
CREATE TABLE public.pool_payouts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES public.profiles(id),
    rank_id UUID NOT NULL REFERENCES public.ranks(id),
    period_month DATE NOT NULL,
    total_pool_amount DECIMAL(12,2) NOT NULL,
    total_shares INTEGER NOT NULL,
    user_shares INTEGER NOT NULL,
    share_value DECIMAL(12,4) NOT NULL,
    payout_amount DECIMAL(12,2) NOT NULL,
    status TEXT DEFAULT 'pending',
    paid_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

ALTER TABLE public.pool_payouts ENABLE ROW LEVEL SECURITY;

-- =============================================
-- RLS POLICIES
-- =============================================

-- user_roles policies
CREATE POLICY "Users can view own roles"
ON public.user_roles FOR SELECT
USING (user_id IN (SELECT id FROM public.profiles WHERE profiles.user_id = auth.uid()));

CREATE POLICY "Admins can manage all roles"
ON public.user_roles FOR ALL
USING (public.has_role(public.get_profile_id(auth.uid()), 'admin'));

-- groups policies
CREATE POLICY "Authenticated users can view groups"
ON public.groups FOR SELECT TO authenticated
USING (true);

CREATE POLICY "Admins can manage groups"
ON public.groups FOR ALL
USING (public.has_role(public.get_profile_id(auth.uid()), 'admin'));

-- user_groups policies
CREATE POLICY "Users can view own group memberships"
ON public.user_groups FOR SELECT
USING (user_id IN (SELECT id FROM public.profiles WHERE profiles.user_id = auth.uid()));

-- scan_attempts policies (allow anonymous for rate limiting)
CREATE POLICY "Anyone can insert scan attempts"
ON public.scan_attempts FOR INSERT
WITH CHECK (true);

CREATE POLICY "Anyone can view scan attempts by hash"
ON public.scan_attempts FOR SELECT
USING (true);

CREATE POLICY "Anyone can update scan attempts"
ON public.scan_attempts FOR UPDATE
USING (true);

-- scan_results_light policies
CREATE POLICY "Anyone can insert scan results"
ON public.scan_results_light FOR INSERT
WITH CHECK (true);

CREATE POLICY "Anyone can view scan results"
ON public.scan_results_light FOR SELECT
USING (true);

-- ranks policies
CREATE POLICY "Authenticated can view ranks"
ON public.ranks FOR SELECT TO authenticated
USING (true);

-- user_rank_history policies
CREATE POLICY "Users can view own rank history"
ON public.user_rank_history FOR SELECT
USING (user_id IN (SELECT id FROM public.profiles WHERE profiles.user_id = auth.uid()));

-- pool_config policies
CREATE POLICY "Authenticated can view pool config"
ON public.pool_config FOR SELECT TO authenticated
USING (true);

-- pool_payouts policies
CREATE POLICY "Users can view own pool payouts"
ON public.pool_payouts FOR SELECT
USING (user_id IN (SELECT id FROM public.profiles WHERE profiles.user_id = auth.uid()));

-- =============================================
-- TRIGGER: Assign customer role on profile creation
-- =============================================
CREATE OR REPLACE FUNCTION public.assign_customer_role()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    INSERT INTO public.user_roles (user_id, role)
    VALUES (NEW.id, 'customer')
    ON CONFLICT (user_id, role) DO NOTHING;
    
    RETURN NEW;
END;
$$;

CREATE TRIGGER on_profile_created_assign_role
AFTER INSERT ON public.profiles
FOR EACH ROW
EXECUTE FUNCTION public.assign_customer_role();

-- =============================================
-- FUNCTION: Promote user to partner
-- =============================================
CREATE OR REPLACE FUNCTION public.promote_to_partner(_profile_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    -- Add partner role (keeps customer role - dual role)
    INSERT INTO public.user_roles (user_id, role)
    VALUES (_profile_id, 'partner')
    ON CONFLICT (user_id, role) DO NOTHING;
    
    -- Generate promotion code if not exists
    IF NOT EXISTS (SELECT 1 FROM public.promotion_codes WHERE partner_id = _profile_id) THEN
        INSERT INTO public.promotion_codes (code, partner_id)
        VALUES ('GP-' || UPPER(SUBSTRING(MD5(RANDOM()::TEXT) FROM 1 FOR 6)), _profile_id);
    END IF;
    
    -- Log to audit
    INSERT INTO public.audit_log (action, table_name, record_id, new_data)
    VALUES ('PROMOTE_TO_PARTNER', 'user_roles', _profile_id, jsonb_build_object('role', 'partner'));
    
    RETURN TRUE;
END;
$$;

-- =============================================
-- FUNCTION: Check if user is admin (for use in app)
-- =============================================
CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.has_role(public.get_profile_id(auth.uid()), 'admin')
$$;

-- =============================================
-- FUNCTION: Check Small Devil rate limit (max 3 per network)
-- =============================================
CREATE OR REPLACE FUNCTION public.check_scan_rate_limit(_network_hash TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    current_count INTEGER;
    result JSONB;
BEGIN
    SELECT attempt_count INTO current_count
    FROM public.scan_attempts
    WHERE network_hash = _network_hash;
    
    IF current_count IS NULL THEN
        -- First attempt
        INSERT INTO public.scan_attempts (network_hash, attempt_count)
        VALUES (_network_hash, 1);
        
        result := jsonb_build_object('allowed', true, 'remaining', 2);
    ELSIF current_count >= 3 THEN
        -- Limit reached
        result := jsonb_build_object('allowed', false, 'remaining', 0, 'message', 'Maximale Anzahl Tests erreicht');
    ELSE
        -- Increment
        UPDATE public.scan_attempts
        SET attempt_count = attempt_count + 1, last_attempt_at = now()
        WHERE network_hash = _network_hash;
        
        result := jsonb_build_object('allowed', true, 'remaining', 2 - current_count);
    END IF;
    
    RETURN result;
END;
$$;

-- Insert default groups
INSERT INTO public.groups (name, description, commission_model_id) 
SELECT 'MLM Standard', 'Standard MLM mit Dynamic Shift', id 
FROM public.commission_models WHERE name = 'MLM Standard' LIMIT 1;

INSERT INTO public.groups (name, description, commission_model_id)
SELECT 'Call Center', 'Call Center Modell ohne Shift', id
FROM public.commission_models WHERE name = 'Call Center' LIMIT 1;