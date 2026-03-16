# 💾 دليل النسخ الاحتياطي الحقيقي إلى VPS

## نسخ احتياطي حقيقي من Supabase إلى Hostinger VPS

**الهدف**: تخزين حقيقي ودائم لبياناتك خارج Supabase  
**الوجهة**: Hostinger VPS MySQL/PostgreSQL  
**التكرار**: تلقائي (كل ساعة/يوم)  
**الأمان**: مشفر ومحمي

---

## 🎯 لماذا هذا الحل؟

### المشكلة
- ❌ Supabase وحده ليس كافياً
- ❌ تحتاج نسخة احتياطية خارجية
- ❌ تحتاج تحكم كامل في بياناتك

### الحل
- ✅ نسخ احتياطي تلقائي إلى VPS الخاص بك
- ✅ تخزين حقيقي في MySQL/PostgreSQL
- ✅ تحكم كامل في البيانات
- ✅ استرجاع سريع عند الحاجة

---

## 📋 المتطلبات

### 1. Hostinger VPS
- ✅ VPS مع MySQL أو PostgreSQL
- ✅ IP Address أو Domain
- ✅ Username و Password
- ✅ Port (عادة 3306 لـ MySQL)

### 2. Supabase
- ✅ Project URL
- ✅ Service Role Key
- ✅ Database Access

### 3. الأدوات
- ✅ PowerShell 5.1+
- ✅ Supabase CLI (اختياري)
- ✅ Internet Connection

---

## 🚀 الإعداد السريع (10 دقائق)

### الخطوة 1: إعداد VPS (5 دقائق)

#### على Hostinger VPS:

```bash
# 1. تسجيل الدخول إلى VPS
ssh root@your-vps-ip

# 2. تثبيت MySQL (إذا لم يكن مثبتاً)
apt update
apt install mysql-server -y

# 3. تأمين MySQL
mysql_secure_installation

# 4. إنشاء قاعدة بيانات للنسخ الاحتياطي
mysql -u root -p

CREATE DATABASE gap_protection_backup CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

# 5. إنشاء مستخدم للنسخ الاحتياطي
CREATE USER 'backup_user'@'%' IDENTIFIED BY 'your-strong-password';
GRANT ALL PRIVILEGES ON gap_protection_backup.* TO 'backup_user'@'%';
FLUSH PRIVILEGES;
EXIT;

# 6. السماح بالاتصالات الخارجية
nano /etc/mysql/mysql.conf.d/mysqld.cnf

# غيّر bind-address من 127.0.0.1 إلى 0.0.0.0
bind-address = 0.0.0.0

# 7. إعادة تشغيل MySQL
systemctl restart mysql

# 8. فتح Port في Firewall
ufw allow 3306/tcp
```

---

### الخطوة 2: تطبيق Schema في Supabase (2 دقيقة)

```sql
-- في Supabase SQL Editor
-- نسخ ولصق محتوى solutions/07-real-backup-to-vps.sql
\i solutions/07-real-backup-to-vps.sql

-- التحقق من الجداول
SELECT * FROM external_backup_config;
SELECT * FROM table_sync_status;
```

---

### الخطوة 3: تحديث معلومات VPS (1 دقيقة)

```sql
-- في Supabase SQL Editor
UPDATE external_backup_config
SET 
    host = 'your-vps-ip.hostinger.com',  -- IP أو Domain الخاص بك
    port = 3306,
    database_name = 'gap_protection_backup',
    username = 'backup_user',
    enabled = true,
    updated_at = NOW()
WHERE config_name = 'hostinger_vps_primary';

-- التحقق
SELECT * FROM external_backup_config;
```

---

### الخطوة 4: نشر Edge Function (2 دقيقة)

```powershell
# في PowerShell
cd remix-of-mlm-main

# نشر الدالة
supabase functions deploy backup-to-vps

# تعيين متغير البيئة للـ Password
# في Supabase Dashboard → Settings → Edge Functions → Secrets
# أضف: VPS_BACKUP_PASSWORD = your-vps-password
```

