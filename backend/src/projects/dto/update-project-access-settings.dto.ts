import {
  IsBoolean,
  IsString,
  IsOptional,
  IsInt,
  Min,
  Max,
  IsArray,
  IsIn,
} from 'class-validator';

/**
 * DTO for updating project access control settings
 * All fields are optional - partial updates are allowed
 */
export class UpdateProjectAccessSettingsDto {
  @IsOptional()
  @IsBoolean()
  accessControlEnabled?: boolean;

  @IsOptional()
  @IsString()
  @IsIn(['deny', 'allow'])
  defaultPolicy?: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  ipAllowlist?: string[];

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  countryAllowlist?: string[];

  @IsOptional()
  @IsBoolean()
  geographicFiltering?: boolean;

  @IsOptional()
  @IsBoolean()
  timeBasedFiltering?: boolean;

  @IsOptional()
  @IsBoolean()
  emergencyAccessEnabled?: boolean;

  @IsOptional()
  @IsBoolean()
  userSpecificRules?: boolean;

  @IsOptional()
  @IsBoolean()
  roleBasedRules?: boolean;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(100)
  maxRulesPerUser?: number;

  @IsOptional()
  @IsBoolean()
  autoCleanupEnabled?: boolean;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(168) // Max 1 week
  cleanupIntervalHours?: number;

  @IsOptional()
  @IsBoolean()
  notificationEnabled?: boolean;

  @IsOptional()
  @IsBoolean()
  logAllAccess?: boolean;

  @IsOptional()
  @IsBoolean()
  requireApprovalForNewRules?: boolean;
}
