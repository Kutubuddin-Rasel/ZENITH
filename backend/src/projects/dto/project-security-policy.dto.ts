import {
    IsBoolean,
    IsInt,
    IsOptional,
    IsArray,
    IsString,
    Max,
    Min,
} from 'class-validator';

export class UpdateProjectSecurityPolicyDto {
    // Authentication Requirements
    @IsOptional()
    @IsBoolean()
    require2FA?: boolean;

    @IsOptional()
    @IsInt()
    @Min(8)
    @Max(128)
    requirePasswordMinLength?: number;

    @IsOptional()
    @IsBoolean()
    requirePasswordComplexity?: boolean;

    @IsOptional()
    @IsInt()
    @Min(0)
    @Max(365)
    passwordMaxAgeDays?: number;

    // Session Requirements
    @IsOptional()
    @IsInt()
    @Min(5)
    @Max(1440)
    maxSessionTimeoutMinutes?: number;

    @IsOptional()
    @IsBoolean()
    enforceSessionTimeout?: boolean;

    // Access Requirements
    @IsOptional()
    @IsBoolean()
    requireIPAllowlist?: boolean;

    @IsOptional()
    @IsArray()
    @IsString({ each: true })
    blockedCountries?: string[];

    // Notification Settings
    @IsOptional()
    @IsBoolean()
    notifyOnPolicyViolation?: boolean;

    @IsOptional()
    @IsBoolean()
    notifyOnAccessDenied?: boolean;
}
