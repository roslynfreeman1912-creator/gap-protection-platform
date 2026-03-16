
-- Fix: generate_promotion_code was BEFORE INSERT but inserted into promotion_codes
-- which has FK to profiles. Profile doesn't exist yet during BEFORE INSERT.
-- Split into: BEFORE INSERT (set promotion_code column) + AFTER INSERT (create promo code row)

-- Step 1: Fix the BEFORE INSERT function - only set the column value, don't insert into promotion_codes
CREATE OR REPLACE FUNCTION public.generate_promotion_code()
RETURNS TRIGGER AS $$
DECLARE
    new_code TEXT;
BEGIN
    -- Only generate for partners and admins
    IF NEW.role IN ('partner', 'admin') THEN
        new_code := 'ML-' || UPPER(SUBSTRING(MD5(RANDOM()::TEXT) FROM 1 FOR 6));
        
        WHILE EXISTS (SELECT 1 FROM public.profiles WHERE promotion_code = new_code) LOOP
            new_code := 'ML-' || UPPER(SUBSTRING(MD5(RANDOM()::TEXT) FROM 1 FOR 6));
        END LOOP;
        
        NEW.promotion_code := new_code;
    END IF;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

-- Step 2: Create AFTER INSERT function to insert into promotion_codes table
CREATE OR REPLACE FUNCTION public.create_promotion_code_record()
RETURNS TRIGGER AS $$
BEGIN
    IF NEW.role IN ('partner', 'admin') AND NEW.promotion_code IS NOT NULL THEN
        INSERT INTO public.promotion_codes (code, partner_id)
        VALUES (NEW.promotion_code, NEW.id)
        ON CONFLICT (code) DO NOTHING;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

-- Step 3: Create the AFTER INSERT trigger
DROP TRIGGER IF EXISTS create_promotion_code_after_insert ON public.profiles;
CREATE TRIGGER create_promotion_code_after_insert
    AFTER INSERT ON public.profiles
    FOR EACH ROW EXECUTE FUNCTION public.create_promotion_code_record();
