// src/attachments/config/path-security.config.ts
import { ForbiddenException } from '@nestjs/common';
import * as path from 'path';
import * as fs from 'fs';

/**
 * SECURITY: Path Traversal Defense (Jail Check)
 * 
 * Prevents Local File Inclusion (LFI) attacks by ensuring:
 * 1. Filename is stripped to basename (removes ../)
 * 2. Resolved path stays within UPLOADS_ROOT
 * 3. Symlinks are resolved and re-validated
 * 
 * Defense-in-depth: Even if DB is compromised, files outside
 * uploads/ cannot be accessed.
 */

// Absolute path to uploads directory (the "jail")
export const UPLOADS_ROOT = path.resolve(process.cwd(), 'uploads');

/**
 * Resolve a filename to a safe absolute path within uploads directory
 * 
 * @param filename - Filename from database (potentially malicious)
 * @returns Absolute path guaranteed to be within UPLOADS_ROOT
 * @throws ForbiddenException if path traversal detected
 */
export function resolveSafeFilePath(filename: string): string {
    // Step 1: Strip to basename (removes any directory components)
    // This neutralizes ../../malicious.sh → malicious.sh
    const basename = path.basename(filename);

    // Step 2: Reject empty or suspicious basenames
    if (!basename || basename === '.' || basename === '..') {
        throw new ForbiddenException('Invalid filename');
    }

    // Step 3: Join with uploads root
    const joinedPath = path.join(UPLOADS_ROOT, basename);

    // Step 4: Resolve to absolute path (canonicalize)
    const resolvedPath = path.resolve(joinedPath);

    // Step 5: JAIL CHECK - Verify path is child of uploads root
    if (!resolvedPath.startsWith(UPLOADS_ROOT + path.sep)) {
        throw new ForbiddenException('Path traversal detected');
    }

    // Step 6: Check file exists before symlink resolution
    if (!fs.existsSync(resolvedPath)) {
        return resolvedPath; // Let caller handle 404
    }

    // Step 7: Resolve symlinks and re-validate jail
    try {
        const realPath = fs.realpathSync(resolvedPath);
        if (!realPath.startsWith(UPLOADS_ROOT + path.sep)) {
            // Symlink points outside jail - security violation
            throw new ForbiddenException('Invalid file reference');
        }
        return realPath;
    } catch (err) {
        if (err instanceof ForbiddenException) {
            throw err;
        }
        // File doesn't exist or other error - return joined path
        return resolvedPath;
    }
}

/**
 * Validate that a path is safe for file operations
 * Use this for any file operation involving user-controlled data
 */
export function isPathWithinUploads(filePath: string): boolean {
    const resolved = path.resolve(filePath);
    return resolved.startsWith(UPLOADS_ROOT + path.sep);
}
