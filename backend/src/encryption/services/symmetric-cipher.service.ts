import { Inject, Injectable, Logger } from '@nestjs/common';
import * as crypto from 'crypto';
import { EncryptionConfig } from '../config/encryption-config';
import {
  DecryptionResult,
  EncryptedFieldData,
  EncryptionAuditLogger,
  EncryptionContext,
  EncryptionResult,
  KeyProvider,
  SymmetricCipher,
} from '../interfaces/encryption.interfaces';
import {
  ENCRYPTION_AUDIT_LOGGER_TOKEN,
  ENCRYPTION_CONFIG_TOKEN,
  KEY_PROVIDER_TOKEN,
} from '../tokens/encryption.tokens';

/**
 * AES-256-GCM cipher with multi-key version fallback for crash-safe
 * rotation. Behavior preserved bit-for-bit from the prior god class:
 * same algorithm, same AAD, same key-version tagging on `encrypt`, same
 * retired-key probe order on `decrypt`.
 */
@Injectable()
export class SymmetricCipherService extends SymmetricCipher {
  private readonly logger = new Logger(SymmetricCipherService.name);

  constructor(
    @Inject(ENCRYPTION_CONFIG_TOKEN)
    private readonly config: EncryptionConfig,
    @Inject(KEY_PROVIDER_TOKEN)
    private readonly keys: KeyProvider,
    @Inject(ENCRYPTION_AUDIT_LOGGER_TOKEN)
    private readonly audit: EncryptionAuditLogger,
  ) {
    super();
  }

  encrypt(
    data: string,
    key?: string,
    context?: EncryptionContext,
  ): EncryptionResult {
    const { algorithm, ivLength, aad } = this.config.spec;
    try {
      const encryptionKey = key
        ? Buffer.from(key, 'hex')
        : this.config.getMasterKey();
      const iv = crypto.randomBytes(ivLength);
      const cipher = crypto.createCipheriv(algorithm, encryptionKey, iv);
      cipher.setAAD(aad);

      let encrypted = cipher.update(data, 'utf8', 'hex');
      encrypted += cipher.final('hex');
      const tag = cipher.getAuthTag();

      if (context?.logOperation) {
        this.audit.logEncryption(true, context);
      }

      return {
        encrypted,
        iv: iv.toString('hex'),
        tag: tag.toString('hex'),
        keyVersion: this.config.getCurrentKeyVersion(),
      };
    } catch (error) {
      this.logger.error('Encryption failed', error);
      this.audit.logEncryptionFailure('encrypt', context, error);
      throw new Error('Encryption failed');
    }
  }

  decrypt(
    encryptedData: string,
    iv: string,
    tag: string,
    key?: string,
    context?: EncryptionContext,
    keyVersion?: number,
  ): DecryptionResult {
    if (key) {
      return this.decryptWithKey(
        encryptedData,
        iv,
        tag,
        Buffer.from(key, 'hex'),
        context,
      );
    }

    if (keyVersion && keyVersion !== 0) {
      return this.decryptWithKey(
        encryptedData,
        iv,
        tag,
        this.keys.getKeyForVersion(keyVersion),
        context,
      );
    }

    const currentResult = this.decryptWithKey(
      encryptedData,
      iv,
      tag,
      this.config.getMasterKey(),
      context,
    );
    if (currentResult.success) {
      return currentResult;
    }

    for (const version of this.config.getRetiredKeyVersions()) {
      const retiredKey = this.config.getRetiredKey(version);
      if (!retiredKey) continue;
      const result = this.decryptWithKey(
        encryptedData,
        iv,
        tag,
        retiredKey,
        undefined,
      );
      if (result.success) {
        this.logger.debug(`Decrypted with retired key version ${version}`);
        if (context?.logOperation) {
          this.audit.logDecryption(true, context);
        }
        return result;
      }
    }

    this.audit.logDecryptionFailure(
      context,
      new Error('All key versions failed'),
    );
    return { decrypted: '', success: false };
  }

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
          v: result.keyVersion,
        };
        encryptedObj[field] = JSON.stringify(fieldData);
      }
    }

    if (context?.logOperation && fieldsToEncrypt.length > 0) {
      this.audit.logEncryption(true, {
        ...context,
        metadata: {
          ...(context.metadata ?? {}),
          fieldsCount: fieldsToEncrypt.length,
        },
      });
    }

    return encryptedObj;
  }

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
              undefined,
              encryptedData.v,
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
      this.audit.logDecryption(true, {
        ...context,
        metadata: {
          ...(context.metadata ?? {}),
          fieldsCount: fieldsToDecrypt.length,
        },
      });
    }

    return decryptedObj;
  }

  private decryptWithKey(
    encryptedData: string,
    iv: string,
    tag: string,
    encryptionKey: Buffer,
    context?: EncryptionContext,
  ): DecryptionResult {
    const { algorithm, aad } = this.config.spec;
    try {
      const decipher = crypto.createDecipheriv(
        algorithm,
        encryptionKey,
        Buffer.from(iv, 'hex'),
      );
      decipher.setAAD(aad);
      decipher.setAuthTag(Buffer.from(tag, 'hex'));

      let decrypted = decipher.update(encryptedData, 'hex', 'utf8');
      decrypted += decipher.final('utf8');

      if (context?.logOperation) {
        this.audit.logDecryption(true, context);
      }
      return { decrypted, success: true };
    } catch {
      return { decrypted: '', success: false };
    }
  }
}
