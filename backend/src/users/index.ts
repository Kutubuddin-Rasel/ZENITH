/**
 * Public barrel for the `users` module.
 *
 * STEP 2 (Contract Segregation): only the abstract ISP contracts and their
 * matching DI tokens are exported. The concrete `UsersService`, controllers,
 * and entities are intentionally NOT re-exported — consumers must continue to
 * import them via their original deep paths until later prompts migrate every
 * consumer onto the token-based surface.
 */

export type {
  IUserProfileReader,
  IUserProfileWriter,
  IUserLifecycleManager,
  IUserEmailVerifier,
  UserDeletionResult,
  EmailVerificationResult,
} from './interfaces/user.interfaces';

export {
  USER_PROFILE_READER,
  USER_PROFILE_WRITER,
  USER_LIFECYCLE_MANAGER,
  USER_EMAIL_VERIFIER,
} from './constants/user.tokens';

export type {
  UserProfileReaderToken,
  UserProfileWriterToken,
  UserLifecycleManagerToken,
  UserEmailVerifierToken,
} from './constants/user.tokens';
