# 🧪 كيفية اختبار كل شيء

## 🎯 دليل الاختبار الشامل

---

## 1️⃣ اختبار MLM Dashboard

### الطريقة 1: باستخدام Python Script

```bash
cd remix-of-mlm-main
python _test_mlm.py
```

**ما يختبره:**
- ✅ Login
- ✅ Overview
- ✅ Downline
- ✅ Tree
- ✅ Commissions

### الطريقة 2: اختبار شامل

```bash
python _test_mlm_full.py
```

**ما يختبره:**
- ✅ Login
- ✅ Overview
- ✅ Add Partner
- ✅ Edit Partner
- ✅ Delete Partner
- ✅ Edit Profile
- ✅ Change Credentials
- ✅ Stats

### الطريقة 3: التحقق النهائي

```bash
python _final_verification.py
```

**النتيجة المتوقعة:**
```
RESULTS: 11 passed, 0 failed
ALL TESTS PASSED!
```

---

## 2️⃣ اختبار التسجيل (Register)

### باستخدام cURL:

```bash
curl -X POST https://pqnzsihfryjnnhdubisk.supabase.co/functions/v1/register \
  -H "Content-Type: application/json" \
  -H "apikey: YOUR_ANON_KEY" \
  -d '{
    "email": "test@example.com",
    "password": "Test123!",
    "firstName": "Test",
    "lastName": "User",
    "phone": "0171234567",
    "idNumber": "DE123456789",
    "dateOfBirth": "1990-01-01",
    "street": "Teststraße",
    "houseNumber": "1",
    "postalCode": "12345",
    "city": "Berlin",
    "country": "Deutschland",
    "domain": "test-domain.com",
    "iban": "DE89370400440532013000",
    "bankName": "Test Bank",
    "accountHolder": "Test User",
    "promotionCode": "ML-ABC123",
    "domainOwner": true,
    "sepaMandate": true,
    "terms": true,
    "privacy": true,
    "ageConfirmation": true
  }'
```

**النتيجة المتوقعة:**
```json
{
  "success": true,
  "message": "Registrierung erfolgreich",
  "profileId": "uuid-here"
}
```

**ما يحدث في الخلفية:**
1. ✅ إنشاء Auth User
2. ✅ حفظ Profile في DB
3. ✅ بناء هرم MLM
4. ✅ تحديث Promo Code
5. ✅ إرسال Email
6. ✅ توليد PDF
7. ✅ تفعيل Domain Protection
8. ✅ أول فحص أمني
9. ✅ Audit Log

---

## 3️⃣ اختبار تسجيل الدخول (Login)

### باستخدام cURL:

```bash
curl -X POST https://pqnzsihfryjnnhdubisk.supabase.co/functions/v1/mlm-dashboard \
  -H "Content-Type: application/json" \
  -H "apikey: YOUR_ANON_KEY" \
  -d '{
    "action": "login",
    "username": "thomas",
    "password": "galal123"
  }'
```

**النتيجة المتوقعة:**
```json
{
  "access_token": "eyJhbGc...",
  "refresh_token": "...",
  "user": {
    "id": "uuid",
    "email": "thomas@mlm.gapprotectionltd.com",
    "username": "thomas"
  },
  "_version": "v3.0-2026-03-07"
}
```

---

## 4️⃣ اختبار Call Center Dashboard

### باستخدام cURL:

```bash
curl -X GET "https://pqnzsihfryjnnhdubisk.supabase.co/functions/v1/callcenter-dashboard?call_center_id=YOUR_CENTER_ID" \
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN" \
  -H "apikey: YOUR_ANON_KEY"
```

**النتيجة المتوقعة:**
```json
{
  "role": "admin",
  "centerInfo": {...},
  "stats": {
    "totalLeads": 100,
    "totalEmployees": 5,
    "totalRevenue": 50000,
    "totalPromoCodes": 20
  },
  "leads": [...],
  "employees": [...],
  "transactions": [...]
}
```

---

## 5️⃣ اختبار Python-Webify Scanner

### الطريقة 1: من سطر الأوامر

```bash
cd Python-Webify
python advanced_scanner.py scanme.nmap.org
```

**النتيجة المتوقعة:**
```
[+] Starting comprehensive security scan...
[+] Target: scanme.nmap.org
[+] Scanning for vulnerabilities...
[+] Found 5000+ vulnerability templates
[+] Scan completed
[+] Results saved to: scan_results_20260316_120000.json
```

### الطريقة 2: عبر واجهة الويب

```bash
python app.py
```

ثم افتح المتصفح على: `http://localhost:5000`

---

## 6️⃣ اختبار حفظ البيانات في قاعدة البيانات

### باستخدام Python:

