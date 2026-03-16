-- =============================================
-- GAP PROTECTION MLM SYSTEM - DATENBANK SCHEMA
-- =============================================

-- 1. ENUM TYPES
-- =============================================

-- Benutzerrollen
CREATE TYPE public.user_role AS ENUM ('admin', 'partner', 'customer');

-- Benutzerstatus
CREATE TYPE public.user_status AS ENUM ('pending', 'active', 'suspended', 'cancelled');

-- Provisionstyp
CREATE TYPE public.commission_type AS ENUM ('fixed', 'percentage');

-- Transaktionsstatus
CREATE TYPE public.transaction_status AS ENUM ('pending', 'completed', 'failed', 'refunded');

-- Provisionsstatus
CREATE TYPE public.commission_status AS ENUM ('pending', 'approved', 'paid', 'cancelled');

-- Leadership Pool Level
CREATE TYPE public.pool_level AS ENUM ('business_partner_plus', 'national_partner', 'world_partner');

-- =============================================
-- 2. CORE TABLES
-- =============================================

-- Benutzer/Profile Tabelle
CREATE TABLE public.profiles (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL UNIQUE,
    
    -- Persönliche Daten
    first_name TEXT NOT NULL,
    last_name TEXT NOT NULL,
    email TEXT NOT NULL,
    phone TEXT,
    
    -- Ausweisdaten
    id_number TEXT, -- Ausweisnummer
    
    -- Adresse
    street TEXT,
    house_number TEXT,
    postal_code TEXT,
    city TEXT,
    country TEXT DEFAULT 'Deutschland',
    
    -- SEPA Daten
    iban TEXT,
    bic TEXT, -- Optional
    bank_name TEXT,
    account_holder TEXT,
    sepa_mandate_accepted BOOLEAN DEFAULT FALSE,
    sepa_mandate_date TIMESTAMPTZ,
    
    -- Domain/IP für Prüfung
    domain TEXT,
    ip_address TEXT,
    domain_verified BOOLEAN DEFAULT FALSE,
    
    -- Rollen & Status
    role user_role DEFAULT 'customer',
    status user_status DEFAULT 'pending',
    
    -- Partner-spezifisch
    promotion_code TEXT UNIQUE, -- Eigener Werbe-Code
    sponsor_id UUID REFERENCES public.profiles(id), -- Wer hat geworben
    
    -- Rechtliches
    terms_accepted BOOLEAN DEFAULT FALSE,
    privacy_accepted BOOLEAN DEFAULT FALSE,
    domain_owner_confirmed BOOLEAN DEFAULT FALSE,
    
    -- Timestamps
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Provisionsmodelle
CREATE TABLE public.commission_models (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL UNIQUE,
    description TEXT,
    uses_dynamic_shift BOOLEAN DEFAULT TRUE, -- MLM = true, Callcenter = false
    max_levels INTEGER DEFAULT 5,
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Provisionsregeln pro Stufe
CREATE TABLE public.commission_rules (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    model_id UUID REFERENCES public.commission_models(id) ON DELETE CASCADE NOT NULL,
    level_number INTEGER NOT NULL CHECK (level_number >= 1 AND level_number <= 5),
    commission_type commission_type NOT NULL,
    value DECIMAL(10,2) NOT NULL, -- Entweder Fixbetrag oder Prozentsatz
    description TEXT,
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    
    UNIQUE(model_id, level_number)
);

-- Benutzer-Hierarchie (vorberechnet für Performance)
CREATE TABLE public.user_hierarchy (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL,
    ancestor_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL,
    level_number INTEGER NOT NULL CHECK (level_number >= 1),
    is_active_for_commission BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    
    UNIQUE(user_id, ancestor_id)
);

-- Transaktionen (Kundenzahlungen)
CREATE TABLE public.transactions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    customer_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    amount DECIMAL(10,2) NOT NULL DEFAULT 299.00,
    currency TEXT DEFAULT 'EUR',
    status transaction_status DEFAULT 'pending',
    payment_method TEXT DEFAULT 'sepa',
    
    -- Rechnungsdaten
    invoice_number TEXT,
    invoice_date DATE,
    easybill_invoice_id TEXT, -- EasyBill Integration
    
    -- Provisionsverarbeitung
    commission_processed BOOLEAN DEFAULT FALSE,
    commission_processed_at TIMESTAMPTZ,
    
    -- Vertragsdetails
    contract_start_date DATE,
    contract_end_date DATE,
    is_first_payment BOOLEAN DEFAULT TRUE,
    
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Provisionen
CREATE TABLE public.commissions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    transaction_id UUID REFERENCES public.transactions(id) ON DELETE CASCADE NOT NULL,
    partner_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL,
    model_id UUID REFERENCES public.commission_models(id) ON DELETE SET NULL,
    
    level_number INTEGER NOT NULL,
    commission_type commission_type NOT NULL,
    base_amount DECIMAL(10,2) NOT NULL, -- Transaktionsbetrag
    commission_amount DECIMAL(10,2) NOT NULL, -- Berechnete Provision
    
    status commission_status DEFAULT 'pending',
    paid_at TIMESTAMPTZ,
    
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Leadership Pool Qualifikationen
CREATE TABLE public.leadership_qualifications (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    partner_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL UNIQUE,
    pool_level pool_level NOT NULL,
    
    -- Qualifikationskriterien
    direct_partners_count INTEGER DEFAULT 0,
    active_contracts_count INTEGER DEFAULT 0,
    level1_partners_count INTEGER DEFAULT 0, -- Partner mit Business Partner Plus
    level2_partners_count INTEGER DEFAULT 0, -- Partner mit National Partner
    
    -- Shares
    shares_count INTEGER NOT NULL DEFAULT 1,
    
    is_qualified BOOLEAN DEFAULT FALSE,
    qualified_at TIMESTAMPTZ,
    
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Leadership Pool Auszahlungen
CREATE TABLE public.leadership_pool_payouts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    partner_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL,
    pool_level pool_level NOT NULL,
    
    period_start DATE NOT NULL,
    period_end DATE NOT NULL,
    
    total_pool_amount DECIMAL(12,2) NOT NULL,
    total_shares INTEGER NOT NULL,
    share_value DECIMAL(10,4) NOT NULL,
    partner_shares INTEGER NOT NULL,
    payout_amount DECIMAL(10,2) NOT NULL,
    
    status commission_status DEFAULT 'pending',
    paid_at TIMESTAMPTZ,
    
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Promotion Codes
CREATE TABLE public.promotion_codes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    code TEXT NOT NULL UNIQUE,
    partner_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL,
    
    usage_count INTEGER DEFAULT 0,
    max_uses INTEGER, -- NULL = unbegrenzt
    is_active BOOLEAN DEFAULT TRUE,
    
    expires_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Security Test Logs (Teufel)
CREATE TABLE public.security_tests (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    
    -- Test-Anfrage
    domain TEXT,
    ip_address TEXT,
    test_type TEXT NOT NULL, -- 'small' oder 'big'
    
    -- Ergebnis
    result TEXT, -- 'green' oder 'red'
    details JSONB,
    
    -- Limiter (max 3 pro IP/Netzwerk)
    network_hash TEXT, -- Hash des Netzwerks
    test_count INTEGER DEFAULT 1,
    
    -- Benutzer (optional)
    user_id UUID REFERENCES public.profiles(id),
    
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Audit Log
CREATE TABLE public.audit_log (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    table_name TEXT NOT NULL,
    record_id UUID NOT NULL,
    action TEXT NOT NULL, -- INSERT, UPDATE, DELETE
    old_data JSONB,
    new_data JSONB,
    user_id UUID,
    ip_address TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- =============================================
-- 3. INDEXES
-- =============================================

CREATE INDEX idx_profiles_sponsor ON public.profiles(sponsor_id);
CREATE INDEX idx_profiles_promotion_code ON public.profiles(promotion_code);
CREATE INDEX idx_profiles_role ON public.profiles(role);
CREATE INDEX idx_profiles_status ON public.profiles(status);

CREATE INDEX idx_user_hierarchy_user ON public.user_hierarchy(user_id);
CREATE INDEX idx_user_hierarchy_ancestor ON public.user_hierarchy(ancestor_id);
CREATE INDEX idx_user_hierarchy_level ON public.user_hierarchy(level_number);
CREATE INDEX idx_user_hierarchy_active ON public.user_hierarchy(is_active_for_commission);

CREATE INDEX idx_transactions_customer ON public.transactions(customer_id);
CREATE INDEX idx_transactions_status ON public.transactions(status);
CREATE INDEX idx_transactions_commission_processed ON public.transactions(commission_processed);

CREATE INDEX idx_commissions_partner ON public.commissions(partner_id);
CREATE INDEX idx_commissions_transaction ON public.commissions(transaction_id);
CREATE INDEX idx_commissions_status ON public.commissions(status);

CREATE INDEX idx_security_tests_network ON public.security_tests(network_hash);
CREATE INDEX idx_security_tests_ip ON public.security_tests(ip_address);

-- =============================================
-- 4. FUNCTIONS
-- =============================================

-- Timestamp Update Funktion
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

-- Hierarchie-Berechnung bei neuer Registrierung
CREATE OR REPLACE FUNCTION public.calculate_hierarchy()
RETURNS TRIGGER AS $$
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
            INSERT INTO public.user_hierarchy (user_id, ancestor_id, level_number, is_active_for_commission)
            VALUES (NEW.id, current_sponsor_id, current_level, current_level <= 5)
            ON CONFLICT (user_id, ancestor_id) DO NOTHING;
            
            -- Nächsten Sponsor holen
            SELECT sponsor_id INTO current_sponsor_id
            FROM public.profiles
            WHERE id = current_sponsor_id;
            
            current_level := current_level + 1;
        END LOOP;
        
        -- Dynamic Shift prüfen (Level 6+ deaktiviert Level 1)
        -- Für jedes MLM-Modell mit dynamic_shift
        FOR model_record IN 
            SELECT id FROM public.commission_models WHERE uses_dynamic_shift = TRUE AND is_active = TRUE
        LOOP
            -- Wenn jemand auf Level 6+ ist, Level 1 deaktivieren
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
$$ LANGUAGE plpgsql SET search_path = public;

-- Promotion Code Generator
CREATE OR REPLACE FUNCTION public.generate_promotion_code()
RETURNS TRIGGER AS $$
DECLARE
    new_code TEXT;
BEGIN
    -- Nur für Partner generieren
    IF NEW.role IN ('partner', 'admin') THEN
        -- Code generieren: ML-[random 6 chars]
        new_code := 'ML-' || UPPER(SUBSTRING(MD5(RANDOM()::TEXT) FROM 1 FOR 6));
        
        -- Sicherstellen dass Code einzigartig ist
        WHILE EXISTS (SELECT 1 FROM public.profiles WHERE promotion_code = new_code) LOOP
            new_code := 'ML-' || UPPER(SUBSTRING(MD5(RANDOM()::TEXT) FROM 1 FOR 6));
        END LOOP;
        
        NEW.promotion_code := new_code;
        
        -- Auch in promotion_codes Tabelle eintragen
        INSERT INTO public.promotion_codes (code, partner_id)
        VALUES (new_code, NEW.id)
        ON CONFLICT (code) DO NOTHING;
    END IF;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

-- Provisions-Berechnung
CREATE OR REPLACE FUNCTION public.calculate_commissions(p_transaction_id UUID)
RETURNS INTEGER AS $$
DECLARE
    trans RECORD;
    hierarchy_record RECORD;
    rule RECORD;
    commission_amount DECIMAL(10,2);
    commissions_created INTEGER := 0;
    default_model_id UUID;
BEGIN
    -- Transaktion holen
    SELECT * INTO trans FROM public.transactions WHERE id = p_transaction_id;
    
    IF trans IS NULL OR trans.commission_processed THEN
        RETURN 0;
    END IF;
    
    -- Standard MLM-Modell holen
    SELECT id INTO default_model_id FROM public.commission_models WHERE name = 'MLM Standard' AND is_active = TRUE LIMIT 1;
    
    -- Für jeden aktiven Vorfahren in der Hierarchie
    FOR hierarchy_record IN 
        SELECT h.*, p.role
        FROM public.user_hierarchy h
        JOIN public.profiles p ON h.ancestor_id = p.id
        JOIN public.profiles customer ON h.user_id = customer.id
        WHERE customer.user_id = (SELECT user_id FROM public.profiles WHERE id = trans.customer_id)
        AND h.is_active_for_commission = TRUE
        AND p.role IN ('partner', 'admin')
        AND h.level_number <= 5
        ORDER BY h.level_number
    LOOP
        -- Provisionsregel für diese Stufe holen
        SELECT * INTO rule 
        FROM public.commission_rules 
        WHERE model_id = default_model_id 
        AND level_number = hierarchy_record.level_number 
        AND is_active = TRUE;
        
        IF rule IS NOT NULL THEN
            -- Provision berechnen
            IF rule.commission_type = 'fixed' THEN
                commission_amount := rule.value;
            ELSE
                commission_amount := trans.amount * (rule.value / 100);
            END IF;
            
            -- Provision eintragen
            INSERT INTO public.commissions (
                transaction_id, partner_id, model_id, level_number,
                commission_type, base_amount, commission_amount
            ) VALUES (
                p_transaction_id, hierarchy_record.ancestor_id, default_model_id,
                hierarchy_record.level_number, rule.commission_type, trans.amount, commission_amount
            );
            
            commissions_created := commissions_created + 1;
        END IF;
    END LOOP;
    
    -- Transaktion als verarbeitet markieren
    UPDATE public.transactions 
    SET commission_processed = TRUE, commission_processed_at = NOW()
    WHERE id = p_transaction_id;
    
    RETURN commissions_created;
END;
$$ LANGUAGE plpgsql SET search_path = public;

-- =============================================
-- 5. TRIGGERS
-- =============================================

-- Updated_at Triggers
CREATE TRIGGER update_profiles_updated_at
    BEFORE UPDATE ON public.profiles
    FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_transactions_updated_at
    BEFORE UPDATE ON public.transactions
    FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_commissions_updated_at
    BEFORE UPDATE ON public.commissions
    FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_user_hierarchy_updated_at
    BEFORE UPDATE ON public.user_hierarchy
    FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Hierarchie-Berechnung bei neuer Registrierung
CREATE TRIGGER calculate_hierarchy_on_insert
    AFTER INSERT ON public.profiles
    FOR EACH ROW EXECUTE FUNCTION public.calculate_hierarchy();

-- Promotion Code Generator
CREATE TRIGGER generate_promotion_code_trigger
    BEFORE INSERT ON public.profiles
    FOR EACH ROW EXECUTE FUNCTION public.generate_promotion_code();

-- =============================================
-- 6. RLS POLICIES
-- =============================================

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.commission_models ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.commission_rules ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_hierarchy ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.commissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.leadership_qualifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.leadership_pool_payouts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.promotion_codes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.security_tests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.audit_log ENABLE ROW LEVEL SECURITY;

-- Profiles: Jeder kann eigenes Profil sehen/bearbeiten, Admins sehen alle
CREATE POLICY "Users can view own profile" ON public.profiles
    FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can update own profile" ON public.profiles
    FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "Anyone can insert profile" ON public.profiles
    FOR INSERT WITH CHECK (TRUE);

-- Commission Models: Alle authentifizierten können lesen
CREATE POLICY "Authenticated can view models" ON public.commission_models
    FOR SELECT TO authenticated USING (TRUE);

-- Commission Rules: Alle authentifizierten können lesen
CREATE POLICY "Authenticated can view rules" ON public.commission_rules
    FOR SELECT TO authenticated USING (TRUE);

-- User Hierarchy: Benutzer sehen eigene Hierarchie
CREATE POLICY "Users can view own hierarchy" ON public.user_hierarchy
    FOR SELECT USING (
        user_id IN (SELECT id FROM public.profiles WHERE user_id = auth.uid())
        OR ancestor_id IN (SELECT id FROM public.profiles WHERE user_id = auth.uid())
    );

-- Transactions: Benutzer sehen eigene Transaktionen
CREATE POLICY "Users can view own transactions" ON public.transactions
    FOR SELECT USING (
        customer_id IN (SELECT id FROM public.profiles WHERE user_id = auth.uid())
    );

-- Commissions: Partner sehen eigene Provisionen
CREATE POLICY "Partners can view own commissions" ON public.commissions
    FOR SELECT USING (
        partner_id IN (SELECT id FROM public.profiles WHERE user_id = auth.uid())
    );

-- Leadership: Partner sehen eigene Qualifikationen
CREATE POLICY "Partners can view own qualifications" ON public.leadership_qualifications
    FOR SELECT USING (
        partner_id IN (SELECT id FROM public.profiles WHERE user_id = auth.uid())
    );

-- Leadership Payouts: Partner sehen eigene Auszahlungen
CREATE POLICY "Partners can view own payouts" ON public.leadership_pool_payouts
    FOR SELECT USING (
        partner_id IN (SELECT id FROM public.profiles WHERE user_id = auth.uid())
    );

-- Promotion Codes: Partner sehen eigene Codes
CREATE POLICY "Partners can view own codes" ON public.promotion_codes
    FOR SELECT USING (
        partner_id IN (SELECT id FROM public.profiles WHERE user_id = auth.uid())
    );

-- Security Tests: Alle können erstellen, nur eigene sehen
CREATE POLICY "Anyone can insert security test" ON public.security_tests
    FOR INSERT WITH CHECK (TRUE);

CREATE POLICY "Users can view own tests" ON public.security_tests
    FOR SELECT USING (
        user_id IS NULL OR user_id IN (SELECT id FROM public.profiles WHERE user_id = auth.uid())
    );

-- Audit Log: Nur Admins
CREATE POLICY "Admins can view audit log" ON public.audit_log
    FOR SELECT USING (FALSE); -- Später über Admin-Check erweitern

-- =============================================
-- 7. INITIAL DATA
-- =============================================

-- Standard MLM Modell
INSERT INTO public.commission_models (name, description, uses_dynamic_shift, max_levels)
VALUES ('MLM Standard', 'Dynamisches 5-Stufen MLM-System mit automatischer Verschiebung', TRUE, 5);

-- Standard Provisionsregeln (wie im Briefing)
INSERT INTO public.commission_rules (model_id, level_number, commission_type, value, description)
SELECT 
    (SELECT id FROM public.commission_models WHERE name = 'MLM Standard'),
    level_number,
    CASE 
        WHEN level_number IN (1, 2) THEN 'fixed'::commission_type
        WHEN level_number IN (3, 4) THEN 'percentage'::commission_type
        ELSE 'fixed'::commission_type
    END,
    CASE 
        WHEN level_number = 1 THEN 45.00
        WHEN level_number = 2 THEN 20.00
        WHEN level_number = 3 THEN 15.00
        WHEN level_number = 4 THEN 10.00
        WHEN level_number = 5 THEN 10.00
        ELSE 0
    END,
    CASE 
        WHEN level_number = 1 THEN 'Stufe 1: 45€ Fixbetrag'
        WHEN level_number = 2 THEN 'Stufe 2: 20€ Fixbetrag'
        WHEN level_number = 3 THEN 'Stufe 3: 15€ Fixbetrag'
        WHEN level_number = 4 THEN 'Stufe 4: 10€ Fixbetrag'
        WHEN level_number = 5 THEN 'Stufe 5: 10€ Fixbetrag'
        ELSE ''
    END
FROM generate_series(1, 5) AS level_number;

-- Callcenter Modell (ohne dynamic shift)
INSERT INTO public.commission_models (name, description, uses_dynamic_shift, max_levels)
VALUES ('Callcenter', 'Callcenter-Provisionsmodell ohne Stufenverschiebung', FALSE, 5);