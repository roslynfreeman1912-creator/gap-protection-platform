import { useState, useRef, useEffect } from 'react';
import { Input } from '@/components/ui/input';
import { useAddressAutocomplete, NominatimResult, ParsedAddress } from '@/hooks/use-address-autocomplete';
import { Loader2, MapPin } from 'lucide-react';
import { cn } from '@/lib/utils';

interface AddressAutocompleteProps {
  value: string;
  onChange: (value: string) => void;
  onAddressSelect?: (address: ParsedAddress) => void;
  placeholder?: string;
  className?: string;
  error?: string;
}

export function AddressAutocomplete({
  value,
  onChange,
  onAddressSelect,
  placeholder = 'Straße eingeben...',
  className,
  error,
}: AddressAutocompleteProps) {
  const [inputValue, setInputValue] = useState(value);
  const inputRef = useRef<HTMLInputElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);
  
  const {
    suggestions,
    isLoading,
    isOpen,
    searchAddress,
    parseAddress,
    closeSuggestions,
    setIsOpen,
  } = useAddressAutocomplete();

  // Sync external value changes
  useEffect(() => {
    setInputValue(value);
  }, [value]);

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        dropdownRef.current &&
        !dropdownRef.current.contains(event.target as Node) &&
        inputRef.current &&
        !inputRef.current.contains(event.target as Node)
      ) {
        closeSuggestions();
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [closeSuggestions]);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newValue = e.target.value;
    setInputValue(newValue);
    onChange(newValue);
    searchAddress(newValue);
  };

  const handleSelectAddress = (result: NominatimResult) => {
    const parsed = parseAddress(result);
    
    // Update input with street name
    setInputValue(parsed.street);
    onChange(parsed.street);
    
    // Callback with full parsed address
    if (onAddressSelect) {
      onAddressSelect(parsed);
    }
    
    closeSuggestions();
  };

  const handleFocus = () => {
    if (suggestions.length > 0) {
      setIsOpen(true);
    }
  };

  return (
    <div className="relative">
      <div className="relative">
        <Input
          ref={inputRef}
          value={inputValue}
          onChange={handleInputChange}
          onFocus={handleFocus}
          placeholder={placeholder}
          className={cn(className, error && 'border-destructive')}
          autoComplete="off"
        />
        {isLoading && (
          <div className="absolute right-3 top-1/2 -translate-y-1/2">
            <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
          </div>
        )}
      </div>

      {/* Suggestions Dropdown */}
      {isOpen && suggestions.length > 0 && (
        <div
          ref={dropdownRef}
          className="absolute z-50 w-full mt-1 bg-background border rounded-md shadow-lg max-h-60 overflow-auto"
        >
          {suggestions.map((result) => (
            <button
              key={result.place_id}
              type="button"
              className="w-full px-3 py-2 text-left text-sm hover:bg-accent flex items-start gap-2 border-b last:border-b-0"
              onClick={() => handleSelectAddress(result)}
            >
              <MapPin className="h-4 w-4 mt-0.5 text-muted-foreground flex-shrink-0" />
              <span className="line-clamp-2">{result.display_name}</span>
            </button>
          ))}
        </div>
      )}

      {/* No Results */}
      {isOpen && !isLoading && suggestions.length === 0 && inputValue.length >= 3 && (
        <div
          ref={dropdownRef}
          className="absolute z-50 w-full mt-1 bg-background border rounded-md shadow-lg p-3 text-sm text-muted-foreground"
        >
          Keine Adressen gefunden
        </div>
      )}
    </div>
  );
}
