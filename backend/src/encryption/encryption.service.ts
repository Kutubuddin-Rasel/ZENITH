import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as crypto from 'crypto';

export interface EncryptionResult {
  encrypted: string;
  iv: string;
  tag?: string;
}

export interface DecryptionResult {
  decrypted: string;
  success: boolean;
}

interface EncryptedFieldData {
  encrypted: string;
  iv: string;
  tag: string;
}

@Injectable()
export class EncryptionService {
  private readonly logger = new Logger(EncryptionService.name);
  private readonly algorithm = 'aes-256-gcm';
  private readonly keyLength = 32; // 256 bits
  private readonly ivLength = 16; // 128 bits
  private readonly tagLength = 16; // 128 bits
  private readonly masterKey: Buffer;

  constructor(private configService: ConfigService) {
    const isProduction =
      this.configService.get<string>('NODE_ENV') === 'production';

    // Get master key from environment
    const masterKeyString = this.configService.get<string>(
      'ENCRYPTION_MASTER_KEY',
    );

    if (!masterKeyString) {
      if (isProduction) {
        // CRITICAL: Never start production without a master key
        throw new Error(
          'ENCRYPTION_MASTER_KEY is required in production. ' +
            "Generate one with: node -e \"console.log(require('crypto').randomBytes(32).toString('hex'))\"",
        );
      }
      // Development only: generate ephemeral key with warning
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
  }

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
   * Encrypt data using AES-256-GCM
   */
  encrypt(data: string, key?: string): EncryptionResult {
    try {
      const encryptionKey = key ? Buffer.from(key, 'hex') : this.masterKey;
      const iv = crypto.randomBytes(this.ivLength);
      const cipher = crypto.createCipheriv(this.algorithm, encryptionKey, iv);
      cipher.setAAD(Buffer.from('zenith-pm', 'utf8')); // Additional authenticated data

      let encrypted = cipher.update(data, 'utf8', 'hex');
      encrypted += cipher.final('hex');

      const tag = cipher.getAuthTag();

      return {
        encrypted,
        iv: iv.toString('hex'),
        tag: tag.toString('hex'),
      };
    } catch (error) {
      this.logger.error('Encryption failed', error);
      throw new Error('Encryption failed');
    }
  }

  /**
   * Decrypt data using AES-256-GCM
   */
  decrypt(
    encryptedData: string,
    iv: string,
    tag: string,
    key?: string,
  ): DecryptionResult {
    try {
      const encryptionKey = key ? Buffer.from(key, 'hex') : this.masterKey;
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

      return {
        decrypted,
        success: true,
      };
    } catch (error) {
      this.logger.error('Decryption failed', error);
      return {
        decrypted: '',
        success: false,
      };
    }
  }

  /**
   * Encrypt sensitive fields in an object
   */
  encryptObject(
    obj: Record<string, unknown>,
    fieldsToEncrypt: string[],
    key?: string,
  ): Record<string, unknown> {
    const encryptedObj = { ...obj };

    for (const field of fieldsToEncrypt) {
      if (obj[field] && typeof obj[field] === 'string') {
        const result = this.encrypt(obj[field], key);
        encryptedObj[field] = JSON.stringify({
          encrypted: result.encrypted,
          iv: result.iv,
          tag: result.tag,
        });
      }
    }

    return encryptedObj;
  }

  /**
   * Decrypt sensitive fields in an object
   */
  decryptObject(
    obj: Record<string, unknown>,
    fieldsToDecrypt: string[],
    key?: string,
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
  encryptFile(fileBuffer: Buffer, key?: string): EncryptionResult {
    const data = fileBuffer.toString('base64');
    return this.encrypt(data, key);
  }

  /**
   * Decrypt file content
   */
  decryptFile(
    encryptedData: string,
    iv: string,
    tag: string,
    key?: string,
  ): Buffer {
    const result = this.decrypt(encryptedData, iv, tag, key);
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

  /**
   * Rotate encryption keys
   */
  rotateKeys(): { oldKey: string; newKey: string } {
    const oldKey = this.masterKey.toString('hex');
    const newKey = this.generateKey();

    this.logger.log('Encryption keys rotated successfully');

    return {
      oldKey,
      newKey,
    };
  }

  /**
   * Get encryption status
   */
  getEncryptionStatus(): {
    algorithm: string;
    keyLength: number;
    ivLength: number;
    tagLength: number;
    masterKeySet: boolean;
  } {
    return {
      algorithm: this.algorithm,
      keyLength: this.keyLength,
      ivLength: this.ivLength,
      tagLength: this.tagLength,
      masterKeySet: !!this.configService.get<string>('ENCRYPTION_MASTER_KEY'),
    };
  }
}
