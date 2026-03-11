import { Transform, TransformCallback } from 'stream';

// =============================================================================
// EXPORT DTO (Strictly Typed — Zero `any`)
// =============================================================================

/**
 * Shape of each JSON object written to the export stream.
 *
 * This DTO strips the TypeORM entity class overhead and normalizes
 * nullable fields to `null` for clean JSON output. It also parses
 * JSON string columns (`details`, `oldValues`, `newValues`, `metadata`)
 * back into proper objects for consumption by compliance tools.
 */
export interface AuditLogExportDto {
  id: string;
  organizationId: string;
  eventType: string;
  severity: string;
  status: string;
  description: string;
  details: Record<string, unknown> | null;
  oldValues: Record<string, unknown> | null;
  newValues: Record<string, unknown> | null;
  userId: string | null;
  userEmail: string | null;
  userName: string | null;
  resourceType: string | null;
  resourceId: string | null;
  projectId: string | null;
  ipAddress: string | null;
  userAgent: string | null;
  sessionId: string | null;
  requestId: string | null;
  country: string | null;
  city: string | null;
  region: string | null;
  metadata: Record<string, unknown> | null;
  correlationId: string | null;
  timestamp: string;
  isRetained: boolean;
  isEncrypted: boolean;
}

// =============================================================================
// RAW ROW TYPE (TypeORM `.stream()` output shape)
// =============================================================================

/**
 * TypeORM `.stream()` returns raw database rows as plain objects.
 * This interface defines the expected column types from PostgreSQL,
 * eliminating the `any` that TypeORM streams notoriously produce.
 *
 * Column names use the entity alias prefix (e.g., `audit_id`).
 */
interface RawAuditRow {
  audit_id: string;
  audit_organizationId: string;
  audit_eventType: string;
  audit_severity: string;
  audit_status: string;
  audit_description: string;
  audit_details: string | null;
  audit_oldValues: string | null;
  audit_newValues: string | null;
  audit_userId: string | null;
  audit_userEmail: string | null;
  audit_userName: string | null;
  audit_resourceType: string | null;
  audit_resourceId: string | null;
  audit_projectId: string | null;
  audit_ipAddress: string | null;
  audit_userAgent: string | null;
  audit_sessionId: string | null;
  audit_requestId: string | null;
  audit_country: string | null;
  audit_city: string | null;
  audit_region: string | null;
  audit_metadata: string | null;
  audit_correlationId: string | null;
  audit_timestamp: string | Date;
  audit_isRetained: boolean;
  audit_isEncrypted: boolean;
}

// =============================================================================
// TRANSFORM STREAM
// =============================================================================

/**
 * AuditJsonTransformStream
 *
 * A custom Node.js Transform stream that:
 * 1. Receives raw database rows from TypeORM's `.stream()`
 * 2. Maps them to strictly-typed `AuditLogExportDto` objects
 * 3. Outputs valid JSON array formatting: `[\n{...},\n{...}\n]`
 *
 * BACKPRESSURE: Handled by Node.js stream infrastructure. If the
 * downstream consumer (HTTP response) is slow, Transform pauses
 * automatically, which pauses the upstream DB read stream.
 *
 * JSON FORMATTING:
 * - `_construct()` → pushes `[\n` (opening bracket)
 * - Each `_transform()` → pushes `,\n` separator (except first) + JSON chunk
 * - `_flush()` → pushes `\n]` (closing bracket)
 */
export class AuditJsonTransformStream extends Transform {
  private isFirstChunk = true;

  constructor() {
    super({
      objectMode: true, // Input: objects from TypeORM stream
      highWaterMark: 64, // Limit buffered objects to 64 (backpressure tuning)
    });
  }

  /**
   * Called once when the stream is constructed.
   * Pushes the JSON array opening bracket.
   */
  override _construct(callback: (error?: Error | null) => void): void {
    this.push('[\n');
    callback();
  }

  /**
   * Transform a raw DB row into a JSON string chunk.
   *
   * The row arrives as a plain object from TypeORM's ReadStream.
   * We cast it through `RawAuditRow` for type safety, transform
   * it into `AuditLogExportDto`, then serialize to JSON.
   */
  override _transform(
    chunk: unknown,
    _encoding: BufferEncoding,
    callback: TransformCallback,
  ): void {
    try {
      const raw = chunk as RawAuditRow;
      const dto = this.mapRowToDto(raw);
      const json = JSON.stringify(dto, null, 2);

      if (this.isFirstChunk) {
        this.push(json);
        this.isFirstChunk = false;
      } else {
        this.push(',\n' + json);
      }

      callback();
    } catch (error) {
      callback(
        error instanceof Error
          ? error
          : new Error(`Transform error: ${String(error)}`),
      );
    }
  }

  /**
   * Called when there are no more rows.
   * Pushes the JSON array closing bracket.
   */
  override _flush(callback: TransformCallback): void {
    this.push('\n]');
    callback();
  }

  // ===========================================================================
  // ROW MAPPING (Raw DB Row → Typed DTO)
  // ===========================================================================

  private mapRowToDto(raw: RawAuditRow): AuditLogExportDto {
    return {
      id: raw.audit_id,
      organizationId: raw.audit_organizationId,
      eventType: raw.audit_eventType,
      severity: raw.audit_severity,
      status: raw.audit_status,
      description: raw.audit_description,
      details: this.safeJsonParse(raw.audit_details),
      oldValues: this.safeJsonParse(raw.audit_oldValues),
      newValues: this.safeJsonParse(raw.audit_newValues),
      userId: raw.audit_userId,
      userEmail: raw.audit_userEmail,
      userName: raw.audit_userName,
      resourceType: raw.audit_resourceType,
      resourceId: raw.audit_resourceId,
      projectId: raw.audit_projectId,
      ipAddress: raw.audit_ipAddress,
      userAgent: raw.audit_userAgent,
      sessionId: raw.audit_sessionId,
      requestId: raw.audit_requestId,
      country: raw.audit_country,
      city: raw.audit_city,
      region: raw.audit_region,
      metadata: this.safeJsonParse(raw.audit_metadata),
      correlationId: raw.audit_correlationId,
      timestamp:
        raw.audit_timestamp instanceof Date
          ? raw.audit_timestamp.toISOString()
          : String(raw.audit_timestamp),
      isRetained: raw.audit_isRetained,
      isEncrypted: raw.audit_isEncrypted,
    };
  }

  /**
   * Safely parse a JSON string column.
   * Returns null for null/empty/invalid values instead of throwing.
   */
  private safeJsonParse(value: string | null): Record<string, unknown> | null {
    if (!value) return null;
    try {
      return JSON.parse(value) as Record<string, unknown>;
    } catch {
      return null;
    }
  }
}
