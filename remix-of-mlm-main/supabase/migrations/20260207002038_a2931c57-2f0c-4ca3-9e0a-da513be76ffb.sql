-- Tabelle für rotierende Promo-Codes
CREATE TABLE public.rotating_promo_codes (
    id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
    code TEXT NOT NULL UNIQUE,
    code_hash TEXT NOT NULL,
    code_type TEXT NOT NULL DEFAULT 'rotating' CHECK (code_type IN ('rotating', 'fixed')),
    is_active BOOLEAN NOT NULL DEFAULT true,
    valid_from TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
    valid_to TIMESTAMP WITH TIME ZONE NOT NULL,
    max_uses INTEGER NULL,
    use_count INTEGER NOT NULL DEFAULT 0,
    created_by_admin UUID NULL,
    description TEXT NULL,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Tabelle für Promo-Code Nutzungen (Tracking)
CREATE TABLE public.promo_code_usages (
    id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
    promo_code_id UUID NOT NULL REFERENCES public.rotating_promo_codes(id) ON DELETE CASCADE,
    user_id UUID NULL REFERENCES public.profiles(id) ON DELETE SET NULL,
    user_email TEXT NOT NULL,
    used_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
    ip_address TEXT NULL,
    user_agent TEXT NULL,
    result TEXT NOT NULL DEFAULT 'success' CHECK (result IN ('success', 'fail')),
    fail_reason TEXT NULL,
    code_type TEXT NOT NULL DEFAULT 'rotating'
);

-- Erweiterte Scans-Tabelle für Kundenhistorie
CREATE TABLE public.customer_scans (
    id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    target_url TEXT NOT NULL,
    requested_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
    completed_at TIMESTAMP WITH TIME ZONE NULL,
    status TEXT NOT NULL DEFAULT 'queued' CHECK (status IN ('queued', 'running', 'done', 'failed')),
    rating TEXT NULL CHECK (rating IN ('green', 'red')),
    score INTEGER NULL,
    summary JSONB NULL,
    findings JSONB NULL,
    high_count INTEGER DEFAULT 0,
    critical_count INTEGER DEFAULT 0,
    report_pdf_path TEXT NULL,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Monatliche Reports für Kunden
CREATE TABLE public.customer_monthly_reports (
    id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    report_month TEXT NOT NULL, -- Format: YYYY-MM
    generated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
    report_path TEXT NULL,
    total_scans INTEGER NOT NULL DEFAULT 0,
    green_count INTEGER NOT NULL DEFAULT 0,
    red_count INTEGER NOT NULL DEFAULT 0,
    top_findings JSONB NULL,
    status TEXT NOT NULL DEFAULT 'generated' CHECK (status IN ('generated', 'downloaded', 'failed')),
    UNIQUE(user_id, report_month)
);

-- Indizes für Performance
CREATE INDEX idx_rotating_codes_active ON public.rotating_promo_codes(is_active, valid_to);
CREATE INDEX idx_rotating_codes_type ON public.rotating_promo_codes(code_type, is_active);
CREATE INDEX idx_promo_usages_code ON public.promo_code_usages(promo_code_id);
CREATE INDEX idx_promo_usages_user ON public.promo_code_usages(user_id);
CREATE INDEX idx_customer_scans_user ON public.customer_scans(user_id);
CREATE INDEX idx_customer_scans_status ON public.customer_scans(status);
CREATE INDEX idx_monthly_reports_user ON public.customer_monthly_reports(user_id);

-- RLS aktivieren
ALTER TABLE public.rotating_promo_codes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.promo_code_usages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.customer_scans ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.customer_monthly_reports ENABLE ROW LEVEL SECURITY;

-- RLS Policies für rotating_promo_codes
CREATE POLICY "Admin can manage rotating codes"
    ON public.rotating_promo_codes
    FOR ALL
    USING (public.is_admin());

CREATE POLICY "Public can validate active codes"
    ON public.rotating_promo_codes
    FOR SELECT
    USING (is_active = true AND now() BETWEEN valid_from AND valid_to);

-- RLS Policies für promo_code_usages
CREATE POLICY "Admin can view all usages"
    ON public.promo_code_usages
    FOR SELECT
    USING (public.is_admin());

CREATE POLICY "Users can view own usages"
    ON public.promo_code_usages
    FOR SELECT
    USING (user_id IN (SELECT id FROM public.profiles WHERE user_id = auth.uid()));

-- RLS Policies für customer_scans
CREATE POLICY "Users can manage own scans"
    ON public.customer_scans
    FOR ALL
    USING (user_id IN (SELECT id FROM public.profiles WHERE user_id = auth.uid()));

CREATE POLICY "Admin can view all scans"
    ON public.customer_scans
    FOR SELECT
    USING (public.is_admin());

-- RLS Policies für customer_monthly_reports
CREATE POLICY "Users can view own reports"
    ON public.customer_monthly_reports
    FOR SELECT
    USING (user_id IN (SELECT id FROM public.profiles WHERE user_id = auth.uid()));

CREATE POLICY "Admin can manage all reports"
    ON public.customer_monthly_reports
    FOR ALL
    USING (public.is_admin());

-- Trigger für updated_at
CREATE TRIGGER update_rotating_codes_updated_at
    BEFORE UPDATE ON public.rotating_promo_codes
    FOR EACH ROW
    EXECUTE FUNCTION public.update_updated_at_column();

-- Funktion zum Generieren eines neuen rotierenden Codes
CREATE OR REPLACE FUNCTION public.generate_rotating_code()
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
    new_code TEXT;
BEGIN
    -- Format: GEP-XXXXXX (6 zufällige Zeichen)
    new_code := 'GEP-' || UPPER(SUBSTRING(MD5(RANDOM()::TEXT || CLOCK_TIMESTAMP()::TEXT) FROM 1 FOR 6));
    RETURN new_code;
END;
$$;

-- Funktion zum Validieren eines Promo-Codes
CREATE OR REPLACE FUNCTION public.validate_promo_code(_code TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
    code_record RECORD;
    result JSONB;
BEGIN
    SELECT * INTO code_record
    FROM public.rotating_promo_codes
    WHERE code = _code
    AND is_active = true
    AND now() BETWEEN valid_from AND valid_to
    AND (max_uses IS NULL OR use_count < max_uses);
    
    IF code_record IS NULL THEN
        result := jsonb_build_object(
            'valid', false,
            'reason', 'Code ungültig, abgelaufen oder Limit erreicht'
        );
    ELSE
        result := jsonb_build_object(
            'valid', true,
            'code_id', code_record.id,
            'code_type', code_record.code_type,
            'expires_at', code_record.valid_to
        );
    END IF;
    
    RETURN result;
END;
$$;