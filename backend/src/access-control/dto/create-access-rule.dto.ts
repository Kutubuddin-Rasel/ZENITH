import {
  IsString,
  IsOptional,
  IsEnum,
  IsInt,
  IsBoolean,
  IsArray,
  IsUUID,
  IsIP,
  IsDate,
  Min,
  Max,
  Length,
  Matches,
  ValidateIf,
  IsObject,
  ArrayMinSize,
  ArrayMaxSize,
} from 'class-validator';
import { Type } from 'class-transformer';
import { AccessRuleType, IPType } from '../entities/ip-access-rule.entity';
import { IsCIDR } from '../validators/is-cidr.validator';
import { IsCountryCode } from '../validators/is-country-code.validator';
import {
  TrimString,
  TrimAndUpperCase,
  getIPType,
} from '../../common/decorators/safe-transform.decorators';

/**
 * Action enum for access rules
 * ALLOW: Permit access matching this rule
 * BLOCK: Deny access matching this rule
 */
export enum AccessRuleAction {
  ALLOW = 'allow',
  BLOCK = 'block',
}

/**
 * CreateAccessRuleDto
 *
 * Hardened DTO for creating access control rules with OWASP-compliant validation.
 *
 * SECURITY CONSIDERATIONS:
 * - All string inputs are trimmed to remove hidden whitespace
 * - IP addresses validated using class-validator's @IsIP()
 * - CIDR ranges validated using custom IsCIDR validator (no regex, uses net module)
 * - Country codes validated against ISO 3166-1 alpha-2 whitelist
 * - Priority capped to prevent integer overflow
 * - Enums enforced for type-safe fields
 * - Length limits on all text fields
 */
export class CreateAccessRuleDto {
  // ==========================================================================
  // REQUIRED FIELDS
  // ==========================================================================

  /**
   * Type of access rule
   */
  @IsEnum(AccessRuleType, {
    message:
      'ruleType must be one of: whitelist, blacklist, geographic, time_based, user_specific, role_based',
  })
  ruleType: AccessRuleType;

  /**
   * Human-readable name for the rule
   * - Must be 3-100 characters
   * - Trimmed of leading/trailing whitespace
   */
  @IsString()
  @Length(3, 100, { message: 'name must be between 3 and 100 characters' })
  @TrimString()
  name: string;

  /**
   * IP address or CIDR range
   * - For SINGLE/RANGE: must be valid IPv4 or IPv6
   * - For CIDR: must be valid CIDR notation
   * - For WILDCARD: allows patterns like "192.168.*.*"
   */
  @ValidateIf(
    (o) => getIPType(o) !== IPType.CIDR && getIPType(o) !== IPType.WILDCARD,
  )
  @IsIP(undefined, {
    message: 'ipAddress must be a valid IPv4 or IPv6 address',
  })
  @ValidateIf((o) => getIPType(o) === IPType.CIDR)
  @IsCIDR({
    message: 'ipAddress must be a valid CIDR notation when ipType is CIDR',
  })
  @IsString()
  @Length(1, 45, { message: 'ipAddress must not exceed 45 characters' })
  @TrimString()
  ipAddress: string;

  // ==========================================================================
  // OPTIONAL FIELDS - BASIC INFO
  // ==========================================================================

  /**
   * Description of the rule
   * - Max 500 characters
   */
  @IsOptional()
  @IsString()
  @Length(0, 500, { message: 'description must not exceed 500 characters' })
  @TrimString()
  description?: string;

  /**
   * Type of IP specification
   */
  @IsOptional()
  @IsEnum(IPType, {
    message: 'ipType must be one of: single, range, cidr, wildcard',
  })
  ipType?: IPType = IPType.SINGLE;

  /**
   * End IP address for IP ranges
   * Only valid when ipType is RANGE
   */
  @IsOptional()
  @ValidateIf((o) => getIPType(o) === IPType.RANGE)
  @IsIP(undefined, { message: 'endIpAddress must be a valid IP address' })
  @TrimString()
  endIpAddress?: string;

  // ==========================================================================
  // OPTIONAL FIELDS - GEOGRAPHIC
  // ==========================================================================

  /**
   * ISO 3166-1 alpha-2 country code
   * - Strict whitelist validation (249 valid codes)
   * - Examples: 'US', 'GB', 'BD', 'JP'
   */
  @IsOptional()
  @IsCountryCode({
    message:
      'country must be a valid ISO 3166-1 alpha-2 code (e.g., US, GB, BD)',
  })
  @TrimAndUpperCase()
  country?: string;

  /**
   * State or province name
   */
  @IsOptional()
  @IsString()
  @Length(1, 100, { message: 'region must be between 1 and 100 characters' })
  @TrimString()
  region?: string;

  /**
   * City name
   */
  @IsOptional()
  @IsString()
  @Length(1, 100, { message: 'city must be between 1 and 100 characters' })
  @TrimString()
  city?: string;

