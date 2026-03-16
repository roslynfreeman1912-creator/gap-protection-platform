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

# Check enforce_profile_immutability
funcs = [
    'enforce_profile_immutability',
    'auto_encrypt_pii_on_write',
    'enforce_customer_role_on_insert',
    'prevent_role_self_escalation',
    'assign_employee_number_if_missing',
]

for func_name in funcs:
    cur.execute("SELECT pg_get_functiondef(p.oid) FROM pg_proc p WHERE p.proname = %s", (func_name,))
    rows = cur.fetchall()
    if rows:
        print(f"\n{'='*60}")
        print(f"--- {func_name} ---")
        print(rows[0][0][:2000])

cur.close()
conn.close()
