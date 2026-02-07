// src/backlog/dto/backlog-query.dto.ts
import { Type } from 'class-transformer';
import { IsOptional, IsInt, Min, Max } from 'class-validator';

/**
 * Backlog-specific pagination defaults
 * Higher limits than standard tables due to UX needs (prioritization requires density)
 */
export const BACKLOG_PAGINATION = {
    DEFAULT_LIMIT: 50,
    MAX_LIMIT: 200,
} as const;

/**
 * Query DTO for paginated backlog retrieval
 */
export class BacklogQueryDto {
    /**
     * Page number (1-indexed)
     * @example 1
     */
    @IsOptional()
    @Type(() => Number)
    @IsInt({ message: 'Page must be an integer' })
    @Min(1, { message: 'Page must be at least 1' })
    page?: number = 1;

    /**
     * Items per page (max 200 for backlog density)
     * @example 50
     */
    @IsOptional()
    @Type(() => Number)
    @IsInt({ message: 'Limit must be an integer' })
    @Min(1, { message: 'Limit must be at least 1' })
    @Max(BACKLOG_PAGINATION.MAX_LIMIT, {
        message: `Limit cannot exceed ${BACKLOG_PAGINATION.MAX_LIMIT}`,
    })
    limit?: number = BACKLOG_PAGINATION.DEFAULT_LIMIT;
}

/**
 * Pagination metadata for backlog response
 */
export interface BacklogPaginationMeta {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
    hasNextPage: boolean;
    hasPrevPage: boolean;
}

/**
 * Paginated backlog response
 */
export interface PaginatedBacklogResponse<T> {
    data: T[];
    meta: BacklogPaginationMeta;
}

/**
 * Factory to create paginated response
 */
export function createBacklogPaginatedResponse<T>(
    data: T[],
    page: number,
    limit: number,
    total: number,
): PaginatedBacklogResponse<T> {
    const totalPages = Math.ceil(total / limit);
    return {
        data,
        meta: {
            page,
            limit,
            total,
            totalPages,
            hasNextPage: page < totalPages,
            hasPrevPage: page > 1,
        },
    };
}
