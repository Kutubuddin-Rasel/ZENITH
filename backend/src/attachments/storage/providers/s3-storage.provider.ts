// src/attachments/storage/providers/s3-storage.provider.ts
import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
    S3Client,
    PutObjectCommand,
    DeleteObjectCommand,
    HeadObjectCommand,
    GetObjectCommand,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import * as fs from 'fs';
import {
    IFileStorageProvider,
    FileMetadata,
} from '../interfaces/file-storage-provider.interface';

/**
 * AWS S3 Storage Provider
 * 
 * Stores files in AWS S3 for scalable, durable object storage.
 * Used for production multi-server deployments.
 * 
 * SECURITY NOTE: Files are uploaded via "Secure Proxy" pattern -
 * they stream through NestJS after ClamAV/Magic Number validation.
 */
@Injectable()
export class S3StorageProvider implements IFileStorageProvider {
    private readonly logger = new Logger(S3StorageProvider.name);
    private readonly s3Client: S3Client;
    private readonly bucket: string;
    private readonly presignedUrlExpiration: number;

    constructor(private configService: ConfigService) {
        this.bucket = this.configService.getOrThrow<string>('AWS_S3_BUCKET');
        const region = this.configService.getOrThrow<string>('AWS_S3_REGION');

        // Presigned URL expiration in seconds (default: 15 minutes)
        this.presignedUrlExpiration = this.configService.get<number>(
            'AWS_S3_PRESIGNED_EXPIRATION',
            900,
        );

        this.s3Client = new S3Client({
            region,
            credentials: {
                accessKeyId: this.configService.getOrThrow<string>('AWS_ACCESS_KEY_ID'),
                secretAccessKey: this.configService.getOrThrow<string>('AWS_SECRET_ACCESS_KEY'),
            },
        });

        this.logger.log(`S3 Storage initialized: s3://${this.bucket} (${region})`);
    }

    /**
     * Upload file to S3 (Secure Proxy pattern)
     * File is already validated by ClamAV/Magic Numbers before this call
     */
    async upload(filePath: string, metadata: FileMetadata): Promise<string> {
        const key = `attachments/${metadata.filename}`;
        const fileStream = fs.createReadStream(filePath);

        await this.s3Client.send(
            new PutObjectCommand({
                Bucket: this.bucket,
                Key: key,
                Body: fileStream,
                ContentType: metadata.mimeType,
                Metadata: {
                    'original-name': encodeURIComponent(metadata.originalName),
                    'uploaded-at': new Date().toISOString(),
                },
            }),
        );

        this.logger.debug(`Uploaded to S3: ${key}`);

        // Delete local temp file after successful S3 upload
        try {
            await fs.promises.unlink(filePath);
        } catch {
            // Ignore deletion errors
        }

        return key;
    }

    /**
     * Get presigned download URL (expires in 15 minutes by default)
     * Prevents long-lived link sharing
     */
    async getDownloadUrl(key: string): Promise<string> {
        const command = new GetObjectCommand({
            Bucket: this.bucket,
            Key: key,
        });

        const url = await getSignedUrl(this.s3Client, command, {
            expiresIn: this.presignedUrlExpiration,
        });

        return url;
    }

    /**
     * Delete object from S3
     */
    async delete(key: string): Promise<void> {
        await this.s3Client.send(
            new DeleteObjectCommand({
                Bucket: this.bucket,
                Key: key,
            }),
        );

        this.logger.debug(`Deleted from S3: ${key}`);
    }

    /**
     * Check if object exists in S3
     */
    async exists(key: string): Promise<boolean> {
        try {
            await this.s3Client.send(
                new HeadObjectCommand({
                    Bucket: this.bucket,
                    Key: key,
                }),
            );
            return true;
        } catch (error) {
            if (error.name === 'NotFound' || error.$metadata?.httpStatusCode === 404) {
                return false;
            }
            throw error;
        }
    }
}
