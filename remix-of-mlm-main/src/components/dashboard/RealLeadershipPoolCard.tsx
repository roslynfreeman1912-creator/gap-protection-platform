import { useState, useEffect, useCallback } from 'react';
import { useLanguage } from '@/contexts/LanguageContext';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { supabase } from '@/integrations/supabase/client';
import { Award, Star, Globe, TrendingUp, Loader2, Euro } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

interface LeadershipData {
  qualification: {
    pool_level: string;
    shares_count: number;
    is_qualified: boolean;
    direct_partners_count: number;
    active_contracts_count: number;
    level1_partners_count: number;
    level2_partners_count: number;
    qualified_at: string | null;
  } | null;
  payouts: {
    id: string;
    pool_level: string;
    period_start: string;
    period_end: string;
    payout_amount: number;
    share_value: number;
    partner_shares: number;
    status: string;
  }[];
}

interface Stats {
  directPartners: number;
  level1Partners: number;
  level2Partners: number;
  totalTeam: number;
}

interface RealLeadershipPoolCardProps {
  profileId: string;
}

interface PoolLevel {
  name: string;
  icon: React.ComponentType<{ className?: string }>;
  shares: number;
  requirements: {
    directPartners: number;
    activeContracts: number;
    level1Partners?: number;
    level2Partners?: number;
  };
  color: string;
}

const poolLevels: PoolLevel[] = [
  {
    name: 'Business Partner Plus',
    icon: Star,
    shares: 1,
    requirements: { directPartners: 5, activeContracts: 500 },
    color: 'from-yellow-500 to-amber-500',
  },
  {
    name: 'National Partner',
    icon: Award,
    shares: 3,
    requirements: { directPartners: 5, activeContracts: 1500, level1Partners: 3 },
    color: 'from-blue-500 to-indigo-500',
  },
  {
    name: 'World Partner',
    icon: Globe,
    shares: 7,
    requirements: { directPartners: 7, activeContracts: 7500, level1Partners: 5, level2Partners: 3 },
    color: 'from-purple-500 to-pink-500',
  },
];

