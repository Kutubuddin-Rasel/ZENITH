import { Inject, Injectable } from '@nestjs/common';
import * as crypto from 'crypto';
import { EncryptionConfig } from '../config/encryption-config';
import { SecureRandom } from '../interfaces/encryption.interfaces';
import { ENCRYPTION_CONFIG_TOKEN } from '../tokens/encryption.tokens';

const PASSWORD_CHARSET =
  'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789!@#$%^&*';

/**
 * CSPRNG primitives. `generateKey` / `generateIV` honor the byte
 * lengths declared in `EncryptionConfig.spec` so a future algorithm
 * swap propagates automatically.
 */
@Injectable()
export class SecureRandomService extends SecureRandom {
  constructor(
    @Inject(ENCRYPTION_CONFIG_TOKEN)
    private readonly config: EncryptionConfig,
  ) {
    super();
  }

  generateKey(): string {
    return crypto.randomBytes(this.config.spec.keyLength).toString('hex');
  }

  generateIV(): string {
    return crypto.randomBytes(this.config.spec.ivLength).toString('hex');
  }

  generateSecureRandom(length: number = 32): string {
    return crypto.randomBytes(length).toString('hex');
  }

  generateSecurePassword(length: number = 16): string {
    let password = '';
    for (let i = 0; i < length; i++) {
      password += PASSWORD_CHARSET.charAt(
        crypto.randomInt(0, PASSWORD_CHARSET.length),
      );
    }
    return password;
  }
}
