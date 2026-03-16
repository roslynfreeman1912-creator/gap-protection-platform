-- ═══════════════════════════════════════════════════════════════════════════
-- FIX CUSTOMER REGISTRATION - إصلاح مشكلة إضافة العملاء
-- ═══════════════════════════════════════════════════════════════════════════
-- This script fixes all issues preventing customer registration
-- هذا السكريبت يصلح جميع المشاكل التي تمنع تسجيل العملاء
-- ═══════════════════════════════════════════════════════════════════════════

-- 1. Ensure profiles table has all required columns
-- التأكد من أن جدول profiles يحتوي على جميع الأعمدة المطلوبة

-- Add date_of_birth if missing
ALTER TABLE public.profiles 
ADD COLUMN IF NOT EXISTS date_of_birth DATE NULL;

-- Add age_confirmed if missing
ALTER TABLE public.profiles 
ADD COLUMN IF NOT EXISTS age_confirmed BOOLEAN DEFAULT false;

-- Add missing columns that might be required
ALTER TABLE public.profiles 
ADD COLUMN IF NOT EXISTS id_number TEXT NULL;

ALTER TABLE public.profiles 
ADD COLUMN IF NOT EXISTS house_number TEXT NULL;

ALTER TABLE public.profiles 
ADD COLUMN IF NOT EXISTS postal_code TEXT NULL;

ALTER TABLE public.profiles 
ADD COLUMN IF NOT EXISTS iban TEXT NULL;

ALTER TABLE public.profiles 
ADD COLUMN IF NOT EXISTS bic TEXT NULL;

ALTER TABLE public.profiles 
ADD COLUMN IF NOT EXISTS bank_name TEXT NULL;

ALTER TABLE public.profiles 
ADD COLUMN IF NOT EXISTS account_holder TEXT NULL;

ALTER TABLE public.profiles 
ADD COLUMN IF NOT EXISTS sepa_mandate_accepted BOOLEAN DEFAULT false;

ALTER TABLE public.profiles 
ADD COLUMN IF NOT EXISTS sepa_mandate_date TIMESTAMPTZ NULL;

ALTER TABLE public.profiles 
ADD COLUMN IF NOT EXISTS domain TEXT NULL;

ALTER TABLE public.profiles 
ADD COLUMN IF NOT EXISTS ip_address TEXT NULL;

ALTER TABLE public.profiles 
ADD COLUMN IF NOT EXISTS domain_verified BOOLEAN DEFAULT false;

ALTER TABLE public.profiles 
ADD COLUMN IF NOT EXISTS terms_accepted BOOLEAN DEFAULT false;

ALTER TABLE public.profiles 
ADD COLUMN IF NOT EXISTS privacy_accepted BOOLEAN DEFAULT false;

ALTER TABLE public.profiles 
ADD COLUMN IF NOT EXISTS domain_owner_confirmed BOOLEAN DEFAULT false;

ALTER TABLE public.profiles 
ADD COLUMN IF NOT EXISTS promotion_code TEXT NULL;

ALTER TABLE public.profiles 
ADD COLUMN IF NOT EXISTS sponsor_id UUID NULL;

-- Add foreign key constraint for sponsor_id if not exists
DO $$ 
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint 
        WHERE conname = 'profiles_sponsor_id_fkey'
    ) THEN
        ALTER TABLE public.profiles 
        ADD CONSTRAINT profiles_sponsor_id_fkey 
        FOREIGN KEY (sponsor_id) REFERENCES public.profiles(id);
    END IF;
END $$;

-- 2. Create or update user_roles table
-- إنشاء أو تحديث جدول user_roles

CREATE TABLE IF NOT EXISTS public.user_roles (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    role TEXT NOT NULL CHECK (role IN ('admin', 'super_admin', 'partner', 'customer', 'callcenter')),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(user_id, role)
);

-- Create index for performance
CREATE INDEX IF NOT EXISTS idx_user_roles_user_id ON public.user_roles(user_id);
CREATE INDEX IF NOT EXISTS idx_user_roles_role ON public.user_roles(role);

-- 3. Ensure promotion_codes table exists
-- التأكد من وجود جدول promotion_codes

CREATE TABLE IF NOT EXISTS public.promotion_codes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    code TEXT NOT NULL UNIQUE,
    partner_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL,
    usage_count INTEGER DEFAULT 0,
    max_uses INTEGER NULL,
    is_active BOOLEAN DEFAULT TRUE,
    expires_at TIMESTAMPTZ NULL,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_promotion_codes_code ON public.promotion_codes(code);
CREATE INDEX IF NOT EXISTS idx_promotion_codes_partner ON public.promotion_codes(partner_id);

-- 4. Ensure rotating_promo_codes table exists
-- التأكد من وجود جدول rotating_promo_codes

CREATE TABLE IF NOT EXISTS public.rotating_promo_codes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    code TEXT NOT NULL UNIQUE,
    code_type TEXT NOT NULL CHECK (code_type IN ('rotating', 'fixed')),
    is_active BOOLEAN DEFAULT TRUE,
    valid_from TIMESTAMPTZ DEFAULT NOW(),
    valid_to TIMESTAMPTZ NOT NULL,
    max_uses INTEGER NULL,
    use_count INTEGER DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_rotating_promo_codes_code ON public.rotating_promo_codes(code);
CREATE INDEX IF NOT EXISTS idx_rotating_promo_codes_active ON public.rotating_promo_codes(is_active);

-- 5. Create promo_code_usages table for tracking
-- إنشاء جدول promo_code_usages لتتبع الاستخدام

