"""Test MLM Dashboard API endpoints (local/manual).

WARNING:
- Reads Supabase URL and ANON key from environment.
"""
import os
import urllib.request, json, sys

BASE = os.getenv('SUPABASE_FUNCTION_MLM_DASHBOARD_URL', '').strip() or \
       (os.getenv('SUPABASE_URL', '').rstrip('/') + '/functions/v1/mlm-dashboard')
ANON = os.getenv('SUPABASE_ANON_KEY', '')

if not BASE or not ANON:
    raise SystemExit(
        "Set SUPABASE_URL or SUPABASE_FUNCTION_MLM_DASHBOARD_URL and SUPABASE_ANON_KEY "
        "in your environment before running this test."
    )

def call(action, token=None, extra=None):
    body = {'action': action}
    if extra:
        body.update(extra)
    headers = {'Content-Type': 'application/json', 'apikey': ANON}
    if token:
        headers['Authorization'] = f'Bearer {token}'
    req = urllib.request.Request(BASE, data=json.dumps(body).encode(), headers=headers)
    try:
        resp = urllib.request.urlopen(req)
        return json.loads(resp.read()), resp.status
    except urllib.error.HTTPError as e:
        body = e.read().decode()
        return json.loads(body) if body.startswith('{') else {'raw': body}, e.code

# 1. Login without Auth header (tests --no-verify-jwt)
print("=" * 50)
result, code = call('login', extra={'username': 'Thomas', 'password': 'Thomas123.DE'})
if 'access_token' in result:
    print(f"1. LOGIN (no Auth header): OK (HTTP {code})")
    token = result['access_token']
else:
    print(f"1. LOGIN (no Auth header): FAILED (HTTP {code}) - {result}")
    # Fallback: try with anon key in Auth
    headers_with_auth = {'Content-Type': 'application/json', 'apikey': ANON, 'Authorization': f'Bearer {ANON}'}
    req = urllib.request.Request(BASE, 
        data=json.dumps({'action':'login','username':'Thomas','password':'Thomas123.DE'}).encode(), 
        headers=headers_with_auth)
    resp = urllib.request.urlopen(req)
    result = json.loads(resp.read())
    token = result['access_token']
    print(f"   LOGIN (with Auth header): OK")

# 2. Overview
result, code = call('overview', token=token)
if code == 200:
    stats = result.get('stats', {})
    print(f"2. OVERVIEW: OK (HTTP {code})")
    print(f"   isSuperAdmin: {result.get('isSuperAdmin')}")
    print(f"   isStructureAdmin: {result.get('isStructureAdmin')}")
    print(f"   totalPartners: {stats.get('totalPartners')}")
    print(f"   activePartners: {stats.get('activePartners')}")
    print(f"   structures: {len(result.get('structures', []))}")
else:
    print(f"2. OVERVIEW: FAILED (HTTP {code}) - {result}")

# 3. Downline
result, code = call('downline', token=token)
if code == 200:
    print(f"3. DOWNLINE: OK (count={len(result.get('downline', []))})")
else:
    print(f"3. DOWNLINE: FAILED (HTTP {code}) - {result}")

# 4. Commissions
result, code = call('commissions', token=token)
if code == 200:
    print(f"4. COMMISSIONS: OK (count={len(result.get('commissions', []))})")
else:
    print(f"4. COMMISSIONS: FAILED (HTTP {code}) - {result}")

# 5. Tree
result, code = call('tree', token=token)
if code == 200:
    has_tree = result.get('tree') is not None
    print(f"5. TREE: OK (has_data={has_tree})")
else:
    print(f"5. TREE: FAILED (HTTP {code}) - {result}")

# 6. Settings
result, code = call('get-settings', token=token)
if code == 200:
    print(f"6. SETTINGS: OK (count={len(result.get('settings', []))})")
else:
    print(f"6. SETTINGS: FAILED (HTTP {code}) - {result}")

# 7. Add partner test (dry check)
print(f"\n7. ADD PARTNER: Testing endpoint...")
result, code = call('add-partner', token=token, extra={
    'partnerData': {
        'first_name': 'Test', 'last_name': 'API',
        'email': 'test-api-check@test.local', 'phone': '+49000'
    }
})
print(f"   Response: HTTP {code} - {json.dumps(result)[:200]}")

print("\n" + "=" * 50)
print("All tests complete!")
