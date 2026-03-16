-- ═══════════════════════════════════════════════════════════════
-- 💰 SOLUTION 3: Enable Financial Functions
-- ═══════════════════════════════════════════════════════════════
-- Problem: 7 financial functions disabled (MAINTENANCE_MODE=true)
-- Risk: Cannot process payments, calculate commissions, generate invoices
-- Solution: Enable functions with proper safeguards
-- ═══════════════════════════════════════════════════════════════

-- Step 1: Create financial operations log
CREATE TABLE IF NOT EXISTS financial_operations_log (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    operation_type TEXT NOT NULL, -- 'commission', 'billing', 'transaction', 'pool', 'credit_note'
    user_id UUID REFERENCES auth.users(id),
    profile_id UUID REFERENCES profiles(id),
    amount DECIMAL(10, 2),
    currency TEXT DEFAULT 'EUR',
    status TEXT DEFAULT 'pending', -- 'pending', 'processing', 'completed', 'failed', 'rolled_back'
    request_data JSONB,
    response_data JSONB,
    error_message TEXT,
    started_at TIMESTAMPTZ DEFAULT NOW(),
    completed_at TIMESTAMPTZ,
    duration_ms INTEGER,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_financial_ops_log_type ON financial_operations_log(operation_type);
CREATE INDEX IF NOT EXISTS idx_financial_ops_log_status ON financial_operations_log(status);
CREATE INDEX IF NOT EXISTS idx_financial_ops_log_user_id ON financial_operations_log(user_id);
CREATE INDEX IF NOT EXISTS idx_financial_ops_log_created_at ON financial_operations_log(created_at DESC);

-- Enable RLS
ALTER TABLE financial_operations_log ENABLE ROW LEVEL SECURITY;

-- Only admins can view financial logs
CREATE POLICY "Admins can view financial operations logs"
ON financial_operations_log FOR SELECT
TO authenticated
USING (
    EXISTS (
        SELECT 1 FROM profiles
        WHERE profiles.user_id = auth.uid()
        AND profiles.role = 'admin'
    )
);

-- Step 2: Create circuit breaker table
CREATE TABLE IF NOT EXISTS circuit_breaker_state (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    service_name TEXT UNIQUE NOT NULL,
    state TEXT DEFAULT 'closed', -- 'closed', 'open', 'half_open'
    failure_count INTEGER DEFAULT 0,
    last_failure_at TIMESTAMPTZ,
    last_success_at TIMESTAMPTZ,
    opened_at TIMESTAMPTZ,
    half_open_at TIMESTAMPTZ,
    failure_threshold INTEGER DEFAULT 5,
    timeout_seconds INTEGER DEFAULT 60,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Insert circuit breakers for each financial service
INSERT INTO circuit_breaker_state (service_name, failure_threshold, timeout_seconds)
VALUES 
    ('wallet-engine', 5, 60),
    ('bonus-engine', 5, 60),
    ('monthly-billing', 3, 300),
    ('calculate-pool', 3, 300),
    ('generate-credit-notes', 5, 60),
    ('cc-commissions', 5, 60),
    ('create-transaction', 5, 60)
ON CONFLICT (service_name) DO NOTHING;

-- Step 3: Create circuit breaker functions
CREATE OR REPLACE FUNCTION check_circuit_breaker(p_service_name TEXT)
RETURNS TEXT AS $$
DECLARE
    v_state TEXT;
    v_failure_count INTEGER;
    v_last_failure_at TIMESTAMPTZ;
    v_opened_at TIMESTAMPTZ;
    v_timeout_seconds INTEGER;
BEGIN
    SELECT state, failure_count, last_failure_at, opened_at, timeout_seconds
    INTO v_state, v_failure_count, v_last_failure_at, v_opened_at, v_timeout_seconds
    FROM circuit_breaker_state
    WHERE service_name = p_service_name;
    
    -- If circuit is open, check if timeout has passed
    IF v_state = 'open' THEN
        IF v_opened_at + (v_timeout_seconds || ' seconds')::INTERVAL < NOW() THEN
            -- Move to half-open state
            UPDATE circuit_breaker_state
            SET 
                state = 'half_open',
                half_open_at = NOW(),
                updated_at = NOW()
            WHERE service_name = p_service_name;
            
            RETURN 'half_open';
        ELSE
            RETURN 'open';
        END IF;
    END IF;
    
    RETURN v_state;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE FUNCTION record_circuit_breaker_success(p_service_name TEXT)
RETURNS VOID AS $$
BEGIN
    UPDATE circuit_breaker_state
    SET 
        state = 'closed',
        failure_count = 0,
        last_success_at = NOW(),
        opened_at = NULL,
        half_open_at = NULL,
        updated_at = NOW()
    WHERE service_name = p_service_name;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE FUNCTION record_circuit_breaker_failure(p_service_name TEXT)
RETURNS VOID AS $$
DECLARE
    v_failure_count INTEGER;
    v_failure_threshold INTEGER;
    v_state TEXT;
BEGIN
    -- Increment failure count
    UPDATE circuit_breaker_state
    SET 
        failure_count = failure_count + 1,
        last_failure_at = NOW(),
        updated_at = NOW()
    WHERE service_name = p_service_name
    RETURNING failure_count, failure_threshold, state
    INTO v_failure_count, v_failure_threshold, v_state;
    
    -- Open circuit if threshold reached
    IF v_failure_count >= v_failure_threshold AND v_state != 'open' THEN
        UPDATE circuit_breaker_state
        SET 
            state = 'open',
            opened_at = NOW(),
            updated_at = NOW()
        WHERE service_name = p_service_name;
        
        RAISE WARNING 'Circuit breaker opened for service: %', p_service_name;
    END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Step 4: Create function to log financial operations
CREATE OR REPLACE FUNCTION log_financial_operation(
    p_operation_type TEXT,
    p_user_id UUID,
    p_profile_id UUID,
    p_amount DECIMAL,
    p_request_data JSONB,
    p_status TEXT DEFAULT 'pending'
)
RETURNS UUID AS $$
DECLARE
    v_log_id UUID;
BEGIN
    INSERT INTO financial_operations_log (
        operation_type,
        user_id,
        profile_id,
        amount,
        request_data,
        status
    ) VALUES (
        p_operation_type,
        p_user_id,
        p_profile_id,
        p_amount,
        p_request_data,
        p_status
    )
    RETURNING id INTO v_log_id;
    
    RETURN v_log_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE FUNCTION update_financial_operation_log(
    p_log_id UUID,
    p_status TEXT,
    p_response_data JSONB DEFAULT NULL,
    p_error_message TEXT DEFAULT NULL
)
RETURNS VOID AS $$
DECLARE
    v_started_at TIMESTAMPTZ;
    v_duration_ms INTEGER;
BEGIN
    SELECT started_at INTO v_started_at
    FROM financial_operations_log
    WHERE id = p_log_id;
    
    v_duration_ms := EXTRACT(EPOCH FROM (NOW() - v_started_at)) * 1000;
    
    UPDATE financial_operations_log
    SET 
        status = p_status,
        response_data = p_response_data,
        error_message = p_error_message,
        completed_at = NOW(),
        duration_ms = v_duration_ms
    WHERE id = p_log_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Step 5: Create maintenance mode control table
CREATE TABLE IF NOT EXISTS system_maintenance (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    service_name TEXT UNIQUE NOT NULL,
    maintenance_mode BOOLEAN DEFAULT false,
    reason TEXT,
    enabled_by UUID REFERENCES auth.users(id),
    enabled_at TIMESTAMPTZ,
    disabled_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Insert maintenance mode controls
INSERT INTO system_maintenance (service_name, maintenance_mode)
VALUES 
    ('wallet-engine', false),
    ('bonus-engine', false),
    ('monthly-billing', false),
    ('calculate-pool', false),
    ('generate-credit-notes', false),
    ('cc-commissions', false),
    ('create-transaction', false),
    ('security-scanner', false)
ON CONFLICT (service_name) DO NOTHING;

-- Enable RLS
ALTER TABLE system_maintenance ENABLE ROW LEVEL SECURITY;

-- Only admins can view/update maintenance mode
CREATE POLICY "Admins can manage maintenance mode"
ON system_maintenance FOR ALL
TO authenticated
USING (
    EXISTS (
        SELECT 1 FROM profiles
        WHERE profiles.user_id = auth.uid()
        AND profiles.role = 'admin'
    )
);

-- Step 6: Create function to check maintenance mode
CREATE OR REPLACE FUNCTION is_maintenance_mode(p_service_name TEXT)
RETURNS BOOLEAN AS $$
DECLARE
    v_maintenance_mode BOOLEAN;
BEGIN
    SELECT maintenance_mode INTO v_maintenance_mode
    FROM system_maintenance
    WHERE service_name = p_service_name;
    
    RETURN COALESCE(v_maintenance_mode, false);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Step 7: Create function to enable/disable maintenance mode
CREATE OR REPLACE FUNCTION set_maintenance_mode(
    p_service_name TEXT,
    p_enabled BOOLEAN,
    p_reason TEXT DEFAULT NULL
)
RETURNS VOID AS $$
BEGIN
    -- Check if user is admin
    IF NOT EXISTS (
        SELECT 1 FROM profiles
        WHERE user_id = auth.uid()
        AND role = 'admin'
    ) THEN
        RAISE EXCEPTION 'Only admins can change maintenance mode';
    END IF;
    
    UPDATE system_maintenance
    SET 
        maintenance_mode = p_enabled,
        reason = p_reason,
        enabled_by = CASE WHEN p_enabled THEN auth.uid() ELSE enabled_by END,
        enabled_at = CASE WHEN p_enabled THEN NOW() ELSE enabled_at END,
        disabled_at = CASE WHEN NOT p_enabled THEN NOW() ELSE disabled_at END,
        updated_at = NOW()
    WHERE service_name = p_service_name;
    
    IF p_enabled THEN
        RAISE NOTICE 'Maintenance mode ENABLED for %: %', p_service_name, p_reason;
    ELSE
        RAISE NOTICE 'Maintenance mode DISABLED for %', p_service_name;
    END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ═══════════════════════════════════════════════════════════════
-- ✅ VERIFICATION & ENABLE SERVICES
-- ═══════════════════════════════════════════════════════════════

-- Check circuit breaker states
SELECT 
    service_name,
    state,
    failure_count,
    last_success_at,
    last_failure_at
FROM circuit_breaker_state
ORDER BY service_name;

-- Check maintenance mode
SELECT 
    service_name,
    maintenance_mode,
    reason,
    enabled_at,
    disabled_at
FROM system_maintenance
ORDER BY service_name;

-- Enable all financial services (run after testing)
-- SELECT set_maintenance_mode('wallet-engine', false);
-- SELECT set_maintenance_mode('bonus-engine', false);
-- SELECT set_maintenance_mode('monthly-billing', false);
-- SELECT set_maintenance_mode('calculate-pool', false);
-- SELECT set_maintenance_mode('generate-credit-notes', false);
-- SELECT set_maintenance_mode('cc-commissions', false);
-- SELECT set_maintenance_mode('create-transaction', false);

RAISE NOTICE '✅ Financial functions safeguards implemented!';
RAISE NOTICE 'Next steps:';
RAISE NOTICE '1. Test each financial function individually';
RAISE NOTICE '2. Monitor circuit breaker states';
RAISE NOTICE '3. Enable services one by one';
RAISE NOTICE '4. Update Edge Functions to check maintenance mode';
