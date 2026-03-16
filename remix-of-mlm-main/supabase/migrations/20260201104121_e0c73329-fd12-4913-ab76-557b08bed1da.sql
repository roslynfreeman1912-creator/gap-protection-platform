-- Create scheduled_scans table for 24/7 monitoring
CREATE TABLE public.scheduled_scans (
    id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
    profile_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    domain_id UUID REFERENCES public.protected_domains(id) ON DELETE CASCADE,
    domain TEXT NOT NULL,
    schedule_type TEXT NOT NULL CHECK (schedule_type IN ('daily', 'weekly', 'monthly')),
    is_active BOOLEAN DEFAULT true,
    next_run_at TIMESTAMP WITH TIME ZONE NOT NULL,
    last_run_at TIMESTAMP WITH TIME ZONE,
    last_result TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Create adversary_simulations table
CREATE TABLE public.adversary_simulations (
    id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
    profile_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    domain TEXT NOT NULL,
    simulation_type TEXT NOT NULL,
    status TEXT DEFAULT 'pending',
    started_at TIMESTAMP WITH TIME ZONE,
    completed_at TIMESTAMP WITH TIME ZONE,
    results JSONB,
    overall_status TEXT,
    tests_passed INTEGER DEFAULT 0,
    tests_total INTEGER DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Create security_reports table
CREATE TABLE public.security_reports (
    id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
    profile_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    domain_id UUID REFERENCES public.protected_domains(id) ON DELETE SET NULL,
    report_type TEXT NOT NULL,
    period_start TIMESTAMP WITH TIME ZONE NOT NULL,
    period_end TIMESTAMP WITH TIME ZONE NOT NULL,
    total_scans INTEGER DEFAULT 0,
    total_findings INTEGER DEFAULT 0,
    critical_count INTEGER DEFAULT 0,
    high_count INTEGER DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.scheduled_scans ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.adversary_simulations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.security_reports ENABLE ROW LEVEL SECURITY;

-- RLS Policies for scheduled_scans
CREATE POLICY "Users can view their own scheduled scans" 
    ON public.scheduled_scans FOR SELECT 
    USING (profile_id IN (SELECT id FROM public.profiles WHERE user_id = auth.uid()));

CREATE POLICY "Admins can view all scheduled scans" 
    ON public.scheduled_scans FOR SELECT 
    USING (public.is_admin_user());

CREATE POLICY "Service role can manage scheduled scans" 
    ON public.scheduled_scans FOR ALL 
    USING (true) WITH CHECK (true);

-- RLS Policies for adversary_simulations
CREATE POLICY "Users can view their own simulations" 
    ON public.adversary_simulations FOR SELECT 
    USING (profile_id IN (SELECT id FROM public.profiles WHERE user_id = auth.uid()));

CREATE POLICY "Admins can view all simulations" 
    ON public.adversary_simulations FOR SELECT 
    USING (public.is_admin_user());

CREATE POLICY "Service role can manage simulations" 
    ON public.adversary_simulations FOR ALL 
    USING (true) WITH CHECK (true);

-- RLS Policies for security_reports
CREATE POLICY "Users can view their own reports" 
    ON public.security_reports FOR SELECT 
    USING (profile_id IN (SELECT id FROM public.profiles WHERE user_id = auth.uid()));

CREATE POLICY "Admins can view all reports" 
    ON public.security_reports FOR SELECT 
    USING (public.is_admin_user());

CREATE POLICY "Service role can manage reports" 
    ON public.security_reports FOR ALL 
    USING (true) WITH CHECK (true);