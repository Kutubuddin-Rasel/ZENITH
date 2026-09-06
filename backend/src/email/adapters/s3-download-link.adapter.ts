// src/email/adapters/s3-download-link.adapter.ts
import { Injectable } from '@nestjs/common';
import { S3StorageProvider } from '../../attachments/storage/providers/s3-storage.provider';
import { DownloadLinkPort } from '../ports/download-link.port';

/**
 * Binds `DownloadLinkPort` to the concrete S3/MinIO provider.
 *
 * WHY THE CONCRETE PROVIDER AND NOT `FILE_STORAGE_PROVIDER`: the generic
 * storage token resolves by `STORAGE_PROVIDER` config, which in a `local`
 * deployment yields `LocalDiskProvider` — whose `getDownloadUrl` returns a
 * filesystem path, useless in an email. Report artifacts are always written to
 * S3 by `ScheduledReportsProcessor.uploadStream` (an S3-only method), so the
 * read side must resolve against the same backend. Pairing them is correct, not
 * a shortcut.
 *
 * The concrete coupling is now contained to this one file, behind a port —
 * previously `EmailProcessor` injected `S3StorageProvider` directly.
 *
 * ponytail: hardcoded to S3 because report upload is hardcoded to S3. If
 * reports ever writes through `FILE_STORAGE_PROVIDER`, change both together.
 */
@Injectable()
export class S3DownloadLinkAdapter extends DownloadLinkPort {
  constructor(private readonly s3: S3StorageProvider) {
    super();
  }

  createDownloadUrl(key: string, ttlSeconds: number): Promise<string> {
    return this.s3.getDownloadUrl(key, ttlSeconds);
  }
}
