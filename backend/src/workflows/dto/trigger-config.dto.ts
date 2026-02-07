import {
    IsString,
    IsOptional,
    IsNotEmpty,
    IsObject,
    IsArray,
    ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';

/**
 * ConditionDto - Validates JSON Logic conditions
 *
 * SECURITY: Conditions must be JSON Logic objects (Phase 1 RCE fix).
 * String-based JavaScript conditions are no longer accepted.
 */
export class ConditionDto {
    /**
     * The JSON Logic rule object
     * Example: { "==": [{ "var": "status" }, "open"] }
     */
    @IsObject()
    rule: Record<string, unknown>;
}

/**
 * TriggerConfigDto - Validates workflow trigger configuration
 *
 * SECURITY (Phase 3): Strict validation of trigger types and conditions.
 */
export class TriggerConfigDto {
    @IsString()
    @IsNotEmpty()
    type: string;

    /**
     * Trigger-specific configuration
     * Examples: cron schedule, event filter, field matcher
     */
    @IsOptional()
    @IsObject()
    config?: Record<string, unknown>;

    /**
     * Conditions that must be met for trigger to fire
     * Uses JSON Logic format (not JavaScript strings)
     */
    @IsOptional()
    @IsArray()
    @ValidateNested({ each: true })
    @Type(() => ConditionDto)
    conditions?: ConditionDto[];
}
