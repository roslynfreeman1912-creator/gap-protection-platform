-- =============================================
-- 1. CALL CENTER & EMPLOYEE MANAGEMENT
-- =============================================

-- Call Centers table
CREATE TABLE public.call_centers (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  owner_id UUID REFERENCES public.profiles(id),
  description TEXT,
  address TEXT,
  phone TEXT,
  email TEXT,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Call Center Employees
CREATE TABLE public.call_center_employees (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  call_center_id UUID NOT NULL REFERENCES public.call_centers(id) ON DELETE CASCADE,
  profile_id UUID NOT NULL REFERENCES public.profiles(id),
  role TEXT DEFAULT 'agent' CHECK (role IN ('agent', 'team_leader', 'area_manager', 'regional_director', 'director')),
  commission_rate DECIMAL(5,2) DEFAULT 0,
  is_active BOOLEAN DEFAULT true,
  hired_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  UNIQUE(call_center_id, profile_id)
);

-- =============================================
-- 2. LEADS DATABASE (Potenzielle Kunden)
-- =============================================

CREATE TABLE public.leads (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  call_center_id UUID REFERENCES public.call_centers(id),
  assigned_employee_id UUID REFERENCES public.call_center_employees(id),
  company_name TEXT,
  contact_person TEXT,
  email TEXT,
  phone TEXT,
  address TEXT,
  city TEXT,
  postal_code TEXT,
  country TEXT DEFAULT 'DE',
  domain TEXT,
  status TEXT DEFAULT 'new' CHECK (status IN ('new', 'contacted', 'interested', 'negotiation', 'won', 'lost', 'callback')),
  notes TEXT,
  last_contact_at TIMESTAMP WITH TIME ZONE,
  callback_at TIMESTAMP WITH TIME ZONE,
  source TEXT,
  priority INTEGER DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- =============================================
-- 3. BILLING CONFIGURATION (Flexible Abrechnungszeiträume)
-- =============================================

CREATE TABLE public.billing_config (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL DEFAULT 'Standard',
  period_start_day INTEGER DEFAULT 28 CHECK (period_start_day BETWEEN 1 AND 28),
  period_end_day INTEGER DEFAULT 27 CHECK (period_end_day BETWEEN 1 AND 28),
  settlement_day INTEGER DEFAULT 5 CHECK (settlement_day BETWEEN 1 AND 28),
  payout_day INTEGER DEFAULT 10 CHECK (payout_day BETWEEN 1 AND 28),
  vat_rate DECIMAL(5,2) DEFAULT 19.00,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Insert default billing config
INSERT INTO public.billing_config (name, period_start_day, period_end_day, settlement_day, payout_day, vat_rate)
VALUES ('Standard', 28, 27, 5, 10, 19.00);

-- =============================================
-- 4. REVENUE TRACKING (Für Buchhaltungs-Dashboard)
-- =============================================

CREATE TABLE public.daily_revenue (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  date DATE NOT NULL DEFAULT CURRENT_DATE,
  profile_id UUID REFERENCES public.profiles(id),
  call_center_id UUID REFERENCES public.call_centers(id),
  employee_id UUID REFERENCES public.call_center_employees(id),
  transaction_count INTEGER DEFAULT 0,
  gross_amount DECIMAL(12,2) DEFAULT 0,
  net_amount DECIMAL(12,2) DEFAULT 0,
  vat_amount DECIMAL(12,2) DEFAULT 0,
  commission_amount DECIMAL(12,2) DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  UNIQUE(date, profile_id)
);

-- =============================================
-- 5. SUPPORT TICKETS (für AI Chat Eskalation)
-- =============================================

CREATE TABLE public.support_tickets (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  profile_id UUID REFERENCES public.profiles(id),
  subject TEXT NOT NULL,
  message TEXT NOT NULL,
  channel TEXT DEFAULT 'chat' CHECK (channel IN ('chat', 'email', 'phone', 'ai')),
  status TEXT DEFAULT 'open' CHECK (status IN ('open', 'in_progress', 'resolved', 'escalated')),
  priority TEXT DEFAULT 'normal' CHECK (priority IN ('low', 'normal', 'high', 'urgent')),
  ai_response TEXT,
  escalated_at TIMESTAMP WITH TIME ZONE,
  resolved_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- =============================================
-- 6. AI CHAT MESSAGES
-- =============================================

CREATE TABLE public.chat_messages (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  profile_id UUID REFERENCES public.profiles(id),
  ticket_id UUID REFERENCES public.support_tickets(id),
  role TEXT NOT NULL CHECK (role IN ('user', 'assistant', 'system')),
  content TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- =============================================
-- RLS POLICIES
-- =============================================

ALTER TABLE public.call_centers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.call_center_employees ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.leads ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.billing_config ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.daily_revenue ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.support_tickets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.chat_messages ENABLE ROW LEVEL SECURITY;

-- Call Centers: Owner + Admin can manage
CREATE POLICY "Call center owners can manage" ON public.call_centers
  FOR ALL USING (
    owner_id IN (SELECT id FROM public.profiles WHERE user_id = auth.uid())
    OR public.is_admin()
  );

CREATE POLICY "Everyone can view call centers" ON public.call_centers
  FOR SELECT USING (true);

-- Employees: Call center owner + Admin can manage
CREATE POLICY "Call center owner can manage employees" ON public.call_center_employees
  FOR ALL USING (
    call_center_id IN (
      SELECT id FROM public.call_centers WHERE owner_id IN (
        SELECT id FROM public.profiles WHERE user_id = auth.uid()
      )
    )
    OR public.is_admin()
  );

CREATE POLICY "Employees can view own record" ON public.call_center_employees
  FOR SELECT USING (
    profile_id IN (SELECT id FROM public.profiles WHERE user_id = auth.uid())
  );

-- Leads: Assigned employee + Call center owner + Admin
CREATE POLICY "Leads access control" ON public.leads
  FOR ALL USING (
    assigned_employee_id IN (
      SELECT id FROM public.call_center_employees WHERE profile_id IN (
        SELECT id FROM public.profiles WHERE user_id = auth.uid()
      )
    )
    OR call_center_id IN (
      SELECT id FROM public.call_centers WHERE owner_id IN (
        SELECT id FROM public.profiles WHERE user_id = auth.uid()
      )
    )
    OR public.is_admin()
  );

-- Billing config: Admin only for write, everyone can read
CREATE POLICY "Admin can manage billing config" ON public.billing_config
  FOR ALL USING (public.is_admin());

CREATE POLICY "Everyone can view billing config" ON public.billing_config
  FOR SELECT USING (true);

-- Daily revenue: Own records + Admin
CREATE POLICY "Own revenue records" ON public.daily_revenue
  FOR SELECT USING (
    profile_id IN (SELECT id FROM public.profiles WHERE user_id = auth.uid())
    OR public.is_admin()
  );

CREATE POLICY "Admin can manage revenue" ON public.daily_revenue
  FOR ALL USING (public.is_admin());

-- Support tickets: Own tickets + Admin
CREATE POLICY "Own tickets access" ON public.support_tickets
  FOR ALL USING (
    profile_id IN (SELECT id FROM public.profiles WHERE user_id = auth.uid())
    OR public.is_admin()
  );

-- Chat messages: Own messages + Admin
CREATE POLICY "Own chat messages" ON public.chat_messages
  FOR ALL USING (
    profile_id IN (SELECT id FROM public.profiles WHERE user_id = auth.uid())
    OR public.is_admin()
  );

-- =============================================
-- INDEXES
-- =============================================

CREATE INDEX idx_leads_status ON public.leads(status);
CREATE INDEX idx_leads_call_center ON public.leads(call_center_id);
CREATE INDEX idx_leads_employee ON public.leads(assigned_employee_id);
CREATE INDEX idx_daily_revenue_date ON public.daily_revenue(date);
CREATE INDEX idx_daily_revenue_profile ON public.daily_revenue(profile_id);
CREATE INDEX idx_support_tickets_status ON public.support_tickets(status);
CREATE INDEX idx_chat_messages_ticket ON public.chat_messages(ticket_id);

-- =============================================
-- TRIGGERS
-- =============================================

CREATE TRIGGER update_call_centers_updated_at
  BEFORE UPDATE ON public.call_centers
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_call_center_employees_updated_at
  BEFORE UPDATE ON public.call_center_employees
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_leads_updated_at
  BEFORE UPDATE ON public.leads
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_billing_config_updated_at
  BEFORE UPDATE ON public.billing_config
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_support_tickets_updated_at
  BEFORE UPDATE ON public.support_tickets
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();