import { Inject, Injectable, Logger } from '@nestjs/common';
import * as crypto from 'crypto';
import { EncryptionConfig } from '../config/encryption-config';
import { KeyProvider } from '../interfaces/encryption.interfaces';
import { ENCRYPTION_CONFIG_TOKEN } from '../tokens/encryption.tokens';

/**
 * HKDF-SHA256 purpose-key derivation (RFC 5869 / NIST SP 800-108).
 * Stateless reader over `EncryptionConfig` — every derived key is a
 * deterministic function of (masterKey, hkdfSalt, contextString).
 */
@Injectable()
export class KeyDerivationService extends KeyProvider {
  private readonly logger = new Logger(KeyDerivationService.name);

  constructor(
    @Inject(ENCRYPTION_CONFIG_TOKEN)
    private readonly config: EncryptionConfig,
  ) {
    super();
  }

  deriveKey(context: string): Buffer {
    const { keyLength, hkdfSalt } = this.config.spec;
    const derived = crypto.hkdfSync(
      'sha256',
      this.config.getMasterKey(),
      hkdfSalt,
      context,
      keyLength,
    );
    return Buffer.from(derived);
  }

  getAuditKey(): Buffer {
    return this.deriveKey('zenith-v1-audit');
  }

  getFileWrapperKey(): Buffer {
    return this.deriveKey('zenith-v1-files');
  }

  getApiKeyEncryptionKey(): Buffer {
    return this.deriveKey('zenith-v1-apikeys');
  }

  getSessionKey(): Buffer {
    return this.deriveKey('zenith-v1-sessions');
  }

  getLegacyDatabaseKey(): Buffer {
    return this.config.getMasterKey();
  }

  getKeyForVersion(version?: number): Buffer {
    const current = this.config.getCurrentKeyVersion();
    if (!version || version === 0 || version === current) {
      return this.config.getMasterKey();
    }
    const retired = this.config.getRetiredKey(version);
    if (retired) {
      return retired;
    }
    this.logger.warn(
      `Unknown key version ${version}, falling back to current key`,
    );
    return this.config.getMasterKey();
  }

  getCurrentKeyVersion(): number {
    return this.config.getCurrentKeyVersion();
  }
}
