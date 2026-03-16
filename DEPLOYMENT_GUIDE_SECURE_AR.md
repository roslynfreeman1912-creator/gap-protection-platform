# 🚀 دليل النشر الآمن - Deployment Guide

## ⚠️ تحذير أمني

**لا تشارك أبداً:**
- ❌ كلمات المرور
- ❌ عناوين IP
- ❌ بيانات FTP
- ❌ API Keys
- ❌ Database Credentials

---

## 🎯 المشاريع المطلوب نشرها

### 1. **gapprotectionltd.com** - لوحة الإدارة (MLM + Call Center)
- 📁 المجلد: `remix-of-mlm-main`
- 🌐 النوع: React + Supabase Edge Functions
- 🎯 الهدف: لوحة إدارة كاملة

### 2. **gap-protection.pro** - الفاحص الأمني
- 📁 المجلد: `Python-Webify`
- 🌐 النوع: Python + React
- 🎯 الهدف: ماسح أمني

---

## 📋 خطوات النشر

### المرحلة 1: التحضير (قبل النشر)

#### ✅ 1.1 تحديث Environment Variables
```bash
# لا تضع القيم الحقيقية هنا!
# استخدم ملف .env منفصل

# للمشروع الأول (gapprotectionltd.com)
SUPABASE_URL=your_supabase_url
SUPABASE_ANON_KEY=your_anon_key
SUPABASE_SERVICE_ROLE_KEY=your_service_key

# للمشروع الثاني (gap-protection.pro)
DATABASE_URL=your_database_url
SECRET_KEY=your_secret_key
```

#### ✅ 1.2 بناء المشاريع
```bash
# المشروع الأول
cd remix-of-mlm-main
npm install
npm run build

# المشروع الثاني
cd ../Python-Webify
pip install -r requirements.txt
npm install
npm run build
```

---

### المرحلة 2: النشر على السيرفر

#### ⚠️ **ملاحظة مهمة:**
**لا تستخدم FTP لنقل الملفات!**
استخدم طرق آمنة مثل:
- ✅ SFTP (Secure FTP)
- ✅ SCP (Secure Copy)
- ✅ Git Deploy
- ✅ CI/CD Pipeline

#### ✅ 2.1 النشر الآمن
```bash
# استخدم SFTP بدلاً من FTP
# لا تكتب كلمة المرور في الأوامر!

# مثال (استخدم SSH Key بدلاً من كلمة المرور):
sftp -i ~/.ssh/your_key user@your_server
```

---

### المرحلة 3: إعداد السيرفر

#### ✅ 3.1 إعداد Nginx
```nginx
# /etc/nginx/sites-available/gapprotectionltd.com
server {
    listen 80;
    server_name gapprotectionltd.com www.gapprotectionltd.com;
    
    # Redirect to HTTPS
    return 301 https://$server_name$request_uri;
}

server {
    listen 443 ssl http2;
    server_name gapprotectionltd.com www.gapprotectionltd.com;
    
    # SSL Configuration
    ssl_certificate /path/to/cert.pem;
    ssl_certificate_key /path/to/key.pem;
    
    # Security Headers
    add_header Strict-Transport-Security "max-age=31536000; includeSubDomains" always;
    add_header X-Frame-Options "SAMEORIGIN" always;
    add_header X-Content-Type-Options "nosniff" always;
    
    root /var/www/gapprotectionltd.com;
    index index.html;
    
    location / {
        try_files $uri $uri/ /index.html;
    }
}
```

```nginx
# /etc/nginx/sites-available/gap-protection.pro
server {
    listen 80;
    server_name gap-protection.pro www.gap-protection.pro;
    
    return 301 https://$server_name$request_uri;
}

server {
    listen 443 ssl http2;
    server_name gap-protection.pro www.gap-protection.pro;
    
    ssl_certificate /path/to/cert.pem;
    ssl_certificate_key /path/to/key.pem;
    
    add_header Strict-Transport-Security "max-age=31536000; includeSubDomains" always;
    add_header X-Frame-Options "SAMEORIGIN" always;
    add_header X-Content-Type-Options "nosniff" always;
    
    root /var/www/gap-protection.pro;
    index index.html;
    
    location / {
        try_files $uri $uri/ /index.html;
    }
    
    location /api {
        proxy_pass http://localhost:5000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
    }
}
```

#### ✅ 3.2 تفعيل المواقع
```bash
# تفعيل المواقع
sudo ln -s /etc/nginx/sites-available/gapprotectionltd.com /etc/nginx/sites-enabled/
sudo ln -s /etc/nginx/sites-available/gap-protection.pro /etc/nginx/sites-enabled/

# اختبار الإعدادات
sudo nginx -t

# إعادة تشغيل Nginx
sudo systemctl restart nginx
```

---

### المرحلة 4: SSL Certificates

#### ✅ 4.1 تثبيت Let's Encrypt
```bash
# تثبيت Certbot
sudo apt update
sudo apt install certbot python3-certbot-nginx

# الحصول على شهادات SSL
sudo certbot --nginx -d gapprotectionltd.com -d www.gapprotectionltd.com
sudo certbot --nginx -d gap-protection.pro -d www.gap-protection.pro

# التجديد التلقائي
sudo certbot renew --dry-run
```

---

### المرحلة 5: التحقق من النشر

#### ✅ 5.1 اختبار الموقع الأول
```bash
# اختبار gapprotectionltd.com
curl -I https://gapprotectionltd.com

# يجب أن يعرض:
# HTTP/2 200
# strict-transport-security: max-age=31536000
```

#### ✅ 5.2 اختبار الموقع الثاني
```bash
# اختبار gap-protection.pro
curl -I https://gap-protection.pro

# يجب أن يعرض:
# HTTP/2 200
# strict-transport-security: max-age=31536000
```

---

## 🔐 قائمة الأمان

### قبل النشر:
- [ ] تم تغيير جميع كلمات المرور
- [ ] تم إزالة المعلومات الحساسة من الكود
- [ ] تم إعداد .env files بشكل صحيح
- [ ] تم اختبار المشروع محلياً

### أثناء النشر:
- [ ] استخدام SFTP/SCP بدلاً من FTP
- [ ] استخدام SSH Keys بدلاً من كلمات المرور
- [ ] تشفير جميع الاتصالات
- [ ] عدم مشاركة أي معلومات حساسة

### بعد النشر:
- [ ] تفعيل SSL
- [ ] تفعيل Security Headers
- [ ] تفعيل Firewall
- [ ] مراقبة Logs
- [ ] إعداد Backups

---

## 🚨 إجراءات الطوارئ

### إذا تم تسريب معلومات حساسة:

1. **غير جميع كلمات المرور فوراً**
2. **أوقف الخدمات المتأثرة**
3. **راجع Logs للتحقق من أي وصول غير مصرح**
4. **أعد إنشاء API Keys**
5. **أبلغ الفريق**

---

## 📞 الدعم

### للمساعدة في النشر:
- راجع هذا الدليل خطوة بخطوة
- لا تشارك معلومات حساسة
- استخدم قنوات اتصال آمنة

---

**تم الإنشاء**: 2026-03-16  
**الحالة**: ✅ **جاهز للنشر الآمن**  
**تحذير**: ⚠️ **لا تشارك معلومات حساسة أبداً**
