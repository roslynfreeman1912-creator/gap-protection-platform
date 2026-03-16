# 🚨 المشاكل الحرجة والحلول - GAP Protection

## جدول المحتويات
1. [مشاكل الأمان](#مشاكل-الأمان)
2. [مشاكل الأداء](#مشاكل-الأداء)
3. [مشاكل قابلية التوسع](#مشاكل-قابلية-التوسع)
4. [مشاكل قانونية](#مشاكل-قانونية)
5. [مشاكل جودة الكود](#مشاكل-جودة-الكود)

---

## 🔐 مشاكل الأمان (Security Issues)

### 1. PII Encryption Not Enabled

**الخطورة**: 🔴 حرجة
**الحالة**: ⚠️ غير مفعّل

**المشكلة**:
```sql
-- البيانات الحساسة مخزنة بدون تشفير
SELECT iban, bic, id_number, date_of_birth 
FROM profiles 
LIMIT 1;

-- النتيجة: بيانات واضحة (plaintext)
-- iban: DE89370400440532013000
-- id_number: 123456789
```

**الحل**:

```sql
-- 1. إنشاء Encryption Key
-- في Supabase Dashboard → Settings → Secrets
-- أضف: PII_ENCRYPTION_KEY=your-32-byte-key-here

-- 2. إنشاء Encryption Functions
CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE OR REPLACE FUNCTION encrypt_pii(data TEXT)
RETURNS TEXT AS $$
DECLARE
    encryption_key TEXT;
BEGIN
    -- احصل على المفتاح من environment
    encryption_key := current_setting('app.pii_encryption_key', true);
    
    IF encryption_key IS NULL THEN
        RAISE EXCEPTION 'PII encryption key not configured';
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
    encryption_key := current_setting('app.pii_encryption_key', true);
    
    IF encryption_key IS NULL THEN
        RAISE EXCEPTION 'PII encryption key not configured';
    END IF;
    
    RETURN convert_from(
        decrypt(
            decode(encrypted_data, 'base64'),
            encryption_key::bytea,
            'aes'
        ),
        'UTF8'
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 3. Migration لتشفير البيانات الموجودة
DO $$
DECLARE
    profile_record RECORD;
BEGIN
    FOR profile_record IN 
        SELECT id, iban, bic, id_number 
        FROM profiles 
        WHERE iban IS NOT NULL
    LOOP
        UPDATE profiles
        SET 
            iban = encrypt_pii(profile_record.iban),
            bic = CASE 
                WHEN profile_record.bic IS NOT NULL 
                THEN encrypt_pii(profile_record.bic) 
                ELSE NULL 
            END,
            id_number = CASE 
                WHEN profile_record.id_number IS NOT NULL 
                THEN encrypt_pii(profile_record.id_number) 
                ELSE NULL 
            END
        WHERE id = profile_record.id;
    END LOOP;
END $$;

-- 4. إنشاء Views للوصول المشفر
CREATE OR REPLACE VIEW profiles_decrypted AS
SELECT 
    id,
    user_id,
    first_name,
    last_name,
    email,
    decrypt_pii(iban) as iban,
    decrypt_pii(bic) as bic,
    decrypt_pii(id_number) as id_number,
    -- باقي الأعمدة
FROM profiles;

-- 5. RLS على View
ALTER VIEW profiles_decrypted SET (security_invoker = true);

CREATE POLICY "Users can view own decrypted profile"
ON profiles_decrypted FOR SELECT
USING (auth.uid() = user_id);
```

**التطبيق في Edge Functions**:

```typescript
// في register/index.ts
const { data: profileData, error: profileError } = await supabase
    .from('profiles')
    .insert({
        // ... باقي البيانات
        iban: data.iban, // سيتم تشفيره تلقائياً عبر Trigger
        bic: data.bic,
        id_number: data.idNumber
    })
    .select()
    .single();

// عند القراءة، استخدم View
const { data: profile } = await supabase
    .from('profiles_decrypted')
    .select('*')
    .eq('id', profileId)
    .single();

// profile.iban سيكون مفكوك التشفير
```


### 2. No 2FA Implementation

**الخطورة**: 🔴 حرجة
**الحالة**: ❌ غير موجود

**المشكلة**:
- حسابات Admin بدون 2FA
- إمكانية اختراق الحسابات بسهولة
- لا يوجد TOTP أو WebAuthn

**الحل**:

```typescript
// supabase/functions/setup-2fa/index.ts

import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { authenticator } from "npm:otplib@12.0.1"
import QRCode from "npm:qrcode@1.5.3"

serve(async (req) => {
    const corsHeaders = getCorsHeaders(req);
    
    if (req.method === 'OPTIONS') {
        return new Response(null, { headers: corsHeaders });
    }
    
    const authResult = await authenticateRequest(req, corsHeaders);
    if (authResult.response) return authResult.response;
    
    const { action } = await req.json();
    
    // ═══ Generate 2FA Secret ═══
    if (action === 'generate_secret') {
        const secret = authenticator.generateSecret();
        const userId = authResult.auth.user.id;
        
        // احفظ Secret في Database
        const { error } = await supabase
            .from('user_2fa')
            .upsert({
                user_id: userId,
                secret: secret,
                enabled: false,
                backup_codes: generateBackupCodes(10)
            });
        
        if (error) throw error;
        
        // أنشئ QR Code
        const otpauth = authenticator.keyuri(
            authResult.auth.user.email,
            'GAP Protection',
            secret
        );
        
        const qrCode = await QRCode.toDataURL(otpauth);
        
        return jsonResponse({
            secret,
            qrCode,
            backupCodes: generateBackupCodes(10)
        }, 200, corsHeaders);
    }
    
    // ═══ Verify and Enable 2FA ═══
    if (action === 'verify_and_enable') {
        const { token } = await req.json();
        const userId = authResult.auth.user.id;
        
        // احصل على Secret
        const { data: twoFAData } = await supabase
            .from('user_2fa')
            .select('secret')
            .eq('user_id', userId)
            .single();
        
        if (!twoFAData) {
            return jsonResponse({ error: '2FA not set up' }, 400, corsHeaders);
        }
        
        // تحقق من Token
        const isValid = authenticator.verify({
            token,
            secret: twoFAData.secret
        });
        
        if (!isValid) {
            return jsonResponse({ error: 'Invalid token' }, 400, corsHeaders);
        }
        
        // فعّل 2FA
        await supabase
            .from('user_2fa')
            .update({ enabled: true, enabled_at: new Date().toISOString() })
            .eq('user_id', userId);
        
        return jsonResponse({ success: true }, 200, corsHeaders);
    }
    
    // ═══ Verify 2FA Token (Login) ═══
    if (action === 'verify_login') {
        const { email, password, token } = await req.json();
        
        // تسجيل دخول عادي أولاً
        const { data: authData, error: authError } = await supabase.auth.signInWithPassword({
            email,
            password
        });
        
        if (authError) {
            return jsonResponse({ error: 'Invalid credentials' }, 401, corsHeaders);
        }
        
        // تحقق من 2FA
        const { data: twoFAData } = await supabase
            .from('user_2fa')
            .select('secret, enabled')
            .eq('user_id', authData.user.id)
            .single();
        
        if (twoFAData?.enabled) {
            const isValid = authenticator.verify({
                token,
                secret: twoFAData.secret
            });
            
            if (!isValid) {
                // سجل خروج
                await supabase.auth.signOut();
                return jsonResponse({ error: 'Invalid 2FA token' }, 401, corsHeaders);
            }
        }
        
        return jsonResponse({ 
            success: true,
            session: authData.session 
        }, 200, corsHeaders);
    }
});

function generateBackupCodes(count: number): string[] {
    const codes: string[] = [];
    for (let i = 0; i < count; i++) {
        const code = Math.random().toString(36).substring(2, 10).toUpperCase();
        codes.push(code);
    }
    return codes;
}
```

**Database Schema**:

```sql
CREATE TABLE user_2fa (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE UNIQUE,
    secret TEXT NOT NULL,
    enabled BOOLEAN DEFAULT FALSE,
    enabled_at TIMESTAMPTZ,
    backup_codes TEXT[], -- Array of backup codes
    used_backup_codes TEXT[] DEFAULT '{}',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- RLS
ALTER TABLE user_2fa ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage own 2FA"
ON user_2fa FOR ALL
USING (auth.uid() = user_id);
```

