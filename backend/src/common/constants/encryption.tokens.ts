/**
 * Encryption DI Token.
 *
 * Symbol-based injection token for `IEncryptionService` (defined in
 * `../interfaces/encryption.interfaces.ts`). Application services that
 * encrypt OAuth tokens, API secrets, or other PII MUST inject via this
 * token rather than the concrete `EncryptionService` class.
 *
 * USAGE:
 *   constructor(
 *     @Inject(ENCRYPTION_SERVICE_TOKEN)
 *     private readonly encryption: IEncryptionService,
 *   ) {}
 */

export const ENCRYPTION_SERVICE_TOKEN: unique symbol = Symbol(
  'ENCRYPTION_SERVICE_TOKEN',
);
