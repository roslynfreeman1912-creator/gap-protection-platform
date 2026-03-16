import psycopg2

conn = psycopg2.connect(
    host="aws-1-eu-north-1.pooler.supabase.com",
    port=5432,
    dbname="postgres",
    user="postgres.pqnzsihfryjnnhdubisk",
    password="galal123.DE12",
    sslmode="require"
)
conn.autocommit = True
cur = conn.cursor()

# 1. Triggers on profiles
print("=== TRIGGERS ON profiles ===")
cur.execute("""
SELECT trigger_name, event_manipulation, action_timing, action_statement
FROM information_schema.triggers
WHERE event_object_table = 'profiles'
ORDER BY trigger_name
""")
rows = cur.fetchall()
print(f"  Found {len(rows)} triggers")
for row in rows:
    print(f"  {row}")

# 2. Check trigger functions for profiles
print("\n=== TRIGGER FUNCTION BODIES ===")
cur.execute("""
SELECT p.proname, pg_get_functiondef(p.oid)
FROM pg_proc p
WHERE p.proname IN (
    'generate_promotion_code',
    'create_promotion_code_record',
    'handle_new_user',
    'create_profile_for_new_user',
    'assign_employee_number',
    'prevent_sponsor_cycle'
)
""")
rows = cur.fetchall()
print(f"  Found {len(rows)} functions")
for row in rows:
    print(f"\n--- {row[0]} ---")
    print(row[1][:1500])

# 3. Constraints on profiles
print("\n=== CONSTRAINTS ON profiles ===")
cur.execute("""
SELECT conname, contype, pg_get_constraintdef(oid)
FROM pg_constraint
WHERE conrelid = 'public.profiles'::regclass
ORDER BY conname
""")
rows = cur.fetchall()
print(f"  Found {len(rows)} constraints")
for row in rows:
    print(f"  {row}")

# 4. Indexes on profiles (looking for user_id unique)
print("\n=== INDEXES ON profiles (user_id) ===")
cur.execute("""
SELECT indexname, indexdef
FROM pg_indexes
WHERE tablename = 'profiles'
AND indexdef LIKE '%user_id%'
""")
rows = cur.fetchall()
print(f"  Found {len(rows)} indexes")
for row in rows:
    print(f"  {row}")

# 5. All indexes on profiles
print("\n=== ALL INDEXES ON profiles ===")
cur.execute("""
SELECT indexname, indexdef
FROM pg_indexes
WHERE tablename = 'profiles'
""")
rows = cur.fetchall()
print(f"  Found {len(rows)} indexes")
for row in rows:
    print(f"  {row}")

# 6. Check promotion_codes table and constraints
print("\n=== CONSTRAINTS ON promotion_codes ===")
try:
    cur.execute("""
    SELECT conname, contype, pg_get_constraintdef(oid)
    FROM pg_constraint
    WHERE conrelid = 'public.promotion_codes'::regclass
    ORDER BY conname
    """)
    rows = cur.fetchall()
    print(f"  Found {len(rows)} constraints")
    for row in rows:
        print(f"  {row}")
except Exception as e:
    print(f"  Table may not exist: {e}")

# 7. Check auth.users triggers (the trigger that creates profiles on new user)
print("\n=== TRIGGERS ON auth.users ===")
cur.execute("""
SELECT trigger_name, event_manipulation, action_timing, action_statement
FROM information_schema.triggers
WHERE event_object_schema = 'auth' AND event_object_table = 'users'
ORDER BY trigger_name
""")
rows = cur.fetchall()
print(f"  Found {len(rows)} triggers")
for row in rows:
    print(f"  {row}")

# 8. Check the auth trigger function
print("\n=== AUTH TRIGGER FUNCTIONS ===")
cur.execute("""
SELECT p.proname, n.nspname, pg_get_functiondef(p.oid)
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE p.proname IN ('on_auth_user_created', 'handle_new_user', 'create_profile_on_signup')
""")
rows = cur.fetchall()
print(f"  Found {len(rows)} functions")
for row in rows:
    print(f"\n--- {row[1]}.{row[0]} ---")
    print(row[2])

cur.close()
conn.close()
