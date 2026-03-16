-- ═══════════════════════════════════════════════════════════════
-- 🔐 SOLUTION 8: Advanced Roles & Permissions System
-- ═══════════════════════════════════════════════════════════════
-- Problem: Complex access control requirements
-- Solution: Multi-level role system with separate dashboards
-- ═══════════════════════════════════════════════════════════════

-- Step 1: Update roles enum to include all types
DO $$ 
BEGIN
    -- Add new role types if they don't exist
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'user_role') THEN
        CREATE TYPE user_role AS ENUM (
            'super_admin',      -- الادمن الرئيسي - يرى كل شيء
            'call_center',      -- كول سنتر - صفحة منفصلة
            'mlm_partner',      -- شريك MLM - لوحة توماس
            'customer'          -- عميل عادي - فحص فقط
        );
    END IF;
END $$;

-- Step 2: Create call center accounts table
CREATE TABLE IF NOT EXISTS call_center_accounts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    account_name TEXT UNIQUE NOT NULL,
    username TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    created_by UUID REFERENCES auth.users(id), -- الادمن الذي أنشأه
    status TEXT DEFAULT 'active', -- 'active', 'suspended', 'deleted'
    permissions JSONB DEFAULT '{
        "can_add_customers": true,
        "can_edit_customers": true,
        "can_view_scans": true,
        "can_run_scans": true,
        "can_view_reports": true
    }'::jsonb,
    max_customers INTEGER DEFAULT 1000,
    current_customers INTEGER DEFAULT 0,
    last_login_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_call_center_username ON call_center_accounts(username);
CREATE INDEX IF NOT EXISTS idx_call_center_status ON call_center_accounts(status);
CREATE INDEX IF NOT EXISTS idx_call_center_created_by ON call_center_accounts(created_by);

-- Step 3: Link customers to call center
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS call_center_id UUID REFERENCES call_center_accounts(id);
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS created_by_call_center BOOLEAN DEFAULT false;

CREATE INDEX IF NOT EXISTS idx_profiles_call_center ON profiles(call_center_id);

-- Step 4: Create scan access control table
CREATE TABLE IF NOT EXISTS scan_access_control (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES auth.users(id),
    call_center_id UUID REFERENCES call_center_accounts(id),
    can_scan BOOLEAN DEFAULT false,
    requires_registration BOOLEAN DEFAULT true,
    scan_limit INTEGER, -- NULL = unlimited
    scans_used INTEGER DEFAULT 0,
    valid_until TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(user_id)
);

