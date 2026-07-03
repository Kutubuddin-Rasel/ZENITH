import { Inject, Injectable, Logger } from '@nestjs/common';
import * as crypto from 'crypto';
import { EncryptionConfig } from '../config/encryption-config';
import { Hasher } from '../interfaces/encryption.interfaces';
import { ENCRYPTION_CONFIG_TOKEN } from '../tokens/encryption.tokens';

/**
 * SHA-256 hashing + HMAC signing with timing-safe verification.
 * Default HMAC key is the active master key from `EncryptionConfig`.
 */
@Injectable()
export class HmacService extends Hasher {
  private readonly logger = new Logger(HmacService.name);

  constructor(
    @Inject(ENCRYPTION_CONFIG_TOKEN)
    private readonly config: EncryptionConfig,
  ) {
    super();
  }

  hash(data: string): string {
    return crypto.createHash('sha256').update(data).digest('hex');
  }

  hashWithSalt(data: string, salt: string): string {
    return crypto
      .createHash('sha256')
      .update(data + salt)
      .digest('hex');
  }

  generateSignature(data: string, key?: string): string {
    const hmac = crypto.createHmac('sha256', key || this.config.getMasterKey());
    hmac.update(data);
    return hmac.digest('hex');
  }

  verifyIntegrity(data: string, signature: string, key?: string): boolean {
    try {
      const expected = this.generateSignature(data, key);
      return this.timingSafeEqual(signature, expected);
    } catch (error) {
      this.logger.error('Integrity verification failed', error);
      return false;
    }
  }

  timingSafeEqual(a: string, b: string): boolean {
    if (typeof a !== 'string' || typeof b !== 'string') {
      return false;
    }
    try {
      const aBuffer = Buffer.from(a, 'utf8');
      const bBuffer = Buffer.from(b, 'utf8');
      if (aBuffer.length !== bBuffer.length) {
        return false;
      }
      return crypto.timingSafeEqual(aBuffer, bBuffer);
    } catch {
      return false;
    }
  }
}
