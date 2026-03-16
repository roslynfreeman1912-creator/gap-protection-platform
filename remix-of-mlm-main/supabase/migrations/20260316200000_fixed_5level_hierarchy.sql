-- =============================================
-- FIXED 5-LEVEL HIERARCHY — Breite statt Tiefe
-- =============================================
-- Modell: Feste 5 Ebenen, unbegrenzte Breite
--
-- Ebene 1: Geschäftsführer  (1 Person, Chef)
-- Ebene 2: Verkaufsleiter   (unbegrenzt viele)
-- Ebene 3: Regional Manager (unbegrenzt viele)
-- Ebene 4: Teamleiter       (unbegrenzt viele)
-- Ebene 5: Agent            (unbegrenzt viele)
--
-- Regel: Niemand fällt raus. Die Tiefe ist auf 5 begrenzt.
-- Jeder kann beliebig viele direkte Untergebene haben.
-- Provisionen fließen von Ebene 5 → Ebene 1 (alle 5 aktiv).
-- =============================================

-- 1. Ebenen-Bezeichnungen Tabelle
CREATE TABLE IF NOT EXISTS public.hierarchy_levels (
  level_number  INTEGER PRIMARY KEY CHECK (level_number BETWEEN 1 AND 5),
  name          TEXT NOT NULL,
  description   TEXT,
  max_depth     INTEGER DEFAULT 1,  -- immer 1, da feste Ebenen
  created_at    TIMESTAMPTZ DEFAULT NOW()
);

-- Ebenen befüllen
INSERT INTO public.hierarchy_levels (level_number, name, description) VALUES
  (1, 'Geschäftsführer', 'Oberste Ebene — Chef des Unternehmens'),
  (2, 'Verkaufsleiter',  'Leitet mehrere Regional Manager'),
  (3, 'Regional Manager','Leitet mehrere Teamleiter'),
  (4, 'Teamleiter',      'Leitet mehrere Agenten'),
  (5, 'Agent',           'Direkter Kundenkontakt, nutzt Promo-Code')
ON CONFLICT (level_number) DO UPDATE SET
  name = EXCLUDED.name,
  description = EXCLUDED.description;

-- 2. Spalte für feste Ebene in profiles
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS org_level INTEGER
    CHECK (org_level BETWEEN 1 AND 5)
    DEFAULT 5;  -- Standard: Agent (Ebene 5)

COMMENT ON COLUMN public.profiles.org_level IS
  '1=Geschäftsführer, 2=Verkaufsleiter, 3=Regional Manager, 4=Teamleiter, 5=Agent';

-- 3. Funktion: Berechne Hierarchie basierend auf org_level (feste Ebenen)
--    Jeder Partner sieht alle seine Vorfahren bis Ebene 1.
--    is_active_for_commission = TRUE für alle (max 5 Ebenen, alle aktiv).
CREATE OR REPLACE FUNCTION public.calculate_hierarchy()
RETURNS TRIGGER AS $$
DECLARE
    v_current_id   UUID;
    v_level        INTEGER;
    v_org_level    INTEGER;
BEGIN
    -- Nur wenn Sponsor gesetzt
    IF NEW.sponsor_id IS NULL THEN
        RETURN NEW;
    END IF;

    -- Eigene Ebene bestimmen
    v_org_level := COALESCE(NEW.org_level, 5);

    v_current_id := NEW.sponsor_id;
    v_level := 1;  -- Abstand vom neuen Mitarbeiter

    -- Gehe die Kette hoch (max 5 Schritte, da max 5 Ebenen)
    WHILE v_current_id IS NOT NULL AND v_level <= 5 LOOP

        INSERT INTO public.user_hierarchy (
            user_id,
            ancestor_id,
            level_number,
            is_active_for_commission
        )
        VALUES (
            NEW.id,
            v_current_id,
            v_level,
            TRUE  -- Alle 5 Ebenen sind IMMER aktiv (kein Shift, kein Ausfall)
        )
        ON CONFLICT (user_id, ancestor_id)
        DO UPDATE SET
            level_number             = EXCLUDED.level_number,
            is_active_for_commission = TRUE,
            updated_at               = NOW();

        -- Nächsten Vorfahren holen
        SELECT sponsor_id INTO v_current_id
        FROM public.profiles
        WHERE id = v_current_id;

        v_level := v_level + 1;
    END LOOP;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

-- Trigger aktualisieren
DROP TRIGGER IF EXISTS calculate_hierarchy_trigger ON public.profiles;
DROP TRIGGER IF EXISTS calculate_hierarchy_on_insert ON public.profiles;

CREATE TRIGGER calculate_hierarchy_trigger
    AFTER INSERT OR UPDATE OF sponsor_id, org_level ON public.profiles
    FOR EACH ROW
    EXECUTE FUNCTION public.calculate_hierarchy();

-- 4. Funktion: Prüfe ob ein neuer Mitarbeiter auf der richtigen Ebene ist
--    Ein Agent (Ebene 5) kann nur unter Teamleiter (Ebene 4) stehen, usw.
CREATE OR REPLACE FUNCTION public.validate_org_level()
RETURNS TRIGGER AS $$
DECLARE
    v_sponsor_level INTEGER;
