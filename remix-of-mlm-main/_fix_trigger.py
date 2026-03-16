import psycopg2

conn = psycopg2.connect(
    host="aws-1-eu-north-1.pooler.supabase.com",
    port=5432,
    dbname="postgres",
    user="postgres.pqnzsihfryjnnhdubisk",
    password="galal123.DE12",
    sslmode="require"
)
conn.autocommit = True
cur = conn.cursor()

# Fix the calculate_hierarchy function:
# The ON CONFLICT (user_id, ancestor_id) doesn't match the unique constraint
# which is UNIQUE (user_id, ancestor_id, hierarchy_type)
# Need to add hierarchy_type to the INSERT and ON CONFLICT

print("Fixing calculate_hierarchy function...")
cur.execute("""
CREATE OR REPLACE FUNCTION public.calculate_hierarchy()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
DECLARE
    current_sponsor_id UUID;
    current_level INTEGER := 1;
    model_record RECORD;
BEGIN
    -- Nur wenn Sponsor gesetzt ist
    IF NEW.sponsor_id IS NOT NULL THEN
        current_sponsor_id := NEW.sponsor_id;

        -- Durch die Sponsor-Kette iterieren
        WHILE current_sponsor_id IS NOT NULL AND current_level <= 10 LOOP
            -- Eintrag in Hierarchie erstellen
            INSERT INTO public.user_hierarchy (user_id, ancestor_id, level_number, is_active_for_commission, hierarchy_type)
            VALUES (NEW.id, current_sponsor_id, current_level, current_level <= 5, 'mlm')
            ON CONFLICT (user_id, ancestor_id, hierarchy_type) DO NOTHING;

            -- Nächsten Sponsor holen
            SELECT sponsor_id INTO current_sponsor_id
            FROM public.profiles
            WHERE id = current_sponsor_id;

            current_level := current_level + 1;
        END LOOP;

        -- Dynamic Shift prüfen (Level 6+ deaktiviert Level 1)
        FOR model_record IN
            SELECT id FROM public.commission_models WHERE uses_dynamic_shift = TRUE AND is_active = TRUE
        LOOP
            UPDATE public.user_hierarchy
            SET is_active_for_commission = FALSE
            WHERE ancestor_id IN (
                SELECT ancestor_id
                FROM public.user_hierarchy
                WHERE user_id = NEW.id AND level_number > 5
            )
            AND level_number = 1
            AND user_id = NEW.id;
        END LOOP;
    END IF;

    RETURN NEW;
END;
$function$
""")
print("  Done! calculate_hierarchy fixed.")

# Verify it was updated
cur.execute("SELECT pg_get_functiondef(p.oid) FROM pg_proc p WHERE p.proname = 'calculate_hierarchy'")
row = cur.fetchone()
if row and 'hierarchy_type' in row[0]:
    print("  Verified: hierarchy_type is now in the function.")
else:
    print("  WARNING: hierarchy_type NOT found in updated function!")

cur.close()
conn.close()
print("\nDone!")
