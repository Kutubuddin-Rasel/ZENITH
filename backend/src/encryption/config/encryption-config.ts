/**
 * Encryption Module — Typed Config Contract (Step 1 of SOLID refactor).
 *
 * Declares the abstract shape of the encryption configuration surface that
 * Step-2 services will depend on. The concrete `EncryptionConfigService`
 * (Step 2) is the single point of mutation for master-key material and the
 * `currentKeyVersion` — every other service treats this contract as
 * read-only except `KeyRotationService`, which uses `rotateMasterKey()` to
 * advance the version and retire the prior key in a single atomic step.
 *
 * Bound via `ENCRYPTION_CONFIG_TOKEN`
 * (see `../tokens/encryption.tokens.ts`).
 */

/**
 * Immutable algorithm parameters. These are baked into the contract because
 * changing them would invalidate every ciphertext on disk; rotation
 * operates on the key material, not the algorithm shape.
 */
export interface EncryptionAlgorithmSpec {
  /** AES variant identifier passed to `crypto.createCipheriv`. */
  readonly algorithm: 'aes-256-gcm';
  /** Key length in bytes (32 = AES-256). */
  readonly keyLength: 32;
  /** IV length in bytes (16 = 128 bits, GCM standard). */
  readonly ivLength: 16;
  /** GCM auth tag length in bytes (16 = 128 bits). */
  readonly tagLength: 16;
  /** Static HKDF salt — domain separator for derived keys. */
  readonly hkdfSalt: Buffer;
  /** AAD bound into every AES-GCM operation. */
  readonly aad: Buffer;
}

/**
 * Snapshot of mutable key state. Returned by `getKeyState()` so consumers
 * cannot hold a live reference to the mutable internals of the config
 * service.
 */
export interface EncryptionKeyState {
  readonly masterKey: Buffer;
  readonly currentKeyVersion: number;
  readonly retiredKeyVersions: readonly number[];
}

/**
 * Abstract contract bound to `ENCRYPTION_CONFIG_TOKEN`. The concrete
 * implementation lives in `services/encryption-config.service.ts` (Step 2).
 */
export abstract class EncryptionConfig {
  /**
   * Algorithm parameters (immutable for the process lifetime).
   */
  abstract readonly spec: EncryptionAlgorithmSpec;

  /**
   * Current active master key. Single source of truth for new encryption
   * operations. Mutated only by `rotateMasterKey()`.
   */
  abstract getMasterKey(): Buffer;

  /**
   * Current key version tag applied to new ciphertext. Advances by 1 on
   * every rotation.
   */
  abstract getCurrentKeyVersion(): number;

  /**
   * Look up a retired key by version. Returns `undefined` for unknown or
   * current-version requests; callers should fall back to `getMasterKey()`.
   */
  abstract getRetiredKey(version: number): Buffer | undefined;

  /**
   * Snapshot of the currently known retired key versions, descending order
   * (newest retired first) — the order in which decryption fallback should
   * probe them.
   */
  abstract getRetiredKeyVersions(): readonly number[];

  /**
   * Read-only key state snapshot. Used by `KeyRotationService` to emit
   * encryption-status reports without exposing live mutable state.
   */
  abstract getKeyState(): EncryptionKeyState;

  /**
   * Whether `ENCRYPTION_MASTER_KEY` was supplied via configuration (vs an
   * ephemeral dev-mode key). Reported in encryption status.
   */
  abstract isMasterKeyPersisted(): boolean;

  /**
   * Atomic key rotation primitive — the only mutator on this contract.
   * Retires the current key under its current version, installs
   * `newMasterKey` as the active master, and increments
   * `currentKeyVersion`. Returns the new key version so callers can wire
   * crash-recovery state.
   *
   * MUST be invoked exclusively from `KeyRotationService`.
   */
  abstract rotateMasterKey(newMasterKey: Buffer): {
    oldKeyVersion: number;
    newKeyVersion: number;
  };
}
