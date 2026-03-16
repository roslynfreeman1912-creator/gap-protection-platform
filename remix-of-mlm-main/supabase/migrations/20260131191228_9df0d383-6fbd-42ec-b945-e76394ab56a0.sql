-- Create comprehensive security scan tables

-- Full scan results with detailed findings
CREATE TABLE public.security_scans (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    domain TEXT,
    ip_address TEXT,
    network_hash TEXT NOT NULL,
    user_id UUID REFERENCES public.profiles(id),
    scan_type TEXT NOT NULL CHECK (scan_type IN ('light', 'full')),
    status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'running', 'completed', 'error')),
    overall_result TEXT CHECK (overall_result IN ('green', 'yellow', 'red')),
    started_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
    completed_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Detailed scan findings
CREATE TABLE public.security_findings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    scan_id UUID REFERENCES public.security_scans(id) ON DELETE CASCADE NOT NULL,
    category TEXT NOT NULL,
    severity TEXT NOT NULL CHECK (severity IN ('critical', 'high', 'medium', 'low', 'info')),
    title TEXT NOT NULL,
    description TEXT,
    recommendation TEXT,
    technical_details JSONB,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- DNS scan results
CREATE TABLE public.scan_dns_results (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    scan_id UUID REFERENCES public.security_scans(id) ON DELETE CASCADE NOT NULL,
    a_records JSONB,
    aaaa_records JSONB,
    mx_records JSONB,
    txt_records JSONB,
    ns_records JSONB,
    spf_record TEXT,
    dmarc_record TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- SSL/TLS scan results
CREATE TABLE public.scan_ssl_results (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    scan_id UUID REFERENCES public.security_scans(id) ON DELETE CASCADE NOT NULL,
    has_ssl BOOLEAN DEFAULT false,
    certificate_valid BOOLEAN,
    certificate_issuer TEXT,
    certificate_subject TEXT,
    valid_from TIMESTAMP WITH TIME ZONE,
    valid_until TIMESTAMP WITH TIME ZONE,
    days_until_expiry INTEGER,
    protocol_versions JSONB,
    cipher_suites JSONB,
    supports_tls13 BOOLEAN,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- HTTP Headers scan results  
CREATE TABLE public.scan_header_results (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    scan_id UUID REFERENCES public.security_scans(id) ON DELETE CASCADE NOT NULL,
    all_headers JSONB,
    has_hsts BOOLEAN DEFAULT false,
    has_csp BOOLEAN DEFAULT false,
    has_xframe_options BOOLEAN DEFAULT false,
    has_xcontent_type BOOLEAN DEFAULT false,
    has_referrer_policy BOOLEAN DEFAULT false,
    server_header TEXT,
    x_powered_by TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Protected domains (active GAP Protection customers)
CREATE TABLE public.protected_domains (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    profile_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL,
    domain TEXT NOT NULL,
    ip_address TEXT,
    protection_status TEXT NOT NULL DEFAULT 'pending' CHECK (protection_status IN ('pending', 'active', 'suspended', 'expired')),
    proxy_ip TEXT,
    waf_enabled BOOLEAN DEFAULT false,
    ddos_protection BOOLEAN DEFAULT false,
    ssl_managed BOOLEAN DEFAULT false,
    activated_at TIMESTAMP WITH TIME ZONE,
    expires_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.security_scans ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.security_findings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.scan_dns_results ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.scan_ssl_results ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.scan_header_results ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.protected_domains ENABLE ROW LEVEL SECURITY;

-- RLS Policies for security_scans
CREATE POLICY "Users can view own scans" ON public.security_scans
    FOR SELECT USING (
        user_id IS NULL OR 
        user_id IN (SELECT id FROM public.profiles WHERE user_id = auth.uid())
    );

CREATE POLICY "Users can insert scans" ON public.security_scans
    FOR INSERT WITH CHECK (true);

-- Admins can view all scans
CREATE POLICY "Admins can view all scans" ON public.security_scans
    FOR SELECT USING (public.is_admin());

-- RLS Policies for findings
CREATE POLICY "Users can view findings of own scans" ON public.security_findings
    FOR SELECT USING (
        scan_id IN (
            SELECT id FROM public.security_scans 
            WHERE user_id IS NULL OR user_id IN (SELECT id FROM public.profiles WHERE user_id = auth.uid())
        )
    );

CREATE POLICY "Insert findings" ON public.security_findings
    FOR INSERT WITH CHECK (true);

-- RLS for DNS results
CREATE POLICY "View DNS results" ON public.scan_dns_results
    FOR SELECT USING (
        scan_id IN (SELECT id FROM public.security_scans WHERE user_id IS NULL OR user_id IN (SELECT id FROM public.profiles WHERE user_id = auth.uid()))
    );

CREATE POLICY "Insert DNS results" ON public.scan_dns_results
    FOR INSERT WITH CHECK (true);

-- RLS for SSL results
CREATE POLICY "View SSL results" ON public.scan_ssl_results
    FOR SELECT USING (
        scan_id IN (SELECT id FROM public.security_scans WHERE user_id IS NULL OR user_id IN (SELECT id FROM public.profiles WHERE user_id = auth.uid()))
    );

CREATE POLICY "Insert SSL results" ON public.scan_ssl_results
    FOR INSERT WITH CHECK (true);

-- RLS for Header results
CREATE POLICY "View header results" ON public.scan_header_results
    FOR SELECT USING (
        scan_id IN (SELECT id FROM public.security_scans WHERE user_id IS NULL OR user_id IN (SELECT id FROM public.profiles WHERE user_id = auth.uid()))
    );

CREATE POLICY "Insert header results" ON public.scan_header_results
    FOR INSERT WITH CHECK (true);

-- RLS for protected domains
CREATE POLICY "Users can view own protected domains" ON public.protected_domains
    FOR SELECT USING (profile_id IN (SELECT id FROM public.profiles WHERE user_id = auth.uid()));

CREATE POLICY "Admins can manage all protected domains" ON public.protected_domains
    FOR ALL USING (public.is_admin());

-- Create indexes for performance
CREATE INDEX idx_security_scans_network_hash ON public.security_scans(network_hash);
CREATE INDEX idx_security_scans_user_id ON public.security_scans(user_id);
CREATE INDEX idx_security_scans_status ON public.security_scans(status);
CREATE INDEX idx_protected_domains_profile ON public.protected_domains(profile_id);
CREATE INDEX idx_protected_domains_domain ON public.protected_domains(domain);

-- Trigger for updated_at
CREATE TRIGGER update_protected_domains_updated_at
    BEFORE UPDATE ON public.protected_domains
    FOR EACH ROW
    EXECUTE FUNCTION public.update_updated_at_column();