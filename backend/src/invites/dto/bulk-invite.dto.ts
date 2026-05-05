import {
  IsString,
  IsNotEmpty,
  IsOptional,
  IsArray,
  ArrayMinSize,
  ArrayMaxSize,
  ValidateNested,
  IsNumber,
  Min,
  IsEmail,
  IsUUID,
} from 'class-validator';
import { Type } from 'class-transformer';

/**
 * Individual invite entry within a bulk invite request.
 * At least one of `inviteeId` or `email` must be provided per entry.
 */
export class BulkInviteEntryDto {
  @IsOptional()
  @IsUUID()
  inviteeId?: string;

  @IsOptional()
  @IsEmail()
  email?: string;

  @IsOptional()
  @IsString()
  role?: string;
}

/**
 * DTO for creating multiple invites in a single transactional batch.
 *
 * Constraints:
 * - Minimum 1, maximum 50 invites per batch (prevents abuse)
 * - Each entry must have either `inviteeId` or `email`
 * - A shared `projectId`, `role` (default), and optional `expiresInHours` apply to all entries
 */
export class BulkInviteDto {
  @IsString()
  @IsNotEmpty()
  projectId: string;

  @IsString()
  @IsNotEmpty()
  defaultRole: string;

  @IsOptional()
  @IsNumber()
  @Min(1)
  expiresInHours?: number;

  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(50)
  @ValidateNested({ each: true })
  @Type(() => BulkInviteEntryDto)
  invites: BulkInviteEntryDto[];
}
