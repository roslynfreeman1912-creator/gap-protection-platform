# 📦 ملفات النشر - دليل كامل

## 📋 الملفات المتوفرة

### 1. ملفات النشر التلقائي

| الملف | الوصف | الاستخدام |
|------|-------|----------|
| `deploy-cpanel.py` | سكريبت Python للنشر التلقائي | `python deploy-cpanel.py` |
| `deploy-cpanel.sh` | سكريبت Bash للنشر التلقائي | `bash deploy-cpanel.sh` |
| `deploy-to-server.sh` | سكريبت نشر عام | `bash deploy-to-server.sh` |

### 2. ملفات التوثيق

| الملف | الوصف |
|------|-------|
| `DEPLOY_NOW_AR.md` | دليل النشر الكامل بالعربية |
| `QUICK_DEPLOY_AR.md` | دليل النشر السريع (3 خطوات) |
| `deploy-manual-steps.md` | خطوات النشر اليدوية التفصيلية |
| `README_DEPLOY_AR.md` | هذا الملف |

### 3. ملفات الإعداد

| الملف | الموقع | الوصف |
|------|--------|-------|
| `.htaccess` | `remix-of-mlm-main/` | إعدادات Apache للوحة الإدارة |
| `.htaccess` | `Python-Webify/` | إعدادات Apache للفاحص الأمني |

---

## 🚀 طرق النشر المتاحة

### الطريقة 1: النشر التلقائي (الأسرع) ⭐

```bash
python deploy-cpanel.py
```

**المميزات:**
- ✅ بناء تلقائي للمشروعين
- ✅ رفع تلقائي للملفات
- ✅ تحقق تلقائي من النشر
- ✅ يعمل على Windows/Linux/Mac

**المتطلبات:**
- Python 3.x
- npm
- اتصال بالإنترنت

---

### الطريقة 2: النشر عبر FileZilla

**الخطوات:**
1. تحميل FileZilla
2. الاتصال بالسيرفر
3. بناء المشاريع محلياً
4. رفع الملفات

**راجع:** `DEPLOY_NOW_AR.md` للتفاصيل

---

### الطريقة 3: النشر عبر cPanel

**الخطوات:**
1. الدخول إلى cPanel
2. استخدام File Manager
3. رفع الملفات يدوياً

**راجع:** `deploy-manual-steps.md` للتفاصيل

---

## 📊 معلومات السيرفر

```yaml
السيرفر:
  IP: 76.13.5.114
  نوع الاستضافة: cPanel
  
الحسابات:
  FTP:
    Username: u429102106_GALAL1
    Password: galal123.DE
  
  Database:
    Username: u429102106_GALAL2
    Password: gYJ8LN4YLvVwbvY83zVy0dssjHE1SlOZJo22BFcqS9486b0f0

المواقع:
  - Domain: gapprotectionltd.com
    Path: /domains/gapprotectionltd.com/public_html
    Type: Admin Dashboard
    
  - Domain: gap-protection.pro
    Path: /domains/gap-protection.pro/public_html
    Type: Security Scanner

الانتهاء: 2026-03-02
المساحة: 1 ميجابايت
```

---

## 🔧 البناء المحلي

### بناء لوحة الإدارة

```bash
cd remix-of-mlm-main
npm install
npm run build
```

**الملفات الناتجة:** `remix-of-mlm-main/dist/`

### بناء الفاحص الأمني

```bash
cd Python-Webify
npm install
npm run build
```

**الملفات الناتجة:** `Python-Webify/dist/`

---

## 📤 الرفع للسيرفر

### المسارات الصحيحة

| المشروع | المجلد المحلي | المجلد البعيد |
|---------|---------------|----------------|
| لوحة الإدارة | `remix-of-mlm-main/dist/*` | `/domains/gapprotectionltd.com/public_html/` |
| الفاحص الأمني | `Python-Webify/dist/*` | `/domains/gap-protection.pro/public_html/` |

---

## ✅ التحقق من النشر

### 1. اختبار المواقع

```bash
# اختبار لوحة الإدارة
curl -I https://gapprotectionltd.com

# اختبار الفاحص الأمني
curl -I https://gap-protection.pro
```

### 2. فتح في المتصفح

