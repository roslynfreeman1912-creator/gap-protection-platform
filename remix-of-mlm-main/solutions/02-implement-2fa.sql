-- ═══════════════════════════════════════════════════════════════
-- 🔐 SOLUTION 2: Implement 2FA (Two-Factor Authentication)
-- ═══════════════════════════════════════════════════════════════
-- Problem: No 2FA for admin accounts
-- Risk: Account takeover, unauthorized access
-- Solution: TOTP-based 2FA with backup codes
-- ═══════════════════════════════════════════════════════════════

-- Step 1: Create 2FA table
CREATE TABLE IF NOT EXISTS user_2fa (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE UNIQUE NOT NULL,
    secret TEXT NOT NULL,
    enabled BOOLEAN DEFAULT FALSE,
    enabled_at TIMESTAMPTZ,
    backup_codes TEXT[], -- Array of backup codes
    used_backup_codes TEXT[] DEFAULT '{}',
    last_used_at TIMESTAMPTZ,
    failed_attempts INTEGER DEFAULT 0,
    locked_until TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Step 2: Create indexes
CREATE INDEX IF NOT EXISTS idx_user_2fa_user_id ON user_2fa(user_id);
CREATE INDEX IF NOT EXISTS idx_user_2fa_enabled ON user_2fa(enabled) WHERE enabled = true;

-- Step 3: Enable RLS
ALTER TABLE user_2fa ENABLE ROW LEVEL SECURITY;

-- Step 4: Create RLS policies
CREATE POLICY "Users can view own 2FA settings"
ON user_2fa FOR SELECT
TO authenticated
USING (auth.uid() = user_id);

CREATE POLICY "Users can update own 2FA settings"
ON user_2fa FOR UPDATE
TO authenticated
USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own 2FA settings"
ON user_2fa FOR INSERT
TO authenticated
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete own 2FA settings"
ON user_2fa FOR DELETE
TO authenticated
USING (auth.uid() = user_id);

-- Admins can view all 2FA settings
CREATE POLICY "Admins can view all 2FA settings"
ON user_2fa FOR SELECT
TO authenticated
USING (
    EXISTS (
        SELECT 1 FROM profiles
        WHERE profiles.user_id = auth.uid()
        AND profiles.role = 'admin'
    )
);

-- Step 5: Create 2FA audit log
CREATE TABLE IF NOT EXISTS user_2fa_audit (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
    action TEXT NOT NULL, -- 'enabled', 'disabled', 'verified', 'failed', 'backup_used'
    ip_address INET,
    user_agent TEXT,
    success BOOLEAN DEFAULT true,
    error_message TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_user_2fa_audit_user_id ON user_2fa_audit(user_id);
CREATE INDEX IF NOT EXISTS idx_user_2fa_audit_created_at ON user_2fa_audit(created_at DESC);

-- Enable RLS
ALTER TABLE user_2fa_audit ENABLE ROW LEVEL SECURITY;

-- Users can view own audit logs
CREATE POLICY "Users can view own 2FA audit logs"
ON user_2fa_audit FOR SELECT
TO authenticated
USING (auth.uid() = user_id);

-- Admins can view all audit logs
CREATE POLICY "Admins can view all 2FA audit logs"
ON user_2fa_audit FOR SELECT
TO authenticated
USING (
    EXISTS (
        SELECT 1 FROM profiles
        WHERE profiles.user_id = auth.uid()
        AND profiles.role = 'admin'
    )
);

-- Step 6: Create function to log 2FA events
CREATE OR REPLACE FUNCTION log_2fa_event(
    p_user_id UUID,
    p_action TEXT,
    p_success BOOLEAN DEFAULT true,
    p_error_message TEXT DEFAULT NULL
)
RETURNS VOID AS $$
BEGIN
    INSERT INTO user_2fa_audit (
        user_id,
        action,
        ip_address,
        user_agent,
        success,
        error_message
    ) VALUES (
        p_user_id,
        p_action,
        inet_client_addr(),
        current_setting('request.headers', true)::json->>'user-agent',
        p_success,
        p_error_message
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Step 7: Create function to check if 2FA is required
CREATE OR REPLACE FUNCTION is_2fa_required(p_user_id UUID)
RETURNS BOOLEAN AS $$
DECLARE
    user_role TEXT;
    is_enabled BOOLEAN;
BEGIN
    -- Get user role
    SELECT role INTO user_role
    FROM profiles
    WHERE user_id = p_user_id;
    
    -- Check if 2FA is enabled
    SELECT enabled INTO is_enabled
    FROM user_2fa
    WHERE user_id = p_user_id;
    
    -- 2FA is required for admin and partner roles
    IF user_role IN ('admin', 'partner') THEN
        RETURN COALESCE(is_enabled, false);
    END IF;
    
    RETURN false;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Step 8: Create function to verify backup code
CREATE OR REPLACE FUNCTION verify_backup_code(
    p_user_id UUID,
    p_code TEXT
)
RETURNS BOOLEAN AS $$
DECLARE
    v_backup_codes TEXT[];
    v_used_codes TEXT[];
BEGIN
    -- Get backup codes
    SELECT backup_codes, used_backup_codes
    INTO v_backup_codes, v_used_codes
    FROM user_2fa
    WHERE user_id = p_user_id AND enabled = true;
    
    IF v_backup_codes IS NULL THEN
        RETURN false;
    END IF;
    
    -- Check if code exists and not used
    IF p_code = ANY(v_backup_codes) AND NOT (p_code = ANY(v_used_codes)) THEN
        -- Mark code as used
        UPDATE user_2fa
        SET 
            used_backup_codes = array_append(used_backup_codes, p_code),
            last_used_at = NOW(),
            failed_attempts = 0,
            updated_at = NOW()
        WHERE user_id = p_user_id;
        
        -- Log event
        PERFORM log_2fa_event(p_user_id, 'backup_used', true);
        
        RETURN true;
    END IF;
    
    RETURN false;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Step 9: Create function to handle failed attempts
CREATE OR REPLACE FUNCTION record_2fa_failure(p_user_id UUID)
RETURNS VOID AS $$
DECLARE
    v_failed_attempts INTEGER;
BEGIN
    -- Increment failed attempts
    UPDATE user_2fa
    SET 
        failed_attempts = failed_attempts + 1,
        updated_at = NOW()
    WHERE user_id = p_user_id
    RETURNING failed_attempts INTO v_failed_attempts;
    
    -- Lock account after 5 failed attempts for 15 minutes
    IF v_failed_attempts >= 5 THEN
        UPDATE user_2fa
        SET locked_until = NOW() + INTERVAL '15 minutes'
        WHERE user_id = p_user_id;
        
        -- Log event
        PERFORM log_2fa_event(p_user_id, 'account_locked', true, 'Too many failed attempts');
    END IF;
    
    -- Log failure
    PERFORM log_2fa_event(p_user_id, 'verification_failed', false);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Step 10: Create function to check if account is locked
CREATE OR REPLACE FUNCTION is_2fa_locked(p_user_id UUID)
RETURNS BOOLEAN AS $$
DECLARE
    v_locked_until TIMESTAMPTZ;
BEGIN
    SELECT locked_until INTO v_locked_until
    FROM user_2fa
    WHERE user_id = p_user_id;
    
    IF v_locked_until IS NULL THEN
        RETURN false;
    END IF;
    
    IF v_locked_until > NOW() THEN
        RETURN true;
    ELSE
        -- Unlock account
        UPDATE user_2fa
        SET 
            locked_until = NULL,
            failed_attempts = 0,
            updated_at = NOW()
        WHERE user_id = p_user_id;
        
        RETURN false;
    END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Step 11: Make 2FA mandatory for admins
CREATE OR REPLACE FUNCTION enforce_2fa_for_admins()
RETURNS TRIGGER AS $$
BEGIN
    -- If user is admin or partner, require 2FA
    IF NEW.role IN ('admin', 'partner') THEN
        -- Check if 2FA is enabled
        IF NOT EXISTS (
            SELECT 1 FROM user_2fa
            WHERE user_id = NEW.user_id AND enabled = true
        ) THEN
            RAISE EXCEPTION '2FA must be enabled for admin and partner accounts';
        END IF;
    END IF;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger (commented out for now, enable after all admins have 2FA)
-- CREATE TRIGGER enforce_2fa_trigger
-- BEFORE UPDATE OF role ON profiles
-- FOR EACH ROW
-- EXECUTE FUNCTION enforce_2fa_for_admins();

-- ═══════════════════════════════════════════════════════════════
-- ✅ VERIFICATION
-- ═══════════════════════════════════════════════════════════════

-- Check tables created
SELECT 
    'user_2fa' as table_name,
    COUNT(*) as row_count
FROM user_2fa
UNION ALL
SELECT 
    'user_2fa_audit' as table_name,
    COUNT(*) as row_count
FROM user_2fa_audit;

RAISE NOTICE '✅ 2FA system implemented successfully!';
RAISE NOTICE 'Next steps:';
RAISE NOTICE '1. Deploy setup-2fa Edge Function';
RAISE NOTICE '2. Deploy verify-2fa Edge Function';
RAISE NOTICE '3. Update login flow to check 2FA';
RAISE NOTICE '4. Enable 2FA for all admin accounts';
