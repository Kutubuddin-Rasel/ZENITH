/**
 * Encryption Service Contract (common Module — DIP foundation, Step 2 surface).
 *
 * Narrow surface intentionally excludes the static `generateKey` helper and
 * the self-test method, which are setup/operational concerns rather than
 * runtime usages. Application code MUST inject via `ENCRYPTION_SERVICE_TOKEN`
 * and never reference the concrete `EncryptionService` class.
 *
 * Format invariant: `encrypt` returns `iv:authTag:ciphertext` (all base64);
 * `decrypt` accepts that exact format and throws on tampering. Both
 * operations return empty string for empty input.
 */
export interface IEncryptionService {
  encrypt(plaintext: string): string;
  decrypt(encryptedData: string): string;
}