- 🌐 https://gapprotectionltd.com
- 🛡️ https://gap-protection.pro

### 3. التحقق من الوظائف

**لوحة الإدارة:**
- [ ] تسجيل الدخول يعمل
- [ ] لوحة MLM تعمل
- [ ] لوحة Call Center تعمل
- [ ] لوحة Partner تعمل

**الفاحص الأمني:**
- [ ] الصفحة الرئيسية تعمل
- [ ] الفحص يتطلب تسجيل دخول
- [ ] Admin/Partner/CallCenter يمكنهم الفحص
- [ ] النتائج تظهر بشكل صحيح

---

## 🔐 الأمان

### بعد النشر مباشرة

**⚠️ غير هذه المعلومات فوراً:**

1. ✅ كلمة مرور FTP
2. ✅ كلمة مرور قاعدة البيانات
3. ✅ كلمة مرور cPanel
4. ✅ كلمة مرور phpMyAdmin
5. ✅ API Keys في `.env`
6. ✅ Secret Keys في `.env`

### ملفات .htaccess

تم إنشاء ملفات `.htaccess` للمشروعين تتضمن:
- ✅ Security Headers
- ✅ Gzip Compression
- ✅ Browser Caching
- ✅ HTTPS Redirect
- ✅ SPA Routing

---

## 🐛 استكشاف الأخطاء

### المشكلة: الموقع لا يعمل

**الحلول:**
1. تحقق من وجود `index.html` في المجلد الرئيسي
2. تحقق من الصلاحيات (755)
3. تحقق من `.htaccess`
4. راجع Error Log في cPanel

### المشكلة: 404 على الروابط

**الحل:**
- تأكد من وجود `.htaccess` صحيح
- تأكد من تفعيل `mod_rewrite`

### المشكلة: الصور لا تظهر

**الحل:**
- تحقق من المسارات النسبية
- تحقق من رفع مجلد `assets/`

### المشكلة: API لا يعمل

**الحل:**
- تحقق من `.env` على السيرفر
- تحقق من CORS Headers
- تحقق من Supabase URL

---

## 📞 الدعم

### الموارد المتاحة

1. **التوثيق الكامل**
   - `DEPLOY_NOW_AR.md` - دليل شامل
   - `QUICK_DEPLOY_AR.md` - دليل سريع
   - `deploy-manual-steps.md` - خطوات تفصيلية

2. **السكريبتات**
   - `deploy-cpanel.py` - نشر تلقائي
   - `deploy-cpanel.sh` - نشر bash
   - `deploy-to-server.sh` - نشر عام

3. **الإعدادات**
   - `.htaccess` - إعدادات Apache
   - `.env.example` - مثال على المتغيرات

---

## 📈 الخطوات التالية

بعد النشر الناجح:

1. ✅ تغيير جميع كلمات المرور
2. ✅ إعداد Backups تلقائية
3. ✅ مراقبة الأداء
4. ✅ اختبار جميع الوظائف
5. ✅ إعداد SSL Certificates (إذا لم تكن موجودة)
6. ✅ إعداد Email Notifications
7. ✅ إعداد Monitoring

---

## 🎯 قائمة التحقق الكاملة

### قبل النشر
- [ ] تم بناء المشروعين محلياً
- [ ] تم اختبار المشروعين محلياً
- [ ] تم إعداد `.env` للإنتاج
- [ ] تم إنشاء Backup

### أثناء النشر
- [ ] تم رفع جميع الملفات
- [ ] تم رفع `.htaccess`
- [ ] تم رفع `.env`
- [ ] تم تعيين الصلاحيات

### بعد النشر
- [ ] تم اختبار المواقع
- [ ] تم تغيير كلمات المرور
- [ ] تم اختبار جميع الوظائف
- [ ] تم إعداد Monitoring
- [ ] تم إعداد Backups

---

## 🎉 النجاح!

إذا اكتملت جميع الخطوات، فإن مشاريعك الآن:
- ✅ منشورة على الإنترنت
- ✅ آمنة ومحمية
- ✅ محسّنة للأداء
- ✅ جاهزة للاستخدام

---

**تم الإنشاء**: 2026-03-16  
**آخر تحديث**: 2026-03-16  
**الحالة**: ✅ **جاهز للنشر**  
**الإصدار**: 1.0.0