---

### الخطوة 5: تشغيل الإعداد التلقائي

```powershell
# تعيين متغيرات البيئة
$env:SUPABASE_URL = "https://pqnzsihfryjnnhdubisk.supabase.co"
$env:SUPABASE_SERVICE_ROLE_KEY = "your-service-role-key"

# تشغيل الإعداد
.\setup-vps-backup.ps1 `
    -VPSHost "your-vps-ip" `
    -VPSPort "3306" `
    -VPSDatabase "gap_protection_backup" `
    -VPSUsername "backup_user" `
    -VPSPassword "your-password"

# أو تشغيل تفاعلي (سيطلب منك المعلومات)
.\setup-vps-backup.ps1
```

---

## 📊 أنواع النسخ الاحتياطي

### 1. Full Backup (نسخة كاملة)
- **متى**: مرة يومياً (2:00 صباحاً)
- **ماذا**: جميع البيانات من جميع الجداول
- **الحجم**: كبير
- **الوقت**: 5-30 دقيقة

```powershell
# تشغيل يدوي
$payload = @{
    action = "full_backup"
    configName = "hostinger_vps_primary"
    tables = @(
        "profiles",
        "user_hierarchy",
        "commissions",
        "transactions",
        "security_scans",
        "contracts",
        "invoices",
        "promotion_codes"
    )
} | ConvertTo-Json

Invoke-RestMethod `
    -Uri "$env:SUPABASE_URL/functions/v1/backup-to-vps" `
    -Method Post `
    -Headers @{
        "Authorization" = "Bearer $env:SUPABASE_SERVICE_ROLE_KEY"
        "Content-Type" = "application/json"
    } `
    -Body $payload
```

---

### 2. Incremental Backup (نسخة تزايدية)
- **متى**: كل ساعة
- **ماذا**: فقط البيانات الجديدة/المحدثة
- **الحجم**: صغير
- **الوقت**: 1-5 دقائق

```powershell
# تشغيل يدوي
$payload = @{
    action = "incremental_backup"
    configName = "hostinger_vps_primary"
    tables = @("profiles", "transactions", "commissions")
} | ConvertTo-Json

Invoke-RestMethod `
    -Uri "$env:SUPABASE_URL/functions/v1/backup-to-vps" `
    -Method Post `
    -Headers @{
        "Authorization" = "Bearer $env:SUPABASE_SERVICE_ROLE_KEY"
        "Content-Type" = "application/json"
    } `
    -Body $payload
```

---

## 🔍 المراقبة والتحقق

### فحص حالة النسخ الاحتياطي

```sql
-- في Supabase SQL Editor

-- 1. حالة جميع الجداول
SELECT * FROM get_backup_status();

-- 2. صحة النظام
SELECT * FROM check_backup_health();

-- 3. آخر 10 نسخ احتياطية
SELECT 
    ebl.id,
    ebc.config_name,
    ebl.backup_method,
    ebl.tables_backed_up,
    ebl.records_backed_up,
    ebl.backup_status,
    ebl.duration_seconds,
    ebl.created_at
FROM external_backup_log ebl
JOIN external_backup_config ebc ON ebl.config_id = ebc.id
ORDER BY ebl.created_at DESC
LIMIT 10;

-- 4. الجداول التي تحتاج نسخ احتياطي
SELECT 
    table_name,
    last_sync_at,
    AGE(NOW(), last_sync_at) as backup_age,
    records_synced
FROM table_sync_status
WHERE last_sync_at < NOW() - INTERVAL '6 hours'
   OR last_sync_at IS NULL
ORDER BY last_sync_at ASC NULLS FIRST;
```

---

### فحص من PowerShell

```powershell
# فحص الحالة
$payload = @{ action = "status" } | ConvertTo-Json

