#!/usr/bin/env python3
"""Create mlm_settings table and add configurable commission rates + texts.

SECURITY:
- Database credentials must come from environment variables.
- Never commit real host/user/password or keys into this script.
"""
import os
import psycopg2

DB_CONFIG = {
    'host': os.getenv('MLM_DB_HOST', ''),
    'port': int(os.getenv('MLM_DB_PORT', '5432')),
    'dbname': os.getenv('MLM_DB_NAME', ''),
    'user': os.getenv('MLM_DB_USER', ''),
    'password': os.getenv('MLM_DB_PASSWORD', ''),
    'sslmode': os.getenv('MLM_DB_SSLMODE', 'require'),
}

def main():
    missing = [k for k, v in DB_CONFIG.items() if k != 'sslmode' and not v]
    if missing:
        raise SystemExit(
            f"Missing DB configuration values for: {', '.join(missing)}. "
            "Set MLM_DB_HOST/MLM_DB_NAME/MLM_DB_USER/MLM_DB_PASSWORD in your environment."
        )

    conn = psycopg2.connect(**DB_CONFIG)
    conn.autocommit = True
    cur = conn.cursor()

    # 1. Check existing tables
    print("=== Checking existing tables ===")
    cur.execute("""
        SELECT table_name FROM information_schema.tables 
        WHERE table_schema = 'public' 
        ORDER BY table_name
    """)
    tables = [r[0] for r in cur.fetchall()]
    print(f"  Tables: {tables}")

    # 2. Check if mlm_settings already exists
    if 'mlm_settings' in tables:
        print("\n  mlm_settings already exists, checking content...")
        cur.execute("SELECT * FROM mlm_settings")
        rows = cur.fetchall()
        for r in rows:
            print(f"    {r}")
    else:
        print("\n=== Creating mlm_settings table ===")
        cur.execute("""
            CREATE TABLE mlm_settings (
                id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
                key TEXT UNIQUE NOT NULL,
                value JSONB NOT NULL,
                label TEXT,
                category TEXT DEFAULT 'general',
                updated_at TIMESTAMPTZ DEFAULT now(),
                updated_by UUID REFERENCES profiles(id)
            )
        """)
        print("  Table created!")

        # Disable RLS on mlm_settings (service role only)
        cur.execute("ALTER TABLE mlm_settings ENABLE ROW LEVEL SECURITY")
        cur.execute("""
            CREATE POLICY "Service role full access" ON mlm_settings
            FOR ALL USING (true) WITH CHECK (true)
        """)
        print("  RLS enabled with full access policy")

    # 3. Insert default settings
    print("\n=== Inserting default settings ===")
    
    settings = [
        # Commission rates
        ('commission_rate_level_1', '10', 'Provision Level 1 (%)', 'commissions'),
        ('commission_rate_level_2', '5', 'Provision Level 2 (%)', 'commissions'),
        ('commission_rate_level_3', '4', 'Provision Level 3 (%)', 'commissions'),
        ('commission_rate_level_4', '3', 'Provision Level 4 (%)', 'commissions'),
        ('commission_rate_level_5', '2', 'Provision Level 5 (%)', 'commissions'),
        ('max_levels', '5', 'Maximale Stufen', 'commissions'),
        
        # Level descriptions
        ('level_1_description', '"Direkt geworbene Partner"', 'Beschreibung Level 1', 'labels'),
        ('level_2_description', '"Partner auf Stufe 2 (durch Stufe 1 geworben)"', 'Beschreibung Level 2', 'labels'),
        ('level_3_description', '"Partner auf Stufe 3 (durch Stufe 2 geworben)"', 'Beschreibung Level 3', 'labels'),
        ('level_4_description', '"Partner auf Stufe 4 (durch Stufe 3 geworben)"', 'Beschreibung Level 4', 'labels'),
        ('level_5_description', '"Partner auf Stufe 5 (durch Stufe 4 geworben)"', 'Beschreibung Level 5', 'labels'),
        
        # Dashboard texts
        ('dashboard_title', '"MLM Dashboard"', 'Dashboard Titel', 'branding'),
        ('company_name', '"GAP Protection Ltd"', 'Firmenname', 'branding'),
        ('company_subtitle', '"Partner Management"', 'Untertitel', 'branding'),
        ('overview_title', '"Übersicht"', 'Übersicht Titel', 'labels'),
        ('downline_title', '"Meine Struktur"', 'Struktur Titel', 'labels'),
        ('tree_title', '"Baumansicht"', 'Baumansicht Titel', 'labels'),
        ('commissions_title', '"Provisionen"', 'Provisionen Titel', 'labels'),
        ('profile_title', '"Mein Profil"', 'Profil Titel', 'labels'),
        
        # Stat card labels
        ('label_total_partners', '"Partner gesamt"', 'Label: Partner gesamt', 'labels'),
        ('label_total_downline', '"Downline gesamt"', 'Label: Downline gesamt', 'labels'),
        ('label_active_partners', '"Aktive Partner"', 'Label: Aktive Partner', 'labels'),
        ('label_pending', '"Ausstehend"', 'Label: Ausstehend', 'labels'),
        ('label_paid', '"Ausgezahlt"', 'Label: Ausgezahlt', 'labels'),
        ('label_approved', '"Genehmigt"', 'Label: Genehmigt', 'labels'),
        
        # Section titles
        ('section_level_overview', '"5-Stufen Übersicht"', 'Abschnitt: Stufen Übersicht', 'labels'),
        ('section_level_overview_desc', '"Verteilung Ihrer Downline nach Stufen mit Provisionssätzen"', 'Beschreibung Stufen Übersicht', 'labels'),
        ('section_commission_table', '"Provisionsstufen"', 'Abschnitt: Provisionsstufen', 'labels'),
        
        # Currency
        ('currency', '"EUR"', 'Währung', 'general'),
        ('currency_locale', '"de-DE"', 'Währungsformat', 'general'),
    ]
    
    for key, value, label, category in settings:
        cur.execute("""
            INSERT INTO mlm_settings (key, value, label, category)
            VALUES (%s, %s::jsonb, %s, %s)
            ON CONFLICT (key) DO NOTHING
        """, (key, value, label, category))
    
    print("  Default settings inserted!")

    # 4. Verify
    print("\n=== Verifying settings ===")
    cur.execute("SELECT key, value, label, category FROM mlm_settings ORDER BY category, key")
    rows = cur.fetchall()
    current_cat = None
    for key, value, label, category in rows:
        if category != current_cat:
            current_cat = category
            print(f"\n  [{category.upper()}]")
        print(f"    {key} = {value} ({label})")

    cur.close()
    conn.close()
    print("\n=== DONE ===")

if __name__ == '__main__':
    main()
