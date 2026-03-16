#!/usr/bin/env python3
"""Test all MLM edge function operations with test credentials.

WARNING:
- This script is for local/manual testing only.
- It reads Supabase URL and ANON key from environment variables.
"""
import json
import os
import urllib.request
import urllib.error

URL = os.getenv("SUPABASE_FUNCTION_MLM_DASHBOARD_URL", "").strip() or \
      (os.getenv("SUPABASE_URL", "").rstrip("/") + "/functions/v1/mlm-dashboard")
ANON_KEY = os.getenv("SUPABASE_ANON_KEY", "")

TEST_USERNAME = os.getenv("MLM_TEST_USERNAME", "Thomas")
TEST_PASSWORD = os.getenv("MLM_TEST_PASSWORD", "Thomas123.DE")

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
        "Authorization": "Bearer " + auth,
    })
    try:
        with urllib.request.urlopen(req) as resp:
            result = json.loads(resp.read())
            status = resp.status
            summary = json.dumps(result, indent=2, default=str)[:300]
            print("  HTTP %d: %s" % (status, summary))
            return result
    except urllib.error.HTTPError as e:
        body_text = e.read().decode()
        print("  HTTP %d: %s" % (e.code, body_text))
        return None

# Login
print("=== LOGIN ===")
login = call("login", {"username": TEST_USERNAME, "password": TEST_PASSWORD})
if not login or not login.get("access_token"):
    print("FATAL: Login failed")
    exit(1)
token = login["access_token"]

# Overview
print("\n=== OVERVIEW ===")
ov = call("overview", token=token)
if ov:
    print("  isSuperAdmin:", ov.get("isSuperAdmin"))
    print("  isStructureAdmin:", ov.get("isStructureAdmin"))

# Add partner test
print("\n=== ADD PARTNER ===")
add = call("add-partner", {
    "partnerData": {
        "first_name": "Test",
        "last_name": "User",
        "email": "testuser123@test.com",
    }
}, token=token)

# Edit partner test (if add succeeded)
if add and add.get("partner"):
    pid = add["partner"]["id"]
    print("\n=== EDIT PARTNER ===")
    call("edit-partner", {
        "partnerId": pid,
        "partnerData": {"phone": "+49123456789", "city": "Berlin"}
    }, token=token)

    print("\n=== DELETE PARTNER ===")
    call("delete-partner", {"partnerId": pid}, token=token)

# Edit profile
print("\n=== EDIT PROFILE ===")
call("edit-profile", {
    "profileData": {"phone": "+49111111111"}
}, token=token)

# Change credentials (just test it works, don't actually change)
print("\n=== CHANGE CREDENTIALS (no-op test) ===")
call("change-credentials", {
    "newPassword": "Thomas123.DE"  # Same password
}, token=token)

# Stats
print("\n=== STATS ===")
call("stats", token=token)

print("\n=== ALL TESTS COMPLETE ===")
