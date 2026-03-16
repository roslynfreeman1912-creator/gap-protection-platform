# ⚡ دليل الإصلاح السريع - GAP Protection

## للمطورين: حل المشاكل الحرجة في 48 ساعة

---

## 🎯 المشكلة الرئيسية: "Profile could not be created"

### الحل السريع (5 دقائق)

```powershell
cd remix-of-mlm-main
.\fix-registration.ps1
.\quick-test.ps1
```

**إذا نجح**: ✅ المشكلة محلولة!
**إذا فشل**: اتبع الخطوات التفصيلية أدناه ⬇️

---

## 🔧 الإصلاحات الحرجة (Critical Fixes)

### 1. إصلاح قاعدة البيانات (10 دقائق)

```sql
-- في Supabase SQL Editor
-- https://supabase.com/dashboard/project/pqnzsihfryjnnhdubisk/sql

-- الخطوة 1: تشغيل fix-customer-registration.sql
-- انسخ المحتوى بالكامل والصقه

-- الخطوة 2: التحقق من الأعمدة
SELECT column_name, data_type 
FROM information_schema.columns
WHERE table_name = 'profiles'
    AND column_name IN ('date_of_birth', 'age_confirmed', 'id_number');

-- يجب أن ترى 3 صفوف

-- الخطوة 3: إنشاء أكواد ترويجية
-- تشغيل create-test-promo-code.sql

-- الخطوة 4: التحقق
SELECT code, is_active, valid_to 
FROM rotating_promo_codes 
WHERE code = 'TEST2024';

-- يجب أن ترى كود نشط
```

### 2. إعادة نشر Edge Function (5 دقائق)

```bash
# في Terminal
cd remix-of-mlm-main

# إعادة نشر register function
supabase functions deploy register --project-ref pqnzsihfryjnnhdubisk

# التحقق من Logs
supabase functions logs register --project-ref pqnzsihfryjnnhdubisk
```

### 3. اختبار التسجيل (2 دقيقة)

```powershell
# تشغيل اختبار سريع
.\quick-test.ps1

# أو يدوياً
$body = @{
    email = "test@example.com"
    password = "Test1234!"
    firstName = "Test"
    lastName = "User"
    idNumber = "123456789"
    dateOfBirth = "1990-01-01"
    street = "Test Street"
    houseNumber = "123"
    postalCode = "12345"
    city = "Berlin"
    country = "Deutschland"
    domain = "test.com"
    iban = "DE89370400440532013000"
    bankName = "Test Bank"
    accountHolder = "Test User"
    promotionCode = "TEST2024"
    domainOwner = $true
    sepaMandate = $true
    terms = $true
    privacy = $true
    ageConfirmation = $true
} | ConvertTo-Json

Invoke-RestMethod -Uri "https://pqnzsihfryjnnhdubisk.supabase.co/functions/v1/register" `
    -Method POST `
    -Headers @{"Content-Type"="application/json"; "apikey"="your-anon-key"} `
    -Body $body
