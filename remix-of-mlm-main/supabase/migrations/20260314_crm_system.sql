BEGIN;

-- ============================================================================
-- GAP PROTECTION: CRM System
-- ============================================================================

-- 1) CRM Contacts
CREATE TABLE IF NOT EXISTS public.crm_contacts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  company_name TEXT NOT NULL DEFAULT '',
  street TEXT DEFAULT '',
  house_number TEXT DEFAULT '',
  postal_code TEXT DEFAULT '',
  city TEXT DEFAULT '',
  phone TEXT DEFAULT '',
  email TEXT DEFAULT '',
  fax TEXT DEFAULT '',
  notes TEXT DEFAULT '',
  penetration_test_date DATE,
  threat_level INT CHECK (threat_level IS NULL OR (threat_level >= 1 AND threat_level <= 5)),
  subscription_date DATE,
  status TEXT DEFAULT 'new' CHECK (status IN ('new','contacted','interested','negotiation','customer','lost')),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_crm_contacts_owner ON public.crm_contacts(owner_id);
CREATE INDEX IF NOT EXISTS idx_crm_contacts_status ON public.crm_contacts(status);
CREATE INDEX IF NOT EXISTS idx_crm_contacts_company ON public.crm_contacts(company_name);

CREATE TRIGGER update_crm_contacts_updated_at
  BEFORE UPDATE ON public.crm_contacts
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 2) CRM Notes (call notes with timestamp)
CREATE TABLE IF NOT EXISTS public.crm_notes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  contact_id UUID NOT NULL REFERENCES public.crm_contacts(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  note_text TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_crm_notes_contact ON public.crm_notes(contact_id);

-- 3) CRM Reminders (calendar / Wiedervorlagen)
CREATE TABLE IF NOT EXISTS public.crm_reminders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  contact_id UUID NOT NULL REFERENCES public.crm_contacts(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  title TEXT NOT NULL DEFAULT '',
  reminder_date TIMESTAMPTZ NOT NULL,
  is_completed BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_crm_reminders_contact ON public.crm_reminders(contact_id);
CREATE INDEX IF NOT EXISTS idx_crm_reminders_date ON public.crm_reminders(reminder_date);
CREATE INDEX IF NOT EXISTS idx_crm_reminders_user ON public.crm_reminders(user_id);

-- 4) RLS Policies
ALTER TABLE public.crm_contacts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.crm_notes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.crm_reminders ENABLE ROW LEVEL SECURITY;

-- Contacts: admin/super_admin see all, users see own
CREATE POLICY "Admins can manage all contacts" ON public.crm_contacts
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM public.user_roles ur
      JOIN public.profiles p ON p.id = ur.user_id
      WHERE p.user_id = auth.uid() AND ur.role IN ('admin','super_admin')
    )
  );

CREATE POLICY "Users can manage own contacts" ON public.crm_contacts
  FOR ALL USING (
    owner_id = (SELECT id FROM public.profiles WHERE user_id = auth.uid())
  )
  WITH CHECK (
    owner_id = (SELECT id FROM public.profiles WHERE user_id = auth.uid())
  );

-- Notes: admin see all, users see own contact notes
CREATE POLICY "Admins can manage all notes" ON public.crm_notes
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM public.user_roles ur
      JOIN public.profiles p ON p.id = ur.user_id
      WHERE p.user_id = auth.uid() AND ur.role IN ('admin','super_admin')
    )
  );

CREATE POLICY "Users can manage own notes" ON public.crm_notes
  FOR ALL USING (
    user_id = (SELECT id FROM public.profiles WHERE user_id = auth.uid())
  )
  WITH CHECK (
    user_id = (SELECT id FROM public.profiles WHERE user_id = auth.uid())
  );

-- Reminders: admin see all, users see own
CREATE POLICY "Admins can manage all reminders" ON public.crm_reminders
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM public.user_roles ur
      JOIN public.profiles p ON p.id = ur.user_id
      WHERE p.user_id = auth.uid() AND ur.role IN ('admin','super_admin')
    )
  );

CREATE POLICY "Users can manage own reminders" ON public.crm_reminders
  FOR ALL USING (
    user_id = (SELECT id FROM public.profiles WHERE user_id = auth.uid())
  )
  WITH CHECK (
    user_id = (SELECT id FROM public.profiles WHERE user_id = auth.uid())
  );

COMMIT;
