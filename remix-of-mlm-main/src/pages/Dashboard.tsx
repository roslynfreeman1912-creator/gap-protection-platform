import { useEffect, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useLanguage } from '@/contexts/LanguageContext';
import { useAuth } from '@/contexts/AuthContext';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { DashboardSidebar } from '@/components/dashboard/DashboardSidebar';
import { StatsCards } from '@/components/dashboard/StatsCards';
import { PromotionCodeCard } from '@/components/dashboard/PromotionCodeCard';
import { RealLeadershipPoolCard } from '@/components/dashboard/RealLeadershipPoolCard';
import { BillingCountdown } from '@/components/dashboard/BillingCountdown';
import { MonthlyReportCard } from '@/components/dashboard/MonthlyReportCard';
import { FinancialOverviewCard } from '@/components/dashboard/FinancialOverviewCard';
import { supabase } from '@/integrations/supabase/client';
import {
  Users, FileText, Euro, CheckCircle,
  TrendingUp, Shield, Loader2, Menu, X
} from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

interface DashboardData {
  profile: any;
  roles: string[];
  isPartner: boolean;
  isAdmin: boolean;
  stats: {
    directPartners: number;
    level1Partners: number;
    level2Partners: number;
    totalTeam: number;
    pendingCommissions: number;
    approvedCommissions: number;
    paidCommissions: number;
    totalCommissions: number;
    activeCodes: number;
    totalCodeUsage: number;
  };
  hierarchy: any[];
  commissions: any[];
  codes: any[];
}

