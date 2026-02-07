import {
    IsString,
    IsUUID,
    IsOptional,
    IsNotEmpty,
    IsObject,
    IsNumber,
    Min,
    Max,
} from 'class-validator';

/**
 * WorkflowNodeDto - Validates individual nodes in a workflow graph
 *
 * SECURITY (Phase 3): Strict validation eliminates `any` types.
 * Each node must have a valid structure before reaching service logic.
 */
export class WorkflowNodeDto {
    @IsString()
    @IsNotEmpty()
    id: string;

    @IsString()
    @IsNotEmpty()
    name: string;

    @IsString()
    @IsNotEmpty()
    type: string;

    /**
     * Node configuration - varies by type
     * Future enhancement: discriminated unions per node type
     */
    @IsObject()
    config: Record<string, unknown>;

    /**
     * Node position in visual designer (optional)
     */
    @IsOptional()
    @IsObject()
    position?: {
        x: number;
        y: number;
    };
}

/**
 * WorkflowConnectionDto - Validates connections between nodes
 */
export class WorkflowConnectionDto {
    @IsString()
    @IsNotEmpty()
    id: string;

    @IsString()
    @IsNotEmpty()
    source: string;

    @IsString()
    @IsNotEmpty()
    target: string;

    /**
     * JSON Logic condition for conditional connections
     * SECURITY: Must be object (JSON Logic), NOT string (Phase 1 RCE fix)
     */
    @IsOptional()
    @IsObject()
    condition?: Record<string, unknown>;

    @IsOptional()
    @IsString()
    label?: string;
}
