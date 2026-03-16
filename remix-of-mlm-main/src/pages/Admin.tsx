import { useEffect, useState, lazy, Suspense } from 'react';
import { useNavigate } from 'react-router-dom';
import { useLanguage } from '@/contexts/LanguageContext';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';

// Lazy-loaded admin sub-components for code splitting (~499KB → shell + on-demand chunks)
const AdminPartnersManager = lazy(() => import('@/components/admin/AdminPartnersManager').then(m => ({ default: m.AdminPartnersManager })));
const AdminCommissionsManager = lazy(() => import('@/components/admin/AdminCommissionsManager').then(m => ({ default: m.AdminCommissionsManager })));
const AdminLeadershipPoolManager = lazy(() => import('@/components/admin/AdminLeadershipPoolManager').then(m => ({ default: m.AdminLeadershipPoolManager })));
const PromotionCodeManager = lazy(() => import('@/components/admin/PromotionCodeManager').then(m => ({ default: m.PromotionCodeManager })));
const AdminSecurityManager = lazy(() => import('@/components/admin/AdminSecurityManager').then(m => ({ default: m.AdminSecurityManager })));
const SecurityThreatDashboard = lazy(() => import('@/components/admin/SecurityThreatDashboard').then(m => ({ default: m.SecurityThreatDashboard })));
const CallCenterManager = lazy(() => import('@/components/admin/CallCenterManager').then(m => ({ default: m.CallCenterManager })));
const BillingConfigManager = lazy(() => import('@/components/admin/BillingConfigManager').then(m => ({ default: m.BillingConfigManager })));
const AdminPromoCodeManager = lazy(() => import('@/components/admin/AdminPromoCodeManager').then(m => ({ default: m.AdminPromoCodeManager })));
const CreditNotesManager = lazy(() => import('@/components/admin/CreditNotesManager').then(m => ({ default: m.CreditNotesManager })));
const AdminPartnerDashboard = lazy(() => import('@/components/admin/AdminPartnerDashboard').then(m => ({ default: m.AdminPartnerDashboard })));
const AdminMLMManager = lazy(() => import('@/components/admin/AdminMLMManager').then(m => ({ default: m.AdminMLMManager })));
const AdminOverview = lazy(() => import('@/components/admin/AdminOverview').then(m => ({ default: m.AdminOverview })));
const AdminUsersManager = lazy(() => import('@/components/admin/AdminUsersManager').then(m => ({ default: m.AdminUsersManager })));
const AdminAuditLog = lazy(() => import('@/components/admin/AdminAuditLog').then(m => ({ default: m.AdminAuditLog })));
const AdminSettingsManager = lazy(() => import('@/components/admin/AdminSettingsManager').then(m => ({ default: m.AdminSettingsManager })));
const IncidentResponseManager = lazy(() => import('@/components/admin/IncidentResponseManager').then(m => ({ default: m.IncidentResponseManager })));
const SIEMDashboard = lazy(() => import('@/components/admin/SIEMDashboard').then(m => ({ default: m.SIEMDashboard })));
const FraudRiskDashboard = lazy(() => import('@/components/admin/FraudRiskDashboard').then(m => ({ default: m.FraudRiskDashboard })));
const KYCManager = lazy(() => import('@/components/admin/KYCManager').then(m => ({ default: m.KYCManager })));
const SessionDeviceManager = lazy(() => import('@/components/admin/SessionDeviceManager').then(m => ({ default: m.SessionDeviceManager })));
const ComplianceDashboard = lazy(() => import('@/components/admin/ComplianceDashboard').then(m => ({ default: m.ComplianceDashboard })));
const AdminPortalsManager = lazy(() => import('@/components/admin/AdminPortalsManager').then(m => ({ default: m.AdminPortalsManager })));
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { cn } from '@/lib/utils';
import {
  Users, Euro, Shield, Award, Ticket, Loader2, ShieldCheck, Building2,
  Settings, Key, BarChart3, Network, FileText, LayoutDashboard, UserCog, ScrollText,
  Menu, X, ChevronRight, LogOut, Bell, AlertTriangle, Target, UserCheck, Fingerprint, FileCheck, BookOpenCheck
} from 'lucide-react';
import logoIcon from '@/assets/gap-icon.png';

