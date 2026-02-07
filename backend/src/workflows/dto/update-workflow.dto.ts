import {
    IsString,
    IsOptional,
    IsArray,
    IsBoolean,
    ValidateNested,
    ArrayMaxSize,
    MaxLength,
} from 'class-validator';
import { Type } from 'class-transformer';
import { WorkflowDefinitionDto } from './create-workflow.dto';
import { TriggerConfigDto } from './trigger-config.dto';

/**
 * UpdateWorkflowDto - Validates workflow update requests
 *
 * SECURITY (Phase 3): All fields optional but strictly validated when present.
 */
export class UpdateWorkflowDto {
    @IsOptional()
    @IsString()
    @MaxLength(100)
    name?: string;

    @IsOptional()
    @IsString()
    @MaxLength(1000)
    description?: string;

    @IsOptional()
    @ValidateNested()
    @Type(() => WorkflowDefinitionDto)
    definition?: WorkflowDefinitionDto;

    @IsOptional()
    @IsArray()
    @ValidateNested({ each: true })
    @Type(() => TriggerConfigDto)
    @ArrayMaxSize(10)
    triggers?: TriggerConfigDto[];

    @IsOptional()
    @IsArray()
    @IsString({ each: true })
    @ArrayMaxSize(20)
    tags?: string[];

    @IsOptional()
    @IsString()
    @MaxLength(50)
    category?: string;

    @IsOptional()
    @IsString()
    @MaxLength(50)
    icon?: string;

    @IsOptional()
    @IsString()
    @MaxLength(7)
    color?: string;

    @IsOptional()
    @IsBoolean()
    isActive?: boolean;
}
