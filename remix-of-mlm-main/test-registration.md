# اختبار تسجيل العملاء - Customer Registration Testing

## المشكلة المحتملة
لا يمكن إضافة العملاء في نظام MLM

## الأسباب المحتملة

### 1. أعمدة قاعدة البيانات المفقودة
- `age_confirmed` - مطلوب في كود التسجيل
- `date_of_birth` - مطلوب للتحقق من العمر
- أعمدة أخرى قد تكون مفقودة

### 2. مشاكل Promotion Code
- جدول `rotating_promo_codes` قد يكون مفقوداً
- جدول `promotion_codes` قد يكون مفقوداً
- لا توجد أكواد ترويجية نشطة

### 3. مشاكل الصلاحيات
- صلاحيات قاعدة البيانات غير صحيحة
- Edge Functions غير منشورة

### 4. مشاكل البيئة
- متغيرات البيئة غير صحيحة
- Supabase URL أو API Key خاطئة

## الحل

### الخطوة 1: تطبيق إصلاح قاعدة البيانات

```bash
# في Supabase Dashboard -> SQL Editor
# قم بتشغيل محتوى ملف: fix-customer-registration.sql
```

أو عبر CLI:

```bash
cd remix-of-mlm-main
supabase db push
```

### الخطوة 2: التحقق من Edge Functions

```bash
# تحقق من أن الدالة منشورة
supabase functions list

# إذا لم تكن منشورة، قم بنشرها
supabase functions deploy register --project-ref pqnzsihfryjnnhdubisk
```

### الخطوة 3: اختبار التسجيل

#### اختبار يدوي:

1. افتح التطبيق: `http://localhost:8080/register?code=TEST2024`
2. املأ النموذج بالبيانات التالية:

```
الاسم الأول: محمد
الاسم الأخير: أحمد
البريد الإلكتروني: test@example.com
كلمة المرور: Test1234!
رقم الهوية: 123456789
تاريخ الميلاد: 1990-01-01
الشارع: شارع الاختبار
رقم المنزل: 123
الرمز البريدي: 12345
المدينة: برلين
الدومين: example.com
IBAN: DE89370400440532013000
اسم البنك: Test Bank
صاحب الحساب: محمد أحمد
كود الترويج: TEST2024
```

3. وافق على جميع الشروط
4. اضغط "تسجيل"

#### اختبار API مباشر:

```bash
# PowerShell
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

### الخطوة 4: فحص السجلات (Logs)

```bash
# في Supabase Dashboard
# اذهب إلى: Edge Functions -> register -> Logs
# ابحث عن أي أخطاء
```

## التحقق من النجاح

### في قاعدة البيانات:

```sql
-- تحقق من العملاء الجدد
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

-- تحقق من استخدام الكود الترويجي
SELECT 
    code,
    use_count,
    max_uses,
    is_active
FROM public.rotating_promo_codes
WHERE code = 'TEST2024';
```

## الأخطاء الشائعة وحلولها

### خطأ: "Ungültiger Promotion Code"
**الحل:** تأكد من وجود كود ترويجي نشط في قاعدة البيانات

```sql
-- إنشاء كود ترويجي جديد
INSERT INTO public.rotating_promo_codes (code, code_type, is_active, valid_from, valid_to, max_uses)
VALUES ('WELCOME2024', 'fixed', true, NOW(), NOW() + INTERVAL '1 year', 10000);
```

### خطأ: "Profil konnte nicht erstellt werden"
**الحل:** تحقق من أن جميع الأعمدة المطلوبة موجودة في جدول profiles

```sql
-- تشغيل سكريبت الإصلاح
-- انظر fix-customer-registration.sql
```

### خطأ: "Sie müssen mindestens 18 Jahre alt sein"
**الحل:** تأكد من أن تاريخ الميلاد يجعل العمر 18+ سنة

### خطأ: "Zu viele Anfragen"
**الحل:** انتظر دقيقة واحدة (Rate Limiting: 5 طلبات/دقيقة)

## إنشاء كود ترويجي لشريك

```sql
-- إنشاء كود ترويجي لشريك موجود
INSERT INTO public.promotion_codes (code, partner_id, is_active, max_uses)
SELECT 
    'PARTNER' || SUBSTRING(id::text, 1, 8),
    id,
    true,
    NULL  -- غير محدود
FROM public.profiles
WHERE role = 'partner'
    AND id = 'PARTNER_UUID_HERE';
```

## الدعم الإضافي

إذا استمرت المشكلة:

1. تحقق من console.log في المتصفح (F12)
2. تحقق من Supabase Edge Function Logs
3. تحقق من Supabase Database Logs
4. تحقق من أن جميع migrations تم تطبيقها

## ملاحظات مهمة

- التسجيل يتطلب كود ترويجي صالح
- يتم إرسال بريد إلكتروني ترحيبي تلقائياً
- يتم إنشاء عقد PDF تلقائياً
- يتم تفعيل حماية الدومين تلقائياً
- يتم إجراء فحص أمني أولي تلقائياً
