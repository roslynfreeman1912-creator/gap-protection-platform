#!/usr/bin/env python3
"""Check auth users and profiles in Supabase."""
import json
import urllib.request

SERVICE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBxbnpzaWhmcnlqbm5oZHViaXNrIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MjUyNjg0NCwiZXhwIjoyMDg4MTAyODQ0fQ.QBAi_YJ0NilOXxvQ6631Z7L1V3vkOtb1huMcjha_UzA"
BASE = "https://pqnzsihfryjnnhdubisk.supabase.co"

def api_get(path):
    req = urllib.request.Request(
        f"{BASE}{path}",
        headers={
            "apikey": SERVICE_KEY,
            "Authorization": f"Bearer {SERVICE_KEY}",
        }
    )
    with urllib.request.urlopen(req) as resp:
        return json.loads(resp.read())

# Auth users
print("=== AUTH USERS ===")
users_data = api_get("/auth/v1/admin/users?page=1&per_page=20")
users = users_data.get("users", [])
for u in users:
    confirmed = "YES" if u.get("email_confirmed_at") else "NO"
    print(f"  {u['id']} | {u['email']} | confirmed={confirmed}")

# Profiles
print("\n=== PROFILES ===")
profiles = api_get("/rest/v1/profiles?select=id,user_id,email,role,status,first_name,last_name")
for p in profiles:
    print(f"  profile_id={p['id']} | user_id={p['user_id']} | {p['email']} | role={p['role']} | status={p['status']}")

# User roles
print("\n=== USER_ROLES ===")
try:
    roles = api_get("/rest/v1/user_roles?select=*")
    for r in roles:
        print(f"  {r}")
except Exception as e:
    print(f"  Error: {e}")

# Promotion codes
print("\n=== PROMOTION_CODES ===")
try:
    codes = api_get("/rest/v1/promotion_codes?select=id,code,partner_id,is_active&limit=10")
    for c in codes:
        print(f"  {c}")
except Exception as e:
    print(f"  Error: {e}")

print("\nDone!")
