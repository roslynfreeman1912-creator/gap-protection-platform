-- ═══════════════════════════════════════════════════════════════════════════
-- Create Test Promotion Codes
-- إنشاء أكواد ترويجية للاختبار
-- ═══════════════════════════════════════════════════════════════════════════

-- 1. Create a fixed test code valid for 1 year
-- إنشاء كود اختبار ثابت صالح لمدة سنة

INSERT INTO public.rotating_promo_codes (
    code, 
    code_type, 
    is_active, 
    valid_from, 
    valid_to, 
    max_uses,
    use_count
)
VALUES 
    ('TEST2024', 'fixed', true, NOW(), NOW() + INTERVAL '1 year', 1000, 0),
    ('WELCOME2024', 'fixed', true, NOW(), NOW() + INTERVAL '1 year', 10000, 0),
    ('DEMO2024', 'fixed', true, NOW(), NOW() + INTERVAL '6 months', 500, 0)
ON CONFLICT (code) 
DO UPDATE SET 
    is_active = true,
    valid_to = NOW() + INTERVAL '1 year',
    max_uses = EXCLUDED.max_uses;

-- 2. Create a partner-specific promotion code (if you have a partner)
-- إنشاء كود ترويجي خاص بشريك (إذا كان لديك شريك)

-- First, check if we have any partners
DO $$
DECLARE
    partner_id UUID;
BEGIN
    -- Get first partner ID
    SELECT id INTO partner_id
    FROM public.profiles
    WHERE role = 'partner'
    LIMIT 1;
    
    -- If partner exists, create a code for them
    IF partner_id IS NOT NULL THEN
        INSERT INTO public.promotion_codes (
            code,
            partner_id,
            is_active,
            max_uses,
            usage_count
        )
        VALUES (
            'PARTNER' || SUBSTRING(partner_id::text, 1, 8),
            partner_id,
            true,
            NULL,  -- Unlimited
            0
        )
        ON CONFLICT (code) DO NOTHING;
        
        RAISE NOTICE 'Created promotion code for partner: %', partner_id;
    ELSE
        RAISE NOTICE 'No partners found - skipping partner code creation';
    END IF;
END $$;

-- 3. Verify created codes
-- التحقق من الأكواد المنشأة

SELECT 
    code,
    code_type,
    is_active,
    valid_from,
    valid_to,
    use_count,
    max_uses,
    CASE 
        WHEN valid_to < NOW() THEN 'منتهي الصلاحية'
        WHEN NOT is_active THEN 'غير نشط'
        WHEN max_uses IS NOT NULL AND use_count >= max_uses THEN 'وصل للحد الأقصى'
        ELSE 'صالح'
    END as status
FROM public.rotating_promo_codes
WHERE code IN ('TEST2024', 'WELCOME2024', 'DEMO2024')
ORDER BY created_at DESC;

-- 4. Check partner codes
-- التحقق من أكواد الشركاء

SELECT 
    pc.code,
    pc.is_active,
    pc.usage_count,
    pc.max_uses,
    p.first_name || ' ' || p.last_name as partner_name,
    p.email as partner_email,
    CASE 
        WHEN pc.expires_at IS NOT NULL AND pc.expires_at < NOW() THEN 'منتهي الصلاحية'
        WHEN NOT pc.is_active THEN 'غير نشط'
        WHEN pc.max_uses IS NOT NULL AND pc.usage_count >= pc.max_uses THEN 'وصل للحد الأقصى'
        ELSE 'صالح'
    END as status
FROM public.promotion_codes pc
JOIN public.profiles p ON pc.partner_id = p.id
ORDER BY pc.created_at DESC
LIMIT 10;

-- ═══════════════════════════════════════════════════════════════════════════
-- Usage Instructions
-- تعليمات الاستخدام
-- ═══════════════════════════════════════════════════════════════════════════

/*
استخدم أحد الأكواد التالية للتسجيل:

1. TEST2024 - كود اختبار (1000 استخدام)
2. WELCOME2024 - كود ترحيبي (10000 استخدام)
3. DEMO2024 - كود تجريبي (500 استخدام)

مثال على رابط التسجيل:
http://localhost:8080/register?code=TEST2024

أو استخدم كود الشريك إذا كان متاحاً:
http://localhost:8080/register?code=PARTNER12345678
*/
