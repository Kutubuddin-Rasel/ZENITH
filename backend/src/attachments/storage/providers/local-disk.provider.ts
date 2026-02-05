// src/attachments/storage/providers/local-disk.provider.ts
import { Injectable, Logger } from '@nestjs/common';
import * as fs from 'fs';
import * as path from 'path';
import {
    IFileStorageProvider,
    FileMetadata,
} from '../interfaces/file-storage-provider.interface';
import { UPLOADS_ROOT } from '../../config/path-security.config';

/**
 * Local Disk Storage Provider
 * 
 * Stores files on the local filesystem in the uploads/ directory.
 * Used for development and single-server deployments.
 */
@Injectable()
export class LocalDiskProvider implements IFileStorageProvider {
    private readonly logger = new Logger(LocalDiskProvider.name);

    constructor() {
        // Ensure uploads directory exists
        if (!fs.existsSync(UPLOADS_ROOT)) {
            fs.mkdirSync(UPLOADS_ROOT, { recursive: true });
        }
    }

    /**
     * Upload file (file is already on disk from Multer)
     * For local storage, we just return the filename as the key
     */
    async upload(filePath: string, metadata: FileMetadata): Promise<string> {
        // File is already at filePath from Multer, just return the filename as key
        const key = metadata.filename;
        this.logger.debug(`File stored locally: ${key}`);
        return key;
    }

    /**
     * Get download path (local filesystem path)
     */
    async getDownloadUrl(key: string): Promise<string> {
        const filePath = path.join(UPLOADS_ROOT, path.basename(key));
        return filePath;
    }

    /**
     * Delete file from disk
     */
    async delete(key: string): Promise<void> {
        const filePath = path.join(UPLOADS_ROOT, path.basename(key));
        try {
            await fs.promises.unlink(filePath);
            this.logger.debug(`Deleted file: ${key}`);
        } catch (error) {
            if (error.code !== 'ENOENT') {
                throw error;
            }
            // File already doesn't exist - not an error
        }
    }

    /**
     * Check if file exists
     */
    async exists(key: string): Promise<boolean> {
        const filePath = path.join(UPLOADS_ROOT, path.basename(key));
        return fs.existsSync(filePath);
    }
}
