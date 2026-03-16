#!/usr/bin/env python3
import json, urllib.request

KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBxbnpzaWhmcnlqbm5oZHViaXNrIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MjUyNjg0NCwiZXhwIjoyMDg4MTAyODQ0fQ.QBAi_YJ0NilOXxvQ6631Z7L1V3vkOtb1huMcjha_UzA"
BASE = "https://pqnzsihfryjnnhdubisk.supabase.co"

def api(method, path, data=None):
    body = json.dumps(data).encode() if data else None
    req = urllib.request.Request(f"{BASE}{path}", data=body, method=method,
        headers={"apikey": KEY, "Authorization": f"Bearer {KEY}", "Content-Type": "application/json", "Prefer": "return=representation"})
    try:
        with urllib.request.urlopen(req) as r:
            return r.status, json.loads(r.read())
    except urllib.error.HTTPError as e:
        return e.code, e.read().decode()

# Check auth users
status, data = api("GET", "/auth/v1/admin/users?page=1&per_page=50")
print("=== AUTH USERS ===")
for u in data.get("users", []):
    uid = u["id"]
    email = u.get("email", "?")
    confirmed = u.get("email_confirmed_at", "no")
    print(f"  {uid} | {email} | confirmed: {confirmed}")

# Check profiles
status, data = api("GET", "/rest/v1/profiles?select=id,user_id,email,role,status")
print("\n=== PROFILES ===")
if isinstance(data, list):
    for p in data:
        print(f"  {p}")

# Check user_roles
status, data = api("GET", "/rest/v1/user_roles?select=*")
print("\n=== USER ROLES ===")
if isinstance(data, list):
    for r in data:
        print(f"  {r}")

# Create profile for 9432db08
NEW_UID = "9432db08-8dad-4279-97ca-8dd9b6175392"
print(f"\n=== CREATING PROFILE for {NEW_UID} ===")

# First get this user's email from auth
for u in data if isinstance(data, list) else []:
    pass

# Re-fetch auth users to find email
status2, data2 = api("GET", "/auth/v1/admin/users?page=1&per_page=50")
target_email = "unknown@example.com"
for u in data2.get("users", []):
    if u["id"] == NEW_UID:
        target_email = u.get("email", "unknown@example.com")
        print(f"  Found email: {target_email}")
        break

status, result = api("POST", "/rest/v1/profiles", {
    "user_id": NEW_UID,
    "email": target_email,
    "first_name": "Admin",
    "last_name": "User",
    "role": "admin",
    "status": "active",
    "terms_accepted": True,
    "privacy_accepted": True,
})
print(f"  Profile create: HTTP {status}")
if isinstance(result, list) and result:
    pid = result[0]["id"]
    print(f"  Profile ID: {pid}")
    
    # Create roles
    status, roles = api("POST", "/rest/v1/user_roles", [
        {"user_id": pid, "role": "admin"},
        {"user_id": pid, "role": "partner"},
    ])
    print(f"  Roles create: HTTP {status}")
elif isinstance(result, dict) and result.get("id"):
    pid = result["id"]
    print(f"  Profile ID: {pid}")
    status, roles = api("POST", "/rest/v1/user_roles", [
        {"user_id": pid, "role": "admin"},
        {"user_id": pid, "role": "partner"},
    ])
    print(f"  Roles create: HTTP {status}")
else:
    print(f"  Result: {result}")

# Final check
print("\n=== FINAL PROFILES ===")
status, data = api("GET", "/rest/v1/profiles?select=id,user_id,email,role,status,promotion_code")
if isinstance(data, list):
    for p in data:
        print(f"  {p}")
