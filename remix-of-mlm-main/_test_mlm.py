#!/usr/bin/env python3
"""Test the mlm-dashboard edge function end-to-end.

WARNING:
- This script is for local/manual testing only.
- It now reads Supabase URL and ANON key from environment variables.
- Do NOT commit real keys or passwords into the repository.
"""
import json
import os
import urllib.request
import urllib.error

URL = os.getenv("SUPABASE_FUNCTION_MLM_DASHBOARD_URL", "").strip() or \
      (os.getenv("SUPABASE_URL", "").rstrip("/") + "/functions/v1/mlm-dashboard")
ANON_KEY = os.getenv("SUPABASE_ANON_KEY", "")

if not URL or not ANON_KEY:
    raise SystemExit(
        "Set SUPABASE_URL or SUPABASE_FUNCTION_MLM_DASHBOARD_URL and SUPABASE_ANON_KEY "
        "in your environment before running this test."
    )

def call(action, extra=None, token=None):
    body = {"action": action}
    if extra:
        body.update(extra)
    data = json.dumps(body).encode()
    auth = token or ANON_KEY
    req = urllib.request.Request(URL, data=data, method="POST", headers={
        "Content-Type": "application/json",
        "apikey": ANON_KEY,
        "Authorization": f"Bearer {auth}",
    })
    try:
        with urllib.request.urlopen(req) as resp:
            result = json.loads(resp.read())
            print(f"  HTTP {resp.status}: {json.dumps(result, indent=2, default=str)[:500]}")
            return result
    except urllib.error.HTTPError as e:
        body_text = e.read().decode()
        print(f"  HTTP {e.code}: {body_text}")
        return None

# Test 1: Login
print("=== Test 1: Login ===")
login_result = call("login", {"username": "Thomas", "password": "Thomas123.DE"})

if login_result and login_result.get("access_token"):
    token = login_result["access_token"]
    print(f"\n  Got token: {token[:30]}...")
    
    # Test 2: Overview with valid token
    print("\n=== Test 2: Overview with token ===")
    call("overview", token=token)
    
    # Test 3: Downline
    print("\n=== Test 3: Downline ===")
    call("downline", token=token)
    
    # Test 4: Tree
    print("\n=== Test 4: Tree ===")
    call("tree", token=token)
    
    # Test 5: Commissions
    print("\n=== Test 5: Commissions ===")
    call("commissions", token=token)
else:
    print("\n  Login FAILED - cannot test further")
    
    # Try without auth header to see what we get
    print("\n=== Test without auth ===")
    req = urllib.request.Request(URL, 
        data=json.dumps({"action": "overview"}).encode(), 
        method="POST",
        headers={"Content-Type": "application/json", "apikey": ANON_KEY})
    try:
        with urllib.request.urlopen(req) as resp:
            print(f"  HTTP {resp.status}: {resp.read().decode()}")
    except urllib.error.HTTPError as e:
        print(f"  HTTP {e.code}: {e.read().decode()}")
