import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as crypto from 'crypto';
import { AuditService } from '../audit/services/audit.service';
import {
  AuditEventType,
  AuditSeverity,
} from '../audit/entities/audit-log.entity';

export interface EncryptionResult {
  encrypted: string;
  iv: string;
  tag?: string;
  /** Key version used for encryption (for crash-safe rotation) */
  keyVersion?: number;
}

export interface DecryptionResult {
  decrypted: string;
  success: boolean;
}

/**
 * Encrypted field data stored in database.
 * Includes version for crash-safe key rotation.
 */
export interface EncryptedFieldData {
  encrypted: string;
  iv: string;
  tag: string;
  /** Key version (null/undefined = legacy v0, uses current key) */
  v?: number;
}

/**
 * Context for audit logging of encryption operations.
 */
export interface EncryptionContext {
  userId?: string;
  resourceId?: string;
  resourceType?: string;
  logOperation?: boolean;
  metadata?: Record<string, unknown>;
}

/**
 * Progress tracking for key rotation operations.
 */
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
 * Callback for re-encrypting data during key rotation.
 * Implementers must provide this to iterate their encrypted records.
 */
export interface ReEncryptionCallback {
  /**
   * Fetch a batch of records that need re-encryption.
   * @param batchSize - Number of records to fetch
   * @param offset - Offset for pagination
   * @returns Array of { id, encryptedData } objects
   */
  fetchBatch(
    batchSize: number,
    offset: number,
  ): Promise<Array<{ id: string; encryptedData: string }>>;

  /**
   * Save a batch of re-encrypted records.
   * @param records - Array of { id, encryptedData } with new encryption
   */
  saveBatch(
    records: Array<{ id: string; encryptedData: string }>,
  ): Promise<void>;

  /**
   * Total count of records to process.
   */
  getTotalCount(): Promise<number>;
}

@Injectable()
export class EncryptionService {
  private readonly logger = new Logger(EncryptionService.name);
  private readonly algorithm = 'aes-256-gcm';
  private readonly keyLength = 32; // 256 bits
  private readonly ivLength = 16; // 128 bits
  private readonly tagLength = 16; // 128 bits

  // Current master key and version
  private masterKey: Buffer;
  private currentKeyVersion: number = 1;

  // Retired keys for crash-safe rotation (keyed by version)
  private readonly retiredKeys: Map<number, Buffer> = new Map();

  // Rotation progress tracking
  private rotationProgress: KeyRotationProgress | null = null;

  constructor(
    private configService: ConfigService,
    private auditService: AuditService,
  ) {
    const isProduction =
      this.configService.get<string>('NODE_ENV') === 'production';

    // Get master key from environment
    const masterKeyString = this.configService.get<string>(
      'ENCRYPTION_MASTER_KEY',
    );

    // Get current key version (defaults to 1)
    this.currentKeyVersion =
      this.configService.get<number>('ENCRYPTION_KEY_VERSION') || 1;

    if (!masterKeyString) {
      if (isProduction) {
        throw new Error(
          'ENCRYPTION_MASTER_KEY is required in production. ' +
            "Generate one with: node -e \"console.log(require('crypto').randomBytes(32).toString('hex'))\"",
        );
      }
      this.logger.warn(
        'ENCRYPTION_MASTER_KEY not found, generating ephemeral key. ' +
          'This is ONLY acceptable in development. Set ENCRYPTION_MASTER_KEY in production!',
      );
      this.masterKey = crypto.randomBytes(this.keyLength);
    } else {
      this.masterKey = Buffer.from(masterKeyString, 'hex');
    }

    if (this.masterKey.length !== this.keyLength) {
      throw new Error(
        `Master key must be ${this.keyLength * 2} hex characters (${this.keyLength} bytes)`,
      );
    }

    // Load retired keys if configured (comma-separated hex strings with version prefixes)
    // Format: "1:hexkey1,2:hexkey2"
    const retiredKeysString = this.configService.get<string>(
      'ENCRYPTION_RETIRED_KEYS',
    );
    if (retiredKeysString) {
      this.loadRetiredKeys(retiredKeysString);
    }
  }

