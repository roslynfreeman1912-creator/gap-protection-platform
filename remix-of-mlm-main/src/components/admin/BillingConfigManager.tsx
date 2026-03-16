import { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { securityApi } from '@/lib/securityApi';
import { Calendar, Clock, CreditCard, Save, Loader2 } from 'lucide-react';

interface BillingConfig {
  id: string;
  name: string;
  period_start_day: number;
  period_end_day: number;
  settlement_day: number;
  payout_day: number;
  vat_rate: number;
  is_active: boolean;
}

export function BillingConfigManager() {
  const { toast } = useToast();
  const [config, setConfig] = useState<BillingConfig | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);

  const loadConfig = async () => {
    const { data } = await supabase
      .from('billing_config')
      .select('*')
      .eq('is_active', true)
      .maybeSingle();
    
    setConfig(data as BillingConfig);
    setIsLoading(false);
  };

  useEffect(() => {
    loadConfig();
  }, []);

  const saveConfig = async () => {
    if (!config) return;
    
    setIsSaving(true);
    try {
      await securityApi.update('billing_config', config.id, {
          period_start_day: config.period_start_day,
          period_end_day: config.period_end_day,
          settlement_day: config.settlement_day,
          payout_day: config.payout_day,
          vat_rate: config.vat_rate
        });

      toast({ title: 'Gespeichert', description: 'Abrechnungskonfiguration wurde aktualisiert.' });
    } catch (error: any) {
      toast({ variant: 'destructive', title: 'Fehler', description: error.message });
    } finally {
      setIsSaving(false);
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin" />
      </div>
    );
  }

  if (!config) {
    return (
      <Card>
        <CardContent className="py-8 text-center text-muted-foreground">
          Keine Abrechnungskonfiguration gefunden.
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Calendar className="h-5 w-5" />
            Abrechnungszeiträume
          </CardTitle>
          <CardDescription>
            Konfigurieren Sie die Abrechnungsperioden und Auszahlungstermine
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Billing Period */}
          <div className="grid md:grid-cols-2 gap-6">
            <div className="space-y-2">
              <Label htmlFor="period_start">Periodenbeginn (Tag des Monats)</Label>
              <Input
                id="period_start"
                type="number"
                min={1}
                max={28}
                value={config.period_start_day}
                onChange={(e) => setConfig({ ...config, period_start_day: Number(e.target.value) })}
              />
              <p className="text-xs text-muted-foreground">
                An diesem Tag beginnt die Abrechnungsperiode
              </p>
            </div>
            <div className="space-y-2">
              <Label htmlFor="period_end">Periodenende (Tag des Monats)</Label>
              <Input
                id="period_end"
                type="number"
                min={1}
                max={28}
                value={config.period_end_day}
                onChange={(e) => setConfig({ ...config, period_end_day: Number(e.target.value) })}
              />
              <p className="text-xs text-muted-foreground">
                An diesem Tag endet die Abrechnungsperiode
              </p>
            </div>
          </div>

          {/* Settlement and Payout */}
          <div className="grid md:grid-cols-2 gap-6">
            <div className="space-y-2">
              <Label htmlFor="settlement" className="flex items-center gap-2">
                <Clock className="h-4 w-4" />
                Abrechnungstag
              </Label>
              <Input
                id="settlement"
                type="number"
                min={1}
                max={28}
                value={config.settlement_day}
                onChange={(e) => setConfig({ ...config, settlement_day: Number(e.target.value) })}
              />
              <p className="text-xs text-muted-foreground">
                Tag im Folgemonat, an dem die Abrechnung erstellt wird
              </p>
            </div>
            <div className="space-y-2">
              <Label htmlFor="payout" className="flex items-center gap-2">
                <CreditCard className="h-4 w-4" />
                Auszahlungstag
              </Label>
              <Input
                id="payout"
                type="number"
                min={1}
                max={28}
                value={config.payout_day}
                onChange={(e) => setConfig({ ...config, payout_day: Number(e.target.value) })}
              />
              <p className="text-xs text-muted-foreground">
                Tag im Folgemonat, an dem die Auszahlung erfolgt
              </p>
            </div>
          </div>

          {/* VAT Rate */}
          <div className="space-y-2">
            <Label htmlFor="vat">Mehrwertsteuersatz (%)</Label>
            <Input
              id="vat"
              type="number"
              min={0}
              max={100}
              step={0.01}
              value={config.vat_rate}
              onChange={(e) => setConfig({ ...config, vat_rate: Number(e.target.value) })}
              className="max-w-32"
            />
          </div>

          {/* Example Display */}
          <div className="bg-muted/50 rounded-lg p-4">
            <h4 className="font-medium mb-2">Beispiel-Abrechnungszyklus:</h4>
            <p className="text-sm text-muted-foreground">
              Abrechnungsperiode: <strong>{config.period_start_day}.</strong> bis <strong>{config.period_end_day}.</strong> des Monats
              <br />
              Abrechnung wird am <strong>{config.settlement_day}.</strong> des Folgemonats erstellt
              <br />
              Auszahlung erfolgt am <strong>{config.payout_day}.</strong> des Folgemonats
              <br />
              Mehrwertsteuer: <strong>{config.vat_rate}%</strong>
            </p>
          </div>

          <Button onClick={saveConfig} disabled={isSaving}>
            {isSaving ? (
              <Loader2 className="h-4 w-4 animate-spin mr-2" />
            ) : (
              <Save className="h-4 w-4 mr-2" />
            )}
            Speichern
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