export default function DashboardPage() {
  const { t } = useLanguage();
  const { user, profile, loading, refreshProfile } = useAuth();
  const navigate = useNavigate();
  const { toast } = useToast();
  
  const [activeTab, setActiveTab] = useState('overview');
  const [dashboardData, setDashboardData] = useState<DashboardData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [sidebarOpen, setSidebarOpen] = useState(false);

  const loadDashboardData = useCallback(async () => {
    setIsLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke('partner-dashboard', {
        body: { action: 'full' }
      });

      if (error) throw error;
      setDashboardData(data);
    } catch (error: any) {
      console.error('Dashboard error:', error);
      toast({ variant: 'destructive', title: 'Fehler', description: error.message });
    } finally {
      setIsLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    if (!loading && !user) {
      navigate('/auth');
    }
  }, [user, loading, navigate]);

  useEffect(() => {
    if (profile) {
      loadDashboardData();
    } else if (!loading && user) {
      // User is authenticated but has no profile - stop loading
      setIsLoading(false);
    }
  }, [profile, loading, user, loadDashboardData]);

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('de-DE', {
      style: 'currency',
      currency: 'EUR',
    }).format(amount);
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('de-DE', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
    });
  };

  if (loading || isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <Loader2 className="h-8 w-8 animate-spin mx-auto mb-4 text-primary" />
          <p className="text-muted-foreground">Laden...</p>
        </div>
      </div>
    );
  }

  if (!user) {
    return null;
  }

  if (!profile) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center max-w-md mx-auto p-8">
          <h2 className="text-xl font-bold mb-4">Profil nicht gefunden</h2>
          <p className="text-muted-foreground mb-6">
            Ihr Benutzerprofil konnte nicht geladen werden. Bitte versuchen Sie es erneut oder kontaktieren Sie den Support.
          </p>
          <div className="flex gap-4 justify-center flex-wrap">
            <button
              onClick={async () => {
                setIsLoading(true);
                await refreshProfile();
                setIsLoading(false);
              }}
              className="px-4 py-2 bg-primary text-primary-foreground rounded-md hover:bg-primary/90"
            >
              Erneut versuchen
            </button>
            <button onClick={() => navigate('/register')} className="px-4 py-2 bg-secondary text-secondary-foreground rounded-md hover:bg-secondary/90">
              Registrieren
            </button>
            <button onClick={() => navigate('/')} className="px-4 py-2 bg-secondary text-secondary-foreground rounded-md hover:bg-secondary/90">
              Startseite
            </button>
          </div>
        </div>
      </div>
    );
  }

  const isPartner = dashboardData?.isPartner || profile?.role === 'partner' || profile?.role === 'admin' || profile?.role === 'super_admin';
  const isAdmin = dashboardData?.isAdmin || profile?.role === 'admin' || profile?.role === 'super_admin';
  const isCallcenter = profile?.role === 'callcenter';
  const stats = dashboardData?.stats || {
    directPartners: 0, level1Partners: 0, level2Partners: 0, totalTeam: 0,
    pendingCommissions: 0, approvedCommissions: 0, paidCommissions: 0, totalCommissions: 0,
    activeCodes: 0, totalCodeUsage: 0
  };
  const hierarchy = dashboardData?.hierarchy || [];
  const commissions = dashboardData?.commissions || [];
  const codes = dashboardData?.codes || [];

  const renderContent = () => {
    switch (activeTab) {
      case 'overview':
        return (
          <div className="space-y-6">
            {/* Billing Countdown & Stats */}
            <div className="grid lg:grid-cols-3 gap-6">
              <div className="lg:col-span-2">
                {isPartner && (
                  <StatsCards stats={{
                    totalPartners: stats.directPartners,
                    activeContracts: stats.totalTeam,
                    pendingCommissions: stats.pendingCommissions,
                    paidCommissions: stats.paidCommissions,
                  }} />
                )}
              </div>
              <div>
                <BillingCountdown />
              </div>
            </div>

            {/* Quick Actions */}
            <div className="grid md:grid-cols-2 gap-6">
              {/* Promotion Code */}
              {isPartner && (
                <PromotionCodeCard 
                  promotionCodes={codes.map(c => ({
                    id: c.id,
                    code: c.code,
                    usage_count: c.usage_count || 0,
                    max_uses: c.max_uses,
                    is_active: c.is_active
                  }))}
                  onCodeDeleted={loadDashboardData}
                  onCodeCreated={loadDashboardData}
                />
              )}

              {/* Recent Registrations */}
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Users className="h-5 w-5" />
                    Neue Registrierungen
                  </CardTitle>
                  <CardDescription>Die neuesten Partner in Ihrer Struktur</CardDescription>
                </CardHeader>
                <CardContent>
                  {hierarchy.length === 0 ? (
                    <p className="text-muted-foreground text-center py-4">
                      Noch keine Partner vorhanden.
                    </p>
                  ) : (
                    <div className="space-y-3">
                      {hierarchy.slice(0, 5).map((member: any) => (
                        <div 
                          key={member.id}
                          className="flex items-center justify-between p-3 rounded-lg bg-muted/50"
                        >
                          <div className="flex items-center gap-3">
                            <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center">
                              {member.user?.first_name?.[0]}{member.user?.last_name?.[0]}
                            </div>
                            <div>
                              <p className="font-medium">
                                {member.user?.first_name} {member.user?.last_name}
                              </p>
                              <p className="text-xs text-muted-foreground">
                                Stufe {member.level_number}
                              </p>
                            </div>
                          </div>
                          <Badge variant={member.user?.status === 'active' ? 'default' : 'secondary'}>
                            {member.user?.status === 'active' ? 'Aktiv' : 'Ausstehend'}
                          </Badge>
                        </div>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>

            {/* Recent Commissions */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Euro className="h-5 w-5" />
                  Letzte Provisionen
                </CardTitle>
              </CardHeader>
              <CardContent>
                {commissions.length === 0 ? (
                  <p className="text-muted-foreground text-center py-8">
                    Noch keine Provisionen vorhanden.
                  </p>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Datum</TableHead>
                        <TableHead>Kunde</TableHead>
                        <TableHead>Stufe</TableHead>
                        <TableHead>Betrag</TableHead>
                        <TableHead>Status</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {commissions.slice(0, 10).map((commission: any) => (
                        <TableRow key={commission.id}>
                          <TableCell>{formatDate(commission.created_at)}</TableCell>
                          <TableCell className="text-muted-foreground">
                            {commission.transaction?.customer?.first_name} {commission.transaction?.customer?.last_name}
                          </TableCell>
                          <TableCell>
                            <Badge variant="outline">Stufe {commission.level_number}</Badge>
                          </TableCell>
                          <TableCell className="font-medium">
                            {formatCurrency(commission.commission_amount)}
                          </TableCell>
                          <TableCell>
                            <Badge
                              variant={
                                commission.status === 'paid' ? 'default' :
                                commission.status === 'approved' ? 'secondary' :
                                'outline'
                              }
                            >
                              {commission.status === 'paid' ? 'Ausgezahlt' :
                               commission.status === 'approved' ? 'Genehmigt' :
                               'Ausstehend'}
                            </Badge>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </CardContent>
            </Card>
          </div>
        );

      case 'hierarchy':
        return (
          <Card>
            <CardHeader>
              <CardTitle>{t('dashboard.sections.hierarchy')}</CardTitle>
              <CardDescription>Ihre Partner-Struktur nach Stufen</CardDescription>
            </CardHeader>
            <CardContent>
              {hierarchy.length === 0 ? (
                <div className="text-center py-12">
                  <Users className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
                  <p className="text-muted-foreground">
                    Noch keine Partner in Ihrer Struktur.
                  </p>
                  <p className="text-sm text-muted-foreground mt-2">
                    Teilen Sie Ihren Promotion-Code, um Partner zu gewinnen.
                  </p>
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>{t('dashboard.hierarchy.level')}</TableHead>
                      <TableHead>{t('dashboard.hierarchy.partner')}</TableHead>
                      <TableHead>E-Mail</TableHead>
                      <TableHead>{t('dashboard.hierarchy.status')}</TableHead>
                      <TableHead>Provisions-Aktiv</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {hierarchy.map((member: any) => (
                      <TableRow key={member.id}>
                        <TableCell>
                          <Badge variant="outline">Stufe {member.level_number}</Badge>
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-3">
                            <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center text-sm">
                              {member.user?.first_name?.[0]}{member.user?.last_name?.[0]}
                            </div>
                            <p className="font-medium">
                              {member.user?.first_name} {member.user?.last_name}
                            </p>
                          </div>
                        </TableCell>
                        <TableCell className="text-muted-foreground">
                          {member.user?.email}
                        </TableCell>
                        <TableCell>
                          <Badge variant={member.user?.status === 'active' ? 'default' : 'secondary'}>
                            {member.user?.status === 'active' ? 'Aktiv' : 'Ausstehend'}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          {member.is_active_for_commission ? (
                            <CheckCircle className="h-5 w-5 text-green-500" />
                          ) : (
                            <span className="text-muted-foreground">—</span>
                          )}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        );

      case 'commissions':
        return (
          <Card>
            <CardHeader>
              <CardTitle>{t('dashboard.sections.commissions')}</CardTitle>
              <CardDescription>Ihre Provisionshistorie</CardDescription>
            </CardHeader>
            <CardContent>
              {commissions.length === 0 ? (
                <div className="text-center py-12">
                  <Euro className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
                  <p className="text-muted-foreground">
                    Noch keine Provisionen vorhanden.
                  </p>
                </div>
              ) : (
                <>
                  {/* Summary */}
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 sm:gap-4 mb-6">
                    <Card>
                      <CardContent className="pt-4">
                        <p className="text-sm text-muted-foreground">Ausstehend</p>
                        <p className="text-2xl font-bold text-yellow-500">
                          {formatCurrency(stats.pendingCommissions)}
                        </p>
                      </CardContent>
                    </Card>
                    <Card>
                      <CardContent className="pt-4">
                        <p className="text-sm text-muted-foreground">Genehmigt</p>
                        <p className="text-2xl font-bold text-blue-500">
                          {formatCurrency(stats.approvedCommissions)}
                        </p>
                      </CardContent>
                    </Card>
                    <Card>
                      <CardContent className="pt-4">
                        <p className="text-sm text-muted-foreground">Ausgezahlt</p>
                        <p className="text-2xl font-bold text-green-500">
                          {formatCurrency(stats.paidCommissions)}
                        </p>
                      </CardContent>
                    </Card>
                  </div>

                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>{t('dashboard.commissions.date')}</TableHead>
                        <TableHead>Kunde</TableHead>
                        <TableHead>{t('dashboard.commissions.level')}</TableHead>
                        <TableHead>{t('dashboard.commissions.amount')}</TableHead>
                        <TableHead>{t('dashboard.commissions.status')}</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {commissions.map((commission: any) => (
                        <TableRow key={commission.id}>
                          <TableCell>{formatDate(commission.created_at)}</TableCell>
                          <TableCell className="text-muted-foreground">
                            {commission.transaction?.customer?.first_name} {commission.transaction?.customer?.last_name}
                          </TableCell>
                          <TableCell>
                            <Badge variant="outline">Stufe {commission.level_number}</Badge>
                          </TableCell>
                          <TableCell className="font-medium">
                            {formatCurrency(commission.commission_amount)}
                          </TableCell>
                          <TableCell>
                            <Badge
                              variant={
                                commission.status === 'paid' ? 'default' :
                                commission.status === 'approved' ? 'secondary' :
                                'outline'
                              }
                            >
                              {commission.status === 'paid' ? 'Ausgezahlt' :
                               commission.status === 'approved' ? 'Genehmigt' :
                               'Ausstehend'}
                            </Badge>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </>
              )}
            </CardContent>
          </Card>
        );

      case 'leadership':
        return profile?.id ? <RealLeadershipPoolCard profileId={profile.id} /> : null;

      case 'reports':
        return profile?.id ? (
          <div className="space-y-6">
            <MonthlyReportCard profileId={profile.id} />
          </div>
        ) : null;

      case 'finances':
        return profile?.id ? (
          <FinancialOverviewCard profileId={profile.id} isAdmin={isAdmin} />
        ) : null;

      default:
        return null;
    }
  };

  const handleTabChange = (tab: string) => {
    setActiveTab(tab);
    setSidebarOpen(false);
  };

  return (
    <div className="min-h-screen bg-background">
      <div className="flex relative">
        {/* Mobile Sidebar Overlay */}
        {sidebarOpen && (
          <div
            className="fixed inset-0 bg-black/50 z-40 lg:hidden"
            onClick={() => setSidebarOpen(false)}
          />
        )}

        {/* Sidebar */}
        <div className={`
          fixed inset-y-0 left-0 z-50 w-[280px] transform transition-transform duration-300 ease-in-out
          lg:relative lg:translate-x-0 lg:w-auto lg:min-w-[260px]
          ${sidebarOpen ? 'translate-x-0' : '-translate-x-full'}
        `}>
          <DashboardSidebar
            activeTab={activeTab}
            onTabChange={handleTabChange}
          />
        </div>

        {/* Main Content */}
        <main className="flex-1 min-w-0 p-4 sm:p-6 lg:p-8">
          <div className="max-w-7xl mx-auto">
            {/* Header */}
            <div className="flex items-center justify-between mb-6 sm:mb-8 gap-4">
              <div className="flex items-center gap-3 min-w-0">
                <Button
                  variant="ghost"
                  size="icon"
                  className="lg:hidden shrink-0"
                  onClick={() => setSidebarOpen(true)}
                >
                  <Menu className="h-5 w-5" />
                </Button>
                <div className="min-w-0">
                  <h1 className="text-xl sm:text-2xl md:text-3xl font-bold truncate">
                    {t('dashboard.welcome')}, {profile?.first_name}!
                  </h1>
                  <p className="text-muted-foreground text-sm">
                    {profile?.role === 'super_admin' ? 'Super Administrator' : isAdmin ? 'Administrator' : isCallcenter ? 'Call Center' : isPartner ? 'Partner' : 'Kunde'}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2 sm:gap-4 shrink-0">
                {isAdmin && (
                  <Button onClick={() => navigate('/admin')} variant="outline" className="hidden sm:flex">
                    <Shield className="h-4 w-4 mr-2" />
                    Admin-Bereich
                  </Button>
                )}
                {isCallcenter && (
                  <Button onClick={() => navigate('/callcenter')} variant="outline" className="hidden sm:flex">
                    <Shield className="h-4 w-4 mr-2" />
                    Call Center
                  </Button>
                )}
                <Button onClick={loadDashboardData} variant="outline" size="icon">
                  <TrendingUp className="h-4 w-4" />
                </Button>
              </div>
            </div>

            {/* Content */}
            {renderContent()}
          </div>
        </main>
      </div>
    </div>
  );
}