  /**
   * Load retired keys from configuration string.
   * Format: "version:hexkey,version:hexkey"
   */
  private loadRetiredKeys(retiredKeysString: string): void {
    try {
      const pairs = retiredKeysString.split(',');
      for (const pair of pairs) {
        const [versionStr, hexKey] = pair.trim().split(':');
        const version = parseInt(versionStr, 10);
        if (!isNaN(version) && hexKey) {
          const keyBuffer = Buffer.from(hexKey, 'hex');
          if (keyBuffer.length === this.keyLength) {
            this.retiredKeys.set(version, keyBuffer);
            this.logger.log(`Loaded retired key version ${version}`);
          }
        }
      }
    } catch (error) {
      this.logger.error('Failed to load retired keys', error);
    }
  }

  // ============================================================================
  // KEY DERIVATION (HKDF - RFC 5869 / NIST SP 800-108)
  // ============================================================================

  /**
   * Application-level salt for HKDF.
   * Using a static salt is acceptable when context strings are unique.
   */
  private readonly hkdfSalt = Buffer.from(
    'zenith-project-management-v1',
    'utf8',
  );

  /**
   * Derive a purpose-specific key from the master key using HKDF.
   *
   * SECURITY BENEFITS:
   * - Isolated key compromise: If audit key leaks, file key is still safe
   * - Purpose separation: Each crypto operation uses its own key
   * - Rotation flexibility: Can rotate individual purpose keys
   *
   * @param context - Unique context string for key purpose (e.g., 'zenith-v1-audit')
   * @returns 32-byte derived key buffer
   */
  deriveKey(context: string): Buffer {
    // Use HKDF to derive a 32-byte key
    // crypto.hkdfSync(digest, ikm, salt, info, keylen)
    const derivedKey = crypto.hkdfSync(
      'sha256', // Hash algorithm
      this.masterKey, // Input Key Material (IKM)
      this.hkdfSalt, // Salt
      context, // Info (context string)
      this.keyLength, // Output key length (32 bytes for AES-256)
    );

    return Buffer.from(derivedKey);
  }

  /**
   * Get derived key for Audit Log encryption.
   *
   * Context: 'zenith-v1-audit'
   * Used by: AuditService for encrypting sensitive audit payloads
   */
  getAuditKey(): Buffer {
    return this.deriveKey('zenith-v1-audit');
  }

  /**
   * Get derived key for File DEK wrapping (envelope encryption).
   *
   * Context: 'zenith-v1-files'
   * Used by: FileEncryptionService for wrapping per-file DEKs
   */
  getFileWrapperKey(): Buffer {
    return this.deriveKey('zenith-v1-files');
  }

  /**
   * Get derived key for API Key encryption.
   *
   * Context: 'zenith-v1-apikeys'
   * Used by: ApiKeysService for encrypting API key secrets
   */
  getApiKeyEncryptionKey(): Buffer {
    return this.deriveKey('zenith-v1-apikeys');
  }

  /**
   * Get derived key for Session token encryption.
   *
   * Context: 'zenith-v1-sessions'
   * Used by: SessionService for session-related encryption
   */
  getSessionKey(): Buffer {
    return this.deriveKey('zenith-v1-sessions');
  }

  /**
   * Get the raw master key (legacy DB encryption).
   *
   * WARNING: This returns the raw master key for backward compatibility
   * with existing encrypted database fields. New encryption should use
   * purpose-specific derived keys.
   *
   * @deprecated Use derived keys (getAuditKey, getFileWrapperKey, etc.) for new encryption
   */
  getLegacyDatabaseKey(): Buffer {
    return this.masterKey;
  }

  // ============================================================================
  // KEY GENERATION
  // ============================================================================

  /**
   * Generate a new encryption key
   */
  generateKey(): string {
    return crypto.randomBytes(this.keyLength).toString('hex');
  }

  /**
   * Generate a new IV
   */
  generateIV(): string {
    return crypto.randomBytes(this.ivLength).toString('hex');
  }

