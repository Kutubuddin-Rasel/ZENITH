// src/releases/dto/paginated-response.dto.ts

/**
 * Pagination metadata (GitHub/GitLab style)
 */
export interface PaginationMeta {
    /** Current page (1-indexed) */
    page: number;

    /** Items per page */
    limit: number;

    /** Total number of items */
    total: number;

    /** Total number of pages */
    totalPages: number;

    /** Whether there is a next page */
    hasNextPage: boolean;

    /** Whether there is a previous page */
    hasPrevPage: boolean;
}

/**
 * Generic paginated response wrapper
 *
 * @template T - The type of items in the data array
 */
export interface PaginatedResponse<T> {
    /** Array of items for current page */
    data: T[];

    /** Pagination metadata */
    meta: PaginationMeta;
}

/**
 * Factory function to create pagination metadata
 */
export function createPaginationMeta(
    page: number,
    limit: number,
    total: number,
): PaginationMeta {
    const totalPages = Math.ceil(total / limit);

    return {
        page,
        limit,
        total,
        totalPages,
        hasNextPage: page < totalPages,
        hasPrevPage: page > 1,
    };
}

/**
 * Factory function to create paginated response
 */
export function createPaginatedResponse<T>(
    data: T[],
    page: number,
    limit: number,
    total: number,
): PaginatedResponse<T> {
    return {
        data,
        meta: createPaginationMeta(page, limit, total),
    };
}
