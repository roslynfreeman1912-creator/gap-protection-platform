
-- Create commission matrix table for sliding window commissions
-- partner_depth: the depth level of the partner in the hierarchy
-- payout_level: which upline level receives the commission  
-- value: commission amount in EUR
CREATE TABLE public.commission_matrix (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  model_id UUID NOT NULL REFERENCES public.commission_models(id) ON DELETE CASCADE,
  partner_depth INT NOT NULL, -- L1, L2, L3, L4, L5, L6+
  payout_level INT NOT NULL,  -- Which ancestor level gets paid
  value DECIMAL(10,2) NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(model_id, partner_depth, payout_level)
);

ALTER TABLE public.commission_matrix ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can manage commission matrix"
ON public.commission_matrix
FOR ALL
TO authenticated
USING (public.is_admin());

CREATE POLICY "Partners can view commission matrix"
ON public.commission_matrix
FOR SELECT
TO authenticated
USING (true);

-- Insert the sliding commission matrix from the PDF
-- L1 partner: L1=100, L2=20, L3=15, L4=10, L5=10
-- L2 partner: L1=80, L2=20, L3=15, L4=10, L5=10
-- L3 partner: L1=65, L2=20, L3=15, L4=10, L5=10
-- L4 partner: L1=55, L2=20, L3=15, L4=10, L5=10
-- L5 partner: L1=45, L2=20, L3=15, L4=10
-- L6+ partner: L1=45, L2=20, L3=15
DO $$
DECLARE
  mlm_id UUID;
BEGIN
  SELECT id INTO mlm_id FROM public.commission_models WHERE name = 'MLM Standard' AND is_active = TRUE LIMIT 1;
  IF mlm_id IS NOT NULL THEN
    INSERT INTO public.commission_matrix (model_id, partner_depth, payout_level, value) VALUES
    -- Depth 1
    (mlm_id, 1, 1, 100), (mlm_id, 1, 2, 20), (mlm_id, 1, 3, 15), (mlm_id, 1, 4, 10), (mlm_id, 1, 5, 10),
    -- Depth 2
    (mlm_id, 2, 1, 80), (mlm_id, 2, 2, 20), (mlm_id, 2, 3, 15), (mlm_id, 2, 4, 10), (mlm_id, 2, 5, 10),
    -- Depth 3
    (mlm_id, 3, 1, 65), (mlm_id, 3, 2, 20), (mlm_id, 3, 3, 15), (mlm_id, 3, 4, 10), (mlm_id, 3, 5, 10),
    -- Depth 4
    (mlm_id, 4, 1, 55), (mlm_id, 4, 2, 20), (mlm_id, 4, 3, 15), (mlm_id, 4, 4, 10), (mlm_id, 4, 5, 10),
    -- Depth 5
    (mlm_id, 5, 1, 45), (mlm_id, 5, 2, 20), (mlm_id, 5, 3, 15), (mlm_id, 5, 4, 10),
    -- Depth 6+
    (mlm_id, 6, 1, 45), (mlm_id, 6, 2, 20), (mlm_id, 6, 3, 15);
  END IF;
END $$;

-- Fix promo_code_usages: make promo_code_id nullable for failed validation logs
ALTER TABLE public.promo_code_usages ALTER COLUMN promo_code_id DROP NOT NULL;