  /**
   * Get the encryption key for a specific version.
   * Version null/undefined/0 = current key
   */
  private getKeyForVersion(version?: number): Buffer {
    // Null, undefined, or 0 means current key
    if (!version || version === 0 || version === this.currentKeyVersion) {
      return this.masterKey;
    }

    // Check retired keys
    const retiredKey = this.retiredKeys.get(version);
    if (retiredKey) {
      return retiredKey;
    }

    // Fallback to current key with warning
    this.logger.warn(
      `Unknown key version ${version}, falling back to current key`,
    );
    return this.masterKey;
  }

  /**
   * Encrypt data using AES-256-GCM
   *
   * @param data - Plaintext to encrypt
   * @param key - Optional custom key (defaults to master key)
   * @param context - Optional audit context for logging
   */
  encrypt(
    data: string,
    key?: string,
    context?: EncryptionContext,
  ): EncryptionResult {
    try {
      const encryptionKey = key ? Buffer.from(key, 'hex') : this.masterKey;
      const iv = crypto.randomBytes(this.ivLength);
      const cipher = crypto.createCipheriv(this.algorithm, encryptionKey, iv);
      cipher.setAAD(Buffer.from('zenith-pm', 'utf8'));

      let encrypted = cipher.update(data, 'utf8', 'hex');
      encrypted += cipher.final('hex');

      const tag = cipher.getAuthTag();

      if (context?.logOperation) {
        this.logEncryptionEvent(true, context);
      }

      return {
        encrypted,
        iv: iv.toString('hex'),
        tag: tag.toString('hex'),
        keyVersion: this.currentKeyVersion, // Tag with current version
      };
    } catch (error) {
      this.logger.error('Encryption failed', error);
      this.logEncryptionFailure('encrypt', context, error);
      throw new Error('Encryption failed');
    }
  }

  /**
   * Decrypt data using AES-256-GCM with multi-key support.
   *
   * KEY VERSION RESOLUTION STRATEGY:
   * 1. If keyVersion is provided, use that specific key
   * 2. If keyVersion is null/undefined/0 (legacy), try current key first
   * 3. If current key fails, try each retired key in descending order
   *
   * This enables crash-safe rotation where some rows may have old keys.
   */
  decrypt(
    encryptedData: string,
    iv: string,
    tag: string,
    key?: string,
    context?: EncryptionContext,
    keyVersion?: number,
  ): DecryptionResult {
    // If custom key provided, use it directly
    if (key) {
      return this.decryptWithKey(
        encryptedData,
        iv,
        tag,
        Buffer.from(key, 'hex'),
        context,
      );
    }

    // If version is specified, use that key
    if (keyVersion && keyVersion !== 0) {
      const versionedKey = this.getKeyForVersion(keyVersion);
      return this.decryptWithKey(encryptedData, iv, tag, versionedKey, context);
    }

    // Legacy data (no version): Try current key first, then retired keys
    const currentResult = this.decryptWithKey(
      encryptedData,
      iv,
      tag,
      this.masterKey,
      context,
    );

    if (currentResult.success) {
      return currentResult;
    }

    // Try retired keys in descending version order (newest first)
    const sortedVersions = Array.from(this.retiredKeys.keys()).sort(
      (a, b) => b - a,
    );

    for (const version of sortedVersions) {
      const retiredKey = this.retiredKeys.get(version);
      if (retiredKey) {
        const result = this.decryptWithKey(
          encryptedData,
          iv,
          tag,
          retiredKey,
          undefined, // Don't log intermediate attempts
        );
        if (result.success) {
          this.logger.debug(`Decrypted with retired key version ${version}`);
          if (context?.logOperation) {
            this.logDecryptionEvent(true, context);
          }
          return result;
        }
      }
    }

    // All keys failed
    this.logDecryptionFailure(context, new Error('All key versions failed'));
    return { decrypted: '', success: false };
  }

