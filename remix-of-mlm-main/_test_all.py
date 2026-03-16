import requests, json, time

BASE = "https://pqnzsihfryjnnhdubisk.supabase.co/functions/v1/mlm-dashboard"
ANON = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBxbnpzaWhmcnlqbm5oZHViaXNrIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzI1MjY4NDQsImV4cCI6MjA4ODEwMjg0NH0.17hnhswPIqxvqiV40TPQEQK5F16ywJqJhiXclPCpj-A"

def call(action, token=None, **kwargs):
    h = {"Content-Type": "application/json", "apikey": ANON}
    if token:
        h["Authorization"] = f"Bearer {token}"
    body = {"action": action, **kwargs}
    r = requests.post(BASE, json=body, headers=h)
    return r.status_code, r.json()

# 1. Login
print("="*60)
print("1. LOGIN")
code, data = call("login", username="thomas", password="galal123")
print(f"   Status: {code}")
print(f"   Version: {data.get('_version', 'NOT FOUND')}")
if code != 200:
    print(f"   ERROR: {data}")
    exit(1)
token = data["access_token"]
print(f"   Token: ...{token[-20:]}")

# 2. Overview
print("\n2. OVERVIEW")
code, data = call("overview", token)
print(f"   Status: {code}")
if code == 200:
    print(f"   isSuperAdmin: {data.get('isSuperAdmin')}")
    print(f"   Total partners: {data.get('totalPartners')}")
else:
    print(f"   ERROR: {data}")

# 3. Stats
print("\n3. STATS")
code, data = call("stats", token)
print(f"   Status: {code}")
if code == 200:
    print(f"   Keys: {list(data.keys())[:5]}")
else:
    print(f"   ERROR: {data}")

# 4. Downline
print("\n4. DOWNLINE")
code, data = call("downline", token)
print(f"   Status: {code}")
if code == 200:
    partners = data.get("partners", [])
    print(f"   Partners count: {len(partners)}")
else:
    print(f"   ERROR: {data}")

# 5. Tree
print("\n5. TREE")
code, data = call("tree", token)
print(f"   Status: {code}")
if code == 200:
    print(f"   Keys: {list(data.keys())[:5]}")
else:
    print(f"   ERROR: {data}")

# 6. Commissions
print("\n6. COMMISSIONS")
code, data = call("commissions", token)
print(f"   Status: {code}")
if code == 200:
    print(f"   Keys: {list(data.keys())[:5]}")
else:
    print(f"   ERROR: {data}")

# 7. Add Partner
print("\n7. ADD PARTNER")
code, data = call("add-partner", token, partnerData={
    "first_name": "TestAuto",
    "last_name": "Partner",
    "email": f"testauto_{int(time.time())}@test.example",
    "phone": "0123456789",
    "city": "Berlin",
    "street": "Teststraße",
    "house_number": "42",
    "postal_code": "10115",
})
print(f"   Status: {code}")
if code in (200, 201):
    partner = data.get("partner", {})
    partner_id = partner.get("id")
    print(f"   Partner ID: {partner_id}")
    print(f"   Partner Number: {partner.get('partner_number')}")
    print(f"   Name: {partner.get('first_name')} {partner.get('last_name')}")
else:
    print(f"   ERROR: {data}")
    partner_id = None

# 8. Edit Partner
if partner_id:
    print("\n8. EDIT PARTNER")
    code, data = call("edit-partner", token, partnerId=partner_id, partnerData={
        "first_name": "TestAutoEdited",
        "last_name": "PartnerEdited",
        "city": "München",
    })
    print(f"   Status: {code}")
    if code == 200:
        print(f"   Updated: {data.get('partner', {}).get('first_name')} {data.get('partner', {}).get('last_name')}")
    else:
        print(f"   ERROR: {data}")

    # 9. Delete Partner
    print("\n9. DELETE PARTNER")
    code, data = call("delete-partner", token, partnerId=partner_id)
    print(f"   Status: {code}")
    if code == 200:
        print(f"   Success: {data.get('success')}")
    else:
        print(f"   ERROR: {data}")
else:
    print("\n8. EDIT PARTNER - SKIPPED (no partner_id)")
    print("9. DELETE PARTNER - SKIPPED (no partner_id)")

# 10. Edit Profile
print("\n10. EDIT PROFILE")
code, data = call("edit-profile", token, profileData={
    "phone": "0176999888",
    "city": "Hamburg",
})
print(f"   Status: {code}")
if code == 200:
    print(f"   Success: {data.get('success')}")
else:
    print(f"   ERROR: {data}")

# 11. Change Credentials
print("\n11. CHANGE CREDENTIALS")
code, data = call("change-credentials", token, newPassword="galal123")
print(f"   Status: {code}")
if code == 200:
    print(f"   Success: {data.get('success')}")
else:
    print(f"   ERROR: {data}")

print("\n" + "="*60)
print("ALL TESTS COMPLETE")
