import { useLanguage } from '@/contexts/LanguageContext';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Users, FileText, Euro, TrendingUp, TrendingDown, Clock } from 'lucide-react';

interface Stats {
  totalPartners: number;
  activeContracts: number;
  pendingCommissions: number;
  paidCommissions: number;
  monthlyRevenue?: number;
  growth?: number;
}

interface StatsCardsProps {
  stats: Stats;
}

export function StatsCards({ stats }: StatsCardsProps) {
  const { t } = useLanguage();

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('de-DE', {
      style: 'currency',
      currency: 'EUR',
    }).format(amount);
  };

  const cards = [
    {
      title: t('dashboard.stats.totalPartners'),
      value: stats.totalPartners.toString(),
      icon: Users,
      description: 'Direkte Partner',
      trend: stats.growth != null && stats.growth !== 0 ? `${stats.growth > 0 ? '+' : ''}${stats.growth}%` : undefined,
      trendUp: (stats.growth ?? 0) > 0,
    },
    {
      title: t('dashboard.stats.activeContracts'),
      value: stats.activeContracts.toString(),
      icon: FileText,
      description: 'In Ihrer Struktur',
    },
    {
      title: t('dashboard.stats.pendingCommissions'),
      value: formatCurrency(stats.pendingCommissions),
      icon: Clock,
      description: 'Zur Auszahlung ausstehend',
      highlight: stats.pendingCommissions > 0,
    },
    {
      title: t('dashboard.stats.paidCommissions'),
      value: formatCurrency(stats.paidCommissions),
      icon: Euro,
      description: 'Bereits ausgezahlt',
    },
  ];

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
      {cards.map((card, index) => (
        <Card key={index} className={card.highlight ? 'border-primary' : ''}>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              {card.title}
            </CardTitle>
            <card.icon className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="flex items-baseline gap-2">
              <div className="text-2xl font-bold">{card.value}</div>
              {card.trend && (
                <span className={`text-xs flex items-center ${card.trendUp ? 'text-green-500' : 'text-red-500'}`}>
                  {card.trendUp ? <TrendingUp className="h-3 w-3 mr-1" /> : <TrendingDown className="h-3 w-3 mr-1" />}
                  {card.trend}
                </span>
              )}
            </div>
            <p className="text-xs text-muted-foreground mt-1">{card.description}</p>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