CREATE TABLE IF NOT EXISTS public.promo_code_usages (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    promo_code_id UUID NOT NULL,
    user_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE,
    user_email TEXT NOT NULL,
    result TEXT NOT NULL CHECK (result IN ('success', 'failed')),
    code_type TEXT NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_promo_code_usages_code ON public.promo_code_usages(promo_code_id);
CREATE INDEX IF NOT EXISTS idx_promo_code_usages_user ON public.promo_code_usages(user_id);

-- 6. Create audit_log table if not exists
-- إنشاء جدول audit_log إذا لم يكن موجوداً

CREATE TABLE IF NOT EXISTS public.audit_log (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    table_name TEXT NOT NULL,
    record_id UUID NOT NULL,
    action TEXT NOT NULL,
    old_data JSONB NULL,
    new_data JSONB NULL,
    user_id UUID NULL,
    ip_address TEXT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_audit_log_table ON public.audit_log(table_name);
CREATE INDEX IF NOT EXISTS idx_audit_log_record ON public.audit_log(record_id);
CREATE INDEX IF NOT EXISTS idx_audit_log_created ON public.audit_log(created_at);

-- 7. Create protected_domains table if not exists
-- إنشاء جدول protected_domains إذا لم يكن موجوداً

CREATE TABLE IF NOT EXISTS public.protected_domains (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    profile_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    domain TEXT NOT NULL,
    protection_status TEXT DEFAULT 'active' CHECK (protection_status IN ('active', 'inactive', 'suspended')),
    activated_at TIMESTAMPTZ DEFAULT NOW(),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_protected_domains_profile ON public.protected_domains(profile_id);
CREATE INDEX IF NOT EXISTS idx_protected_domains_domain ON public.protected_domains(domain);

-- 8. Create RPC functions for atomic operations
-- إنشاء دوال RPC للعمليات الذرية

-- Function to increment promo code usage atomically
CREATE OR REPLACE FUNCTION public.increment_promo_use_count(p_code_id UUID)
RETURNS void AS $$
BEGIN
    UPDATE public.rotating_promo_codes
    SET use_count = use_count + 1,
        updated_at = NOW()
    WHERE id = p_code_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to increment partner promo code usage atomically
CREATE OR REPLACE FUNCTION public.increment_partner_promo_usage(p_code TEXT)
RETURNS void AS $$
BEGIN
    UPDATE public.promotion_codes
    SET usage_count = usage_count + 1
    WHERE code = p_code;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 9. Grant necessary permissions
-- منح الصلاحيات اللازمة

GRANT ALL ON public.profiles TO authenticated;
GRANT ALL ON public.profiles TO service_role;
GRANT ALL ON public.user_roles TO authenticated;
GRANT ALL ON public.user_roles TO service_role;
GRANT ALL ON public.promotion_codes TO authenticated;
GRANT ALL ON public.promotion_codes TO service_role;
GRANT ALL ON public.rotating_promo_codes TO authenticated;
GRANT ALL ON public.rotating_promo_codes TO service_role;
GRANT ALL ON public.promo_code_usages TO authenticated;
GRANT ALL ON public.promo_code_usages TO service_role;
GRANT ALL ON public.audit_log TO authenticated;
GRANT ALL ON public.audit_log TO service_role;
GRANT ALL ON public.protected_domains TO authenticated;
GRANT ALL ON public.protected_domains TO service_role;

-- Grant execute on functions
GRANT EXECUTE ON FUNCTION public.increment_promo_use_count TO service_role;
GRANT EXECUTE ON FUNCTION public.increment_partner_promo_usage TO service_role;

-- 10. Create a test promotion code for testing
-- إنشاء كود ترويجي للاختبار

INSERT INTO public.rotating_promo_codes (code, code_type, is_active, valid_from, valid_to, max_uses)
VALUES ('TEST2024', 'fixed', true, NOW(), NOW() + INTERVAL '1 year', 1000)
ON CONFLICT (code) DO NOTHING;

-- 11. Add comments for documentation
-- إضافة تعليقات للتوثيق

COMMENT ON COLUMN public.profiles.date_of_birth IS 'Customer date of birth for 18+ verification';
COMMENT ON COLUMN public.profiles.age_confirmed IS 'Customer confirmed they are 18+ and data is accurate';
COMMENT ON COLUMN public.profiles.sponsor_id IS 'ID of the partner who referred this customer';
COMMENT ON COLUMN public.profiles.promotion_code IS 'Unique promotion code for this partner';

-- ═══════════════════════════════════════════════════════════════════════════
-- VERIFICATION QUERIES - استعلامات التحقق
-- ═══════════════════════════════════════════════════════════════════════════

-- Check if all required columns exist
SELECT 
    column_name, 
    data_type, 
    is_nullable
FROM information_schema.columns
WHERE table_schema = 'public' 
    AND table_name = 'profiles'
    AND column_name IN (
        'date_of_birth', 'age_confirmed', 'id_number', 'house_number',
        'postal_code', 'iban', 'bic', 'bank_name', 'account_holder',
        'sepa_mandate_accepted', 'sepa_mandate_date', 'domain',
        'ip_address', 'domain_verified', 'terms_accepted',
        'privacy_accepted', 'domain_owner_confirmed', 'promotion_code',
        'sponsor_id'
    )
ORDER BY column_name;

-- Check promotion codes
SELECT 
    code, 
    code_type, 
    is_active, 
    valid_from, 
    valid_to, 
    use_count, 
    max_uses
FROM public.rotating_promo_codes
WHERE is_active = true
ORDER BY created_at DESC
LIMIT 5;

-- ═══════════════════════════════════════════════════════════════════════════
-- END OF FIX SCRIPT
-- ═══════════════════════════════════════════════════════════════════════════
