-- ============================================================================
-- FIX: Re-grant EXECUTE on SECURITY DEFINER helper functions to authenticated
-- The structural_hardening migration revoked these but they are needed by RLS
-- policies on security tables. Since they are SECURITY DEFINER, they run with
-- owner privileges and are safe to call from authenticated context.
-- ============================================================================

-- Re-grant is_admin() to authenticated (SECURITY DEFINER -> safe)
DO $$ BEGIN
  GRANT EXECUTE ON FUNCTION is_admin() TO authenticated;
EXCEPTION WHEN undefined_function THEN NULL;
END $$;

-- Re-grant get_profile_id() to authenticated (SECURITY DEFINER -> safe)
DO $$ BEGIN
  GRANT EXECUTE ON FUNCTION get_profile_id(UUID) TO authenticated;
EXCEPTION WHEN undefined_function THEN NULL;
END $$;

-- Re-grant has_role() to authenticated (SECURITY DEFINER -> safe)
DO $$ BEGIN
  GRANT EXECUTE ON FUNCTION has_role(UUID, TEXT) TO authenticated;
EXCEPTION WHEN undefined_function THEN NULL;
END $$;

-- Re-grant is_super_admin() to authenticated
DO $$ BEGIN
  GRANT EXECUTE ON FUNCTION is_super_admin() TO authenticated;
EXCEPTION WHEN undefined_function THEN NULL;
END $$;

-- Re-grant is_callcenter() to authenticated
DO $$ BEGIN
  GRANT EXECUTE ON FUNCTION is_callcenter() TO authenticated;
EXCEPTION WHEN undefined_function THEN NULL;
END $$;

-- ============================================================================
-- FIX: Remove overly restrictive service-only write policies from phase2_hardening
-- Writes go through edge functions with service_role anyway, but these USING(false)
-- policies conflict with the admin ALL policies.
-- ============================================================================

-- security_assets
DROP POLICY IF EXISTS "security_assets_service_write" ON security_assets;
DROP POLICY IF EXISTS "security_assets_service_update" ON security_assets;
DROP POLICY IF EXISTS "security_assets_service_delete" ON security_assets;

-- threat_events
DROP POLICY IF EXISTS "threat_events_service_write" ON threat_events;
DROP POLICY IF EXISTS "threat_events_service_update" ON threat_events;
DROP POLICY IF EXISTS "threat_events_service_delete" ON threat_events;

-- security_alerts
DROP POLICY IF EXISTS "security_alerts_service_write" ON security_alerts;
DROP POLICY IF EXISTS "security_alerts_service_update" ON security_alerts;
DROP POLICY IF EXISTS "security_alerts_service_delete" ON security_alerts;

-- threat_intel
DROP POLICY IF EXISTS "threat_intel_service_write" ON threat_intel;
DROP POLICY IF EXISTS "threat_intel_service_update" ON threat_intel;
DROP POLICY IF EXISTS "threat_intel_service_delete" ON threat_intel;

-- honeypot_events (in case they exist)
DROP POLICY IF EXISTS "honeypot_events_service_write" ON honeypot_events;
DROP POLICY IF EXISTS "honeypot_events_service_update" ON honeypot_events;
DROP POLICY IF EXISTS "honeypot_events_service_delete" ON honeypot_events;

-- ai_threat_analyses (in case they exist)
DROP POLICY IF EXISTS "ai_threat_analyses_service_write" ON ai_threat_analyses;
DROP POLICY IF EXISTS "ai_threat_analyses_service_update" ON ai_threat_analyses;
DROP POLICY IF EXISTS "ai_threat_analyses_service_delete" ON ai_threat_analyses;
