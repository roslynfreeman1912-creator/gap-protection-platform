# 📋 خطوات النشر اليدوية

## 🎯 دليل خطوة بخطوة للنشر

---

## الخطوة 1: بناء المشاريع محلياً

### 1.1 بناء لوحة الإدارة (gapprotectionltd.com)

```bash
cd remix-of-mlm-main

# تثبيت المكتبات
npm install

# بناء المشروع
npm run build

# الملفات الجاهزة في: dist/
```

### 1.2 بناء الفاحص الأمني (gap-protection.pro)

```bash
cd Python-Webify

# تثبيت مكتبات Python
pip install -r requirements.txt

# تثبيت مكتبات Node
npm install

# بناء المشروع
npm run build

# الملفات الجاهزة في: dist/
```

---

## الخطوة 2: رفع الملفات للسيرفر

### الطريقة 1: باستخدام FileZilla (موصى بها)

1. افتح FileZilla
2. اتصل بالسيرفر:
   - Host: `sftp://YOUR_SERVER_IP`
   - Username: `YOUR_USERNAME`
   - Password: `YOUR_PASSWORD`
   - Port: `22`

3. ارفع الملفات:
   - `remix-of-mlm-main/dist/*` → `/var/www/gapprotectionltd.com/`
   - `Python-Webify/dist/*` → `/var/www/gap-protection.pro/`

### الطريقة 2: باستخدام SCP

```bash
# رفع لوحة الإدارة
scp -r remix-of-mlm-main/dist/* user@server:/var/www/gapprotectionltd.com/

# رفع الفاحص الأمني
scp -r Python-Webify/dist/* user@server:/var/www/gap-protection.pro/
```

---

## الخطوة 3: إعداد Nginx على السيرفر

### 3.1 الاتصال بالسيرفر

```bash
ssh user@YOUR_SERVER_IP
```

### 3.2 إنشاء ملف إعداد لـ gapprotectionltd.com

```bash
sudo nano /etc/nginx/sites-available/gapprotectionltd.com
```

أضف هذا المحتوى:

```nginx
server {
    listen 80;
    server_name gapprotectionltd.com www.gapprotectionltd.com;
    return 301 https://$server_name$request_uri;
}

server {
    listen 443 ssl http2;
    server_name gapprotectionltd.com www.gapprotectionltd.com;
    
    root /var/www/gapprotectionltd.com;
    index index.html;
    
    # SSL (سيتم إضافتها بواسطة Certbot)
    
    # Security Headers
    add_header Strict-Transport-Security "max-age=31536000; includeSubDomains" always;
    add_header X-Frame-Options "SAMEORIGIN" always;
    add_header X-Content-Type-Options "nosniff" always;
    add_header X-XSS-Protection "1; mode=block" always;
    
    location / {
        try_files $uri $uri/ /index.html;
    }
    
    # Gzip
    gzip on;
    gzip_types text/plain text/css application/json application/javascript text/xml application/xml application/xml+rss text/javascript;
}
```

### 3.3 إنشاء ملف إعداد لـ gap-protection.pro

```bash
sudo nano /etc/nginx/sites-available/gap-protection.pro
```

أضف هذا المحتوى:

```nginx
server {
    listen 80;
    server_name gap-protection.pro www.gap-protection.pro;
    return 301 https://$server_name$request_uri;
}

server {
    listen 443 ssl http2;
    server_name gap-protection.pro www.gap-protection.pro;
    
    root /var/www/gap-protection.pro;
    index index.html;
    
    # Security Headers
    add_header Strict-Transport-Security "max-age=31536000; includeSubDomains" always;
    add_header X-Frame-Options "SAMEORIGIN" always;
    add_header X-Content-Type-Options "nosniff" always;
    add_header X-XSS-Protection "1; mode=block" always;
    
    location / {
        try_files $uri $uri/ /index.html;
    }
    
    # API Proxy (إذا كان هناك Backend)
    location /api {
        proxy_pass http://localhost:5000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
    
    gzip on;
    gzip_types text/plain text/css application/json application/javascript text/xml application/xml application/xml+rss text/javascript;
}
```

### 3.4 تفعيل المواقع

```bash
# إنشاء روابط رمزية
sudo ln -s /etc/nginx/sites-available/gapprotectionltd.com /etc/nginx/sites-enabled/
sudo ln -s /etc/nginx/sites-available/gap-protection.pro /etc/nginx/sites-enabled/

# اختبار الإعدادات
sudo nginx -t

# إعادة تشغيل Nginx
sudo systemctl restart nginx
```

