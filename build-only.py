#!/usr/bin/env python3
"""
سكريبت بناء المشاريع فقط (بدون رفع)
"""

import os
import subprocess
import sys

def run_command(cmd, cwd=None):
    """تشغيل أمر shell"""
    print(f"🔧 تشغيل: {cmd}")
    result = subprocess.run(cmd, shell=True, cwd=cwd, capture_output=True, text=True)
    if result.returncode != 0:
        print(f"❌ خطأ: {result.stderr}")
        return False
    print(f"✅ نجح")
    return True

def main():
    print("🚀 بدء عملية البناء...")
    print("═" * 60)
    
    # 1. بناء لوحة الإدارة
    print("\n📦 الخطوة 1: بناء لوحة الإدارة...")
    print("-" * 60)
    
    if not os.path.exists("remix-of-mlm-main"):
        print("❌ مجلد remix-of-mlm-main غير موجود")
        return False
    
    print("تثبيت المكتبات...")
    if not run_command("npm install", cwd="remix-of-mlm-main"):
        print("⚠️ تحذير: فشل تثبيت المكتبات")
    
    print("بناء المشروع...")
    if not run_command("npm run build", cwd="remix-of-mlm-main"):
        print("❌ فشل بناء لوحة الإدارة")
        return False
    
    print("✅ تم بناء لوحة الإدارة")
    print(f"📁 الملفات في: remix-of-mlm-main/dist/")
    
    # 2. بناء الفاحص الأمني
    print("\n📦 الخطوة 2: بناء الفاحص الأمني...")
    print("-" * 60)
    
    if not os.path.exists("Python-Webify"):
        print("❌ مجلد Python-Webify غير موجود")
        return False
    
    print("تثبيت المكتبات...")
    if not run_command("npm install", cwd="Python-Webify"):
        print("⚠️ تحذير: فشل تثبيت المكتبات")
    
    print("بناء المشروع...")
    if not run_command("npm run build", cwd="Python-Webify"):
        print("❌ فشل بناء الفاحص الأمني")
        return False
    
    print("✅ تم بناء الفاحص الأمني")
    print(f"📁 الملفات في: Python-Webify/dist/")
    
    # النهاية
    print("\n" + "═" * 60)
    print("✅ تم البناء بنجاح!")
    print("═" * 60)
    print("\nالملفات الجاهزة:")
    print("  📁 remix-of-mlm-main/dist/ - لوحة الإدارة")
    print("  📁 Python-Webify/dist/ - الفاحص الأمني")
    print("\nالخطوات التالية:")
    print("  1. ارفع الملفات يدوياً عبر cPanel File Manager")
    print("  2. أو استخدم FileZilla")
    print("  3. راجع DEPLOY_ALTERNATIVES_AR.md للتفاصيل")
    print("═" * 60)
    
    return True

if __name__ == "__main__":
    try:
        success = main()
        sys.exit(0 if success else 1)
    except KeyboardInterrupt:
        print("\n\n⚠️ تم إلغاء العملية")
        sys.exit(1)
    except Exception as e:
        print(f"\n❌ خطأ غير متوقع: {e}")
        sys.exit(1)