  /**
   * Internal decrypt with a specific key (no fallback).
   */
  private decryptWithKey(
    encryptedData: string,
    iv: string,
    tag: string,
    encryptionKey: Buffer,
    context?: EncryptionContext,
  ): DecryptionResult {
    try {
      const ivBuffer = Buffer.from(iv, 'hex');
      const tagBuffer = Buffer.from(tag, 'hex');

      const decipher = crypto.createDecipheriv(
        this.algorithm,
        encryptionKey,
        ivBuffer,
      );
      decipher.setAAD(Buffer.from('zenith-pm', 'utf8'));
      decipher.setAuthTag(tagBuffer);

      let decrypted = decipher.update(encryptedData, 'hex', 'utf8');
      decrypted += decipher.final('utf8');

      if (context?.logOperation) {
        this.logDecryptionEvent(true, context);
      }

      return { decrypted, success: true };
    } catch {
      // Don't log here - caller handles logging
      return { decrypted: '', success: false };
    }
  }

  /**
   * Encrypt sensitive fields in an object (with key version tagging).
   */
  encryptObject(
    obj: Record<string, unknown>,
    fieldsToEncrypt: string[],
    key?: string,
    context?: EncryptionContext,
  ): Record<string, unknown> {
    const encryptedObj = { ...obj };

    for (const field of fieldsToEncrypt) {
      if (obj[field] && typeof obj[field] === 'string') {
        const result = this.encrypt(obj[field], key);
        const fieldData: EncryptedFieldData = {
          encrypted: result.encrypted,
          iv: result.iv,
          tag: result.tag!,
          v: result.keyVersion, // Include version for crash-safe rotation
        };
        encryptedObj[field] = JSON.stringify(fieldData);
      }
    }

    if (context?.logOperation && fieldsToEncrypt.length > 0) {
      this.logEncryptionEvent(true, {
        ...context,
        metadata: { ...context.metadata, fieldsCount: fieldsToEncrypt.length },
      });
    }

    return encryptedObj;
  }

  /**
   * Decrypt sensitive fields in an object (with multi-key fallback).
   */
  decryptObject(
    obj: Record<string, unknown>,
    fieldsToDecrypt: string[],
    key?: string,
    context?: EncryptionContext,
  ): Record<string, unknown> {
    const decryptedObj = { ...obj };

    for (const field of fieldsToDecrypt) {
      if (obj[field] && typeof obj[field] === 'string') {
        try {
          const encryptedData = JSON.parse(obj[field]) as EncryptedFieldData;
          if (
            encryptedData.encrypted &&
            encryptedData.iv &&
            encryptedData.tag
          ) {
            const result = this.decrypt(
              encryptedData.encrypted,
              encryptedData.iv,
              encryptedData.tag,
              key,
              undefined, // Don't log individual fields
              encryptedData.v, // Pass version for correct key selection
            );
            if (result.success) {
              decryptedObj[field] = result.decrypted;
            }
          }
        } catch (error) {
          this.logger.warn(`Failed to decrypt field ${field}`, error);
        }
      }
    }

    if (context?.logOperation && fieldsToDecrypt.length > 0) {
      this.logDecryptionEvent(true, {
        ...context,
        metadata: { ...context.metadata, fieldsCount: fieldsToDecrypt.length },
      });
    }

    return decryptedObj;
  }

  /**
   * Hash data using SHA-256
   */
  hash(data: string): string {
    return crypto.createHash('sha256').update(data).digest('hex');
  }

  /**
   * Hash data with salt using SHA-256
   */
  hashWithSalt(data: string, salt: string): string {
    return crypto
      .createHash('sha256')
      .update(data + salt)
      .digest('hex');
  }

  /**
   * Generate a secure random string
   */
  generateSecureRandom(length: number = 32): string {
    return crypto.randomBytes(length).toString('hex');
  }

  /**
   * Generate a secure password
   */
  generateSecurePassword(length: number = 16): string {
    const charset =
      'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789!@#$%^&*';
    let password = '';
    for (let i = 0; i < length; i++) {
      password += charset.charAt(crypto.randomInt(0, charset.length));
    }
    return password;
  }

  /**
   * Encrypt file content
   */
  encryptFile(
    fileBuffer: Buffer,
    key?: string,
    context?: EncryptionContext,
  ): EncryptionResult {
    const data = fileBuffer.toString('base64');
    return this.encrypt(data, key, context);
  }

