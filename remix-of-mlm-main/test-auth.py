import requests
URL = 'https://pqnzsihfryjnnhdubisk.supabase.co'
AK = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBxbnpzaWhmcnlqbm5oZHViaXNrIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzI1MjY4NDQsImV4cCI6MjA4ODEwMjg0NH0.AzmcvzIC3Ve5CwZuLVrDfpq9RJ5W-oy8KmJlK1cUINg'
SK = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBxbnpzaWhmcnlqbm5oZHViaXNrIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MjUyNjg0NCwiZXhwIjoyMDg4MTAyODQ0fQ.QBAi_YJ0NilOXxvQ6631Z7L1V3vkOtb1huMcjha_UzA'

# 1) Test service key
r0 = requests.post(URL+'/functions/v1/admin-users', json={'action':'list_users','page':1,'limit':3},
    headers={'Authorization':'Bearer '+SK,'Content-Type':'application/json'})
print(f"SERVICE KEY: {r0.status_code} => {r0.text[:300]}")

# 2) Login
r = requests.post(URL+'/auth/v1/token?grant_type=password',
    json={'email':'t6661195@gmail.com','password':'Admin123!@#'},
    headers={'apikey':AK,'Content-Type':'application/json'})
print(f"LOGIN: {r.status_code}")
if r.status_code == 200:
    token = r.json()['access_token']
    # Test admin-users
    r2 = requests.post(URL+'/functions/v1/admin-users', json={'action':'list_users','page':1,'limit':3},
        headers={'Authorization':'Bearer '+token,'apikey':AK,'Content-Type':'application/json'})
    print(f"admin-users: {r2.status_code} => {r2.text[:400]}")
    # Test get-partners-list
    r3 = requests.post(URL+'/functions/v1/get-partners-list', json={},
        headers={'Authorization':'Bearer '+token,'apikey':AK,'Content-Type':'application/json'})
    print(f"get-partners: {r3.status_code} => {r3.text[:400]}")
    # Test get-promotion-codes
    r4 = requests.post(URL+'/functions/v1/get-promotion-codes', json={},
        headers={'Authorization':'Bearer '+token,'apikey':AK,'Content-Type':'application/json'})
    print(f"get-promo: {r4.status_code} => {r4.text[:400]}")
else:
    print(f"LOGIN FAIL: {r.text[:200]}")
