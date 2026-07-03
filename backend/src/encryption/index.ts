/**
 * Encryption Module — Public Barrel (SEALED, Step 3).
 *
 * STRICT BOUNDARY: only the `EncryptionModule` class, the seven
 * role-based abstract contracts, the eight ISP tokens, the
 * `EncryptionConfig` shape, and the public value types / file-envelope
 * vocabulary cross this seam. Concrete services, the file-envelope
 * service implementation, the database interceptor class, and the
 * encryption-config service are module-internal — consumers must inject
 * by token (or by the abstract class, which is aliased to the same
 * singleton).
 *
 * DELIBERATELY NOT EXPORTED
 * -------------------------
 *  - `services/encryption-config.service`            → bound behind
 *                                                      `ENCRYPTION_CONFIG_TOKEN` /
 *                                                      `EncryptionConfig`.
 *  - `services/key-derivation.service`               → bound behind
 *                                                      `KEY_PROVIDER_TOKEN` /
 *                                                      `KeyProvider`.
 *  - `services/symmetric-cipher.service`             → bound behind
 *                                                      `SYMMETRIC_CIPHER_TOKEN` /
 *                                                      `SymmetricCipher`.
 *  - `services/file-cipher.service`                  → bound behind
 *                                                      `FILE_CIPHER_TOKEN` /
 *                                                      `FileCipher`.
 *  - `services/hmac.service`                         → bound behind
 *                                                      `HASHER_TOKEN` /
 *                                                      `Hasher`.
 *  - `services/secure-random.service`                → bound behind
 *                                                      `SECURE_RANDOM_TOKEN` /
 *                                                      `SecureRandom`.
 *  - `services/key-rotation.service`                 → bound behind
 *                                                      `KEY_ROTATION_TOKEN` /
 *                                                      `KeyRotationOrchestrator`.
 *  - `services/encryption-audit-logger.service`      → bound behind
 *                                                      `ENCRYPTION_AUDIT_LOGGER_TOKEN` /
 *                                                      `EncryptionAuditLogger`;
 *                                                      this is the ONLY
 *                                                      service permitted to
 *                                                      inject the concrete
 *                                                      `AuditService`.
 *  - `interceptors/database-encryption.interceptor` → wired via
 *                                                      `EncryptionModule`
 *                                                      providers; consumers
 *                                                      should reach it
 *                                                      through
 *                                                      `APP_INTERCEPTOR`
 *                                                      bindings, not direct
 *                                                      import.
 *  - `services/file-encryption.service`              → re-exported as the
 *                                                      envelope-encryption
 *                                                      domain facade
 *                                                      (Buffer-shaped API
 *                                                      that doesn't fit the
 *                                                      `FileCipher` port).
 *  - `config/https.config`                           → standalone HTTPS
 *                                                      utility consumed by
 *                                                      `main.ts` directly,
 *                                                      not via DI; not
 *                                                      part of this module's
 *                                                      injection surface.
 *
 * BOUNDARY SWEEP (post-Step-3 invariant):
 *   grep -rEn "from ['\"].*encryption/(encryption\.module|services/|\
 *             interceptors/|interfaces/|tokens/|config/encryption-config)" \
 *     backend/src --include="*.ts" \
 *     | grep -v "^backend/src/encryption/"
 *   → MUST return zero matches.
 */

export { EncryptionModule } from './encryption.module';

export {
  EncryptionConfig,
  type EncryptionAlgorithmSpec,
  type EncryptionKeyState,
} from './config/encryption-config';

export {
  EncryptionAuditLogger,
  FileCipher,
  Hasher,
  KeyProvider,
  KeyRotationOrchestrator,
  SecureRandom,
  SymmetricCipher,
  type DecryptionResult,
  type EncryptedFieldData,
  type EncryptionContext,
  type EncryptionResult,
  type EncryptionStatusReport,
  type KeyRotationProgress,
  type KeyRotationResult,
  type ReEncryptionCallback,
} from './interfaces/encryption.interfaces';

export {
  ENCRYPTION_AUDIT_LOGGER_TOKEN,
  ENCRYPTION_CONFIG_TOKEN,
  FILE_CIPHER_TOKEN,
  HASHER_TOKEN,
  KEY_PROVIDER_TOKEN,
  KEY_ROTATION_TOKEN,
  SECURE_RANDOM_TOKEN,
  SYMMETRIC_CIPHER_TOKEN,
} from './tokens/encryption.tokens';

export {
  FileEncryptionService,
  isEnvelopeEncrypted,
  isLegacyEncrypted,
  type EncryptedFile,
  type EnvelopeEncryptedFile,
  type LegacyEncryptedFile,
} from './services/file-encryption.service';
