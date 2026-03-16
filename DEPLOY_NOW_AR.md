# 🚀 دليل النشر السريع

## ✅ كل شيء جاهز للنشر!

---

## 📋 معلومات السيرفر

```
🖥️ IP السيرفر: 76.13.5.114
👤 اسم المستخدم: u429102106_GALAL1
🔑 كلمة المرور: galal123.DE
📅 تاريخ الانتهاء: 2026-03-02
💾 المساحة: 1 ميجابايت
```

### المواقع:
- 🌐 **لوحة الإدارة**: gapprotectionltd.com
- 🛡️ **الفاحص الأمني**: gap-protection.pro

---

## 🎯 طريقة النشر (اختر واحدة)

### الطريقة 1: النشر التلقائي (موصى بها) ⭐

```bash
# تشغيل سكريبت Python
python deploy-cpanel.py
```

هذا السكريبت سيقوم بـ:
1. ✅ بناء المشروعين
2. ✅ رفع الملفات للسيرفر
3. ✅ التحقق من النشر

---

### الطريقة 2: النشر اليدوي عبر FileZilla

#### الخطوة 1: تحميل FileZilla
- رابط التحميل: https://filezilla-project.org/

#### الخطوة 2: الاتصال بالسيرفر
```
Host: ftp://76.13.5.114
Username: u429102106_GALAL1
Password: galal123.DE
Port: 21
```

#### الخطوة 3: بناء المشاريع محلياً

**بناء لوحة الإدارة:**
```bash
cd remix-of-mlm-main
npm install
npm run build
```

**بناء الفاحص الأمني:**
```bash
cd Python-Webify
npm install
npm run build
```

#### الخطوة 4: رفع الملفات

**رفع لوحة الإدارة:**
- المجلد المحلي: `remix-of-mlm-main/dist/*`
- المجلد البعيد: `/domains/gapprotectionltd.com/public_html/`

**رفع الفاحص الأمني:**
- المجلد المحلي: `Python-Webify/dist/*`
- المجلد البعيد: `/domains/gap-protection.pro/public_html/`

---

### الطريقة 3: النشر عبر cPanel

#### الخطوة 1: الدخول إلى cPanel
```
URL: https://76.13.5.114:2083
Username: u429102106_GALAL1
Password: galal123.DE
```

#### الخطوة 2: استخدام File Manager
1. افتح File Manager
2. اذهب إلى `/domains/gapprotectionltd.com/public_html/`
3. ارفع ملفات `remix-of-mlm-main/dist/`
4. اذهب إلى `/domains/gap-protection.pro/public_html/`
5. ارفع ملفات `Python-Webify/dist/`

---

## 🔍 التحقق من النشر

بعد النشر، افتح المواقع في المتصفح:

1. ✅ https://gapprotectionltd.com
2. ✅ https://gap-protection.pro

---

## ⚙️ إعداد قاعدة البيانات

### الدخول إلى phpMyAdmin
```
URL: https://76.13.5.114/phpmyadmin
Username: u429102106_GALAL2
Password: gYJ8LN4YLvVwbvY83zVy0dssjHE1SlOZJo22BFcqS9486b0f0
```

### إنشاء قاعدة بيانات (إذا لزم الأمر)
1. اذهب إلى "Databases"
2. أنشئ قاعدة بيانات جديدة
3. استورد ملف SQL إذا كان موجوداً

---

## 🔐 إعداد Environment Variables

### للمشروع الأول (gapprotectionltd.com)

أنشئ ملف `.env` في المجلد الرئيسي:

```env
# Supabase Configuration
SUPABASE_URL=your_supabase_url
SUPABASE_ANON_KEY=your_anon_key
SUPABASE_SERVICE_ROLE_KEY=your_service_key

# Database
DATABASE_URL=your_database_url

# Security
SECRET_KEY=your_secret_key
JWT_SECRET=your_jwt_secret
```

### للمشروع الثاني (gap-protection.pro)

أنشئ ملف `.env` في المجلد الرئيسي:

```env
# Database
DATABASE_URL=your_database_url

# API Keys
API_KEY=your_api_key

# Security
SECRET_KEY=your_secret_key
```

---

## 🚨 بعد النشر مباشرة - مهم جداً!

### ⚠️ غير هذه المعلومات فوراً:

```bash
# 1. كلمة مرور FTP
# اذهب إلى cPanel > FTP Accounts > Change Password

# 2. كلمة مرور قاعدة البيانات
# اذهب إلى cPanel > MySQL Databases > Change Password

# 3. كلمة مرور cPanel
# اذهب إلى cPanel > Password & Security > Change Password

# 4. كلمة مرور phpMyAdmin
# اذهب إلى cPanel > MySQL Databases > Change Password
```

---

## 📊 مراقبة الأداء

### استخدام cPanel Metrics
1. اذهب إلى cPanel
2. افتح "Metrics"
3. راقب:
   - CPU Usage
   - Memory Usage
   - Bandwidth
   - Disk Space

---

## 🔧 استكشاف الأخطاء

### إذا لم يعمل الموقع:

#### 1. تحقق من الملفات
```bash
# تأكد من وجود index.html في المجلد الرئيسي
ls -la /domains/gapprotectionltd.com/public_html/
```

#### 2. تحقق من الصلاحيات
```bash
# تعيين الصلاحيات الصحيحة
chmod -R 755 /domains/gapprotectionltd.com/public_html/
chmod -R 755 /domains/gap-protection.pro/public_html/
```

#### 3. تحقق من Error Log
- اذهب إلى cPanel > Error Log
- ابحث عن أي أخطاء

#### 4. تحقق من .htaccess
تأكد من وجود ملف `.htaccess` صحيح:

```apache
# .htaccess for React/Vite App
<IfModule mod_rewrite.c>
  RewriteEngine On
  RewriteBase /
  RewriteRule ^index\.html$ - [L]
  RewriteCond %{REQUEST_FILENAME} !-f
  RewriteCond %{REQUEST_FILENAME} !-d
  RewriteRule . /index.html [L]
</IfModule>

# Security Headers
<IfModule mod_headers.c>
  Header set X-Content-Type-Options "nosniff"
  Header set X-Frame-Options "SAMEORIGIN"
  Header set X-XSS-Protection "1; mode=block"
</IfModule>

# Gzip Compression
<IfModule mod_deflate.c>
  AddOutputFilterByType DEFLATE text/html text/plain text/xml text/css text/javascript application/javascript application/json
</IfModule>
```

---

## 📞 الدعم الفني

إذا واجهت أي مشاكل:

1. تحقق من Error Log في cPanel
2. تحقق من Browser Console (F12)
3. تحقق من Network Tab في Developer Tools
4. راجع ملفات التوثيق في المشروع

---

## ✅ قائمة التحقق النهائية

- [ ] تم بناء المشروعين محلياً
- [ ] تم رفع الملفات للسيرفر
- [ ] تم اختبار الموقعين في المتصفح
- [ ] تم إعداد قاعدة البيانات
- [ ] تم إعداد Environment Variables
- [ ] تم تغيير جميع كلمات المرور
- [ ] تم التحقق من الصلاحيات
- [ ] تم اختبار جميع الوظائف

---

## 🎉 تهانينا!

إذا اكتملت جميع الخطوات، فإن مشاريعك الآن منشورة ومتاحة على الإنترنت!

🌐 **لوحة الإدارة**: https://gapprotectionltd.com  
🛡️ **الفاحص الأمني**: https://gap-protection.pro

---

**تم الإنشاء**: 2026-03-16  
**الحالة**: ✅ **جاهز للنشر**