---

## الخطوة 4: تثبيت SSL Certificates

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

## الخطوة 5: تعيين الصلاحيات

```bash
# تعيين المالك
sudo chown -R www-data:www-data /var/www/gapprotectionltd.com
sudo chown -R www-data:www-data /var/www/gap-protection.pro

# تعيين الصلاحيات
sudo chmod -R 755 /var/www/gapprotectionltd.com
sudo chmod -R 755 /var/www/gap-protection.pro
```

---

## الخطوة 6: التحقق من النشر

### 6.1 اختبار المواقع

```bash
# اختبار gapprotectionltd.com
curl -I https://gapprotectionltd.com

# اختبار gap-protection.pro
curl -I https://gap-protection.pro
```

### 6.2 فتح المواقع في المتصفح

1. افتح: https://gapprotectionltd.com
2. افتح: https://gap-protection.pro

---

## الخطوة 7: إعداد قاعدة البيانات (إذا لزم الأمر)

### 7.1 الدخول إلى phpMyAdmin

1. افتح: `https://YOUR_SERVER_IP/phpmyadmin`
2. سجل الدخول بالبيانات الخاصة بك
3. أنشئ قاعدة بيانات جديدة إذا لزم الأمر

### 7.2 استيراد البيانات

```bash
# إذا كان لديك ملف SQL
mysql -u username -p database_name < backup.sql
```

---

## الخطوة 8: إعداد Environment Variables

### 8.1 للمشروع الأول (gapprotectionltd.com)

```bash
# إنشاء ملف .env
sudo nano /var/www/gapprotectionltd.com/.env
```

أضف:
```env
SUPABASE_URL=your_supabase_url
SUPABASE_ANON_KEY=your_anon_key
SUPABASE_SERVICE_ROLE_KEY=your_service_key
```

### 8.2 للمشروع الثاني (gap-protection.pro)

```bash
sudo nano /var/www/gap-protection.pro/.env
```

أضف:
```env
DATABASE_URL=your_database_url
SECRET_KEY=your_secret_key
```

---

## الخطوة 9: إعداد Firewall

```bash
# السماح بـ HTTP و HTTPS
sudo ufw allow 'Nginx Full'

# السماح بـ SSH
sudo ufw allow OpenSSH

# تفعيل Firewall
sudo ufw enable

# التحقق من الحالة
sudo ufw status
```

---

## الخطوة 10: إعداد Backups التلقائية

```bash
# إنشاء سكريبت Backup
sudo nano /usr/local/bin/backup-websites.sh
```

أضف:
```bash
#!/bin/bash
DATE=$(date +%Y%m%d_%H%M%S)
BACKUP_DIR="/backups"

# Backup المواقع
tar -czf $BACKUP_DIR/gapprotectionltd_$DATE.tar.gz /var/www/gapprotectionltd.com
tar -czf $BACKUP_DIR/gap-protection_$DATE.tar.gz /var/www/gap-protection.pro

# Backup قاعدة البيانات
mysqldump -u username -p database_name > $BACKUP_DIR/db_$DATE.sql

# حذف Backups القديمة (أكثر من 7 أيام)
find $BACKUP_DIR -type f -mtime +7 -delete
```

```bash
# تعيين الصلاحيات
sudo chmod +x /usr/local/bin/backup-websites.sh

# إضافة Cron Job (يومياً في 2 صباحاً)
sudo crontab -e
```

أضف:
```
0 2 * * * /usr/local/bin/backup-websites.sh
```

---

## ✅ قائمة التحقق النهائية

- [ ] تم بناء المشاريع محلياً
- [ ] تم رفع الملفات للسيرفر
- [ ] تم إعداد Nginx
- [ ] تم تثبيت SSL Certificates
- [ ] تم تعيين الصلاحيات
- [ ] تم اختبار المواقع
- [ ] تم إعداد قاعدة البيانات
- [ ] تم إعداد Environment Variables
- [ ] تم إعداد Firewall
- [ ] تم إعداد Backups

---

## 🚨 بعد النشر مباشرة

### ⚠️ **غير هذه المعلومات فوراً:**

1. ✅ كلمة مرور FTP/SFTP
2. ✅ كلمة مرور قاعدة البيانات
3. ✅ كلمة مرور phpMyAdmin
4. ✅ كلمة مرور SSH
5. ✅ API Keys
6. ✅ Secret Keys

---

**تم الإنشاء**: 2026-03-16  
**الحالة**: ✅ **جاهز للنشر**