const navItems = [
  { id: 'overview', label: 'Übersicht', icon: LayoutDashboard, group: 'Hauptmenü' },
  { id: 'users', label: 'Benutzer', icon: UserCog, group: 'Hauptmenü' },
  { id: 'promo', label: 'Promo-Codes', icon: Key, group: 'Vertrieb' },
  { id: 'partner-dash', label: 'Partner', icon: BarChart3, group: 'Vertrieb' },
  { id: 'mlm', label: 'MLM-System', icon: Network, group: 'Vertrieb' },
  { id: 'crm-link', label: 'CRM', icon: BookOpenCheck, group: 'Vertrieb', href: '/crm' },
  { id: 'commissions', label: 'Provisionen', icon: Euro, group: 'Finanzen' },
  { id: 'leadership', label: 'Leadership Pool', icon: Award, group: 'Finanzen' },
  { id: 'codes', label: 'Partner-Codes', icon: Ticket, group: 'Finanzen' },
  { id: 'billing', label: 'Abrechnung', icon: Settings, group: 'Finanzen' },
  { id: 'credit-notes', label: 'Gutschriften', icon: FileText, group: 'Finanzen' },
  { id: 'callcenters', label: 'Call Center', icon: Building2, group: 'Betrieb' },
  { id: 'portals', label: 'Portals', icon: Building2, group: 'Betrieb' },
  { id: 'security', label: 'SOC', icon: ShieldCheck, group: 'Sicherheit' },
  { id: 'siem', label: 'SIEM', icon: Network, group: 'Sicherheit' },
  { id: 'incidents', label: 'Vorfälle', icon: AlertTriangle, group: 'Sicherheit' },
  { id: 'fraud', label: 'Betrugsanalyse', icon: Target, group: 'Sicherheit' },
  { id: 'sessions', label: 'Sitzungen', icon: Fingerprint, group: 'Sicherheit' },
  { id: 'kyc', label: 'KYC/AML', icon: UserCheck, group: 'Sicherheit' },
  { id: 'compliance', label: 'Compliance', icon: FileCheck, group: 'Sicherheit' },
  { id: 'audit', label: 'Audit-Log', icon: ScrollText, group: 'System' },
  { id: 'settings', label: 'Einstellungen', icon: Settings, group: 'System' },
];