```python
import requests

# 1. تسجيل مستخدم جديد
response = requests.post(
    'https://pqnzsihfryjnnhdubisk.supabase.co/functions/v1/register',
    json={
        'email': 'newuser@test.com',
        'password': 'Test123!',
        'firstName': 'New',
        'lastName': 'User',
        # ... باقي البيانات
    },
    headers={'apikey': 'YOUR_ANON_KEY'}
)

print(response.json())
# {'success': True, 'profileId': 'uuid'}

# 2. التحقق من حفظ البيانات
# افتح Supabase Dashboard
# اذهب إلى Table Editor > profiles
# ابحث عن newuser@test.com
# ستجد جميع البيانات محفوظة ✅
```

---

## 7️⃣ اختبار Partner Management

### إضافة شريك جديد:

```bash
curl -X POST https://pqnzsihfryjnnhdubisk.supabase.co/functions/v1/mlm-dashboard \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN" \
  -H "apikey: YOUR_ANON_KEY" \
  -d '{
    "action": "add-partner",
    "partnerData": {
      "first_name": "New",
      "last_name": "Partner",
      "email": "newpartner@test.com",
      "phone": "0171234567",
      "city": "Berlin"
    }
  }'
```

**النتيجة المتوقعة:**
```json
{
  "success": true,
  "partner": {
    "id": "uuid",
    "first_name": "New",
    "last_name": "Partner",
    "partner_number": "1002",
    "role": "partner",
    "status": "active"
  },
  "tempPassword": "Partner1002!"
}
```

---

## 8️⃣ اختبار Commissions

### الحصول على العمولات:

```bash
curl -X POST https://pqnzsihfryjnnhdubisk.supabase.co/functions/v1/mlm-dashboard \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN" \
  -H "apikey: YOUR_ANON_KEY" \
  -d '{
    "action": "commissions"
  }'
```

**النتيجة المتوقعة:**
```json
{
  "commissions": [
    {
      "id": "uuid",
      "partner_id": "uuid",
      "level_number": 1,
      "commission_amount": 10.00,
      "status": "pending",
      "transaction": {...}
    }
  ],
  "levelStats": {
    "1": {"count": 5, "total": 50.00},
    "2": {"count": 3, "total": 15.00}
  }
}
```

---

## 9️⃣ التحقق من قاعدة البيانات مباشرة

### باستخدام Supabase Dashboard:

1. افتح: https://supabase.com/dashboard
2. اختر مشروعك
3. اذهب إلى **Table Editor**
4. افتح جدول **profiles**
5. ستجد جميع المستخدمين المسجلين ✅

### باستخدام SQL:

```sql
-- عرض جميع المستخدمين
SELECT * FROM profiles ORDER BY created_at DESC LIMIT 10;

-- عرض هرم MLM
SELECT * FROM user_hierarchy WHERE ancestor_id = 'YOUR_USER_ID';

-- عرض العمولات
SELECT * FROM commissions WHERE partner_id = 'YOUR_PARTNER_ID';

-- عرض المعاملات
SELECT * FROM transactions ORDER BY created_at DESC LIMIT 10;

-- عرض Leads
SELECT * FROM leads WHERE call_center_id = 'YOUR_CENTER_ID';
```

---

## 🔟 اختبار شامل لكل شيء

### Script واحد يختبر كل شيء:

```bash
cd remix-of-mlm-main

# 1. اختبار MLM
python _test_mlm_full.py

# 2. التحقق النهائي
python _final_verification.py

# 3. اختبار CRUD
python _test_crud.py

# 4. فحص قاعدة البيانات
python _check_db_state.py

# 5. فحص Profiles
python _check_profiles.py
```

**النتيجة المتوقعة:**
```
✅ All tests passed
✅ Database is healthy
✅ All profiles exist
✅ All functions work
✅ Data is being saved correctly
```

---

## 📊 ملخص الاختبارات

### ✅ ما تم اختباره:
1. ✅ التسجيل (Register)
2. ✅ تسجيل الدخول (Login)
3. ✅ حفظ البيانات في DB
4. ✅ MLM Dashboard (13 عملية)
5. ✅ Call Center Dashboard
6. ✅ Partner Management
7. ✅ Commissions
8. ✅ Security Scanner
9. ✅ PDF Generation
10. ✅ Email Notifications

### 🟢 النتيجة:
**كل شيء يعمل 100%**

---

## 🆘 إذا واجهت مشكلة

### تحقق من:
1. ✅ Environment Variables موجودة
2. ✅ Supabase URL صحيح
3. ✅ API Keys صحيحة
4. ✅ Database Migrations مطبقة
5. ✅ Edge Functions deployed

### الحصول على المساعدة:
- راجع `COMPLETE_VERIFICATION_REPORT_AR.md`
- راجع `QUICK_SUMMARY_AR.md`
- راجع `README_AR.md`

---

**تم التحديث**: 2026-03-16  
**الحالة**: ✅ **جميع الاختبارات تعمل**
