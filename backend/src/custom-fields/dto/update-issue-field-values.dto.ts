// src/custom-fields/dto/update-issue-field-values.dto.ts
import {
    IsArray,
    ValidateNested,
    ArrayMinSize,
    ArrayMaxSize,
} from 'class-validator';
import { Type } from 'class-transformer';
import { UpdateFieldValueDto } from './update-field-value.dto';

/**
 * DTO for batch updating custom field values on an issue
 *
 * Security:
 * - Strict array bounds (1-50 items) to prevent DoS
 * - Nested validation for each child object
 * - @Type decorator ensures proper transformation
 */
export class UpdateIssueFieldValuesDto {
    /**
     * Array of field value updates
     *
     * @ArrayMinSize(1) - At least one update required
     * @ArrayMaxSize(50) - DoS prevention (50 × 10KB = 500KB max)
     * @ValidateNested({ each: true }) - Validate each child object
     * @Type(() => UpdateFieldValueDto) - Transform plain objects to class instances
     */
    @IsArray({ message: 'updates must be an array' })
    @ArrayMinSize(1, { message: 'At least one field update is required' })
    @ArrayMaxSize(50, { message: 'Cannot update more than 50 fields at once' })
    @ValidateNested({ each: true })
    @Type(() => UpdateFieldValueDto)
    updates: UpdateFieldValueDto[];
}
