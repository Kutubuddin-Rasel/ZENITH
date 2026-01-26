import {
  IsString,
  IsNotEmpty,
  IsArray,
  IsOptional,
  IsUUID,
  IsDateString,
  ArrayMinSize,
  MaxLength,
  MinLength,
} from 'class-validator';
import { IsAllowedScope } from '../validators/is-allowed-scope.validator';

/**
 * DTO for creating a new API key.
 *
 * SECURITY VALIDATIONS:
 * - Name: Required, 1-100 chars
 * - Scopes: Validated against master vocabulary (no magic strings)
 * - ProjectId: Optional UUID
 * - ExpiresAt: Optional ISO date string
 */
export class CreateApiKeyDto {
  /**
   * Human-readable name for the API key
   * Example: "Production Server", "CI/CD Pipeline"
   */
  @IsString()
  @IsNotEmpty()
  @MinLength(1)
  @MaxLength(100, { message: 'Name must be at most 100 characters' })
  name: string;

  /**
   * List of scopes (permissions) for this key.
   *
   * VALIDATION:
   * - Must be non-empty array
   * - Each scope must exist in the master vocabulary
   * - Invalid scopes return helpful error message
   *
   * Example: ['projects:read', 'issues:write']
   */
  @IsArray({ message: 'Scopes must be an array' })
  @ArrayMinSize(1, { message: 'At least one scope is required' })
  @IsString({ each: true, message: 'Each scope must be a string' })
  @IsAllowedScope({
    message:
      'One or more scopes are invalid. Check API documentation for valid scopes.',
  })
  scopes: string[];

  /**
   * Optional project ID to scope this key to a specific project.
   * If set, the key can only access resources within that project.
   */
  @IsUUID('4', { message: 'Project ID must be a valid UUID' })
  @IsOptional()
  projectId?: string;

  /**
   * Optional expiration date for the key.
   * After this date, the key will be automatically rejected.
   * Format: ISO 8601 date string
   */
  @IsDateString(
    {},
    { message: 'Expiration date must be a valid ISO date string' },
  )
  @IsOptional()
  expiresAt?: string;
}
