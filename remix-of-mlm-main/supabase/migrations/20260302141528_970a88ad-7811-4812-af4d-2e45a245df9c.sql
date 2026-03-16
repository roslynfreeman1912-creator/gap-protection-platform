
-- GAP PROTECTION — Enterprise Security Platform Extension

-- 1. SECURITY INCIDENTS
CREATE TABLE IF NOT EXISTS public.security_incidents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL, description TEXT,
  severity TEXT NOT NULL DEFAULT 'medium', status TEXT NOT NULL DEFAULT 'open',
  category TEXT NOT NULL DEFAULT 'general', source TEXT DEFAULT 'manual',
  affected_domain_id UUID REFERENCES public.protected_domains(id) ON DELETE SET NULL,
  assigned_to UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  reported_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  mitre_tactic TEXT, mitre_technique TEXT, attack_vector TEXT, source_ip TEXT,
  ioc_indicators JSONB DEFAULT '[]'::jsonb, timeline JSONB DEFAULT '[]'::jsonb,
  resolution_notes TEXT, resolved_at TIMESTAMPTZ, escalated_at TIMESTAMPTZ,
  sla_breach BOOLEAN DEFAULT false, priority INTEGER DEFAULT 3, tags TEXT[] DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(), updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.security_incidents ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='security_incidents' AND policyname='Admins manage incidents') THEN
    CREATE POLICY "Admins manage incidents" ON public.security_incidents FOR ALL USING (is_admin()) WITH CHECK (is_admin());
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='security_incidents' AND policyname='Assigned users view incidents') THEN
    CREATE POLICY "Assigned users view incidents" ON public.security_incidents FOR SELECT USING (assigned_to = get_profile_id(auth.uid()) OR reported_by = get_profile_id(auth.uid()));
  END IF;
END $$;

-- 2. VULNERABILITY FINDINGS
CREATE TABLE IF NOT EXISTS public.vulnerability_findings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  domain_id UUID REFERENCES public.protected_domains(id) ON DELETE CASCADE,
  cve_id TEXT, title TEXT NOT NULL, description TEXT,
  severity TEXT NOT NULL DEFAULT 'medium', cvss_score NUMERIC(3,1),
  status TEXT NOT NULL DEFAULT 'open', affected_component TEXT,
  affected_version TEXT, fix_version TEXT, remediation TEXT, proof_of_concept TEXT,
  reference_urls TEXT[] DEFAULT '{}', discovered_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  fixed_at TIMESTAMPTZ, verified_at TIMESTAMPTZ, discovered_by TEXT DEFAULT 'scanner',
  false_positive BOOLEAN DEFAULT false, exploit_available BOOLEAN DEFAULT false,
  patch_available BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(), updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.vulnerability_findings ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='vulnerability_findings' AND policyname='Admins manage vulnerabilities') THEN
    CREATE POLICY "Admins manage vulnerabilities" ON public.vulnerability_findings FOR ALL USING (is_admin()) WITH CHECK (is_admin());
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='vulnerability_findings' AND policyname='Domain owners view vulnerabilities') THEN
    CREATE POLICY "Domain owners view vulnerabilities" ON public.vulnerability_findings FOR SELECT USING (domain_id IN (SELECT id FROM protected_domains WHERE profile_id = get_profile_id(auth.uid())));
  END IF;
END $$;

-- 3. THREAT INTELLIGENCE FEEDS
CREATE TABLE IF NOT EXISTS public.threat_intel_feeds (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  indicator_type TEXT NOT NULL DEFAULT 'ip', indicator_value TEXT NOT NULL,
  threat_type TEXT, confidence INTEGER DEFAULT 50, severity TEXT DEFAULT 'medium',
  feed_source TEXT NOT NULL DEFAULT 'internal', source_url TEXT, description TEXT,
  tags TEXT[] DEFAULT '{}', first_seen TIMESTAMPTZ DEFAULT now(), last_seen TIMESTAMPTZ DEFAULT now(),
  expires_at TIMESTAMPTZ, is_active BOOLEAN DEFAULT true, hit_count INTEGER DEFAULT 0,
  associated_campaigns TEXT[] DEFAULT '{}', geo_location JSONB, whois_data JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(), updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.threat_intel_feeds ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='threat_intel_feeds' AND policyname='Admins manage threat_intel') THEN
    CREATE POLICY "Admins manage threat_intel" ON public.threat_intel_feeds FOR ALL USING (is_admin()) WITH CHECK (is_admin());
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='threat_intel_feeds' AND policyname='Authenticated view threat_intel') THEN
    CREATE POLICY "Authenticated view threat_intel" ON public.threat_intel_feeds FOR SELECT TO authenticated USING (true);
  END IF;
END $$;

-- 4. COMPLIANCE CHECKS
CREATE TABLE IF NOT EXISTS public.compliance_checks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  framework TEXT NOT NULL DEFAULT 'ISO27001', control_id TEXT NOT NULL, control_name TEXT NOT NULL,
  category TEXT, description TEXT, status TEXT NOT NULL DEFAULT 'not_assessed',
  evidence TEXT, evidence_url TEXT, responsible UUID REFERENCES public.profiles(id),
  last_assessed_at TIMESTAMPTZ, next_review_at TIMESTAMPTZ, notes TEXT,
  risk_level TEXT DEFAULT 'medium', domain_id UUID REFERENCES public.protected_domains(id) ON DELETE SET NULL,
  automated BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(), updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.compliance_checks ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='compliance_checks' AND policyname='Admins manage compliance') THEN
    CREATE POLICY "Admins manage compliance" ON public.compliance_checks FOR ALL USING (is_admin()) WITH CHECK (is_admin());
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='compliance_checks' AND policyname='Authenticated view compliance') THEN
    CREATE POLICY "Authenticated view compliance" ON public.compliance_checks FOR SELECT TO authenticated USING (true);
  END IF;
