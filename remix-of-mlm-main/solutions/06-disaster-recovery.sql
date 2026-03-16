-- ═══════════════════════════════════════════════════════════════
-- 🔄 SOLUTION 6: Disaster Recovery & Backup System
-- ═══════════════════════════════════════════════════════════════
-- Problem: No disaster recovery plan or backup strategy
-- Risk: Data loss, extended downtime
-- Solution: Comprehensive backup and recovery system
-- ═══════════════════════════════════════════════════════════════

-- Step 1: Create backup metadata table
CREATE TABLE IF NOT EXISTS backup_metadata (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    backup_type TEXT NOT NULL, -- 'full', 'incremental', 'differential'
    backup_status TEXT DEFAULT 'in_progress', -- 'in_progress', 'completed', 'failed'
    backup_size_bytes BIGINT,
    backup_location TEXT,
    backup_method TEXT, -- 'pg_dump', 'wal_archive', 'snapshot'
    tables_included TEXT[],
    started_at TIMESTAMPTZ DEFAULT NOW(),
    completed_at TIMESTAMPTZ,
    duration_seconds INTEGER,
    error_message TEXT,
    checksum TEXT,
    retention_days INTEGER DEFAULT 30,
    expires_at TIMESTAMPTZ,
    created_by UUID REFERENCES auth.users(id),
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_backup_metadata_type ON backup_metadata(backup_type);
CREATE INDEX IF NOT EXISTS idx_backup_metadata_status ON backup_metadata(backup_status);
CREATE INDEX IF NOT EXISTS idx_backup_metadata_created_at ON backup_metadata(created_at DESC);

-- Step 2: Create restore history table
CREATE TABLE IF NOT EXISTS restore_history (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    backup_id UUID REFERENCES backup_metadata(id),
    restore_type TEXT NOT NULL, -- 'full', 'partial', 'point_in_time'
    restore_status TEXT DEFAULT 'in_progress',
    tables_restored TEXT[],
    point_in_time TIMESTAMPTZ,
    started_at TIMESTAMPTZ DEFAULT NOW(),
    completed_at TIMESTAMPTZ,
    duration_seconds INTEGER,
    records_restored BIGINT,
    error_message TEXT,
    performed_by UUID REFERENCES auth.users(id),
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_restore_history_backup_id ON restore_history(backup_id);
CREATE INDEX IF NOT EXISTS idx_restore_history_status ON restore_history(restore_status);

-- Step 3: Create data integrity checks table
CREATE TABLE IF NOT EXISTS data_integrity_checks (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    check_type TEXT NOT NULL, -- 'checksum', 'row_count', 'foreign_key', 'constraint'
    table_name TEXT NOT NULL,
    expected_value TEXT,
    actual_value TEXT,
    status TEXT DEFAULT 'passed', -- 'passed', 'failed', 'warning'
    error_details TEXT,
    checked_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_integrity_checks_table ON data_integrity_checks(table_name);
CREATE INDEX IF NOT EXISTS idx_integrity_checks_status ON data_integrity_checks(status);
CREATE INDEX IF NOT EXISTS idx_integrity_checks_checked_at ON data_integrity_checks(checked_at DESC);

-- Step 4: Create function to log backup
CREATE OR REPLACE FUNCTION log_backup(
    p_backup_type TEXT,
    p_backup_method TEXT,
    p_tables_included TEXT[] DEFAULT NULL,
    p_retention_days INTEGER DEFAULT 30
)
RETURNS UUID AS $$
DECLARE
    v_backup_id UUID;
BEGIN
    INSERT INTO backup_metadata (
        backup_type,
        backup_method,
        tables_included,
        retention_days,
        expires_at,
        created_by
    ) VALUES (
        p_backup_type,
        p_backup_method,
        p_tables_included,
        p_retention_days,
        NOW() + (p_retention_days || ' days')::INTERVAL,
        auth.uid()
    )
    RETURNING id INTO v_backup_id;
    
    RETURN v_backup_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Step 5: Create function to complete backup
CREATE OR REPLACE FUNCTION complete_backup(
    p_backup_id UUID,
    p_backup_size_bytes BIGINT,
    p_backup_location TEXT,
    p_checksum TEXT,
    p_success BOOLEAN DEFAULT true,
    p_error_message TEXT DEFAULT NULL
)
RETURNS VOID AS $$
DECLARE
    v_started_at TIMESTAMPTZ;
    v_duration INTEGER;
BEGIN
    SELECT started_at INTO v_started_at
    FROM backup_metadata
    WHERE id = p_backup_id;
    
    v_duration := EXTRACT(EPOCH FROM (NOW() - v_started_at));
    
    UPDATE backup_metadata
    SET 
        backup_status = CASE WHEN p_success THEN 'completed' ELSE 'failed' END,
        backup_size_bytes = p_backup_size_bytes,
        backup_location = p_backup_location,
        checksum = p_checksum,
        completed_at = NOW(),
        duration_seconds = v_duration,
        error_message = p_error_message
    WHERE id = p_backup_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Step 6: Create function to verify data integrity
CREATE OR REPLACE FUNCTION verify_data_integrity()
RETURNS TABLE(
    table_name TEXT,
    check_type TEXT,
    status TEXT,
    message TEXT
) AS $$
BEGIN
    -- Check row counts
    RETURN QUERY
    SELECT 
        'profiles'::TEXT as table_name,
        'row_count'::TEXT as check_type,
        CASE WHEN COUNT(*) > 0 THEN 'passed' ELSE 'warning' END as status,
        format('Total profiles: %s', COUNT(*)) as message
    FROM profiles;
    
    -- Check for orphaned records
    RETURN QUERY
    SELECT 
        'profiles'::TEXT as table_name,
        'foreign_key'::TEXT as check_type,
        CASE WHEN COUNT(*) = 0 THEN 'passed' ELSE 'failed' END as status,
        format('Orphaned profiles (no auth user): %s', COUNT(*)) as message
    FROM profiles p
    LEFT JOIN auth.users u ON p.user_id = u.id
    WHERE u.id IS NULL;
    
    -- Check for duplicate emails
    RETURN QUERY
    SELECT 
        'profiles'::TEXT as table_name,
        'constraint'::TEXT as check_type,
        CASE WHEN COUNT(*) = 0 THEN 'passed' ELSE 'failed' END as status,
        format('Duplicate emails: %s', COUNT(*)) as message
    FROM (
        SELECT email, COUNT(*) as cnt
        FROM profiles
        GROUP BY email
        HAVING COUNT(*) > 1
    ) duplicates;
    
    -- Check MLM hierarchy integrity
    RETURN QUERY
    SELECT 
        'user_hierarchy'::TEXT as table_name,
        'foreign_key'::TEXT as check_type,
        CASE WHEN COUNT(*) = 0 THEN 'passed' ELSE 'failed' END as status,
        format('Invalid sponsor references: %s', COUNT(*)) as message
    FROM user_hierarchy uh
    LEFT JOIN profiles p ON uh.sponsor_id = p.id
    WHERE uh.sponsor_id IS NOT NULL AND p.id IS NULL;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Step 7: Create automated backup schedule table
CREATE TABLE IF NOT EXISTS backup_schedule (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    schedule_name TEXT UNIQUE NOT NULL,
    backup_type TEXT NOT NULL,
    frequency TEXT NOT NULL, -- 'hourly', 'daily', 'weekly', 'monthly'
    time_of_day TIME,
    day_of_week INTEGER, -- 0-6 (Sunday-Saturday)
    day_of_month INTEGER, -- 1-31
    retention_days INTEGER DEFAULT 30,
    enabled BOOLEAN DEFAULT true,
    last_run_at TIMESTAMPTZ,
    next_run_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Insert default backup schedules
INSERT INTO backup_schedule (schedule_name, backup_type, frequency, time_of_day, retention_days)
VALUES 
    ('daily_full_backup', 'full', 'daily', '02:00:00', 7),
    ('hourly_incremental', 'incremental', 'hourly', NULL, 1),
    ('weekly_full_backup', 'full', 'weekly', '03:00:00', 30)
ON CONFLICT (schedule_name) DO NOTHING;

-- Step 8: Create recovery point objective (RPO) tracking
CREATE TABLE IF NOT EXISTS rpo_tracking (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    table_name TEXT NOT NULL,
    last_backup_at TIMESTAMPTZ,
    last_transaction_at TIMESTAMPTZ,
    data_loss_window_seconds INTEGER,
    rpo_target_seconds INTEGER DEFAULT 3600, -- 1 hour
    status TEXT DEFAULT 'within_rpo', -- 'within_rpo', 'exceeds_rpo', 'critical'
    checked_at TIMESTAMPTZ DEFAULT NOW()
);

-- Step 9: Create function to check RPO status
CREATE OR REPLACE FUNCTION check_rpo_status()
RETURNS TABLE(
    table_name TEXT,
    last_backup_age INTERVAL,
    rpo_target INTERVAL,
    status TEXT,
    action_required TEXT
) AS $$
BEGIN
    RETURN QUERY
    SELECT 
        bm.tables_included[1] as table_name,
        NOW() - bm.completed_at as last_backup_age,
        (rt.rpo_target_seconds || ' seconds')::INTERVAL as rpo_target,
        CASE 
            WHEN EXTRACT(EPOCH FROM (NOW() - bm.completed_at)) > rt.rpo_target_seconds * 2 THEN 'critical'
            WHEN EXTRACT(EPOCH FROM (NOW() - bm.completed_at)) > rt.rpo_target_seconds THEN 'exceeds_rpo'
            ELSE 'within_rpo'
        END as status,
        CASE 
            WHEN EXTRACT(EPOCH FROM (NOW() - bm.completed_at)) > rt.rpo_target_seconds * 2 
            THEN 'IMMEDIATE BACKUP REQUIRED'
            WHEN EXTRACT(EPOCH FROM (NOW() - bm.completed_at)) > rt.rpo_target_seconds 
            THEN 'Backup recommended'
            ELSE 'No action needed'
        END as action_required
    FROM backup_metadata bm
    CROSS JOIN rpo_tracking rt
    WHERE bm.backup_status = 'completed'
    AND bm.backup_type = 'full'
    ORDER BY bm.completed_at DESC
    LIMIT 1;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Step 10: Create disaster recovery runbook table
CREATE TABLE IF NOT EXISTS dr_runbook (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    scenario TEXT NOT NULL, -- 'database_corruption', 'data_loss', 'ransomware', 'hardware_failure'
    severity TEXT NOT NULL, -- 'low', 'medium', 'high', 'critical'
    detection_steps TEXT[],
    recovery_steps TEXT[],
    estimated_rto_minutes INTEGER, -- Recovery Time Objective
    estimated_rpo_minutes INTEGER, -- Recovery Point Objective
    required_roles TEXT[],
    contact_list JSONB,
    last_tested_at TIMESTAMPTZ,
    test_results TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Insert disaster recovery scenarios
INSERT INTO dr_runbook (scenario, severity, detection_steps, recovery_steps, estimated_rto_minutes, estimated_rpo_minutes, required_roles)
VALUES 
(
    'database_corruption',
    'critical',
    ARRAY[
        'Check database logs for corruption errors',
        'Run data integrity checks',
        'Verify table accessibility'
    ],
    ARRAY[
        '1. Stop all application services',
        '2. Identify last good backup',
        '3. Restore from backup',
        '4. Verify data integrity',
        '5. Restart services',
        '6. Monitor for issues'
    ],
    60,
    60,
    ARRAY['DBA', 'DevOps', 'CTO']
),
(
    'data_loss',
    'high',
    ARRAY[
        'Identify missing data',
        'Check backup availability',
        'Determine data loss scope'
    ],
    ARRAY[
        '1. Stop writes to affected tables',
        '2. Identify point-in-time for restore',
        '3. Restore from backup',
        '4. Verify restored data',
        '5. Resume operations'
    ],
    30,
    60,
    ARRAY['DBA', 'DevOps']
),
(
    'ransomware',
    'critical',
    ARRAY[
        'Detect encryption activity',
        'Identify affected systems',
        'Isolate infected systems'
    ],
    ARRAY[
        '1. IMMEDIATELY disconnect from network',
        '2. Identify clean backup (before infection)',
        '3. Wipe and rebuild systems',
        '4. Restore from clean backup',
        '5. Implement additional security',
        '6. Monitor for reinfection'
    ],
    240,
    1440,
    ARRAY['Security', 'DBA', 'DevOps', 'CTO', 'Legal']
)
ON CONFLICT DO NOTHING;

-- Step 11: Create function to get recovery plan
CREATE OR REPLACE FUNCTION get_recovery_plan(p_scenario TEXT)
RETURNS TABLE(
    scenario TEXT,
    severity TEXT,
    detection_steps TEXT[],
    recovery_steps TEXT[],
    estimated_rto TEXT,
    estimated_rpo TEXT,
    required_roles TEXT[]
) AS $$
BEGIN
    RETURN QUERY
    SELECT 
        dr.scenario,
        dr.severity,
        dr.detection_steps,
        dr.recovery_steps,
        format('%s minutes', dr.estimated_rto_minutes) as estimated_rto,
        format('%s minutes', dr.estimated_rpo_minutes) as estimated_rpo,
        dr.required_roles
    FROM dr_runbook dr
    WHERE dr.scenario = p_scenario;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Step 12: Create backup verification function
CREATE OR REPLACE FUNCTION verify_backup(p_backup_id UUID)
RETURNS TABLE(
    check_name TEXT,
    status TEXT,
    message TEXT
) AS $$
DECLARE
    v_backup RECORD;
BEGIN
    SELECT * INTO v_backup
    FROM backup_metadata
    WHERE id = p_backup_id;
    
    IF NOT FOUND THEN
        RETURN QUERY SELECT 'backup_exists'::TEXT, 'failed'::TEXT, 'Backup not found'::TEXT;
        RETURN;
    END IF;
    
    -- Check backup completed successfully
    RETURN QUERY SELECT 
        'backup_status'::TEXT,
        CASE WHEN v_backup.backup_status = 'completed' THEN 'passed' ELSE 'failed' END,
        format('Backup status: %s', v_backup.backup_status);
    
    -- Check backup size is reasonable
    RETURN QUERY SELECT 
        'backup_size'::TEXT,
        CASE WHEN v_backup.backup_size_bytes > 1000 THEN 'passed' ELSE 'warning' END,
        format('Backup size: %s bytes', v_backup.backup_size_bytes);
    
    -- Check backup has checksum
    RETURN QUERY SELECT 
        'checksum'::TEXT,
        CASE WHEN v_backup.checksum IS NOT NULL THEN 'passed' ELSE 'warning' END,
        format('Checksum: %s', COALESCE(v_backup.checksum, 'Not available'));
    
    -- Check backup age
    RETURN QUERY SELECT 
        'backup_age'::TEXT,
        CASE 
            WHEN v_backup.completed_at > NOW() - INTERVAL '24 hours' THEN 'passed'
            WHEN v_backup.completed_at > NOW() - INTERVAL '7 days' THEN 'warning'
            ELSE 'failed'
        END,
        format('Backup age: %s', AGE(NOW(), v_backup.completed_at));
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ═══════════════════════════════════════════════════════════════
-- ✅ VERIFICATION
-- ═══════════════════════════════════════════════════════════════

-- Test: Log a backup
SELECT log_backup('full', 'pg_dump', ARRAY['profiles', 'user_hierarchy'], 30);

-- Test: Verify data integrity
SELECT * FROM verify_data_integrity();

-- Test: Check RPO status
SELECT * FROM check_rpo_status();

-- Test: Get recovery plan
SELECT * FROM get_recovery_plan('database_corruption');

-- View backup schedules
SELECT * FROM backup_schedule WHERE enabled = true;

-- View disaster recovery scenarios
SELECT scenario, severity, estimated_rto_minutes, estimated_rpo_minutes
FROM dr_runbook
ORDER BY severity DESC;

RAISE NOTICE '✅ Disaster Recovery system implemented!';
RAISE NOTICE 'Next steps:';
RAISE NOTICE '1. Set up automated backup scripts';
RAISE NOTICE '2. Test restore procedures';
RAISE NOTICE '3. Document recovery contacts';
RAISE NOTICE '4. Schedule DR drills';
RAISE NOTICE '5. Monitor backup health';
