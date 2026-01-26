import {
  registerDecorator,
  ValidationOptions,
  ValidatorConstraint,
  ValidatorConstraintInterface,
  ValidationArguments,
} from 'class-validator';

/**
 * ISO 3166-1 alpha-2 Country Codes
 *
 * Complete list of valid two-letter country codes as per ISO 3166-1.
 * This is the authoritative list - no free-text country names allowed.
 *
 * SECURITY CONSIDERATIONS:
 * - Strict whitelist validation (only exact matches)
 * - Case-insensitive comparison (normalized to uppercase)
 * - Prevents injection of arbitrary country strings
 *
 * Last updated: 2024 (includes all 249 officially assigned codes)
 */
const ISO_3166_1_ALPHA_2_CODES = new Set([
  // A
  'AD',
  'AE',
  'AF',
  'AG',
  'AI',
  'AL',
  'AM',
  'AO',
  'AQ',
  'AR',
  'AS',
  'AT',
  'AU',
  'AW',
  'AX',
  'AZ',
  // B
  'BA',
  'BB',
  'BD',
  'BE',
  'BF',
  'BG',
  'BH',
  'BI',
  'BJ',
  'BL',
  'BM',
  'BN',
  'BO',
  'BQ',
  'BR',
  'BS',
  'BT',
  'BV',
  'BW',
  'BY',
  'BZ',
  // C
  'CA',
  'CC',
  'CD',
  'CF',
  'CG',
  'CH',
  'CI',
  'CK',
  'CL',
  'CM',
  'CN',
  'CO',
  'CR',
  'CU',
  'CV',
  'CW',
  'CX',
  'CY',
  'CZ',
  // D
  'DE',
  'DJ',
  'DK',
  'DM',
  'DO',
  'DZ',
  // E
  'EC',
  'EE',
  'EG',
  'EH',
  'ER',
  'ES',
  'ET',
  // F
  'FI',
  'FJ',
  'FK',
  'FM',
  'FO',
  'FR',
  // G
  'GA',
  'GB',
  'GD',
  'GE',
  'GF',
  'GG',
  'GH',
  'GI',
  'GL',
  'GM',
  'GN',
  'GP',
  'GQ',
  'GR',
  'GS',
  'GT',
  'GU',
  'GW',
  'GY',
  // H
  'HK',
  'HM',
  'HN',
  'HR',
  'HT',
  'HU',
  // I
  'ID',
  'IE',
  'IL',
  'IM',
  'IN',
  'IO',
  'IQ',
  'IR',
  'IS',
  'IT',
  // J
  'JE',
  'JM',
  'JO',
  'JP',
  // K
  'KE',
  'KG',
  'KH',
  'KI',
  'KM',
  'KN',
  'KP',
  'KR',
  'KW',
  'KY',
  'KZ',
  // L
  'LA',
  'LB',
  'LC',
  'LI',
  'LK',
  'LR',
  'LS',
  'LT',
  'LU',
  'LV',
  'LY',
  // M
  'MA',
  'MC',
  'MD',
  'ME',
  'MF',
  'MG',
  'MH',
  'MK',
  'ML',
  'MM',
  'MN',
  'MO',
  'MP',
  'MQ',
  'MR',
  'MS',
  'MT',
  'MU',
  'MV',
  'MW',
  'MX',
  'MY',
  'MZ',
  // N
  'NA',
  'NC',
  'NE',
  'NF',
  'NG',
  'NI',
  'NL',
  'NO',
  'NP',
  'NR',
  'NU',
  'NZ',
  // O
  'OM',
  // P
  'PA',
  'PE',
  'PF',
  'PG',
  'PH',
  'PK',
  'PL',
  'PM',
  'PN',
  'PR',
  'PS',
  'PT',
  'PW',
  'PY',
  // Q
  'QA',
  // R
  'RE',
  'RO',
  'RS',
  'RU',
  'RW',
  // S
  'SA',
  'SB',
  'SC',
  'SD',
  'SE',
  'SG',
  'SH',
  'SI',
  'SJ',
  'SK',
  'SL',
  'SM',
  'SN',
  'SO',
  'SR',
  'SS',
  'ST',
  'SV',
  'SX',
  'SY',
  'SZ',
  // T
  'TC',
  'TD',
  'TF',
  'TG',
  'TH',
  'TJ',
  'TK',
  'TL',
  'TM',
  'TN',
  'TO',
  'TR',
  'TT',
  'TV',
  'TW',
  'TZ',
  // U
  'UA',
  'UG',
  'UM',
  'US',
  'UY',
  'UZ',
  // V
  'VA',
  'VC',
  'VE',
  'VG',
  'VI',
  'VN',
  'VU',
  // W
  'WF',
  'WS',
  // Y
  'YE',
  'YT',
  // Z
  'ZA',
  'ZM',
  'ZW',
]);

/**
 * Country Code Validator Constraint
 *
 * Validates that a string is a valid ISO 3166-1 alpha-2 country code.
 */
@ValidatorConstraint({ name: 'isCountryCode', async: false })
export class IsCountryCodeConstraint implements ValidatorConstraintInterface {
  validate(value: unknown, _args: ValidationArguments): boolean {
    if (typeof value !== 'string') {
      return false;
    }

    // Normalize to uppercase and check against whitelist
    const normalized = value.trim().toUpperCase();

    // Must be exactly 2 characters
    if (normalized.length !== 2) {
      return false;
    }

    return ISO_3166_1_ALPHA_2_CODES.has(normalized);
  }

  defaultMessage(args: ValidationArguments): string {
    return `${args.property} must be a valid ISO 3166-1 alpha-2 country code (e.g., 'US', 'GB', 'BD')`;
  }
}

/**
 * @IsCountryCode() decorator for validating ISO 3166-1 alpha-2 country codes
 *
 * @example
 * class CreateRuleDto {
 *   @IsCountryCode()
 *   country: string;
 * }
 */
export function IsCountryCode(validationOptions?: ValidationOptions) {
  return function (object: object, propertyName: string) {
    registerDecorator({
      target: object.constructor,
      propertyName: propertyName,
      options: validationOptions,
      constraints: [],
      validator: IsCountryCodeConstraint,
    });
  };
}

/**
 * Helper function to check if a country code is valid
 * Can be used for programmatic validation outside class-validator
 */
export function isValidCountryCode(code: string): boolean {
  if (typeof code !== 'string' || code.length !== 2) {
    return false;
  }
  return ISO_3166_1_ALPHA_2_CODES.has(code.toUpperCase());
}

/**
 * Get all valid country codes
 * Useful for API documentation or dropdown population
 */
export function getAllCountryCodes(): string[] {
  return Array.from(ISO_3166_1_ALPHA_2_CODES).sort();
}
