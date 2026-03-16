import urllib.request, ssl, re

ctx = ssl.create_default_context()
ctx.check_hostname = False
ctx.verify_mode = ssl.CERT_NONE

def get(url):
    req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0"})
    resp = urllib.request.urlopen(req, context=ctx, timeout=15)
    return resp.read().decode('utf-8', errors='ignore')

# الموقع الحي
print("=== مقارنة الإصدارات ===\n")

live = get("https://gapprotectionltd.com/")
live_js = re.findall(r'/assets/(index-[^"\']+\.js)', live)
live_css = re.findall(r'/assets/(index-[^"\']+\.css)', live)
print(f"🌐 الموقع الحي (gapprotectionltd.com):")
print(f"   JS:  {live_js}")
print(f"   CSS: {live_css}")

# المحلي
from pathlib import Path
local = (Path("remix-of-mlm-main/dist/index.html")).read_text(encoding='utf-8', errors='ignore')
local_js = re.findall(r'/assets/(index-[^"\']+\.js)', local)
local_css = re.findall(r'/assets/(index-[^"\']+\.css)', local)
print(f"\n💻 المحلي (remix-of-mlm-main/dist):")
print(f"   JS:  {local_js}")
print(f"   CSS: {local_css}")

same = set(live_js) == set(local_js)
print(f"\n{'✅ نفس الإصدار - لا يحتاج تحديث!' if same else '🔄 إصدار مختلف - يحتاج رفع'}")

if not same:
    print("\n⚠️  الإصدار المحلي أحدث من الموقع الحي")
    print("   يجب رفع الملفات يدوياً عبر cPanel")
