import { useEffect, useRef, useState } from 'react';
import { cn } from '@/lib/utils';
import gapLogo from '@/assets/gap-logo.webp';

interface TerminalLine {
  id: string;
  type: 'info' | 'success' | 'warning' | 'error' | 'command' | 'result';
  text: string;
  timestamp?: Date;
}

interface TerminalOutputProps {
  lines: TerminalLine[];
  isRunning?: boolean;
  title?: string;
  className?: string;
}

export function TerminalOutput({ lines, isRunning, title = "GAP Protection — Security Scanner", className }: TerminalOutputProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [cursor, setCursor] = useState(true);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [lines]);

  useEffect(() => {
    if (isRunning) {
      const interval = setInterval(() => setCursor(prev => !prev), 500);
      return () => clearInterval(interval);
    }
  }, [isRunning]);

  const getLineColor = (type: TerminalLine['type']) => {
    switch (type) {
      case 'command': return 'text-cyan-400';
      case 'success': return 'text-green-400';
      case 'warning': return 'text-yellow-400';
      case 'error': return 'text-red-400';
      case 'result': return 'text-purple-400';
      default: return 'text-gray-300';
    }
  };

  const getLinePrefix = (type: TerminalLine['type']) => {
    switch (type) {
      case 'command': return 'gap> ';
      case 'success': return '[✓] ';
      case 'warning': return '[!] ';
      case 'error': return '[✗] ';
      case 'result': return '→ ';
      default: return '';
    }
  };

  return (
    <div className={cn("rounded-xl border border-gray-700 bg-gray-950 overflow-hidden shadow-2xl", className)}>
      {/* Terminal Header */}
      <div className="flex items-center gap-2 px-4 py-2 bg-gray-900 border-b border-gray-700">
        <div className="flex gap-1.5">
          <div className="w-3 h-3 rounded-full bg-red-500" />
          <div className="w-3 h-3 rounded-full bg-yellow-500" />
          <div className="w-3 h-3 rounded-full bg-green-500" />
        </div>
        <img src={gapLogo} alt="GAP" className="h-4 w-auto ml-2 opacity-70" />
        <span className="text-gray-400 text-sm font-mono ml-1">{title}</span>
        {isRunning && (
          <span className="ml-auto text-xs text-green-400 animate-pulse">● SCANNING</span>
        )}
      </div>

      {/* Terminal Body */}
      <div 
        ref={scrollRef}
        className="p-4 font-mono text-sm h-[400px] overflow-y-auto scrollbar-thin scrollbar-thumb-gray-700 scrollbar-track-transparent"
      >
        {lines.length === 0 ? (
          <div className="text-gray-500">
            <span className="text-cyan-500">gap&gt;</span> GAP Protection Scanner bereit.
            <br />
            <span className="text-gray-600">Geben Sie eine Domain ein und starten Sie den Scan.</span>
          </div>
        ) : (
          <div className="space-y-1">
            {lines.map((line) => (
              <div key={line.id} className={cn("flex", getLineColor(line.type))}>
                <span className="text-gray-500 w-[90px] flex-shrink-0">
                  {line.timestamp?.toLocaleTimeString('de-DE', { 
                    hour: '2-digit', minute: '2-digit', second: '2-digit'
                  })}
                </span>
                <span className="whitespace-pre-wrap break-all">
                  <span className="opacity-70">{getLinePrefix(line.type)}</span>
                  {line.text}
                </span>
              </div>
            ))}
            {isRunning && (
              <div className="text-green-400">
                <span className="text-gray-500 w-[100px] inline-block">
                  {new Date().toLocaleTimeString('de-DE', { 
                    hour: '2-digit', minute: '2-digit', second: '2-digit'
                  })}
                </span>
                <span className={cursor ? 'opacity-100' : 'opacity-0'}>▌</span>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

export type { TerminalLine };