  /**
   * Decrypt file content
   */
  decryptFile(
    encryptedData: string,
    iv: string,
    tag: string,
    key?: string,
    context?: EncryptionContext,
    keyVersion?: number,
  ): Buffer {
    const result = this.decrypt(
      encryptedData,
      iv,
      tag,
      key,
      context,
      keyVersion,
    );
    if (!result.success) {
      throw new Error('File decryption failed');
    }
    return Buffer.from(result.decrypted, 'base64');
  }

  /**
   * Verify data integrity using HMAC
   */
  verifyIntegrity(data: string, signature: string, key?: string): boolean {
    try {
      const hmac = crypto.createHmac('sha256', key || this.masterKey);
      hmac.update(data);
      const expectedSignature = hmac.digest('hex');
      return crypto.timingSafeEqual(
        Buffer.from(signature, 'hex'),
        Buffer.from(expectedSignature, 'hex'),
      );
    } catch (error) {
      this.logger.error('Integrity verification failed', error);
      return false;
    }
  }

  /**
   * Generate HMAC signature
   */
  generateSignature(data: string, key?: string): string {
    const hmac = crypto.createHmac('sha256', key || this.masterKey);
    hmac.update(data);
    return hmac.digest('hex');
  }

  /**
   * Encrypt audit log sensitive data
   */
  encryptAuditData(
    auditData: Record<string, unknown>,
  ): Record<string, unknown> {
    const sensitiveFields = ['details', 'oldValues', 'newValues', 'metadata'];
    return this.encryptObject(auditData, sensitiveFields);
  }

  /**
   * Decrypt audit log sensitive data
   */
  decryptAuditData(
    auditData: Record<string, unknown>,
  ): Record<string, unknown> {
    const sensitiveFields = ['details', 'oldValues', 'newValues', 'metadata'];
    return this.decryptObject(auditData, sensitiveFields);
  }

  // ============================================================================
  // KEY ROTATION WORKFLOW (NIST SP 800-57 Compliant)
  // ============================================================================

  /**
   * Rotate encryption keys with optional data re-encryption.
   *
   * CRASH SAFETY STRATEGY:
   * 1. New key is generated with version = currentVersion + 1
   * 2. Old key is moved to retiredKeys map (kept in memory)
   * 3. If reEncrypt=true, data is re-encrypted in batches with transactions
   * 4. Each row is tagged with the new key version
   * 5. On crash, decrypt() can read both old and new versions
   *
   * @param context - Audit context
   * @param reEncryptCallback - Optional callback to re-encrypt existing data
   * @param batchSize - Number of records to process per batch (default: 100)
   */
  async rotateKeys(
    context?: EncryptionContext,
    reEncryptCallback?: ReEncryptionCallback,
    batchSize: number = 100,
  ): Promise<{
    oldKeyVersion: number;
    newKeyVersion: number;
    progress?: KeyRotationProgress;
  }> {
    const oldKeyVersion = this.currentKeyVersion;
    const newKeyVersion = oldKeyVersion + 1;
    const oldKey = this.masterKey;
    const newKey = crypto.randomBytes(this.keyLength);

    this.logger.log(
      `Starting key rotation: v${oldKeyVersion} -> v${newKeyVersion}`,
    );

    // Step 1: Retire the old key (keep it available for mid-rotation reads)
    this.retiredKeys.set(oldKeyVersion, oldKey);

    // Step 2: Activate the new key
    this.masterKey = newKey;
    this.currentKeyVersion = newKeyVersion;

    // Log rotation initiation (CRITICAL severity)
    await this.auditService
      .log({
        eventType: AuditEventType.KEY_ROTATION_INITIATED,
        severity: AuditSeverity.CRITICAL,
        description: `Encryption key rotation: v${oldKeyVersion} -> v${newKeyVersion}`,
        userId: context?.userId,
        resourceType: 'encryption_key',
        details: {
          oldKeyVersion,
          newKeyVersion,
          reEncryptData: !!reEncryptCallback,
          keyRotationTimestamp: new Date().toISOString(),
          // NEVER log actual keys
        },
      })
      .catch((err) => this.logger.error('Failed to log key rotation', err));

    // Step 3: Re-encrypt existing data if callback provided
    let progress: KeyRotationProgress | undefined;
    if (reEncryptCallback) {
      progress = await this.reEncryptAllData(
        reEncryptCallback,
        oldKey,
        newKey,
        batchSize,
        context,
      );
    }

    this.logger.log(
      `Key rotation completed: v${oldKeyVersion} -> v${newKeyVersion}`,
    );

    // Return info for environment variable update
    return {
      oldKeyVersion,
      newKeyVersion,
      progress,
    };
  }

