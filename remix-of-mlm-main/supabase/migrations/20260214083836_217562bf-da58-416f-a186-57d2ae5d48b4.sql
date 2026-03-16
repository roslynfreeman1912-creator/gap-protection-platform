
-- 1. Add hierarchy to call_center_employees (parent employee for multi-level)
ALTER TABLE public.call_center_employees 
ADD COLUMN IF NOT EXISTS parent_employee_id UUID REFERENCES public.call_center_employees(id),
ADD COLUMN IF NOT EXISTS level INTEGER DEFAULT 1,
ADD COLUMN IF NOT EXISTS override_rate NUMERIC(5,2) DEFAULT 0;

-- 2. Create credit_notes table for Gutschriften
CREATE TABLE IF NOT EXISTS public.credit_notes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  partner_id UUID NOT NULL REFERENCES public.profiles(id),
  commission_ids UUID[] NOT NULL DEFAULT '{}',
  credit_note_number TEXT NOT NULL,
  net_amount NUMERIC(10,2) NOT NULL DEFAULT 0,
  vat_rate NUMERIC(5,2) NOT NULL DEFAULT 19,
  vat_amount NUMERIC(10,2) NOT NULL DEFAULT 0,
  gross_amount NUMERIC(10,2) NOT NULL DEFAULT 0,
  currency TEXT NOT NULL DEFAULT 'EUR',
  status TEXT NOT NULL DEFAULT 'draft',
  period_start DATE,
  period_end DATE,
  easybill_document_id TEXT,
  easybill_pdf_url TEXT,
  paid_at TIMESTAMPTZ,
  payment_method TEXT DEFAULT 'sepa',
  iban TEXT,
  bic TEXT,
  account_holder TEXT,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.credit_notes ENABLE ROW LEVEL SECURITY;

-- Policies for credit_notes
CREATE POLICY "Admins can manage all credit notes"
ON public.credit_notes FOR ALL
TO authenticated
USING (public.is_admin())
WITH CHECK (public.is_admin());

CREATE POLICY "Partners can view own credit notes"
ON public.credit_notes FOR SELECT
TO authenticated
USING (partner_id = public.get_profile_id(auth.uid()));

-- 3. Create cc_commissions table for call center employee commissions
CREATE TABLE IF NOT EXISTS public.cc_commissions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id UUID NOT NULL REFERENCES public.call_center_employees(id),
  call_center_id UUID NOT NULL REFERENCES public.call_centers(id),
  transaction_id UUID REFERENCES public.transactions(id),
  commission_type TEXT NOT NULL DEFAULT 'direct',
  base_amount NUMERIC(10,2) NOT NULL DEFAULT 0,
  commission_rate NUMERIC(5,2) NOT NULL DEFAULT 0,
  commission_amount NUMERIC(10,2) NOT NULL DEFAULT 0,
  override_from_employee_id UUID REFERENCES public.call_center_employees(id),
  override_level INTEGER DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'pending',
  credit_note_id UUID REFERENCES public.credit_notes(id),
  paid_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.cc_commissions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can manage all cc_commissions"
ON public.cc_commissions FOR ALL
TO authenticated
USING (public.is_admin())
WITH CHECK (public.is_admin());

CREATE POLICY "CC owners can view their commissions"
ON public.cc_commissions FOR SELECT
TO authenticated
USING (
  call_center_id IN (
    SELECT id FROM public.call_centers WHERE owner_id = public.get_profile_id(auth.uid())
  )
);

-- Sequence for credit note numbers
CREATE SEQUENCE IF NOT EXISTS public.credit_note_seq START 1001;

-- Trigger for updated_at
CREATE TRIGGER update_credit_notes_updated_at
BEFORE UPDATE ON public.credit_notes
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_cc_commissions_updated_at
BEFORE UPDATE ON public.cc_commissions
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
