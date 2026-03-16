#!/usr/bin/env python3
"""Clean up all test data"""
import requests

URL = 'https://pqnzsihfryjnnhdubisk.supabase.co'
SK = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBxbnpzaWhmcnlqbm5oZHViaXNrIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MjUyNjg0NCwiZXhwIjoyMDg4MTAyODQ0fQ.QBAi_YJ0NilOXxvQ6631Z7L1V3vkOtb1huMcjha_UzA'
h = {'Authorization': f'Bearer {SK}', 'apikey': SK}

# Find profile by email
r = requests.get(f'{URL}/rest/v1/profiles?email=eq.test-settings-verify@test.com&select=id,user_id', headers=h)
profiles = r.json()
print(f'Found profiles: {profiles}')

for p in profiles:
    pid = p['id']
    uid = p.get('user_id')
    print(f'Cleaning profile {pid} (user_id: {uid})')
    for table in ['user_roles', 'user_hierarchy', 'wallets', 'promotion_codes']:
        requests.delete(f'{URL}/rest/v1/{table}?user_id=eq.{pid}', headers=h)
    requests.delete(f'{URL}/rest/v1/profiles?id=eq.{pid}', headers=h)
    print(f'  Deleted profile')
    if uid:
        requests.delete(f'{URL}/auth/v1/admin/users/{uid}', headers=h)
        print(f'  Deleted auth user')

# Also check auth for test emails
r = requests.get(f'{URL}/auth/v1/admin/users', headers=h)
for u in r.json().get('users', []):
    email = u.get('email', '')
    if 'test' in email.lower() and 'gap-protection' not in email and 'gapprotection' not in email:
        # Only cleanup if it's a test email
        if any(x in email for x in ['test-settings', 'testsettings', '@test.com']):
            uid = u['id']
            print(f'Removing auth user: {uid} ({email})')
            requests.delete(f'{URL}/auth/v1/admin/users/{uid}', headers=h)

print('Done')
