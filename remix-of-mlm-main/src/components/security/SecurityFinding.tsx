import { cn } from '@/lib/utils';
import { AlertTriangle, CheckCircle, XCircle, Info, ChevronDown, ChevronUp } from 'lucide-react';
import { useState } from 'react';

type Severity = 'critical' | 'high' | 'medium' | 'low' | 'info';

interface Finding {
  id: string;
  title: string;
  description: string;
  severity: Severity;
  category: string;
  recommendation?: string;
  technicalDetails?: string;
}

interface SecurityFindingProps {
  finding: Finding;
}

export function SecurityFinding({ finding }: SecurityFindingProps) {
  const [expanded, setExpanded] = useState(false);

  const getSeverityStyles = (severity: Severity) => {
    switch (severity) {
      case 'critical':
        return {
          bg: 'bg-red-500/10 border-red-500/30',
          badge: 'bg-red-500 text-white',
          icon: <XCircle className="h-5 w-5 text-red-500" />,
          label: 'KRITISCH'
        };
      case 'high':
        return {
          bg: 'bg-orange-500/10 border-orange-500/30',
          badge: 'bg-orange-500 text-white',
          icon: <AlertTriangle className="h-5 w-5 text-orange-500" />,
          label: 'HOCH'
        };
      case 'medium':
        return {
          bg: 'bg-yellow-500/10 border-yellow-500/30',
          badge: 'bg-yellow-500 text-black',
          icon: <AlertTriangle className="h-5 w-5 text-yellow-500" />,
          label: 'MITTEL'
        };
      case 'low':
        return {
          bg: 'bg-blue-500/10 border-blue-500/30',
          badge: 'bg-blue-500 text-white',
          icon: <Info className="h-5 w-5 text-blue-500" />,
          label: 'NIEDRIG'
        };
      default:
        return {
          bg: 'bg-gray-500/10 border-gray-500/30',
          badge: 'bg-gray-500 text-white',
          icon: <CheckCircle className="h-5 w-5 text-gray-500" />,
          label: 'INFO'
        };
    }
  };

  const styles = getSeverityStyles(finding.severity);

  return (
    <div className={cn("border rounded-lg overflow-hidden", styles.bg)}>
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full px-4 py-3 flex items-center gap-3 text-left hover:bg-white/5 transition-colors"
      >
        {styles.icon}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className={cn("px-2 py-0.5 text-xs font-bold rounded", styles.badge)}>
              {styles.label}
            </span>
            <span className="text-xs text-muted-foreground">{finding.category}</span>
          </div>
          <h4 className="font-medium mt-1 truncate">{finding.title}</h4>
        </div>
        {expanded ? (
          <ChevronUp className="h-5 w-5 text-muted-foreground" />
        ) : (
          <ChevronDown className="h-5 w-5 text-muted-foreground" />
        )}
      </button>
      
      {expanded && (
        <div className="px-4 pb-4 space-y-3 border-t border-white/10">
          <div className="pt-3">
            <h5 className="text-sm font-semibold mb-1">Beschreibung</h5>
            <p className="text-sm text-muted-foreground">{finding.description}</p>
          </div>
          
          {finding.technicalDetails && (
            <div>
              <h5 className="text-sm font-semibold mb-1">Technische Details</h5>
              <pre className="text-xs bg-black/30 p-2 rounded font-mono overflow-x-auto">
                {finding.technicalDetails}
              </pre>
            </div>
          )}
          
          {finding.recommendation && (
            <div>
              <h5 className="text-sm font-semibold mb-1">Empfehlung</h5>
              <p className="text-sm text-muted-foreground">{finding.recommendation}</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export type { Finding, Severity };
