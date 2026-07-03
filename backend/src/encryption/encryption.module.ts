import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AuditModule } from '../audit/audit.module';
import { EncryptionConfig } from './config/encryption-config';
import { DatabaseEncryptionInterceptor } from './interceptors/database-encryption.interceptor';
import {
  EncryptionAuditLogger,
  FileCipher,
  Hasher,
  KeyProvider,
  KeyRotationOrchestrator,
  SecureRandom,
  SymmetricCipher,
} from './interfaces/encryption.interfaces';
import { EncryptionAuditLoggerService } from './services/encryption-audit-logger.service';
import { EncryptionConfigService } from './services/encryption-config.service';
import { FileCipherService } from './services/file-cipher.service';
import { FileEncryptionService } from './services/file-encryption.service';
import { HmacService } from './services/hmac.service';
import { KeyDerivationService } from './services/key-derivation.service';
import { KeyRotationService } from './services/key-rotation.service';
import { SecureRandomService } from './services/secure-random.service';
import { SymmetricCipherService } from './services/symmetric-cipher.service';
import {
  ENCRYPTION_AUDIT_LOGGER_TOKEN,
  ENCRYPTION_CONFIG_TOKEN,
  FILE_CIPHER_TOKEN,
  HASHER_TOKEN,
  KEY_PROVIDER_TOKEN,
  KEY_ROTATION_TOKEN,
  SECURE_RANDOM_TOKEN,
  SYMMETRIC_CIPHER_TOKEN,
} from './tokens/encryption.tokens';

/**
 * Encryption Module — SOLID layout (post-refactor).
 *
 * Eight role-segregated services, each bound behind an ISP token. The
 * abstract-class types from `./interfaces/encryption.interfaces` are
 * also re-bound to the same instances so that consumers may inject
 * either by token or by abstract class — both resolve to the same
 * singleton.
 *
 * `FileEncryptionService` (envelope/DEK flow) and
 * `DatabaseEncryptionInterceptor` remain exported as concrete classes
 * for now: the former is a domain facade with a Buffer-shaped API that
 * doesn't fit the `FileCipher` port; the latter is bound by Nest's
 * `APP_INTERCEPTOR` machinery elsewhere.
 */
@Module({
  imports: [ConfigModule, AuditModule],
  providers: [
    // Configuration — single source of mutable key state.
    { provide: ENCRYPTION_CONFIG_TOKEN, useClass: EncryptionConfigService },
    { provide: EncryptionConfig, useExisting: ENCRYPTION_CONFIG_TOKEN },

    // Audit adapter — must come before cipher (cipher depends on it).
    {
      provide: ENCRYPTION_AUDIT_LOGGER_TOKEN,
      useClass: EncryptionAuditLoggerService,
    },
    {
      provide: EncryptionAuditLogger,
      useExisting: ENCRYPTION_AUDIT_LOGGER_TOKEN,
    },

    // Key derivation.
    { provide: KEY_PROVIDER_TOKEN, useClass: KeyDerivationService },
    { provide: KeyProvider, useExisting: KEY_PROVIDER_TOKEN },

    // Symmetric cipher (string payload).
    { provide: SYMMETRIC_CIPHER_TOKEN, useClass: SymmetricCipherService },
    { provide: SymmetricCipher, useExisting: SYMMETRIC_CIPHER_TOKEN },

    // File cipher (Buffer-base64).
    { provide: FILE_CIPHER_TOKEN, useClass: FileCipherService },
    { provide: FileCipher, useExisting: FILE_CIPHER_TOKEN },

    // Hashing + HMAC.
    { provide: HASHER_TOKEN, useClass: HmacService },
    { provide: Hasher, useExisting: HASHER_TOKEN },

    // CSPRNG.
    { provide: SECURE_RANDOM_TOKEN, useClass: SecureRandomService },
    { provide: SecureRandom, useExisting: SECURE_RANDOM_TOKEN },

    // Key rotation orchestrator.
    { provide: KEY_ROTATION_TOKEN, useClass: KeyRotationService },
    { provide: KeyRotationOrchestrator, useExisting: KEY_ROTATION_TOKEN },

    // Domain facades (kept as concrete classes — see module header).
    FileEncryptionService,
    DatabaseEncryptionInterceptor,
  ],
  exports: [
    ENCRYPTION_CONFIG_TOKEN,
    EncryptionConfig,
    ENCRYPTION_AUDIT_LOGGER_TOKEN,
    EncryptionAuditLogger,
    KEY_PROVIDER_TOKEN,
    KeyProvider,
    SYMMETRIC_CIPHER_TOKEN,
    SymmetricCipher,
    FILE_CIPHER_TOKEN,
    FileCipher,
    HASHER_TOKEN,
    Hasher,
    SECURE_RANDOM_TOKEN,
    SecureRandom,
    KEY_ROTATION_TOKEN,
    KeyRotationOrchestrator,
    FileEncryptionService,
    DatabaseEncryptionInterceptor,
  ],
})
export class EncryptionModule {}
