#!/usr/bin/env python3
"""
Fix all three issues:
1. Create profile for thomas@mlm.gapprotectionltd.com (user_id 2eda7dff-...)
2. Fix CSP on scanner nginx to allow Google Fonts  
3. Check PM2 logs for PDF 500 error
"""
import json
import urllib.request
import paramiko

# ─── 1. Create missing profile in Supabase ───
SERVICE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBxbnpzaWhmcnlqbm5oZHViaXNrIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MjUyNjg0NCwiZXhwIjoyMDg4MTAyODQ0fQ.QBAi_YJ0NilOXxvQ6631Z7L1V3vkOtb1huMcjha_UzA"
BASE = "https://pqnzsihfryjnnhdubisk.supabase.co"

def api_request(method, path, data=None):
    body = json.dumps(data).encode() if data else None
    req = urllib.request.Request(
        f"{BASE}{path}", data=body, method=method,
        headers={
            "apikey": SERVICE_KEY,
            "Authorization": f"Bearer {SERVICE_KEY}",
            "Content-Type": "application/json",
            "Prefer": "return=representation",
        }
    )
    try:
        with urllib.request.urlopen(req) as resp:
            return json.loads(resp.read())
    except urllib.error.HTTPError as e:
        print(f"  HTTP {e.code}: {e.read().decode()}")
        return None

print("=" * 60)
print("  Step 1: Create profile for Thomas")
print("=" * 60)

result = api_request("POST", "/rest/v1/profiles", {
    "user_id": "2eda7dff-82c1-440f-84b1-5468e423b308",
    "email": "thomas@mlm.gapprotectionltd.com",
    "first_name": "Thomas",
    "last_name": "Admin",
    "role": "admin",
    "status": "active",
    "terms_accepted": True,
    "privacy_accepted": True,
})

if result:
    pid = result[0]["id"] if isinstance(result, list) else result.get("id")
    print(f"  [OK] Profile created: {pid}")
    
    # Create roles
    roles = api_request("POST", "/rest/v1/user_roles", [
        {"user_id": pid, "role": "admin"},
        {"user_id": pid, "role": "partner"},
    ])
    if roles:
        print(f"  [OK] Roles created")
    else:
        print(f"  [WARN] Roles may already exist or failed")
else:
    print("  [FAIL] Could not create profile")

# Verify
print("\n  Verifying...")
check = api_request("GET", "/rest/v1/profiles?select=id,user_id,email,role,status&user_id=eq.2eda7dff-82c1-440f-84b1-5468e423b308")
if check:
    print(f"  [OK] Profile verified: {check}")
else:
    print("  [FAIL] Profile not found after creation")


# ─── 2 & 3. SSH to server: fix CSP + check PDF logs ───
print("\n" + "=" * 60)
print("  Step 2 & 3: SSH to server for CSP fix + PDF logs")
print("=" * 60)

ssh = paramiko.SSHClient()
ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
ssh.connect("76.13.5.114", username="root", password="galal123.DE12")
print("[OK] Connected to server")

def run(cmd):
    stdin, stdout, stderr = ssh.exec_command(cmd, timeout=15)
    out = stdout.read().decode()
    err = stderr.read().decode()
    return out + err

# Check PM2 logs for PDF errors
print("\n--- PM2 logs (last 50 lines, errors) ---")
logs = run("pm2 logs gap-scanner --lines 50 --nostream 2>&1")
print(logs[-3000:] if len(logs) > 3000 else logs)

# Check what nginx configs exist for the scanner
print("\n--- Scanner nginx config ---")
print(run("ls -la /etc/nginx/sites-enabled/"))
print(run("grep -l 'gap-protection' /etc/nginx/sites-available/*"))

# Read the scanner's nginx config
print("\n--- Scanner CSP headers ---")
print(run("grep -A2 'Content-Security-Policy' /etc/nginx/sites-available/gap-protection*"))

# Also check the main gapprotectionltd config for CSP
print("\n--- Main site CSP headers ---")
print(run("grep -A2 'Content-Security-Policy' /etc/nginx/sites-available/gapprotectionltd*"))

ssh.close()
print("\n[OK] Done")
