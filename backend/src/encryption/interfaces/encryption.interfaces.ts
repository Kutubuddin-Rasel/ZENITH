/**
 * Encryption Module — ISP Contract Layer (Step 1 of SOLID refactor).
 *
 * Segregates the 1031-line `EncryptionService` god class into seven
 * role-based ports. Each abstract class below is a NestJS DIP seam (used
 * as both type AND token-equivalent surface) bound through the symbol
 * tokens declared in `../tokens/encryption.tokens.ts`. Step-2 services
 * will each implement exactly one of these ports; Step-3 consumers will
 * inject only the role(s) they actually need — no more god-surface
 * coupling.
 *
 * Value types (EncryptionResult, EncryptedFieldData, etc.) are re-declared
 * here so that the contract layer owns the canonical public shape — the
 * concrete `EncryptionService` will be deleted at the end of Step 2.
 */

// ============================================================================
// VALUE TYPES (canonical public shapes)
// ============================================================================

export interface EncryptionResult {
  encrypted: string;
  iv: string;
  tag?: string;
  /** Key version stamped at encryption time (for crash-safe rotation). */
  keyVersion?: number;
}

export interface DecryptionResult {
  decrypted: string;
  success: boolean;
}

/**
 * Encrypted field envelope persisted in the database. `v` is the key
 * version used at encryption time; absent/0 means "legacy current key".
 */
export interface EncryptedFieldData {
  encrypted: string;
  iv: string;
  tag: string;
  v?: number;
}

/**
 * Audit-logging context propagated through cipher calls. When
 * `logOperation` is true, the cipher fans out to `EncryptionAuditLogger`.
 *
 * `organizationId` is required by the downstream `AuditService.log`
 * contract; when absent, the logger silently no-ops (system-level crypto
 * operations that lack tenant context cannot be persisted to the
 * tenant-scoped audit_log table).
 */
export interface EncryptionContext {
  organizationId?: string;
  userId?: string;
  resourceId?: string;
  resourceType?: string;
  logOperation?: boolean;
  metadata?: Record<string, unknown>;
}

export interface KeyRotationProgress {
  totalRecords: number;
  processedRecords: number;
  failedRecords: number;
  startedAt: Date;
  completedAt?: Date;
  status: 'in_progress' | 'completed' | 'failed';
  errors: Array<{ recordId: string; error: string }>;
}

/**
 * Caller-supplied iterator that lets `KeyRotationOrchestrator` walk every
 * encrypted record without coupling to a specific repository.
 */
export interface ReEncryptionCallback {
  fetchBatch(
    batchSize: number,
    offset: number,
  ): Promise<Array<{ id: string; encryptedData: string }>>;

  saveBatch(
    records: Array<{ id: string; encryptedData: string }>,
  ): Promise<void>;

  getTotalCount(): Promise<number>;
}

export interface EncryptionStatusReport {
  algorithm: string;
  keyLength: number;
  ivLength: number;
  tagLength: number;
  masterKeySet: boolean;
  currentKeyVersion: number;
  retiredKeyVersions: number[];
}

export interface KeyRotationResult {
  oldKeyVersion: number;
  newKeyVersion: number;
  progress?: KeyRotationProgress;
}

// ============================================================================
// ROLE-BASED PORTS (one abstract class per responsibility)
// ============================================================================

/**
 * HKDF-based purpose-key derivation surface. Bound via
 * `KEY_PROVIDER_TOKEN`. Pure — no I/O, no state of its own; reads from
 * `EncryptionConfig`.
 */
export abstract class KeyProvider {
  /** Derive a 32-byte purpose key via HKDF-SHA256 with the given context. */
  abstract deriveKey(context: string): Buffer;

  /** Derived key for audit-log encryption (`zenith-v1-audit`). */
  abstract getAuditKey(): Buffer;

  /** Derived key for file DEK wrapping (`zenith-v1-files`). */
  abstract getFileWrapperKey(): Buffer;

  /** Derived key for API key secret encryption (`zenith-v1-apikeys`). */
  abstract getApiKeyEncryptionKey(): Buffer;

  /** Derived key for session-token encryption (`zenith-v1-sessions`). */
  abstract getSessionKey(): Buffer;

  /**
   * Raw master key — preserved for the legacy DB encryption path that
   * predates HKDF derivation. New code MUST use a purpose-specific
   * derived key above.
   *
   * @deprecated New encryption MUST use a purpose-specific derived key.
   */
  abstract getLegacyDatabaseKey(): Buffer;

  /**
   * Resolve the key bytes for a specific version. Falls back to the
   * current master key for `undefined`, `0`, or unknown versions; the
   * caller is responsible for surfacing the fallback in logs.
   */
  abstract getKeyForVersion(version?: number): Buffer;

