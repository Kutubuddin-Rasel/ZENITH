import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as crypto from 'crypto';
import * as fs from 'fs/promises';
import * as path from 'path';
import { EncryptionService, EncryptionContext } from '../encryption.service';

/**
 * Legacy EncryptedFile interface (for backward compatibility).
 * Files with this structure have plaintext keys - INSECURE.
 */
export interface LegacyEncryptedFile {
  originalName: string;
  encryptedName: string;
  mimeType: string;
  size: number;
  encryptedSize: number;
  iv: string;
  tag: string;
  /** DEPRECATED: Plaintext key - security vulnerability */
  key: string;
  checksum: string;
}

/**
 * Envelope-encrypted file with wrapped DEK.
 *
 * SECURITY (Envelope Encryption):
 * - DEK (Data Encryption Key) is encrypted with KEK (Master Key)
 * - DEK is NEVER stored in plaintext
 * - Even if DB is compromised, files remain secure without KEK
 */
export interface EnvelopeEncryptedFile {
  originalName: string;
  encryptedName: string;
  mimeType: string;
  size: number;
  encryptedSize: number;

  // File encryption metadata
  fileIv: string;
  fileTag: string;

  // Wrapped DEK (encrypted with master KEK)
  wrappedKey: string;
  wrappedKeyIv: string;
  wrappedKeyTag: string;

  checksum: string;

  /** Version marker for migration (v2 = envelope encrypted) */
  version: 2;
}

/**
 * Union type for dual-read capability during migration.
 */
export type EncryptedFile = EnvelopeEncryptedFile | LegacyEncryptedFile;

/**
 * Type guard to check if file uses envelope encryption.
 */
export function isEnvelopeEncrypted(
  file: EncryptedFile,
): file is EnvelopeEncryptedFile {
  return 'wrappedKey' in file && 'version' in file && file.version === 2;
}

/**
 * Type guard to check if file is legacy format.
 */
export function isLegacyEncrypted(
  file: EncryptedFile,
): file is LegacyEncryptedFile {
  return 'key' in file && !('wrappedKey' in file);
}

@Injectable()
export class FileEncryptionService {
  private readonly logger = new Logger(FileEncryptionService.name);
  private readonly algorithm = 'aes-256-gcm';
  private readonly keyLength = 32; // 256 bits
  private readonly ivLength = 16; // 128 bits
  private readonly uploadPath: string;

  constructor(
    private configService: ConfigService,
    private encryptionService: EncryptionService,
  ) {
    this.uploadPath =
      this.configService.get<string>('UPLOAD_PATH') || './uploads';
  }

  // ============================================================================
  // ENVELOPE ENCRYPTION METHODS
  // ============================================================================

  /**
   * Wrap a DEK using the derived File Wrapper KEK.
   *
   * FLOW:
   * 1. DEK (32 bytes) is converted to hex string
   * 2. EncryptionService encrypts it with derived file wrapper key
   * 3. Returns wrapped key components
   * 4. Original DEK buffer is zeroed out
   *
   * SECURITY: Uses HKDF-derived key (zenith-v1-files) for key isolation
   */
  private wrapDEK(
    dek: Buffer,
    context?: EncryptionContext,
  ): { wrappedKey: string; wrappedKeyIv: string; wrappedKeyTag: string } {
    // Convert DEK to hex for encryption
    const dekHex = dek.toString('hex');

    // Get the derived file wrapper key (HKDF-derived)
    const fileWrapperKey = this.encryptionService.getFileWrapperKey();

    // Encrypt DEK with file wrapper KEK (not raw master key)
    const result = this.encryptionService.encrypt(
      dekHex,
      fileWrapperKey.toString('hex'),
      context,
    );

    return {
      wrappedKey: result.encrypted,
      wrappedKeyIv: result.iv,
      wrappedKeyTag: result.tag!,
    };
  }

  /**
   * Unwrap a DEK using the derived File Wrapper KEK.
   *
   * FLOW:
   * 1. EncryptionService decrypts wrapped key with derived file wrapper key
   * 2. Convert hex string back to Buffer
   * 3. Return the DEK buffer
   *
   * SECURITY: Uses HKDF-derived key (zenith-v1-files) for key isolation
   */
  private unwrapDEK(
    wrappedKey: string,
    wrappedKeyIv: string,
    wrappedKeyTag: string,
    context?: EncryptionContext,
  ): Buffer {
    // Get the derived file wrapper key (HKDF-derived)
    const fileWrapperKey = this.encryptionService.getFileWrapperKey();

    const result = this.encryptionService.decrypt(
      wrappedKey,
      wrappedKeyIv,
      wrappedKeyTag,
      fileWrapperKey.toString('hex'),
      context,
    );

    if (!result.success) {
      throw new Error('Failed to unwrap DEK: decryption failed');
    }

    return Buffer.from(result.decrypted, 'hex');
  }

