-- Add RLS policy for admin to view all profiles
CREATE POLICY "Admins can view all profiles" 
ON public.profiles 
FOR SELECT 
USING (
  EXISTS (
    SELECT 1 FROM public.profiles p 
    WHERE p.user_id = auth.uid() 
    AND p.role = 'admin'
  )
);

-- Add RLS policy for admin to update all profiles
CREATE POLICY "Admins can update all profiles" 
ON public.profiles 
FOR UPDATE 
USING (
  EXISTS (
    SELECT 1 FROM public.profiles p 
    WHERE p.user_id = auth.uid() 
    AND p.role = 'admin'
  )
);

-- Allow anonymous users to query security tests by network hash
CREATE POLICY "Anyone can query security tests by network hash" 
ON public.security_tests 
FOR SELECT 
USING (true);

-- Allow anyone to update security test count
CREATE POLICY "Anyone can update security test count" 
ON public.security_tests 
FOR UPDATE 
USING (true);

-- Insert initial commission model and rules
INSERT INTO public.commission_models (name, description, max_levels, uses_dynamic_shift, is_active)
VALUES 
  ('MLM Standard', 'Standard MLM-Provisionsmodell mit dynamischer Stufenverschiebung', 5, true, true),
  ('Call Center', 'Callcenter-Provisionsmodell ohne Stufenverschiebung', 5, false, true)
ON CONFLICT DO NOTHING;

-- Insert commission rules for MLM Standard model
DO $$
DECLARE
  mlm_model_id UUID;
  cc_model_id UUID;
BEGIN
  SELECT id INTO mlm_model_id FROM public.commission_models WHERE name = 'MLM Standard' LIMIT 1;
  SELECT id INTO cc_model_id FROM public.commission_models WHERE name = 'Call Center' LIMIT 1;
  
  -- MLM Standard rules
  IF mlm_model_id IS NOT NULL THEN
    INSERT INTO public.commission_rules (model_id, level_number, commission_type, value, description)
    VALUES 
      (mlm_model_id, 1, 'fixed', 20, 'Stufe 1: 20€ pro Vertrag'),
      (mlm_model_id, 2, 'fixed', 20, 'Stufe 2: 20€ pro Vertrag'),
      (mlm_model_id, 3, 'percentage', 10, 'Stufe 3: 10% vom Vertragswert'),
      (mlm_model_id, 4, 'percentage', 5, 'Stufe 4: 5% vom Vertragswert'),
      (mlm_model_id, 5, 'fixed', 5, 'Stufe 5: 5€ pro Vertrag')
    ON CONFLICT DO NOTHING;
  END IF;
  
  -- Call Center rules  
  IF cc_model_id IS NOT NULL THEN
    INSERT INTO public.commission_rules (model_id, level_number, commission_type, value, description)
    VALUES 
      (cc_model_id, 1, 'fixed', 50, 'Abschlussprämie: 50€'),
      (cc_model_id, 2, 'fixed', 15, 'Teamleiter: 15€'),
      (cc_model_id, 3, 'fixed', 10, 'Bereichsleiter: 10€'),
      (cc_model_id, 4, 'fixed', 5, 'Regionalleiter: 5€'),
      (cc_model_id, 5, 'fixed', 5, 'Direktor: 5€')
    ON CONFLICT DO NOTHING;
  END IF;
END $$;