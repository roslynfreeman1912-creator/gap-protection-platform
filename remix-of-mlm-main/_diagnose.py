#!/usr/bin/env python3
"""Diagnose and fix MLM dashboard issues"""
import requests
import json

URL = 'https://pqnzsihfryjnnhdubisk.supabase.co'
SERVICE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBxbnpzaWhmcnlqbm5oZHViaXNrIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MjUyNjg0NCwiZXhwIjoyMDg4MTAyODQ0fQ.QBAi_YJ0NilOXxvQ6631Z7L1V3vkOtb1huMcjha_UzA'
ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBxbnpzaWhmcnlqbm5oZHViaXNrIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzI1MjY4NDQsImV4cCI6MjA4ODEwMjg0NH0.17hnhswPIqxvqiV40TPQEQK5F16ywJqJhiXclPCpj-A'

def main():
    # 1. List all auth users
    print("=" * 60)
    print("STEP 1: List all users")
    print("=" * 60)
    r = requests.get(f'{URL}/auth/v1/admin/users',
                     headers={'Authorization': f'Bearer {SERVICE_KEY}', 'apikey': SERVICE_KEY})
    users = r.json().get('users', [])
    for u in users:
        email = u.get('email', '')
        uid = u['id'][:12]
        confirmed = u.get('email_confirmed_at') is not None
        print(f"  {uid}... | {email} | confirmed={confirmed}")

    # 2. Find thomas
    thomas = next((u for u in users if u['email'] == 'thomas@mlm.gapprotectionltd.com'), None)
    if not thomas:
        print("\n[ERROR] Thomas user NOT found in auth!")
        return

    thomas_id = thomas['id']
    print(f"\nThomas found: {thomas_id}")
    print(f"  Metadata: {json.dumps(thomas.get('user_metadata', {}))}")
    print(f"  Confirmed: {thomas.get('email_confirmed_at')}")

    # 3. Reset password
    print("\n" + "=" * 60)
    print("STEP 2: Reset Thomas password")
    print("=" * 60)
    r2 = requests.put(f'{URL}/auth/v1/admin/users/{thomas_id}',
                      json={'password': 'galal123'},
                      headers={'Authorization': f'Bearer {SERVICE_KEY}', 'apikey': SERVICE_KEY})
    print(f"  Reset status: {r2.status_code}")
    if r2.status_code != 200:
        print(f"  Error: {r2.text[:300]}")

    # 4. Check Thomas profile in DB
    print("\n" + "=" * 60)
    print("STEP 3: Check Thomas profile")
    print("=" * 60)
    r3 = requests.get(f'{URL}/rest/v1/profiles?user_id=eq.{thomas_id}&select=*',
                      headers={'Authorization': f'Bearer {SERVICE_KEY}', 'apikey': SERVICE_KEY})
    profiles = r3.json()
    if profiles:
        p = profiles[0]
        print(f"  Profile ID: {p['id']}")
        print(f"  Name: {p.get('first_name')} {p.get('last_name')}")
        print(f"  Email: {p.get('email')}")
        print(f"  Role: {p.get('role')}")
        print(f"  Status: {p.get('status')}")
        print(f"  Partner#: {p.get('partner_number')}")
        
        # Check user_roles
        r4 = requests.get(f"{URL}/rest/v1/user_roles?user_id=eq.{p['id']}&select=*",
                          headers={'Authorization': f'Bearer {SERVICE_KEY}', 'apikey': SERVICE_KEY})
        roles = r4.json()
        print(f"  Roles: {[r['role'] for r in roles]}")
    else:
        print("  [ERROR] No profile found!")

    # 5. Test login
    print("\n" + "=" * 60)
    print("STEP 4: Test login")
    print("=" * 60)
    r5 = requests.post(f'{URL}/functions/v1/mlm-dashboard',
                       json={'action': 'login', 'username': 'thomas', 'password': 'galal123'},
                       headers={'apikey': ANON_KEY, 'Content-Type': 'application/json'})
    print(f"  Login status: {r5.status_code}")
    print(f"  Body: {r5.text[:500]}")

    if r5.status_code == 200:
        data = r5.json()
        token = data.get('access_token', '')
        version = data.get('_version', 'N/A')
        print(f"  Version: {version}")

        # 6. Test overview
        print("\n" + "=" * 60)
        print("STEP 5: Test overview")
        print("=" * 60)
        r6 = requests.post(f'{URL}/functions/v1/mlm-dashboard',
                           json={'action': 'overview'},
                           headers={'apikey': ANON_KEY, 'Content-Type': 'application/json',
                                    'Authorization': f'Bearer {token}'})
        print(f"  Overview status: {r6.status_code}")
        print(f"  Body: {r6.text[:500]}")

        # 7. Test stats
        print("\n" + "=" * 60)
        print("STEP 6: Test stats")
        print("=" * 60)
        r7 = requests.post(f'{URL}/functions/v1/mlm-dashboard',
                           json={'action': 'stats'},
                           headers={'apikey': ANON_KEY, 'Content-Type': 'application/json',
                                    'Authorization': f'Bearer {token}'})
        print(f"  Stats status: {r7.status_code}")
        print(f"  Body: {r7.text[:500]}")
    else:
        # Try direct auth login to see if it works
        print("\n  Testing direct auth login...")
        r_auth = requests.post(f'{URL}/auth/v1/token?grant_type=password',
                               json={'email': 'thomas@mlm.gapprotectionltd.com', 'password': 'galal123'},
                               headers={'apikey': ANON_KEY, 'Content-Type': 'application/json'})
        print(f"  Direct auth status: {r_auth.status_code}")
        print(f"  Body: {r_auth.text[:300]}")

if __name__ == '__main__':
    main()