  /**
   * Timezone identifier (IANA format)
   * - Examples: 'America/New_York', 'Europe/London', 'Asia/Dhaka'
   */
  @IsOptional()
  @IsString()
  @Length(1, 50, { message: 'timezone must be between 1 and 50 characters' })
  @Matches(/^[A-Za-z_]+\/[A-Za-z_]+$/, {
    message: 'timezone must be a valid IANA timezone (e.g., America/New_York)',
  })
  timezone?: string;

  // ==========================================================================
  // OPTIONAL FIELDS - TIME-BASED
  // ==========================================================================

  /**
   * Start time for allowed access (HH:MM format, 24-hour)
   */
  @IsOptional()
  @IsString()
  @Matches(/^([01]\d|2[0-3]):([0-5]\d)$/, {
    message: 'allowedStartTime must be in HH:MM format (24-hour)',
  })
  allowedStartTime?: string;

  /**
   * End time for allowed access (HH:MM format, 24-hour)
   */
  @IsOptional()
  @IsString()
  @Matches(/^([01]\d|2[0-3]):([0-5]\d)$/, {
    message: 'allowedEndTime must be in HH:MM format (24-hour)',
  })
  allowedEndTime?: string;

  /**
   * Days of week when rule applies
   * - Array of integers 0-6 (0=Sunday, 6=Saturday)
   */
  @IsOptional()
  @IsArray()
  @IsInt({ each: true })
  @Min(0, { each: true })
  @Max(6, { each: true })
  @ArrayMinSize(1)
  @ArrayMaxSize(7)
  @Type(() => Number)
  allowedDays?: number[];

  // ==========================================================================
  // OPTIONAL FIELDS - USER/ROLE BASED
  // ==========================================================================

  /**
   * User ID for user-specific rules
   */
  @IsOptional()
  @IsUUID('4', { message: 'userId must be a valid UUID v4' })
  userId?: string;

  /**
   * Allowed role names
   */
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  @Length(1, 50, { each: true })
  @ArrayMaxSize(20)
  allowedRoles?: string[];

  /**
   * Allowed project IDs
   */
  @IsOptional()
  @IsArray()
  @IsUUID('4', {
    each: true,
    message: 'Each allowedProjects item must be a valid UUID v4',
  })
  @ArrayMaxSize(50)
  allowedProjects?: string[];

  // ==========================================================================
  // OPTIONAL FIELDS - VALIDITY
  // ==========================================================================

  /**
   * When the rule becomes valid
   */
  @IsOptional()
  @IsDate({ message: 'validFrom must be a valid date' })
  @Type(() => Date)
  validFrom?: Date;

  /**
   * When the rule expires
   */
  @IsOptional()
  @IsDate({ message: 'validUntil must be a valid date' })
  @Type(() => Date)
  validUntil?: Date;

  /**
   * Whether this is a temporary rule
   */
  @IsOptional()
  @IsBoolean()
  isTemporary?: boolean;

  /**
   * When the temporary rule expires
   */
  @IsOptional()
  @IsDate({ message: 'expiresAt must be a valid date' })
  @Type(() => Date)
  expiresAt?: Date;

  // ==========================================================================
  // OPTIONAL FIELDS - EMERGENCY
  // ==========================================================================

  /**
   * Whether this is an emergency access rule
   */
  @IsOptional()
  @IsBoolean()
  isEmergency?: boolean;

  /**
   * Reason for emergency access
   */
  @IsOptional()
  @IsString()
  @Length(1, 500, {
    message: 'emergencyReason must be between 1 and 500 characters',
  })
  @TrimString()
  emergencyReason?: string;

  // ==========================================================================
  // OPTIONAL FIELDS - APPROVAL & PRIORITY
  // ==========================================================================

  /**
   * Whether the rule requires manual approval
   */
  @IsOptional()
  @IsBoolean()
  requiresApproval?: boolean;

  /**
   * Rule priority (0-1000)
   * - Higher number = higher priority
   * - Capped to prevent integer overflow
   */
  @IsOptional()
  @IsInt({ message: 'priority must be an integer' })
  @Min(0, { message: 'priority must be at least 0' })
  @Max(1000, { message: 'priority must not exceed 1000' })
  @Type(() => Number)
  priority?: number;

  // ==========================================================================
  // OPTIONAL FIELDS - LOGGING & NOTIFICATIONS
  // ==========================================================================

  /**
   * Whether to log access attempts matching this rule
   */
  @IsOptional()
  @IsBoolean()
  isLoggingEnabled?: boolean;

  /**
   * Whether to send notifications for this rule
   */
  @IsOptional()
  @IsBoolean()
  isNotificationEnabled?: boolean;

  /**
   * Notification channels (email, sms, slack, webhook)
   */
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  @Length(1, 50, { each: true })
  @ArrayMaxSize(10)
  notificationChannels?: string[];

  // ==========================================================================
  // OPTIONAL FIELDS - METADATA
  // ==========================================================================

  /**
   * Additional metadata (arbitrary key-value pairs)
   */
  @IsOptional()
  @IsObject()
  metadata?: Record<string, unknown>;
}
