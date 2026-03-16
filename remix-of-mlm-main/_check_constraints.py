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

# Check unique constraints for all tables referenced in triggers
tables = ['user_hierarchy', 'wallets', 'user_roles', 'promotion_codes']

for table in tables:
    print(f"\n=== CONSTRAINTS ON {table} ===")
    try:
        cur.execute(f"""
        SELECT conname, contype, pg_get_constraintdef(oid)
        FROM pg_constraint
        WHERE conrelid = 'public.{table}'::regclass
        ORDER BY conname
        """)
        rows = cur.fetchall()
        for row in rows:
            print(f"  {row[0]} | type={row[1]} | {row[2]}")
        if not rows:
            print("  (none)")
    except Exception as e:
        conn.rollback()
        print(f"  Error: {e}")

    # Also check indexes
    print(f"  --- Indexes ---")
    try:
        cur.execute(f"""
        SELECT indexname, indexdef
        FROM pg_indexes
        WHERE tablename = '{table}'
        """)
        rows = cur.fetchall()
        for row in rows:
            print(f"  {row[0]}: {row[1]}")
        if not rows:
            print("  (none)")
    except Exception as e:
        conn.rollback()
        print(f"  Error: {e}")

cur.close()
conn.close()
