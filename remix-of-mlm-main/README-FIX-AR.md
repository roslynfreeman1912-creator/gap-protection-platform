# 🔧 دليل إصلاح مشكلة تسجيل العملاء

## 📋 نظرة عامة

هذا الدليل يحل مشكلة عدم القدرة على إضافة عملاء جدد في نظام MLM الخاص بـ GAP Protection.

## 🚀 الحل السريع (3 دقائق)

### الخطوة 1: تطبيق الإصلاح

```powershell
cd remix-of-mlm-main
.\fix-registration.ps1
```

### الخطوة 2: اختبار التسجيل

```powershell
.\quick-test.ps1
```

### الخطوة 3: التحقق

افتح Supabase Dashboard وتحقق من جدول `profiles`:
```
https://supabase.com/dashboard/project/pqnzsihfryjnnhdubisk/editor
```

## 📁 الملفات المتضمنة

| الملف | الوصف |
|------|-------|
| `fix-customer-registration.sql` | سكريبت SQL لإصلاح قاعدة البيانات |
| `create-test-promo-code.sql` | إنشاء أكواد ترويجية للاختبار |
| `fix-registration.ps1` | سكريبت PowerShell تلقائي للإصلاح |
| `quick-test.ps1` | اختبار سريع للتسجيل |
| `test-registration.md` | دليل اختبار شامل |
| `FIX-REGISTRATION-AR.md` | دليل الإصلاح بالعربية |

## 🔍 ما الذي يصلحه هذا الحل؟

### 1. قاعدة البيانات
- ✅ إضافة أعمدة مفقودة في جدول `profiles`
- ✅ إنشاء جداول `promotion_codes` و `rotating_promo_codes`
- ✅ إنشاء جدول `promo_code_usages` لتتبع الاستخدام
- ✅ إنشاء جدول `audit_log` للتدقيق
- ✅ إنشاء جدول `protected_domains` لحماية الدومينات
- ✅ إنشاء دوال RPC للعمليات الذرية

### 2. الصلاحيات
- ✅ منح صلاحيات `authenticated` و `service_role`
- ✅ منح صلاحيات تنفيذ الدوال

### 3. البيانات الأولية
- ✅ إنشاء أكواد ترويجية للاختبار
- ✅ إنشاء بيانات تجريبية

## 🎯 الأكواد الترويجية المتاحة

بعد تطبيق الإصلاح، ستكون الأكواد التالية متاحة:

| الكود | الاستخدامات | الصلاحية | الغرض |
|------|-------------|----------|-------|
| `TEST2024` | 1,000 | سنة واحدة | اختبار عام |
| `WELCOME2024` | 10,000 | سنة واحدة | ترحيب العملاء |
| `DEMO2024` | 500 | 6 أشهر | عروض تجريبية |

## 📝 طرق التطبيق

### الطريقة 1: تلقائي (موصى به) ⭐

```powershell
.\fix-registration.ps1
```

**المميزات:**
- ✅ تطبيق تلقائي كامل
- ✅ اختبار تلقائي
- ✅ تقرير مفصل

### الطريقة 2: يدوي

#### أ. عبر Supabase CLI

```powershell
# تطبيق SQL
Get-Content fix-customer-registration.sql | supabase db execute --project-ref pqnzsihfryjnnhdubisk

# إنشاء أكواد ترويجية
Get-Content create-test-promo-code.sql | supabase db execute --project-ref pqnzsihfryjnnhdubisk

# نشر Edge Function
supabase functions deploy register --project-ref pqnzsihfryjnnhdubisk
```

#### ب. عبر Supabase Dashboard

1. افتح SQL Editor:
   ```
   https://supabase.com/dashboard/project/pqnzsihfryjnnhdubisk/sql
   ```

2. انسخ محتوى `fix-customer-registration.sql`

3. الصقه واضغط "Run"

4. كرر مع `create-test-promo-code.sql`

## 🧪 الاختبار

### اختبار سريع

```powershell
.\quick-test.ps1
```

### اختبار يدوي من المتصفح

```
http://localhost:8080/register?code=TEST2024
```

### اختبار API مباشر

```powershell
$body = @{
    email = "test@example.com"
    password = "Test1234!"
    firstName = "محمد"
    lastName = "أحمد"
    idNumber = "123456789"
    dateOfBirth = "1990-01-01"
    street = "شارع الاختبار"
    houseNumber = "123"
    postalCode = "12345"
    city = "برلين"
    country = "Deutschland"
    domain = "example.com"
    iban = "DE89370400440532013000"
    bankName = "Test Bank"
    accountHolder = "محمد أحمد"
    promotionCode = "TEST2024"
    domainOwner = $true
    sepaMandate = $true
    terms = $true
    privacy = $true
    ageConfirmation = $true
} | ConvertTo-Json

Invoke-RestMethod -Uri "https://pqnzsihfryjnnhdubisk.supabase.co/functions/v1/register" `
    -Method POST `
    -Headers @{
        "Content-Type" = "application/json"
        "apikey" = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBxbnpzaWhmcnlqbm5oZHViaXNrIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzI1MjY4NDQsImV4cCI6MjA4ODEwMjg0NH0.AzmcvzIC3Ve5CwZuLVrDfpq9RJ5W-oy8KmJlK1cUINg"
    } `
    -Body $body
