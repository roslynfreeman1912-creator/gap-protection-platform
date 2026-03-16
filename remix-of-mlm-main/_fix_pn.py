#!/usr/bin/env python3
import json, urllib.request
SERVICE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBxbnpzaWhmcnlqbm5oZHViaXNrIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MjUyNjg0NCwiZXhwIjoyMDg4MTAyODQ0fQ.QBAi_YJ0NilOXxvQ6631Z7L1V3vkOtb1huMcjha_UzA"
BASE = "https://pqnzsihfryjnnhdubisk.supabase.co"

data = json.dumps({"partner_number": "1000"}).encode()
req = urllib.request.Request(
    BASE + "/rest/v1/profiles?id=eq.79f3ca91-fc69-4337-a9d7-d04e9df886d1",
    data=data, method="PATCH",
    headers={
        "apikey": SERVICE_KEY,
        "Authorization": "Bearer " + SERVICE_KEY,
        "Content-Type": "application/json",
        "Prefer": "return=representation",
    }
)
with urllib.request.urlopen(req) as resp:
    result = json.loads(resp.read())
    pn = result[0].get("partner_number") if result else "FAIL"
    print("Updated partner_number:", pn)
