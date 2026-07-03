import { Inject, Injectable, Logger } from '@nestjs/common';
import * as crypto from 'crypto';
import { EncryptionConfig } from '../config/encryption-config';
import {
  EncryptedFieldData,
  EncryptionAuditLogger,
  EncryptionContext,
  EncryptionStatusReport,
  KeyRotationOrchestrator,
  KeyRotationProgress,
  KeyRotationResult,
  ReEncryptionCallback,
  SymmetricCipher,
} from '../interfaces/encryption.interfaces';
import {
  ENCRYPTION_AUDIT_LOGGER_TOKEN,
  ENCRYPTION_CONFIG_TOKEN,
  SYMMETRIC_CIPHER_TOKEN,
} from '../tokens/encryption.tokens';

/**
 * NIST SP 800-57 compliant crash-safe key rotation. The flow:
 *   1. Generate a fresh master key.
 *   2. Atomically retire the prior key and install the new one
 *      (delegated to `EncryptionConfig.rotateMasterKey`).
 *   3. Optionally re-encrypt every record via the caller-supplied
 *      `ReEncryptionCallback` in keyset-paginated batches so memory
 *      stays bounded.
 *
 * Decryption fallback during rotation is handled by
 * `SymmetricCipher.decrypt`, which probes the retired-keys map.
 */
@Injectable()
export class KeyRotationService extends KeyRotationOrchestrator {
  private readonly logger = new Logger(KeyRotationService.name);
  private rotationProgress: KeyRotationProgress | null = null;

  constructor(
    @Inject(ENCRYPTION_CONFIG_TOKEN)
    private readonly config: EncryptionConfig,
    @Inject(SYMMETRIC_CIPHER_TOKEN)
    private readonly cipher: SymmetricCipher,
    @Inject(ENCRYPTION_AUDIT_LOGGER_TOKEN)
    private readonly audit: EncryptionAuditLogger,
  ) {
    super();
  }

  async rotateKeys(
    context?: EncryptionContext,
    reEncryptCallback?: ReEncryptionCallback,
    batchSize: number = 100,
  ): Promise<KeyRotationResult> {
    const oldKey = Buffer.from(this.config.getMasterKey());
    const newKey = crypto.randomBytes(this.config.spec.keyLength);

    const { oldKeyVersion, newKeyVersion } =
      this.config.rotateMasterKey(newKey);

    this.logger.log(
      `Starting key rotation: v${oldKeyVersion} -> v${newKeyVersion}`,
    );

    await this.audit.logKeyRotationInitiated(
      oldKeyVersion,
      newKeyVersion,
      !!reEncryptCallback,
      context,
    );

    let progress: KeyRotationProgress | undefined;
    if (reEncryptCallback) {
      progress = await this.reEncryptAllData(
        reEncryptCallback,
        oldKey,
        batchSize,
        context,
      );
    }

    this.logger.log(
      `Key rotation completed: v${oldKeyVersion} -> v${newKeyVersion}`,
    );

    return { oldKeyVersion, newKeyVersion, progress };
  }

  getRotationProgress(): KeyRotationProgress | null {
    return this.rotationProgress;
  }

  getEncryptionStatus(): EncryptionStatusReport {
    const { algorithm, keyLength, ivLength, tagLength } = this.config.spec;
    return {
      algorithm,
      keyLength,
      ivLength,
      tagLength,
      masterKeySet: this.config.isMasterKeyPersisted(),
      currentKeyVersion: this.config.getCurrentKeyVersion(),
      retiredKeyVersions: [...this.config.getRetiredKeyVersions()],
    };
  }

  private async reEncryptAllData(
    callback: ReEncryptionCallback,
    oldKey: Buffer,
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
        const batch = await callback.fetchBatch(batchSize, offset);
        if (batch.length === 0) {
          hasMore = false;
          continue;
        }

        const reEncryptedBatch: Array<{ id: string; encryptedData: string }> =
          [];
        for (const record of batch) {
          try {
            const reEncrypted = this.reEncryptField(
              record.encryptedData,
              oldKey,
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

        if (reEncryptedBatch.length > 0) {
          await callback.saveBatch(reEncryptedBatch);
        }

        this.rotationProgress.processedRecords += batch.length;
        offset += batchSize;

        this.logger.debug(
          `Rotation progress: ${this.rotationProgress.processedRecords}/${totalCount}`,
        );

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

    await this.audit.logKeyRotationCompleted(this.rotationProgress, context);

    return this.rotationProgress;
  }

  /**
   * Decrypt a single field with the prior key bytes, then re-encrypt
   * with the freshly-installed master key (already active in
   * `config`) so `cipher.encrypt` stamps the new version.
   */
  private reEncryptField(encryptedFieldJson: string, oldKey: Buffer): string {
    const fieldData = JSON.parse(encryptedFieldJson) as EncryptedFieldData;

    const decryptResult = this.cipher.decrypt(
      fieldData.encrypted,
      fieldData.iv,
      fieldData.tag,
      oldKey.toString('hex'),
    );
    if (!decryptResult.success) {
      throw new Error('Decryption with old key failed');
    }

    const reEncrypted = this.cipher.encrypt(decryptResult.decrypted);
    const newFieldData: EncryptedFieldData = {
      encrypted: reEncrypted.encrypted,
      iv: reEncrypted.iv,
      tag: reEncrypted.tag!,
      v: reEncrypted.keyVersion,
    };

    return JSON.stringify(newFieldData);
  }
}
