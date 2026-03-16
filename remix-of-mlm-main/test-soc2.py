import requests, json

URL = 'https://pqnzsihfryjnnhdubisk.supabase.co'
AK = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBxbnpzaWhmcnlqbm5oZHViaXNrIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzI1MjY4NDQsImV4cCI6MjA4ODEwMjg0NH0.AzmcvzIC3Ve5CwZuLVrDfpq9RJ5W-oy8KmJlK1cUINg'

# Login as admin
r = requests.post(URL+'/auth/v1/token?grant_type=password',
    json={'email':'t6661195@gmail.com','password':'Admin123!@#'},
    headers={'apikey':AK,'Content-Type':'application/json'})
token = r.json()['access_token']
h = {'Authorization':'Bearer '+token,'apikey':AK,'Content-Type':'application/json'}

# Test AI risk assessment
print('--- Testing AI Risk Assessment ---')
r1 = requests.post(URL+'/functions/v1/ai-threat-analysis',
    json={
        'action': 'risk_assessment',
        'data': {
            'assets': [
                {'asset_name': 'Web Server', 'asset_type': 'server', 'ip_address': '76.13.5.114', 'status': 'active', 'risk_score': 30}
            ],
            'recent_events': []
        }
    },
    headers=h)
print(f'AI analysis: HTTP {r1.status_code}')
d = r1.json()
if d.get('error'):
    print(f'  ERROR: {d["error"]}')
elif d.get('success'):
    assessment = d.get('assessment', {})
    print(f'  Risk Score: {assessment.get("overall_risk_score")}')
    print(f'  Risk Level: {assessment.get("risk_level")}')
    print(f'  Summary: {str(assessment.get("executive_summary", ""))[:200]}')

# Test security-dashboard-api insert
print('\n--- Testing Security Dashboard API (insert threat_intel) ---')
r2 = requests.post(URL+'/functions/v1/security-dashboard-api',
    json={
        'action': 'insert',
        'table': 'threat_intel',
        'data': {
            'indicator_type': 'ip',
            'indicator_value': '192.168.1.1',
            'threat_type': 'malware',
            'severity': 'high',
            'description': 'Test IOC from SOC dashboard',
            'is_active': True,
            'confidence': 85,
            'source': 'manual'
        }
    },
    headers=h)
print(f'Insert: HTTP {r2.status_code}')
d2 = r2.json()
if d2.get('error'):
    print(f'  ERROR: {d2["error"]}')
else:
    print(f'  OK: {json.dumps(d2)[:200]}')
