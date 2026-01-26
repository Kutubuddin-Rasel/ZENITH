import {
  registerDecorator,
  ValidationOptions,
  ValidatorConstraint,
  ValidatorConstraintInterface,
  ValidationArguments,
} from 'class-validator';
import * as net from 'net';

/**
 * CIDR Validator Constraint
 *
 * Validates CIDR notation for both IPv4 and IPv6 addresses.
 * Uses Node.js built-in 'net' module for robust IP validation.
 *
 * SECURITY CONSIDERATIONS:
 * - No regex-based validation (prevents ReDoS attacks)
 * - Validates subnet mask range (0-32 for IPv4, 0-128 for IPv6)
 * - Prevents malformed inputs like "192.168.1.0/33" or "::1/129"
 *
 * Valid examples:
 * - 192.168.1.0/24
 * - 10.0.0.0/8
 * - 2001:db8::/32
 * - ::1/128
 */
@ValidatorConstraint({ name: 'isCIDR', async: false })
export class IsCIDRConstraint implements ValidatorConstraintInterface {
  validate(value: unknown, _args: ValidationArguments): boolean {
    if (typeof value !== 'string') {
      return false;
    }

    // Check for CIDR notation (must contain exactly one /)
    const parts = value.split('/');
    if (parts.length !== 2) {
      return false;
    }

    const [ipAddress, prefixLengthStr] = parts;

    // Validate the IP address portion using Node.js net module
    const ipVersion = net.isIP(ipAddress);
    if (ipVersion === 0) {
      // Not a valid IP address
      return false;
    }

    // Validate the prefix length
    const prefixLength = parseInt(prefixLengthStr, 10);
    if (isNaN(prefixLength) || prefixLength < 0) {
      return false;
    }

    // Check prefix length bounds based on IP version
    if (ipVersion === 4 && prefixLength > 32) {
      return false;
    }
    if (ipVersion === 6 && prefixLength > 128) {
      return false;
    }

    // Additional check: prefix string should be numeric only (no leading zeros except for "0")
    if (prefixLengthStr !== String(prefixLength)) {
      return false;
    }

    return true;
  }

  defaultMessage(args: ValidationArguments): string {
    return `${args.property} must be a valid CIDR notation (e.g., 192.168.1.0/24 or 2001:db8::/32)`;
  }
}

/**
 * @IsCIDR() decorator for validating CIDR notation
 *
 * @example
 * class CreateRuleDto {
 *   @IsCIDR()
 *   cidrRange: string;
 * }
 */
export function IsCIDR(validationOptions?: ValidationOptions) {
  return function (object: object, propertyName: string) {
    registerDecorator({
      target: object.constructor,
      propertyName: propertyName,
      options: validationOptions,
      constraints: [],
      validator: IsCIDRConstraint,
    });
  };
}
