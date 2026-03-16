import urllib.request, ssl

ctx = ssl.create_default_context()
ctx.check_hostname = False
ctx.verify_mode = ssl.CERT_NONE

def get(url):
    req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0"})
    try:
        resp = urllib.request.urlopen(req, context=ctx, timeout=15)
        body = resp.read().decode('utf-8', errors='ignore')
        return resp.status, body
    except Exception as e:
        return 0, str(e)

print("=== فحص المواقع الحية ===\n")

# فحص gapprotectionltd.com
status, body = get("https://gapprotectionltd.com/")
print(f"🌐 gapprotectionltd.com: {status}")
if "<title>" in body:
    t = body[body.find("<title>")+7:body.find("</title>")]
    print(f"   Title: {t}")
# ابحث عن assets
import re
assets = re.findall(r'src="(/assets/[^"]+)"', body)[:3]
for a in assets:
    print(f"   Asset: {a}")

print()

# فحص gap-protection.pro
status2, body2 = get("https://gap-protection.pro/")
print(f"🛡️  gap-protection.pro: {status2}")
if "<title>" in body2:
    t2 = body2[body2.find("<title>")+7:body2.find("</title>")]
    print(f"   Title: {t2}")
assets2 = re.findall(r'src="(/assets/[^"]+)"', body2)[:3]
for a in assets2:
    print(f"   Asset: {a}")

print()

# فحص الملفات المبنية محلياً
from pathlib import Path
admin_dist = Path("remix-of-mlm-main/dist")
scanner_dist = Path("Python-Webify/dist")

print(f"📁 ملفات لوحة الإدارة المبنية: {len(list(admin_dist.rglob('*')))} ملف")
print(f"📁 ملفات الفاحص المبنية: {len(list(scanner_dist.rglob('*')))} ملف")

# قارن index.html
local_admin = (admin_dist / "index.html").read_text(encoding='utf-8', errors='ignore')
local_scanner = (scanner_dist / "index.html").read_text(encoding='utf-8', errors='ignore')

# استخرج hash من assets
local_admin_assets = re.findall(r'src="/assets/([^"]+)"', local_admin)[:3]
local_scanner_assets = re.findall(r'src="/assets/([^"]+)"', local_scanner)[:3]

print(f"\n📊 مقارنة الإصدارات:")
print(f"  Admin - محلي: {local_admin_assets}")
print(f"  Admin - حي:   {[a.split('/')[-1] for a in assets]}")
print(f"  Scanner - محلي: {local_scanner_assets}")
print(f"  Scanner - حي:   {[a.split('/')[-1] for a in assets2]}")

# هل هي نفس الإصدار؟
admin_same = set(local_admin_assets) == set([a.split('/')[-1] for a in assets])
scanner_same = set(local_scanner_assets) == set([a.split('/')[-1] for a in assets2])

print(f"\n{'✅' if admin_same else '🔄'} لوحة الإدارة: {'محدثة' if admin_same else 'تحتاج تحديث'}")
print(f"{'✅' if scanner_same else '🔄'} الفاحص الأمني: {'محدث' if scanner_same else 'يحتاج تحديث'}")
