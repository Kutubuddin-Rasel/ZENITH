// src/notifications/dto/cursor-pagination.dto.ts
import { IsOptional, IsString, IsInt, Min, Max } from 'class-validator';
import { Type } from 'class-transformer';

/**
 * CursorPaginationDto
 *
 * SECURITY (Phase 4): Cursor-based pagination for notification feed
 * - Prevents duplicate items in live feeds (stable anchor)
 * - Scalable O(1) performance regardless of history size
 * - Composite cursor (createdAt + id) handles same-millisecond items
 */
export class CursorPaginationDto {
    @IsOptional()
    @IsString()
    cursor?: string;

    @IsOptional()
    @Type(() => Number)
    @IsInt()
    @Min(1)
    @Max(50)
    limit: number = 20;
}

/**
 * Cursor payload interface (Base64 encoded)
 */
export interface CursorPayload {
    createdAt: string; // ISO string
    id: string;
}

/**
 * Paginated response with cursor
 */
export interface CursorPaginatedResult<T> {
    data: T[];
    nextCursor: string | null;
}

/**
 * Encode cursor from notification data
 */
export function encodeCursor(createdAt: Date, id: string): string {
    const payload: CursorPayload = {
        createdAt: createdAt.toISOString(),
        id,
    };
    return Buffer.from(JSON.stringify(payload)).toString('base64');
}

/**
 * Decode cursor to get pagination position
 */
export function decodeCursor(cursor: string): CursorPayload | null {
    try {
        const decoded = Buffer.from(cursor, 'base64').toString('utf-8');
        return JSON.parse(decoded) as CursorPayload;
    } catch {
        return null;
    }
}
