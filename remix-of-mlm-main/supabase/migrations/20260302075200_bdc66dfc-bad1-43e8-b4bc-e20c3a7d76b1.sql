
-- ==========================================
-- COMPREHENSIVE SECURITY THREAT MANAGEMENT
-- ==========================================

-- 1. Security Assets (Endpoints, Servers, IoT devices)
CREATE TABLE public.security_assets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE,
  asset_name TEXT NOT NULL,
  asset_type TEXT NOT NULL DEFAULT 'endpoint', -- endpoint, server, cloud, iot, mobile, network
  os_type TEXT, -- windows, linux, macos, android, ios, firmware
  ip_address TEXT,
  mac_address TEXT,
  hostname TEXT,
  location TEXT,
  status TEXT NOT NULL DEFAULT 'active', -- active, offline, compromised, quarantined
  protection_level TEXT NOT NULL DEFAULT 'standard', -- basic, standard, advanced, enterprise
  last_seen_at TIMESTAMPTZ DEFAULT now(),
  last_scan_at TIMESTAMPTZ,
  agent_version TEXT,
  risk_score INTEGER DEFAULT 0, -- 0-100
  tags TEXT[] DEFAULT '{}',
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 2. Threat Events (all security events/incidents)
CREATE TABLE public.threat_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  asset_id UUID REFERENCES public.security_assets(id) ON DELETE SET NULL,
  profile_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  event_type TEXT NOT NULL, -- malware, ransomware, phishing, intrusion, ddos, xss, sqli, brute_force, data_exfil, zero_day, anomaly
  severity TEXT NOT NULL DEFAULT 'medium', -- critical, high, medium, low, info
  title TEXT NOT NULL,
  description TEXT,
  source_ip TEXT,
  destination_ip TEXT,
  source_port INTEGER,
  destination_port INTEGER,
  protocol TEXT, -- tcp, udp, http, https, dns, smtp
  action_taken TEXT NOT NULL DEFAULT 'detected', -- detected, blocked, quarantined, allowed, investigating
  attack_vector TEXT, -- email, web, network, usb, insider, supply_chain
  mitre_tactic TEXT, -- initial_access, execution, persistence, privilege_escalation, etc.
  mitre_technique TEXT,
  ioc_type TEXT, -- ip, domain, hash, url, email
  ioc_value TEXT,
  raw_log JSONB,
  geo_location JSONB, -- { country, city, lat, lng }
  confidence_score INTEGER DEFAULT 50, -- 0-100
  is_false_positive BOOLEAN DEFAULT false,
  resolved_at TIMESTAMPTZ,
  resolved_by UUID,
  resolution_notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 3. Threat Intelligence (local threat database)
