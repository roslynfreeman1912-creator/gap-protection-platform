import { useLanguage } from '@/contexts/LanguageContext';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Award, Star, Globe, TrendingUp } from 'lucide-react';

interface Stats {
  totalPartners: number;
  activeContracts: number;
  level1Partners: number;
  level2Partners: number;
}

interface LeadershipPoolCardProps {
  stats: Stats;
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
    requirements: {
      directPartners: 5,
      activeContracts: 500,
    },
    color: 'from-yellow-500 to-amber-500',
  },
  {
    name: 'National Partner',
    icon: Award,
    shares: 3,
    requirements: {
      directPartners: 5,
      activeContracts: 1500,
      level1Partners: 3,
    },
    color: 'from-blue-500 to-indigo-500',
  },
  {
    name: 'World Partner',
    icon: Globe,
    shares: 7,
    requirements: {
      directPartners: 7,
      activeContracts: 7500,
      level1Partners: 5,
      level2Partners: 3,
    },
    color: 'from-purple-500 to-pink-500',
  },
];

export function LeadershipPoolCard({ stats }: LeadershipPoolCardProps) {
  const { t } = useLanguage();

  const calculateProgress = (current: number, required: number) => {
    return Math.min((current / required) * 100, 100);
  };

  const isQualified = (level: PoolLevel) => {
    const reqs = level.requirements;
    return (
      stats.totalPartners >= reqs.directPartners &&
      stats.activeContracts >= reqs.activeContracts &&
      (!reqs.level1Partners || stats.level1Partners >= reqs.level1Partners) &&
      (!reqs.level2Partners || stats.level2Partners >= reqs.level2Partners)
    );
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
        <Badge variant="outline" className="text-lg px-4 py-2">
          Max. 2% vom Gesamtumsatz
        </Badge>
      </div>

      <div className="grid md:grid-cols-3 gap-6">
        {poolLevels.map((level, index) => {
          const qualified = isQualified(level);
          
          return (
            <Card 
              key={level.name}
              className={`relative overflow-hidden transition-all ${
                qualified ? 'border-2 border-primary shadow-lg' : 'opacity-80'
              }`}
            >
              {/* Background gradient */}
              <div className={`absolute inset-0 bg-gradient-to-br ${level.color} opacity-5`} />
              
              {/* Qualified badge */}
              {qualified && (
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
                      {stats.totalPartners} / {level.requirements.directPartners}
                    </span>
                  </div>
                  <Progress 
                    value={calculateProgress(stats.totalPartners, level.requirements.directPartners)} 
                    className="h-2"
                  />
                </div>

                {/* Active Contracts */}
                <div className="space-y-2">
                  <div className="flex justify-between text-sm">
                    <span>Aktive Verträge</span>
                    <span className="font-medium">
                      {stats.activeContracts.toLocaleString('de-DE')} / {level.requirements.activeContracts.toLocaleString('de-DE')}
                    </span>
                  </div>
                  <Progress 
                    value={calculateProgress(stats.activeContracts, level.requirements.activeContracts)} 
                    className="h-2"
                  />
                </div>

                {/* Level 1 Partners (if required) */}
                {level.requirements.level1Partners && (
                  <div className="space-y-2">
                    <div className="flex justify-between text-sm">
                      <span>Partner mit Level 1</span>
                      <span className="font-medium">
                        {stats.level1Partners} / {level.requirements.level1Partners}
                      </span>
                    </div>
                    <Progress 
                      value={calculateProgress(stats.level1Partners, level.requirements.level1Partners)} 
                      className="h-2"
                    />
                  </div>
                )}

                {/* Level 2 Partners (if required) */}
                {level.requirements.level2Partners && (
                  <div className="space-y-2">
                    <div className="flex justify-between text-sm">
                      <span>Partner mit Level 2</span>
                      <span className="font-medium">
                        {stats.level2Partners} / {level.requirements.level2Partners}
                      </span>
                    </div>
                    <Progress 
                      value={calculateProgress(stats.level2Partners, level.requirements.level2Partners)} 
                      className="h-2"
                    />
                  </div>
                )}

                {/* Monthly Revenue Estimate */}
                <div className="pt-2 border-t">
                  <p className="text-xs text-muted-foreground">
                    Team-Umsatz bei Qualifikation:
                  </p>
                  <p className="text-lg font-bold text-primary">
                    {(level.requirements.activeContracts * 299).toLocaleString('de-DE')} € / Monat
                  </p>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

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
