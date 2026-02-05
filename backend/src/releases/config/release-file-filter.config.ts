// src/releases/config/release-file-filter.config.ts
import { BadRequestException } from '@nestjs/common';
import { Request } from 'express';
import { v4 as uuidv4 } from 'uuid';
import sanitize from 'sanitize-filename';

/**
 * SECURITY: Release Artifact MIME Type Whitelist
 * 
 * Release attachments typically include:
 * - Screenshots/Marketing images
 * - Release notes/Documentation (PDFs, text)
 * - Build artifacts (archives: zip, gzip, tar)
 * 
 * Size limit: 50MB (larger than standard attachments)
 */
export const RELEASE_ALLOWED_MIME_TYPES = new Set([
    // Images (Screenshots, Marketing)
    'image/jpeg',
    'image/png',

    // Documents
    'application/pdf',
    'text/plain',

    // Archives (Build Artifacts)
    'application/zip',
    'application/x-zip-compressed',
    'application/gzip',
    'application/x-gzip',
    'application/x-tar',
    'application/x-compressed-tar',
    'application/octet-stream', // Some browsers send archives as this
]);

/**
 * File size limit for release artifacts: 50MB
 */
export const RELEASE_MAX_FILE_SIZE = 50 * 1024 * 1024;

/**
 * Multer file filter for release attachments
 * Rejects files not in the whitelist with a clear error message
 */
export const releaseFileFilter = (
    req: Request,
    file: Express.Multer.File,
    callback: (error: Error | null, acceptFile: boolean) => void,
): void => {
    const mimeType = file.mimetype.toLowerCase();

    if (RELEASE_ALLOWED_MIME_TYPES.has(mimeType)) {
        callback(null, true);
    } else {
        callback(
            new BadRequestException(
                `File type '${mimeType}' is not allowed for release attachments. ` +
                `Allowed: images, PDFs, text, and archives (zip, gzip, tar).`,
            ),
            false,
        );
    }
};

/**
 * Sanitize filename for release artifacts
 * Format: ${uuid}-${sanitizedOriginalName}
 */
export const sanitizeReleaseFilename = (originalName: string): string => {
    // Sanitize the original filename
    let sanitized = sanitize(originalName);

    // Replace spaces with underscores
    sanitized = sanitized.replace(/\s+/g, '_');

    // Truncate to reasonable length (200 chars to leave room for UUID)
    if (sanitized.length > 200) {
        const ext = sanitized.substring(sanitized.lastIndexOf('.'));
        const name = sanitized.substring(0, 200 - ext.length);
        sanitized = name + ext;
    }

    // Handle empty/stripped filenames
    if (!sanitized || sanitized === '.') {
        sanitized = 'release_artifact';
    }

    return `${uuidv4()}-${sanitized}`;
};

/**
 * Multer filename callback for release uploads
 */
export const releaseFilenameCallback = (
    req: Request,
    file: Express.Multer.File,
    callback: (error: Error | null, filename: string) => void,
): void => {
    const safeFilename = sanitizeReleaseFilename(file.originalname);
    callback(null, safeFilename);
};
