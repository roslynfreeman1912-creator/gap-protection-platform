-- =============================================
-- NEW COMMISSION STRUCTURE: 45/20/15/10/10
-- + 50€ ONE-TIME BONUS
-- + NEW ROLES: mlm_manager, verkaufsleiter, agent
-- =============================================
-- Vertragsgrundlage: 299 € netto/Monat
-- Fix: 50 € einmalige Abschlussprämie (Monat 1)
-- Fix: 100 € monatliche Strukturprovision (45/20/15/10/10)
-- Rest beim Unternehmen: 149 € (199€ - 50€ Bonus im 1. Monat)
-- =============================================

-- 1. Neue Rollen hinzufügen
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'app_role') THEN
    CREATE TYPE public.app_role AS ENUM (
      'super_admin', 'admin', 'partner', 'callcenter', 'customer', 'cc_broker',
      'mlm_manager', 'verkaufsleiter', 'agent'
    );
  ELSE
    -- Neue Werte zur bestehenden Enum hinzufügen (falls nicht vorhanden)
    BEGIN
      ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'mlm_manager';
    EXCEPTION WHEN duplicate_object THEN NULL;
    END;
    BEGIN
      ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'verkaufsleiter';
    EXCEPTION WHEN duplicate_object THEN NULL;
    END;
    BEGIN
      ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'agent';
    EXCEPTION WHEN duplicate_object THEN NULL;
    END;
  END IF;
END $$;

-- 2. Provisionssätze aktualisieren: 45/20/15/10/10
-- Basis: 299 € Vertrag → 100 € Strukturprovision
-- Level 1 = 45 € = 45% von 100 € = 15.05% von 299 €
-- Level 2 = 20 € = 20% von 100 € = 6.69% von 299 €
-- Level 3 = 15 € = 15% von 100 € = 5.02% von 299 €
-- Level 4 = 10 € = 10% von 100 € = 3.34% von 299 €
-- Level 5 = 10 € = 10% von 100 € = 3.34% von 299 €
-- Gesamt: 100 € = 33.44% von 299 €
-- Wir speichern FESTE EURO-BETRÄGE (nicht Prozent von 299€)
INSERT INTO public.mlm_settings (key, value, label, category) VALUES
  ('commission_rate_level_1', 45, 'Provision Ebene 1 — Direkter Sponsor (45 €)', 'commissions'),
  ('commission_rate_level_2', 20, 'Provision Ebene 2 (20 €)', 'commissions'),
  ('commission_rate_level_3', 15, 'Provision Ebene 3 (15 €)', 'commissions'),
  ('commission_rate_level_4', 10, 'Provision Ebene 4 (10 €)', 'commissions'),
  ('commission_rate_level_5', 10, 'Provision Ebene 5 — oberstes Fenster (10 €)', 'commissions'),
  ('commission_mode', 0, 'Berechnungsmodus: 0=Festbetrag, 1=Prozent', 'commissions'),
  ('contract_price', 299, 'Vertragsgrundpreis (€ netto/Monat)', 'general'),
  ('total_commission_per_contract', 100, 'Gesamtprovision pro Vertrag/Monat (€)', 'commissions'),
  ('one_time_bonus', 50, 'Einmalige Abschlussprämie im 1. Monat (€)', 'commissions'),
  ('company_margin', 149, 'Unternehmensanteil pro Vertrag/Monat (€)', 'general'),
  ('max_levels', 5, 'Maximale Provisionsebenen (Fenstergröße)', 'general'),
  ('window_size', 5, 'Sliding Window Größe', 'general')
ON CONFLICT (key) DO UPDATE SET
  value = EXCLUDED.value,
  label = EXCLUDED.label,
  updated_at = NOW();

-- 3. Tabelle für One-Time Bonus Tracking
CREATE TABLE IF NOT EXISTS public.first_sale_bonuses (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  partner_id      UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  transaction_id  UUID NOT NULL REFERENCES public.transactions(id) ON DELETE CASCADE,
  bonus_amount    NUMERIC(10,2) NOT NULL DEFAULT 50.00,
  status          TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'paid', 'cancelled')),
  paid_at         TIMESTAMPTZ,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(partner_id) -- Nur einmal pro Partner
);

