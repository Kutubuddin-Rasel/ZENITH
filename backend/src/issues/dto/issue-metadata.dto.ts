import {
    IsString,
    IsOptional,
    IsObject,
    ValidateNested,
    IsNumber,
} from 'class-validator';
import { Type } from 'class-transformer';

/**
 * Strict interface for Issue metadata - replaces Record<string, any>
 * Used by both Entity and DTOs for type safety
 */
export interface IssueMetadata {
    // Generic fields
    customFields?: Record<string, string | number | boolean>;
    externalIds?: ExternalIdDto[];
    importSource?: string;

    // GitHub integration fields
    githubPrNumber?: number;
    githubRepo?: string;
    githubUrl?: string;

    // Jira integration fields
    jiraKey?: string;
    jiraId?: string;
    jiraLink?: string;
}

/**
 * DTO for external ID references (e.g., Jira, GitHub)
 */
export class ExternalIdDto {
    @IsString()
    source: string;

    @IsString()
    id: string;
}

/**
 * DTO for Issue metadata with nested validation
 * Use with @ValidateNested() and @Type() in parent DTOs
 * Unknown properties are stripped by class-transformer
 */
export class IssueMetadataDto implements IssueMetadata {
    @IsOptional()
    @IsObject()
    customFields?: Record<string, string | number | boolean>;

    @IsOptional()
    @ValidateNested({ each: true })
    @Type(() => ExternalIdDto)
    externalIds?: ExternalIdDto[];

    @IsOptional()
    @IsString()
    importSource?: string;

    // GitHub integration fields
    @IsOptional()
    @IsNumber()
    githubPrNumber?: number;

    @IsOptional()
    @IsString()
    githubRepo?: string;

    @IsOptional()
    @IsString()
    githubUrl?: string;

    // Jira integration fields
    @IsOptional()
    @IsString()
    jiraKey?: string;

    @IsOptional()
    @IsString()
    jiraId?: string;

    @IsOptional()
    @IsString()
    jiraLink?: string;
}
