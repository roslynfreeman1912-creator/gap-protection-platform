-- =============================================
-- ROLLING 5-LEVEL (SLIDING WINDOW) — FINAL
-- =============================================
-- Modell: Immer die letzten 5 Ebenen relativ zum Verkäufer
--
-- Beispiel Tiefe 5:
--   A(1) → B(2) → C(3) → D(4) → E(5) verkauft
--   Provision: E=2%, D=4%, C=6%, B=8%, A=10%
--
-- Beispiel Tiefe 6 (F unter E):
--   A → B → C → D → E → F verkauft
--   Fenster: F=2%, E=4%, D=6%, C=8%, B=10%
--   A fällt RAUS — bekommt 0%
--
-- Regel: level_number = Abstand vom Verkäufer nach oben
--   level 1 = direkter Sponsor (immer aktiv)
--   level 5 = 5. Vorfahre (aktiv)
--   level 6+ = außerhalb Fenster (inaktiv, 0 Provision)
-- =============================================

-- 1. Provisionssätze pro Ebene (konfigurierbar)
--    Level 1 = direkter Sponsor = 10%
--    Level 2 = 8%, Level 3 = 6%, Level 4 = 4%, Level 5 = 2%
INSERT INTO public.mlm_settings (key, value, label, category) VALUES
  ('commission_rate_level_1', 10, 'Provision Ebene 1 (direkter Sponsor)', 'commissions'),
  ('commission_rate_level_2', 8,  'Provision Ebene 2', 'commissions'),
  ('commission_rate_level_3', 6,  'Provision Ebene 3', 'commissions'),
  ('commission_rate_level_4', 4,  'Provision Ebene 4', 'commissions'),
  ('commission_rate_level_5', 2,  'Provision Ebene 5 (oberstes Fenster)', 'commissions'),
  ('max_levels', 5, 'Maximale Provisionsebenen (Fenstergröße)', 'general'),
  ('window_size', 5, 'Sliding Window Größe', 'general')
ON CONFLICT (key) DO UPDATE SET
  value = EXCLUDED.value,
  label = EXCLUDED.label,
  updated_at = NOW();

-- 2. calculate_hierarchy — Sliding Window Trigger
--    Speichert ALLE Vorfahren (bis 20 Ebenen tief),
--    aber is_active_for_commission = TRUE nur für level <= 5
CREATE OR REPLACE FUNCTION public.calculate_hierarchy()
RETURNS TRIGGER AS $$
DECLARE
    v_current_id UUID;
    v_level      INTEGER := 1;
BEGIN
    IF NEW.sponsor_id IS NULL THEN
        RETURN NEW;
    END IF;

    -- Alte Einträge für diesen User löschen (neu aufbauen)
    DELETE FROM public.user_hierarchy WHERE user_id = NEW.id;

    v_current_id := NEW.sponsor_id;

    -- Gehe die Kette hoch (max 20 für Sicherheit)
    WHILE v_current_id IS NOT NULL AND v_level <= 20 LOOP

        INSERT INTO public.user_hierarchy (
            user_id,
            ancestor_id,
            level_number,
            is_active_for_commission
        ) VALUES (
            NEW.id,
            v_current_id,
            v_level,
            v_level <= 5  -- SLIDING WINDOW: nur die 5 nächsten Vorfahren aktiv
        )
        ON CONFLICT (user_id, ancestor_id) DO UPDATE SET
            level_number             = EXCLUDED.level_number,
            is_active_for_commission = EXCLUDED.is_active_for_commission,
            updated_at               = NOW();

        SELECT sponsor_id INTO v_current_id
        FROM public.profiles
        WHERE id = v_current_id;

        v_level := v_level + 1;
    END LOOP;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

-- Trigger neu setzen
DROP TRIGGER IF EXISTS calculate_hierarchy_trigger ON public.profiles;
DROP TRIGGER IF EXISTS calculate_hierarchy_on_insert ON public.profiles;
DROP TRIGGER IF EXISTS validate_org_level_trigger ON public.profiles;

CREATE TRIGGER calculate_hierarchy_trigger
    AFTER INSERT OR UPDATE OF sponsor_id ON public.profiles
    FOR EACH ROW
    EXECUTE FUNCTION public.calculate_hierarchy();

-- 3. Funktion: Provision für einen Verkauf berechnen (Sliding Window)
--    Gibt die aktiven Empfänger zurück (max 5, relativ zum Verkäufer)
CREATE OR REPLACE FUNCTION public.get_commission_recipients(
    p_seller_id UUID,
    p_sale_amount NUMERIC
)
RETURNS TABLE (
    ancestor_id      UUID,
    full_name        TEXT,
    partner_number   TEXT,
    level_number     INTEGER,
    commission_rate  NUMERIC,
    commission_amount NUMERIC
) AS $$
DECLARE
    v_rates NUMERIC[] := ARRAY[10, 8, 6, 4, 2]; -- Level 1..5