  /**
   * Securely clear a buffer by overwriting with zeros.
   * Note: This is best-effort in Node.js due to GC, but still reduces attack window.
   */
  private secureClearBuffer(buffer: Buffer): void {
    crypto.randomFillSync(buffer); // Overwrite with random data
    buffer.fill(0); // Then zero it
  }

  // ============================================================================
  // FILE ENCRYPTION (Envelope Pattern)
  // ============================================================================

  /**
   * Encrypt a file using envelope encryption.
   *
   * ENVELOPE ENCRYPTION FLOW:
   * 1. Generate random DEK (Data Encryption Key)
   * 2. Encrypt file content with DEK
   * 3. Wrap (encrypt) DEK with master KEK
   * 4. Securely destroy plaintext DEK
   * 5. Return wrapped DEK + encrypted content
   *
   * The plaintext DEK NEVER leaves this method or gets stored anywhere.
   */
  async encryptFile(
    fileBuffer: Buffer,
    originalName: string,
    mimeType: string,
    context?: EncryptionContext,
  ): Promise<EnvelopeEncryptedFile> {
    // Generate fresh DEK for this file
    const dek = crypto.randomBytes(this.keyLength);
    const fileIv = crypto.randomBytes(this.ivLength);

    try {
      // Encrypt file content with DEK
      const cipher = crypto.createCipheriv(this.algorithm, dek, fileIv);
      cipher.setAAD(Buffer.from('zenith-file-v2', 'utf8'));

      let encrypted = cipher.update(fileBuffer);
      encrypted = Buffer.concat([encrypted, cipher.final()]);
      const fileTag = cipher.getAuthTag();

      // Wrap DEK with master KEK (envelope encryption)
      const wrappedDEK = this.wrapDEK(dek, {
        ...context,
        resourceType: 'file_dek',
        logOperation: true,
      });

      // Generate encrypted filename
      const fileExtension = path.extname(originalName);
      const encryptedName = `${this.generateSecureId()}.enc${fileExtension}`;

      // Calculate checksum of original content
      const checksum = crypto
        .createHash('sha256')
        .update(fileBuffer)
        .digest('hex');

      // Save encrypted file to disk
      const filePath = path.join(this.uploadPath, encryptedName);
      await fs.writeFile(filePath, encrypted);

      const result: EnvelopeEncryptedFile = {
        originalName,
        encryptedName,
        mimeType,
        size: fileBuffer.length,
        encryptedSize: encrypted.length,
        fileIv: fileIv.toString('hex'),
        fileTag: fileTag.toString('hex'),
        wrappedKey: wrappedDEK.wrappedKey,
        wrappedKeyIv: wrappedDEK.wrappedKeyIv,
        wrappedKeyTag: wrappedDEK.wrappedKeyTag,
        checksum,
        version: 2,
      };

      this.logger.log(
        `File encrypted (envelope): ${originalName} -> ${encryptedName}`,
      );

      return result;
    } finally {
      // CRITICAL: Securely destroy plaintext DEK
      this.secureClearBuffer(dek);
    }
  }

  /**
   * Decrypt a file with dual-read capability.
   *
   * MIGRATION STRATEGY:
   * - If wrappedKey exists (v2): Unwrap DEK, then decrypt file
   * - If only key exists (legacy): Use plaintext key directly (warn)
   *
   * This allows seamless migration from legacy to envelope encryption.
   */
  async decryptFile(
    encryptedFile: EncryptedFile,
    context?: EncryptionContext,
  ): Promise<Buffer> {
    let dek: Buffer;
    let fileIv: string;
    let fileTag: string;
    let aadString: string;

    try {
      // Determine key extraction method
      if (isEnvelopeEncrypted(encryptedFile)) {
        // V2: Unwrap DEK from envelope
        dek = this.unwrapDEK(
          encryptedFile.wrappedKey,
          encryptedFile.wrappedKeyIv,
          encryptedFile.wrappedKeyTag,
          {
            ...context,
            resourceType: 'file_dek',
            logOperation: true,
          },
        );
        fileIv = encryptedFile.fileIv;
        fileTag = encryptedFile.fileTag;
        aadString = 'zenith-file-v2';
      } else if (isLegacyEncrypted(encryptedFile)) {
        // Legacy: Use plaintext key directly (DEPRECATED)
        this.logger.warn(
          `Decrypting legacy file ${encryptedFile.encryptedName} with plaintext key. ` +
            'Consider re-encrypting with envelope encryption.',
        );
        dek = Buffer.from(encryptedFile.key, 'hex');
        fileIv = encryptedFile.iv;
        fileTag = encryptedFile.tag;
        aadString = 'zenith-file';
      } else {
        throw new Error('Unknown encrypted file format');
      }

      // Read encrypted file from disk
      const filePath = path.join(this.uploadPath, encryptedFile.encryptedName);
      const encryptedBuffer = await fs.readFile(filePath);

      // Decrypt file content
      const ivBuffer = Buffer.from(fileIv, 'hex');
      const tagBuffer = Buffer.from(fileTag, 'hex');

      const decipher = crypto.createDecipheriv(this.algorithm, dek, ivBuffer);
      decipher.setAAD(Buffer.from(aadString, 'utf8'));
      decipher.setAuthTag(tagBuffer);

      let decrypted = decipher.update(encryptedBuffer);
      decrypted = Buffer.concat([decrypted, decipher.final()]);

      // Verify checksum
      const checksum = crypto
        .createHash('sha256')
        .update(decrypted)
        .digest('hex');

      if (checksum !== encryptedFile.checksum) {
        throw new Error('File integrity check failed');
      }

      this.logger.log(
        `File decrypted: ${encryptedFile.encryptedName} -> ${encryptedFile.originalName}`,
      );

      return decrypted;
    } finally {
      // Securely clear DEK from memory
      if (dek!) {
        this.secureClearBuffer(dek);
      }
    }
  }

