import requests, json

URL = 'https://pqnzsihfryjnnhdubisk.supabase.co'
AK = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBxbnpzaWhmcnlqbm5oZHViaXNrIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzI1MjY4NDQsImV4cCI6MjA4ODEwMjg0NH0.AzmcvzIC3Ve5CwZuLVrDfpq9RJ5W-oy8KmJlK1cUINg'

# Login as admin
r = requests.post(URL+'/auth/v1/token?grant_type=password',
    json={'email':'t6661195@gmail.com','password':'Admin123!@#'},
    headers={'apikey':AK,'Content-Type':'application/json'})
print(f'Login: {r.status_code}')
if r.status_code != 200:
    print(r.text[:200])
    exit()
token = r.json()['access_token']
h = {'Authorization':'Bearer '+token,'apikey':AK,'Content-Type':'application/json'}

# Test 1: Read security_assets (via RLS)
r1 = requests.get(URL+'/rest/v1/security_assets?select=*&limit=5', headers=h)
if r1.status_code == 200:
    print(f'security_assets: HTTP 200, rows={len(r1.json())}')
else:
    print(f'security_assets: HTTP {r1.status_code}, error={r1.text[:200]}')

# Test 2: Read threat_events
r2 = requests.get(URL+'/rest/v1/threat_events?select=*&limit=5', headers=h)
if r2.status_code == 200:
    print(f'threat_events: HTTP 200, rows={len(r2.json())}')
else:
    print(f'threat_events: HTTP {r2.status_code}, error={r2.text[:200]}')

# Test 3: Read security_alerts
r3 = requests.get(URL+'/rest/v1/security_alerts?select=*&limit=5', headers=h)
if r3.status_code == 200:
    print(f'security_alerts: HTTP 200, rows={len(r3.json())}')
else:
    print(f'security_alerts: HTTP {r3.status_code}, error={r3.text[:200]}')

# Test 4: Read honeypot_events
r4 = requests.get(URL+'/rest/v1/honeypot_events?select=*&limit=5', headers=h)
if r4.status_code == 200:
    print(f'honeypot_events: HTTP 200, rows={len(r4.json())}')
else:
    print(f'honeypot_events: HTTP {r4.status_code}, error={r4.text[:200]}')

# Test 5: Read ai_threat_analyses
r5 = requests.get(URL+'/rest/v1/ai_threat_analyses?select=*&limit=5', headers=h)
if r5.status_code == 200:
    print(f'ai_threat_analyses: HTTP 200, rows={len(r5.json())}')
else:
    print(f'ai_threat_analyses: HTTP {r5.status_code}, error={r5.text[:200]}')

# Test 6: Read threat_intel
r6 = requests.get(URL+'/rest/v1/threat_intel?select=*&limit=5', headers=h)
if r6.status_code == 200:
    print(f'threat_intel: HTTP 200, rows={len(r6.json())}')
else:
    print(f'threat_intel: HTTP {r6.status_code}, error={r6.text[:200]}')

print('\n--- Testing Auto-Protect ---')
r7 = requests.post(URL+'/functions/v1/auto-protect',
    json={'action':'protect','domain':'gapprotectionltd.com'},
    headers=h)
print(f'auto-protect: HTTP {r7.status_code}')
d = r7.json()
if d.get('error'):
    print(f'  ERROR: {d["error"]}')
elif d.get('success'):
    print(f'  OK! domain={d.get("domain")} score={d.get("protectionScore")}%')
    steps = d.get('steps', {})
    for k, v in steps.items():
        print(f'    {k}: {v["status"]}')
