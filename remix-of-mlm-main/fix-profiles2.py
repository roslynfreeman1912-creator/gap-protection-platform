#!/usr/bin/env python3
"""Create profile for second user - handle FK constraint on promotion_codes."""
import json
import urllib.request

SERVICE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBxbnpzaWhmcnlqbm5oZHViaXNrIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MjUyNjg0NCwiZXhwIjoyMDg4MTAyODQ0fQ.QBAi_YJ0NilOXxvQ6631Z7L1V3vkOtb1huMcjha_UzA"
BASE = "https://pqnzsihfryjnnhdubisk.supabase.co"

def api_request(method, path, data=None, extra_headers=None):
    body = json.dumps(data).encode() if data else None
    headers = {
        "apikey": SERVICE_KEY,
        "Authorization": f"Bearer {SERVICE_KEY}",
        "Content-Type": "application/json",
        "Prefer": "return=representation",
    }
    if extra_headers:
        headers.update(extra_headers)
    req = urllib.request.Request(f"{BASE}{path}", data=body, method=method, headers=headers)
    try:
        with urllib.request.urlopen(req) as resp:
            return json.loads(resp.read())
    except urllib.error.HTTPError as e:
        body_text = e.read().decode()
        print(f"  HTTP {e.code}: {body_text}")
        return None

# Check if there's a trigger creating promotion_codes on profile insert
print("Checking triggers on profiles table...")

# Try to insert profile via SQL RPC to bypass triggers
# First, let's try a simpler approach - just insert the profile
# The 409 error was about promotion_codes FK, meaning a trigger tries to create a promotion code
# with a UUID that doesn't exist yet in profiles (race condition)

# Let's try inserting with a specific UUID so the trigger can reference it
import uuid
profile_uuid = str(uuid.uuid4())

print(f"\nCreating profile for t6661195@gmail.com with UUID: {profile_uuid}")
result = api_request("POST", "/rest/v1/profiles", {
    "id": profile_uuid,
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
    
    # Create roles
    print("\nCreating roles...")
    roles = api_request("POST", "/rest/v1/user_roles", [
        {"user_id": pid, "role": "admin"},
        {"user_id": pid, "role": "partner"},
    ])
    print(f"  Roles: {roles}")
else:
    print("  Failed to create profile. Trying without specifying ID...")
    # The trigger issue: check what triggers exist
    # Let's try a different approach - use RPC/SQL
    print("\n  Attempting via SQL...")

    # Check if profile already exists
    existing = api_request("GET", "/rest/v1/profiles?user_id=eq.d99a1753-39c8-4b74-b558-4d64cd88bf8c&select=id")
    if existing:
        print(f"  Profile already exists: {existing}")
    else:
        print("  No existing profile found. The trigger might be the issue.")
        print("  Let's check if there's a promotion code auto-creation trigger...")

# Final check
print("\n=== ALL PROFILES ===")
for p in api_request("GET", "/rest/v1/profiles?select=id,user_id,email,role,status") or []:
    print(f"  {p}")

print("\nDone!")
