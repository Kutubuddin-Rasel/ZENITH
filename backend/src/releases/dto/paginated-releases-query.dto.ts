// src/releases/dto/paginated-releases-query.dto.ts
import { Type } from 'class-transformer';
import {
    IsOptional,
    IsInt,
    Min,
    Max,
    IsEnum,
    IsString,
} from 'class-validator';
import { ReleaseStatus } from '../entities/release.entity';

/**
 * Pagination configuration constants
 */
export const PAGINATION_DEFAULTS = {
    PAGE: 1,
    LIMIT: 20,
    MAX_LIMIT: 100,
} as const;

/**
 * Allowed sort fields for releases
 */
export enum ReleaseSortField {
    CREATED_AT = 'createdAt',
    UPDATED_AT = 'updatedAt',
    NAME = 'name',
    RELEASE_DATE = 'releaseDate',
}

/**
 * Sort order direction
 */
export enum SortOrder {
    ASC = 'ASC',
    DESC = 'DESC',
}

/**
 * Query DTO for paginated release listing
 *
 * Handles type transformation from query string (always string)
 * to properly typed values for service layer.
 */
export class PaginatedReleasesQueryDto {
    /**
     * Page number (1-indexed)
     * @example 1
     */
    @IsOptional()
    @Type(() => Number)
    @IsInt({ message: 'Page must be an integer' })
    @Min(1, { message: 'Page must be at least 1' })
    page?: number = PAGINATION_DEFAULTS.PAGE;

    /**
     * Items per page (max 100 to prevent DoS)
     * @example 20
     */
    @IsOptional()
    @Type(() => Number)
    @IsInt({ message: 'Limit must be an integer' })
    @Min(1, { message: 'Limit must be at least 1' })
    @Max(PAGINATION_DEFAULTS.MAX_LIMIT, {
        message: `Limit cannot exceed ${PAGINATION_DEFAULTS.MAX_LIMIT}`,
    })
    limit?: number = PAGINATION_DEFAULTS.LIMIT;

    /**
     * Field to sort by
     * @example "createdAt"
     */
    @IsOptional()
    @IsEnum(ReleaseSortField, {
        message: `Sort field must be one of: ${Object.values(ReleaseSortField).join(', ')}`,
    })
    sortBy?: ReleaseSortField = ReleaseSortField.CREATED_AT;

    /**
     * Sort direction
     * @example "DESC"
     */
    @IsOptional()
    @IsEnum(SortOrder, { message: 'Sort order must be ASC or DESC' })
    sortOrder?: SortOrder = SortOrder.DESC;

    /**
     * Filter by release status
     * @example "released"
     */
    @IsOptional()
    @IsEnum(ReleaseStatus, {
        message: `Status must be one of: ${Object.values(ReleaseStatus).join(', ')}`,
    })
    status?: ReleaseStatus;

    /**
     * Search by release name
     * @example "v1.0"
     */
    @IsOptional()
    @IsString()
    search?: string;
}
