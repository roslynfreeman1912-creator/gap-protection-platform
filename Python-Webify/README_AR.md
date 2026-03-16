# 🛡️ GAP PROTECTION - ماسح أمني احترافي للمؤسسات

**أداة تقييم الثغرات الأمنية الاحترافية للبنوك ومراكز الاتصال والبنية التحتية الحرجة**

[![الترخيص](https://img.shields.io/badge/license-Professional-blue.svg)](LICENSE)
[![Python](https://img.shields.io/badge/python-3.11+-green.svg)](https://python.org)
[![الحالة](https://img.shields.io/badge/status-Production-brightgreen.svg)]()

---

## 🌟 نظرة عامة

GAP Protection Security Scanner هو **أداة تقييم ثغرات أمنية على مستوى المؤسسات** مصممة خصيصاً لـ:

- 🏦 **المؤسسات المصرفية**
- 📞 **مراكز الاتصال**
- 🏢 **الشركات الكبرى**
- 🔒 **البنية التحتية الحرجة**

مع **56,115 payload للثغرات الأمنية** وآليات تحقق متقدمة، توفر هذه الأداة تقييمات أمنية شاملة مع تقارير احترافية ثنائية اللغة (ألماني/إنجليزي).

---

## ✨ الميزات الرئيسية

### 🔍 كشف شامل للثغرات الأمنية

- ✅ **SQL Injection** (Union, Boolean, Time-based, Error-based)
- ✅ **Cross-Site Scripting (XSS)** (Reflected, Stored, DOM-based)
- ✅ **Local/Remote File Inclusion (LFI/RFI)**
- ✅ **Command Injection & RCE**
- ✅ **Server-Side Request Forgery (SSRF)**
- ✅ **XML External Entity (XXE)**
- ✅ **Server-Side Template Injection (SSTI)**
- ✅ **Insecure Deserialization**
- ✅ **JWT Vulnerabilities**
- ✅ **CORS Misconfiguration**
- ✅ **CSRF Attacks**
- ✅ **IDOR (Insecure Direct Object Reference)**
- ✅ **وأكثر من 20 نوع ثغرة أخرى**

### 🎯 قدرات كشف متقدمة

- 🔐 **اكتشاف لوحات الإدارة** (أكثر من 100 مسار شائع)
- 📄 **كشف الملفات الحساسة** (configs, backups, .env, .git, إلخ)
- ✔️ **التحقق من الثغرات** مع إثبات المفهوم
- 📊 **تسجيل CVSS** لتقييم المخاطر
- 🌐 **قاعدة بيانات Payloads** مع 56,115 ناقل هجوم

### 📑 تقارير احترافية

- 🇩🇪 **تقارير ألمانية** (Sicherheitsbewertungsbericht)
- 🇬🇧 **تقارير إنجليزية** (Security Assessment Report)
- 📈 **حساب درجة المخاطر** (مقياس 0-10)
- 🎨 **علامة تجارية للشركة** (شعارك وألوانك)
- 📝 **أدلة الاستغلال** (كيف يستغل المخترقون الثغرات)
- 🔧 **خطوات المعالجة** (مع أمثلة الكود)
- 📊 **ملخص تنفيذي** للإدارة
- 🔬 **نتائج تقنية مفصلة** للمطورين

---

## 📋 الجديد في الإصدار 1.0.0

### 🔒 تحسينات أمنية
- ✅ التحقق من صحة URLs لمنع هجمات SSRF
- ✅ إزالة مفاتيح API المكشوفة
- ✅ التكوين المعتمد على البيئة
- ✅ تنظيف المدخلات
- ✅ نظام تسجيل منظم

### 🏗️ البنية التحتية
- ✅ دعم Docker مع Docker Compose
- ✅ سكريبتات إعداد تلقائية (Windows/Linux/Mac)
- ✅ خط أنابيب CI/CD مع GitHub Actions
- ✅ سكريبتات تهيئة قاعدة البيانات
- ✅ نقاط فحص الصحة

### 📝 التوثيق
- ✅ قائمة تحقق نشر الإنتاج
- ✅ سياسة الأمان
- ✅ سجل تغييرات شامل
- ✅ إرشادات المساهمة

### 🧪 الاختبارات
- ✅ اختبارات وحدة للوحدات الأساسية
- ✅ إعداد تغطية الاختبار
- ✅ اختبار تلقائي في CI/CD

---

## 🚀 البدء السريع

### المتطلبات الأساسية

```bash
# Python 3.11 أو أحدث
python --version

# Node.js 18+ (لواجهة الويب)
node --version
```

### التثبيت

#### إعداد تلقائي (موصى به)

```bash
# الانتقال إلى المشروع
cd Python-Webify

# تشغيل سكريبت الإعداد
npm run setup
# أو على Windows: scripts\setup.bat
# أو على Linux/Mac: bash scripts/setup.sh

# تحرير .env بمفاتيح API الخاصة بك
nano .env
```

#### إعداد يدوي

```bash
# تثبيت تبعيات Python
pip install -e .

# تثبيت تبعيات Node
npm install

# نسخ قالب البيئة
cp .env.example .env

# تحرير .env بالتكوين الخاص بك
```

### الاستخدام الأساسي

```bash
# تشغيل فحص شامل
python advanced_scanner.py https://target-website.com

# أو استخدام سير العمل الكامل
python complete_scan.py https://target-website.com "اسم العميل"

# مثال لبنك
python complete_scan.py https://bank-example.com "البنك الوطني"

# مثال لمركز اتصال
python complete_scan.py https://callcenter-example.com "خدمة العملاء"
```

### نشر Docker

```bash
# بناء وتشغيل مع Docker Compose
npm run docker:up

# عرض السجلات
npm run docker:logs

# إيقاف الخدمات
npm run docker:down
```

---

## 📂 هيكل المشروع

```
Python-Webify/
├── vuln/                          # 56,115 payload للثغرات
├── utils/                         # أدوات مساعدة
│   ├── url_validator.py          # التحقق من URLs
│   └── logger.py                 # نظام التسجيل
├── scripts/                       # سكريبتات الإعداد
│   ├── setup.sh                  # Linux/Mac
│   ├── setup.bat                 # Windows
│   ├── setup.js                  # Node.js
│   └── init_db.sql               # قاعدة البيانات
├── tests/                         # الاختبارات
│   ├── test_url_validator.py
│   └── test_logger.py
├── advanced_scanner.py            # محرك الماسح الأساسي
├── pdf_report_generator.py        # تقارير PDF ثنائية اللغة
├── complete_scan.py               # سير عمل الفحص المتكامل
├── health_check.py                # فحص الصحة
├── Dockerfile                     # تعريف الحاوية
├── docker-compose.yml             # إعداد متعدد الحاويات
├── .env.example                   # قالب البيئة
└── README_AR.md                   # هذا الملف
```

---

## 🔧 التكوين

### ملف البيئة (.env)

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
CORS_ORIGIN=https://yourdomain.com
```

---

## 📊 خيارات النشر

### 1. Docker (موصى به للإنتاج)

```bash
# إعداد
cp .env.example .env
# تحرير .env بمفاتيحك

# نشر
npm run docker:up

# مراقبة
npm run docker:logs

# إيقاف
npm run docker:down
```

### 2. نشر يدوي

```bash
# إعداد
npm run setup

# تكوين
nano .env

# بناء
npm run build

# تهيئة قاعدة البيانات (اختياري)
npm run db:push

# تشغيل
npm start
```

### 3. Hostinger

راجع `DEPLOYMENT.md` للتعليمات التفصيلية.

---

## 🧪 الاختبارات

### تشغيل الاختبارات

```bash
# جميع الاختبارات
pytest tests/

# مع التغطية
pytest --cov=. --cov-report=html

# اختبار محدد
pytest tests/test_url_validator.py -v
```

### فحوصات الصحة

```bash
# سكريبت Python
python health_check.py

# نقطة نهاية HTTP
curl http://localhost:5000/api/health

# صحة Docker
docker inspect gap_scanner | grep Health
```

---

## 📝 التوثيق

### الأدلة الرئيسية
- **README.md** - نظرة عامة كاملة (إنجليزي)
- **README_AR.md** - نظرة عامة كاملة (عربي)
- **QUICK_START_AR.md** - دليل البدء السريع (عربي)
- **DEPLOYMENT.md** - دليل النشر
- **PRODUCTION_CHECKLIST.md** - قائمة تحقق الإنتاج
- **SECURITY.md** - سياسة الأمان
- **CHANGELOG.md** - سجل التغييرات

### الملخصات
- **PRODUCTION_READY.md** - حالة الجاهزية للإنتاج
- **PRODUCTION_SUMMARY_AR.md** - ملخص الإنتاج (عربي)
- **FINAL_SUMMARY.md** - الملخص النهائي الشامل

---

## 🔒 الأمان

### أفضل الممارسات

1. **قبل الفحص**
   - ✅ احصل على إذن كتابي
   - ✅ احترم حدود المعدل
   - ✅ استخدم VPN/proxy للفحوصات الحساسة

2. **أثناء الفحص**
   - ✅ راقب استخدام الموارد
   - ✅ تجنب DoS غير المقصود
   - ✅ سجل جميع الأنشطة

3. **بعد الفحص**
   - ✅ أمّن التقارير
   - ✅ احذف البيانات القديمة
   - ✅ اتبع الإفصاح المسؤول

### الإبلاغ عن الثغرات

راجع `SECURITY.md` للحصول على تعليمات الإبلاغ عن الثغرات الأمنية.

---

## 🎯 الحالة

| المكون | الحالة | ملاحظات |
|--------|--------|---------|
| الماسح الأساسي | ✅ جاهز للإنتاج | مختبر بالكامل |
| التحقق من URL | ✅ جاهز للإنتاج | محمي من SSRF |
| المسجل | ✅ جاهز للإنتاج | تسجيل منظم |
| Docker | ✅ جاهز للإنتاج | بناء متعدد المراحل |
| CI/CD | ✅ جاهز للإنتاج | اختبار تلقائي |
| قاعدة البيانات | ✅ جاهز للإنتاج | PostgreSQL جاهز |
| التوثيق | ✅ جاهز للإنتاج | شامل |
| الاختبارات | ✅ جاهز للإنتاج | وحدة + تكامل |

---

## 📞 الدعم

### التوثيق
- **README.md** / **README_AR.md** - نظرة عامة
- **DEPLOYMENT.md** - دليل النشر
- **PRODUCTION_CHECKLIST.md** - قائمة التحقق
- **SECURITY.md** - سياسة الأمان
- **QUICK_START_AR.md** - البدء السريع

### الاتصال
- **البريد الإلكتروني**: security@gap-protection.com
- **المشاكل**: GitHub Issues
- **التوثيق**: في مجلد المشروع

---

## 🎉 الخلاصة

**GAP Protection Scanner v1.0.0 الآن جاهز للإنتاج!**

✅ تم حل جميع المشاكل الأمنية الحرجة
✅ تم تنفيذ بنية تحتية شاملة
✅ تم توفير توثيق كامل
✅ تم إنشاء إطار اختبار
✅ جاهز للأتمتة في النشر
✅ تم تفعيل قدرات المراقبة

**اتبع `PRODUCTION_CHECKLIST.md` للنشر الآمن.**

---

**الإصدار**: 1.0.0  
**الحالة**: جاهز للإنتاج ✅  
**التاريخ**: 2026-03-16  
**المطور**: GAP Protection GmbH

---

*للحصول على المساعدة في النشر، اتصل بـ: security@gap-protection.com*
