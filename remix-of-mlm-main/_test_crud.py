#!/usr/bin/env python3
"""Quick test: add + edit + delete partner."""
import json, urllib.request, urllib.error, time, random

URL = "https://pqnzsihfryjnnhdubisk.supabase.co/functions/v1/mlm-dashboard"
ANON = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBxbnpzaWhmcnlqbm5oZHViaXNrIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzI1MjY4NDQsImV4cCI6MjA4ODEwMjg0NH0.17hnhswPIqxvqiV40TPQEQK5F16ywJqJhiXclPCpj-A"

def call(action, extra=None, token=None):
    body = {"action": action}
    if extra: body.update(extra)
    req = urllib.request.Request(URL,
        data=json.dumps(body).encode(), method="POST",
        headers={"Content-Type": "application/json", "apikey": ANON,
                 "Authorization": "Bearer " + (token or ANON)})
    try:
        with urllib.request.urlopen(req) as resp:
            result = json.loads(resp.read())
            print("  OK (%d): %s" % (resp.status, json.dumps(result, default=str)[:400]))
            return result
    except urllib.error.HTTPError as e:
        print("  FAIL (%d): %s" % (e.code, e.read().decode()[:300]))
        return None

# Login
print("LOGIN...")
login = call("login", {"username": "Thomas", "password": "Thomas123.DE"})
token = login["access_token"]

# Stats (immediately, no delay)
print("\nSTATS...")
call("stats", token=token)

# Add partner with random email
rnd = random.randint(10000, 99999)
email = "partner%d@test.example" % rnd
print("\nADD PARTNER (email=%s)..." % email)
add = call("add-partner", {"partnerData": {
    "first_name": "Test", "last_name": "Partner",
    "email": email, "phone": "+49123", "city": "Berlin"
}}, token=token)

if add and add.get("partner"):
    pid = add["partner"]["id"]
    print("\nEDIT PARTNER (id=%s)..." % pid)
    call("edit-partner", {"partnerId": pid, "partnerData": {
        "phone": "+49999", "city": "Hamburg", "first_name": "Updated"
    }}, token=token)

    print("\nDELETE PARTNER...")
    call("delete-partner", {"partnerId": pid}, token=token)

# Verify with fresh downline fetch
print("\nDOWNLINE...")
call("downline", token=token)

# Verify overview (should show isSuperAdmin)
print("\nOVERVIEW...")
call("overview", token=token)

print("\nALL DONE.")
