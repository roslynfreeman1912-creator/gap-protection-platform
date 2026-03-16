# 🔐 صلاحيات الفحص الأمني - Security Scan Permissions

## ✅ تم التطبيق: الفحص يتطلب تسجيل دخول

---

## 🎯 القاعدة الأساسية

### ❌ **لا يمكن الفحص بدون تسجيل**

**جميع المستخدمين يجب أن يسجلوا دخول أولاً قبل إجراء أي فحص أمني**

---

## 👥 الصلاحيات حسب الدور

### 1. ✅ **Admin / Super Admin**
```typescript
// يمكنهم:
- ✅ Full Security Scan (security-scan)
- ✅ Light Scan (light-scan)
- ✅ Customer Scans (customer-scans)
- ✅ عرض جميع الفحوصات
- ✅ إدارة الفحوصات
```

### 2. ✅ **Partner**
```typescript
// يمكنهم:
- ✅ Full Security Scan (security-scan)
- ✅ Light Scan (light-scan)
- ✅ Customer Scans (customer-scans)
- ✅ عرض فحوصاتهم فقط
```

### 3. ✅ **Call Center**
```typescript
// يمكنهم:
- ✅ Full Security Scan (security-scan)
- ✅ Light Scan (light-scan)
- ✅ Customer Scans (customer-scans)
- ✅ عرض فحوصات عملائهم
```

### 4. ⚠️ **Customer** (العملاء)
```typescript
// يمكنهم:
- ❌ Full Security Scan - ممنوع
- ✅ Light Scan - بعد التسجيل فقط
- ✅ Customer Scans - بعد التسجيل فقط
- ✅ عرض فحوصاتهم فقط
```

### 5. ❌ **Anonymous** (بدون تسجيل)
```typescript
// لا يمكنهم:
- ❌ أي نوع من الفحص
- ❌ يجب التسجيل أولاً
```

---

## 🔒 التطبيق في الكود

### security-scan/index.ts
```typescript
// السطر 869-871
const authResult = await authenticateRequest(req, corsHeaders, { 
  allowedRoles: ['admin', 'super_admin', 'partner', 'callcenter'] 
})
if (authResult.response) return authResult.response
```


**من يمكنه الوصول:**
- ✅ Admin
- ✅ Super Admin
- ✅ Partner
- ✅ Call Center
- ❌ Customer (ممنوع)
- ❌ Anonymous (ممنوع)

---

### light-scan/index.ts
```typescript
// السطر 165-168
const authResult = await authenticateRequest(req, corsHeaders)
if (authResult.response) return authResult.response

const clientIdentifier = authResult.auth ? authResult.auth.user.id : 'unknown'
```

**من يمكنه الوصول:**
- ✅ Admin
- ✅ Super Admin
- ✅ Partner
- ✅ Call Center
- ✅ Customer (بعد التسجيل)
- ❌ Anonymous (ممنوع)

---

### customer-scans/index.ts
```typescript
// السطر 15-17
const authResult = await authenticateRequest(req, corsHeaders)
if (authResult.response) return authResult.response
const { auth } = authResult
```

**من يمكنه الوصول:**
- ✅ Admin
- ✅ Super Admin
- ✅ Partner
- ✅ Call Center
- ✅ Customer (بعد التسجيل)
- ❌ Anonymous (ممنوع)

---

## 🛡️ الحماية المطبقة

### 1. **Authentication Required**
```typescript
// جميع الـ Functions تتطلب تسجيل دخول
const authResult = await authenticateRequest(req, corsHeaders)
if (authResult.response) return authResult.response
```

### 2. **Role-Based Access Control**
```typescript
// security-scan يتطلب أدوار محددة
{ allowedRoles: ['admin', 'super_admin', 'partner', 'callcenter'] }
```

### 3. **SSRF Protection**
```typescript
// حماية من هجمات SSRF
const SSRF_BLOCKED = [
  /^localhost$/i, /^127\./, /^10\./, /^172\.(1[6-9]|2\d|3[01])\./,
  /^192\.168\./, /^169\.254\./, /metadata\.google/
]
```

### 4. **Rate Limiting**
```typescript
// حد أقصى للفحوصات
const { data: rateLimit } = await supabase
  .rpc('check_scan_rate_limit', { _network_hash: networkHash })
```

---

## 📊 جدول الصلاحيات

| الدور | security-scan | light-scan | customer-scans |
|-------|---------------|------------|----------------|
| **Admin** | ✅ | ✅ | ✅ |
| **Super Admin** | ✅ | ✅ | ✅ |
| **Partner** | ✅ | ✅ | ✅ |
| **Call Center** | ✅ | ✅ | ✅ |
| **Customer** | ❌ | ✅ (بعد التسجيل) | ✅ (بعد التسجيل) |
| **Anonymous** | ❌ | ❌ | ❌ |

---

## 🔐 كيفية التسجيل

### للعملاء (Customers):
```typescript
// 1. التسجيل عبر register function
POST /functions/v1/register
{
  "email": "customer@example.com",
  "password": "SecurePass123!",
  "firstName": "John",
  "lastName": "Doe",
  // ... باقي البيانات
  "promotionCode": "ML-ABC123"
}

// 2. تسجيل الدخول
POST /functions/v1/mlm-dashboard
{
  "action": "login",
  "username": "customer",
  "password": "SecurePass123!"
}

// 3. الآن يمكن الفحص
POST /functions/v1/light-scan
{
  "domain": "example.com"
}
```

---

## ✅ التحقق من الصلاحيات

### اختبار 1: محاولة الفحص بدون تسجيل
```bash
curl -X POST https://your-project.supabase.co/functions/v1/light-scan \
  -H "Content-Type: application/json" \
  -d '{"domain": "example.com"}'

# النتيجة المتوقعة:
# ❌ 401 Unauthorized
# {"error": "Authentication required"}
```

### اختبار 2: الفحص بعد التسجيل
```bash
# 1. تسجيل الدخول
TOKEN=$(curl -X POST .../mlm-dashboard \
  -d '{"action":"login","username":"user","password":"pass"}' \
  | jq -r '.access_token')

# 2. الفحص
curl -X POST .../light-scan \
  -H "Authorization: Bearer $TOKEN" \
  -d '{"domain": "example.com"}'

# النتيجة المتوقعة:
# ✅ 200 OK
# {"checks": [...], "score": 85}
```

---

## 🎯 الخلاصة

### ✅ **تم التطبيق:**
1. ✅ **لا يمكن الفحص بدون تسجيل دخول**
2. ✅ **Admin, Partner, Call Center** - يمكنهم Full Scan
3. ✅ **Customer** - يمكنهم Light Scan بعد التسجيل فقط
4. ✅ **Anonymous** - ممنوع تماماً
5. ✅ **SSRF Protection** - حماية من الهجمات
6. ✅ **Rate Limiting** - حد أقصى للفحوصات

---

**تم التحديث**: 2026-03-16  
**الحالة**: ✅ **مطبق بالكامل**