export default function AdminPage() {
  const { t } = useLanguage();
  const { user, loading, signOut } = useAuth();
  const navigate = useNavigate();

  const [isAdmin, setIsAdmin] = useState(false);
  const [isSuperAdmin, setIsSuperAdmin] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('overview');
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);

  useEffect(() => {
    const checkAdminAndRedirect = async () => {
      if (!loading && !user) { navigate('/auth'); return; }
      if (!loading && user) {
        const { data: profile } = await supabase.from('profiles').select('id').eq('user_id', user.id).maybeSingle();
        if (!profile) { navigate('/dashboard'); return; }

        const { data: adminCheck } = await supabase.rpc('has_role', { _user_id: profile.id, _role: 'admin' });
        const { data: superCheck } = await supabase.rpc('has_role', { _user_id: profile.id, _role: 'super_admin' });

        setIsAdmin(!!adminCheck || !!superCheck);
        setIsSuperAdmin(!!superCheck);

        if (!adminCheck && !superCheck) navigate('/dashboard');
        setIsLoading(false);
      }
    };
    checkAdminAndRedirect();
  }, [user, loading, navigate]);

  if (loading || isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-cyber">
        <div className="text-center">
          <div className="relative">
            <div className="absolute inset-0 rounded-full blur-xl bg-accent/20 animate-pulse" />
            <img src={logoIcon} alt="GAP" className="h-16 w-16 mx-auto relative z-10 mb-4" />
          </div>
          <Loader2 className="h-6 w-6 animate-spin mx-auto text-accent mb-3" />
          <p className="text-primary-foreground/70 text-sm">Lade Admin-Panel...</p>
        </div>
      </div>
    );
  }

  if (!isAdmin) return null;

  const groups = [...new Set(navItems.map(i => i.group))];

  const renderContent = () => {
    switch (activeTab) {
      case 'overview': return <AdminOverview />;
      case 'users': return <AdminUsersManager isSuperAdmin={isSuperAdmin} />;
      case 'promo': return <AdminPromoCodeManager />;
      case 'partner-dash': return <AdminPartnerDashboard />;
      case 'mlm': return <AdminMLMManager />;
      case 'commissions': return <AdminCommissionsManager />;
      case 'leadership': return <AdminLeadershipPoolManager />;
      case 'codes': return <PromotionCodeManager />;
      case 'callcenters': return <CallCenterManager />;
      case 'portals': return <AdminPortalsManager />;
      case 'billing': return <BillingConfigManager />;
      case 'credit-notes': return <CreditNotesManager />;
      case 'security': return <SecurityThreatDashboard />;
      case 'siem': return <SIEMDashboard />;
      case 'incidents': return <IncidentResponseManager />;
      case 'fraud': return <FraudRiskDashboard />;
      case 'sessions': return <SessionDeviceManager />;
      case 'kyc': return <KYCManager />;
      case 'compliance': return <ComplianceDashboard />;
      case 'audit': return <AdminAuditLog />;
      case 'settings': return <AdminSettingsManager />;
      default: return <AdminOverview />;
    }
  };

  const currentItem = navItems.find(i => i.id === activeTab);

  return (
    <div className="min-h-screen flex bg-background">
      {/* Sidebar */}
      <aside
        className={cn(
          "fixed inset-y-0 left-0 z-50 flex flex-col border-r transition-all duration-300 ease-in-out",
          "bg-sidebar text-sidebar-foreground border-sidebar-border",
          sidebarCollapsed ? "w-[68px]" : "w-[260px]",
          "lg:relative",
          !sidebarOpen && "lg:flex -translate-x-full lg:translate-x-0"
        )}
      >
        {/* Logo Area */}
        <div className="flex items-center gap-3 px-4 h-16 shrink-0 border-b border-sidebar-border">
          <img 
            src={logoIcon} 
            alt="GAP" 
            className="h-9 w-9 shrink-0 rounded-lg p-0.5 bg-mlm-logo-gradient brightness-[1.3] contrast-[1.1]" 
          />
          {!sidebarCollapsed && (
            <div className="overflow-hidden">
              <h1 className="text-sm font-bold truncate text-sidebar-primary">GAP Protection</h1>
              <p className="text-[10px] text-white/50">Admin Console</p>
            </div>
          )}
        </div>

        {/* Nav */}
        <ScrollArea className="flex-1 py-3">
          <nav className="space-y-1 px-2">
            {groups.map(group => (
              <div key={group} className="mb-3">
                {!sidebarCollapsed && (
                  <p className="px-3 mb-1.5 text-[10px] font-semibold uppercase tracking-widest text-white/40">
                    {group}
                  </p>
                )}
                {navItems.filter(i => i.group === group).map(item => {
                  const isActive = activeTab === item.id;
                  return (
                    <button
                      key={item.id}
                      onClick={() => {
                        if ((item as any).href) { navigate((item as any).href); }
                        else { setActiveTab(item.id); setSidebarOpen(false); }
                      }}
                      className={cn(
                        "w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-all duration-200 group",
                        isActive
                          ? "bg-cyan-500/20 text-cyan-400 font-medium"
                          : "text-white/80 hover:bg-white/10 hover:text-white"
                      )}
                      title={sidebarCollapsed ? item.label : undefined}
                    >
                      <item.icon className={cn(
                        "h-4 w-4 shrink-0 transition-colors",
                        isActive ? "text-cyan-400" : "text-white/50 group-hover:text-white/80"
                      )} />
                      {!sidebarCollapsed && <span className="truncate">{item.label}</span>}
                      {!sidebarCollapsed && isActive && (
                        <ChevronRight className="h-3 w-3 ml-auto text-cyan-400/60" />
                      )}
                    </button>
                  );
                })}
              </div>
            ))}
          </nav>
        </ScrollArea>

        {/* User footer */}
        <div className="p-3 shrink-0 border-t border-sidebar-border">
          <div className="flex items-center gap-3">
            <div className="h-8 w-8 rounded-full bg-cyan-500/20 flex items-center justify-center shrink-0">
              <Shield className="h-4 w-4 text-cyan-400" />
            </div>
            {!sidebarCollapsed && (
              <div className="flex-1 min-w-0">
                <p className="text-xs font-medium text-white truncate">
                  {isSuperAdmin ? 'Super Admin' : 'Admin'}
                </p>
                <p className="text-[10px] text-white/50 truncate">{user?.email}</p>
              </div>
            )}
            {!sidebarCollapsed && (
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7 text-white/50 hover:text-white shrink-0"
                onClick={() => { signOut(); navigate('/'); }}
              >
                <LogOut className="h-3.5 w-3.5" />
              </Button>
            )}
          </div>
        </div>
      </aside>

      {/* Mobile overlay */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 bg-black/60 z-40 lg:hidden backdrop-blur-sm"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Main Content */}
      <main className="flex-1 flex flex-col min-w-0">
        {/* Top Bar */}
        <header className="sticky top-0 z-30 h-14 border-b border-border bg-background/80 backdrop-blur-md flex items-center gap-3 px-4 shrink-0">
          <Button
            variant="ghost"
            size="icon"
            className="lg:hidden h-8 w-8"
            onClick={() => setSidebarOpen(!sidebarOpen)}
          >
            <Menu className="h-4 w-4" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="hidden lg:flex h-8 w-8"
            onClick={() => setSidebarCollapsed(!sidebarCollapsed)}
          >
            <Menu className="h-4 w-4" />
          </Button>

          <div className="flex items-center gap-2">
            {currentItem && <currentItem.icon className="h-4 w-4 text-muted-foreground" />}
            <h2 className="text-sm font-semibold">{currentItem?.label || 'Übersicht'}</h2>
          </div>

          <div className="ml-auto flex items-center gap-2">
            <Badge
              variant={isSuperAdmin ? 'destructive' : 'default'}
              className="text-[10px] px-2 py-0.5 hidden sm:flex"
            >
              <Shield className="h-3 w-3 mr-1" />
              {isSuperAdmin ? 'Super Admin' : 'Admin'}
            </Badge>
          </div>
        </header>

        {/* Page Content */}
        <div className="flex-1 overflow-auto">
          <div className="p-4 md:p-6 lg:p-8 max-w-[1600px] mx-auto">
            <Suspense fallback={<div className="flex items-center justify-center py-20"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>}>
              {renderContent()}
            </Suspense>
          </div>
        </div>
      </main>
    </div>
  );
}