  /**
   * Re-encrypt a legacy file with envelope encryption.
   *
   * Use this to migrate files from plaintext keys to wrapped keys.
   */
  async upgradeToEnvelopeEncryption(
    legacyFile: LegacyEncryptedFile,
    context?: EncryptionContext,
  ): Promise<EnvelopeEncryptedFile> {
    // Decrypt with legacy format
    const decryptedBuffer = await this.decryptFile(legacyFile, context);

    // Re-encrypt with envelope encryption
    const envelopeFile = await this.encryptFile(
      decryptedBuffer,
      legacyFile.originalName,
      legacyFile.mimeType,
      context,
    );

    // Delete old encrypted file
    await this.deleteFile(legacyFile.encryptedName);

    this.logger.log(
      `File upgraded to envelope encryption: ${legacyFile.encryptedName} -> ${envelopeFile.encryptedName}`,
    );

    return envelopeFile;
  }

  // ============================================================================
  // FILE MANAGEMENT
  // ============================================================================

  /**
   * Delete an encrypted file
   */
  async deleteFile(encryptedName: string): Promise<void> {
    try {
      const filePath = path.join(this.uploadPath, encryptedName);
      await fs.unlink(filePath);
      this.logger.log(`File deleted: ${encryptedName}`);
    } catch (error) {
      this.logger.error('File deletion failed', error);
      throw new Error('File deletion failed');
    }
  }

  /**
   * Get file info without decrypting
   */
  async getFileInfo(
    encryptedName: string,
  ): Promise<{ size: number; exists: boolean }> {
    try {
      const filePath = path.join(this.uploadPath, encryptedName);
      const stats = await fs.stat(filePath);
      return { size: stats.size, exists: true };
    } catch {
      return { size: 0, exists: false };
    }
  }

  /**
   * Generate a secure file ID
   */
  private generateSecureId(): string {
    return crypto.randomBytes(16).toString('hex');
  }

  /**
   * Verify file integrity
   */
  async verifyFileIntegrity(encryptedFile: EncryptedFile): Promise<boolean> {
    try {
      const decryptedBuffer = await this.decryptFile(encryptedFile);
      const checksum = crypto
        .createHash('sha256')
        .update(decryptedBuffer)
        .digest('hex');
      return checksum === encryptedFile.checksum;
    } catch (error) {
      this.logger.error('File integrity verification failed', error);
      return false;
    }
  }

  /**
   * Get encryption statistics
   */
  async getEncryptionStats(): Promise<{
    totalFiles: number;
    totalSize: number;
    encryptedSize: number;
    compressionRatio: number;
  }> {
    try {
      const files = await fs.readdir(this.uploadPath);
      const encryptedFiles = files.filter((file) => file.includes('.enc'));

      let totalSize = 0;
      let encryptedSize = 0;

      for (const file of encryptedFiles) {
        const filePath = path.join(this.uploadPath, file);
        const stats = await fs.stat(filePath);
        encryptedSize += stats.size;
        totalSize += Math.round(stats.size * 0.8); // Estimate
      }

      return {
        totalFiles: encryptedFiles.length,
        totalSize,
        encryptedSize,
        compressionRatio: encryptedSize > 0 ? totalSize / encryptedSize : 0,
      };
    } catch (error) {
      this.logger.error('Failed to get encryption stats', error);
      return {
        totalFiles: 0,
        totalSize: 0,
        encryptedSize: 0,
        compressionRatio: 0,
      };
    }
  }
}
