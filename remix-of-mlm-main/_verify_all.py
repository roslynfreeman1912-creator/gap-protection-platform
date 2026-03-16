#!/usr/bin/env python3
"""Comprehensive test of all MLM dashboard features including settings"""
import requests
import json

URL = 'https://pqnzsihfryjnnhdubisk.supabase.co'
FN_URL = f'{URL}/functions/v1/mlm-dashboard'
ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBxbnpzaWhmcnlqbm5oZHViaXNrIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzI1MjY4NDQsImV4cCI6MjA4ODEwMjg0NH0.17hnhswPIqxvqiV40TPQEQK5F16ywJqJhiXclPCpj-A'

results = []

def test(name, action, extra=None, token=None, expected_status=200):
    headers = {'apikey': ANON_KEY, 'Content-Type': 'application/json'}
    if token:
        headers['Authorization'] = f'Bearer {token}'
    body = {'action': action}
    if extra:
        body.update(extra)
    r = requests.post(FN_URL, json=body, headers=headers)
    status = '✅ PASS' if r.status_code == expected_status else '❌ FAIL'
    results.append((name, r.status_code, expected_status, status))
    print(f"  {status} {name}: {r.status_code} (expected {expected_status})")
    if r.status_code != expected_status:
        print(f"    Body: {r.text[:300]}")
    return r

def main():
    print("=" * 60)
    print("COMPREHENSIVE MLM DASHBOARD TEST")
    print("=" * 60)
    
    # 1. Login
    print("\n--- Authentication ---")
    r = test("Login", "login", {"username": "thomas", "password": "galal123"})
    data = r.json()
    token = data.get('access_token', '')
    version = data.get('_version', 'N/A')
    print(f"    Version: {version}")
    
    if not token:
        print("\n❌ Cannot continue without token!")
        return

    # 2. Overview
    print("\n--- Overview ---")
    r = test("Overview", "overview", token=token)
    ov = r.json()
    print(f"    isSuperAdmin: {ov.get('isSuperAdmin')}")
    print(f"    Stats: {json.dumps(ov.get('stats', {}))}")
    
    # 3. Stats
    print("\n--- Stats ---")
    r = test("Stats", "stats", token=token)
    st = r.json()
    print(f"    CommissionRates: {json.dumps(st.get('commissionRates', {}))}")
    print(f"    Levels: {st.get('levels')}")

    # 4. Downline
    print("\n--- Downline ---")
    r = test("Downline", "downline", token=token)
    dl = r.json()
    print(f"    Downline count: {len(dl.get('downline', []))}")

    # 5. Tree
    print("\n--- Tree ---")
    r = test("Tree", "tree", token=token)
    
    # 6. Commissions
    print("\n--- Commissions ---")
    r = test("Commissions", "commissions", token=token)
    
    # 7. Get Settings
    print("\n--- Settings ---")
    r = test("Get Settings", "get-settings", token=token)
    settings = r.json()
    count = len(settings.get('settings', []))
    print(f"    Total settings: {count}")
    grouped = settings.get('grouped', {})
    for cat, items in grouped.items():
        print(f"    [{cat}]: {len(items)} items")

    # 8. Update Settings - change commission rate level 1 to 12
    print("\n--- Update Settings ---")
    r = test("Update Settings", "update-settings", {
        "settings": [
            {"key": "commission_rate_level_1", "value": 12}
        ]
    }, token=token)
    upd = r.json()
    print(f"    Updated: {upd.get('updated')}")

    # 9. Verify the change
    print("\n--- Verify Settings Change ---")
    r = test("Verify Stats", "stats", token=token)
    st2 = r.json()
    rate1 = st2.get('commissionRates', {}).get('1', 'N/A')
    print(f"    Level 1 rate: {rate1} (should be 12)")

    # 10. Revert back to 10
    print("\n--- Revert Settings ---")
    r = test("Revert Settings", "update-settings", {
        "settings": [
            {"key": "commission_rate_level_1", "value": 10}
        ]
    }, token=token)
    
    # 11. Add Partner
    print("\n--- Add Partner ---")
    r = test("Add Partner", "add-partner", {
        "partnerData": {
            "first_name": "TestSettings",
            "last_name": "Partner",
            "email": f"test-settings-verify@test.com"
        }
    }, token=token, expected_status=201)
    partner_id = None
    if r.status_code == 201:
        partner_id = r.json().get('partner', {}).get('id')
        print(f"    Partner ID: {partner_id}")

    # 12. Edit Partner
    if partner_id:
        print("\n--- Edit Partner ---")
        r = test("Edit Partner", "edit-partner", {
            "partnerId": partner_id,
            "partnerData": {"phone": "+49123456789"}
        }, token=token)

    # 13. Delete Partner
    if partner_id:
        print("\n--- Delete Partner ---")
        r = test("Delete Partner", "delete-partner", {
            "partnerId": partner_id
        }, token=token)

    # 14. Edit Profile
    print("\n--- Edit Profile ---")
    r = test("Edit Profile", "edit-profile", {
        "profileData": {"phone": "+491234567890"}
    }, token=token)

    # 15. Change Credentials (test only - change to same password)
    print("\n--- Change Credentials ---")
    r = test("Change Credentials", "change-credentials", {
        "newPassword": "galal123"
    }, token=token)

    # Summary
    print("\n" + "=" * 60)
    print("SUMMARY")
    print("=" * 60)
    passed = sum(1 for _, _, _, s in results if 'PASS' in s)
    total = len(results)
    print(f"\n  {passed}/{total} tests passed")
    for name, actual, expected, status in results:
        print(f"    {status} {name}")

    # Cleanup test partner auth user
    if partner_id:
        print("\n--- Cleanup ---")
        SERVICE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBxbnpzaWhmcnlqbm5oZHViaXNrIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MjUyNjg0NCwiZXhwIjoyMDg4MTAyODQ0fQ.QBAi_YJ0NilOXxvQ6631Z7L1V3vkOtb1huMcjha_UzA'
        # Get user_id from profile
        r = requests.get(f'{URL}/rest/v1/profiles?id=eq.{partner_id}&select=user_id',
                        headers={'Authorization': f'Bearer {SERVICE_KEY}', 'apikey': SERVICE_KEY})
        if r.status_code == 200 and r.json():
            uid = r.json()[0]['user_id']
            # Delete auth user
            requests.delete(f'{URL}/auth/v1/admin/users/{uid}',
                          headers={'Authorization': f'Bearer {SERVICE_KEY}', 'apikey': SERVICE_KEY})
            print(f"  Cleaned up test auth user {uid}")

if __name__ == '__main__':
    main()
