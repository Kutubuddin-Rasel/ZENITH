/**
 * DTO for updating Organization Settings.
 *
 * All fields are optional (PATCH semantics).
 * Strict validators prevent invalid data at the HTTP boundary.
 *
 * VALIDATION RULES:
 * - logoUrl: Must be a valid URL (HTTPS enforced in production)
 * - timezone: Must match IANA timezone format (e.g., 'America/New_York')
 * - defaultProjectVisibility: Must be a valid ProjectVisibility enum value
 * - allowedEmailDomains: Array of valid domain names, max 10 entries
 * - maxMembers: Integer between 1 and 10,000
 */

import {
  IsOptional,
  IsString,
  IsUrl,
  IsEnum,
  IsArray,
  IsInt,
  Min,
  Max,
  ArrayMaxSize,
  Matches,
} from 'class-validator';
import { ProjectVisibility } from '../entities/organization-settings.entity';

export class UpdateOrganizationSettingsDto {
  @IsOptional()
  @IsUrl({}, { message: 'logoUrl must be a valid URL' })
  logoUrl?: string;

  @IsOptional()
  @IsString()
  @Matches(/^[A-Za-z_]+\/[A-Za-z_]+$/, {
    message:
      'timezone must be a valid IANA timezone identifier (e.g., America/New_York)',
  })
  timezone?: string;

  @IsOptional()
  @IsEnum(ProjectVisibility, {
    message: `defaultProjectVisibility must be one of: ${Object.values(ProjectVisibility).join(', ')}`,
  })
  defaultProjectVisibility?: ProjectVisibility;

  @IsOptional()
  @IsArray({ message: 'allowedEmailDomains must be an array' })
  @ArrayMaxSize(10, {
    message: 'allowedEmailDomains cannot have more than 10 entries',
  })
  @Matches(/^[a-zA-Z0-9][a-zA-Z0-9.-]*\.[a-zA-Z]{2,}$/, {
    each: true,
    message:
      'Each domain must be a valid domain name (e.g., acme.com)',
  })
  allowedEmailDomains?: string[];

  @IsOptional()
  @IsInt({ message: 'maxMembers must be an integer' })
  @Min(1, { message: 'maxMembers must be at least 1' })
  @Max(10000, { message: 'maxMembers cannot exceed 10,000' })
  maxMembers?: number;
}
