# 🔄 طرق النشر البديلة

## ⚠️ مشكلة الاتصال بالسيرفر

إذا واجهت مشكلة في الاتصال بالسيرفر عبر FTP، إليك الحلول البديلة:

---

## الطريقة 1: النشر عبر cPanel File Manager ⭐

### الخطوات:

#### 1. بناء المشاريع محلياً

```bash
# بناء لوحة الإدارة
cd remix-of-mlm-main
npm install
npm run build

# بناء الفاحص الأمني
cd ../Python-Webify
npm install
npm run build
```

#### 2. ضغط الملفات

```bash
# ضغط لوحة الإدارة
cd remix-of-mlm-main/dist
tar -czf admin.tar.gz *

# أو استخدم 7-Zip على Windows:
# انقر بزر الماوس الأيمن > 7-Zip > Add to archive
```

```bash
# ضغط الفاحص الأمني
cd ../../Python-Webify/dist
tar -czf scanner.tar.gz *
```

#### 3. رفع عبر cPanel

1. افتح: https://76.13.5.114:2083
2. سجل دخول:
   - Username: `u429102106_GALAL1`
   - Password: `galal123.DE`

3. افتح **File Manager**

4. اذهب إلى `/domains/gapprotectionltd.com/public_html`

5. اضغط **Upload**

6. ارفع ملف `admin.tar.gz`

7. بعد الرفع، انقر بزر الماوس الأيمن على الملف > **Extract**

8. كرر نفس الخطوات للفاحص الأمني في `/domains/gap-protection.pro/public_html`

---

## الطريقة 2: النشر عبر FileZilla

### الخطوات:

#### 1. تحميل FileZilla

رابط التحميل: https://filezilla-project.org/

#### 2. الاتصال بالسيرفر

```
Host: ftp://76.13.5.114
Username: u429102106_GALAL1
Password: galal123.DE
Port: 21
```

**ملاحظة:** إذا فشل الاتصال، جرب:
- Port: 2121
- أو استخدم SFTP بدلاً من FTP

#### 3. رفع الملفات

**لوحة الإدارة:**
- المجلد المحلي: `remix-of-mlm-main/dist/*`
- المجلد البعيد: `/domains/gapprotectionltd.com/public_html/`

**الفاحص الأمني:**
- المجلد المحلي: `Python-Webify/dist/*`
- المجلد البعيد: `/domains/gap-protection.pro/public_html/`

---

## الطريقة 3: النشر عبر WinSCP (Windows)

### الخطوات:

#### 1. تحميل WinSCP

رابط التحميل: https://winscp.net/

#### 2. الاتصال

```
File protocol: FTP
Host name: 76.13.5.114
Port number: 21
User name: u429102106_GALAL1
Password: galal123.DE
```

#### 3. رفع الملفات

اسحب الملفات من المجلد المحلي إلى المجلد البعيد

---

## الطريقة 4: النشر عبر Git (إذا كان متاحاً)

### الخطوات:

```bash
# 1. إنشاء repository
git init
git add .
git commit -m "Initial deployment"

# 2. إضافة remote
git remote add production ssh://u429102106_GALAL1@76.13.5.114/~/git/project.git

# 3. Push
git push production main
```

---

## استكشاف مشكلة الاتصال

### السبب المحتمل 1: Firewall

```bash
# تحقق من أن Port 21 مفتوح
telnet 76.13.5.114 21
```

**الحل:**
- تواصل مع مزود الاستضافة لفتح Port 21
- أو استخدم SFTP (Port 22)

### السبب المحتمل 2: IP Blocking

**الحل:**
- اذهب إلى cPanel > IP Blocker
- تأكد من أن IP الخاص بك غير محظور

### السبب المحتمل 3: FTP معطل

**الحل:**
- اذهب إلى cPanel > FTP Accounts
- تأكد من أن الحساب مفعل

---

## الطريقة الموصى بها حالياً

### استخدم cPanel File Manager:

1. ✅ بناء المشاريع محلياً
2. ✅ ضغط الملفات (zip أو tar.gz)
3. ✅ رفع عبر cPanel File Manager
4. ✅ فك الضغط على السيرفر

**المميزات:**
- لا يحتاج FTP
- يعمل دائماً
- سهل الاستخدام

---

## سكريبت بناء فقط

إذا أردت بناء المشاريع فقط بدون رفع:

```bash
# بناء لوحة الإدارة
cd remix-of-mlm-main
npm install
npm run build
echo "✅ تم بناء لوحة الإدارة في: remix-of-mlm-main/dist"

# بناء الفاحص الأمني
cd ../Python-Webify
npm install
npm run build
echo "✅ تم بناء الفاحص الأمني في: Python-Webify/dist"
```

---

## التحقق من النشر

بعد رفع الملفات بأي طريقة:

```bash
# اختبار المواقع
curl -I https://gapprotectionltd.com
curl -I https://gap-protection.pro
```

أو افتح في المتصفح:
- https://gapprotectionltd.com
- https://gap-protection.pro

---

## 📞 الدعم

إذا استمرت المشكلة:

1. تواصل مع مزود الاستضافة
2. تحقق من إعدادات Firewall
3. جرب استخدام VPN
4. استخدم cPanel File Manager (الأضمن)

---

**تم الإنشاء**: 2026-03-16  
**الحالة**: ✅ **جاهز للاستخدام**