-- Step 5: Create admin notifications table
CREATE TABLE IF NOT EXISTS admin_notifications (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    notification_type TEXT NOT NULL, -- 'scan_completed', 'new_customer', 'mlm_registration', 'call_center_activity'
    title TEXT NOT NULL,
    message TEXT NOT NULL,
    severity TEXT DEFAULT 'info', -- 'info', 'warning', 'critical'
    source_type TEXT, -- 'customer', 'call_center', 'mlm_partner'
    source_id UUID,
    related_scan_id UUID,
    related_user_id UUID REFERENCES auth.users(id),
    related_call_center_id UUID REFERENCES call_center_accounts(id),
    is_read BOOLEAN DEFAULT false,
    read_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_admin_notif_type ON admin_notifications(notification_type);
CREATE INDEX IF NOT EXISTS idx_admin_notif_read ON admin_notifications(is_read) WHERE NOT is_read;
CREATE INDEX IF NOT EXISTS idx_admin_notif_created ON admin_notifications(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_admin_notif_severity ON admin_notifications(severity);

-- Step 6: Create function to check scan access
CREATE OR REPLACE FUNCTION can_user_scan(p_user_id UUID)
RETURNS TABLE(
    can_scan BOOLEAN,
    reason TEXT,
    requires_registration BOOLEAN
) AS $$
DECLARE
    v_profile RECORD;
    v_access RECORD;
BEGIN
    -- Get user profile
    SELECT * INTO v_profile
    FROM profiles
    WHERE user_id = p_user_id;
    
    -- Super admin can always scan
    IF v_profile.role = 'super_admin' THEN
        RETURN QUERY SELECT true, 'Super admin access'::TEXT, false;
        RETURN;
    END IF;
    
    -- Call center can always scan
    IF v_profile.role = 'call_center' THEN
        RETURN QUERY SELECT true, 'Call center access'::TEXT, false;
        RETURN;
    END IF;
    
    -- MLM partner can scan (integrated in their dashboard)
    IF v_profile.role = 'mlm_partner' THEN
        RETURN QUERY SELECT true, 'MLM partner access'::TEXT, false;
        RETURN;
    END IF;
    
    -- Customer needs to be registered
    IF v_profile.role = 'customer' THEN
        -- Check if registered
        IF v_profile.status = 'active' THEN
            -- Check scan limits
            SELECT * INTO v_access
            FROM scan_access_control
            WHERE user_id = p_user_id;
            
            IF v_access IS NULL THEN
                -- No access record, allow scan (default for registered customers)
                RETURN QUERY SELECT true, 'Registered customer'::TEXT, false;
                RETURN;
            END IF;
            
            -- Check limits
            IF v_access.scan_limit IS NOT NULL AND v_access.scans_used >= v_access.scan_limit THEN
                RETURN QUERY SELECT false, 'Scan limit reached'::TEXT, false;
                RETURN;
            END IF;
            
            -- Check validity
            IF v_access.valid_until IS NOT NULL AND v_access.valid_until < NOW() THEN
                RETURN QUERY SELECT false, 'Access expired'::TEXT, false;
                RETURN;
            END IF;
            
            RETURN QUERY SELECT true, 'Customer with valid access'::TEXT, false;
            RETURN;
        ELSE
            RETURN QUERY SELECT false, 'Registration required'::TEXT, true;
            RETURN;
        END IF;
    END IF;
    
    -- Default: no access
    RETURN QUERY SELECT false, 'No access'::TEXT, true;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Step 7: Create function to notify admin
CREATE OR REPLACE FUNCTION notify_admin(
    p_notification_type TEXT,
    p_title TEXT,
    p_message TEXT,
    p_severity TEXT DEFAULT 'info',
    p_source_type TEXT DEFAULT NULL,
    p_source_id UUID DEFAULT NULL,
    p_related_scan_id UUID DEFAULT NULL,
    p_related_user_id UUID DEFAULT NULL,
    p_related_call_center_id UUID DEFAULT NULL
)
RETURNS UUID AS $$
DECLARE
    v_notification_id UUID;
BEGIN
    INSERT INTO admin_notifications (
        notification_type,
        title,
        message,
        severity,
        source_type,
        source_id,
        related_scan_id,
        related_user_id,
        related_call_center_id
    ) VALUES (
        p_notification_type,
        p_title,
        p_message,
        p_severity,
        p_source_type,
        p_source_id,
        p_related_scan_id,
        p_related_user_id,
        p_related_call_center_id
    )
    RETURNING id INTO v_notification_id;
    
    RETURN v_notification_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Step 8: Create trigger to notify admin on scan completion
CREATE OR REPLACE FUNCTION notify_admin_on_scan()
RETURNS TRIGGER AS $$
DECLARE
    v_user_profile RECORD;
    v_call_center RECORD;
    v_title TEXT;
    v_message TEXT;
BEGIN
    -- Get user profile
    SELECT * INTO v_user_profile
    FROM profiles
    WHERE user_id = NEW.user_id;
    
    -- Build notification based on source
    IF v_user_profile.call_center_id IS NOT NULL THEN
        -- Scan from call center customer
        SELECT * INTO v_call_center
        FROM call_center_accounts
        WHERE id = v_user_profile.call_center_id;
        
        v_title := format('Scan completed by Call Center: %s', v_call_center.account_name);
        v_message := format('Customer: %s %s, Domain: %s, Issues found: %s',
            v_user_profile.first_name,
            v_user_profile.last_name,
            NEW.domain,
            COALESCE(NEW.total_vulnerabilities, 0)
        );
        
        PERFORM notify_admin(
            'scan_completed',
            v_title,
            v_message,
            CASE WHEN NEW.total_vulnerabilities > 10 THEN 'warning' ELSE 'info' END,
            'call_center',
            v_call_center.id,
            NEW.id,
            NEW.user_id,
            v_call_center.id
        );
    ELSIF v_user_profile.role = 'mlm_partner' THEN
        -- Scan from MLM partner
        v_title := format('Scan completed by MLM Partner: %s %s',
            v_user_profile.first_name,
            v_user_profile.last_name
        );
        v_message := format('Domain: %s, Issues found: %s',
            NEW.domain,
            COALESCE(NEW.total_vulnerabilities, 0)
        );
        
        PERFORM notify_admin(
            'scan_completed',
            v_title,
            v_message,
            CASE WHEN NEW.total_vulnerabilities > 10 THEN 'warning' ELSE 'info' END,
            'mlm_partner',
            v_user_profile.id,
            NEW.id,
            NEW.user_id,
            NULL
        );
    ELSE
        -- Scan from regular customer
        v_title := format('Scan completed by Customer: %s %s',
            v_user_profile.first_name,
            v_user_profile.last_name
        );
        v_message := format('Domain: %s, Issues found: %s',
            NEW.domain,
            COALESCE(NEW.total_vulnerabilities, 0)
        );
        
        PERFORM notify_admin(
            'scan_completed',
            v_title,
            v_message,
            CASE WHEN NEW.total_vulnerabilities > 10 THEN 'warning' ELSE 'info' END,
            'customer',
            v_user_profile.id,
            NEW.id,
            NEW.user_id,
            NULL
        );
    END IF;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger
DROP TRIGGER IF EXISTS trigger_notify_admin_on_scan ON security_scans;
CREATE TRIGGER trigger_notify_admin_on_scan
AFTER INSERT ON security_scans
FOR EACH ROW
EXECUTE FUNCTION notify_admin_on_scan();

-- Step 9: Create trigger to notify admin on new customer
CREATE OR REPLACE FUNCTION notify_admin_on_new_customer()
RETURNS TRIGGER AS $$
DECLARE
    v_call_center RECORD;
    v_title TEXT;
    v_message TEXT;
BEGIN
    IF NEW.created_by_call_center AND NEW.call_center_id IS NOT NULL THEN
        -- Customer created by call center
        SELECT * INTO v_call_center
        FROM call_center_accounts
        WHERE id = NEW.call_center_id;
        
        v_title := format('New customer added by Call Center: %s', v_call_center.account_name);
        v_message := format('Customer: %s %s, Email: %s',
            NEW.first_name,
            NEW.last_name,
            NEW.email
        );
        
        PERFORM notify_admin(
            'new_customer',
            v_title,
            v_message,
            'info',
            'call_center',
            v_call_center.id,
            NULL,
            NEW.user_id,
            v_call_center.id
        );
        
        -- Update call center customer count
        UPDATE call_center_accounts
        SET 
            current_customers = current_customers + 1,
            updated_at = NOW()
        WHERE id = NEW.call_center_id;
    ELSIF NEW.role = 'mlm_partner' THEN
        -- New MLM partner registration
        v_title := format('New MLM Partner registered: %s %s',
            NEW.first_name,
            NEW.last_name
        );
        v_message := format('Email: %s, Sponsor: %s',
            NEW.email,
            COALESCE(NEW.sponsor_id::TEXT, 'None')
        );
        
        PERFORM notify_admin(
            'mlm_registration',
            v_title,
            v_message,
            'info',
            'mlm_partner',
            NEW.id,
            NULL,
            NEW.user_id,
            NULL
        );
    END IF;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger
DROP TRIGGER IF EXISTS trigger_notify_admin_on_new_customer ON profiles;
CREATE TRIGGER trigger_notify_admin_on_new_customer
AFTER INSERT ON profiles
FOR EACH ROW
EXECUTE FUNCTION notify_admin_on_new_customer();

-- Step 10: Create RLS policies for call center accounts
ALTER TABLE call_center_accounts ENABLE ROW LEVEL SECURITY;

-- Super admin can see all call centers
CREATE POLICY "Super admin can view all call centers"
ON call_center_accounts FOR SELECT
TO authenticated
USING (
    EXISTS (
        SELECT 1 FROM profiles
        WHERE profiles.user_id = auth.uid()
        AND profiles.role = 'super_admin'
    )
);

-- Super admin can manage call centers
CREATE POLICY "Super admin can manage call centers"
ON call_center_accounts FOR ALL
TO authenticated
USING (
    EXISTS (
        SELECT 1 FROM profiles
        WHERE profiles.user_id = auth.uid()
        AND profiles.role = 'super_admin'
    )
);

-- Step 11: Update profiles RLS for call center access
CREATE POLICY "Call center can view their customers"
ON profiles FOR SELECT
TO authenticated
USING (
    call_center_id IN (
        SELECT id FROM call_center_accounts
        WHERE username = current_user
    )
    OR
    EXISTS (
        SELECT 1 FROM profiles p
        WHERE p.user_id = auth.uid()
        AND p.role IN ('super_admin', 'call_center')
    )
);

-- Step 12: Create admin dashboard view
CREATE OR REPLACE VIEW admin_dashboard AS
SELECT 
    'total_customers' as metric,
    COUNT(*)::TEXT as value,
    'all time' as period
FROM profiles
WHERE role = 'customer'
UNION ALL
SELECT 
    'total_mlm_partners',
    COUNT(*)::TEXT,
    'all time'
FROM profiles
WHERE role = 'mlm_partner'
UNION ALL
SELECT 
    'total_call_centers',
    COUNT(*)::TEXT,
    'all time'
FROM call_center_accounts
WHERE status = 'active'
UNION ALL
SELECT 
    'total_scans_today',
    COUNT(*)::TEXT,
    'today'
FROM security_scans
WHERE created_at >= CURRENT_DATE
UNION ALL
SELECT 
    'unread_notifications',
    COUNT(*)::TEXT,
    'current'
FROM admin_notifications
WHERE NOT is_read
UNION ALL
SELECT 
    'critical_notifications',
    COUNT(*)::TEXT,
    'current'
FROM admin_notifications
WHERE NOT is_read AND severity = 'critical';

-- Step 13: Create call center dashboard view
CREATE OR REPLACE VIEW call_center_dashboard AS
SELECT 
    cc.id as call_center_id,
    cc.account_name,
    cc.current_customers,
    cc.max_customers,
    COUNT(DISTINCT p.id) as actual_customers,
    COUNT(DISTINCT ss.id) as total_scans,
    COUNT(DISTINCT CASE WHEN ss.created_at >= CURRENT_DATE THEN ss.id END) as scans_today,
    SUM(CASE WHEN ss.total_vulnerabilities > 0 THEN 1 ELSE 0 END) as scans_with_issues
FROM call_center_accounts cc
LEFT JOIN profiles p ON p.call_center_id = cc.id
LEFT JOIN security_scans ss ON ss.user_id = p.user_id
WHERE cc.status = 'active'
GROUP BY cc.id, cc.account_name, cc.current_customers, cc.max_customers;

-- Step 14: Create function to get user dashboard type
CREATE OR REPLACE FUNCTION get_user_dashboard_type(p_user_id UUID)
RETURNS TEXT AS $$
DECLARE
    v_role TEXT;
BEGIN
    SELECT role INTO v_role
    FROM profiles
    WHERE user_id = p_user_id;
    
    CASE v_role
        WHEN 'super_admin' THEN
            RETURN 'admin'; -- /admin/dashboard
        WHEN 'call_center' THEN
            RETURN 'call_center'; -- /call-center/dashboard
        WHEN 'mlm_partner' THEN
            RETURN 'mlm'; -- /mlm/dashboard (توماس)
        WHEN 'customer' THEN
            RETURN 'customer'; -- /dashboard
        ELSE
            RETURN 'none';
    END CASE;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Step 15: Create function to get admin notifications
CREATE OR REPLACE FUNCTION get_admin_notifications(
    p_limit INTEGER DEFAULT 50,
    p_unread_only BOOLEAN DEFAULT false
)
RETURNS TABLE(
    id UUID,
    notification_type TEXT,
    title TEXT,
    message TEXT,
    severity TEXT,
    source_type TEXT,
    source_name TEXT,
    is_read BOOLEAN,
    created_at TIMESTAMPTZ
) AS $$
BEGIN
    RETURN QUERY
    SELECT 
        an.id,
        an.notification_type,
        an.title,
        an.message,
        an.severity,
        an.source_type,
        CASE 
            WHEN an.source_type = 'call_center' THEN cc.account_name
            WHEN an.source_type = 'mlm_partner' THEN p.first_name || ' ' || p.last_name
            WHEN an.source_type = 'customer' THEN p.first_name || ' ' || p.last_name
            ELSE 'System'
        END as source_name,
        an.is_read,
        an.created_at
    FROM admin_notifications an
    LEFT JOIN call_center_accounts cc ON an.related_call_center_id = cc.id
    LEFT JOIN profiles p ON an.related_user_id = p.user_id
    WHERE (NOT p_unread_only OR NOT an.is_read)
    ORDER BY 
        CASE an.severity
            WHEN 'critical' THEN 1
            WHEN 'warning' THEN 2
            WHEN 'info' THEN 3
        END,
        an.created_at DESC
    LIMIT p_limit;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Step 16: Create function to mark notification as read
CREATE OR REPLACE FUNCTION mark_notification_read(p_notification_id UUID)
RETURNS VOID AS $$
BEGIN
    UPDATE admin_notifications
    SET 
        is_read = true,
        read_at = NOW()
    WHERE id = p_notification_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Step 17: Create function to get call center statistics
CREATE OR REPLACE FUNCTION get_call_center_stats(p_call_center_id UUID)
RETURNS TABLE(
    total_customers BIGINT,
    active_customers BIGINT,
    total_scans BIGINT,
    scans_today BIGINT,
    scans_this_week BIGINT,
    scans_this_month BIGINT,
    avg_vulnerabilities_per_scan NUMERIC,
    customers_with_issues BIGINT
) AS $$
BEGIN
    RETURN QUERY
    SELECT 
        COUNT(DISTINCT p.id) as total_customers,
        COUNT(DISTINCT CASE WHEN p.status = 'active' THEN p.id END) as active_customers,
        COUNT(DISTINCT ss.id) as total_scans,
        COUNT(DISTINCT CASE WHEN ss.created_at >= CURRENT_DATE THEN ss.id END) as scans_today,
        COUNT(DISTINCT CASE WHEN ss.created_at >= DATE_TRUNC('week', CURRENT_DATE) THEN ss.id END) as scans_this_week,
        COUNT(DISTINCT CASE WHEN ss.created_at >= DATE_TRUNC('month', CURRENT_DATE) THEN ss.id END) as scans_this_month,
        AVG(ss.total_vulnerabilities) as avg_vulnerabilities_per_scan,
        COUNT(DISTINCT CASE WHEN ss.total_vulnerabilities > 0 THEN p.id END) as customers_with_issues
    FROM profiles p
    LEFT JOIN security_scans ss ON ss.user_id = p.user_id
    WHERE p.call_center_id = p_call_center_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Step 18: Create function to integrate scanner in MLM dashboard
CREATE OR REPLACE FUNCTION get_mlm_partner_scan_access(p_user_id UUID)
RETURNS TABLE(
    can_scan BOOLEAN,
    scans_available INTEGER,
    scans_used INTEGER,
    last_scan_at TIMESTAMPTZ
) AS $$
DECLARE
    v_profile RECORD;
BEGIN
    SELECT * INTO v_profile
    FROM profiles
    WHERE user_id = p_user_id;
    
    IF v_profile.role = 'mlm_partner' AND v_profile.status = 'active' THEN
        RETURN QUERY
        SELECT 
            true as can_scan,
            NULL::INTEGER as scans_available, -- Unlimited for MLM partners
            COUNT(ss.id)::INTEGER as scans_used,
            MAX(ss.created_at) as last_scan_at
        FROM security_scans ss
        WHERE ss.user_id = p_user_id;
    ELSE
        RETURN QUERY
        SELECT 
            false as can_scan,
            0 as scans_available,
            0 as scans_used,
            NULL::TIMESTAMPTZ as last_scan_at;
    END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ═══════════════════════════════════════════════════════════════
-- ✅ VERIFICATION
-- ═══════════════════════════════════════════════════════════════

-- Test: Check scan access for different roles
-- SELECT * FROM can_user_scan('user-id-here');

-- Test: Get admin dashboard
SELECT * FROM admin_dashboard;

-- Test: Get admin notifications
SELECT * FROM get_admin_notifications(10, false);

-- Test: Get call center dashboard
SELECT * FROM call_center_dashboard;

-- Test: Get user dashboard type
-- SELECT get_user_dashboard_type('user-id-here');

-- View all tables
SELECT 
    'call_center_accounts' as table_name,
    COUNT(*) as row_count
FROM call_center_accounts
UNION ALL
SELECT 
    'admin_notifications',
    COUNT(*)
FROM admin_notifications
UNION ALL
SELECT 
    'scan_access_control',
    COUNT(*)
FROM scan_access_control;

RAISE NOTICE '✅ Advanced Roles & Permissions system implemented!';
RAISE NOTICE 'Features:';
RAISE NOTICE '- Super Admin: Full access to everything';
RAISE NOTICE '- Call Center: Separate dashboard with customer management';
RAISE NOTICE '- MLM Partner: Integrated scanner in Thomas dashboard';
RAISE NOTICE '- Customer: Scan access only after registration';
RAISE NOTICE '- Admin notifications for all activities';
RAISE NOTICE '';
RAISE NOTICE 'Next steps:';
RAISE NOTICE '1. Update frontend routes for different dashboards';
RAISE NOTICE '2. Create Call Center management UI';
RAISE NOTICE '3. Integrate scanner in MLM dashboard';
RAISE NOTICE '4. Implement admin notification system';
RAISE NOTICE '5. Test all access controls';
