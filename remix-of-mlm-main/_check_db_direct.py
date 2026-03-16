import psycopg2, json

# Supabase direct connection (using pooler)
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
for row in cur.fetchall():
    print(f"  {row[0]} | {row[2]} {row[1]} | {row[3]}")

# 2. Check trigger function source
print("\n=== TRIGGER FUNCTIONS ===")
cur.execute("""
SELECT p.proname, pg_get_functiondef(p.oid)
FROM pg_proc p
JOIN pg_trigger t ON t.tgfoid = p.oid
JOIN pg_class c ON c.oid = t.tgrelid
WHERE c.relname = 'profiles'
""")
for row in cur.fetchall():
    print(f"\n--- {row[0]} ---")
    print(row[1][:800])

# 3. Constraints on profiles
print("\n=== CONSTRAINTS ON profiles ===")
cur.execute("""
SELECT conname, contype, pg_get_constraintdef(oid)
FROM pg_constraint
WHERE conrelid = 'public.profiles'::regclass
ORDER BY conname
""")
for row in cur.fetchall():
    print(f"  {row[0]} | type={row[1]} | {row[2]}")

# 4. Unique indexes on profiles
print("\n=== INDEXES ON profiles ===")
cur.execute("""
SELECT indexname, indexdef
FROM pg_indexes
WHERE tablename = 'profiles'
ORDER BY indexname
""")
for row in cur.fetchall():
    print(f"  {row[0]}: {row[1]}")

# 5. Check promotion_codes constraints
print("\n=== CONSTRAINTS ON promotion_codes ===")
try:
    cur.execute("""
    SELECT conname, contype, pg_get_constraintdef(oid)
    FROM pg_constraint
    WHERE conrelid = 'public.promotion_codes'::regclass
    ORDER BY conname
    """)
    for row in cur.fetchall():
        print(f"  {row[0]} | type={row[1]} | {row[2]}")
except Exception as e:
    print(f"  Error: {e}")

# 6. Check if user_id has unique constraint
print("\n=== IS profiles.user_id UNIQUE? ===")
cur.execute("""
SELECT indexname, indexdef
FROM pg_indexes
WHERE tablename = 'profiles' AND indexdef LIKE '%user_id%'
""")
for row in cur.fetchall():
    print(f"  {row[0]}: {row[1]}")

cur.close()
conn.close()
