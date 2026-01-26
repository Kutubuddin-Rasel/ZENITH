import { PartialType } from '@nestjs/mapped-types';
import { IsOptional, IsEnum, IsBoolean } from 'class-validator';
import { CreateAccessRuleDto } from './create-access-rule.dto';
import { AccessRuleStatus } from '../entities/ip-access-rule.entity';

/**
 * UpdateAccessRuleDto
 *
 * Partial DTO for updating access control rules.
 * Extends CreateAccessRuleDto with all fields optional.
 *
 * SECURITY CONSIDERATIONS:
 * - All validation rules from CreateAccessRuleDto are inherited
 * - Fields not provided will not be updated
 * - Status can be changed via this DTO
 *
 * NOTE: PartialType makes all properties from CreateAccessRuleDto optional
 * while preserving their validation decorators.
 */
export class UpdateAccessRuleDto extends PartialType(CreateAccessRuleDto) {
  /**
   * Rule status (can be updated independently)
   */
  @IsOptional()
  @IsEnum(AccessRuleStatus, {
    message: 'status must be one of: active, inactive, expired, suspended',
  })
  status?: AccessRuleStatus;

  /**
   * Whether the rule is actively enforced
   */
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
