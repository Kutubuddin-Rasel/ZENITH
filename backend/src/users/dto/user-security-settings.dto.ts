import { IsBoolean, IsInt, IsOptional, Max, Min } from 'class-validator';

export class UpdateUserSecuritySettingsDto {
    @IsOptional()
    @IsInt()
    @Min(5)
    @Max(1440)
    sessionTimeoutMinutes?: number;

    @IsOptional()
    @IsInt()
    @Min(1)
    @Max(20)
    maxConcurrentSessions?: number;

    @IsOptional()
    @IsBoolean()
    killOldestOnLimit?: boolean;

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
