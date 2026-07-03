import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as crypto from 'crypto';
import {
  EncryptionAlgorithmSpec,
  EncryptionConfig,
  EncryptionKeyState,
} from '../config/encryption-config';

/**
 * Single source of truth for AES-GCM parameters, master-key material,
 * and the retired-keys map. The ONLY service in the encryption module
 * that owns mutable cryptographic state — everyone else treats this
 * contract as read-only, except `KeyRotationService` which invokes the
 * dedicated `rotateMasterKey()` mutator.
 */
@Injectable()
export class EncryptionConfigService extends EncryptionConfig {
  private readonly logger = new Logger(EncryptionConfigService.name);

  readonly spec: EncryptionAlgorithmSpec = {
    algorithm: 'aes-256-gcm',
    keyLength: 32,
    ivLength: 16,
    tagLength: 16,
    hkdfSalt: Buffer.from('zenith-project-management-v1', 'utf8'),
    aad: Buffer.from('zenith-pm', 'utf8'),
  };

  private masterKey: Buffer;
  private currentKeyVersion: number;
  private readonly retiredKeys: Map<number, Buffer> = new Map();
  private readonly masterKeyPersisted: boolean;

  constructor(private readonly configService: ConfigService) {
    super();
    const isProduction =
      this.configService.get<string>('NODE_ENV') === 'production';

    const masterKeyString = this.configService.get<string>(
      'ENCRYPTION_MASTER_KEY',
    );
    this.masterKeyPersisted = !!masterKeyString;

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
      this.masterKey = crypto.randomBytes(this.spec.keyLength);
    } else {
      this.masterKey = Buffer.from(masterKeyString, 'hex');
    }

    if (this.masterKey.length !== this.spec.keyLength) {
      throw new Error(
        `Master key must be ${this.spec.keyLength * 2} hex characters (${this.spec.keyLength} bytes)`,
      );
    }

    const retiredKeysString = this.configService.get<string>(
      'ENCRYPTION_RETIRED_KEYS',
    );
    if (retiredKeysString) {
      this.loadRetiredKeys(retiredKeysString);
    }
  }

  getMasterKey(): Buffer {
    return this.masterKey;
  }

  getCurrentKeyVersion(): number {
    return this.currentKeyVersion;
  }

  getRetiredKey(version: number): Buffer | undefined {
    return this.retiredKeys.get(version);
  }

  getRetiredKeyVersions(): readonly number[] {
    return Array.from(this.retiredKeys.keys()).sort((a, b) => b - a);
  }

  getKeyState(): EncryptionKeyState {
    return {
      masterKey: this.masterKey,
      currentKeyVersion: this.currentKeyVersion,
      retiredKeyVersions: this.getRetiredKeyVersions(),
    };
  }

  isMasterKeyPersisted(): boolean {
    return this.masterKeyPersisted;
  }

  rotateMasterKey(newMasterKey: Buffer): {
    oldKeyVersion: number;
    newKeyVersion: number;
  } {
    if (newMasterKey.length !== this.spec.keyLength) {
      throw new Error(
        `New master key must be ${this.spec.keyLength} bytes (got ${newMasterKey.length})`,
      );
    }

    const oldKeyVersion = this.currentKeyVersion;
    const newKeyVersion = oldKeyVersion + 1;

    this.retiredKeys.set(oldKeyVersion, this.masterKey);
    this.masterKey = newMasterKey;
    this.currentKeyVersion = newKeyVersion;

    return { oldKeyVersion, newKeyVersion };
  }

  /**
   * Format: "version:hexkey,version:hexkey". Malformed entries are
   * skipped with a warning rather than failing the bootstrap — a typo
   * in `ENCRYPTION_RETIRED_KEYS` must not crash the process.
   */
  private loadRetiredKeys(retiredKeysString: string): void {
    try {
      const pairs = retiredKeysString.split(',');
      for (const pair of pairs) {
        const [versionStr, hexKey] = pair.trim().split(':');
        const version = parseInt(versionStr, 10);
        if (!isNaN(version) && hexKey) {
          const keyBuffer = Buffer.from(hexKey, 'hex');
          if (keyBuffer.length === this.spec.keyLength) {
            this.retiredKeys.set(version, keyBuffer);
            this.logger.log(`Loaded retired key version ${version}`);
          }
        }
      }
    } catch (error) {
      this.logger.error('Failed to load retired keys', error);
    }
  }
}
