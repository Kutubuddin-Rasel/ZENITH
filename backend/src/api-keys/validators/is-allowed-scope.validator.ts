import {
  registerDecorator,
  ValidationOptions,
  ValidatorConstraint,
  ValidatorConstraintInterface,
  ValidationArguments,
} from 'class-validator';
import {
  API_SCOPES,
  isValidScope,
  getAllValidScopes,
} from '../constants/api-scopes.constant';

/**
 * Custom validator to ensure all scopes exist in the master vocabulary.
 *
 * SECURITY:
 * - Prevents arbitrary "magic strings" from being assigned as scopes
 * - Ensures only governed, documented scopes are used
 * - Provides clear error messages listing invalid scopes
 *
 * PERFORMANCE:
 * - O(n) validation where n = number of scopes in array
 * - Uses hash map lookup (O(1) per scope)
 */
@ValidatorConstraint({ name: 'isAllowedScope', async: false })
export class IsAllowedScopeConstraint implements ValidatorConstraintInterface {
  /**
   * Validate that all scopes in the array are in the master vocabulary
   */
  validate(scopes: unknown, _args: ValidationArguments): boolean {
    // Handle null/undefined (let @IsOptional/@IsDefined handle this)
    if (scopes === null || scopes === undefined) {
      return true;
    }

    // Must be an array
    if (!Array.isArray(scopes)) {
      return false;
    }

    // Empty array is valid (no scopes requested)
    if (scopes.length === 0) {
      return true;
    }

    // Check each scope
    for (const scope of scopes) {
      // Must be a string
      if (typeof scope !== 'string') {
        return false;
      }

      // Must exist in vocabulary
      if (!isValidScope(scope)) {
        return false;
      }

      // Check for deprecated scopes (optional warning)
      const definition = API_SCOPES[scope];
      if (definition?.deprecated) {
        // For now, still allow deprecated scopes but could log warning
        // In future, could reject or require acknowledgment
      }
    }

    return true;
  }

  /**
   * Generate helpful error message with invalid scopes listed
   */
  defaultMessage(args: ValidationArguments): string {
    const scopes = args.value as unknown[];

    if (!Array.isArray(scopes)) {
      return 'Scopes must be an array of strings';
    }

    // Find invalid scopes
    const invalidScopes = scopes.filter(
      (scope) => typeof scope !== 'string' || !isValidScope(scope),
    );

    if (invalidScopes.length > 0) {
      const validList = getAllValidScopes().slice(0, 10).join(', '); // Show first 10
      return (
        `Invalid scope(s): ${invalidScopes.join(', ')}. ` +
        `Valid scopes include: ${validList}...`
      );
    }

    return 'Invalid scopes provided';
  }
}

/**
 * Decorator to validate API key scopes against master vocabulary.
 *
 * Usage:
 * ```typescript
 * @IsAllowedScope({ message: 'Custom error message' })
 * scopes: string[];
 * ```
 */
export function IsAllowedScope(validationOptions?: ValidationOptions) {
  return function (object: object, propertyName: string) {
    registerDecorator({
      name: 'isAllowedScope',
      target: object.constructor,
      propertyName: propertyName,
      options: validationOptions,
      constraints: [],
      validator: IsAllowedScopeConstraint,
    });
  };
}

/**
 * Decorator to validate a single scope string.
 *
 * Usage:
 * ```typescript
 * @IsSingleAllowedScope()
 * scope: string;
 * ```
 */
@ValidatorConstraint({ name: 'isSingleAllowedScope', async: false })
export class IsSingleAllowedScopeConstraint implements ValidatorConstraintInterface {
  validate(scope: unknown, _args: ValidationArguments): boolean {
    if (typeof scope !== 'string') {
      return false;
    }
    return isValidScope(scope);
  }

  defaultMessage(_args: ValidationArguments): string {
    const validList = getAllValidScopes().slice(0, 10).join(', ');
    return `Invalid scope. Valid scopes include: ${validList}...`;
  }
}

export function IsSingleAllowedScope(validationOptions?: ValidationOptions) {
  return function (object: object, propertyName: string) {
    registerDecorator({
      name: 'isSingleAllowedScope',
      target: object.constructor,
      propertyName: propertyName,
      options: validationOptions,
      constraints: [],
      validator: IsSingleAllowedScopeConstraint,
    });
  };
}
