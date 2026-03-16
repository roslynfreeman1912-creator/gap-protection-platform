import psycopg2, requests, json

SERVICE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBxbnpzaWhmcnlqbm5oZHViaXNrIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MjUyNjg0NCwiZXhwIjoyMDg4MTAyODQ0fQ.QBAi_YJ0NilOXxvQ6631Z7L1V3vkOtb1huMcjha_UzA"
BASE = "https://pqnzsihfryjnnhdubisk.supabase.co"

# Connect to DB
conn = psycopg2.connect(host='aws-1-eu-north-1.pooler.supabase.com', port=5432, dbname='postgres', user='postgres.pqnzsihfryjnnhdubisk', password='galal123.DE12', sslmode='require')
conn.autocommit = True
cur = conn.cursor()

# Find test profiles
print("=== Finding test profiles ===")
cur.execute("""
SELECT id, user_id, first_name, last_name, email, status
FROM profiles 
WHERE email LIKE '%@test.example' OR email LIKE '%test.%' OR first_name LIKE 'Test%'
ORDER BY created_at
""")
test_profiles = cur.fetchall()
print(f"Found {len(test_profiles)} test profiles:")
for row in test_profiles:
    print(f"  {row[0]} | user_id={row[1]} | {row[2]} {row[3]} | {row[4]} | status={row[5]}")

# Delete test profiles from DB
if test_profiles:
    profile_ids = [row[0] for row in test_profiles]
    user_ids = [row[1] for row in test_profiles if row[1]]
    
    # Delete from user_roles
    print(f"\nDeleting user_roles for {len(profile_ids)} profiles...")
    cur.execute("DELETE FROM user_roles WHERE user_id = ANY(%s::uuid[])", (profile_ids,))
    print(f"  Deleted {cur.rowcount} user_roles")
    
    # Delete from user_hierarchy
    print("Deleting user_hierarchy...")
    cur.execute("DELETE FROM user_hierarchy WHERE user_id = ANY(%s::uuid[]) OR ancestor_id = ANY(%s::uuid[])", (profile_ids, profile_ids))
    print(f"  Deleted {cur.rowcount} hierarchy entries")
    
    # Delete from wallets
    print("Deleting wallets...")
    cur.execute("DELETE FROM wallets WHERE profile_id = ANY(%s::uuid[])", (profile_ids,))
    print(f"  Deleted {cur.rowcount} wallets")
    
    # Delete from promotion_codes
    print("Deleting promotion_codes...")
    cur.execute("DELETE FROM promotion_codes WHERE partner_id = ANY(%s::uuid[])", (profile_ids,))
    print(f"  Deleted {cur.rowcount} promotion_codes")
    
    # Delete profiles
    print("Deleting profiles...")
    cur.execute("DELETE FROM profiles WHERE id = ANY(%s::uuid[])", (profile_ids,))
    print(f"  Deleted {cur.rowcount} profiles")
    
    # Delete auth users
    print(f"\nDeleting {len(user_ids)} auth users...")
    headers = {"apikey": SERVICE_KEY, "Authorization": f"Bearer {SERVICE_KEY}"}
    for uid in user_ids:
        r = requests.delete(f"{BASE}/auth/v1/admin/users/{uid}", headers=headers)
        print(f"  Delete auth user {uid}: {r.status_code}")

# Also check for leftover test auth users
print("\n=== Checking for test auth users ===")
r = requests.get(f"{BASE}/auth/v1/admin/users?per_page=100", headers={"apikey": SERVICE_KEY, "Authorization": f"Bearer {SERVICE_KEY}"})
all_users = r.json().get('users', [])
test_auth = [u for u in all_users if 'test' in u.get('email', '').lower() or 'partner' in u.get('email', '').lower()]
print(f"Found {len(test_auth)} test auth users:")
for u in test_auth:
    print(f"  {u['id']} | {u['email']}")
    r2 = requests.delete(f"{BASE}/auth/v1/admin/users/{u['id']}", headers={"apikey": SERVICE_KEY, "Authorization": f"Bearer {SERVICE_KEY}"})
    print(f"    Deleted: {r2.status_code}")

# Show remaining users
print("\n=== Remaining auth users ===")
r = requests.get(f"{BASE}/auth/v1/admin/users?per_page=100", headers={"apikey": SERVICE_KEY, "Authorization": f"Bearer {SERVICE_KEY}"})
remaining = r.json().get('users', [])
for u in remaining:
    print(f"  {u['id']} | {u['email']}")

print("\n=== Remaining profiles ===")
cur.execute("SELECT id, first_name, last_name, email, role, status FROM profiles ORDER BY created_at")
for row in cur.fetchall():
    print(f"  {row[0]} | {row[1]} {row[2]} | {row[3]} | role={row[4]} | status={row[5]}")

cur.close()
conn.close()
print("\nCleanup done!")
