#!/bin/bash

# ═══════════════════════════════════════════════════════════
# سكريبت نشر المشاريع على السيرفر
# ═══════════════════════════════════════════════════════════

echo "🚀 بدء عملية النشر..."

# ═══════════════════════════════════════════════════════════
# المتغيرات - غيرها بعد النشر!
# ═══════════════════════════════════════════════════════════

SERVER_IP="76.13.5.114"
FTP_USER="u429102106_GALAL1"
FTP_PASS="galal123.DE"

# المسارات على السيرفر
ADMIN_PATH="/home/u429102106_GALAL1/domains/gapprotectionltd.com/public_html"
SCANNER_PATH="/home/u429102106_GALAL1/domains/gap-protection.pro/public_html"

# ═══════════════════════════════════════════════════════════
# 1. بناء المشروع الأول (Admin Dashboard)
# ═══════════════════════════════════════════════════════════

echo "📦 بناء لوحة الإدارة..."
cd remix-of-mlm-main

# تثبيت المكتبات
npm install

# بناء المشروع
npm run build

# إنشاء ملف مضغوط
cd dist
tar -czf admin-build.tar.gz *
cd ../..

echo "✅ تم بناء لوحة الإدارة"

# ═══════════════════════════════════════════════════════════
# 2. بناء المشروع الثاني (Security Scanner)
# ═══════════════════════════════════════════════════════════

echo "📦 بناء الفاحص الأمني..."
cd Python-Webify

# تثبيت المكتبات Python
pip install -r requirements.txt

# تثبيت المكتبات Node
npm install

# بناء المشروع
npm run build

# إنشاء ملف مضغوط
cd dist
tar -czf scanner-build.tar.gz *
cd ../..

echo "✅ تم بناء الفاحص الأمني"

# ═══════════════════════════════════════════════════════════
# 3. رفع الملفات للسيرفر (استخدم SFTP بدلاً من FTP!)
# ═══════════════════════════════════════════════════════════

echo "📤 رفع الملفات للسيرفر..."

# ملاحظة: استخدم SFTP أو SCP بدلاً من FTP
# مثال باستخدام SCP:

# رفع لوحة الإدارة
scp remix-of-mlm-main/dist/admin-build.tar.gz $FTP_USER@$SERVER_IP:$ADMIN_PATH/

# رفع الفاحص الأمني
scp Python-Webify/dist/scanner-build.tar.gz $FTP_USER@$SERVER_IP:$SCANNER_PATH/

echo "✅ تم رفع الملفات"

# ═══════════════════════════════════════════════════════════
# 4. فك الضغط على السيرفر
# ═══════════════════════════════════════════════════════════

echo "📂 فك ضغط الملفات على السيرفر..."

ssh $FTP_USER@$SERVER_IP << 'ENDSSH'
# فك ضغط لوحة الإدارة
cd /var/www/gapprotectionltd.com
tar -xzf admin-build.tar.gz
rm admin-build.tar.gz

# فك ضغط الفاحص الأمني
cd /var/www/gap-protection.pro
tar -xzf scanner-build.tar.gz
rm scanner-build.tar.gz

# تعيين الصلاحيات
chown -R www-data:www-data /var/www/gapprotectionltd.com
chown -R www-data:www-data /var/www/gap-protection.pro
chmod -R 755 /var/www/gapprotectionltd.com
chmod -R 755 /var/www/gap-protection.pro

echo "✅ تم فك الضغط وتعيين الصلاحيات"
ENDSSH

# ═══════════════════════════════════════════════════════════
# 5. إعادة تشغيل الخدمات
# ═══════════════════════════════════════════════════════════

echo "🔄 إعادة تشغيل Nginx..."

ssh $FTP_USER@$SERVER_IP << 'ENDSSH'
sudo systemctl restart nginx
sudo systemctl status nginx
ENDSSH

echo "✅ تم إعادة تشغيل Nginx"

# ═══════════════════════════════════════════════════════════
# 6. التحقق من النشر
# ═══════════════════════════════════════════════════════════

echo "🔍 التحقق من المواقع..."

# اختبار الموقع الأول
echo "اختبار gapprotectionltd.com..."
curl -I https://gapprotectionltd.com

# اختبار الموقع الثاني
echo "اختبار gap-protection.pro..."
curl -I https://gap-protection.pro

# ═══════════════════════════════════════════════════════════
# 7. تنظيف الملفات المؤقتة
# ═══════════════════════════════════════════════════════════

echo "🧹 تنظيف الملفات المؤقتة..."
rm -f remix-of-mlm-main/dist/admin-build.tar.gz
rm -f Python-Webify/dist/scanner-build.tar.gz

# ═══════════════════════════════════════════════════════════
# النهاية
# ═══════════════════════════════════════════════════════════

echo ""
echo "═══════════════════════════════════════════════════════════"
echo "✅ تم النشر بنجاح!"
echo "═══════════════════════════════════════════════════════════"
echo ""
echo "المواقع:"
echo "  🌐 لوحة الإدارة: https://gapprotectionltd.com"
echo "  🛡️ الفاحص الأمني: https://gap-protection.pro"
echo ""
echo "⚠️ تذكير مهم:"
echo "  1. غير كلمة مرور FTP فوراً"
echo "  2. غير كلمة مرور قاعدة البيانات"
echo "  3. غير كلمة مرور SSH"
echo "  4. راجع ملف .env وتأكد من الإعدادات"
echo ""
echo "═══════════════════════════════════════════════════════════"
