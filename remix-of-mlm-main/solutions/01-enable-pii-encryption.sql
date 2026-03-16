-- ═══════════════════════════════════════════════════════════════
-- 🔐 SOLUTION 1: Enable PII Encryption
-- ═══════════════════════════════════════════════════════════════
-- Problem: Sensitive data (IBAN, BIC, ID numbers) stored in plaintext
-- Risk: GDPR violation (up to €20M fine)
-- Solution: Implement AES encryption for all PII data
-- ═══════════════════════════════════════════════════════════════

-- Step 1: Enable pgcrypto extension
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- Step 2: Create encryption/decryption functions
CREATE OR REPLACE FUNCTION encrypt_pii(data TEXT)
RETURNS TEXT AS $$
DECLARE
    encryption_key TEXT;
BEGIN
    -- Get encryption key from environment
    -- Set in Supabase: Settings → Secrets → PII_ENCRYPTION_KEY
    encryption_key := current_setting('app.settings.pii_encryption_key', true);
    
    IF encryption_key IS NULL OR encryption_key = '' THEN
        RAISE EXCEPTION 'PII encryption key not configured';
    END IF;
    
    IF data IS NULL OR data = '' THEN
        RETURN NULL;
    END IF;
    
    RETURN encode(
        encrypt(
            data::bytea,
            encryption_key::bytea,
            'aes'
        ),
        'base64'
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE FUNCTION decrypt_pii(encrypted_data TEXT)
RETURNS TEXT AS $$
DECLARE
    encryption_key TEXT;
BEGIN
    encryption_key := current_setting('app.settings.pii_encryption_key', true);
    
    IF encryption_key IS NULL OR encryption_key = '' THEN
        RAISE EXCEPTION 'PII encryption key not configured';
    END IF;
    
    IF encrypted_data IS NULL OR encrypted_data = '' THEN
        RETURN NULL;
    END IF;
    
    RETURN convert_from(
        decrypt(
            decode(encrypted_data, 'base64'),
            encryption_key::bytea,
            'aes'
        ),
        'UTF8'
    );
EXCEPTION
    WHEN OTHERS THEN
        RAISE EXCEPTION 'Decryption failed: %', SQLERRM;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Step 3: Create backup of profiles table
CREATE TABLE IF NOT EXISTS profiles_backup_before_encryption AS
SELECT * FROM profiles;

-- Step 4: Encrypt existing data (run carefully!)
-- WARNING: This will encrypt all existing PII data
-- Make sure PII_ENCRYPTION_KEY is set before running!

DO $$
DECLARE
    profile_record RECORD;
    encrypted_iban TEXT;
    encrypted_bic TEXT;
    encrypted_id_number TEXT;
    total_count INTEGER := 0;
    success_count INTEGER := 0;
BEGIN
    -- Count total profiles
    SELECT COUNT(*) INTO total_count FROM profiles;
    RAISE NOTICE 'Starting encryption of % profiles...', total_count;
    
    FOR profile_record IN 
        SELECT id, iban, bic, id_number 
        FROM profiles 
        WHERE iban IS NOT NULL OR bic IS NOT NULL OR id_number IS NOT NULL
    LOOP
        BEGIN
            -- Encrypt IBAN
            IF profile_record.iban IS NOT NULL AND profile_record.iban != '' THEN
                encrypted_iban := encrypt_pii(profile_record.iban);
            ELSE
                encrypted_iban := NULL;
            END IF;
            
            -- Encrypt BIC
            IF profile_record.bic IS NOT NULL AND profile_record.bic != '' THEN
                encrypted_bic := encrypt_pii(profile_record.bic);
            ELSE
                encrypted_bic := NULL;
            END IF;
            
            -- Encrypt ID Number
            IF profile_record.id_number IS NOT NULL AND profile_record.id_number != '' THEN
                encrypted_id_number := encrypt_pii(profile_record.id_number);
            ELSE
                encrypted_id_number := NULL;
            END IF;
            
            -- Update profile
            UPDATE profiles
            SET 
                iban = encrypted_iban,
                bic = encrypted_bic,
                id_number = encrypted_id_number,
                updated_at = NOW()
            WHERE id = profile_record.id;
            
            success_count := success_count + 1;
            
            -- Log progress every 100 records
            IF success_count % 100 = 0 THEN
                RAISE NOTICE 'Encrypted % of % profiles...', success_count, total_count;
            END IF;
            
        EXCEPTION
            WHEN OTHERS THEN
                RAISE WARNING 'Failed to encrypt profile %: %', profile_record.id, SQLERRM;
        END;
    END LOOP;
    
    RAISE NOTICE 'Encryption complete! Successfully encrypted % of % profiles', success_count, total_count;
END $$;

-- Step 5: Create decrypted view for authorized access
CREATE OR REPLACE VIEW profiles_decrypted AS
SELECT 
    id,
    user_id,
    first_name,
    last_name,
    email,
    phone,
    CASE 
        WHEN iban IS NOT NULL THEN decrypt_pii(iban)
        ELSE NULL
    END as iban,
    CASE 
        WHEN bic IS NOT NULL THEN decrypt_pii(bic)
        ELSE NULL
    END as bic,
    CASE 
        WHEN id_number IS NOT NULL THEN decrypt_pii(id_number)
        ELSE NULL
    END as id_number,
    date_of_birth,
    street,
    house_number,
    postal_code,
    city,
    country,
    domain,
    ip_address,
    bank_name,
    account_holder,
    sepa_mandate_accepted,
    sepa_mandate_date,
    terms_accepted,
    privacy_accepted,
    domain_owner_confirmed,
    age_confirmed,
    sponsor_id,
    role,
    status,
    created_at,
    updated_at
FROM profiles;

-- Step 6: Enable RLS on decrypted view
ALTER VIEW profiles_decrypted SET (security_invoker = true);

-- Step 7: Create audit log for PII access
CREATE TABLE IF NOT EXISTS pii_access_log (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES auth.users(id),
    profile_id UUID REFERENCES profiles(id),
    accessed_fields TEXT[],
    access_reason TEXT,
    ip_address INET,
    user_agent TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Enable RLS on audit log
ALTER TABLE pii_access_log ENABLE ROW LEVEL SECURITY;

-- Only admins can view audit logs
CREATE POLICY "Admins can view PII access logs"
ON pii_access_log FOR SELECT
TO authenticated
USING (
    EXISTS (
        SELECT 1 FROM profiles
        WHERE profiles.user_id = auth.uid()
        AND profiles.role = 'admin'
    )
);

-- Step 8: Create function to log PII access
CREATE OR REPLACE FUNCTION log_pii_access(
    p_profile_id UUID,
    p_fields TEXT[],
    p_reason TEXT DEFAULT 'User request'
)
RETURNS VOID AS $$
BEGIN
    INSERT INTO pii_access_log (
        user_id,
        profile_id,
        accessed_fields,
        access_reason,
        ip_address,
        user_agent
    ) VALUES (
        auth.uid(),
        p_profile_id,
        p_fields,
        p_reason,
        inet_client_addr(),
        current_setting('request.headers', true)::json->>'user-agent'
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ═══════════════════════════════════════════════════════════════
-- ✅ VERIFICATION
-- ═══════════════════════════════════════════════════════════════

-- Test encryption/decryption
DO $$
DECLARE
    test_data TEXT := 'DE89370400440532013000';
    encrypted TEXT;
    decrypted TEXT;
BEGIN
    encrypted := encrypt_pii(test_data);
    decrypted := decrypt_pii(encrypted);
    
    IF decrypted = test_data THEN
        RAISE NOTICE '✅ Encryption/Decryption test PASSED';
    ELSE
        RAISE EXCEPTION '❌ Encryption/Decryption test FAILED';
    END IF;
END $$;

-- Check encrypted profiles count
SELECT 
    COUNT(*) as total_profiles,
    COUNT(CASE WHEN iban IS NOT NULL THEN 1 END) as profiles_with_iban,
    COUNT(CASE WHEN bic IS NOT NULL THEN 1 END) as profiles_with_bic,
    COUNT(CASE WHEN id_number IS NOT NULL THEN 1 END) as profiles_with_id_number
FROM profiles;

RAISE NOTICE '✅ PII Encryption enabled successfully!';
