// src/attachments/config/filename-sanitizer.config.ts
import sanitize from 'sanitize-filename';
import { randomUUID } from 'crypto';
import * as path from 'path';

/**
 * SECURITY: Filename Sanitization for File Uploads
 * 
 * Strips dangerous characters:
 * - Path traversal: ../, ./
 * - Windows forbidden: < > : " / \ | ? *
 * - Control characters including NULL bytes
 * - Leading/trailing spaces and dots
 * 
 * Preserves file extension for debugging and content-type detection.
 */

// Maximum filename length (ext4 limit is 255 bytes)
const MAX_FILENAME_LENGTH = 200; // Leave room for UUID prefix

/**
 * Sanitize a filename for safe filesystem storage
 * - Strips dangerous characters via sanitize-filename
 * - Replaces spaces with underscores
 * - Truncates to safe length
 */
export function sanitizeUploadFilename(originalFilename: string): string {
    // Step 1: Use sanitize-filename library (strips dangerous chars)
    let sanitized = sanitize(originalFilename);

    // Step 2: Replace spaces with underscores (cleaner URLs)
    sanitized = sanitized.replace(/\s+/g, '_');

    // Step 3: Remove leading/trailing dots and underscores
    sanitized = sanitized.replace(/^[._]+|[._]+$/g, '');

    // Step 4: Truncate if too long (preserve extension)
    if (sanitized.length > MAX_FILENAME_LENGTH) {
        const ext = path.extname(sanitized);
        const name = path.basename(sanitized, ext);
        const maxNameLength = MAX_FILENAME_LENGTH - ext.length;
        sanitized = name.slice(0, maxNameLength) + ext;
    }

    // Step 5: Fallback if everything was stripped
    if (!sanitized || sanitized.length === 0) {
        sanitized = 'file';
    }

    return sanitized;
}

/**
 * Generate a unique, safe filename for disk storage
 * Pattern: ${uuid}-${sanitizedFilename}
 * 
 * @param originalFilename - The original filename from the user
 * @returns Safe filename with UUID prefix for uniqueness
 */
export function generateSafeFilename(originalFilename: string): string {
    const uuid = randomUUID();
    const sanitized = sanitizeUploadFilename(originalFilename);
    return `${uuid}-${sanitized}`;
}

/**
 * Multer filename callback using safe generation
 */
export const safeFilenameCallback = (
    _req: Express.Request,
    file: Express.Multer.File,
    cb: (error: Error | null, filename: string) => void,
): void => {
    const safeFilename = generateSafeFilename(file.originalname);
    cb(null, safeFilename);
};
