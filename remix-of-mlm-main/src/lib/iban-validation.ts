/**
 * Real IBAN validation with checksum verification
 * Implements ISO 7064 MOD 97-10 algorithm
 */

// Country-specific IBAN lengths
const IBAN_LENGTHS: Record<string, number> = {
  AL: 28, AD: 24, AT: 20, AZ: 28, BH: 22, BY: 28, BE: 16, BA: 20,
  BR: 29, BG: 22, CR: 22, HR: 21, CY: 28, CZ: 24, DK: 18, DO: 28,
  TL: 23, EE: 20, FO: 18, FI: 18, FR: 27, GE: 22, DE: 22, GI: 23,
  GR: 27, GL: 18, GT: 28, HU: 28, IS: 26, IQ: 23, IE: 22, IL: 23,
  IT: 27, JO: 30, KZ: 20, XK: 20, KW: 30, LV: 21, LB: 28, LI: 21,
  LT: 20, LU: 20, MK: 19, MT: 31, MR: 27, MU: 30, MC: 27, MD: 24,
  ME: 22, NL: 18, NO: 15, PK: 24, PS: 29, PL: 24, PT: 25, QA: 29,
  RO: 24, LC: 32, SM: 27, ST: 25, SA: 24, RS: 22, SC: 31, SK: 24,
  SI: 19, ES: 24, SE: 24, CH: 21, TN: 24, TR: 26, UA: 29, AE: 23,
  GB: 22, VA: 22, VG: 24
};

/**
 * Remove spaces and convert to uppercase
 */
export function formatIBAN(iban: string): string {
  return iban.replace(/\s/g, '').toUpperCase();
}

/**
 * Format IBAN with spaces every 4 characters for display
 */
export function formatIBANDisplay(iban: string): string {
  const clean = formatIBAN(iban);
  return clean.replace(/(.{4})/g, '$1 ').trim();
}

/**
 * Validate IBAN structure (country code + length)
 */
export function validateIBANStructure(iban: string): { valid: boolean; error?: string } {
  const clean = formatIBAN(iban);
  
  if (clean.length < 2) {
    return { valid: false, error: 'IBAN zu kurz' };
  }
  
  const countryCode = clean.substring(0, 2);
  const expectedLength = IBAN_LENGTHS[countryCode];
  
  if (!expectedLength) {
    return { valid: false, error: `Unbekannter Ländercode: ${countryCode}` };
  }
  
  if (clean.length !== expectedLength) {
    return { 
      valid: false, 
      error: `Ungültige IBAN-Länge für ${countryCode}: erwartet ${expectedLength}, erhalten ${clean.length}` 
    };
  }
  
  // Check basic format: 2 letters + 2 digits + alphanumeric
  if (!/^[A-Z]{2}[0-9]{2}[A-Z0-9]+$/.test(clean)) {
    return { valid: false, error: 'Ungültiges IBAN-Format' };
  }
  
  return { valid: true };
}

/**
 * Convert letter to number (A=10, B=11, etc.)
 */
function letterToNumber(char: string): string {
  const code = char.charCodeAt(0);
  if (code >= 65 && code <= 90) {
    return (code - 55).toString();
  }
  return char;
}

/**
 * Calculate MOD 97 for a large number represented as string
 */
function mod97(numStr: string): number {
  let remainder = 0;
  for (const char of numStr) {
    remainder = (remainder * 10 + parseInt(char, 10)) % 97;
  }
  return remainder;
}

/**
 * Validate IBAN checksum using MOD 97-10 algorithm
 */
export function validateIBANChecksum(iban: string): boolean {
  const clean = formatIBAN(iban);
  
  // Move first 4 characters to end
  const rearranged = clean.substring(4) + clean.substring(0, 4);
  
  // Convert letters to numbers
  let numericString = '';
  for (const char of rearranged) {
    numericString += letterToNumber(char);
  }
  
  // Calculate MOD 97 - must equal 1 for valid IBAN
  return mod97(numericString) === 1;
}

/**
 * Full IBAN validation: structure + checksum
 */
export function validateIBAN(iban: string): { valid: boolean; error?: string } {
  if (!iban || iban.trim().length === 0) {
    return { valid: false, error: 'IBAN ist erforderlich' };
  }
  
  const structureResult = validateIBANStructure(iban);
  if (!structureResult.valid) {
    return structureResult;
  }
  
  if (!validateIBANChecksum(iban)) {
    return { valid: false, error: 'IBAN Prüfsumme ungültig - bitte überprüfen Sie die Eingabe' };
  }
  
  return { valid: true };
}

/**
 * Get bank info from IBAN (for German IBANs)
 * Returns the BLZ (Bankleitzahl) for DE IBANs
 */
export function getBankInfoFromIBAN(iban: string): { countryCode: string; checkDigits: string; bankCode?: string } {
  const clean = formatIBAN(iban);
  
  const countryCode = clean.substring(0, 2);
  const checkDigits = clean.substring(2, 4);
  
  // For German IBANs, extract BLZ (positions 5-12)
  if (countryCode === 'DE' && clean.length >= 12) {
    return {
      countryCode,
      checkDigits,
      bankCode: clean.substring(4, 12)
    };
  }
  
  return { countryCode, checkDigits };
}
