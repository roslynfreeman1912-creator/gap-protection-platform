-- ═══════════════════════════════════════════════════════════════
-- 📊 SOLUTION 4: Monitoring & Alerting System
-- ═══════════════════════════════════════════════════════════════
-- Problem: No monitoring or alerting system
-- Risk: Cannot detect errors, performance issues, or security incidents
-- Solution: Comprehensive monitoring with alerts
-- ═══════════════════════════════════════════════════════════════

-- Step 1: Create system metrics table
CREATE TABLE IF NOT EXISTS system_metrics (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    metric_type TEXT NOT NULL, -- 'api_call', 'database_query', 'edge_function', 'error'
    metric_name TEXT NOT NULL,
    value NUMERIC,
    unit TEXT, -- 'ms', 'count', 'bytes', 'percentage'
    tags JSONB, -- Additional metadata
    timestamp TIMESTAMPTZ DEFAULT NOW()
);

-- Create hypertable for time-series data (if using TimescaleDB)
-- SELECT create_hypertable('system_metrics', 'timestamp', if_not_exists => TRUE);

CREATE INDEX IF NOT EXISTS idx_system_metrics_type ON system_metrics(metric_type);
CREATE INDEX IF NOT EXISTS idx_system_metrics_name ON system_metrics(metric_name);
CREATE INDEX IF NOT EXISTS idx_system_metrics_timestamp ON system_metrics(timestamp DESC);

