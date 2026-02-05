// src/attachments/storage/interfaces/file-storage-provider.interface.ts

/**
 * File metadata for storage operations
 */
export interface FileMetadata {
    filename: string;
    originalName: string;
    mimeType: string;
    size: number;
}

/**
 * Storage Provider Interface
 * 
 * Abstraction layer for file storage (Local Disk / AWS S3)
 * Enables swappable storage backends while maintaining security contracts.
 */
export interface IFileStorageProvider {
    /**
     * Upload a file to storage
     * 
     * @param filePath - Local path to file (already validated by ClamAV/Magic Number)
     * @param metadata - File metadata
     * @returns Storage key/path for the file
     */
    upload(filePath: string, metadata: FileMetadata): Promise<string>;

    /**
     * Get a download URL for a file
     * 
     * @param key - Storage key returned from upload
     * @returns URL or path for downloading (presigned URL for S3)
     */
    getDownloadUrl(key: string): Promise<string>;

    /**
     * Delete a file from storage
     * 
     * @param key - Storage key
     */
    delete(key: string): Promise<void>;

    /**
     * Check if a file exists
     * 
     * @param key - Storage key
     */
    exists(key: string): Promise<boolean>;
}

/**
 * Injection token for the storage provider
 */
export const FILE_STORAGE_PROVIDER = 'FILE_STORAGE_PROVIDER';
