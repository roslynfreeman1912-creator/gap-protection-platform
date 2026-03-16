#!/usr/bin/env python3
"""Fix database: create profiles for real auth users and assign admin roles."""
import json
import urllib.request

SERVICE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBxbnpzaWhmcnlqbm5oZHViaXNrIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MjUyNjg0NCwiZXhwIjoyMDg4MTAyODQ0fQ.QBAi_YJ0NilOXxvQ6631Z7L1V3vkOtb1huMcjha_UzA"
BASE = "https://pqnzsihfryjnnhdubisk.supabase.co"

def api_request(method, path, data=None):
    body = json.dumps(data).encode() if data else None
    req = urllib.request.Request(
        f"{BASE}{path}",
        data=body,
        method=method,
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
        body = e.read().decode()
        print(f"  HTTP {e.code}: {body}")
        return None

# The real auth users
USERS = {
    "info@gap-protection.de": {
        "auth_id": "5f8bb53c-9dd0-4c30-a1d9-8b6472b57082",
        "first_name": "Gap",
        "last_name": "Protection",
        "role": "admin",
    },
    "t6661195@gmail.com": {
        "auth_id": "d99a1753-39c8-4b74-b558-4d64cd88bf8c",
        "first_name": "Taim",
        "last_name": "User",
        "role": "admin",
    },
}

# Step 1: Update the seeded profile to match the first real user (info@gap-protection.de)
print("Step 1: Update seeded profile to match info@gap-protection.de")
main_user = USERS["info@gap-protection.de"]
result = api_request("PATCH", 
    f"/rest/v1/profiles?id=eq.a0000000-0000-0000-0000-000000000001",
    {
        "user_id": main_user["auth_id"],
        "email": "info@gap-protection.de",
        "first_name": main_user["first_name"],
        "last_name": main_user["last_name"],
        "role": main_user["role"],
    }
)
print(f"  Result: {result}")

# Step 2: Update user_roles to use the correct profile ID
# First check what profile ID was assigned
print("\nStep 2: Check updated profile")
profiles = api_request("GET", "/rest/v1/profiles?select=id,user_id,email,role&user_id=eq." + main_user["auth_id"])
if profiles:
    profile_id = profiles[0]["id"]
    print(f"  Profile ID: {profile_id}")
    
    # Update user_roles
    print("\nStep 3: Update user_roles for admin")
    # Delete old roles
    api_request("DELETE", f"/rest/v1/user_roles?user_id=eq.a0000000-0000-0000-0000-000000000001")
    # Create new roles
    result = api_request("POST", "/rest/v1/user_roles", [
        {"user_id": profile_id, "role": "admin"},
        {"user_id": profile_id, "role": "partner"},
    ])
    print(f"  Roles created: {result}")

# Step 3: Create profile for second user (t6661195@gmail.com)
print("\nStep 4: Create profile for t6661195@gmail.com")
second_user = USERS["t6661195@gmail.com"]
result = api_request("POST", "/rest/v1/profiles", {
    "user_id": second_user["auth_id"],
    "email": "t6661195@gmail.com",
    "first_name": second_user["first_name"],
    "last_name": second_user["last_name"],
    "role": second_user["role"],
    "status": "active",
    "terms_accepted": True,
    "privacy_accepted": True,
})
if result:
    profile_id_2 = result[0]["id"] if isinstance(result, list) else result.get("id")
    print(f"  Profile created: {profile_id_2}")
    
    # Create roles
    if profile_id_2:
        print("\nStep 5: Create roles for second user")
        result = api_request("POST", "/rest/v1/user_roles", [
            {"user_id": profile_id_2, "role": "admin"},
            {"user_id": profile_id_2, "role": "partner"},
        ])
        print(f"  Roles created: {result}")

# Step 4: Create promotion code for the main admin
print("\nStep 6: Update promotion code partner_id")
# Update existing promotion code to use real profile ID
profiles_final = api_request("GET", "/rest/v1/profiles?select=id,user_id,email")
print(f"  Final profiles: {profiles_final}")

for p in (profiles_final or []):
    if p["email"] == "info@gap-protection.de":
        api_request("PATCH", 
            f"/rest/v1/promotion_codes?partner_id=eq.a0000000-0000-0000-0000-000000000001",
            {"partner_id": p["id"]}
        )
        print(f"  Updated promo code partner_id to {p['id']}")

# Verify final state
print("\n=== FINAL STATE ===")
print("\nProfiles:")
for p in api_request("GET", "/rest/v1/profiles?select=id,user_id,email,role,status") or []:
    print(f"  {p}")

print("\nUser Roles:")
for r in api_request("GET", "/rest/v1/user_roles?select=*") or []:
    print(f"  {r}")

print("\nPromotion Codes:")
for c in api_request("GET", "/rest/v1/promotion_codes?select=id,code,partner_id,is_active") or []:
    print(f"  {c}")

print("\nDone!")
