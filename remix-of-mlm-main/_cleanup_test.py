#!/usr/bin/env python3
"""Clean up test users"""
import requests

URL = 'https://pqnzsihfryjnnhdubisk.supabase.co'
SK = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBxbnpzaWhmcnlqbm5oZHViaXNrIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MjUyNjg0NCwiZXhwIjoyMDg4MTAyODQ0fQ.QBAi_YJ0NilOXxvQ6631Z7L1V3vkOtb1huMcjha_UzA'
h = {'Authorization': f'Bearer {SK}', 'apikey': SK}

r = requests.get(f'{URL}/auth/v1/admin/users', headers=h)
for u in r.json().get('users', []):
    email = u.get('email', '')
    if 'test-settings' in email:
        uid = u['id']
        print(f'Deleting: {uid} ({email})')
        requests.delete(f'{URL}/auth/v1/admin/users/{uid}', headers=h)
        r2 = requests.get(f'{URL}/rest/v1/profiles?user_id=eq.{uid}&select=id', headers=h)
        if r2.json():
            pid = r2.json()[0]['id']
            for table in ['user_roles', 'user_hierarchy', 'wallets', 'promotion_codes']:
                requests.delete(f'{URL}/rest/v1/{table}?user_id=eq.{pid}', headers=h)
            requests.delete(f'{URL}/rest/v1/profiles?id=eq.{pid}', headers=h)
            print(f'  Cleaned profile {pid}')

print('Done')