$response = Invoke-RestMethod `
    -Uri "$env:SUPABASE_URL/functions/v1/backup-to-vps" `
    -Method Post `
    -Headers @{
        "Authorization" = "Bearer $env:SUPABASE_SERVICE_ROLE_KEY"
        "Content-Type" = "application/json"
    } `
    -Body $payload

# عرض النتائج
$response.status | Format-Table
$response.health | Format-Table
```

---

### فحص على VPS

```bash
# تسجيل الدخول إلى VPS
ssh root@your-vps-ip

# الدخول إلى MySQL
mysql -u backup_user -p gap_protection_backup

# عرض الجداول
SHOW TABLES;

# عد السجلات
SELECT 
    TABLE_NAME,
    TABLE_ROWS
FROM information_schema.TABLES
WHERE TABLE_SCHEMA = 'gap_protection_backup'
ORDER BY TABLE_ROWS DESC;

# عرض آخر نسخة احتياطية
SELECT * FROM backup_profiles
ORDER BY backup_created_at DESC
LIMIT 10;
```

---

## ⏰ جدولة النسخ الاحتياطي التلقائي

### الخيار 1: Windows Task Scheduler (موصى به للتطوير)

```powershell
# 1. إنشاء سكريبت النسخ الاحتياطي
# الملف: run-backup.ps1 (تم إنشاؤه تلقائياً)

# 2. فتح Task Scheduler
# Start → Task Scheduler

# 3. Create Basic Task
# Name: GAP Protection Backup
# Trigger: Daily at 2:00 AM
# Action: Start a program
# Program: powershell.exe
# Arguments: -File "C:\path\to\run-backup.ps1"

# 4. Additional Settings
# Run whether user is logged on or not
# Run with highest privileges
```

---

### الخيار 2: Supabase Cron (موصى به للإنتاج)

```sql
-- في Supabase SQL Editor

-- 1. تفعيل pg_cron extension
CREATE EXTENSION IF NOT EXISTS pg_cron;

-- 2. جدولة نسخة كاملة يومياً (2:00 صباحاً)
SELECT cron.schedule(
    'daily-full-backup',
    '0 2 * * *',
    $$
    SELECT net.http_post(
        url := 'https://pqnzsihfryjnnhdubisk.supabase.co/functions/v1/backup-to-vps',
        headers := '{"Authorization": "Bearer YOUR_SERVICE_ROLE_KEY", "Content-Type": "application/json"}'::jsonb,
        body := '{"action": "full_backup", "configName": "hostinger_vps_primary", "tables": ["profiles", "user_hierarchy", "commissions", "transactions"]}'::jsonb
    );
    $$
);

-- 3. جدولة نسخة تزايدية كل ساعة
SELECT cron.schedule(
    'hourly-incremental-backup',
    '0 * * * *',
    $$
    SELECT net.http_post(
        url := 'https://pqnzsihfryjnnhdubisk.supabase.co/functions/v1/backup-to-vps',
        headers := '{"Authorization": "Bearer YOUR_SERVICE_ROLE_KEY", "Content-Type": "application/json"}'::jsonb,
        body := '{"action": "incremental_backup", "configName": "hostinger_vps_primary", "tables": ["profiles", "transactions", "commissions"]}'::jsonb
    );
    $$
);

-- 4. عرض الجداول المجدولة
SELECT * FROM cron.job;

-- 5. عرض سجل التنفيذ
SELECT * FROM cron.job_run_details
ORDER BY start_time DESC
LIMIT 10;
```

---

## 🔄 استرجاع البيانات (Restore)

### من VPS إلى Supabase

```bash
# 1. على VPS - تصدير البيانات
mysqldump -u backup_user -p gap_protection_backup backup_profiles > profiles_restore.sql

# 2. تحميل الملف
scp root@your-vps-ip:/root/profiles_restore.sql ./

# 3. تحويل إلى PostgreSQL format (إذا لزم الأمر)
# استخدم أداة مثل pgloader

