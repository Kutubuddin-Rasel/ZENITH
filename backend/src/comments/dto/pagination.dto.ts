// src/comments/dto/pagination.dto.ts
import { Type } from 'class-transformer';
import { IsInt, IsOptional, Min, Max } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Comment } from '../entities/comment.entity';

/**
 * PAGINATION: Offset-based pagination for comments
 * - Default: page 1, limit 20
 * - Hard limit: 100 items per request (DoS protection)
 */
export class PaginationQueryDto {
    @ApiPropertyOptional({ description: 'Page number (1-indexed)', default: 1 })
    @Type(() => Number)
    @IsInt()
    @Min(1)
    @IsOptional()
    page: number = 1;

    @ApiPropertyOptional({ description: 'Items per page (max 100)', default: 20 })
    @Type(() => Number)
    @IsInt()
    @Min(1)
    @Max(100, { message: 'Limit cannot exceed 100 items per request' })
    @IsOptional()
    limit: number = 20;
}

/**
 * Pagination metadata in response
 */
export class PaginationMeta {
    @ApiProperty({ description: 'Total number of items' })
    total: number;

    @ApiProperty({ description: 'Current page number' })
    page: number;

    @ApiProperty({ description: 'Items per page' })
    limit: number;

    @ApiProperty({ description: 'Total number of pages' })
    totalPages: number;

    @ApiProperty({ description: 'Whether there is a next page' })
    hasNextPage: boolean;

    @ApiProperty({ description: 'Whether there is a previous page' })
    hasPrevPage: boolean;
}

/**
 * Paginated response wrapper for comments
 */
export class PaginatedCommentsDto {
    @ApiProperty({ type: [Comment], description: 'Array of comments' })
    data: Comment[];

    @ApiProperty({ type: PaginationMeta, description: 'Pagination metadata' })
    meta: PaginationMeta;
}
