/**
 * Encryption Module — DI Tokens (Step 1 of SOLID refactor).
 *
 * Symbol-based injection tokens for the role-segregated ports declared in
 * `../interfaces/encryption.interfaces.ts`. Every consumer inside the
 * encryption module — and any future external consumer routed through the
 * `EncryptionModule` barrel — MUST inject through these tokens rather than
 * the concrete service classes. This preserves the DIP boundary and lets
 * the module swap implementations (e.g., HSM-backed key provider) without
 * touching call sites.
 *
 * Style matches `backend/src/common/constants/encryption.tokens.ts`:
 * `unique symbol` for collision safety, NAME mirrors the abstract class.
 */

export const ENCRYPTION_CONFIG_TOKEN: unique symbol = Symbol(
  'ENCRYPTION_CONFIG_TOKEN',
);

export const KEY_PROVIDER_TOKEN: unique symbol = Symbol('KEY_PROVIDER_TOKEN');

export const SYMMETRIC_CIPHER_TOKEN: unique symbol = Symbol(
  'SYMMETRIC_CIPHER_TOKEN',
);

export const FILE_CIPHER_TOKEN: unique symbol = Symbol('FILE_CIPHER_TOKEN');

export const HASHER_TOKEN: unique symbol = Symbol('HASHER_TOKEN');

export const SECURE_RANDOM_TOKEN: unique symbol = Symbol('SECURE_RANDOM_TOKEN');

export const KEY_ROTATION_TOKEN: unique symbol = Symbol('KEY_ROTATION_TOKEN');

export const ENCRYPTION_AUDIT_LOGGER_TOKEN: unique symbol = Symbol(
  'ENCRYPTION_AUDIT_LOGGER_TOKEN',
);