# 4. استيراد إلى Supabase
psql -h db.pqnzsihfryjnnhdubisk.supabase.co -U postgres -d postgres -f profiles_restore.sql
```

---

## 🛡️ الأمان

### 1. تشفير الاتصال

```bash
# على VPS - تفعيل SSL لـ MySQL
nano /etc/mysql/mysql.conf.d/mysqld.cnf

# أضف:
[mysqld]
require_secure_transport=ON
ssl-ca=/etc/mysql/ca.pem
ssl-cert=/etc/mysql/server-cert.pem
ssl-key=/etc/mysql/server-key.pem
```

### 2. تشفير كلمة المرور

```sql
-- في Supabase - تخزين كلمة المرور مشفرة
UPDATE external_backup_config
SET password_encrypted = encode(
    encrypt(
        'your-password'::bytea,
        'encryption-key'::bytea,
        'aes'
    ),
    'base64'
)
WHERE config_name = 'hostinger_vps_primary';
```

### 3. Firewall Rules

```bash
# على VPS - السماح فقط لـ Supabase IP
ufw allow from SUPABASE_IP to any port 3306
ufw deny 3306/tcp
```

---

## 📈 المراقبة المستمرة

### Dashboard بسيط

```sql
-- إنشاء View للمراقبة
CREATE OR REPLACE VIEW backup_dashboard AS
SELECT 
    'Total Backups' as metric,
    COUNT(*)::TEXT as value,
    'all time' as period
FROM external_backup_log
UNION ALL
SELECT 
    'Successful Backups (24h)',
    COUNT(*)::TEXT,
    'last 24 hours'
FROM external_backup_log
WHERE backup_status = 'completed'
AND created_at > NOW() - INTERVAL '24 hours'
UNION ALL
SELECT 
    'Failed Backups (24h)',
    COUNT(*)::TEXT,
    'last 24 hours'
FROM external_backup_log
WHERE backup_status = 'failed'
AND created_at > NOW() - INTERVAL '24 hours'
UNION ALL
SELECT 
    'Total Records Backed Up',
    SUM(records_backed_up)::TEXT,
    'all time'
FROM external_backup_log
WHERE backup_status = 'completed';

-- عرض Dashboard
SELECT * FROM backup_dashboard;
```

---

## ✅ قائمة التحقق

### الإعداد الأولي
- [ ] VPS جاهز مع MySQL/PostgreSQL
- [ ] قاعدة بيانات منشأة
- [ ] مستخدم backup منشأ
- [ ] Firewall مُعد
- [ ] Schema مُطبق في Supabase
- [ ] معلومات VPS محدثة
- [ ] Edge Function منشورة
- [ ] اختبار الاتصال ناجح
- [ ] نسخة احتياطية أولية مكتملة

### المراقبة اليومية
- [ ] فحص حالة النسخ الاحتياطي
- [ ] التحقق من آخر نسخة
- [ ] مراجعة الأخطاء (إن وجدت)
- [ ] التأكد من المساحة المتاحة على VPS

### الصيانة الأسبوعية
- [ ] اختبار استرجاع البيانات
- [ ] مراجعة سجلات النسخ الاحتياطي
- [ ] تنظيف النسخ القديمة
- [ ] تحديث كلمات المرور

---

## 🎉 النجاح!

بعد إكمال هذا الإعداد، لديك الآن:

✅ **نسخ احتياطي حقيقي** على VPS الخاص بك  
✅ **تلقائي** - يعمل كل ساعة/يوم  
✅ **آمن** - مشفر ومحمي  
✅ **قابل للاسترجاع** - يمكن استرجاع البيانات بسهولة  
✅ **مراقب** - تعرف حالة النسخ الاحتياطي دائماً

**بياناتك الآن محمية 100%!** 🎊

---

**تم إنشاء هذا الدليل بواسطة**: Kiro AI  
**التاريخ**: 12 مارس 2026  
**الحالة**: ✅ جاهز للاستخدام
