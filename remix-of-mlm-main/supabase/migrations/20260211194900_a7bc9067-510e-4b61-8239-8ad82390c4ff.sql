
-- Step 1: Just add the columns (enum values were already added in previous migration)
-- Add call_center_id to promotion_codes
ALTER TABLE public.promotion_codes ADD COLUMN IF NOT EXISTS call_center_id UUID REFERENCES public.call_centers(id);

-- Add call_center_id to transactions
ALTER TABLE public.transactions ADD COLUMN IF NOT EXISTS call_center_id UUID REFERENCES public.call_centers(id);
