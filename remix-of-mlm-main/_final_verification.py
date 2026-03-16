"""Final end-to-end verification of all MLM dashboard functionality."""
import requests, json, time

BASE = "https://pqnzsihfryjnnhdubisk.supabase.co/functions/v1/mlm-dashboard"
ANON = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBxbnpzaWhmcnlqbm5oZHViaXNrIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzI1MjY4NDQsImV4cCI6MjA4ODEwMjg0NH0.17hnhswPIqxvqiV40TPQEQK5F16ywJqJhiXclPCpj-A"

passed = 0
failed = 0
errors = []

def call(action, token=None, **kwargs):
    h = {"Content-Type": "application/json", "apikey": ANON}
    if token:
        h["Authorization"] = f"Bearer {token}"
    body = {"action": action, **kwargs}
    r = requests.post(BASE, json=body, headers=h)
    return r.status_code, r.json()

def test(name, expected_code, actual_code, data):
    global passed, failed, errors
    ok = actual_code == expected_code
    status = "PASS" if ok else "FAIL"
    print(f"  [{status}] {name}: {actual_code}")
    if ok:
        passed += 1
    else:
        failed += 1
        errors.append(f"{name}: expected {expected_code}, got {actual_code} - {json.dumps(data)[:200]}")

print("=" * 70)
print("MLM DASHBOARD - FINAL END-TO-END VERIFICATION")
print("=" * 70)

# 1. Login
print("\n--- Authentication ---")
code, data = call("login", username="thomas", password="galal123")
test("Login", 200, code, data)
token = data.get("access_token") if code == 200 else None
if token:
    print(f"    Version: {data.get('_version')}")

# 2. Overview
print("\n--- Dashboard Views ---")
code, data = call("overview", token)
test("Overview", 200, code, data)
if code == 200:
    print(f"    isSuperAdmin: {data.get('isSuperAdmin')}, profile.role: {data.get('profile', {}).get('role')}")

# 3. Stats
code, data = call("stats", token)
test("Stats", 200, code, data)

# 4. Downline
code, data = call("downline", token)
test("Downline", 200, code, data)

# 5. Tree
code, data = call("tree", token)
test("Tree", 200, code, data)

# 6. Commissions
code, data = call("commissions", token)
test("Commissions", 200, code, data)

# 7. Add Partner
print("\n--- CRUD Operations ---")
ts = int(time.time())
code, data = call("add-partner", token, partnerData={
    "first_name": "Final",
    "last_name": "Test",
    "email": f"finaltest_{ts}@test.example",
    "phone": "0171234567",
    "city": "Frankfurt",
    "street": "Mainstraße",
    "house_number": "10",
    "postal_code": "60311",
})
test("Add Partner", 201, code, data)
partner_id = data.get("partner", {}).get("id") if code == 201 else None
if partner_id:
    print(f"    Partner: {data['partner']['first_name']} {data['partner']['last_name']}, #{data['partner']['partner_number']}")

# 8. Edit Partner
if partner_id:
    code, data = call("edit-partner", token, partnerId=partner_id, partnerData={
        "first_name": "FinalEdited",
        "last_name": "TestEdited",
        "city": "München",
        "phone": "0179876543",
    })
    test("Edit Partner", 200, code, data)

# 9. Delete Partner  
if partner_id:
    code, data = call("delete-partner", token, partnerId=partner_id)
    test("Delete Partner", 200, code, data)

# 10. Edit Profile
print("\n--- Profile Management ---")
code, data = call("edit-profile", token, profileData={
    "phone": "0176555444",
    "city": "Berlin",
    "street": "Alexanderplatz",
    "house_number": "1",
    "postal_code": "10178",
})
test("Edit Profile", 200, code, data)

# 11. Change Credentials
code, data = call("change-credentials", token, newPassword="galal123")
test("Change Credentials", 200, code, data)

# Summary
print("\n" + "=" * 70)
print(f"RESULTS: {passed} passed, {failed} failed out of {passed + failed} tests")
if errors:
    print("\nFAILURES:")
    for e in errors:
        print(f"  {e}")
else:
    print("\nALL TESTS PASSED!")
print("=" * 70)
