import { IsBoolean, IsOptional } from 'class-validator';

export class UpdateNotificationPreferencesDto {
  @IsOptional()
  @IsBoolean()
  notifyOnNewLogin?: boolean;

  @IsOptional()
  @IsBoolean()
  notifyOnPasswordChange?: boolean;

  @IsOptional()
  @IsBoolean()
  notifyOnSecurityEvent?: boolean;
}
