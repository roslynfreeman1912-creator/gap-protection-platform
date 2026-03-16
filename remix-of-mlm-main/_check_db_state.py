import requests, json

SERVICE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBxbnpzaWhmcnlqbm5oZHViaXNrIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MjUyNjg0NCwiZXhwIjoyMDg4MTAyODQ0fQ.QBAi_YJ0NilOXxvQ6631Z7L1V3vkOtb1huMcjha_UzA"
BASE = "https://pqnzsihfryjnnhdubisk.supabase.co"

def query(sql):
    """Run SQL via pg_query RPC or simple REST query."""
    # Try via rpc
    r = requests.post(f"{BASE}/rest/v1/rpc/exec_sql", json={"query": sql},
        headers={"apikey": SERVICE_KEY, "Authorization": f"Bearer {SERVICE_KEY}",
                 "Content-Type": "application/json"})
    if r.ok:
        return r.json()
    return f"Error {r.status_code}: {r.text}"

# Check triggers on the profiles table
print("=== TRIGGERS ON profiles TABLE ===")
result = query("""
SELECT trigger_name, event_manipulation, action_timing, action_statement
FROM information_schema.triggers
WHERE event_object_table = 'profiles'
ORDER BY trigger_name
""")
print(json.dumps(result, indent=2) if isinstance(result, (dict, list)) else result)

# Check unique constraints on promotion_codes
print("\n=== UNIQUE CONSTRAINTS ON promotion_codes ===")
result = query("""
SELECT conname, contype, pg_get_constraintdef(oid)
FROM pg_constraint
WHERE conrelid = 'public.promotion_codes'::regclass
""")
print(json.dumps(result, indent=2) if isinstance(result, (dict, list)) else result)

# Check unique constraints on profiles
print("\n=== CONSTRAINTS ON profiles ===")
result = query("""
SELECT conname, contype, pg_get_constraintdef(oid)
FROM pg_constraint
WHERE conrelid = 'public.profiles'::regclass
""")
print(json.dumps(result, indent=2) if isinstance(result, (dict, list)) else result)

# Check indexes on profiles.user_id
print("\n=== INDEXES ON profiles ===")
result = query("""
SELECT indexname, indexdef
FROM pg_indexes
WHERE tablename = 'profiles'
ORDER BY indexname
""")
print(json.dumps(result, indent=2) if isinstance(result, (dict, list)) else result)
