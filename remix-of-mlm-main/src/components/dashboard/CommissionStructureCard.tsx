import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Euro, Gift, Info } from 'lucide-react';

const LEVELS = [
  { level: 1, label: 'Direkter Sponsor', amount: 45, color: 'bg-green-500' },
  { level: 2, label: 'Ebene 2', amount: 20, color: 'bg-blue-500' },
  { level: 3, label: 'Ebene 3', amount: 15, color: 'bg-indigo-500' },
  { level: 4, label: 'Ebene 4', amount: 10, color: 'bg-purple-500' },
  { level: 5, label: 'Ebene 5 (Fenster-Top)', amount: 10, color: 'bg-pink-500' },
];

export function CommissionStructureCard() {
  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <Euro className="h-5 w-5 text-green-600" />
          Provisionsstruktur — 299 € Vertrag
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {/* One-time bonus */}
        <div className="flex items-center justify-between p-3 rounded-lg bg-yellow-50 border border-yellow-200">
          <div className="flex items-center gap-2">
            <Gift className="h-4 w-4 text-yellow-600" />
            <div>
              <p className="text-sm font-medium text-yellow-800">Einmalige Abschlussprämie</p>
              <p className="text-xs text-yellow-600">Nur im 1. Monat — für direkten Sponsor</p>
            </div>
          </div>
          <span className="text-lg font-bold text-yellow-700">50 €</span>
        </div>

        {/* Monthly structure */}
        <div className="space-y-2">
          <p className="text-xs text-gray-500 font-medium uppercase tracking-wide">Monatliche Strukturprovision (100 €/Monat)</p>
          {LEVELS.map(l => (
            <div key={l.level} className="flex items-center gap-3">
              <div className={`w-6 h-6 rounded-full ${l.color} flex items-center justify-center text-white text-xs font-bold flex-shrink-0`}>
                {l.level}
              </div>
              <div className="flex-1">
                <div className="flex justify-between items-center">
                  <span className="text-sm">{l.label}</span>
                  <span className="font-bold text-sm">{l.amount} €</span>
                </div>
                <div className="h-1.5 bg-gray-100 rounded-full mt-1">
                  <div
                    className={`h-1.5 rounded-full ${l.color}`}
                    style={{ width: `${(l.amount / 45) * 100}%` }}
                  />
                </div>
              </div>
            </div>
          ))}
        </div>

        {/* Summary */}
        <div className="pt-2 border-t space-y-1">
          <div className="flex justify-between text-sm">
            <span className="text-gray-500">Strukturprovision/Monat</span>
            <span className="font-bold text-green-600">100 €</span>
          </div>
          <div className="flex justify-between text-sm">
            <span className="text-gray-500">Unternehmensanteil</span>
            <span className="font-medium text-gray-700">199 €</span>
          </div>
          <div className="flex justify-between text-sm font-medium border-t pt-1">
            <span>Vertragsgrundpreis</span>
            <span>299 € netto/Monat</span>
          </div>
        </div>

        {/* Sliding Window Info */}
        <div className="flex items-start gap-2 p-2 bg-blue-50 rounded-lg">
          <Info className="h-4 w-4 text-blue-500 flex-shrink-0 mt-0.5" />
          <p className="text-xs text-blue-700">
            Rolling 5-Level Sliding Window: Provision immer für die 5 nächsten Vorfahren des Verkäufers.
            Tiefe unbegrenzt — Breite unbegrenzt.
          </p>
        </div>
      </CardContent>
    </Card>
  );
}