-- Step 2: Create error tracking table
CREATE TABLE IF NOT EXISTS error_tracking (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    error_type TEXT NOT NULL, -- 'database', 'edge_function', 'authentication', 'validation'
    error_code TEXT,
    error_message TEXT NOT NULL,
    stack_trace TEXT,
    user_id UUID REFERENCES auth.users(id),
    request_path TEXT,
    request_method TEXT,
    request_body JSONB,
    ip_address INET,
    user_agent TEXT,
    severity TEXT DEFAULT 'error', -- 'info', 'warning', 'error', 'critical'
    resolved BOOLEAN DEFAULT false,
    resolved_at TIMESTAMPTZ,
    resolved_by UUID REFERENCES auth.users(id),
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_error_tracking_type ON error_tracking(error_type);
CREATE INDEX IF NOT EXISTS idx_error_tracking_severity ON error_tracking(severity);
CREATE INDEX IF NOT EXISTS idx_error_tracking_resolved ON error_tracking(resolved) WHERE NOT resolved;
CREATE INDEX IF NOT EXISTS idx_error_tracking_created_at ON error_tracking(created_at DESC);

-- Enable RLS
ALTER TABLE error_tracking ENABLE ROW LEVEL SECURITY;

-- Only admins can view errors
CREATE POLICY "Admins can view all errors"
ON error_tracking FOR SELECT
TO authenticated
USING (
    EXISTS (
        SELECT 1 FROM profiles
        WHERE profiles.user_id = auth.uid()
        AND profiles.role = 'admin'
    )
);

-- Step 3: Create alert rules table
CREATE TABLE IF NOT EXISTS alert_rules (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    rule_name TEXT UNIQUE NOT NULL,
    description TEXT,
    metric_type TEXT NOT NULL,
    condition TEXT NOT NULL, -- 'greater_than', 'less_than', 'equals', 'not_equals'
    threshold NUMERIC NOT NULL,
    time_window_minutes INTEGER DEFAULT 5,
    severity TEXT DEFAULT 'warning', -- 'info', 'warning', 'critical'
    enabled BOOLEAN DEFAULT true,
    notification_channels TEXT[], -- 'email', 'slack', 'webhook'
    notification_config JSONB,
    last_triggered_at TIMESTAMPTZ,
    trigger_count INTEGER DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Insert default alert rules
INSERT INTO alert_rules (rule_name, description, metric_type, condition, threshold, time_window_minutes, severity, notification_channels)
VALUES 
    ('high_error_rate', 'Alert when error rate exceeds 5% in 5 minutes', 'error', 'greater_than', 5, 5, 'critical', ARRAY['email', 'slack']),
    ('slow_api_response', 'Alert when API response time exceeds 2 seconds', 'api_call', 'greater_than', 2000, 5, 'warning', ARRAY['email']),
    ('failed_login_attempts', 'Alert when failed login attempts exceed 10 in 5 minutes', 'authentication', 'greater_than', 10, 5, 'warning', ARRAY['email']),
    ('database_connection_errors', 'Alert on database connection errors', 'database', 'greater_than', 0, 5, 'critical', ARRAY['email', 'slack']),
    ('circuit_breaker_open', 'Alert when circuit breaker opens', 'circuit_breaker', 'equals', 1, 1, 'critical', ARRAY['email', 'slack']),
    ('high_memory_usage', 'Alert when memory usage exceeds 80%', 'system', 'greater_than', 80, 5, 'warning', ARRAY['email']),
    ('disk_space_low', 'Alert when disk space below 20%', 'system', 'less_than', 20, 5, 'critical', ARRAY['email', 'slack'])
ON CONFLICT (rule_name) DO NOTHING;

-- Step 4: Create alerts history table
CREATE TABLE IF NOT EXISTS alerts_history (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    rule_id UUID REFERENCES alert_rules(id),
    rule_name TEXT NOT NULL,
    severity TEXT NOT NULL,
    message TEXT NOT NULL,
    metric_value NUMERIC,
    threshold NUMERIC,
    notification_sent BOOLEAN DEFAULT false,
    notification_channels TEXT[],
    notification_error TEXT,
    acknowledged BOOLEAN DEFAULT false,
    acknowledged_by UUID REFERENCES auth.users(id),
    acknowledged_at TIMESTAMPTZ,
    resolved BOOLEAN DEFAULT false,
    resolved_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_alerts_history_rule_id ON alerts_history(rule_id);
CREATE INDEX IF NOT EXISTS idx_alerts_history_severity ON alerts_history(severity);
CREATE INDEX IF NOT EXISTS idx_alerts_history_resolved ON alerts_history(resolved) WHERE NOT resolved;
CREATE INDEX IF NOT EXISTS idx_alerts_history_created_at ON alerts_history(created_at DESC);

-- Enable RLS
ALTER TABLE alerts_history ENABLE ROW LEVEL SECURITY;

-- Only admins can view alerts
CREATE POLICY "Admins can view all alerts"
ON alerts_history FOR SELECT
TO authenticated
USING (
    EXISTS (
        SELECT 1 FROM profiles
        WHERE profiles.user_id = auth.uid()
        AND profiles.role = 'admin'
    )
);

-- Step 5: Create function to record metrics
CREATE OR REPLACE FUNCTION record_metric(
    p_metric_type TEXT,
    p_metric_name TEXT,
    p_value NUMERIC,
    p_unit TEXT DEFAULT NULL,
    p_tags JSONB DEFAULT NULL
)
RETURNS VOID AS $$
BEGIN
    INSERT INTO system_metrics (
        metric_type,
        metric_name,
        value,
        unit,
        tags
    ) VALUES (
        p_metric_type,
        p_metric_name,
        p_value,
        p_unit,
        p_tags
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Step 6: Create function to track errors
CREATE OR REPLACE FUNCTION track_error(
    p_error_type TEXT,
    p_error_message TEXT,
    p_error_code TEXT DEFAULT NULL,
    p_stack_trace TEXT DEFAULT NULL,
    p_severity TEXT DEFAULT 'error',
    p_request_path TEXT DEFAULT NULL,
    p_request_method TEXT DEFAULT NULL,
    p_request_body JSONB DEFAULT NULL
)
RETURNS UUID AS $$
DECLARE
    v_error_id UUID;
BEGIN
    INSERT INTO error_tracking (
        error_type,
        error_code,
        error_message,
        stack_trace,
        user_id,
        request_path,
        request_method,
        request_body,
        ip_address,
        user_agent,
        severity
    ) VALUES (
        p_error_type,
        p_error_code,
        p_error_message,
        p_stack_trace,
        auth.uid(),
        p_request_path,
        p_request_method,
        p_request_body,
        inet_client_addr(),
        current_setting('request.headers', true)::json->>'user-agent',
        p_severity
    )
    RETURNING id INTO v_error_id;
    
    RETURN v_error_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Step 7: Create function to check alert rules
CREATE OR REPLACE FUNCTION check_alert_rules()
RETURNS TABLE(
    rule_id UUID,
    rule_name TEXT,
    severity TEXT,
    message TEXT,
    metric_value NUMERIC,
    threshold NUMERIC
) AS $$
BEGIN
    RETURN QUERY
    WITH recent_metrics AS (
        SELECT 
            metric_type,
            metric_name,
            AVG(value) as avg_value,
            MAX(value) as max_value,
            COUNT(*) as count
        FROM system_metrics
        WHERE timestamp > NOW() - INTERVAL '5 minutes'
        GROUP BY metric_type, metric_name
    )
    SELECT 
        ar.id,
        ar.rule_name,
        ar.severity,
        format('Alert: %s - Current value: %s, Threshold: %s', 
            ar.description, 
            rm.avg_value, 
            ar.threshold
        ) as message,
        rm.avg_value,
        ar.threshold
    FROM alert_rules ar
    JOIN recent_metrics rm ON ar.metric_type = rm.metric_type
    WHERE ar.enabled = true
    AND (
        (ar.condition = 'greater_than' AND rm.avg_value > ar.threshold) OR
        (ar.condition = 'less_than' AND rm.avg_value < ar.threshold) OR
        (ar.condition = 'equals' AND rm.avg_value = ar.threshold) OR
        (ar.condition = 'not_equals' AND rm.avg_value != ar.threshold)
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Step 8: Create function to trigger alert
CREATE OR REPLACE FUNCTION trigger_alert(
    p_rule_id UUID,
    p_rule_name TEXT,
    p_severity TEXT,
    p_message TEXT,
    p_metric_value NUMERIC,
    p_threshold NUMERIC,
    p_notification_channels TEXT[]
)
RETURNS UUID AS $$
DECLARE
    v_alert_id UUID;
BEGIN
    -- Insert alert
    INSERT INTO alerts_history (
        rule_id,
        rule_name,
        severity,
        message,
        metric_value,
        threshold,
        notification_channels
    ) VALUES (
        p_rule_id,
        p_rule_name,
        p_severity,
        p_message,
        p_metric_value,
        p_threshold,
        p_notification_channels
    )
    RETURNING id INTO v_alert_id;
    
    -- Update rule trigger count
    UPDATE alert_rules
    SET 
        last_triggered_at = NOW(),
        trigger_count = trigger_count + 1,
        updated_at = NOW()
    WHERE id = p_rule_id;
    
    RETURN v_alert_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Step 9: Create health check function
CREATE OR REPLACE FUNCTION system_health_check()
RETURNS TABLE(
    component TEXT,
    status TEXT,
    message TEXT,
    last_check TIMESTAMPTZ
) AS $$
BEGIN
    RETURN QUERY
    SELECT 
        'Database' as component,
        'healthy' as status,
        'Database connection OK' as message,
        NOW() as last_check
    UNION ALL
    SELECT 
        'Circuit Breakers' as component,
        CASE 
            WHEN COUNT(*) FILTER (WHERE state = 'open') > 0 THEN 'degraded'
            ELSE 'healthy'
        END as status,
        format('%s services open', COUNT(*) FILTER (WHERE state = 'open')) as message,
        NOW() as last_check
    FROM circuit_breaker_state
    UNION ALL
    SELECT 
        'Error Rate' as component,
        CASE 
            WHEN COUNT(*) > 100 THEN 'unhealthy'
            WHEN COUNT(*) > 50 THEN 'degraded'
            ELSE 'healthy'
        END as status,
        format('%s errors in last hour', COUNT(*)) as message,
        NOW() as last_check
    FROM error_tracking
    WHERE created_at > NOW() - INTERVAL '1 hour'
    UNION ALL
    SELECT 
        'Active Alerts' as component,
        CASE 
            WHEN COUNT(*) FILTER (WHERE severity = 'critical') > 0 THEN 'critical'
            WHEN COUNT(*) > 0 THEN 'warning'
            ELSE 'healthy'
        END as status,
        format('%s unresolved alerts', COUNT(*)) as message,
        NOW() as last_check
    FROM alerts_history
    WHERE NOT resolved;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Step 10: Create performance metrics view
CREATE OR REPLACE VIEW performance_metrics AS
SELECT 
    metric_name,
    AVG(value) as avg_value,
    MIN(value) as min_value,
    MAX(value) as max_value,
    PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY value) as p50,
    PERCENTILE_CONT(0.95) WITHIN GROUP (ORDER BY value) as p95,
    PERCENTILE_CONT(0.99) WITHIN GROUP (ORDER BY value) as p99,
    COUNT(*) as sample_count,
    DATE_TRUNC('hour', timestamp) as hour
FROM system_metrics
WHERE timestamp > NOW() - INTERVAL '24 hours'
GROUP BY metric_name, DATE_TRUNC('hour', timestamp)
ORDER BY hour DESC, metric_name;

-- Step 11: Create error summary view
CREATE OR REPLACE VIEW error_summary AS
SELECT 
    error_type,
    severity,
    COUNT(*) as error_count,
    COUNT(DISTINCT user_id) as affected_users,
    MIN(created_at) as first_occurrence,
    MAX(created_at) as last_occurrence,
    DATE_TRUNC('hour', created_at) as hour
FROM error_tracking
WHERE created_at > NOW() - INTERVAL '24 hours'
GROUP BY error_type, severity, DATE_TRUNC('hour', created_at)
ORDER BY hour DESC, error_count DESC;

-- ═══════════════════════════════════════════════════════════════
-- ✅ VERIFICATION
-- ═══════════════════════════════════════════════════════════════

-- Test metric recording
SELECT record_metric('api_call', 'register', 1250, 'ms', '{"endpoint": "/register"}'::jsonb);
SELECT record_metric('database_query', 'select_profiles', 45, 'ms', '{"table": "profiles"}'::jsonb);

-- Test error tracking
SELECT track_error('edge_function', 'Test error', 'TEST_001', 'Stack trace here', 'warning', '/api/test', 'POST');

-- Check system health
SELECT * FROM system_health_check();

-- Check recent metrics
SELECT 
    metric_type,
    metric_name,
    COUNT(*) as count,
    AVG(value) as avg_value,
    MAX(value) as max_value
FROM system_metrics
WHERE timestamp > NOW() - INTERVAL '1 hour'
GROUP BY metric_type, metric_name
ORDER BY count DESC;

-- Check recent errors
SELECT 
    error_type,
    severity,
    COUNT(*) as count
FROM error_tracking
WHERE created_at > NOW() - INTERVAL '1 hour'
GROUP BY error_type, severity
ORDER BY count DESC;

RAISE NOTICE '✅ Monitoring & Alerting system implemented!';
RAISE NOTICE 'Next steps:';
RAISE NOTICE '1. Deploy monitoring Edge Function';
RAISE NOTICE '2. Configure notification channels (email, Slack)';
RAISE NOTICE '3. Set up Grafana dashboards';
RAISE NOTICE '4. Configure Sentry for error tracking';
RAISE NOTICE '5. Test alert rules';
