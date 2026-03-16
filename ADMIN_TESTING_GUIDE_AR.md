# 🧪 دليل اختبار لوحة الإدارة

## 🎯 اختبار سريع للوحة الإدارة (10 دقائق)

---

## 🔐 الخطوة 1: تسجيل الدخول كـ Admin

```bash
# تسجيل الدخول
curl -X POST https://YOUR_PROJECT.supabase.co/functions/v1/mlm-dashboard \
  -H "Content-Type: application/json" \
  -H "apikey: YOUR_ANON_KEY" \
  -d '{
    "action": "login",
    "username": "admin",
    "password": "your_password"
  }'

# احفظ الـ Token
TOKEN="eyJhbGc..."
```

---

## 🧪 الخطوة 2: اختبار Admin Functions

### Test 1: إدارة المستخدمين ✅

```bash
# 1.1 عرض جميع المستخدمين
curl -X POST .../admin-users \
  -H "Authorization: Bearer $TOKEN" \
  -H "apikey: YOUR_ANON_KEY" \
  -d '{
    "action": "list_users",
    "page": 1,
    "limit": 10
  }'

# النتيجة المتوقعة:
# {
#   "users": [...],
#   "total": 50,
#   "page": 1,
#   "limit": 10
# }
```

```bash
# 1.2 البحث عن مستخدم
curl -X POST .../admin-users \
  -H "Authorization: Bearer $TOKEN" \
  -d '{
    "action": "list_users",
    "search": "john",
    "role": "partner",
    "status": "active"
  }'
```

```bash
# 1.3 تفاصيل مستخدم
curl -X POST .../admin-users \
  -H "Authorization: Bearer $TOKEN" \
  -d '{
    "action": "get_user",
    "profileId": "USER_UUID"
  }'

# النتيجة المتوقعة:
# {
#   "profile": {...},
#   "roles": ["partner"],
#   "stats": {
#     "teamSize": 10,
#     "pendingCommissions": 500,
#     "paidCommissions": 2000
#   }
# }
```

---

### Test 2: إدارة الشركاء ✅

```bash
# 2.1 عرض جميع الشركاء
curl -X POST .../admin-partners \
  -H "Authorization: Bearer $TOKEN" \
  -d '{
    "action": "list",
    "filters": {
      "status": "active",
      "page": 1,
      "limit": 10
    }
  }'
```

```bash
# 2.2 إنشاء شريك جديد
curl -X POST .../admin-partners \
  -H "Authorization: Bearer $TOKEN" \
  -d '{
    "action": "create",
    "data": {
      "first_name": "Test",
      "last_name": "Partner",
      "email": "testpartner@example.com",
      "phone": "0171234567",
      "role": "partner"
    }
  }'

# النتيجة المتوقعة:
# {
#   "success": true,
#   "partner": {...},
#   "employee_number": "EMP-123456"
# }
```

```bash
# 2.3 ترقية شريك
curl -X POST .../admin-partners \
  -H "Authorization: Bearer $TOKEN" \
  -d '{
    "action": "promote",
    "profileId": "PARTNER_UUID"
  }'
```

---

### Test 3: إدارة العمولات ✅

```bash
# 3.1 عرض جميع العمولات
curl -X POST .../admin-commissions \
  -H "Authorization: Bearer $TOKEN" \
  -d '{
    "action": "list",
    "filters": {
      "status": "pending",
      "page": 1,
      "limit": 10
    }
  }'
```

```bash
# 3.2 إحصائيات العمولات
curl -X POST .../admin-commissions \
  -H "Authorization: Bearer $TOKEN" \
  -d '{
    "action": "stats"
  }'

# النتيجة المتوقعة:
# {
#   "pending": {
#     "count": 50,
#     "total": 5000
#   },
#   "approved": {
#     "count": 30,
#     "total": 3000
#   },
#   "paid": {
#     "count": 100,
#     "total": 10000
#   }
# }
```

```bash
# 3.3 دفع عمولة
curl -X POST .../admin-commissions \
  -H "Authorization: Bearer $TOKEN" \
  -d '{
    "action": "pay",
    "commissionId": "COMMISSION_UUID"
  }'
```

```bash
# 3.4 دفع عدة عمولات
curl -X POST .../admin-commissions \
  -H "Authorization: Bearer $TOKEN" \
  -d '{
    "action": "pay-batch",
    "commissionIds": ["uuid1", "uuid2", "uuid3"]
  }'
```

---

### Test 4: Leadership Pool ✅

```bash
# 4.1 عرض Pool
curl -X POST .../admin-leadership-pool \
  -H "Authorization: Bearer $TOKEN" \
  -d '{
    "action": "get-pool",
    "month": "2026-03"
  }'
```

```bash
# 4.2 حساب Pool
curl -X POST .../admin-leadership-pool \
  -H "Authorization: Bearer $TOKEN" \
  -d '{
    "action": "calculate-pool",
    "month": "2026-03"
  }'
```

```bash
# 4.3 توزيع Pool
curl -X POST .../admin-leadership-pool \
  -H "Authorization: Bearer $TOKEN" \
  -d '{
    "action": "distribute-pool",
    "month": "2026-03"
  }'
```

---

### Test 5: Portals ✅

```bash
# 5.1 عرض جميع Portals
curl -X POST .../admin-portals \
  -H "Authorization: Bearer $TOKEN" \
  -d '{
    "action": "list-portals"
  }'
```

```bash
# 5.2 إنشاء Portal جديد
curl -X POST .../admin-portals \
  -H "Authorization: Bearer $TOKEN" \
  -d '{
    "action": "create-portal",
    "portal_name": "Test Portal",
    "portal_slug": "test-portal",
    "portal_type": "custom",
    "modules": ["partners", "mlm"],
    "admin_username": "testadmin",
    "admin_password": "SecurePass123!"
  }'
```

---

## 📊 جدول النتائج

| الاختبار | الحالة | الملاحظات |
|----------|--------|-----------|
| 1. User Management | ⬜ | |
| 2. Partner Management | ⬜ | |
| 3. Commission Management | ⬜ | |
| 4. Leadership Pool | ⬜ | |
| 5. Portals | ⬜ | |

**الرموز:**
- ⬜ لم يتم الاختبار
- ✅ نجح
- ❌ فشل

---

## ✅ معايير النجاح

### يعتبر الاختبار ناجحاً إذا:
1. ✅ تسجيل الدخول يعمل
2. ✅ جميع Admin Functions تعمل
3. ✅ البيانات تُعرض بشكل صحيح
4. ✅ العمليات تُنفذ بنجاح
5. ✅ لا توجد أخطاء

---

## 🚨 المشاكل الشائعة

### مشكلة 1: "Unauthorized"
```bash
# الحل: تأكد من Token صحيح
-H "Authorization: Bearer YOUR_TOKEN"
```

### مشكلة 2: "Forbidden"
```bash
# الحل: تأكد من أنك Admin
# تحقق من الدور في قاعدة البيانات
SELECT * FROM user_roles WHERE user_id = 'YOUR_USER_ID';
```

### مشكلة 3: "Not Found"
```bash
# الحل: تأكد من UUID صحيح
# تحقق من وجود السجل
SELECT * FROM profiles WHERE id = 'UUID';
```

---

## 🎉 النتيجة

### إذا نجحت جميع الاختبارات:
```
✅ لوحة الإدارة تعمل 100%
✅ جميع الوظائف تعمل
✅ يمكن البدء في الاستخدام
```

---

**الوقت الإجمالي**: 10 دقائق  
**الحالة**: ✅ **جاهز للاختبار**
