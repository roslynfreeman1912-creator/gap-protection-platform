#!/usr/bin/env python3
"""Fix scanner CSP (allow Google Fonts) and upload PDFKit font data files."""
import paramiko
import os
import stat

HOST = "76.13.5.114"
USER = "root"
PASS = "galal123.DE12"

ssh = paramiko.SSHClient()
ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
ssh.connect(HOST, username=USER, password=PASS)
sftp = ssh.open_sftp()
print("[OK] Connected")

def run(cmd):
    stdin, stdout, stderr = ssh.exec_command(cmd, timeout=15)
    return stdout.read().decode() + stderr.read().decode()


# ─── 1. Fix CSP on scanner nginx config ───
print("\n" + "=" * 60)
print("  Fix 1: Update scanner CSP to allow Google Fonts")
print("=" * 60)

# Read current config
config = run("cat /etc/nginx/sites-available/gap-protection.pro")

old_csp = "style-src 'self' 'unsafe-inline'"
new_csp = "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com data:"

if old_csp in config and "fonts.googleapis.com" not in config:
    # Backup first
    run("cp /etc/nginx/sites-available/gap-protection.pro /etc/nginx/sites-available/gap-protection.pro.bak")
    
    # Use sed to replace the CSP style-src
    sed_cmd = f"sed -i \"s|{old_csp}|{new_csp}|g\" /etc/nginx/sites-available/gap-protection.pro"
    result = run(sed_cmd)
    print(f"  sed result: {result or '(ok)'}")
    
    # Test nginx
    test = run("nginx -t 2>&1")
    print(f"  nginx test: {test.strip()}")
    
    if "successful" in test:
        run("systemctl reload nginx")
        print("  [OK] Nginx reloaded with updated CSP")
    else:
        print("  [FAIL] Nginx test failed, restoring backup")
        run("cp /etc/nginx/sites-available/gap-protection.pro.bak /etc/nginx/sites-available/gap-protection.pro")
else:
    if "fonts.googleapis.com" in config:
        print("  [SKIP] Google Fonts already allowed in CSP")
    else:
        print(f"  [WARN] Could not find expected CSP pattern. Manual fix needed.")


# ─── 2. Upload PDFKit font data files ───
print("\n" + "=" * 60)
print("  Fix 2: Upload PDFKit font data to server")
print("=" * 60)

local_data_dir = os.path.join(
    r"c:\Users\taimd\Documents\New folder\Python-Webify\node_modules\pdfkit\js\data"
)
remote_data_dir = "/var/www/gap-protection-pro/dist/data"

# Create remote dir
run(f"mkdir -p {remote_data_dir}")
print(f"  Created {remote_data_dir}")

# Upload all font files
count = 0
for fname in os.listdir(local_data_dir):
    local_path = os.path.join(local_data_dir, fname)
    if os.path.isfile(local_path):
        remote_path = f"{remote_data_dir}/{fname}"
        sftp.put(local_path, remote_path)
        count += 1
        print(f"  Uploaded: {fname}")

print(f"  [OK] {count} files uploaded")

# Verify
listing = run(f"ls -la {remote_data_dir}/")
print(f"\n  Remote listing:\n{listing}")

# Restart PM2 to pick up changes
print("\n  Restarting PM2...")
restart = run("pm2 restart gap-scanner 2>&1")
print(f"  {restart.strip()}")

# Quick verification
import time
time.sleep(2)
health = run("curl -s -o /dev/null -w 'HTTP %{http_code}' http://localhost:5000/")
print(f"\n  Health check: {health}")

sftp.close()
ssh.close()
print("\n[OK] All fixes applied")
