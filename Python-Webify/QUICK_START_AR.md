# 🚀 دليل البدء السريع - GAP Protection Scanner

## المتطلبات الأساسية

### البرامج المطلوبة
- **Python 3.11+** - [تحميل](https://python.org)
- **Node.js 18+** - [تحميل](https://nodejs.org)
- **Git** - [تحميل](https://git-scm.com)

### اختياري (للميزات المتقدمة)
- **PostgreSQL 16+** - لميزات WAF/Shield
- **Docker** - للنشر بالحاويات

---

## التثبيت

### الطريقة 1: إعداد تلقائي (موصى به) ⚡

#### Windows
```powershell
# الانتقال إلى المشروع
cd Python-Webify

# تشغيل سكريبت الإعداد
.\scripts\setup.bat

# تحرير ملف البيئة
notepad .env
```

#### Linux/Mac
```bash
# الانتقال إلى المشروع
cd Python-Webify

# تشغيل سكريبت الإعداد
bash scripts/setup.sh

# تحرير ملف البيئة
nano .env
```

#### Node.js (متعدد المنصات)
```bash
cd Python-Webify
npm run setup
```

### الطريقة 2: إعداد يدوي 🔧

```bash
# 1. تثبيت تبعيات Python
pip install -e .

# 2. تثبيت تبعيات Node.js
npm install

# 3. نسخ ملف البيئة
cp .env.example .env

# 4. تحرير .env بمفاتيحك
nano .env
```

---

## التكوين

### 1. ملف البيئة (.env)

افتح `.env` وقم بتحديث القيم التالية:

```bash
# مفاتيح Claude API (مطلوب)
CLAUDE_API_KEYS=your_key_1,your_key_2,your_key_3

# معلومات الشركة (اختياري)
COMPANY_NAME="اسم شركتك"
COMPANY_EMAIL=security@yourcompany.com
COMPANY_PHONE="+966 XX XXX XXXX"
COMPANY_WEBSITE=https://yourcompany.com

# قاعدة البيانات (اختياري - لميزات WAF/Shield)
DATABASE_URL=postgresql://user:password@localhost:5432/gap_protection

# الأمان
SESSION_SECRET=generate_random_32_character_secret_here
```

### 2. الحصول على مفاتيح Claude API

1. اذهب إلى [console.anthropic.com](https://console.anthropic.com)
2. سجل الدخول أو أنشئ حساب
3. اذهب إلى "API Keys"
4. أنشئ مفتاح API جديد
5. انسخ المفتاح إلى `.env`

**ملاحظة**: يمكنك إضافة عدة مفاتيح مفصولة بفواصل للتدوير التلقائي.

---

## الاستخدام الأساسي

### فحص موقع واحد

```bash
# فحص شامل
python advanced_scanner.py https://example.com

# مع اسم العميل
python complete_scan.py https://example.com "اسم العميل"
```

### أمثلة

```bash
# فحص بنك
python complete_scan.py https://bank-example.com "البنك الوطني"

# فحص مركز اتصال
python complete_scan.py https://callcenter.com "مركز خدمة العملاء"

# فحص موقع تجاري
python complete_scan.py https://shop.com "متجر إلكتروني"
```

### النتائج

بعد الفحص، ستجد:
- **تقرير JSON**: `scan_results_YYYYMMDD_HHMMSS.json`
- **تقرير PDF (ألماني)**: `sicherheitsbericht_*.pdf`
- **تقرير PDF (إنجليزي)**: `security_report_*.pdf`
- **سجلات**: `logs/scan_*.log`

---

## الميزات المتقدمة

### 1. استخدام قاعدة البيانات

إذا كنت تريد استخدام ميزات WAF/Shield:

```bash
# تهيئة قاعدة البيانات
npm run db:push

# أو يدوياً
psql $DATABASE_URL -f scripts/init_db.sql
```

### 2. واجهة الويب

```bash
# تطوير
npm run dev

# إنتاج
npm run build
npm start
```

افتح المتصفح: `http://localhost:5000`

### 3. Docker

```bash
# بناء وتشغيل
npm run docker:up

# عرض السجلات
npm run docker:logs

# إيقاف
npm run docker:down
```

---

## الأوامر المفيدة

### Python

```bash
# فحص بسيط
python advanced_scanner.py https://example.com

# فحص كامل مع تقرير
python complete_scan.py https://example.com "العميل"

# فحص الصحة
python health_check.py
```

### Node.js

```bash
# تطوير
npm run dev

# بناء
npm run build

# إنتاج
npm start

# فحص الأنواع
npm run check

# قاعدة البيانات
npm run db:push
```

### Docker

```bash
# بناء
npm run docker:build

# تشغيل
npm run docker:up

# إيقاف
npm run docker:down

# سجلات
npm run docker:logs
```

---

## استكشاف الأخطاء

### المشكلة: "Module not found"

```bash
# تأكد من تثبيت التبعيات
pip install -e .
npm install
```

### المشكلة: "Invalid API key"

```bash
# تحقق من .env
cat .env | grep CLAUDE_API_KEYS

# تأكد من صحة المفاتيح
```

### المشكلة: "Database connection failed"

```bash
# تحقق من DATABASE_URL
echo $DATABASE_URL

# تأكد من تشغيل PostgreSQL
pg_isready
```

### المشكلة: "Permission denied"

```bash
# Linux/Mac: أعط صلاحيات التنفيذ
chmod +x scripts/*.sh

# Windows: شغل PowerShell كمسؤول
```

---

## الخطوات التالية

### للتطوير
1. اقرأ `CONTRIBUTING.md`
2. راجع `SECURITY.md`
3. شاهد الأمثلة في `tests/`

### للإنتاج
1. اتبع `PRODUCTION_CHECKLIST.md`
2. راجع `DEPLOYMENT.md`
3. اقرأ `SECURITY.md`

### للتعلم
1. اقرأ `README.md` الكامل
2. راجع `CHANGELOG.md`
3. شاهد التوثيق في الكود

---

## الدعم

### التوثيق
- **README.md** - نظرة عامة شاملة
- **DEPLOYMENT.md** - دليل النشر
- **PRODUCTION_CHECKLIST.md** - قائمة التحقق
- **SECURITY.md** - سياسة الأمان

### المساعدة
- **البريد الإلكتروني**: security@gap-protection.com
- **المشاكل**: GitHub Issues
- **التوثيق**: في مجلد المشروع

---

## نصائح مهمة ⚠️

### الأمان
- ✅ لا تشارك مفاتيح API أبداً
- ✅ لا ترفع ملف `.env` إلى Git
- ✅ استخدم HTTPS في الإنتاج
- ✅ احصل على إذن قبل الفحص

### الأداء
- ✅ استخدم عدة مفاتيح API للتدوير
- ✅ قلل عدد الطلبات المتزامنة
- ✅ استخدم قاعدة بيانات للنتائج
- ✅ راقب استخدام الموارد

### أفضل الممارسات
- ✅ احفظ نسخ احتياطية من التقارير
- ✅ راجع السجلات بانتظام
- ✅ حدّث التبعيات شهرياً
- ✅ اختبر في بيئة تطوير أولاً

---

## أمثلة الاستخدام

### مثال 1: فحص بسيط

```bash
python advanced_scanner.py https://example.com
```

**النتيجة**:
- ملف JSON بالثغرات
- سجل مفصل
- درجة المخاطر

### مثال 2: فحص كامل مع تقرير

```bash
python complete_scan.py https://bank.com "البنك الوطني"
```

**النتيجة**:
- تقرير PDF بالألمانية
- تقرير PDF بالإنجليزية
- ملف JSON
- سجلات مفصلة

### مثال 3: فحص متعدد

```bash
# إنشاء سكريبت
cat > scan_multiple.sh << 'EOF'
#!/bin/bash
for url in https://site1.com https://site2.com https://site3.com
do
    python advanced_scanner.py $url
done
EOF

# تشغيل
bash scan_multiple.sh
```

---

## الموارد

### الوثائق
- [Python Documentation](https://docs.python.org)
- [Node.js Documentation](https://nodejs.org/docs)
- [Docker Documentation](https://docs.docker.com)
- [PostgreSQL Documentation](https://postgresql.org/docs)

### الأدوات
- [Claude AI](https://anthropic.com/claude)
- [OWASP Top 10](https://owasp.org/www-project-top-ten/)
- [CWE Top 25](https://cwe.mitre.org/top25/)

---

**نسخة**: 1.0.0  
**التاريخ**: 2026-03-16  
**الحالة**: جاهز للإنتاج ✅
