import { useState, useEffect, useCallback } from 'react';
import { Input } from '@/components/ui/input';
import { validateIBAN, formatIBANDisplay, getBankInfoFromIBAN } from '@/lib/iban-validation';
import { CheckCircle2, XCircle, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';

interface IBANInputProps {
  value: string;
  onChange: (value: string) => void;
  onValidationChange?: (isValid: boolean, error?: string) => void;
  placeholder?: string;
  className?: string;
  error?: string;
}

export function IBANInput({
  value,
  onChange,
  onValidationChange,
  placeholder = 'DE89 3704 0044 0532 0130 00',
  className,
  error: externalError,
}: IBANInputProps) {
  const [displayValue, setDisplayValue] = useState('');
  const [validationState, setValidationState] = useState<'idle' | 'validating' | 'valid' | 'invalid'>('idle');
  const [validationError, setValidationError] = useState<string | undefined>();

  // Format and display IBAN
  useEffect(() => {
    if (value) {
      setDisplayValue(formatIBANDisplay(value));
    } else {
      setDisplayValue('');
    }
  }, [value]);

  // Validate IBAN when value changes
  const validateIBANDebounced = useCallback((iban: string) => {
    if (!iban || iban.replace(/\s/g, '').length < 5) {
      setValidationState('idle');
      setValidationError(undefined);
      onValidationChange?.(false);
      return;
    }

    setValidationState('validating');

    // Small delay for UX
    setTimeout(() => {
      const result = validateIBAN(iban);
      
      if (result.valid) {
        setValidationState('valid');
        setValidationError(undefined);
        onValidationChange?.(true);
      } else {
        setValidationState('invalid');
        setValidationError(result.error);
        onValidationChange?.(false, result.error);
      }
    }, 300);
  }, [onValidationChange]);

  useEffect(() => {
    const cleanValue = value.replace(/\s/g, '');
    if (cleanValue.length >= 2) {
      validateIBANDebounced(value);
    } else {
      setValidationState('idle');
    }
  }, [value, validateIBANDebounced]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    let newValue = e.target.value.toUpperCase();
    
    // Remove non-alphanumeric except spaces
    newValue = newValue.replace(/[^A-Z0-9\s]/g, '');
    
    // Remove spaces for storage
    const cleanValue = newValue.replace(/\s/g, '');
    
    // Limit length (max IBAN is 34 characters)
    if (cleanValue.length <= 34) {
      onChange(cleanValue);
      setDisplayValue(formatIBANDisplay(cleanValue));
    }
  };

  const displayError = externalError || (validationState === 'invalid' ? validationError : undefined);

  return (
    <div className="relative">
      <div className="relative">
        <Input
          value={displayValue}
          onChange={handleChange}
          placeholder={placeholder}
          className={cn(
            className,
            'pr-10 font-mono',
            displayError && 'border-destructive',
            validationState === 'valid' && 'border-green-500 focus-visible:ring-green-500'
          )}
          autoComplete="off"
        />
        
        {/* Validation Icon */}
        <div className="absolute right-3 top-1/2 -translate-y-1/2">
          {validationState === 'validating' && (
            <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
          )}
          {validationState === 'valid' && (
            <CheckCircle2 className="h-4 w-4 text-green-500" />
          )}
          {validationState === 'invalid' && (
            <XCircle className="h-4 w-4 text-destructive" />
          )}
        </div>
      </div>

      {/* Bank Info for valid German IBANs */}
      {validationState === 'valid' && value.startsWith('DE') && (
        <p className="text-xs text-green-600 mt-1 flex items-center gap-1">
          <CheckCircle2 className="h-3 w-3" />
          IBAN gültig (BLZ: {getBankInfoFromIBAN(value).bankCode})
        </p>
      )}
      
      {validationState === 'valid' && !value.startsWith('DE') && (
        <p className="text-xs text-green-600 mt-1 flex items-center gap-1">
          <CheckCircle2 className="h-3 w-3" />
          IBAN gültig ({getBankInfoFromIBAN(value).countryCode})
        </p>
      )}

      {displayError && (
        <p className="text-sm text-destructive mt-1">{displayError}</p>
      )}
    </div>
  );
}
