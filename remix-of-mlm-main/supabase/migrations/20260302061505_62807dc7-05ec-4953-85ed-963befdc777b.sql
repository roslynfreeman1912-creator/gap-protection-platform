
-- WAF Rules table for managing firewall rules per domain
CREATE TABLE public.waf_rules (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  domain_id UUID REFERENCES public.protected_domains(id) ON DELETE CASCADE NOT NULL,
  rule_name TEXT NOT NULL,
  rule_type TEXT NOT NULL DEFAULT 'block', -- block, allow, challenge, log
  pattern TEXT NOT NULL, -- regex or path pattern
  description TEXT,
  is_active BOOLEAN NOT NULL DEFAULT true,
  priority INTEGER NOT NULL DEFAULT 100,
  action TEXT NOT NULL DEFAULT 'block', -- block, challenge, log, allow
  match_field TEXT NOT NULL DEFAULT 'uri', -- uri, ip, user_agent, header, body
  blocked_count INTEGER NOT NULL DEFAULT 0,
  last_triggered_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Domain monitoring logs
CREATE TABLE public.domain_monitoring_logs (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  domain_id UUID REFERENCES public.protected_domains(id) ON DELETE CASCADE NOT NULL,
  check_type TEXT NOT NULL, -- uptime, ssl_expiry, dns_change, vulnerability
  status TEXT NOT NULL DEFAULT 'ok', -- ok, warning, critical, error
  response_time_ms INTEGER,
  http_status INTEGER,
  ssl_days_remaining INTEGER,
  details JSONB,
  checked_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- WAF event logs for tracking blocked requests
CREATE TABLE public.waf_event_logs (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  domain_id UUID REFERENCES public.protected_domains(id) ON DELETE CASCADE NOT NULL,
  rule_id UUID REFERENCES public.waf_rules(id) ON DELETE SET NULL,
  event_type TEXT NOT NULL, -- blocked, challenged, logged
  source_ip TEXT,
  request_uri TEXT,
  user_agent TEXT,
  country TEXT,
  threat_type TEXT, -- sqli, xss, rfi, lfi, rce, ddos, bot
  details JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Threat intelligence - track known bad IPs/patterns
CREATE TABLE public.threat_intelligence (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  indicator_type TEXT NOT NULL, -- ip, domain, pattern, user_agent
  indicator_value TEXT NOT NULL,
  threat_type TEXT NOT NULL, -- malware, phishing, scanner, bot, bruteforce
  severity TEXT NOT NULL DEFAULT 'medium',
  source TEXT, -- where this intel came from
  is_active BOOLEAN NOT NULL DEFAULT true,
  expires_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.waf_rules ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.domain_monitoring_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.waf_event_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.threat_intelligence ENABLE ROW LEVEL SECURITY;

-- RLS Policies
CREATE POLICY "Admins can manage WAF rules" ON public.waf_rules FOR ALL USING (is_admin()) WITH CHECK (is_admin());
CREATE POLICY "Domain owners can view WAF rules" ON public.waf_rules FOR SELECT USING (
  domain_id IN (SELECT id FROM public.protected_domains WHERE profile_id = get_profile_id(auth.uid()))
);

CREATE POLICY "Admins can manage monitoring logs" ON public.domain_monitoring_logs FOR ALL USING (is_admin()) WITH CHECK (is_admin());
CREATE POLICY "Domain owners can view monitoring logs" ON public.domain_monitoring_logs FOR SELECT USING (
  domain_id IN (SELECT id FROM public.protected_domains WHERE profile_id = get_profile_id(auth.uid()))
);

CREATE POLICY "Admins can manage WAF events" ON public.waf_event_logs FOR ALL USING (is_admin()) WITH CHECK (is_admin());
CREATE POLICY "Domain owners can view WAF events" ON public.waf_event_logs FOR SELECT USING (
  domain_id IN (SELECT id FROM public.protected_domains WHERE profile_id = get_profile_id(auth.uid()))
);

CREATE POLICY "Admins can manage threat intel" ON public.threat_intelligence FOR ALL USING (is_admin()) WITH CHECK (is_admin());
CREATE POLICY "Authenticated can view threat intel" ON public.threat_intelligence FOR SELECT USING (true);

-- Indexes
CREATE INDEX idx_waf_rules_domain ON public.waf_rules(domain_id);
CREATE INDEX idx_monitoring_domain_time ON public.domain_monitoring_logs(domain_id, checked_at DESC);
CREATE INDEX idx_waf_events_domain_time ON public.waf_event_logs(domain_id, created_at DESC);
CREATE INDEX idx_threat_intel_type ON public.threat_intelligence(indicator_type, is_active);

-- Triggers
CREATE TRIGGER update_waf_rules_updated_at BEFORE UPDATE ON public.waf_rules
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_threat_intel_updated_at BEFORE UPDATE ON public.threat_intelligence
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
