#!/usr/bin/env python3
"""Fix the generate_promotion_code trigger - move promo code creation to AFTER INSERT."""
import json
import urllib.request

SERVICE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBxbnpzaWhmcnlqbm5oZHViaXNrIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MjUyNjg0NCwiZXhwIjoyMDg4MTAyODQ0fQ.QBAi_YJ0NilOXxvQ6631Z7L1V3vkOtb1huMcjha_UzA"
BASE = "https://pqnzsihfryjnnhdubisk.supabase.co"

def run_sql(sql):
    """Execute SQL via Supabase REST RPC."""
    body = json.dumps({"query": sql}).encode()
    req = urllib.request.Request(
        f"{BASE}/rest/v1/rpc/exec_sql",
        data=body,
        method="POST",
        headers={
            "apikey": SERVICE_KEY,
            "Authorization": f"Bearer {SERVICE_KEY}",
            "Content-Type": "application/json",
        }
    )
    try:
        with urllib.request.urlopen(req) as resp:
            return resp.read().decode()
    except urllib.error.HTTPError as e:
        return f"HTTP {e.code}: {e.read().decode()}"

def api_request(method, path, data=None):
    body = json.dumps(data).encode() if data else None
    req = urllib.request.Request(
        f"{BASE}{path}",
        data=body,
        method=method,
        headers={
            "apikey": SERVICE_KEY,
            "Authorization": f"Bearer {SERVICE_KEY}",
            "Content-Type": "application/json",
            "Prefer": "return=representation",
        }
    )
    try:
        with urllib.request.urlopen(req) as resp:
            return json.loads(resp.read())
    except urllib.error.HTTPError as e:
        body_text = e.read().decode()
        print(f"  HTTP {e.code}: {body_text}")
        return None

# The problem: generate_promotion_code() is BEFORE INSERT trigger that inserts into 
# promotion_codes with NEW.id, but the profile doesn't exist yet (FK constraint fails).
# 
# Solution: Split into two functions:
# 1. BEFORE INSERT: just set NEW.promotion_code 
# 2. AFTER INSERT: insert into promotion_codes table

# First approach: try using Supabase Management API to run SQL
# Actually, we can use the pg_net extension or just create a migration

# Let's try a different approach - use the Supabase SQL API via the management dashboard
# Or we can push a new migration

import subprocess
import os

os.chdir(r"C:\Users\taimd\Documents\New folder\remix-of-mlm-main")

# Create a new migration
migration_sql = """
-- Fix: generate_promotion_code was BEFORE INSERT but inserted into promotion_codes
-- which has FK to profiles. Profile doesn't exist yet during BEFORE INSERT.
-- Split into: BEFORE INSERT (set promotion_code column) + AFTER INSERT (create promo code row)

-- Step 1: Fix the BEFORE INSERT function - only set the column value, don't insert into promotion_codes
CREATE OR REPLACE FUNCTION public.generate_promotion_code()
RETURNS TRIGGER AS $$
DECLARE
    new_code TEXT;
BEGIN
    -- Only generate for partners and admins
    IF NEW.role IN ('partner', 'admin') THEN
        new_code := 'ML-' || UPPER(SUBSTRING(MD5(RANDOM()::TEXT) FROM 1 FOR 6));
        
        WHILE EXISTS (SELECT 1 FROM public.profiles WHERE promotion_code = new_code) LOOP
            new_code := 'ML-' || UPPER(SUBSTRING(MD5(RANDOM()::TEXT) FROM 1 FOR 6));
        END LOOP;
        
        NEW.promotion_code := new_code;
    END IF;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

-- Step 2: Create AFTER INSERT function to insert into promotion_codes table
CREATE OR REPLACE FUNCTION public.create_promotion_code_record()
RETURNS TRIGGER AS $$
BEGIN
    IF NEW.role IN ('partner', 'admin') AND NEW.promotion_code IS NOT NULL THEN
        INSERT INTO public.promotion_codes (code, partner_id)
        VALUES (NEW.promotion_code, NEW.id)
        ON CONFLICT (code) DO NOTHING;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

-- Step 3: Create the AFTER INSERT trigger
DROP TRIGGER IF EXISTS create_promotion_code_after_insert ON public.profiles;
CREATE TRIGGER create_promotion_code_after_insert
    AFTER INSERT ON public.profiles
    FOR EACH ROW EXECUTE FUNCTION public.create_promotion_code_record();
"""

# Write migration file
migration_path = "supabase/migrations/20260303193800_fix_promo_code_trigger.sql"
with open(migration_path, "w", encoding="utf-8") as f:
    f.write(migration_sql)

print(f"Created migration: {migration_path}")

# Push the migration
print("\nPushing migration to Supabase...")
result = subprocess.run(
    ["npx", "supabase", "db", "push", "--linked"],
    capture_output=True, text=True, cwd=r"C:\Users\taimd\Documents\New folder\remix-of-mlm-main"
)
print(f"stdout: {result.stdout}")
print(f"stderr: {result.stderr}")
print(f"returncode: {result.returncode}")

if result.returncode == 0:
    print("\nMigration pushed successfully!")
    
    # Now create the profile for t6661195@gmail.com
    print("\nCreating profile for t6661195@gmail.com...")
    result = api_request("POST", "/rest/v1/profiles", {
        "user_id": "d99a1753-39c8-4b74-b558-4d64cd88bf8c",
        "email": "t6661195@gmail.com",
        "first_name": "Taim",
        "last_name": "D",
        "role": "admin",
        "status": "active",
        "terms_accepted": True,
        "privacy_accepted": True,
    })
    if result:
        pid = result[0]["id"] if isinstance(result, list) else result.get("id")
        print(f"  Profile created: {pid}")
        
        # Create roles
        print("  Creating roles...")
        roles = api_request("POST", "/rest/v1/user_roles", [
            {"user_id": pid, "role": "admin"},
            {"user_id": pid, "role": "partner"},
        ])
        print(f"  Roles: {roles}")
    
    # Final check
    print("\n=== FINAL STATE ===")
    for p in api_request("GET", "/rest/v1/profiles?select=id,user_id,email,role,status") or []:
        print(f"  Profile: {p}")
    for r in api_request("GET", "/rest/v1/user_roles?select=*") or []:
        print(f"  Role: {r}")
else:
    print(f"\nMigration failed!")