export function RealLeadershipPoolCard({ profileId }: RealLeadershipPoolCardProps) {
  const { t } = useLanguage();
  const { toast } = useToast();
  const [isLoading, setIsLoading] = useState(true);
  const [leadershipData, setLeadershipData] = useState<LeadershipData | null>(null);
  const [stats, setStats] = useState<Stats | null>(null);

  const loadLeadershipData = useCallback(async () => {
    setIsLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke('partner-dashboard', {
        body: { action: 'full' }
      });

      if (error) throw error;

      setLeadershipData(data.leadership);
      setStats(data.stats);
    } catch (error: any) {
      toast({ variant: 'destructive', title: 'Fehler', description: error.message });
    } finally {
      setIsLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    loadLeadershipData();
  }, [profileId, loadLeadershipData]);

  const calculateProgress = (current: number, required: number) => {
    return Math.min((current / required) * 100, 100);
  };

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('de-DE', {
      style: 'currency',
      currency: 'EUR',
    }).format(amount);
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('de-DE');
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  const currentLevel = leadershipData?.qualification?.pool_level;
  const currentStats = {
    directPartners: stats?.directPartners || 0,
    activeContracts: leadershipData?.qualification?.active_contracts_count || 0,
    level1Partners: stats?.level1Partners || 0,
    level2Partners: stats?.level2Partners || 0
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold">{t('dashboard.sections.leadershipPool')}</h2>
          <p className="text-muted-foreground">
            Qualifizieren Sie sich für zusätzliche Poolbeteiligungen
          </p>
        </div>
        {leadershipData?.qualification?.is_qualified && (
          <Badge className="text-lg px-4 py-2 bg-gradient-to-r from-primary to-primary/80">
            {leadershipData.qualification.shares_count} Share{leadershipData.qualification.shares_count > 1 ? 's' : ''}
          </Badge>
        )}
      </div>

      {/* Pool Levels */}
      <div className="grid md:grid-cols-3 gap-6">
        {poolLevels.map((level, index) => {
          const isCurrentLevel = 
            (level.name === 'Business Partner Plus' && currentLevel === 'business_partner_plus') ||
            (level.name === 'National Partner' && currentLevel === 'national_partner') ||
            (level.name === 'World Partner' && currentLevel === 'world_partner');

          const isQualified = 
            currentStats.directPartners >= level.requirements.directPartners &&
            currentStats.activeContracts >= level.requirements.activeContracts &&
            (!level.requirements.level1Partners || currentStats.level1Partners >= level.requirements.level1Partners) &&
            (!level.requirements.level2Partners || currentStats.level2Partners >= level.requirements.level2Partners);
          
          return (
            <Card 
              key={level.name}
              className={`relative overflow-hidden transition-all ${
                isCurrentLevel ? 'border-2 border-primary shadow-lg ring-2 ring-primary/20' : 
                isQualified ? 'border-green-500' : 'opacity-80'
              }`}
            >
              <div className={`absolute inset-0 bg-gradient-to-br ${level.color} opacity-5`} />
              
              {isCurrentLevel && (
                <div className="absolute top-3 right-3">
                  <Badge className="bg-primary">Aktuell</Badge>
                </div>
              )}

              {isQualified && !isCurrentLevel && (
                <div className="absolute top-3 right-3">
                  <Badge className="bg-green-500">Qualifiziert</Badge>
                </div>
              )}

              <CardHeader className="relative pb-2">
                <div className="flex items-center gap-3">
                  <div className={`w-12 h-12 rounded-xl bg-gradient-to-br ${level.color} flex items-center justify-center`}>
                    <level.icon className="h-6 w-6 text-white" />
                  </div>
                  <div>
                    <CardTitle className="text-lg">{level.name}</CardTitle>
                    <Badge variant="secondary">{level.shares} Share{level.shares > 1 ? 's' : ''}</Badge>
                  </div>
                </div>
              </CardHeader>

              <CardContent className="relative space-y-4">
                {/* Direct Partners */}
                <div className="space-y-2">
                  <div className="flex justify-between text-sm">
                    <span>Direkte Partner</span>
                    <span className="font-medium">
                      {currentStats.directPartners} / {level.requirements.directPartners}
                    </span>
                  </div>
                  <Progress 
                    value={calculateProgress(currentStats.directPartners, level.requirements.directPartners)} 
                    className="h-2"
                  />
                </div>

                {/* Active Contracts */}
                <div className="space-y-2">
                  <div className="flex justify-between text-sm">
                    <span>Team-Verträge</span>
                    <span className="font-medium">
                      {currentStats.activeContracts.toLocaleString('de-DE')} / {level.requirements.activeContracts.toLocaleString('de-DE')}
                    </span>
                  </div>
                  <Progress 
                    value={calculateProgress(currentStats.activeContracts, level.requirements.activeContracts)} 
                    className="h-2"
                  />
                </div>

                {level.requirements.level1Partners && (
                  <div className="space-y-2">
                    <div className="flex justify-between text-sm">
                      <span>Level 1 Partner</span>
                      <span className="font-medium">
                        {currentStats.level1Partners} / {level.requirements.level1Partners}
                      </span>
                    </div>
                    <Progress 
                      value={calculateProgress(currentStats.level1Partners, level.requirements.level1Partners)} 
                      className="h-2"
                    />
                  </div>
                )}

                {level.requirements.level2Partners && (
                  <div className="space-y-2">
                    <div className="flex justify-between text-sm">
                      <span>Level 2 Partner</span>
                      <span className="font-medium">
                        {currentStats.level2Partners} / {level.requirements.level2Partners}
                      </span>
                    </div>
                    <Progress 
                      value={calculateProgress(currentStats.level2Partners, level.requirements.level2Partners)} 
                      className="h-2"
                    />
                  </div>
                )}
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* Recent Payouts */}
      {leadershipData?.payouts && leadershipData.payouts.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Euro className="h-5 w-5" />
              Ihre Pool-Auszahlungen
            </CardTitle>
            <CardDescription>Übersicht Ihrer Leadership Pool Auszahlungen</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {leadershipData.payouts.slice(0, 5).map((payout) => (
                <div 
                  key={payout.id}
                  className="flex items-center justify-between p-3 rounded-lg bg-muted/50"
                >
                  <div>
                    <p className="font-medium">
                      {formatDate(payout.period_start)} - {formatDate(payout.period_end)}
                    </p>
                    <p className="text-sm text-muted-foreground">
                      {payout.partner_shares} Share{payout.partner_shares > 1 ? 's' : ''} × {formatCurrency(payout.share_value)}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="text-lg font-bold text-primary">
                      {formatCurrency(payout.payout_amount)}
                    </p>
                    <Badge variant={payout.status === 'paid' ? 'default' : 'secondary'}>
                      {payout.status === 'paid' ? 'Ausgezahlt' : 'Ausstehend'}
                    </Badge>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Info Box */}
      <Card className="bg-muted/50">
        <CardContent className="pt-6">
          <div className="flex items-start gap-4">
            <TrendingUp className="h-8 w-8 text-primary flex-shrink-0" />
            <div>
              <h3 className="font-semibold mb-1">Wie funktioniert der Leadership-Pool?</h3>
              <p className="text-sm text-muted-foreground">
                Der Leadership-Pool wird aus maximal 2% des Gesamtumsatzes gespeist. 
                Die Verteilung erfolgt monatlich nach dem Share-System: Business Partner Plus erhalten 1 Share, 
                National Partner 3 Shares und World Partner 7 Shares. Der Wert pro Share ergibt sich aus 
                dem Pool-Betrag geteilt durch die Gesamtanzahl aller Shares.
              </p>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
