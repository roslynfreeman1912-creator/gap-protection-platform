import { Progress } from '@/components/ui/progress';
import { cn } from '@/lib/utils';
import { 
  Globe, 
  Shield, 
  Lock, 
  Server, 
  FileSearch, 
  Network,
  CheckCircle,
  Loader2
} from 'lucide-react';

interface ScanPhase {
  id: string;
  name: string;
  description: string;
  icon: React.ReactNode;
  status: 'pending' | 'running' | 'completed' | 'error';
}

interface ScanProgressProps {
  phases: ScanPhase[];
  currentPhase: number;
  overallProgress: number;
}

export function ScanProgress({ phases, currentPhase, overallProgress }: ScanProgressProps) {
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between text-sm">
        <span className="text-muted-foreground">Gesamtfortschritt</span>
        <span className="font-mono">{Math.round(overallProgress)}%</span>
      </div>
      <Progress value={overallProgress} className="h-2" />
      
      <div className="grid gap-2 mt-4">
        {phases.map((phase, index) => (
          <div 
            key={phase.id}
            className={cn(
              "flex items-center gap-3 p-3 rounded-lg border transition-all",
              phase.status === 'running' && "border-primary bg-primary/5",
              phase.status === 'completed' && "border-green-500/30 bg-green-500/5",
              phase.status === 'error' && "border-red-500/30 bg-red-500/5",
              phase.status === 'pending' && "border-muted bg-muted/30 opacity-60"
            )}
          >
            <div className={cn(
              "w-10 h-10 rounded-lg flex items-center justify-center",
              phase.status === 'running' && "bg-primary/20 text-primary",
              phase.status === 'completed' && "bg-green-500/20 text-green-500",
              phase.status === 'error' && "bg-red-500/20 text-red-500",
              phase.status === 'pending' && "bg-muted text-muted-foreground"
            )}>
              {phase.status === 'running' ? (
                <Loader2 className="h-5 w-5 animate-spin" />
              ) : phase.status === 'completed' ? (
                <CheckCircle className="h-5 w-5" />
              ) : (
                phase.icon
              )}
            </div>
            <div className="flex-1 min-w-0">
              <h4 className="font-medium text-sm">{phase.name}</h4>
              <p className="text-xs text-muted-foreground truncate">{phase.description}</p>
            </div>
            {phase.status === 'running' && (
              <span className="text-xs text-primary animate-pulse">Läuft...</span>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

export const defaultScanPhases: ScanPhase[] = [
  {
    id: 'dns',
    name: 'DNS-Analyse',
    description: 'DNS-Records, Subdomains, MX, TXT',
    icon: <Globe className="h-5 w-5" />,
    status: 'pending'
  },
  {
    id: 'ssl',
    name: 'SSL/TLS-Prüfung',
    description: 'Zertifikate, Protokolle, Cipher Suites',
    icon: <Lock className="h-5 w-5" />,
    status: 'pending'
  },
  {
    id: 'headers',
    name: 'HTTP-Header-Analyse',
    description: 'Security Headers, CORS, CSP',
    icon: <Shield className="h-5 w-5" />,
    status: 'pending'
  },
  {
    id: 'ports',
    name: 'Port-Erkennung',
    description: 'Offene Ports und Dienste',
    icon: <Server className="h-5 w-5" />,
    status: 'pending'
  },
  {
    id: 'crawl',
    name: 'Website-Crawling',
    description: 'Seitenstruktur und Links',
    icon: <FileSearch className="h-5 w-5" />,
    status: 'pending'
  },
  {
    id: 'vulnerability',
    name: 'Schwachstellen-Scan',
    description: 'Bekannte CVEs und Risiken',
    icon: <Network className="h-5 w-5" />,
    status: 'pending'
  }
];

export type { ScanPhase };
