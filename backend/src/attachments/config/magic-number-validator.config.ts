// src/attachments/config/magic-number-validator.config.ts
import { BadRequestException } from '@nestjs/common';
import * as fs from 'fs';
import { ALLOWED_MIME_TYPES } from './file-filter.config';

/**
 * SECURITY: Magic Number (Binary Signature) Validation
 * 
 * Detects file type spoofing: ransomware.exe → renamed to safe-image.png
 * Reads actual file header bytes to verify content matches claimed MIME type.
 * 
 * Defense-in-depth layer after Phase 1 MIME whitelist.
 */

// MIME types that have no magic numbers (text-based)
const TEXT_BASED_MIMES = new Set([
    'text/plain',
    'text/csv',
]);

// Map of file-type detected MIME to our allowed set
// Some file-type outputs may differ slightly
const MIME_ALIASES: Record<string, string> = {
    'application/x-zip-compressed': 'application/zip',
};

/**
 * Validate that file's actual content matches claimed MIME type
 * 
 * @param filePath - Absolute path to uploaded file
 * @param claimedMime - MIME type claimed by browser/client
 * @throws BadRequestException if content doesn't match or is dangerous
 */
export async function validateFileMagicNumber(
    filePath: string,
    claimedMime: string,
): Promise<void> {
    // Dynamic import for ESM module
    const { fileTypeFromFile } = await import('file-type');

    // Step 1: Detect actual MIME from file bytes
    const detected = await fileTypeFromFile(filePath);

    // Step 2: Handle text-based files (no magic numbers)
    if (!detected) {
        if (TEXT_BASED_MIMES.has(claimedMime)) {
            // Text files are allowed without magic number validation
            // Phase 1 whitelist already verified the claimed MIME
            return;
        }
        // Non-text file with no detectable signature - suspicious
        await deleteFileQuietly(filePath);
        throw new BadRequestException(
            'Unable to verify file type. File may be corrupted or invalid.',
        );
    }

    // Step 3: Normalize detected MIME (handle aliases)
    const normalizedDetected = MIME_ALIASES[detected.mime] || detected.mime;

    // Step 4: Verify detected MIME is in our allow list
    if (!ALLOWED_MIME_TYPES.has(normalizedDetected)) {
        await deleteFileQuietly(filePath);
        throw new BadRequestException(
            `File content type '${normalizedDetected}' is not allowed. ` +
            `This file appears to be disguised as '${claimedMime}'.`,
        );
    }

    // Step 5: Verify claimed MIME matches detected (prevent spoofing)
    const normalizedClaimed = MIME_ALIASES[claimedMime] || claimedMime;
    if (normalizedDetected !== normalizedClaimed) {
        // Special case: Some office files may have slight MIME variations
        if (!areMimeTypesCompatible(normalizedDetected, normalizedClaimed)) {
            await deleteFileQuietly(filePath);
            throw new BadRequestException(
                `File content mismatch. Claimed: '${claimedMime}', Detected: '${detected.mime}'. ` +
                `This file appears to be disguised.`,
            );
        }
    }
}

/**
 * Check if two MIME types are compatible (same family)
 */
function areMimeTypesCompatible(mime1: string, mime2: string): boolean {
    // Same type
    if (mime1 === mime2) return true;

    // Office document variations
    const officeDocs = [
        'application/msword',
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    ];
    const officeSheets = [
        'application/vnd.ms-excel',
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    ];
    const officeSlides = [
        'application/vnd.ms-powerpoint',
        'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    ];
    const zips = ['application/zip', 'application/x-zip-compressed'];

    const families = [officeDocs, officeSheets, officeSlides, zips];
    for (const family of families) {
        if (family.includes(mime1) && family.includes(mime2)) {
            return true;
        }
    }

    return false;
}

/**
 * Delete file silently (best effort cleanup)
 */
async function deleteFileQuietly(filePath: string): Promise<void> {
    try {
        await fs.promises.unlink(filePath);
    } catch {
        // Ignore deletion errors - file may already be gone
    }
}
