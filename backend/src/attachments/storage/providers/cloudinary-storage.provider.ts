// src/attachments/storage/providers/cloudinary-storage.provider.ts
import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { v2 as cloudinary, UploadApiResponse } from 'cloudinary';
import * as fs from 'fs';
import {
    IFileStorageProvider,
    FileMetadata,
} from '../interfaces/file-storage-provider.interface';

/**
 * Cloudinary Storage Provider
 * 
 * Stores files in Cloudinary for scalable, CDN-backed storage.
 * 
 * SECURITY NOTE: Files are uploaded via "Secure Proxy" pattern -
 * they stream through NestJS after ClamAV/Magic Number validation.
 * Uses upload_stream to pipe validated files to cloud.
 */
@Injectable()
export class CloudinaryStorageProvider implements IFileStorageProvider {
    private readonly logger = new Logger(CloudinaryStorageProvider.name);
    private readonly folder: string;
    private readonly signedUrlExpiration: number;

    constructor(private configService: ConfigService) {
        // Configure Cloudinary
        cloudinary.config({
            cloud_name: this.configService.getOrThrow<string>('CLOUDINARY_CLOUD_NAME'),
            api_key: this.configService.getOrThrow<string>('CLOUDINARY_API_KEY'),
            api_secret: this.configService.getOrThrow<string>('CLOUDINARY_API_SECRET'),
            secure: true,
        });

        // Upload folder structure
        this.folder = this.configService.get<string>(
            'CLOUDINARY_FOLDER',
            'zenith_app/attachments',
        );

        // Signed URL expiration in seconds (default: 1 hour)
        this.signedUrlExpiration = this.configService.get<number>(
            'CLOUDINARY_SIGNED_URL_EXPIRATION',
            3600,
        );

        this.logger.log(`Cloudinary Storage initialized: folder=${this.folder}`);
    }

    /**
     * Determine Cloudinary resource_type from MIME type
     * - image/* -> 'image'
     * - video/* -> 'video'
     * - everything else -> 'raw' (PDFs, docs, zips)
     */
    private getResourceType(mimeType: string): 'image' | 'video' | 'raw' {
        if (mimeType.startsWith('image/')) {
            return 'image';
        }
        if (mimeType.startsWith('video/')) {
            return 'video';
        }
        return 'raw';
    }

    /**
     * Upload file to Cloudinary (Secure Proxy pattern)
     * File is already validated by ClamAV/Magic Numbers before this call
     */
    async upload(filePath: string, metadata: FileMetadata): Promise<string> {
        const resourceType = this.getResourceType(metadata.mimeType);
        const publicId = `${this.folder}/${metadata.filename}`;

        return new Promise<string>((resolve, reject) => {
            const uploadStream = cloudinary.uploader.upload_stream(
                {
                    public_id: publicId,
                    resource_type: resourceType,
                    type: 'authenticated', // Private - requires signed URL
                    overwrite: true,
                    context: {
                        original_name: metadata.originalName,
                        mime_type: metadata.mimeType,
                    },
                },
                (error, result: UploadApiResponse | undefined) => {
                    if (error) {
                        reject(error);
                        return;
                    }

                    if (!result) {
                        reject(new Error('Cloudinary upload returned no result'));
                        return;
                    }

                    this.logger.debug(`Uploaded to Cloudinary: ${result.public_id}`);
                    resolve(result.public_id);
                },
            );

            // Stream the file to Cloudinary
            const fileStream = fs.createReadStream(filePath);
            fileStream.pipe(uploadStream);

            // Delete local temp file after stream completes
            fileStream.on('end', async () => {
                try {
                    await fs.promises.unlink(filePath);
                } catch {
                    // Ignore deletion errors
                }
            });
        });
    }

    /**
     * Get signed download URL (private/authenticated delivery)
     * URL expires after configured time to prevent sharing
     */
    async getDownloadUrl(publicId: string): Promise<string> {
        // Determine resource type from public_id (stored in context)
        // Default to 'raw' for safety
        const resourceType = this.inferResourceType(publicId);

        const url = cloudinary.url(publicId, {
            resource_type: resourceType,
            type: 'authenticated',
            sign_url: true,
            expires_at: Math.floor(Date.now() / 1000) + this.signedUrlExpiration,
        });

        return url;
    }

    /**
     * Delete file from Cloudinary
     */
    async delete(publicId: string): Promise<void> {
        const resourceType = this.inferResourceType(publicId);

        await cloudinary.uploader.destroy(publicId, {
            resource_type: resourceType,
            type: 'authenticated',
        });

        this.logger.debug(`Deleted from Cloudinary: ${publicId}`);
    }

    /**
     * Check if file exists in Cloudinary
     */
    async exists(publicId: string): Promise<boolean> {
        try {
            const resourceType = this.inferResourceType(publicId);
            await cloudinary.api.resource(publicId, {
                resource_type: resourceType,
                type: 'authenticated',
            });
            return true;
        } catch (error) {
            if (error.error?.http_code === 404) {
                return false;
            }
            throw error;
        }
    }

    /**
     * Infer resource type from public_id or file extension
     */
    private inferResourceType(publicId: string): 'image' | 'video' | 'raw' {
        const ext = publicId.split('.').pop()?.toLowerCase();

        const imageExts = ['jpg', 'jpeg', 'png', 'gif', 'webp', 'svg', 'bmp'];
        const videoExts = ['mp4', 'webm', 'mov', 'avi', 'mkv'];

        if (ext && imageExts.includes(ext)) {
            return 'image';
        }
        if (ext && videoExts.includes(ext)) {
            return 'video';
        }
        return 'raw';
    }
}
