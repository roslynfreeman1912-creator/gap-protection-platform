-- ═══════════════════════════════════════════════════════════════
-- 💾 SOLUTION 7: Real Backup to External VPS (Hostinger)
-- ═══════════════════════════════════════════════════════════════
-- Problem: Need real external backup storage
-- Solution: Automated backup from Supabase to Hostinger VPS
-- Architecture: Supabase (Primary) → Hostinger VPS (Backup)
-- ═══════════════════════════════════════════════════════════════

-- Step 1: Create external backup configuration table
CREATE TABLE IF NOT EXISTS external_backup_config (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    config_name TEXT UNIQUE NOT NULL,
    backup_type TEXT NOT NULL, -- 'vps_mysql', 'vps_postgresql', 'vps_files'
    host TEXT NOT NULL,
    port INTEGER NOT NULL,
    database_name TEXT,
    username TEXT,
    password_encrypted TEXT, -- Store encrypted
    connection_string TEXT,
    backup_path TEXT, -- For file backups
    enabled BOOLEAN DEFAULT true,
    last_test_at TIMESTAMPTZ,
    test_status TEXT, -- 'success', 'failed'
    test_error TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Insert Hostinger VPS configuration (update with your details)
INSERT INTO external_backup_config (
    config_name,
    backup_type,
    host,
    port,
    database_name,
    username,
    backup_path,
    enabled
) VALUES (
    'hostinger_vps_primary',
    'vps_mysql',
    'your-vps-ip.hostinger.com', -- Replace with your VPS IP
    3306,
    'gap_protection_backup',
    'backup_user',
    '/var/backups/gap-protection',
    true
) ON CONFLICT (config_name) DO UPDATE SET
    updated_at = NOW();

-- Step 2: Create external backup log table
CREATE TABLE IF NOT EXISTS external_backup_log (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    config_id UUID REFERENCES external_backup_config(id),
    backup_type TEXT NOT NULL,
    backup_method TEXT NOT NULL, -- 'full_dump', 'incremental', 'table_sync'
    tables_backed_up TEXT[],
    records_backed_up BIGINT,
    backup_size_bytes BIGINT,
    backup_location TEXT,
    backup_status TEXT DEFAULT 'in_progress',
    started_at TIMESTAMPTZ DEFAULT NOW(),
    completed_at TIMESTAMPTZ,
    duration_seconds INTEGER,
    error_message TEXT,
    checksum TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_external_backup_log_config ON external_backup_log(config_id);
CREATE INDEX IF NOT EXISTS idx_external_backup_log_status ON external_backup_log(backup_status);
CREATE INDEX IF NOT EXISTS idx_external_backup_log_created_at ON external_backup_log(created_at DESC);

-- Step 3: Create table sync status (for incremental backups)
CREATE TABLE IF NOT EXISTS table_sync_status (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    table_name TEXT NOT NULL,
    last_sync_at TIMESTAMPTZ,
    last_synced_id UUID,
    last_synced_timestamp TIMESTAMPTZ,
    records_synced BIGINT,
    sync_status TEXT DEFAULT 'pending', -- 'pending', 'syncing', 'completed', 'failed'
    next_sync_at TIMESTAMPTZ,
    error_message TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(table_name)
);

-- Insert tables to sync
INSERT INTO table_sync_status (table_name, next_sync_at)
VALUES 
    ('profiles', NOW()),
    ('user_hierarchy', NOW()),
    ('commissions', NOW()),
    ('transactions', NOW()),
    ('security_scans', NOW()),
    ('contracts', NOW()),
    ('invoices', NOW()),
    ('promotion_codes', NOW())
ON CONFLICT (table_name) DO NOTHING;

-- Step 4: Create function to prepare backup data
CREATE OR REPLACE FUNCTION prepare_backup_data(p_table_name TEXT)
RETURNS TABLE(
    data_json JSONB,
    record_count BIGINT
) AS $$
DECLARE
    v_query TEXT;
    v_count BIGINT;
BEGIN
    -- Build dynamic query based on table
    v_query := format('
        SELECT jsonb_agg(row_to_json(t.*)) as data_json,
               COUNT(*) as record_count
        FROM %I t
    ', p_table_name);
    
    RETURN QUERY EXECUTE v_query;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Step 5: Create function to log external backup
CREATE OR REPLACE FUNCTION log_external_backup(
    p_config_name TEXT,
    p_backup_method TEXT,
    p_tables TEXT[]
)
RETURNS UUID AS $$
DECLARE
    v_backup_id UUID;
    v_config_id UUID;
BEGIN
    -- Get config ID
    SELECT id INTO v_config_id
    FROM external_backup_config
    WHERE config_name = p_config_name AND enabled = true;
    
    IF v_config_id IS NULL THEN
        RAISE EXCEPTION 'Backup configuration not found or disabled: %', p_config_name;
    END IF;
    
    -- Create backup log entry
    INSERT INTO external_backup_log (
        config_id,
        backup_type,
        backup_method,
        tables_backed_up
    ) VALUES (
        v_config_id,
        'vps_mysql',
        p_backup_method,
        p_tables
    )
    RETURNING id INTO v_backup_id;
    
    RETURN v_backup_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Step 6: Create function to complete external backup
CREATE OR REPLACE FUNCTION complete_external_backup(
    p_backup_id UUID,
    p_records_backed_up BIGINT,
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
    FROM external_backup_log
    WHERE id = p_backup_id;
    
    v_duration := EXTRACT(EPOCH FROM (NOW() - v_started_at));
    
    UPDATE external_backup_log
    SET 
        backup_status = CASE WHEN p_success THEN 'completed' ELSE 'failed' END,
        records_backed_up = p_records_backed_up,
        backup_size_bytes = p_backup_size_bytes,
        backup_location = p_backup_location,
        checksum = p_checksum,
        completed_at = NOW(),
        duration_seconds = v_duration,
        error_message = p_error_message
    WHERE id = p_backup_id;
    
    -- Update table sync status
    IF p_success THEN
        UPDATE table_sync_status
        SET 
            last_sync_at = NOW(),
            sync_status = 'completed',
            records_synced = p_records_backed_up,
            next_sync_at = NOW() + INTERVAL '1 hour',
            updated_at = NOW()
        WHERE table_name = ANY(
            SELECT unnest(tables_backed_up)
            FROM external_backup_log
            WHERE id = p_backup_id
        );
    END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Step 7: Create backup verification table
CREATE TABLE IF NOT EXISTS backup_verification (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    backup_id UUID REFERENCES external_backup_log(id),
    verification_type TEXT NOT NULL, -- 'checksum', 'record_count', 'restore_test'
    expected_value TEXT,
    actual_value TEXT,
    status TEXT DEFAULT 'pending', -- 'pending', 'passed', 'failed'
    error_details TEXT,
    verified_at TIMESTAMPTZ DEFAULT NOW()
);

-- Step 8: Create function to get backup status
CREATE OR REPLACE FUNCTION get_backup_status()
RETURNS TABLE(
    table_name TEXT,
    last_backup_at TIMESTAMPTZ,
    backup_age INTERVAL,
    records_backed_up BIGINT,
    next_backup_at TIMESTAMPTZ,
    status TEXT
) AS $$
BEGIN
    RETURN QUERY
    SELECT 
        ts.table_name,
        ts.last_sync_at as last_backup_at,
        CASE 
            WHEN ts.last_sync_at IS NOT NULL 
            THEN AGE(NOW(), ts.last_sync_at)
            ELSE NULL
        END as backup_age,
        ts.records_synced as records_backed_up,
        ts.next_sync_at as next_backup_at,
        CASE 
            WHEN ts.last_sync_at IS NULL THEN 'never_backed_up'
            WHEN ts.last_sync_at < NOW() - INTERVAL '24 hours' THEN 'outdated'
            WHEN ts.last_sync_at < NOW() - INTERVAL '6 hours' THEN 'needs_backup'
            ELSE 'up_to_date'
        END as status
    FROM table_sync_status ts
    ORDER BY ts.last_sync_at ASC NULLS FIRST;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Step 9: Create backup health check
CREATE OR REPLACE FUNCTION check_backup_health()
RETURNS TABLE(
    check_name TEXT,
    status TEXT,
    message TEXT,
    action_required TEXT
) AS $$
BEGIN
    -- Check if any table hasn't been backed up in 24 hours
    RETURN QUERY
    SELECT 
        'backup_freshness'::TEXT,
        CASE 
            WHEN COUNT(*) FILTER (WHERE last_sync_at < NOW() - INTERVAL '24 hours') > 0 
            THEN 'critical'
            WHEN COUNT(*) FILTER (WHERE last_sync_at < NOW() - INTERVAL '6 hours') > 0 
            THEN 'warning'
            ELSE 'healthy'
        END,
        format('%s tables need backup', 
            COUNT(*) FILTER (WHERE last_sync_at < NOW() - INTERVAL '6 hours')
        ),
        CASE 
            WHEN COUNT(*) FILTER (WHERE last_sync_at < NOW() - INTERVAL '24 hours') > 0 
            THEN 'IMMEDIATE BACKUP REQUIRED'
            WHEN COUNT(*) FILTER (WHERE last_sync_at < NOW() - INTERVAL '6 hours') > 0 
            THEN 'Schedule backup soon'
            ELSE 'No action needed'
        END
    FROM table_sync_status;
    
    -- Check recent backup failures
    RETURN QUERY
    SELECT 
        'recent_failures'::TEXT,
        CASE 
            WHEN COUNT(*) > 5 THEN 'critical'
            WHEN COUNT(*) > 0 THEN 'warning'
            ELSE 'healthy'
        END,
        format('%s failed backups in last 24 hours', COUNT(*)),
        CASE 
            WHEN COUNT(*) > 5 THEN 'Investigate backup system'
            WHEN COUNT(*) > 0 THEN 'Review error logs'
            ELSE 'No action needed'
        END
    FROM external_backup_log
    WHERE backup_status = 'failed'
    AND created_at > NOW() - INTERVAL '24 hours';
    
    -- Check VPS connectivity
    RETURN QUERY
    SELECT 
        'vps_connectivity'::TEXT,
        CASE 
            WHEN MAX(last_test_at) < NOW() - INTERVAL '1 hour' THEN 'warning'
            WHEN MAX(last_test_at) IS NULL THEN 'critical'
            ELSE 'healthy'
        END,
        format('Last connectivity test: %s', 
            COALESCE(MAX(last_test_at)::TEXT, 'Never')
        ),
        CASE 
            WHEN MAX(last_test_at) < NOW() - INTERVAL '1 hour' THEN 'Test VPS connection'
            WHEN MAX(last_test_at) IS NULL THEN 'CONFIGURE VPS CONNECTION'
            ELSE 'No action needed'
        END
    FROM external_backup_config
    WHERE enabled = true;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ═══════════════════════════════════════════════════════════════
-- ✅ VERIFICATION
-- ═══════════════════════════════════════════════════════════════

-- View backup configuration
SELECT * FROM external_backup_config;

-- View tables to sync
SELECT * FROM table_sync_status ORDER BY last_sync_at ASC NULLS FIRST;

-- Check backup status
SELECT * FROM get_backup_status();

-- Check backup health
SELECT * FROM check_backup_health();

-- View recent backups
SELECT 
    ebl.id,
    ebc.config_name,
    ebl.backup_method,
    ebl.tables_backed_up,
    ebl.records_backed_up,
    ebl.backup_status,
    ebl.duration_seconds,
    ebl.created_at
FROM external_backup_log ebl
JOIN external_backup_config ebc ON ebl.config_id = ebc.id
ORDER BY ebl.created_at DESC
LIMIT 10;

RAISE NOTICE '✅ External VPS Backup system configured!';
RAISE NOTICE 'Next steps:';
RAISE NOTICE '1. Update VPS connection details in external_backup_config';
RAISE NOTICE '2. Deploy backup Edge Function';
RAISE NOTICE '3. Set up cron job for automated backups';
RAISE NOTICE '4. Test backup and restore procedures';
RAISE NOTICE '5. Monitor backup health regularly';
