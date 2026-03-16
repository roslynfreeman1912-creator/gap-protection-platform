# 🔧 إصلاح مشكلة تسجيل العملاء

## المشكلة
لا يمكن إضافة عملاء جدد في نظام MLM

## الحل السريع ⚡

### الطريقة 1: تلقائي (موصى به)

```powershell
cd remix-of-mlm-main
.\fix-registration.ps1
```

### الطريقة 2: يدوي

1. **افتح Supabase Dashboard**
   ```
   https://supabase.com/dashboard/project/pqnzsihfryjnnhdubisk/sql
   ```

2. **نفذ ملف الإصلاح**
   - افتح ملف `fix-customer-registration.sql`
   - انسخ المحتوى بالكامل
   - الصقه في SQL Editor
   - اضغط "Run"

3. **أنشئ أكواد ترويجية**
   - افتح ملف `create-test-promo-code.sql`
   - انسخ المحتوى
   - الصقه في SQL Editor
   - اضغط "Run"

4. **تحقق من Edge Functions**
   ```powershell
   supabase functions deploy register --project-ref pqnzsihfryjnnhdubisk
   ```

## اختبار التسجيل 🧪

### من المتصفح:
```
http://localhost:8080/register?code=TEST2024
```

### من PowerShell:
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

$headers = @{
    "Content-Type" = "application/json"
    "apikey" = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBxbnpzaWhmcnlqbm5oZHViaXNrIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzI1MjY4NDQsImV4cCI6MjA4ODEwMjg0NH0.AzmcvzIC3Ve5CwZuLVrDfpq9RJ5W-oy8KmJlK1cUINg"
}

Invoke-RestMethod -Uri "https://pqnzsihfryjnnhdubisk.supabase.co/functions/v1/register" -Method POST -Headers $headers -Body $body
```

## الأكواد الترويجية المتاحة 🎫

- `TEST2024` - كود اختبار (1000 استخدام)
- `WELCOME2024` - كود ترحيبي (10000 استخدام)
- `DEMO2024` - كود تجريبي (500 استخدام)

## التحقق من النجاح ✅

### في قاعدة البيانات:
```sql
-- عرض العملاء الجدد
SELECT 
    id,
    first_name,
    last_name,
    email,
    status,
    created_at
FROM public.profiles
WHERE role = 'customer'
ORDER BY created_at DESC
LIMIT 10;
```

### في Supabase Dashboard:
1. اذهب إلى: Table Editor → profiles
2. فلتر: `role = customer`
3. رتب حسب: `created_at DESC`

## الأخطاء الشائعة وحلولها 🔍

### ❌ "Ungültiger Promotion Code"
**السبب:** الكود الترويجي غير موجود أو منتهي الصلاحية

**الحل:**
```sql
-- تحقق من الأكواد المتاحة
SELECT code, is_active, valid_to, use_count, max_uses
FROM public.rotating_promo_codes
WHERE is_active = true AND valid_to > NOW();

-- أنشئ كود جديد
INSERT INTO public.rotating_promo_codes (code, code_type, is_active, valid_from, valid_to, max_uses)
VALUES ('NEWCODE2024', 'fixed', true, NOW(), NOW() + INTERVAL '1 year', 1000);
```

### ❌ "Profil konnte nicht erstellt werden"
**السبب:** أعمدة مفقودة في جدول profiles

**الحل:** شغل `fix-customer-registration.sql`

### ❌ "Sie müssen mindestens 18 Jahre alt sein"
**السبب:** تاريخ الميلاد يجعل العمر أقل من 18 سنة

**الحل:** استخدم تاريخ ميلاد قبل 2006

### ❌ "Zu viele Anfragen"
**السبب:** Rate Limiting (5 طلبات/دقيقة)

**الحل:** انتظر دقيقة واحدة

### ❌ خطأ 500 - Internal Server Error
**السبب:** مشكلة في Edge Function أو قاعدة البيانات

**الحل:**
1. تحقق من Logs:
   ```
   https://supabase.com/dashboard/project/pqnzsihfryjnnhdubisk/functions/register/logs
   ```
2. أعد نشر Edge Function:
   ```powershell
   supabase functions deploy register --project-ref pqnzsihfryjnnhdubisk
   ```

## ملفات الإصلاح 📁

- `fix-customer-registration.sql` - إصلاح قاعدة البيانات
- `create-test-promo-code.sql` - إنشاء أكواد ترويجية
- `fix-registration.ps1` - سكريبت تلقائي للإصلاح
- `test-registration.md` - دليل الاختبار الشامل

## الدعم 💬

إذا استمرت المشكلة:

1. تحقق من console.log في المتصفح (F12)
2. تحقق من Supabase Edge Function Logs
3. تحقق من Supabase Database Logs
4. تأكد من تطبيق جميع migrations

## ملاحظات مهمة ⚠️

- التسجيل يتطلب كود ترويجي صالح
- يتم إرسال بريد إلكتروني ترحيبي تلقائياً
- يتم إنشاء عقد PDF تلقائياً
- يتم تفعيل حماية الدومين تلقائياً
- يتم إجراء فحص أمني أولي تلقائياً

## ما الذي يفعله الإصلاح؟ 🔧

1. ✅ إضافة جميع الأعمدة المفقودة في جدول profiles
2. ✅ إنشاء جداول promotion_codes و rotating_promo_codes
3. ✅ إنشاء جدول promo_code_usages لتتبع الاستخدام
4. ✅ إنشاء جدول audit_log للتدقيق
5. ✅ إنشاء جدول protected_domains لحماية الدومينات
6. ✅ إنشاء دوال RPC للعمليات الذرية
7. ✅ منح الصلاحيات اللازمة
8. ✅ إنشاء أكواد ترويجية للاختبار

## الخطوات التالية 🚀

بعد تطبيق الإصلاح:

1. ✅ اختبر التسجيل من المتصفح
2. ✅ تحقق من إنشاء العملاء في قاعدة البيانات
3. ✅ تحقق من إرسال البريد الإلكتروني الترحيبي
4. ✅ تحقق من إنشاء عقد PDF
5. ✅ تحقق من تفعيل حماية الدومين
6. ✅ تحقق من إجراء الفحص الأمني الأولي

---

**تم إنشاء هذا الإصلاح بواسطة Kiro AI** 🤖
