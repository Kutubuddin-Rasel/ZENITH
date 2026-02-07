// src/taxonomy/dto/pagination-query.dto.ts
import { IsInt, IsOptional, IsString, Min, Max, MaxLength } from 'class-validator';
import { Type, Transform } from 'class-transformer';

/**
 * PaginationQueryDto - Standard pagination and search parameters
 *
 * SECURITY (Phase 3-4): Prevents unbounded list and search attacks via:
 * - @Max(100): Caps page size to prevent "Page Stuffing"
 * - @MaxLength(100): Caps search string to prevent CPU abuse
 * - Trim: Normalizes whitespace
 */
export class PaginationQueryDto {
    @IsOptional()
    @Type(() => Number)
    @IsInt()
    @Min(1)
    page: number = 1;

    @IsOptional()
    @Type(() => Number)
    @IsInt()
    @Min(1)
    @Max(100)
    limit: number = 50;

    @IsOptional()
    @IsString()
    @MaxLength(100)
    @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
    search?: string;
}

/**
 * Generic paginated result interface
 */
export interface PaginatedResult<T> {
    data: T[];
    total: number;
    page: number;
    limit: number;
}
