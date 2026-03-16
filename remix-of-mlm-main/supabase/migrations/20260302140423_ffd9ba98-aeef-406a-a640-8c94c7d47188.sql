
-- ═══ DNS Records Management ═══
CREATE TABLE public.dns_records (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  domain_id UUID NOT NULL REFERENCES public.protected_domains(id) ON DELETE CASCADE,
  record_type TEXT NOT NULL DEFAULT 'A',
  name TEXT NOT NULL DEFAULT '@',
  content TEXT NOT NULL,
  ttl INTEGER NOT NULL DEFAULT 3600,
  proxied BOOLEAN NOT NULL DEFAULT true,
  priority INTEGER NULL,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.dns_records ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins manage dns_records" ON public.dns_records FOR ALL USING (is_admin()) WITH CHECK (is_admin());
CREATE POLICY "Domain owners view dns_records" ON public.dns_records FOR SELECT USING (domain_id IN (SELECT id FROM protected_domains WHERE profile_id = get_profile_id(auth.uid())));

-- ═══ SSL Certificates ═══
CREATE TABLE public.ssl_certificates (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  domain_id UUID NOT NULL REFERENCES public.protected_domains(id) ON DELETE CASCADE,
  certificate_type TEXT NOT NULL DEFAULT 'full_strict',
  status TEXT NOT NULL DEFAULT 'active',
  issuer TEXT NULL DEFAULT 'GAP Protection CA',
  issued_at TIMESTAMPTZ NULL DEFAULT now(),
  expires_at TIMESTAMPTZ NULL,
  auto_renew BOOLEAN NOT NULL DEFAULT true,
  min_tls_version TEXT NOT NULL DEFAULT '1.2',
  always_use_https BOOLEAN NOT NULL DEFAULT true,
  hsts_enabled BOOLEAN NOT NULL DEFAULT true,
  hsts_max_age INTEGER NOT NULL DEFAULT 31536000,
  hsts_include_subdomains BOOLEAN NOT NULL DEFAULT true,
  opportunistic_encryption BOOLEAN NOT NULL DEFAULT true,
  tls_1_3 BOOLEAN NOT NULL DEFAULT true,
  automatic_https_rewrites BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.ssl_certificates ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins manage ssl_certificates" ON public.ssl_certificates FOR ALL USING (is_admin()) WITH CHECK (is_admin());
CREATE POLICY "Domain owners view ssl_certificates" ON public.ssl_certificates FOR SELECT USING (domain_id IN (SELECT id FROM protected_domains WHERE profile_id = get_profile_id(auth.uid())));

-- ═══ Page Rules ═══
CREATE TABLE public.page_rules (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  domain_id UUID NOT NULL REFERENCES public.protected_domains(id) ON DELETE CASCADE,
  url_pattern TEXT NOT NULL,
  actions JSONB NOT NULL DEFAULT '{}',
  priority INTEGER NOT NULL DEFAULT 1,
  is_active BOOLEAN NOT NULL DEFAULT true,
  description TEXT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.page_rules ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins manage page_rules" ON public.page_rules FOR ALL USING (is_admin()) WITH CHECK (is_admin());
CREATE POLICY "Domain owners view page_rules" ON public.page_rules FOR SELECT USING (domain_id IN (SELECT id FROM protected_domains WHERE profile_id = get_profile_id(auth.uid())));

-- ═══ IP Access Rules ═══
CREATE TABLE public.ip_access_rules (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  domain_id UUID NULL REFERENCES public.protected_domains(id) ON DELETE CASCADE,
  ip_address TEXT NOT NULL,
  action TEXT NOT NULL DEFAULT 'block',
  scope TEXT NOT NULL DEFAULT 'domain',
  note TEXT NULL,
  country_code TEXT NULL,
  expires_at TIMESTAMPTZ NULL,
  hit_count INTEGER NOT NULL DEFAULT 0,
  last_hit_at TIMESTAMPTZ NULL,
  created_by UUID NULL,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.ip_access_rules ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins manage ip_access_rules" ON public.ip_access_rules FOR ALL USING (is_admin()) WITH CHECK (is_admin());
CREATE POLICY "Domain owners view ip_access_rules" ON public.ip_access_rules FOR SELECT USING (domain_id IN (SELECT id FROM protected_domains WHERE profile_id = get_profile_id(auth.uid())));

-- ═══ Rate Limit Rules ═══
CREATE TABLE public.rate_limit_rules (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  domain_id UUID NOT NULL REFERENCES public.protected_domains(id) ON DELETE CASCADE,
  url_pattern TEXT NOT NULL DEFAULT '*',
  requests_per_period INTEGER NOT NULL DEFAULT 100,
  period_seconds INTEGER NOT NULL DEFAULT 60,
  action TEXT NOT NULL DEFAULT 'block',
  action_timeout INTEGER NOT NULL DEFAULT 60,
  methods TEXT[] NOT NULL DEFAULT '{GET,POST}',
  match_response_codes TEXT[] NULL,
  description TEXT NULL,
  is_active BOOLEAN NOT NULL DEFAULT true,
  triggered_count INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.rate_limit_rules ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins manage rate_limit_rules" ON public.rate_limit_rules FOR ALL USING (is_admin()) WITH CHECK (is_admin());
CREATE POLICY "Domain owners view rate_limit_rules" ON public.rate_limit_rules FOR SELECT USING (domain_id IN (SELECT id FROM protected_domains WHERE profile_id = get_profile_id(auth.uid())));

-- ═══ Cache/CDN Settings ═══
CREATE TABLE public.cache_settings (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  domain_id UUID NOT NULL REFERENCES public.protected_domains(id) ON DELETE CASCADE UNIQUE,
  cache_level TEXT NOT NULL DEFAULT 'standard',
  browser_ttl INTEGER NOT NULL DEFAULT 14400,
  edge_ttl INTEGER NOT NULL DEFAULT 7200,
  always_online BOOLEAN NOT NULL DEFAULT true,
  development_mode BOOLEAN NOT NULL DEFAULT false,
  development_mode_expires_at TIMESTAMPTZ NULL,
  minify_js BOOLEAN NOT NULL DEFAULT true,
  minify_css BOOLEAN NOT NULL DEFAULT true,
  minify_html BOOLEAN NOT NULL DEFAULT true,
  brotli BOOLEAN NOT NULL DEFAULT true,
  early_hints BOOLEAN NOT NULL DEFAULT true,
  rocket_loader BOOLEAN NOT NULL DEFAULT false,
  mirage BOOLEAN NOT NULL DEFAULT false,
  polish TEXT NOT NULL DEFAULT 'lossy',
  webp BOOLEAN NOT NULL DEFAULT true,
  http2_push BOOLEAN NOT NULL DEFAULT true,
  http3 BOOLEAN NOT NULL DEFAULT true,
  zero_rtt BOOLEAN NOT NULL DEFAULT true,
  websockets BOOLEAN NOT NULL DEFAULT true,
  response_buffering BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.cache_settings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins manage cache_settings" ON public.cache_settings FOR ALL USING (is_admin()) WITH CHECK (is_admin());
CREATE POLICY "Domain owners view cache_settings" ON public.cache_settings FOR SELECT USING (domain_id IN (SELECT id FROM protected_domains WHERE profile_id = get_profile_id(auth.uid())));

-- ═══ Firewall Analytics (aggregated daily) ═══
CREATE TABLE public.firewall_analytics (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  domain_id UUID NOT NULL REFERENCES public.protected_domains(id) ON DELETE CASCADE,
  date DATE NOT NULL DEFAULT CURRENT_DATE,
  total_requests BIGINT NOT NULL DEFAULT 0,
  blocked_requests BIGINT NOT NULL DEFAULT 0,
  challenged_requests BIGINT NOT NULL DEFAULT 0,
  allowed_requests BIGINT NOT NULL DEFAULT 0,
  threats_by_type JSONB NOT NULL DEFAULT '{}',
  top_ips JSONB NOT NULL DEFAULT '[]',
  top_paths JSONB NOT NULL DEFAULT '[]',
  countries JSONB NOT NULL DEFAULT '{}',
  bandwidth_bytes BIGINT NOT NULL DEFAULT 0,
  cached_bytes BIGINT NOT NULL DEFAULT 0,
  unique_visitors INTEGER NOT NULL DEFAULT 0,
  page_views INTEGER NOT NULL DEFAULT 0,
  avg_response_time_ms INTEGER NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(domain_id, date)
);
ALTER TABLE public.firewall_analytics ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins manage firewall_analytics" ON public.firewall_analytics FOR ALL USING (is_admin()) WITH CHECK (is_admin());
CREATE POLICY "Domain owners view firewall_analytics" ON public.firewall_analytics FOR SELECT USING (domain_id IN (SELECT id FROM protected_domains WHERE profile_id = get_profile_id(auth.uid())));

-- ═══ Bot Management ═══
CREATE TABLE public.bot_management_config (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  domain_id UUID NOT NULL REFERENCES public.protected_domains(id) ON DELETE CASCADE UNIQUE,
  bot_fight_mode BOOLEAN NOT NULL DEFAULT true,
  super_bot_fight_mode BOOLEAN NOT NULL DEFAULT false,
  javascript_detection BOOLEAN NOT NULL DEFAULT true,
  verified_bots_allowed BOOLEAN NOT NULL DEFAULT true,
  ai_bots_action TEXT NOT NULL DEFAULT 'block',
  static_resource_protection BOOLEAN NOT NULL DEFAULT false,
  challenge_passage_ttl INTEGER NOT NULL DEFAULT 1800,
  custom_bot_rules JSONB NOT NULL DEFAULT '[]',
  known_good_bots TEXT[] NOT NULL DEFAULT '{googlebot,bingbot,yandexbot,duckduckbot}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.bot_management_config ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins manage bot_management" ON public.bot_management_config FOR ALL USING (is_admin()) WITH CHECK (is_admin());
CREATE POLICY "Domain owners view bot_management" ON public.bot_management_config FOR SELECT USING (domain_id IN (SELECT id FROM protected_domains WHERE profile_id = get_profile_id(auth.uid())));

-- ═══ DDoS Protection Settings ═══
CREATE TABLE public.ddos_protection_config (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  domain_id UUID NOT NULL REFERENCES public.protected_domains(id) ON DELETE CASCADE UNIQUE,
  sensitivity_level TEXT NOT NULL DEFAULT 'medium',
  challenge_passage_ttl INTEGER NOT NULL DEFAULT 1800,
  under_attack_mode BOOLEAN NOT NULL DEFAULT false,
  layer7_protection BOOLEAN NOT NULL DEFAULT true,
  layer3_4_protection BOOLEAN NOT NULL DEFAULT true,
  syn_flood_protection BOOLEAN NOT NULL DEFAULT true,
  udp_flood_protection BOOLEAN NOT NULL DEFAULT true,
  dns_amplification_protection BOOLEAN NOT NULL DEFAULT true,
  slowloris_protection BOOLEAN NOT NULL DEFAULT true,
  http_flood_threshold INTEGER NOT NULL DEFAULT 1000,
  auto_mitigation BOOLEAN NOT NULL DEFAULT true,
  alert_on_attack BOOLEAN NOT NULL DEFAULT true,
  attack_log JSONB NOT NULL DEFAULT '[]',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.ddos_protection_config ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins manage ddos_config" ON public.ddos_protection_config FOR ALL USING (is_admin()) WITH CHECK (is_admin());
CREATE POLICY "Domain owners view ddos_config" ON public.ddos_protection_config FOR SELECT USING (domain_id IN (SELECT id FROM protected_domains WHERE profile_id = get_profile_id(auth.uid())));

-- Indexes
CREATE INDEX idx_dns_records_domain ON public.dns_records(domain_id);
CREATE INDEX idx_ssl_certs_domain ON public.ssl_certificates(domain_id);
CREATE INDEX idx_page_rules_domain ON public.page_rules(domain_id);
CREATE INDEX idx_ip_access_domain ON public.ip_access_rules(domain_id);
CREATE INDEX idx_rate_limit_domain ON public.rate_limit_rules(domain_id);
CREATE INDEX idx_fw_analytics_domain_date ON public.firewall_analytics(domain_id, date);

-- Triggers for updated_at
CREATE TRIGGER update_dns_records_updated_at BEFORE UPDATE ON public.dns_records FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_ssl_certificates_updated_at BEFORE UPDATE ON public.ssl_certificates FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_page_rules_updated_at BEFORE UPDATE ON public.page_rules FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_ip_access_rules_updated_at BEFORE UPDATE ON public.ip_access_rules FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_rate_limit_rules_updated_at BEFORE UPDATE ON public.rate_limit_rules FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_cache_settings_updated_at BEFORE UPDATE ON public.cache_settings FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_bot_management_updated_at BEFORE UPDATE ON public.bot_management_config FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_ddos_config_updated_at BEFORE UPDATE ON public.ddos_protection_config FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