```

---

## 🚨 الإصلاحات الأمنية الحرجة (48 ساعة)

### 1. تفعيل 2FA (4 ساعات)

```sql
-- إنشاء جدول 2FA
CREATE TABLE user_2fa (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE UNIQUE,
    secret TEXT NOT NULL,
    enabled BOOLEAN DEFAULT FALSE,
    backup_codes TEXT[],
    created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE user_2fa ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage own 2FA"
ON user_2fa FOR ALL
USING (auth.uid() = user_id);
```

```typescript
// إنشاء setup-2fa function
// انظر CRITICAL-ISSUES-SOLUTIONS-AR.md للكود الكامل
```

### 2. تشفير البيانات الحساسة (6 ساعات)

```sql
-- تفعيل pgcrypto
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- إنشاء دوال التشفير
CREATE OR REPLACE FUNCTION encrypt_pii(data TEXT)
RETURNS TEXT AS $$
DECLARE
    key TEXT := current_setting('app.pii_encryption_key', true);
BEGIN
    RETURN encode(encrypt(data::bytea, key::bytea, 'aes'), 'base64');
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE FUNCTION decrypt_pii(encrypted TEXT)
RETURNS TEXT AS $$
DECLARE
    key TEXT := current_setting('app.pii_encryption_key', true);
BEGIN
    RETURN convert_from(decrypt(decode(encrypted, 'base64'), key::bytea, 'aes'), 'UTF8');
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- تشفير البيانات الموجودة
UPDATE profiles
SET 
    iban = encrypt_pii(iban),
    bic = encrypt_pii(bic),
    id_number = encrypt_pii(id_number)
WHERE iban IS NOT NULL;
```

### 3. تفعيل الدوال المالية (8 ساعات)

```typescript
// في supabase/functions/_shared/auth.ts

// تغيير MAINTENANCE_MODE
const MAINTENANCE_MODE = false; // كان true

// إضافة Circuit Breaker
class CircuitBreaker {
    private failures = 0;
    private lastFailure = 0;
    private readonly threshold = 5;
    private readonly timeout = 60000;
    
    async execute<T>(fn: () => Promise<T>): Promise<T> {
        if (this.isOpen()) {
            throw new Error('Circuit breaker OPEN');
        }
        
        try {
            const result = await fn();
            this.onSuccess();
            return result;
        } catch (error) {
            this.onFailure();
            throw error;
        }
    }
    
    private isOpen(): boolean {
        if (this.failures >= this.threshold) {
            return Date.now() - this.lastFailure < this.timeout;
        }
        return false;
    }
    
    private onSuccess() { this.failures = 0; }
    private onFailure() { 
        this.failures++; 
        this.lastFailure = Date.now(); 
    }
}

// استخدام في calculate-commissions
const breaker = new CircuitBreaker();
await breaker.execute(() => calculateCommissions(txId));
```

### 4. إضافة Monitoring (4 ساعات)

```typescript
// تثبيت Sentry
npm install @sentry/node @sentry/deno

// في كل Edge Function
import * as Sentry from "https://deno.land/x/sentry/index.ts";

Sentry.init({
    dsn: Deno.env.get('SENTRY_DSN'),
    environment: 'production',
    tracesSampleRate: 1.0
});

// في try-catch
try {
    // ... الكود
} catch (error) {
    Sentry.captureException(error);
    throw error;
}
```

```sql
-- إنشاء جدول Metrics
CREATE TABLE system_metrics (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    metric_name TEXT NOT NULL,
    metric_value NUMERIC NOT NULL,
    tags JSONB,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_metrics_name_time 
ON system_metrics(metric_name, created_at DESC);

-- Function لتسجيل Metrics
CREATE OR REPLACE FUNCTION log_metric(
    p_name TEXT,
    p_value NUMERIC,
    p_tags JSONB DEFAULT '{}'
) RETURNS VOID AS $$
BEGIN
    INSERT INTO system_metrics (metric_name, metric_value, tags)
    VALUES (p_name, p_value, p_tags);
END;
$$ LANGUAGE plpgsql;

-- استخدام
SELECT log_metric('registration_success', 1, '{"source": "web"}'::jsonb);
SELECT log_metric('commission_calculated', 50.00, '{"level": 1}'::jsonb);
```

---

## 📊 Dashboard للمراقبة (2 ساعات)

```sql
-- إنشاء Views للمراقبة

-- 1. Registrations per day
CREATE OR REPLACE VIEW daily_registrations AS
SELECT 
    DATE(created_at) as date,
    COUNT(*) as count,
    COUNT(*) FILTER (WHERE status = 'active') as active,
    COUNT(*) FILTER (WHERE status = 'pending') as pending
FROM profiles
WHERE created_at > NOW() - INTERVAL '30 days'
GROUP BY DATE(created_at)
ORDER BY date DESC;

-- 2. Commission stats
CREATE OR REPLACE VIEW commission_stats AS
SELECT 
    DATE(created_at) as date,
    COUNT(*) as total_commissions,
    SUM(commission_amount) as total_amount,
    AVG(commission_amount) as avg_amount,
    COUNT(*) FILTER (WHERE status = 'pending') as pending,
    COUNT(*) FILTER (WHERE status = 'paid') as paid
FROM commissions
WHERE created_at > NOW() - INTERVAL '30 days'
GROUP BY DATE(created_at)
ORDER BY date DESC;

-- 3. Error rates
CREATE OR REPLACE VIEW error_rates AS
SELECT 
    DATE(created_at) as date,
    COUNT(*) as total_errors,
    COUNT(*) FILTER (WHERE action = 'REGISTRATION_FAILED') as registration_errors,
    COUNT(*) FILTER (WHERE action = 'COMMISSION_FAILED') as commission_errors
FROM audit_log
WHERE action LIKE '%FAILED%'
    AND created_at > NOW() - INTERVAL '7 days'
GROUP BY DATE(created_at)
ORDER BY date DESC;
```

---

## ✅ قائمة التحقق السريعة

### قبل الإطلاق (يجب إكمالها)

- [ ] ✅ إصلاح قاعدة البيانات (fix-customer-registration.sql)
- [ ] ✅ إنشاء أكواد ترويجية (create-test-promo-code.sql)
- [ ] ✅ إعادة نشر register function
- [ ] ✅ اختبار التسجيل (quick-test.ps1)
- [ ] 🔴 تفعيل 2FA للـ Admins
- [ ] 🔴 تشفير البيانات الحساسة
- [ ] 🔴 تفعيل الدوال المالية
- [ ] 🔴 إضافة Monitoring
- [ ] 🟠 Penetration Testing
- [ ] 🟠 استشارة قانونية

### بعد الإطلاق (خلال شهر)

- [ ] تطبيق Queue System
- [ ] إضافة Caching Layer
- [ ] تحسين الأداء
- [ ] Load Testing
- [ ] Disaster Recovery Plan
- [ ] كتابة الاختبارات

---

## 🆘 الدعم السريع

### مشكلة: التسجيل لا يعمل
```bash
# 1. تحقق من Logs
supabase functions logs register --project-ref pqnzsihfryjnnhdubisk

# 2. تحقق من قاعدة البيانات
# في SQL Editor
SELECT * FROM profiles ORDER BY created_at DESC LIMIT 5;

# 3. تحقق من الأكواد الترويجية
SELECT * FROM rotating_promo_codes WHERE is_active = true;
```

### مشكلة: الدوال المالية لا تعمل
```typescript
// تحقق من MAINTENANCE_MODE
// في _shared/auth.ts
const MAINTENANCE_MODE = false; // يجب أن يكون false
```

### مشكلة: بطء في الأداء
```sql
-- تحقق من Indexes
SELECT schemaname, tablename, indexname 
FROM pg_indexes 
WHERE schemaname = 'public';

-- أضف Indexes مفقودة
CREATE INDEX IF NOT EXISTS idx_profiles_sponsor ON profiles(sponsor_id);
CREATE INDEX IF NOT EXISTS idx_user_hierarchy_user ON user_hierarchy(user_id);
CREATE INDEX IF NOT EXISTS idx_commissions_partner ON commissions(partner_id);
```

---

**تم إعداده بواسطة**: Senior Software Architect
**آخر تحديث**: مارس 2026
**الحالة**: جاهز للتطبيق ✅
