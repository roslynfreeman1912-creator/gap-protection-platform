#!/usr/bin/env python3
"""Fix Thomas profile: make super_admin, update partner_number, check roles."""
import json
import urllib.request

SERVICE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBxbnpzaWhmcnlqbm5oZHViaXNrIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MjUyNjg0NCwiZXhwIjoyMDg4MTAyODQ0fQ.QBAi_YJ0NilOXxvQ6631Z7L1V3vkOtb1huMcjha_UzA"
BASE = "https://pqnzsihfryjnnhdubisk.supabase.co"

def api(method, path, data=None):
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
    except Exception as e:
        if hasattr(e, 'read'):
            print(f"  Error: {e.read().decode()}")
        return None

THOMAS_PROFILE_ID = "79f3ca91-fc69-4337-a9d7-d04e9df886d1"
THOMAS_USER_ID = "2eda7dff-82c1-440f-84b1-5468e423b308"

# 1. Update profile to super_admin
print("1. Updating Thomas profile to super_admin...")
result = api("PATCH", f"/rest/v1/profiles?id=eq.{THOMAS_PROFILE_ID}", {
    "role": "super_admin",
    "partner_number": "1000",
})
if result:
    print(f"   [OK] Profile updated: role={result[0].get('role')}, partner_number={result[0].get('partner_number')}")

# 2. Check existing roles
print("\n2. Current roles for Thomas...")
roles = api("GET", f"/rest/v1/user_roles?user_id=eq.{THOMAS_PROFILE_ID}&select=*")
print(f"   Roles: {roles}")

# 3. Ensure super_admin role exists
print("\n3. Adding super_admin role...")
result = api("POST", "/rest/v1/user_roles", {"user_id": THOMAS_PROFILE_ID, "role": "super_admin"})
if result:
    print(f"   [OK] Role added")
else:
    print("   May already exist")

# 4. Verify final state
print("\n4. Final state...")
profile = api("GET", f"/rest/v1/profiles?id=eq.{THOMAS_PROFILE_ID}&select=*")
if profile:
    p = profile[0]
    print(f"   Profile: role={p['role']}, status={p['status']}, email={p['email']}, partner_number={p.get('partner_number')}")

roles = api("GET", f"/rest/v1/user_roles?user_id=eq.{THOMAS_PROFILE_ID}&select=*")
print(f"   Roles: {[r['role'] for r in roles] if roles else 'none'}")
