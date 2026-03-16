#!/usr/bin/env python3
"""Check DB state for admin panel issues."""
import json, urllib.request

KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBxbnpzaWhmcnlqbm5oZHViaXNrIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MjUyNjg0NCwiZXhwIjoyMDg4MTAyODQ0fQ.QBAi_YJ0NilOXxvQ6631Z7L1V3vkOtb1huMcjha_UzA"
BASE = "https://pqnzsihfryjnnhdubisk.supabase.co"

def api(method, path, data=None):
    body = json.dumps(data).encode() if data else None
    req = urllib.request.Request(f"{BASE}{path}", data=body, method=method,
        headers={"apikey": KEY, "Authorization": f"Bearer {KEY}", "Content-Type": "application/json"})
    try:
        with urllib.request.urlopen(req) as resp:
            return resp.status, json.loads(resp.read())
    except urllib.error.HTTPError as e:
        return e.code, e.read().decode()

# Check tables exist
for table in ['credit_notes', 'credit_note_seq', 'promotion_codes', 'commissions']:
    status, data = api("GET", f"/rest/v1/{table}?select=count&limit=0")
    print(f"Table {table}: HTTP {status}")

# Check if nextval RPC exists
status, data = api("POST", "/rest/v1/rpc/nextval", {"seq_name": "credit_note_seq"})
print(f"RPC nextval: HTTP {status} -> {data}")

# Check if has_role RPC works
status, data = api("POST", "/rest/v1/rpc/has_role", {"_user_id": "a0000000-0000-0000-0000-000000000001", "_role": "admin"})
print(f"RPC has_role: HTTP {status} -> {data}")

# Check credit_notes table structure
status, data = api("GET", "/rest/v1/credit_notes?select=*&limit=3")
print(f"credit_notes data: HTTP {status} -> {data}")

# Check promotion_codes
status, data = api("GET", "/rest/v1/promotion_codes?select=*")
print(f"promotion_codes: HTTP {status} -> {json.dumps(data, indent=2) if isinstance(data, list) else data}")

# Test generate-credit-notes function directly
status, data = api("POST", "/functions/v1/generate-credit-notes", {"action": "list"})
print(f"generate-credit-notes list: HTTP {status} -> {data}")
