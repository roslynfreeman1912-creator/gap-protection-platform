#!/usr/bin/env python3
"""Create profile for t6661195@gmail.com after trigger fix."""
import json
import urllib.request

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

# Create profile
print("Creating profile for t6661195@gmail.com...")
result = api_request("POST", "/rest/v1/profiles", {
    "user_id": "d99a1753-39c8-4b74-b558-4d64cd88bf8c",
    "email": "t6661195@gmail.com",
    "first_name": "Taim",
    "last_name": "D",
    "role": "admin",
    "status": "active",
    "terms_accepted": True,
    "privacy_accepted": True,
})

if result:
    pid = result[0]["id"] if isinstance(result, list) else result.get("id")
    print(f"  Profile created: {pid}")
    
    print("Creating roles...")
    roles = api_request("POST", "/rest/v1/user_roles", [
        {"user_id": pid, "role": "admin"},
        {"user_id": pid, "role": "partner"},
    ])
    print(f"  Roles: {roles}")

# Final state
print("\n=== ALL PROFILES ===")
for p in api_request("GET", "/rest/v1/profiles?select=id,user_id,email,role,status,promotion_code") or []:
    print(f"  {p}")
print("\n=== ALL ROLES ===")
for r in api_request("GET", "/rest/v1/user_roles?select=*") or []:
    print(f"  {r}")
print("\n=== PROMO CODES ===")
for c in api_request("GET", "/rest/v1/promotion_codes?select=id,code,partner_id,is_active") or []:
    print(f"  {c}")
