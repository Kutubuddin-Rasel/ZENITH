import { IsBoolean, IsOptional, IsString } from 'class-validator';

export class RespondToInviteDto {
  @IsBoolean()
  accept: boolean;

  @IsOptional()
  @IsString()
  reason?: string;
} 