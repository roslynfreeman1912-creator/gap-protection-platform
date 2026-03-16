import psycopg2
conn = psycopg2.connect(host='aws-1-eu-north-1.pooler.supabase.com', port=5432, dbname='postgres', user='postgres.pqnzsihfryjnnhdubisk', password='galal123.DE12', sslmode='require')
conn.autocommit = True
cur = conn.cursor()

# Add 'deleted' to user_status enum
print("Adding 'deleted' to user_status enum...")
cur.execute("ALTER TYPE user_status ADD VALUE IF NOT EXISTS 'deleted'")
print("Done!")

# Verify
cur.execute("""
SELECT e.enumlabel
FROM pg_type t JOIN pg_enum e ON e.enumtypid = t.oid
WHERE t.typname = 'user_status'
ORDER BY e.enumsortorder
""")
print('\nuser_status values now:')
for row in cur.fetchall():
    print(f'  {row[0]}')

cur.close()
conn.close()