```

## ✅ التحقق من النجاح

### 1. في قاعدة البيانات

```sql
-- عرض العملاء الجدد
SELECT 
    id,
    first_name,
    last_name,
    email,
    status,
    domain,
    created_at
FROM public.profiles
WHERE role = 'customer'
ORDER BY created_at DESC
LIMIT 10;
```

### 2. في Supabase Dashboard

1. اذهب إلى Table Editor
2. افتح جدول `profiles`
3. فلتر: `role = customer`
4. رتب حسب: `created_at DESC`

### 3. تحقق من الأكواد الترويجية

```sql
SELECT 
    code,
    code_type,
    is_active,
    use_count,
    max_uses,
    valid_to
FROM public.rotating_promo_codes
WHERE is_active = true
ORDER BY created_at DESC;
```

## 🔧 استكشاف الأخطاء

### خطأ: "Ungültiger Promotion Code"

**السبب:** الكود الترويجي غير موجود أو منتهي

**الحل:**
```sql
-- تحقق من الأكواد
SELECT * FROM public.rotating_promo_codes WHERE code = 'TEST2024';

-- أنشئ كود جديد
INSERT INTO public.rotating_promo_codes (code, code_type, is_active, valid_from, valid_to, max_uses)
VALUES ('NEWCODE2024', 'fixed', true, NOW(), NOW() + INTERVAL '1 year', 1000);
```

### خطأ: "Profil konnte nicht erstellt werden"

**السبب:** أعمدة مفقودة في جدول profiles

**الحل:**
```powershell
.\fix-registration.ps1
```

### خطأ: "Sie müssen mindestens 18 Jahre alt sein"

**السبب:** تاريخ الميلاد يجعل العمر < 18

**الحل:** استخدم تاريخ ميلاد قبل 2006

### خطأ: "Zu viele Anfragen"

**السبب:** Rate Limiting (5 طلبات/دقيقة)

**الحل:** انتظر دقيقة واحدة

### خطأ 500: Internal Server Error

**السبب:** مشكلة في Edge Function

**الحل:**
```powershell
# تحقق من Logs
# https://supabase.com/dashboard/project/pqnzsihfryjnnhdubisk/functions/register/logs

# أعد النشر
supabase functions deploy register --project-ref pqnzsihfryjnnhdubisk
```

## 📊 ما يحدث عند التسجيل الناجح

1. ✅ إنشاء مستخدم في `auth.users`
2. ✅ إنشاء ملف شخصي في `profiles`
3. ✅ بناء التسلسل الهرمي في `user_hierarchy`
4. ✅ تحديث استخدام الكود الترويجي
5. ✅ إرسال بريد إلكتروني ترحيبي
6. ✅ إنشاء عقد PDF
7. ✅ تفعيل حماية الدومين
8. ✅ إجراء فحص أمني أولي
9. ✅ جدولة فحص شهري متكرر
10. ✅ تسجيل في audit_log

## 🎓 إنشاء كود ترويجي لشريك

```sql
-- إنشاء كود لشريك موجود
INSERT INTO public.promotion_codes (code, partner_id, is_active, max_uses)
SELECT 
    'PARTNER' || SUBSTRING(id::text, 1, 8),
    id,
    true,
    NULL  -- غير محدود
FROM public.profiles
WHERE role = 'partner'
    AND email = 'partner@example.com';
```

## 📚 مراجع إضافية

- [test-registration.md](test-registration.md) - دليل اختبار شامل
- [FIX-REGISTRATION-AR.md](FIX-REGISTRATION-AR.md) - دليل الإصلاح المفصل
- [Supabase Dashboard](https://supabase.com/dashboard/project/pqnzsihfryjnnhdubisk)
- [Edge Functions Logs](https://supabase.com/dashboard/project/pqnzsihfryjnnhdubisk/functions/register/logs)

## 💡 نصائح

1. **استخدم أكواد ترويجية فريدة** لكل حملة
2. **راقب استخدام الأكواد** بانتظام
3. **تحقق من Logs** عند حدوث أخطاء
4. **احتفظ بنسخة احتياطية** من قاعدة البيانات
5. **اختبر في بيئة التطوير** أولاً

## 🆘 الدعم

إذا استمرت المشكلة بعد تطبيق جميع الحلول:

1. تحقق من console.log في المتصفح (F12)
2. تحقق من Supabase Edge Function Logs
3. تحقق من Supabase Database Logs
4. تأكد من تطبيق جميع migrations
5. تحقق من متغيرات البيئة (.env)

## 📞 معلومات الاتصال

- **Project:** GAP Protection MLM Platform
- **Supabase Project:** pqnzsihfryjnnhdubisk
- **Environment:** Production

---

**تم إنشاء هذا الدليل بواسطة Kiro AI** 🤖

آخر تحديث: مارس 2026
