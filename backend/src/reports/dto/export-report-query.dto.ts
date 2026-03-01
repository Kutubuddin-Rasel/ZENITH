/**
 * Export Report Query DTO — validates export request parameters.
 *
 * Ensures format is strictly one of the supported types,
 * preventing injection of arbitrary values.
 */
import { IsEnum, IsOptional, IsString } from 'class-validator';

/** Supported export formats */
export enum ExportFormat {
    XLSX = 'xlsx',
    PDF = 'pdf',
}

/** Supported report types for export */
export enum ReportType {
    VELOCITY = 'velocity',
    BURNDOWN = 'burndown',
    CUMULATIVE_FLOW = 'cumulative-flow',
    EPIC_PROGRESS = 'epic-progress',
    ISSUE_BREAKDOWN = 'issue-breakdown',
}

export class ExportReportQueryDto {
    @IsEnum(ExportFormat, {
        message: `format must be one of: ${Object.values(ExportFormat).join(', ')}`,
    })
    format: ExportFormat;

    /** Optional sprint ID for burndown exports */
    @IsOptional()
    @IsString()
    sprintId?: string;

    /** Optional days parameter for cumulative flow */
    @IsOptional()
    @IsString()
    days?: string;
}