  /**
   * Re-encrypt all data in batches with transaction-per-batch.
   *
   * MEMORY MANAGEMENT:
   * - Processes records in batches (keyset pagination)
   * - Never loads all records into memory
   * - Each batch is a separate transaction
   */
  private async reEncryptAllData(
    callback: ReEncryptionCallback,
    oldKey: Buffer,
    newKey: Buffer,
    batchSize: number,
    context?: EncryptionContext,
  ): Promise<KeyRotationProgress> {
    const totalCount = await callback.getTotalCount();

    this.rotationProgress = {
      totalRecords: totalCount,
      processedRecords: 0,
      failedRecords: 0,
      startedAt: new Date(),
      status: 'in_progress',
      errors: [],
    };

    this.logger.log(
      `Re-encrypting ${totalCount} records in batches of ${batchSize}`,
    );

    let offset = 0;
    let hasMore = true;

    while (hasMore) {
      try {
        // Fetch batch
        const batch = await callback.fetchBatch(batchSize, offset);

        if (batch.length === 0) {
          hasMore = false;
          continue;
        }

        // Re-encrypt each record in the batch
        const reEncryptedBatch: Array<{ id: string; encryptedData: string }> =
          [];

        for (const record of batch) {
          try {
            const reEncrypted = this.reEncryptField(
              record.encryptedData,
              oldKey,
              newKey,
            );
            reEncryptedBatch.push({
              id: record.id,
              encryptedData: reEncrypted,
            });
          } catch (error) {
            this.rotationProgress.failedRecords++;
            this.rotationProgress.errors.push({
              recordId: record.id,
              error: error instanceof Error ? error.message : 'Unknown error',
            });
            this.logger.error(
              `Failed to re-encrypt record ${record.id}`,
              error,
            );
          }
        }

        // Save batch (caller implements transaction)
        if (reEncryptedBatch.length > 0) {
          await callback.saveBatch(reEncryptedBatch);
        }

        this.rotationProgress.processedRecords += batch.length;
        offset += batchSize;

        this.logger.debug(
          `Rotation progress: ${this.rotationProgress.processedRecords}/${totalCount}`,
        );

        // Check if we've processed all
        if (batch.length < batchSize) {
          hasMore = false;
        }
      } catch (error) {
        this.logger.error(`Batch processing failed at offset ${offset}`, error);
        this.rotationProgress.status = 'failed';
        throw error;
      }
    }

    this.rotationProgress.completedAt = new Date();
    this.rotationProgress.status = 'completed';

    // Log completion
    await this.auditService
      .log({
        eventType: AuditEventType.KEY_ROTATION_INITIATED,
        severity: AuditSeverity.CRITICAL,
        description: 'Encryption key rotation completed',
        userId: context?.userId,
        resourceType: 'encryption_key',
        details: {
          totalRecords: this.rotationProgress.totalRecords,
          processedRecords: this.rotationProgress.processedRecords,
          failedRecords: this.rotationProgress.failedRecords,
          durationMs:
            this.rotationProgress.completedAt.getTime() -
            this.rotationProgress.startedAt.getTime(),
        },
      })
      .catch((err) =>
        this.logger.error('Failed to log rotation completion', err),
      );

    return this.rotationProgress;
  }

