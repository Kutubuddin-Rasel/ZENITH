import {
  IsString,
  IsOptional,
  IsArray,
  IsUUID,
  IsIP,
  Length,
} from 'class-validator';
import { TrimString } from '../../common/decorators/safe-transform.decorators';

/**
 * TestAccessDto
 *
 * DTO for testing access control rules against specific parameters.
 * Used by the /access-control/test endpoint.
 */
export class TestAccessDto {
  /**
   * IP address to test
   * - Must be valid IPv4 or IPv6
   */
  @IsIP(undefined, {
    message: 'ipAddress must be a valid IPv4 or IPv6 address',
  })
  @Length(1, 45, { message: 'ipAddress must not exceed 45 characters' })
  @TrimString()
  ipAddress: string;

  /**
   * User ID to test (optional, defaults to current user)
   */
  @IsOptional()
  @IsUUID('4', { message: 'userId must be a valid UUID v4' })
  userId?: string;

  /**
   * Project ID context for testing
   */
  @IsOptional()
  @IsUUID('4', { message: 'projectId must be a valid UUID v4' })
  projectId?: string;

  /**
   * User roles to test with
   */
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  @Length(1, 50, { each: true })
  userRoles?: string[];
}
