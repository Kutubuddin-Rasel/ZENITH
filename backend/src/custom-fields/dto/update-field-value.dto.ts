// src/custom-fields/dto/update-field-value.dto.ts
import { IsUUID, IsString, MaxLength, IsNotEmpty } from 'class-validator';

/**
 * DTO for a single custom field value update
 *
 * Security:
 * - fieldId must be valid UUID v4
 * - value is strictly typed as string with length limit
 */
export class UpdateFieldValueDto {
    /**
     * The custom field definition ID
     * Must be a valid UUID v4
     */
    @IsUUID('4', { message: 'fieldId must be a valid UUID v4' })
    @IsNotEmpty({ message: 'fieldId is required' })
    fieldId: string;

    /**
     * The value to set for the custom field
     * Max 10,000 characters to prevent payload abuse
     * Empty strings are allowed (for clearing fields)
     */
    @IsString({ message: 'value must be a string' })
    @MaxLength(10000, { message: 'value must not exceed 10,000 characters' })
    value: string;
}