BEGIN
    RETURN QUERY
    SELECT
        uh.ancestor_id,
        p.first_name || ' ' || p.last_name,
        p.partner_number,
        uh.level_number,
        v_rates[uh.level_number]::NUMERIC,
        ROUND((p_sale_amount * v_rates[uh.level_number] / 100)::NUMERIC, 2)
    FROM public.user_hierarchy uh
    JOIN public.profiles p ON p.id = uh.ancestor_id
    WHERE uh.user_id = p_seller_id
      AND uh.is_active_for_commission = TRUE
      AND uh.level_number <= 5
    ORDER BY uh.level_number;
END;
$$ LANGUAGE plpgsql SET search_path = public;

-- 4. View: Aktive Provisionskette (Sliding Window sichtbar)
CREATE OR REPLACE VIEW public.active_commission_chain AS
SELECT
    uh.user_id,
    pu.first_name || ' ' || pu.last_name  AS seller_name,
    pu.partner_number                      AS seller_number,
    uh.ancestor_id,
    pa.first_name || ' ' || pa.last_name  AS recipient_name,
    pa.partner_number                      AS recipient_number,
    uh.level_number,
    uh.is_active_for_commission,
    CASE uh.level_number
        WHEN 1 THEN 'Direkter Sponsor (10%)'
        WHEN 2 THEN 'Ebene 2 (8%)'
        WHEN 3 THEN 'Ebene 3 (6%)'
        WHEN 4 THEN 'Ebene 4 (4%)'
        WHEN 5 THEN 'Ebene 5 — oberstes Fenster (2%)'
        ELSE        'Außerhalb Fenster — kein Anspruch'
    END AS window_position
FROM public.user_hierarchy uh
JOIN public.profiles pu ON pu.id = uh.user_id
JOIN public.profiles pa ON pa.id = uh.ancestor_id
ORDER BY uh.user_id, uh.level_number;

-- 5. Funktion: Einzelnen User neu aufbauen
CREATE OR REPLACE FUNCTION public.rebuild_user_hierarchy(p_user_id UUID)
RETURNS INTEGER AS $$
DECLARE
    v_current_id UUID;
    v_level      INTEGER := 1;
    v_count      INTEGER := 0;
BEGIN
    DELETE FROM public.user_hierarchy WHERE user_id = p_user_id;

    SELECT sponsor_id INTO v_current_id
    FROM public.profiles WHERE id = p_user_id;

    IF v_current_id IS NULL THEN RETURN 0; END IF;

    WHILE v_current_id IS NOT NULL AND v_level <= 20 LOOP
        INSERT INTO public.user_hierarchy (
            user_id, ancestor_id, level_number, is_active_for_commission
        ) VALUES (
            p_user_id, v_current_id, v_level, v_level <= 5
        )
        ON CONFLICT (user_id, ancestor_id) DO UPDATE SET
            level_number             = EXCLUDED.level_number,
            is_active_for_commission = EXCLUDED.is_active_for_commission,
            updated_at               = NOW();

        v_count := v_count + 1;

        SELECT sponsor_id INTO v_current_id
        FROM public.profiles WHERE id = v_current_id;

        v_level := v_level + 1;
    END LOOP;

    RETURN v_count;
END;
$$ LANGUAGE plpgsql SET search_path = public;

-- 6. Funktion: Alle Hierarchien neu aufbauen
CREATE OR REPLACE FUNCTION public.rebuild_all_hierarchies()
RETURNS TABLE(processed INTEGER, entries INTEGER) AS $$
DECLARE
    v_profile   RECORD;
    v_processed INTEGER := 0;
    v_entries   INTEGER := 0;
BEGIN
    FOR v_profile IN
        SELECT id FROM public.profiles
        WHERE sponsor_id IS NOT NULL
        ORDER BY created_at ASC
    LOOP
        v_entries   := v_entries + public.rebuild_user_hierarchy(v_profile.id);
        v_processed := v_processed + 1;
    END LOOP;
    RETURN QUERY SELECT v_processed, v_entries;
END;
$$ LANGUAGE plpgsql SET search_path = public;

-- 7. Bestehende Daten korrigieren (Sliding Window anwenden)
UPDATE public.user_hierarchy
SET is_active_for_commission = (level_number <= 5),
    updated_at = NOW();

-- 8. Grants
GRANT SELECT ON public.active_commission_chain TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_commission_recipients TO authenticated;
GRANT EXECUTE ON FUNCTION public.rebuild_user_hierarchy TO authenticated;
GRANT EXECUTE ON FUNCTION public.rebuild_all_hierarchies TO authenticated;

-- =============================================
-- FERTIG: Rolling 5-Level Sliding Window aktiv
-- Tiefe: unbegrenzt (bis 20 gespeichert)
-- Provision: immer nur die 5 nächsten Vorfahren
-- Breite: unbegrenzt pro Ebene
-- =============================================
