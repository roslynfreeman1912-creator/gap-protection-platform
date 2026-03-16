#!/bin/bash
# =============================================
# GAP Protection — GitHub Upload Script
# =============================================
# قبل التشغيل: غيّر GITHUB_USER و REPO_NAME
# =============================================

GITHUB_USER="YOUR_GITHUB_USERNAME"   # ← غيّر هذا
REPO_NAME="gap-protection-platform"  # ← غيّر هذا إذا أردت
BRANCH="main"

echo "=== GAP Protection — GitHub Push ==="
echo "User: $GITHUB_USER"
echo "Repo: $REPO_NAME"
echo ""

# 1. إعداد git config
git config user.name "$GITHUB_USER"
git config user.email "$GITHUB_USER@users.noreply.github.com"

# 2. إضافة كل الملفات
git add -A

# 3. Commit
git commit -m "feat: GAP Protection Platform — MLM + Cybersecurity Scanner

- MLM Vertriebssystem (React + TypeScript + Supabase)
  - Rolling 5-Level Sliding Window Provisionsmodell
  - 17 Frontend-Seiten
  - 60 Edge Functions
  - 50 SQL-Migrations
  - Wallet, CRM, Broker, CallCenter, Accounting
  - KI-Chat, WAF, SIEM, Fraud Detection

- Python-Webify Cybersecurity Scanner
  - 8 Scanner-Module
  - 11.445 YAML-Vulnerability-Templates
  - Flask REST-API + React Frontend
  - PDF-Berichte auf Deutsch"

# 4. Remote hinzufügen (falls noch nicht vorhanden)
git remote remove origin 2>/dev/null || true
git remote add origin "https://github.com/$GITHUB_USER/$REPO_NAME.git"

# 5. Push
echo ""
echo "Pushing to GitHub..."
git push -u origin $BRANCH

echo ""
echo "=== Fertig! ==="
echo "URL: https://github.com/$GITHUB_USER/$REPO_NAME"