ALTER TABLE public.first_sale_bonuses ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can manage bonuses" ON public.first_sale_bonuses
  FOR ALL USING (
    EXISTS (SELECT 1 FROM public.user_roles ur WHERE ur.user_id = auth.uid() AND ur.role IN ('admin', 'super_admin'))
  );

CREATE POLICY "Partners can view own bonus" ON public.first_sale_bonuses
  FOR SELECT USING (
    partner_id = (SELECT id FROM public.profiles WHERE user_id = auth.uid())
  );

-- 4. Funktion: Prüfen ob erster Verkauf (für Bonus)
CREATE OR REPLACE FUNCTION public.is_first_sale(p_partner_id UUID)
RETURNS BOOLEAN AS $$
BEGIN
  RETURN NOT EXISTS (
    SELECT 1 FROM public.first_sale_bonuses
    WHERE partner_id = p_partner_id
  );
END;
$$ LANGUAGE plpgsql SET search_path = public;

-- 5. Leadership Pool Ränge aktualisieren (korrekte Qualifikationen)
-- Zuerst bestehende Ränge löschen und neu erstellen
DELETE FROM public.ranks WHERE name IN ('Business Partner Plus', 'National Partner', 'World Partner');

INSERT INTO public.ranks (name, level, shares_count, min_direct_partners, min_active_contracts, description) VALUES
  ('Business Partner Plus', 1, 1, 5, 500,
   'mind. 5 aktive direkte Partner + mind. 500 aktive Verträge im Team (≈ 149.500 € Teamumsatz/Monat)'),
  ('National Partner', 2, 3, 5, 1500,
   'mind. 5 direkte Partner + mind. 1.500 aktive Verträge + mind. 3 direkte Partner mit Level 1'),
  ('World Partner', 3, 7, 7, 7500,
   'mind. 7 direkte Partner + mind. 7.500 aktive Verträge + 5 Partner Level 1 + 3 Partner Level 2')
ON CONFLICT (name) DO UPDATE SET
  level = EXCLUDED.level,
  shares_count = EXCLUDED.shares_count,
  min_direct_partners = EXCLUDED.min_direct_partners,
  min_active_contracts = EXCLUDED.min_active_contracts,
  description = EXCLUDED.description,
  updated_at = NOW();

-- 6. Spalten zu ranks hinzufügen falls nicht vorhanden
ALTER TABLE public.ranks
  ADD COLUMN IF NOT EXISTS min_direct_partners INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS min_active_contracts INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS min_level1_partners INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS min_level2_partners INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS description TEXT;

-- Qualifikationen für National Partner und World Partner
UPDATE public.ranks SET min_level1_partners = 3 WHERE name = 'National Partner';
UPDATE public.ranks SET min_level1_partners = 5, min_level2_partners = 3 WHERE name = 'World Partner';

-- 7. Pool Config sicherstellen
INSERT INTO public.pool_config (name, percentage_cap, is_active) VALUES
  ('leadership_pool', 2, true)
ON CONFLICT (name) DO UPDATE SET
  percentage_cap = 2,
  is_active = true;

-- 8. Grants für neue Tabelle
GRANT SELECT ON public.first_sale_bonuses TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_first_sale TO authenticated;

-- =============================================
-- FERTIG: Neue Provisionsstruktur aktiv
-- 45 € / 20 € / 15 € / 10 € / 10 € pro Monat
-- + 50 € einmalige Abschlussprämie
-- Leadership Pool: max 2% Gesamtumsatz
-- =============================================

-- 9. Hilfsfunktion: has_any_role (prüft ob User eine der angegebenen Rollen hat)
CREATE OR REPLACE FUNCTION public.has_any_role(_user_id UUID, _roles TEXT[])
RETURNS BOOLEAN AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id
      AND role::TEXT = ANY(_roles)
  );
END;
$$ LANGUAGE plpgsql SET search_path = public SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION public.has_any_role TO authenticated;
GRANT EXECUTE ON FUNCTION public.has_any_role TO service_role;
