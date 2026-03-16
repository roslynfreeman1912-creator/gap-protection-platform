#!/usr/bin/env python3
"""Check profiles and auth users in Supabase."""
import json
import urllib.request

SERVICE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBxbnpzaWhmcnlqbm5oZHViaXNrIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MjUyNjg0NCwiZXhwIjoyMDg4MTAyODQ0fQ.QBAi_YJ0NilOXxvQ6631Z7L1V3vkOtb1huMcjha_UzA"
BASE = "https://pqnzsihfryjnnhdubisk.supabase.co"

def api_get(path):
    req = urllib.request.Request(
        f"{BASE}{path}", method="GET",
        headers={
            "apikey": SERVICE_KEY,
            "Authorization": f"Bearer {SERVICE_KEY}",
            "Content-Type": "application/json",
        }
    )
    with urllib.request.urlopen(req) as resp:
        return json.loads(resp.read())

print("=== ALL PROFILES ===")
for p in api_get("/rest/v1/profiles?select=id,user_id,email,role,status"):
    print(f"  {p}")

print("\n=== AUTH USERS ===")
users = api_get("/auth/v1/admin/users")["users"]
for u in users:
    uid = u["id"]
    email = u["email"]
    print(f"  id={uid}  email={email}")

print(f"\n=== Checking user 2eda7dff-82c1-440f-84b1-5468e423b308 ===")
target = "2eda7dff-82c1-440f-84b1-5468e423b308"
for u in users:
    if u["id"] == target:
        print(f"  Found in auth: email={u['email']}")
        break
else:
    print("  NOT found in auth.users")

profiles = api_get("/rest/v1/profiles?select=*&user_id=eq." + target)
if profiles:
    print(f"  Profile exists: {profiles}")
else:
    print("  NO profile row for this user_id")
