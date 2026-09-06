// src/email/ports/download-link.port.ts

/**
 * Outbound port for minting time-limited download URLs for emailed artifacts.
 *
 * WHY THIS EXISTS — it is a bug fix expressed as a type.
 *
 * The report email previously rendered "valid for {{expiresInHours}} hours"
 * (48) while calling `S3StorageProvider.getDownloadUrl(key)` — a signature with
 * NO ttl parameter, which signs using `AWS_S3_PRESIGNED_EXPIRATION` (default
 * 900 s). Recipients were told 48 hours and handed a link that died in 15
 * minutes. The copy and the signature had no shared source of truth, so nothing
 * could catch the drift.
 *
 * Here `ttlSeconds` is REQUIRED. A composer cannot mint a link without stating
 * its lifetime, and it derives both the URL and the rendered copy from that one
 * value — so the two can no longer disagree.
 *
 * The port is deliberately narrower than `IFileStorageProvider`: email needs to
 * hand out a read link, never to upload, delete, or stat. Widening the shared
 * storage interface would have rippled into `attachments`; this keeps the change
 * local (the adapter passes the TTL to the concrete S3 provider's optional
 * `ttlSeconds` argument).
 *
 * Bound in `EmailModule` to `S3DownloadLinkAdapter`. Used directly as its own DI
 * token — an abstract class is both a runtime token and an extendable type,
 * matching the notifications module's transport-port convention.
 */
export abstract class DownloadLinkPort {
  /**
   * @param key        Storage object key (e.g. the report's S3/MinIO key).
   * @param ttlSeconds Link lifetime. Required — see the docblock above.
   * @returns A presigned URL valid for exactly `ttlSeconds`.
   */
  abstract createDownloadUrl(key: string, ttlSeconds: number): Promise<string>;
}