CREATE TABLE public.threat_intel (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  indicator_type TEXT NOT NULL, -- ip, domain, hash_md5, hash_sha256, url, email, cve
  indicator_value TEXT NOT NULL,
  threat_type TEXT NOT NULL, -- malware, c2, phishing, exploit, botnet, spam, tor_exit
  severity TEXT NOT NULL DEFAULT 'medium',
  confidence INTEGER DEFAULT 50,
  source TEXT DEFAULT 'internal', -- internal, community, osint
  description TEXT,
  first_seen_at TIMESTAMPTZ DEFAULT now(),
  last_seen_at TIMESTAMPTZ DEFAULT now(),
  expiry_at TIMESTAMPTZ,
  tags TEXT[] DEFAULT '{}',
  metadata JSONB DEFAULT '{}',
  is_active BOOLEAN DEFAULT true,
  created_by UUID REFERENCES public.profiles(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 4. Security Alerts (active alerts requiring attention)
CREATE TABLE public.security_alerts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  threat_event_id UUID REFERENCES public.threat_events(id) ON DELETE CASCADE,
  asset_id UUID REFERENCES public.security_assets(id) ON DELETE SET NULL,
  profile_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  alert_type TEXT NOT NULL, -- threat, vulnerability, compliance, anomaly, policy_violation
  severity TEXT NOT NULL DEFAULT 'medium',
  title TEXT NOT NULL,
  description TEXT,
  status TEXT NOT NULL DEFAULT 'open', -- open, investigating, escalated, resolved, dismissed
  priority INTEGER DEFAULT 3, -- 1=critical, 2=high, 3=medium, 4=low
  assigned_to UUID REFERENCES public.profiles(id),
  escalated_at TIMESTAMPTZ,
  acknowledged_at TIMESTAMPTZ,
  resolved_at TIMESTAMPTZ,
  resolution TEXT,
  ai_analysis TEXT,
  ai_recommendation TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 5. Network Traffic Logs (simplified)
CREATE TABLE public.network_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  asset_id UUID REFERENCES public.security_assets(id) ON DELETE SET NULL,
  profile_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  direction TEXT NOT NULL DEFAULT 'inbound', -- inbound, outbound, internal
  source_ip TEXT,
  destination_ip TEXT,
  source_port INTEGER,
  destination_port INTEGER,
  protocol TEXT,
  bytes_transferred BIGINT DEFAULT 0,
  packets_count INTEGER DEFAULT 0,
  action TEXT DEFAULT 'allow', -- allow, block, drop, alert
  rule_matched TEXT,
  threat_detected BOOLEAN DEFAULT false,
  threat_category TEXT,
  geo_source JSONB,
  geo_destination JSONB,
  logged_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 6. Honeypot Events
CREATE TABLE public.honeypot_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  honeypot_type TEXT NOT NULL DEFAULT 'web', -- web, ssh, smtp, ftp, database
  attacker_ip TEXT NOT NULL,
  attacker_port INTEGER,
  target_port INTEGER,
  protocol TEXT,
  payload TEXT,
  credentials_used JSONB, -- { username, password }
  attack_type TEXT, -- brute_force, exploit, scan, credential_stuffing
  geo_location JSONB,
  session_duration_ms INTEGER,
  is_automated BOOLEAN DEFAULT true,
  threat_intel_match BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 7. AI Threat Analysis Results
CREATE TABLE public.ai_threat_analyses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  analysis_type TEXT NOT NULL, -- event_analysis, risk_assessment, behavioral, predictive, forensic
  target_id UUID, -- could be threat_event_id, asset_id, etc.
  target_type TEXT, -- threat_event, asset, network_log, alert
  input_data JSONB NOT NULL DEFAULT '{}',
  analysis_result JSONB NOT NULL DEFAULT '{}',
  risk_score INTEGER, -- 0-100
  recommendations TEXT[],
  summary TEXT,
  model_used TEXT DEFAULT 'gemini-3-flash',
  processing_time_ms INTEGER,
  confidence_score INTEGER DEFAULT 50,
  created_by UUID REFERENCES public.profiles(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Enable RLS on all tables
ALTER TABLE public.security_assets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.threat_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.threat_intel ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.security_alerts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.network_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.honeypot_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ai_threat_analyses ENABLE ROW LEVEL SECURITY;

-- RLS Policies: Admins can manage everything
CREATE POLICY "Admins manage security_assets" ON public.security_assets FOR ALL USING (is_admin()) WITH CHECK (is_admin());
CREATE POLICY "Users view own assets" ON public.security_assets FOR SELECT USING (profile_id = get_profile_id(auth.uid()));

CREATE POLICY "Admins manage threat_events" ON public.threat_events FOR ALL USING (is_admin()) WITH CHECK (is_admin());
CREATE POLICY "Users view own threat_events" ON public.threat_events FOR SELECT USING (profile_id = get_profile_id(auth.uid()));

CREATE POLICY "Admins manage threat_intel" ON public.threat_intel FOR ALL USING (is_admin()) WITH CHECK (is_admin());
CREATE POLICY "Authenticated view active threat_intel" ON public.threat_intel FOR SELECT USING (is_active = true);

CREATE POLICY "Admins manage security_alerts" ON public.security_alerts FOR ALL USING (is_admin()) WITH CHECK (is_admin());
CREATE POLICY "Users view own alerts" ON public.security_alerts FOR SELECT USING (profile_id = get_profile_id(auth.uid()));

CREATE POLICY "Admins manage network_logs" ON public.network_logs FOR ALL USING (is_admin()) WITH CHECK (is_admin());
CREATE POLICY "Users view own network_logs" ON public.network_logs FOR SELECT USING (profile_id = get_profile_id(auth.uid()));

CREATE POLICY "Admins manage honeypot_events" ON public.honeypot_events FOR ALL USING (is_admin()) WITH CHECK (is_admin());
CREATE POLICY "Admins view honeypot_events" ON public.honeypot_events FOR SELECT USING (is_admin());

CREATE POLICY "Admins manage ai_analyses" ON public.ai_threat_analyses FOR ALL USING (is_admin()) WITH CHECK (is_admin());
CREATE POLICY "Users view own ai_analyses" ON public.ai_threat_analyses FOR SELECT USING (created_by = get_profile_id(auth.uid()));

-- Indexes for performance
CREATE INDEX idx_threat_events_severity ON public.threat_events(severity);
CREATE INDEX idx_threat_events_created ON public.threat_events(created_at DESC);
CREATE INDEX idx_threat_events_type ON public.threat_events(event_type);
CREATE INDEX idx_security_alerts_status ON public.security_alerts(status);
CREATE INDEX idx_security_alerts_severity ON public.security_alerts(severity);
CREATE INDEX idx_security_assets_status ON public.security_assets(status);
CREATE INDEX idx_threat_intel_indicator ON public.threat_intel(indicator_type, indicator_value);
CREATE INDEX idx_network_logs_logged ON public.network_logs(logged_at DESC);
CREATE INDEX idx_honeypot_events_created ON public.honeypot_events(created_at DESC);

-- Updated at triggers
CREATE TRIGGER update_security_assets_updated_at BEFORE UPDATE ON public.security_assets FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_threat_intel_updated_at BEFORE UPDATE ON public.threat_intel FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_security_alerts_updated_at BEFORE UPDATE ON public.security_alerts FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Enable realtime for alerts
ALTER PUBLICATION supabase_realtime ADD TABLE public.security_alerts;
ALTER PUBLICATION supabase_realtime ADD TABLE public.threat_events;
