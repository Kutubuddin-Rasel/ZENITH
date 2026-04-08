// src/attachments/storage/providers/s3-storage.provider.ts
import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  S3Client,
  DeleteObjectCommand,
  HeadObjectCommand,
  GetObjectCommand,
} from '@aws-sdk/client-s3';
import { Upload } from '@aws-sdk/lib-storage';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { Readable } from 'stream';
import * as fs from 'fs';
import {
  IFileStorageProvider,
  FileMetadata,
} from '../interfaces/file-storage-provider.interface';

// ---------------------------------------------------------------------------
// Strict Types (ZERO `any`)
// ---------------------------------------------------------------------------

/** S3 Client configuration resolved from environment */
interface S3ClientConfig {
  region: string;
  credentials: {
    accessKeyId: string;
    secretAccessKey: string;
  };
  endpoint?: string;
  forcePathStyle?: boolean;
}

/** Stream upload options for generated reports */
export interface StreamUploadOptions {
  key: string;
  contentType: string;
  metadata?: Record<string, string>;
}

// ---------------------------------------------------------------------------
// Service
// ---------------------------------------------------------------------------

/**
 * S3-Compatible Storage Provider (AWS S3 / MinIO / DigitalOcean Spaces)
 *
 * ARCHITECTURE:
 * - Uses `@aws-sdk/lib-storage` `Upload` class for multipart streaming.
 *   This pipes data in chunks to S3 without buffering the entire file
 *   in V8 heap — critical for 50MB+ report exports.
 *
 * - Configurable `endpoint` + `forcePathStyle` for MinIO compatibility.
 *   MinIO uses path-style URLs (`host/bucket/key`) instead of AWS's
 *   virtual-hosted style (`bucket.host/key`).
 *
 * - `uploadStream()` accepts a `Readable` stream directly from
 *   PdfExportService/ExcelExportService, enabling zero-copy piping
 *   from report generation to object storage.
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

  constructor(private readonly configService: ConfigService) {
    this.bucket = this.configService.getOrThrow<string>('AWS_S3_BUCKET');
    const region = this.configService.getOrThrow<string>('AWS_S3_REGION');

    // Presigned URL expiration in seconds (default: 15 minutes)
    this.presignedUrlExpiration = this.configService.get<number>(
      'AWS_S3_PRESIGNED_EXPIRATION',
      900,
    );

    // Build S3 client config with optional MinIO overrides
    const clientConfig: S3ClientConfig = {
      region,
      credentials: {
        accessKeyId: this.configService.getOrThrow<string>('AWS_ACCESS_KEY_ID'),
        secretAccessKey: this.configService.getOrThrow<string>(
          'AWS_SECRET_ACCESS_KEY',
        ),
      },
    };

    // MINIO COMPATIBILITY:
    // MinIO requires a custom endpoint URL and path-style addressing.
    // AWS S3 uses virtual-hosted style (bucket.s3.region.amazonaws.com).
    // MinIO uses path-style (http://minio:9000/bucket/key).
    const endpoint = this.configService.get<string>('AWS_ENDPOINT');
    if (endpoint) {
      clientConfig.endpoint = endpoint;
    }

    const forcePathStyle = this.configService.get<string>(
      'AWS_FORCE_PATH_STYLE',
      'false',
    );
    if (forcePathStyle === 'true' || endpoint) {
      // If a custom endpoint is set (MinIO/Spaces), always force path-style
      clientConfig.forcePathStyle = true;
    }

    this.s3Client = new S3Client(clientConfig);

    this.logger.log(
      `S3 Storage initialized: s3://${this.bucket} (${region})` +
        (endpoint ? ` [endpoint: ${endpoint}]` : ''),
    );
  }

  // -----------------------------------------------------------------------
  // IFileStorageProvider implementation
  // -----------------------------------------------------------------------

  /**
   * Upload file from disk to S3 via streaming multipart upload.
   *
   * MEMORY SAFETY:
   * Uses `@aws-sdk/lib-storage` `Upload` which chunks the `Readable`
   * stream into configurable parts (default 5MB) and uploads them
   * concurrently. V8 heap usage stays O(part_size), not O(file_size).
   *
   * File is already validated by ClamAV/Magic Numbers before this call.
   */
  async upload(filePath: string, metadata: FileMetadata): Promise<string> {
    const key = `attachments/${metadata.filename}`;
    const fileStream = fs.createReadStream(filePath);

    await this.executeStreamUpload(fileStream, {
      key,
      contentType: metadata.mimeType,
      metadata: {
        'original-name': encodeURIComponent(metadata.originalName),
        'uploaded-at': new Date().toISOString(),
      },
    });

    this.logger.debug(`Uploaded to S3: ${key}`);

    // Delete local temp file after successful upload
    try {
      await fs.promises.unlink(filePath);
    } catch {
      // Ignore deletion errors — temp dir cleanup handles stragglers
    }

    return key;
  }

  /**
   * Get presigned download URL (expires in 15 minutes by default).
   * Prevents long-lived link sharing.
   */
  async getDownloadUrl(key: string): Promise<string> {
    const command = new GetObjectCommand({
      Bucket: this.bucket,
      Key: key,
    });

    return getSignedUrl(this.s3Client, command, {
      expiresIn: this.presignedUrlExpiration,
    });
  }

  /**
   * Delete object from S3.
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
   * Check if object exists in S3.
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
    } catch (error: unknown) {
      const s3Error = error as {
        name?: string;
        $metadata?: { httpStatusCode?: number };
      };
      if (
        s3Error.name === 'NotFound' ||
        s3Error.$metadata?.httpStatusCode === 404
      ) {
        return false;
      }
      throw error;
    }
  }

  // -----------------------------------------------------------------------
  // Extended: Stream Upload (for report exports)
  // -----------------------------------------------------------------------

  /**
   * Upload a Readable stream directly to S3 — no temp files needed.
   *
   * USAGE:
   * Used by ScheduledReportsProcessor to pipe PDF/Excel streams
   * directly from export services to MinIO/S3.
   *
   * MEMORY SAFETY:
   * Stream → Upload (5MB chunks) → S3. Total heap: O(5MB), not O(file_size).
   *
   * @param stream - Readable stream from PdfExportService/ExcelExportService
   * @param options - Target key, content type, optional metadata
   * @returns S3 object key for persistence
   */
  async uploadStream(
    stream: Readable,
    options: StreamUploadOptions,
  ): Promise<string> {
    await this.executeStreamUpload(stream, options);

    this.logger.debug(`Stream uploaded to S3: ${options.key}`);
    return options.key;
  }

  // -----------------------------------------------------------------------
  // Internal: Multipart Upload Engine
  // -----------------------------------------------------------------------

  /**
   * Core multipart streaming upload via @aws-sdk/lib-storage.
   *
   * ARCHITECTURE:
   * The `Upload` class from `@aws-sdk/lib-storage` implements the
   * S3 Multipart Upload API transparently:
   *
   * 1. Buffers the stream into `partSize` chunks (default 5MB)
   * 2. Uploads each chunk as a separate S3 part (concurrent)
   * 3. Completes the multipart upload when stream ends
   *
   * This keeps V8 heap at O(partSize × queueSize), not O(file_size).
   * For a 50MB report: 10 × 5MB parts uploaded 4-at-a-time = 20MB peak.
   */
  private async executeStreamUpload(
    body: Readable,
    options: StreamUploadOptions,
  ): Promise<void> {
    const upload = new Upload({
      client: this.s3Client,
      params: {
        Bucket: this.bucket,
        Key: options.key,
        Body: body,
        ContentType: options.contentType,
        Metadata: options.metadata,
      },
      // Multipart tuning
      queueSize: 4, // Concurrent part uploads
      partSize: 1024 * 1024 * 5, // 5MB per part (S3 minimum)
      leavePartsOnError: false, // Clean up incomplete parts on failure
    });

    await upload.done();
  }
}
