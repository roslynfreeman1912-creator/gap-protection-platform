-- =============================================
-- SLIDING WINDOW FIX — 5-Ebenen-Verschiebung
-- =============================================
-- Regel: Immer nur die 5 NÄCHSTEN Vorfahren eines Kunden
-- erhalten Provision. Level 1 = direkter Sponsor,
-- Level 5 = 5. Vorfahre. Ab Level 6 aufwärts: inaktiv.
-- Das "Shift" passiert automatisch, weil wir immer
-- relativ zum Kunden zählen, nicht absolut in der Firma.
-- =============================================

-- 1. Korrigiere calculate_hierarchy Trigger-Funktion
--    Sliding Window = level_number <= 5 relativ zum Kunden
CREATE OR REPLACE FUNCTION public.calculate_hierarchy()
RETURNS TRIGGER AS $$
DECLARE
    current_sponsor_id UUID;
    current_level INTEGER := 1;
BEGIN
    IF NEW.sponsor_id IS NULL THEN
        RETURN NEW;
    END IF;

    current_sponsor_id := NEW.sponsor_id;

    -- Gehe die Sponsor-Kette hoch (max 20 Ebenen für Sicherheit)
    WHILE current_sponsor_id IS NOT NULL AND current_level <= 20 LOOP

        INSERT INTO public.user_hierarchy (
            user_id,
            ancestor_id,
            level_number,
            is_active_for_commission
        )
        VALUES (
            NEW.id,
            current_sponsor_id,
            current_level,
            -- SLIDING WINDOW: Nur die ersten 5 Ebenen relativ zum Kunden sind aktiv
            -- Level 1 = direkter Sponsor → aktiv
            -- Level 5 = 5. Vorfahre → aktiv
            -- Level 6+ → inaktiv (der "Chef" fällt raus)
            current_level <= 5
        )
        ON CONFLICT (user_id, ancestor_id)
        DO UPDATE SET
            level_number = EXCLUDED.level_number,
            is_active_for_commission = EXCLUDED.is_active_for_commission,
            updated_at = NOW();

        -- Nächsten Sponsor holen
        SELECT sponsor_id INTO current_sponsor_id
        FROM public.profiles
        WHERE id = current_sponsor_id;

        current_level := current_level + 1;
    END LOOP;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

-- Trigger neu erstellen
DROP TRIGGER IF EXISTS calculate_hierarchy_trigger ON public.profiles;
CREATE TRIGGER calculate_hierarchy_trigger
    AFTER INSERT OR UPDATE OF sponsor_id ON public.profiles
    FOR EACH ROW
    EXECUTE FUNCTION public.calculate_hierarchy();

-- 2. Funktion: Hierarchie für einen einzelnen User neu berechnen
CREATE OR REPLACE FUNCTION public.rebuild_user_hierarchy(p_user_id UUID)
RETURNS INTEGER AS $$
DECLARE
    v_sponsor_id UUID;
    v_current_id UUID;
    v_level INTEGER := 1;
    v_count INTEGER := 0;
BEGIN
    -- Alten Eintrag löschen
    DELETE FROM public.user_hierarchy WHERE user_id = p_user_id;

    -- Sponsor holen
    SELECT sponsor_id INTO v_sponsor_id
    FROM public.profiles WHERE id = p_user_id;

    IF v_sponsor_id IS NULL THEN
        RETURN 0;
    END IF;

    v_current_id := v_sponsor_id;

    WHILE v_current_id IS NOT NULL AND v_level <= 20 LOOP
        INSERT INTO public.user_hierarchy (
            user_id, ancestor_id, level_number, is_active_for_commission
        ) VALUES (
            p_user_id, v_current_id, v_level, v_level <= 5
        )
        ON CONFLICT (user_id, ancestor_id) DO UPDATE SET
            level_number = EXCLUDED.level_number,
            is_active_for_commission = EXCLUDED.is_active_for_commission,
            updated_at = NOW();

        v_count := v_count + 1;

        SELECT sponsor_id INTO v_current_id
        FROM public.profiles WHERE id = v_current_id;

        v_level := v_level + 1;
    END LOOP;

    RETURN v_count;
END;
$$ LANGUAGE plpgsql SET search_path = public;

-- 3. Funktion: Gesamte Hierarchie neu aufbauen (für Admin)
CREATE OR REPLACE FUNCTION public.rebuild_all_hierarchies()
RETURNS TABLE(processed INTEGER, entries INTEGER) AS $$
DECLARE
    v_profile RECORD;
    v_processed INTEGER := 0;
    v_entries INTEGER := 0;
    v_result INTEGER;
BEGIN
    FOR v_profile IN
        SELECT id FROM public.profiles
        WHERE sponsor_id IS NOT NULL
        ORDER BY created_at ASC
    LOOP
        v_result := public.rebuild_user_hierarchy(v_profile.id);
        v_entries := v_entries + v_result;
        v_processed := v_processed + 1;
    END LOOP;

    RETURN QUERY SELECT v_processed, v_entries;
END;
$$ LANGUAGE plpgsql SET search_path = public;

-- 4. View: Zeigt die aktive Sliding-Window-Kette für jeden Kunden
CREATE OR REPLACE VIEW public.active_commission_chain AS
SELECT
    uh.user_id,
    p_user.first_name || ' ' || p_user.last_name AS customer_name,
    uh.ancestor_id,
    p_anc.first_name || ' ' || p_anc.last_name AS ancestor_name,
    p_anc.partner_number,
    uh.level_number,
    uh.is_active_for_commission,
    CASE
        WHEN uh.level_number = 1 THEN 'Direkter Sponsor'
        WHEN uh.level_number = 2 THEN 'Verkaufsleiter'
        WHEN uh.level_number = 3 THEN 'Regional Manager'
        WHEN uh.level_number = 4 THEN 'Direktor'
        WHEN uh.level_number = 5 THEN 'Geschäftsführer (aktiv)'
        ELSE 'Inaktiv (außerhalb Fenster)'
    END AS position_label
FROM public.user_hierarchy uh
JOIN public.profiles p_user ON p_user.id = uh.user_id
JOIN public.profiles p_anc  ON p_anc.id  = uh.ancestor_id
ORDER BY uh.user_id, uh.level_number;

-- 5. Bestehende Hierarchie-Daten korrigieren
--    Alle Einträge mit level_number <= 5 → aktiv
--    Alle Einträge mit level_number > 5  → inaktiv
UPDATE public.user_hierarchy
SET is_active_for_commission = (level_number <= 5),
    updated_at = NOW();

-- 6. Grants
GRANT EXECUTE ON FUNCTION public.rebuild_user_hierarchy TO authenticated;
GRANT EXECUTE ON FUNCTION public.rebuild_all_hierarchies TO authenticated;
GRANT SELECT ON public.active_commission_chain TO authenticated;
