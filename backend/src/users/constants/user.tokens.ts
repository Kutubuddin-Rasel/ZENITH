/**
 * Dependency-injection tokens for the segregated User module contracts.
 *
 * These `unique symbol` tokens are paired with the interfaces declared in
 * `../interfaces/user.interfaces.ts`. Concrete implementations (registered in
 * a later prompt) MUST be provided against these tokens — never against the
 * concrete `UsersService` class — so that consumers depend purely on the
 * narrowest contract they require (ISP + DIP).
 *
 * Usage:
 *   constructor(
 *     @Inject(USER_PROFILE_READER)
 *     private readonly users: IUserProfileReader,
 *   ) {}
 */

export const USER_PROFILE_READER: unique symbol = Symbol('IUserProfileReader');
export const USER_PROFILE_WRITER: unique symbol = Symbol('IUserProfileWriter');
export const USER_LIFECYCLE_MANAGER: unique symbol = Symbol(
  'IUserLifecycleManager',
);
export const USER_EMAIL_VERIFIER: unique symbol = Symbol('IUserEmailVerifier');

/** Compile-time aliases — handy for typing `@Inject()` parameters. */
export type UserProfileReaderToken = typeof USER_PROFILE_READER;
export type UserProfileWriterToken = typeof USER_PROFILE_WRITER;
export type UserLifecycleManagerToken = typeof USER_LIFECYCLE_MANAGER;
export type UserEmailVerifierToken = typeof USER_EMAIL_VERIFIER;
