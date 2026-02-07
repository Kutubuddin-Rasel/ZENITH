import {
    IsString,
    IsUUID,
    IsOptional,
    IsNotEmpty,
    IsArray,
    IsBoolean,
    ValidateNested,
    ArrayMaxSize,
    MaxLength,
} from 'class-validator';
import { Type } from 'class-transformer';
import { WorkflowNodeDto, WorkflowConnectionDto } from './workflow-node.dto';
import { TriggerConfigDto } from './trigger-config.dto';

/**
 * WorkflowDefinitionDto - Validates the complete workflow graph structure
 *
 * SECURITY (Phase 3): Nested validation ensures all nodes and connections
 * are validated before reaching business logic.
 */
export class WorkflowDefinitionDto {
    /**
     * Workflow nodes - maximum 100 nodes per workflow
     */
    @IsArray()
    @ValidateNested({ each: true })
    @Type(() => WorkflowNodeDto)
    @ArrayMaxSize(100)
    nodes: WorkflowNodeDto[];

    /**
     * Connections between nodes - maximum 200 connections
     */
    @IsArray()
    @ValidateNested({ each: true })
    @Type(() => WorkflowConnectionDto)
    @ArrayMaxSize(200)
    connections: WorkflowConnectionDto[];
}

/**
 * CreateWorkflowDto - Validates workflow creation requests
 *
 * SECURITY (Phase 3): Strict validation eliminates `any` types.
 * All nested structures are recursively validated.
 */
export class CreateWorkflowDto {
    @IsUUID()
    projectId: string;

    @IsString()
    @IsNotEmpty()
    @MaxLength(100)
    name: string;

    @IsOptional()
    @IsString()
    @MaxLength(1000)
    description?: string;

    /**
     * Complete workflow definition with nodes and connections
     */
    @ValidateNested()
    @Type(() => WorkflowDefinitionDto)
    definition: WorkflowDefinitionDto;

    /**
     * Workflow triggers configuration
     */
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
    @MaxLength(7) // #RRGGBB
    color?: string;
}
