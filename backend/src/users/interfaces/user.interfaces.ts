import { User } from '../entities/user.entity';
import { CreateUserDto, UpdateUserDto } from '../dto/create-user.dto';
import { UserSearchRow } from '../../database/interfaces/repository.interfaces';

/**
 * Result returned by lifecycle operations that soft-delete or anonymise a User.
 * Kept as a named type so future hardening (e.g. structured error codes) does
 * not ripple through every consumer of `IUserLifecycleManager`.
 */
export interface UserDeletionResult {
  readonly success: boolean;
}

/**
 * Result returned by the email verification flow. `message` is operator-facing
 * (idempotent already-verified vs. fresh verification) and is safe to bubble
 * to the controller layer verbatim.
 */
export interface EmailVerificationResult {
  readonly success: boolean;
  readonly message: string;
}

/**
 * Read-side contract for the User profile aggregate.
 *
 * Consumers that only need to *look up* users (auth, search, dashboards,
 * integrations) MUST depend on this token rather than the concrete
 * `UsersService` — ISP enforcement guarantees they cannot accidentally mutate
 * profile state.
 */
export interface IUserProfileReader {
  findOneById(id: string): Promise<User>;
  findOneByEmail(email: string): Promise<User | null>;
  findAll(organizationId?: string): Promise<User[]>;
  search(
    term: string,
    excludeProjectId?: string,
    organizationId?: string,
  ): Promise<UserSearchRow[]>;
}

/**
 * Write-side contract for the User profile aggregate.
 *
 * Scope is intentionally narrow — auth-secret mutation (password hashes,
 * refresh tokens, verification tokens) is NOT part of this contract and will
 * land on dedicated auth-owned writers in a later prompt.
 */
export interface IUserProfileWriter {
  update(id: string, dto: UpdateUserDto): Promise<User>;
  setActive(id: string, active: boolean): Promise<User>;
}

/**
 * Lifecycle contract for the User aggregate.
 *
 * `create` accepts the public `CreateUserDto` only; password hashing is an
 * auth-domain concern and will be orchestrated by an auth-owned collaborator
 * once Step 3 extracts secret handling out of this module.
 *
 * `deleteAccount` performs the GDPR-compliant soft-delete + anonymisation.
 * Auth-secret wiping currently lives inside the concrete implementation and
 * will move behind a `UserDeletedEvent` consumer in a later prompt.
 */
export interface IUserLifecycleManager {
  create(dto: CreateUserDto, organizationId?: string): Promise<User>;
  deleteAccount(id: string): Promise<UserDeletionResult>;
}

/**
 * Email verification contract.
 *
 * Single-method interface — kept segregated because the verification flow is
 * the only endpoint that is intentionally unauthenticated and therefore
 * deserves a distinct DI surface.
 */
export interface IUserEmailVerifier {
  verifyEmail(token: string): Promise<EmailVerificationResult>;
}
