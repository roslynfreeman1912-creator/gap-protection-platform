import { useState, useEffect, useCallback } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { Badge } from '@/components/ui/badge';
import { Calendar, Clock, CreditCard, TrendingUp } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';

interface BillingConfig {
  period_start_day: number;
  period_end_day: number;
  settlement_day: number;
  payout_day: number;
  vat_rate: number;
}

interface MonthlyStats {
  grossAmount: number;
  netAmount: number;
  vatAmount: number;
  transactionCount: number;
  commissionAmount: number;
}

export function BillingCountdown() {
  const [config, setConfig] = useState<BillingConfig | null>(null);
  const [stats, setStats] = useState<MonthlyStats>({
    grossAmount: 0,
    netAmount: 0,
    vatAmount: 0,
    transactionCount: 0,
    commissionAmount: 0
  });
  const [countdown, setCountdown] = useState({
    days: 0,
    hours: 0,
    minutes: 0
  });

  // useCallback declarations MUST come before useEffect to avoid TDZ errors
  const calculateCountdown = useCallback((cfg?: BillingConfig) => {
    const billingConfig = cfg || config;
    if (!billingConfig) return;

    const now = new Date();
    const currentDay = now.getDate();
    const settlementDay = billingConfig.settlement_day;

    let targetDate = new Date(now.getFullYear(), now.getMonth(), settlementDay);
    
    // If we've passed this month's settlement, target next month
    if (currentDay >= settlementDay) {
      targetDate = new Date(now.getFullYear(), now.getMonth() + 1, settlementDay);
    }

    const diff = targetDate.getTime() - now.getTime();
    const days = Math.floor(diff / (1000 * 60 * 60 * 24));
    const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
    const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));

    setCountdown({ days, hours, minutes });
  }, [config]);

  const loadMonthlyStats = useCallback(async () => {
    const startOfMonth = new Date();
    startOfMonth.setDate(1);
    startOfMonth.setHours(0, 0, 0, 0);

    const { data: transactions } = await supabase
      .from('transactions')
      .select('amount, status')
      .gte('created_at', startOfMonth.toISOString())
      .eq('status', 'completed');

    const { data: commissions } = await supabase
      .from('commissions')
      .select('commission_amount')
      .gte('created_at', startOfMonth.toISOString());

    const vatRate = config?.vat_rate || 19;
    const grossTotal = transactions?.reduce((sum, t) => sum + Number(t.amount), 0) || 0;
    const netTotal = grossTotal / (1 + vatRate / 100);
    const vatTotal = grossTotal - netTotal;
    const commissionTotal = commissions?.reduce((sum, c) => sum + Number(c.commission_amount), 0) || 0;

    setStats({
      grossAmount: grossTotal,
      netAmount: netTotal,
      vatAmount: vatTotal,
      transactionCount: transactions?.length || 0,
      commissionAmount: commissionTotal
    });
  }, [config]);

  const loadBillingConfig = useCallback(async () => {
    const { data } = await supabase
      .from('billing_config')
      .select('*')
      .eq('is_active', true)
      .maybeSingle();
    
    if (data) {
      setConfig(data as BillingConfig);
      calculateCountdown(data as BillingConfig);
    }
  }, [calculateCountdown]);

  useEffect(() => {
    loadBillingConfig();
  }, [loadBillingConfig]);

  useEffect(() => {
    if (config) {
      loadMonthlyStats();
      calculateCountdown(config);

      const interval = setInterval(() => {
        calculateCountdown(config);
      }, 60000);

      return () => clearInterval(interval);
    }
  }, [config, loadMonthlyStats, calculateCountdown]);

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('de-DE', {
      style: 'currency',
      currency: 'EUR',
    }).format(amount);
  };

  // Calculate progress through billing period
  const getPeriodProgress = () => {
    if (!config) return 0;
    const now = new Date();
    const currentDay = now.getDate();
    const periodLength = 30; // Approximate
    return Math.min((currentDay / periodLength) * 100, 100);
  };

  return (
    <div className="space-y-4">
      {/* Countdown Card */}
      <Card className="bg-gradient-to-br from-primary/10 to-primary/5">
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center gap-2 text-lg">
            <Clock className="h-5 w-5 text-primary" />
            Nächste Abrechnung
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-between gap-4">
            <div className="text-center">
              <div className="text-4xl font-bold text-primary">{countdown.days}</div>
              <div className="text-xs text-muted-foreground">Tage</div>
            </div>
            <div className="text-2xl text-muted-foreground">:</div>
            <div className="text-center">
              <div className="text-4xl font-bold text-primary">{countdown.hours}</div>
              <div className="text-xs text-muted-foreground">Stunden</div>
            </div>
            <div className="text-2xl text-muted-foreground">:</div>
            <div className="text-center">
              <div className="text-4xl font-bold text-primary">{countdown.minutes}</div>
              <div className="text-xs text-muted-foreground">Minuten</div>
            </div>
          </div>
          <Progress value={getPeriodProgress()} className="mt-4 h-2" />
          <p className="text-xs text-muted-foreground mt-2 text-center">
            {config && (
              <>
                Abrechnungszeitraum: {config.period_start_day}. - {config.period_end_day}. | 
                Abrechnung: {config.settlement_day}. | 
                Auszahlung: {config.payout_day}.
              </>
            )}
          </p>
        </CardContent>
      </Card>

      {/* Monthly Stats with Net/Gross/VAT */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center gap-2 text-lg">
            <TrendingUp className="h-5 w-5 text-primary" />
            Monatsumsatz
            <Badge variant="outline" className="ml-auto">{stats.transactionCount} Transaktionen</Badge>
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-3 gap-4">
            <div className="text-center p-3 rounded-lg bg-muted/50">
              <p className="text-xs text-muted-foreground mb-1">Netto</p>
              <p className="text-xl font-bold">{formatCurrency(stats.netAmount)}</p>
            </div>
            <div className="text-center p-3 rounded-lg bg-muted/50">
              <p className="text-xs text-muted-foreground mb-1">MwSt ({config?.vat_rate || 19}%)</p>
              <p className="text-xl font-bold">{formatCurrency(stats.vatAmount)}</p>
            </div>
            <div className="text-center p-3 rounded-lg bg-primary/10">
              <p className="text-xs text-muted-foreground mb-1">Brutto</p>
              <p className="text-xl font-bold text-primary">{formatCurrency(stats.grossAmount)}</p>
            </div>
          </div>
          <div className="mt-4 pt-4 border-t flex items-center justify-between">
            <div className="flex items-center gap-2">
              <CreditCard className="h-4 w-4 text-muted-foreground" />
              <span className="text-sm text-muted-foreground">Erwartete Provision:</span>
            </div>
            <span className="font-bold text-lg text-green-600">{formatCurrency(stats.commissionAmount)}</span>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