BEGIN
    IF NEW.sponsor_id IS NULL OR NEW.org_level IS NULL THEN
        RETURN NEW;
    END IF;

    SELECT org_level INTO v_sponsor_level
    FROM public.profiles
    WHERE id = NEW.sponsor_id;

    -- Sponsor muss eine Ebene höher sein (niedrigere Nummer = höhere Position)
    IF v_sponsor_level IS NOT NULL AND NEW.org_level <= v_sponsor_level THEN
        RAISE EXCEPTION 'Ungültige Ebene: Mitarbeiter (Ebene %) kann nicht unter Sponsor (Ebene %) stehen. Sponsor muss höher sein.',
            NEW.org_level, v_sponsor_level;
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

CREATE TRIGGER validate_org_level_trigger
    BEFORE INSERT OR UPDATE OF org_level, sponsor_id ON public.profiles
    FOR EACH ROW
    WHEN (NEW.org_level IS NOT NULL AND NEW.sponsor_id IS NOT NULL)
    EXECUTE FUNCTION public.validate_org_level();

-- 5. Funktion: Alle Untergebenen eines Mitarbeiters anzeigen (Breite)
CREATE OR REPLACE FUNCTION public.get_downline(p_profile_id UUID)
RETURNS TABLE (
    profile_id   UUID,
    full_name    TEXT,
    org_level    INTEGER,
    level_name   TEXT,
    partner_number TEXT,
    promotion_code TEXT,
    direct_sponsor_id UUID,
    depth        INTEGER  -- Abstand vom Ausgangspunkt
) AS $$
BEGIN
    RETURN QUERY
    WITH RECURSIVE downline AS (
        -- Direkte Untergebene
        SELECT
            p.id,
            p.first_name || ' ' || p.last_name,
            p.org_level,
            hl.name,
            p.partner_number,
            p.promotion_code,
            p.sponsor_id,
            1 AS depth
        FROM public.profiles p
        LEFT JOIN public.hierarchy_levels hl ON hl.level_number = p.org_level
        WHERE p.sponsor_id = p_profile_id

        UNION ALL

        -- Rekursiv alle weiteren Untergebenen
        SELECT
            p2.id,
            p2.first_name || ' ' || p2.last_name,
            p2.org_level,
            hl2.name,
            p2.partner_number,
            p2.promotion_code,
            p2.sponsor_id,
            d.depth + 1
        FROM public.profiles p2
        LEFT JOIN public.hierarchy_levels hl2 ON hl2.level_number = p2.org_level
        INNER JOIN downline d ON d.id = p2.sponsor_id
        WHERE d.depth < 5  -- Max 5 Ebenen Tiefe
    )
    SELECT * FROM downline ORDER BY depth, full_name;
END;
$$ LANGUAGE plpgsql SET search_path = public;

-- 6. View: Vollständige Organisationsstruktur
CREATE OR REPLACE VIEW public.org_structure AS
SELECT
    p.id,
    p.first_name || ' ' || p.last_name AS full_name,
    p.email,
    p.org_level,
    hl.name AS level_name,
    p.partner_number,
    p.promotion_code,
    p.sponsor_id,
    sp.first_name || ' ' || sp.last_name AS sponsor_name,
    sp.org_level AS sponsor_level,
    p.status,
    p.created_at,
    -- Anzahl direkter Untergebener
    (SELECT COUNT(*) FROM public.profiles sub WHERE sub.sponsor_id = p.id) AS direct_reports
FROM public.profiles p
LEFT JOIN public.hierarchy_levels hl ON hl.level_number = p.org_level
LEFT JOIN public.profiles sp ON sp.id = p.sponsor_id
WHERE p.role IN ('partner', 'admin')
ORDER BY p.org_level, p.created_at;

-- 7. View: Provisionsübersicht pro Ebene
CREATE OR REPLACE VIEW public.commission_by_level AS
SELECT
    hl.level_number,
    hl.name AS level_name,
    COUNT(DISTINCT c.partner_id) AS partners_with_commissions,
    SUM(c.commission_amount) AS total_commissions,
    SUM(CASE WHEN c.status = 'pending'  THEN c.commission_amount ELSE 0 END) AS pending,
    SUM(CASE WHEN c.status = 'approved' THEN c.commission_amount ELSE 0 END) AS approved,
    SUM(CASE WHEN c.status = 'paid'     THEN c.commission_amount ELSE 0 END) AS paid
FROM public.commissions c
JOIN public.user_hierarchy uh ON uh.ancestor_id = c.partner_id
JOIN public.profiles p ON p.id = c.partner_id
JOIN public.hierarchy_levels hl ON hl.level_number = COALESCE(p.org_level, 5)
GROUP BY hl.level_number, hl.name
ORDER BY hl.level_number;

-- 8. Bestehende Profile: org_level aus Rolle ableiten
UPDATE public.profiles SET org_level = 1 WHERE role = 'admin';
UPDATE public.profiles SET org_level = 5 WHERE role = 'partner' AND org_level IS NULL;

-- 9. Alle Hierarchien neu aufbauen (mit korrektem is_active_for_commission = TRUE)
UPDATE public.user_hierarchy
SET is_active_for_commission = TRUE,
    updated_at = NOW()
WHERE level_number <= 5;

UPDATE public.user_hierarchy
SET is_active_for_commission = FALSE,
    updated_at = NOW()
WHERE level_number > 5;

-- 10. Grants
GRANT SELECT ON public.hierarchy_levels TO authenticated;
GRANT SELECT ON public.org_structure TO authenticated;
GRANT SELECT ON public.commission_by_level TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_downline TO authenticated;
GRANT EXECUTE ON FUNCTION public.validate_org_level TO authenticated;
