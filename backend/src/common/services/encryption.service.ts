import { Injectable, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as crypto from 'crypto';

/**
 * Service for encrypting and decrypting sensitive data using AES-256-GCM.
 *
 * Used primarily for encrypting OAuth tokens before storing in database.
 * Each encryption generates a unique IV (initialization vector) for security.
 */
@Injectable()
export class EncryptionService implements OnModuleInit {
  private readonly algorithm = 'aes-256-gcm';
  private readonly ivLength = 16; // 128 bits
  private readonly authTagLength = 16; // 128 bits
  private encryptionKey: Buffer;

  constructor(private configService: ConfigService) {}

  onModuleInit() {
    const key = this.configService.get<string>('ENCRYPTION_KEY');

    if (!key) {
      throw new Error(
        'ENCRYPTION_KEY environment variable is required for token encryption. ' +
          'Generate one with: node -e "console.log(crypto.randomBytes(32).toString(\'hex\'))"',
      );
    }

    // Validate key length (must be 64 hex characters = 32 bytes)
    if (key.length !== 64) {
      throw new Error(
        'ENCRYPTION_KEY must be 64 hexadecimal characters (32 bytes). ' +
          'Generate one with: node -e "console.log(crypto.randomBytes(32).toString(\'hex\'))"',
      );
    }

    this.encryptionKey = Buffer.from(key, 'hex');
  }

  /**
   * Encrypts a plaintext string using AES-256-GCM.
   *
   * @param plaintext - The text to encrypt
   * @returns Encrypted string in format: iv:authTag:ciphertext (all base64 encoded)
   *
   * @example
   * const encrypted = encryptionService.encrypt('my-secret-token');
   * // Returns: "a1b2c3d4....:e5f6g7h8....:i9j0k1l2...."
   */
  encrypt(plaintext: string): string {
    if (!plaintext) {
      return '';
    }

    // Generate random IV for each encryption (never reuse IVs!)
    const iv = crypto.randomBytes(this.ivLength);

    // Create cipher
    const cipher = crypto.createCipheriv(
      this.algorithm,
      this.encryptionKey,
      iv,
    );

    // Encrypt the plaintext
    let ciphertext = cipher.update(plaintext, 'utf8', 'base64');
    ciphertext += cipher.final('base64');

    // Get authentication tag (for integrity verification)
    const authTag = cipher.getAuthTag();

    // Return format: iv:authTag:ciphertext (all base64 encoded)
    return `${iv.toString('base64')}:${authTag.toString('base64')}:${ciphertext}`;
  }

  /**
   * Decrypts an encrypted string.
   *
   * @param encryptedData - Encrypted string in format: iv:authTag:ciphertext
   * @returns Decrypted plaintext
   * @throws Error if decryption fails (corrupted data or wrong key)
   *
   * @example
   * const decrypted = encryptionService.decrypt(encrypted);
   * // Returns: "my-secret-token"
   */
  decrypt(encryptedData: string): string {
    if (!encryptedData) {
      return '';
    }

    try {
      // Parse the encrypted data
      const parts = encryptedData.split(':');

      if (parts.length !== 3) {
        throw new Error('Invalid encrypted data format');
      }

      const [ivBase64, authTagBase64, ciphertext] = parts;

      // Decode from base64
      const iv = Buffer.from(ivBase64, 'base64');
      const authTag = Buffer.from(authTagBase64, 'base64');

      // Create decipher
      const decipher = crypto.createDecipheriv(
        this.algorithm,
        this.encryptionKey,
        iv,
      );
      decipher.setAuthTag(authTag);

      // Decrypt
      let plaintext = decipher.update(ciphertext, 'base64', 'utf8');
      plaintext += decipher.final('utf8');

      return plaintext;
    } catch (error) {
      throw new Error(
        `Failed to decrypt data: ${error instanceof Error ? error.message : 'Unknown error'}. ` +
          'This could indicate corrupted data or wrong encryption key.',
      );
    }
  }

  /**
   * Generates a new encryption key (for setup/key rotation).
   *
   * @returns 64-character hexadecimal string (32 bytes)
   *
   * @example
   * const newKey = EncryptionService.generateKey();
   * // Returns: "a1b2c3d4e5f6g7h8i9j0k1l2m3n4o5p6q7r8s9t0u1v2w3x4y5z6a7b8c9d0e1f2"
   */
  static generateKey(): string {
    return crypto.randomBytes(32).toString('hex');
  }

  /**
   * Tests if the service is configured correctly by encrypting and decrypting test data.
   *
   * @returns true if encryption/decryption works correctly
   * @throws Error if encryption is not working
   */
  testEncryption(): boolean {
    const testData = 'test-encryption-' + Date.now();
    const encrypted = this.encrypt(testData);
    const decrypted = this.decrypt(encrypted);

    if (decrypted !== testData) {
      throw new Error(
        'Encryption test failed: decrypted data does not match original',
      );
    }

    return true;
  }
}
