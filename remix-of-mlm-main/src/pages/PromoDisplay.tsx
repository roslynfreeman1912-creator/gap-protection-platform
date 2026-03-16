import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Key, Timer, RefreshCw } from 'lucide-react';

export default function PromoDisplay() {
  const [code, setCode] = useState<string>('');
  const [secondsRemaining, setSecondsRemaining] = useState<number>(0);
  const [useCount, setUseCount] = useState<number>(0);
  const [isLoading, setIsLoading] = useState(true);

  const loadCode = useCallback(async () => {
    try {
      const { data, error } = await supabase.functions.invoke('promo-code-manager', {
        body: { action: 'get-current' }
      });

      if (!error && data) {
        setCode(data.code);
        setSecondsRemaining(data.seconds_remaining);
        setUseCount(data.use_count || 0);
      }
    } catch (error) {
      console.error('Error loading code:', error);
    } finally {
      setIsLoading(false);
    }
  }, []);

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  useEffect(() => {
    loadCode();

    // Countdown
    const countdownInterval = setInterval(() => {
      setSecondsRemaining(prev => {
        if (prev <= 1) {
          // Code abgelaufen - neuen laden
          loadCode();
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    // Periodisch neuen Code prüfen
    const refreshInterval = setInterval(loadCode, 30000);

    return () => {
      clearInterval(countdownInterval);
      clearInterval(refreshInterval);
    };
  }, [loadCode]);

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-gray-900 via-gray-800 to-gray-900 flex items-center justify-center">
        <RefreshCw className="h-16 w-16 text-primary animate-spin" />
      </div>
    );
  }

  const isExpiringSoon = secondsRemaining < 60;
  const progressPercent = Math.min((secondsRemaining / 600) * 100, 100);

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-900 via-gray-800 to-gray-900 flex flex-col items-center justify-center p-4 sm:p-8">
      {/* Header */}
      <div className="text-center mb-8 sm:mb-12">
        <div className="flex items-center justify-center gap-2 sm:gap-3 mb-3 sm:mb-4">
          <Key className="h-8 w-8 sm:h-12 sm:w-12 text-primary" />
          <h1 className="text-2xl sm:text-3xl md:text-4xl font-bold text-white">Registrierungscode</h1>
        </div>
        <p className="text-gray-400 text-base sm:text-lg">GAP Protection - Sicherheitslösungen</p>
      </div>

      {/* Code Display */}
      <div className="relative w-full max-w-lg">
        {/* Glow Effect */}
        <div className="absolute inset-0 bg-primary/20 blur-3xl rounded-full" />

        <div className="relative bg-gray-800/80 backdrop-blur border border-gray-700 rounded-2xl sm:rounded-3xl p-6 sm:p-8 md:p-12 shadow-2xl">
          <div
            className={`text-4xl sm:text-5xl md:text-7xl lg:text-8xl font-mono font-bold tracking-widest text-center transition-colors ${
              isExpiringSoon ? 'text-red-400 animate-pulse' : 'text-primary'
            }`}
          >
            {code}
          </div>
        </div>
      </div>

      {/* Timer */}
      <div className="mt-8 sm:mt-12 text-center">
        <div className="flex items-center justify-center gap-3 sm:gap-4 mb-4">
          <Timer className={`h-8 w-8 sm:h-10 sm:w-10 ${isExpiringSoon ? 'text-red-400' : 'text-primary'}`} />
          <span
            className={`text-3xl sm:text-4xl md:text-5xl font-mono font-bold ${
              isExpiringSoon ? 'text-red-400' : 'text-white'
            }`}
          >
            {formatTime(secondsRemaining)}
          </span>
        </div>

        {/* Progress Bar */}
        <div className="w-60 sm:w-80 mx-auto h-2 bg-gray-700 rounded-full overflow-hidden">
          <div
            className={`h-full transition-all duration-1000 ${
              isExpiringSoon ? 'bg-red-500' : 'bg-primary'
            }`}
            style={{ width: `${progressPercent}%` }}
          />
        </div>

        <p className="text-gray-400 mt-4 text-sm sm:text-base">
          Nächste Rotation in {formatTime(secondsRemaining)}
        </p>
      </div>

      {/* Stats */}
      <div className="mt-8 text-center">
        <p className="text-gray-500 text-sm">
          {useCount} Registrierungen mit diesem Code
        </p>
      </div>

      {/* Footer */}
      <div className="absolute bottom-8 text-center text-gray-600 text-sm">
        <p>Dieser Code ändert sich automatisch alle 10 Minuten</p>
        <p className="mt-1">Verwenden Sie diesen Code bei der Registrierung</p>
      </div>
    </div>
  );
}
