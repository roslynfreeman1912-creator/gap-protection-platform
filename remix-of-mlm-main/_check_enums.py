import psycopg2
conn = psycopg2.connect(host='aws-1-eu-north-1.pooler.supabase.com', port=5432, dbname='postgres', user='postgres.pqnzsihfryjnnhdubisk', password='galal123.DE12', sslmode='require')
conn.autocommit = True
cur = conn.cursor()

# Check status column type
cur.execute("""
SELECT column_name, data_type, udt_name, is_nullable
FROM information_schema.columns
WHERE table_name = 'profiles' AND column_name IN ('status', 'role')
""")
for row in cur.fetchall():
    print(f'{row[0]}: type={row[1]}, udt={row[2]}, nullable={row[3]}')

# Get user_status enum values
cur.execute("""
SELECT e.enumlabel
FROM pg_type t JOIN pg_enum e ON e.enumtypid = t.oid
WHERE t.typname = 'user_status'
ORDER BY e.enumsortorder
""")
print('\nuser_status enum values:')
for row in cur.fetchall():
    print(f'  {row[0]}')

# Get user_role enum values
cur.execute("""
SELECT e.enumlabel
FROM pg_type t JOIN pg_enum e ON e.enumtypid = t.oid
WHERE t.typname = 'user_role'
ORDER BY e.enumsortorder
""")
print('\nuser_role enum values:')
for row in cur.fetchall():
    print(f'  {row[0]}')

cur.close()
conn.close()
