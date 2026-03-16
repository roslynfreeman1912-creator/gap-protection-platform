import { useState, useCallback, useRef, useEffect } from 'react';

export interface NominatimResult {
  place_id: number;
  licence: string;
  osm_type: string;
  osm_id: number;
  lat: string;
  lon: string;
  display_name: string;
  address?: {
    road?: string;
    house_number?: string;
    postcode?: string;
    city?: string;
    town?: string;
    village?: string;
    municipality?: string;
    state?: string;
    country?: string;
    country_code?: string;
  };
}

export interface ParsedAddress {
  street: string;
  houseNumber: string;
  postalCode: string;
  city: string;
  fullAddress: string;
}

/**
 * Hook for address autocomplete using Nominatim (OpenStreetMap)
 * German language support with countrycodes=de
 */
export function useAddressAutocomplete() {
  const [suggestions, setSuggestions] = useState<NominatimResult[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isOpen, setIsOpen] = useState(false);
  const debounceRef = useRef<NodeJS.Timeout | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);

  /**
   * Search for addresses using Nominatim API
   */
  const searchAddress = useCallback(async (query: string) => {
    if (query.length < 3) {
      setSuggestions([]);
      setIsOpen(false);
      return;
    }

    // Cancel previous request
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    abortControllerRef.current = new AbortController();

    setIsLoading(true);

    try {
      const params = new URLSearchParams({
        q: query,
        format: 'json',
        'accept-language': 'de',
        countrycodes: 'de,at,ch', // Germany, Austria, Switzerland
        addressdetails: '1',
        limit: '8',
      });

      const response = await fetch(
        `https://nominatim.openstreetmap.org/search?${params.toString()}`,
        {
          signal: abortControllerRef.current.signal,
          headers: {
            'User-Agent': 'GAP-Protection Registration Form',
          },
        }
      );

      if (!response.ok) {
        throw new Error('Nominatim API error');
      }

      const data: NominatimResult[] = await response.json();
      
      // Filter to only show street-level results
      const streetResults = data.filter(
        (result) =>
          result.address?.road || 
          result.display_name.toLowerCase().includes('straße') ||
          result.display_name.toLowerCase().includes('weg') ||
          result.display_name.toLowerCase().includes('platz') ||
          result.display_name.toLowerCase().includes('allee')
      );

      setSuggestions(streetResults.length > 0 ? streetResults : data.slice(0, 5));
      setIsOpen(streetResults.length > 0 || data.length > 0);
    } catch (error) {
      if ((error as Error).name !== 'AbortError') {
        console.error('Address search error:', error);
        setSuggestions([]);
      }
    } finally {
      setIsLoading(false);
    }
  }, []);

  /**
   * Debounced search function
   */
  const debouncedSearch = useCallback((query: string) => {
    if (debounceRef.current) {
      clearTimeout(debounceRef.current);
    }

    debounceRef.current = setTimeout(() => {
      searchAddress(query);
    }, 300);
  }, [searchAddress]);

  /**
   * Parse a Nominatim result into structured address fields
   */
  const parseAddress = useCallback((result: NominatimResult): ParsedAddress => {
    const address = result.address || {};
    
    // Get city from various fields
    const city = 
      address.city || 
      address.town || 
      address.village || 
      address.municipality || 
      '';

    return {
      street: address.road || '',
      houseNumber: address.house_number || '',
      postalCode: address.postcode || '',
      city: city,
      fullAddress: result.display_name,
    };
  }, []);

  /**
   * Close suggestions dropdown
   */
  const closeSuggestions = useCallback(() => {
    setIsOpen(false);
    setSuggestions([]);
  }, []);

  /**
   * Cleanup on unmount
   */
  useEffect(() => {
    return () => {
      if (debounceRef.current) {
        clearTimeout(debounceRef.current);
      }
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
    };
  }, []);

  return {
    suggestions,
    isLoading,
    isOpen,
    searchAddress: debouncedSearch,
    parseAddress,
    closeSuggestions,
    setIsOpen,
  };
}
