# 🔧 حل مشكلة الاتصال بالسيرفر

## ❌ المشكلة

```
❌ خطأ في الاتصال بالسيرفر: [WinError 10060]
A connection attempt failed...
```

---

## ✅ الحل السريع (موصى به)

### استخدم cPanel File Manager بدلاً من FTP

---

## 📋 الخطوات

### 1️⃣ بناء المشاريع محلياً

```bash
python build-only.py
```

هذا السكريبت سيبني المشروعين ويضع الملفات في:
- `remix-of-mlm-main/dist/`
- `Python-Webify/dist/`

---

### 2️⃣ الدخول إلى cPanel

افتح المتصفح واذهب إلى:
```
https://76.13.5.114:2083
```

سجل دخول:
- Username: `u429102106_GALAL1`
- Password: `galal123.DE`

---

### 3️⃣ رفع لوحة الإدارة

1. في cPanel، افتح **File Manager**

2. اذهب إلى:
   ```
   /domains/gapprotectionltd.com/public_html
   ```

3. احذف جميع الملفات القديمة (إذا وجدت)

4. اضغط **Upload**

5. ارفع جميع الملفات من:
   ```
   remix-of-mlm-main/dist/*
   ```

6. تأكد من رفع:
   - ✅ `index.html`
   - ✅ `.htaccess`
   - ✅ مجلد `assets/`
   - ✅ جميع ملفات `.js` و `.css`

---

### 4️⃣ رفع الفاحص الأمني

1. في File Manager، اذهب إلى:
   ```
   /domains/gap-protection.pro/public_html
   ```

2. احذف جميع الملفات القديمة (إذا وجدت)

3. اضغط **Upload**

4. ارفع جميع الملفات من:
   ```
   Python-Webify/dist/*
   ```

5. تأكد من رفع:
   - ✅ `index.html`
   - ✅ `.htaccess`
   - ✅ مجلد `assets/`
   - ✅ جميع ملفات `.js` و `.css`

---

### 5️⃣ التحقق

افتح المواقع في المتصفح:

1. https://gapprotectionltd.com
2. https://gap-protection.pro

---

## 🎯 طريقة بديلة: ضغط ورفع

إذا كانت الملفات كثيرة:

### 1. ضغط الملفات

**على Windows:**
```powershell
# ضغط لوحة الإدارة
Compress-Archive -Path "remix-of-mlm-main/dist/*" -DestinationPath "admin.zip"

# ضغط الفاحص الأمني
Compress-Archive -Path "Python-Webify/dist/*" -DestinationPath "scanner.zip"
```

**على Linux/Mac:**
```bash
# ضغط لوحة الإدارة
cd remix-of-mlm-main/dist
zip -r ../../admin.zip *

# ضغط الفاحص الأمني
cd ../../Python-Webify/dist
zip -r ../../scanner.zip *
```

### 2. رفع الملفات المضغوطة

1. ارفع `admin.zip` إلى `/domains/gapprotectionltd.com/public_html/`
2. انقر بزر الماوس الأيمن > **Extract**
3. احذف `admin.zip` بعد فك الضغط

4. ارفع `scanner.zip` إلى `/domains/gap-protection.pro/public_html/`
5. انقر بزر الماوس الأيمن > **Extract**
6. احذف `scanner.zip` بعد فك الضغط

---

## 🔍 لماذا فشل الاتصال؟

### الأسباب المحتملة:

1. **Firewall يحجب Port 21**
   - الحل: استخدم cPanel File Manager

2. **السيرفر لا يسمح بـ FTP من IP الخاص بك**
   - الحل: استخدم cPanel File Manager

3. **FTP معطل على السيرفر**
   - الحل: استخدم cPanel File Manager

4. **مشكلة في الشبكة**
   - الحل: استخدم cPanel File Manager

---

## ✅ الخلاصة

**استخدم cPanel File Manager - إنه الأسهل والأضمن!**

### الخطوات المختصرة:

```bash
# 1. بناء
python build-only.py

# 2. رفع عبر cPanel File Manager
# - افتح https://76.13.5.114:2083
# - File Manager > Upload
# - ارفع الملفات

# 3. تحقق
# - افتح https://gapprotectionltd.com
# - افتح https://gap-protection.pro
```

---

**تم الإنشاء**: 2026-03-16  
**الحالة**: ✅ **جاهز للاستخدام**