  /** Convenience accessor delegating to `EncryptionConfig`. */
  abstract getCurrentKeyVersion(): number;
}

/**
 * AES-256-GCM cipher surface (string-payload path). Bound via
 * `SYMMETRIC_CIPHER_TOKEN`.
 */
export abstract class SymmetricCipher {
  abstract encrypt(
    data: string,
    key?: string,
    context?: EncryptionContext,
  ): EncryptionResult;

  abstract decrypt(
    encryptedData: string,
    iv: string,
    tag: string,
    key?: string,
    context?: EncryptionContext,
    keyVersion?: number,
  ): DecryptionResult;

  abstract encryptObject(
    obj: Record<string, unknown>,
    fieldsToEncrypt: string[],
    key?: string,
    context?: EncryptionContext,
  ): Record<string, unknown>;

  abstract decryptObject(
    obj: Record<string, unknown>,
    fieldsToDecrypt: string[],
    key?: string,
    context?: EncryptionContext,
  ): Record<string, unknown>;
}

/**
 * Buffer-base64 file cipher surface (the simple path on the god class —
 * distinct from `FileEncryptionService`'s envelope/DEK flow). Bound via
 * `FILE_CIPHER_TOKEN`.
 */
export abstract class FileCipher {
  abstract encryptFile(
    fileBuffer: Buffer,
    key?: string,
    context?: EncryptionContext,
  ): EncryptionResult;

  abstract decryptFile(
    encryptedData: string,
    iv: string,
    tag: string,
    key?: string,
    context?: EncryptionContext,
    keyVersion?: number,
  ): Buffer;
}

/**
 * SHA-256 hashing + HMAC signing surface with timing-safe verification.
 * Bound via `HASHER_TOKEN`.
 */
export abstract class Hasher {
  abstract hash(data: string): string;

  abstract hashWithSalt(data: string, salt: string): string;

  abstract generateSignature(data: string, key?: string): string;

  /** Timing-safe HMAC verification. Returns false on any error. */
  abstract verifyIntegrity(
    data: string,
    signature: string,
    key?: string,
  ): boolean;

  /**
   * Constant-time string comparison. Returns `false` for missing,
   * mismatched-length, or invalid inputs without leaking through timing.
   *
   * Consumed by CSRF token validation (`CsrfTokenQueryService`) to defeat
   * the same timing side channel `verifyIntegrity` defeats for HMACs,
   * without requiring callers to invent a synthetic HMAC envelope.
   */
  abstract timingSafeEqual(a: string, b: string): boolean;
}

/**
 * CSPRNG surface for key/IV/password generation. Bound via
 * `SECURE_RANDOM_TOKEN`.
 */
export abstract class SecureRandom {
  /** Hex-encoded 32-byte key (suitable for `ENCRYPTION_MASTER_KEY`). */
  abstract generateKey(): string;

  /** Hex-encoded 16-byte IV. */
  abstract generateIV(): string;

  /** Hex-encoded random bytes. */
  abstract generateSecureRandom(length?: number): string;

  /** ASCII password drawn from an alphanumeric + punctuation charset. */
  abstract generateSecurePassword(length?: number): string;
}

/**
 * Crash-safe key rotation orchestrator. Bound via `KEY_ROTATION_TOKEN`.
 * The only port allowed to mutate `EncryptionConfig` key state.
 */
export abstract class KeyRotationOrchestrator {
  abstract rotateKeys(
    context?: EncryptionContext,
    reEncryptCallback?: ReEncryptionCallback,
    batchSize?: number,
  ): Promise<KeyRotationResult>;

  abstract getRotationProgress(): KeyRotationProgress | null;

  abstract getEncryptionStatus(): EncryptionStatusReport;
}

/**
 * Adapter port wrapping `AuditService` for fire-and-forget encryption
 * telemetry. Bound via `ENCRYPTION_AUDIT_LOGGER_TOKEN`. The Step-2
 * implementation (`EncryptionAuditLoggerService`) is the ONLY service in
 * this module permitted to inject the concrete `AuditService` directly.
 */
export abstract class EncryptionAuditLogger {
  abstract logEncryption(success: boolean, context: EncryptionContext): void;

  abstract logDecryption(success: boolean, context: EncryptionContext): void;

  abstract logEncryptionFailure(
    operation: string,
    context: EncryptionContext | undefined,
    error: unknown,
  ): void;

  abstract logDecryptionFailure(
    context: EncryptionContext | undefined,
    error: unknown,
  ): void;

  abstract logKeyRotationInitiated(
    oldKeyVersion: number,
    newKeyVersion: number,
    reEncryptData: boolean,
    context?: EncryptionContext,
  ): Promise<void>;

  abstract logKeyRotationCompleted(
    progress: KeyRotationProgress,
    context?: EncryptionContext,
  ): Promise<void>;
}
