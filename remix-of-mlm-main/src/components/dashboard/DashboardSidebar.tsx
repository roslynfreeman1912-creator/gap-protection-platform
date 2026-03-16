import { useNavigate, useLocation } from 'react-router-dom';
import { useLanguage } from '@/contexts/LanguageContext';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import {
  LayoutDashboard,
  Users,
  Euro,
  FileText,
  Settings,
  Shield,
  TrendingUp,
  Target,
  Gift,
  Award,
  LogOut,
  ChevronRight,
  Network,
  BookOpenCheck,
  } from 'lucide-react';
import logoIconBlack from '@/assets/gap-icon-navy.png';

interface NavItem {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  href?: string;
  tab?: string;
  badge?: string;
  adminOnly?: boolean;
}

interface DashboardSidebarProps {
  activeTab?: string;
  onTabChange?: (tab: string) => void;
}

export function DashboardSidebar({ activeTab, onTabChange }: DashboardSidebarProps) {
  const { t } = useLanguage();
  const { profile, signOut } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  const isAdmin = profile?.role === 'admin';
  const isPartner = profile?.role === 'partner' || isAdmin;

  const mainNavItems: NavItem[] = [
    { icon: LayoutDashboard, label: 'Übersicht', tab: 'overview' },
    { icon: Users, label: 'Meine Struktur', tab: 'hierarchy' },
    { icon: Euro, label: 'Provisionen', tab: 'commissions' },
    { icon: Award, label: 'Leadership Pool', tab: 'leadership' },
    { icon: TrendingUp, label: 'Finanzen', tab: 'finances' },
    { icon: FileText, label: 'Monatsberichte', tab: 'reports' },
  ];

  const toolsNavItems: NavItem[] = [
    { icon: BookOpenCheck, label: 'CRM', href: '/crm' },
    { icon: Gift, label: 'Promotion-Code', tab: 'promotion' },
    { icon: Target, label: 'Marketing', tab: 'marketing' },
  ];

  const adminNavItems: NavItem[] = [
    { icon: Network, label: 'MLM Dashboard', href: '/mlm' },
    { icon: Shield, label: 'Admin-Panel', href: '/admin', adminOnly: true },
    { icon: Settings, label: 'Einstellungen', tab: 'settings' },
  ];

  const handleNavClick = (item: NavItem) => {
    if (item.href) {
      navigate(item.href);
    } else if (item.tab && onTabChange) {
      onTabChange(item.tab);
    }
  };

  const handleLogout = async () => {
    await signOut();
    navigate('/');
  };

  const renderNavItem = (item: NavItem) => {
    if (item.adminOnly && !isAdmin) return null;

    const isActive = item.tab ? activeTab === item.tab : location.pathname === item.href;

    return (
      <Button
        key={item.label}
        variant="ghost"
        className={cn(
          'w-full justify-start gap-3 h-11',
          isActive && 'bg-primary/10 text-primary hover:bg-primary/15'
        )}
        onClick={() => handleNavClick(item)}
      >
        <item.icon className="h-5 w-5" />
        <span className="flex-1 text-left">{item.label}</span>
        {item.badge && (
          <Badge variant="secondary" className="ml-auto">
            {item.badge}
          </Badge>
        )}
        {isActive && <ChevronRight className="h-4 w-4" />}
      </Button>
    );
  };

  return (
    <div className="flex flex-col h-screen lg:h-full bg-card border-r w-full overflow-hidden">
      {/* Logo / Header */}
      <div className="p-4 border-b">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg flex items-center justify-center overflow-hidden">
            <img src={logoIconBlack} alt="GAP" className="w-10 h-10 object-contain" />
          </div>
          <div>
            <h2 className="font-bold text-lg">GAP Protection</h2>
            <p className="text-xs text-muted-foreground">Partner Dashboard</p>
          </div>
        </div>
      </div>

      {/* User Info */}
      <div className="p-4 border-b bg-muted/30">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-primary rounded-full flex items-center justify-center text-primary-foreground font-medium">
            {profile?.first_name?.[0]}{profile?.last_name?.[0]}
          </div>
          <div className="flex-1 min-w-0">
            <p className="font-medium truncate">
              {profile?.first_name} {profile?.last_name}
            </p>
            <div className="flex items-center gap-2">
              <Badge variant="secondary" className="text-xs">
                {profile?.role === 'admin' ? 'Administrator' : 
                 profile?.role === 'partner' ? 'Partner' : 'Kunde'}
              </Badge>
              <Badge 
                variant={profile?.status === 'active' ? 'default' : 'outline'}
                className="text-xs"
              >
                {profile?.status === 'active' ? 'Aktiv' : 'Ausstehend'}
              </Badge>
            </div>
          </div>
        </div>
      </div>

      {/* Navigation */}
      <div className="flex-1 overflow-y-auto p-4 space-y-6">
        {/* Main Navigation */}
        {isPartner && (
          <div className="space-y-1">
            <p className="text-xs font-medium text-muted-foreground px-3 mb-2">
              DASHBOARD
            </p>
            {mainNavItems.map(renderNavItem)}
          </div>
        )}

        {/* Tools */}
        {isPartner && (
          <div className="space-y-1">
            <p className="text-xs font-medium text-muted-foreground px-3 mb-2">
              WERKZEUGE
            </p>
            {toolsNavItems.map(renderNavItem)}
          </div>
        )}

        {/* Admin & Settings */}
        <div className="space-y-1">
          <p className="text-xs font-medium text-muted-foreground px-3 mb-2">
            EINSTELLUNGEN
          </p>
          {adminNavItems.map(renderNavItem)}
        </div>
      </div>

      {/* Logout */}
      <div className="p-4 border-t">
        <Button
          variant="ghost"
          className="w-full justify-start gap-3 text-destructive hover:text-destructive hover:bg-destructive/10"
          onClick={handleLogout}
        >
          <LogOut className="h-5 w-5" />
          <span>{t('nav.logout')}</span>
        </Button>
      </div>
    </div>
  );
}