END $$;

-- 5. EMAIL SECURITY CONFIG
CREATE TABLE IF NOT EXISTS public.email_security_config (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  domain_id UUID REFERENCES public.protected_domains(id) ON DELETE CASCADE NOT NULL UNIQUE,
  spf_record TEXT, spf_status TEXT DEFAULT 'not_configured',
  dkim_enabled BOOLEAN DEFAULT false, dkim_selector TEXT, dkim_public_key TEXT,
  dmarc_policy TEXT DEFAULT 'none', dmarc_rua TEXT, dmarc_ruf TEXT, dmarc_percentage INTEGER DEFAULT 100,
  dane_enabled BOOLEAN DEFAULT false, mta_sts_enabled BOOLEAN DEFAULT false, mta_sts_mode TEXT DEFAULT 'testing',
  bimi_enabled BOOLEAN DEFAULT false, bimi_logo_url TEXT,
  anti_phishing_enabled BOOLEAN DEFAULT true, quarantine_suspicious BOOLEAN DEFAULT true,
  scan_attachments BOOLEAN DEFAULT true, block_executables BOOLEAN DEFAULT true,
  spoofing_protection BOOLEAN DEFAULT true, last_checked_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(), updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.email_security_config ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='email_security_config' AND policyname='Admins manage email_security') THEN
    CREATE POLICY "Admins manage email_security" ON public.email_security_config FOR ALL USING (is_admin()) WITH CHECK (is_admin());
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='email_security_config' AND policyname='Domain owners view email_security') THEN
    CREATE POLICY "Domain owners view email_security" ON public.email_security_config FOR SELECT USING (domain_id IN (SELECT id FROM protected_domains WHERE profile_id = get_profile_id(auth.uid())));
  END IF;
END $$;

-- 6. ZERO TRUST POLICIES
CREATE TABLE IF NOT EXISTS public.zero_trust_policies (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL, description TEXT, policy_type TEXT NOT NULL DEFAULT 'access',
  domain_id UUID REFERENCES public.protected_domains(id) ON DELETE SET NULL,
  conditions JSONB DEFAULT '{}'::jsonb, action TEXT NOT NULL DEFAULT 'allow',
  require_mfa BOOLEAN DEFAULT false, require_device_posture BOOLEAN DEFAULT false,
  allowed_countries TEXT[] DEFAULT '{}', blocked_countries TEXT[] DEFAULT '{}',
  allowed_ip_ranges TEXT[] DEFAULT '{}', session_duration INTEGER DEFAULT 3600,
  risk_score_threshold INTEGER DEFAULT 70, is_active BOOLEAN DEFAULT true,
  priority INTEGER DEFAULT 100, hit_count INTEGER DEFAULT 0, last_triggered_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(), updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.zero_trust_policies ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='zero_trust_policies' AND policyname='Admins manage zero_trust') THEN
    CREATE POLICY "Admins manage zero_trust" ON public.zero_trust_policies FOR ALL USING (is_admin()) WITH CHECK (is_admin());
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='zero_trust_policies' AND policyname='Authenticated view zero_trust') THEN
    CREATE POLICY "Authenticated view zero_trust" ON public.zero_trust_policies FOR SELECT TO authenticated USING (true);
  END IF;
END $$;

-- INDEXES (unique names to avoid conflicts)
CREATE INDEX IF NOT EXISTS idx_sec_incidents_status ON public.security_incidents(status);
CREATE INDEX IF NOT EXISTS idx_sec_incidents_severity ON public.security_incidents(severity);
CREATE INDEX IF NOT EXISTS idx_vuln_findings_domain ON public.vulnerability_findings(domain_id);
CREATE INDEX IF NOT EXISTS idx_vuln_findings_cve ON public.vulnerability_findings(cve_id);
CREATE INDEX IF NOT EXISTS idx_ti_feeds_type ON public.threat_intel_feeds(indicator_type);
CREATE INDEX IF NOT EXISTS idx_ti_feeds_value ON public.threat_intel_feeds(indicator_value);
CREATE INDEX IF NOT EXISTS idx_comp_checks_framework ON public.compliance_checks(framework);
CREATE INDEX IF NOT EXISTS idx_zt_policies_domain ON public.zero_trust_policies(domain_id);

-- TRIGGERS
CREATE OR REPLACE TRIGGER update_security_incidents_ts BEFORE UPDATE ON public.security_incidents FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE OR REPLACE TRIGGER update_vulnerability_findings_ts BEFORE UPDATE ON public.vulnerability_findings FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE OR REPLACE TRIGGER update_threat_intel_feeds_ts BEFORE UPDATE ON public.threat_intel_feeds FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE OR REPLACE TRIGGER update_compliance_checks_ts BEFORE UPDATE ON public.compliance_checks FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE OR REPLACE TRIGGER update_email_security_config_ts BEFORE UPDATE ON public.email_security_config FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE OR REPLACE TRIGGER update_zero_trust_policies_ts BEFORE UPDATE ON public.zero_trust_policies FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