  /**
   * Re-encrypt a single field value from old key to new key.
   */
  private reEncryptField(
    encryptedFieldJson: string,
    oldKey: Buffer,
    newKey: Buffer,
  ): string {
    // Parse existing encrypted data
    const fieldData = JSON.parse(encryptedFieldJson) as EncryptedFieldData;

    // Decrypt with old key
    const decryptResult = this.decryptWithKey(
      fieldData.encrypted,
      fieldData.iv,
      fieldData.tag,
      oldKey,
    );

    if (!decryptResult.success) {
      throw new Error('Decryption with old key failed');
    }

    // Encrypt with new key
    const iv = crypto.randomBytes(this.ivLength);
    const cipher = crypto.createCipheriv(this.algorithm, newKey, iv);
    cipher.setAAD(Buffer.from('zenith-pm', 'utf8'));

    let encrypted = cipher.update(decryptResult.decrypted, 'utf8', 'hex');
    encrypted += cipher.final('hex');
    const tag = cipher.getAuthTag();

    // Return new encrypted data with updated version
    const newFieldData: EncryptedFieldData = {
      encrypted,
      iv: iv.toString('hex'),
      tag: tag.toString('hex'),
      v: this.currentKeyVersion,
    };

    return JSON.stringify(newFieldData);
  }

  /**
   * Get current rotation progress (for UI/monitoring).
   */
  getRotationProgress(): KeyRotationProgress | null {
    return this.rotationProgress;
  }

  /**
   * Get encryption status including key version info.
   */
  getEncryptionStatus(): {
    algorithm: string;
    keyLength: number;
    ivLength: number;
    tagLength: number;
    masterKeySet: boolean;
    currentKeyVersion: number;
    retiredKeyVersions: number[];
  } {
    return {
      algorithm: this.algorithm,
      keyLength: this.keyLength,
      ivLength: this.ivLength,
      tagLength: this.tagLength,
      masterKeySet: !!this.configService.get<string>('ENCRYPTION_MASTER_KEY'),
      currentKeyVersion: this.currentKeyVersion,
      retiredKeyVersions: Array.from(this.retiredKeys.keys()),
    };
  }

  // ============================================================================
  // PRIVATE AUDIT LOGGING METHODS (Fire-and-forget)
  // ============================================================================

  private logEncryptionEvent(
    success: boolean,
    context?: EncryptionContext,
  ): void {
    if (!context) return;
    this.auditService
      .log({
        eventType: AuditEventType.DATA_ENCRYPTED,
        severity: AuditSeverity.LOW,
        description: 'Data encryption operation',
        userId: context.userId,
        resourceType: context.resourceType || 'data',
        resourceId: context.resourceId,
        details: { success, ...context.metadata },
      })
      .catch((err) => this.logger.error('Failed to log encryption event', err));
  }

  private logDecryptionEvent(
    success: boolean,
    context?: EncryptionContext,
  ): void {
    if (!context) return;
    this.auditService
      .log({
        eventType: AuditEventType.DATA_DECRYPTED,
        severity: AuditSeverity.LOW,
        description: 'Data decryption operation',
        userId: context.userId,
        resourceType: context.resourceType || 'data',
        resourceId: context.resourceId,
        details: { success, ...context.metadata },
      })
      .catch((err) => this.logger.error('Failed to log decryption event', err));
  }

  private logEncryptionFailure(
    operation: string,
    context?: EncryptionContext,
    error?: unknown,
  ): void {
    this.auditService
      .log({
        eventType: AuditEventType.ENCRYPTION_FAILURE,
        severity: AuditSeverity.HIGH,
        description: `Encryption operation failed: ${operation}`,
        userId: context?.userId,
        resourceType: context?.resourceType || 'data',
        resourceId: context?.resourceId,
        details: {
          operation,
          errorMessage:
            error instanceof Error ? error.message : 'Unknown error',
        },
      })
      .catch((err) =>
        this.logger.error('Failed to log encryption failure', err),
      );
  }

  private logDecryptionFailure(
    context?: EncryptionContext,
    error?: unknown,
  ): void {
    this.auditService
      .log({
        eventType: AuditEventType.DECRYPTION_FAILURE,
        severity: AuditSeverity.HIGH,
        description: 'Decryption operation failed',
        userId: context?.userId,
        resourceType: context?.resourceType || 'data',
        resourceId: context?.resourceId,
        details: {
          errorMessage:
            error instanceof Error ? error.message : 'Unknown error',
        },
      })
      .catch((err) =>
        this.logger.error('Failed to log decryption failure', err),
      );
  }
}
