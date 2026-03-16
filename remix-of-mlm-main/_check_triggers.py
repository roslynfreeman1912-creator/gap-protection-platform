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

# Get ALL trigger functions on profiles table 
print("=== ALL TRIGGER FUNCTION BODIES ===")
trigger_names = [
    'assign_employee_number_if_missing',
    'calculate_hierarchy',
    'create_promotion_code_record',
    'auto_create_wallet',
    'enforce_profile_immutability',
    'generate_promotion_code',
    'assign_customer_role',
    'prevent_sponsor_cycle',
    'auto_encrypt_pii_on_write',
    'enforce_customer_role_on_insert',
    'prevent_role_self_escalation',
    'update_updated_at_column',
]

for name in trigger_names:
    cur.execute("""
    SELECT pg_get_functiondef(p.oid) 
    FROM pg_proc p WHERE p.proname = %s
    """, (name,))
    rows = cur.fetchall()
    if rows:
        body = rows[0][0]
        if 'ON CONFLICT' in body or 'on conflict' in body.lower() or 'INSERT' in body:
            print(f"\n{'='*60}")
            print(f"--- {name} (has INSERT or ON CONFLICT) ---")
            print(body[:2000])
    else:
        print(f"  {name}: NOT FOUND")

# Also check hierarchy function
print("\n\n=== calculate_hierarchy ===")
cur.execute("SELECT pg_get_functiondef(p.oid) FROM pg_proc p WHERE p.proname = 'calculate_hierarchy'")
rows = cur.fetchall()
if rows:
    print(rows[0][0][:2000])

# Check auto_create_wallet
print("\n\n=== auto_create_wallet ===")
cur.execute("SELECT pg_get_functiondef(p.oid) FROM pg_proc p WHERE p.proname = 'auto_create_wallet'")
rows = cur.fetchall()
if rows:
    print(rows[0][0][:2000])

# Check assign_customer_role
print("\n\n=== assign_customer_role ===")
cur.execute("SELECT pg_get_functiondef(p.oid) FROM pg_proc p WHERE p.proname = 'assign_customer_role'")
rows = cur.fetchall()
if rows:
    print(rows[0][0][:2000])

cur.close()
conn.close()
