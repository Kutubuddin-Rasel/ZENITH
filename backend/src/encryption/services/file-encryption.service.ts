import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as crypto from 'crypto';
import * as fs from 'fs/promises';
import * as path from 'path';

export interface EncryptedFile {
  originalName: string;
  encryptedName: string;
  mimeType: string;
  size: number;
  encryptedSize: number;
  iv: string;
  tag: string;
  key: string;
  checksum: string;
}

@Injectable()
export class FileEncryptionService {
  private readonly logger = new Logger(FileEncryptionService.name);
  private readonly algorithm = 'aes-256-gcm';
  private readonly keyLength = 32; // 256 bits
  private readonly ivLength = 16; // 128 bits
  private readonly tagLength = 16; // 128 bits
  private readonly uploadPath: string;

  constructor(private configService: ConfigService) {
    this.uploadPath =
      this.configService.get<string>('UPLOAD_PATH') || './uploads';
  }

  /**
   * Encrypt a file and save it to disk
   */
  async encryptFile(
    fileBuffer: Buffer,
    originalName: string,
    mimeType: string,
  ): Promise<EncryptedFile> {
    try {
      // Generate encryption key and IV
      const key = crypto.randomBytes(this.keyLength);
      const iv = crypto.randomBytes(this.ivLength);

      // Create cipher
      const cipher = crypto.createCipheriv(this.algorithm, key, iv);
      cipher.setAAD(Buffer.from('zenith-file', 'utf8'));

      // Encrypt file content
      let encrypted = cipher.update(fileBuffer);
      encrypted = Buffer.concat([encrypted, cipher.final()]);

      const tag = cipher.getAuthTag();

      // Generate encrypted filename
      const fileExtension = path.extname(originalName);
      const baseName = path.basename(originalName, fileExtension);
      const encryptedName = `${this.generateSecureId()}.enc${fileExtension}`;

      // Calculate checksum
      const checksum = crypto
        .createHash('sha256')
        .update(fileBuffer)
        .digest('hex');

      // Save encrypted file
      const filePath = path.join(this.uploadPath, encryptedName);
      await fs.writeFile(filePath, encrypted);

      const encryptedFile: EncryptedFile = {
        originalName,
        encryptedName,
        mimeType,
        size: fileBuffer.length,
        encryptedSize: encrypted.length,
        iv: iv.toString('hex'),
        tag: tag.toString('hex'),
        key: key.toString('hex'),
        checksum,
      };

      this.logger.log(`File encrypted: ${originalName} -> ${encryptedName}`);
      return encryptedFile;
    } catch (error) {
      this.logger.error('File encryption failed', error);
      throw new Error('File encryption failed');
    }
  }

  /**
   * Decrypt a file from disk
   */
  async decryptFile(encryptedFile: EncryptedFile): Promise<Buffer> {
    try {
      const filePath = path.join(this.uploadPath, encryptedFile.encryptedName);
      const encryptedBuffer = await fs.readFile(filePath);

      // Convert hex strings back to buffers
      const key = Buffer.from(encryptedFile.key, 'hex');
      const iv = Buffer.from(encryptedFile.iv, 'hex');
      const tag = Buffer.from(encryptedFile.tag, 'hex');

      // Create decipher
      const decipher = crypto.createDecipheriv(this.algorithm, key, iv);
      decipher.setAAD(Buffer.from('zenith-file', 'utf8'));
      decipher.setAuthTag(tag);

      // Decrypt file content
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
    } catch (error) {
      this.logger.error('File decryption failed', error);
      throw new Error('File decryption failed');
    }
  }

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
      return {
        size: stats.size,
        exists: true,
      };
    } catch (error) {
      return {
        size: 0,
        exists: false,
      };
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
      const encryptedFiles = files.filter((file) => file.endsWith('.enc'));

      let totalSize = 0;
      let encryptedSize = 0;

      for (const file of encryptedFiles) {
        const filePath = path.join(this.uploadPath, file);
        const stats = await fs.stat(filePath);
        encryptedSize += stats.size;
        // Note: We can't get original size without decrypting, so we'll estimate
        totalSize += Math.round(stats.size * 0.8); // Rough estimate
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
