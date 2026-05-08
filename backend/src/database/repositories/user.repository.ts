import { User } from '../../users/entities/user.entity';
import {
  IUserReader,
  IUserWriter,
  UserSearchRow,
  UserWithMemberships,
} from '../interfaces/repository.interfaces';
import { BaseRepository } from './base.repository';

/**
 * DIP injection token for User persistence.
 *
 * Concrete impl: `{ provide: UserRepository, useClass: TypeOrmUserRepository }`.
 */
export abstract class UserRepository
  extends BaseRepository<User>
  implements IUserReader, IUserWriter
{
  /** Lookup by unique email address (login flow). */
  abstract findByEmail(email: string): Promise<User | null>;

  /**
   * Lookup by emailVerificationToken with addSelect for the `select: false`
   * column. Returns the full User entity (token included) so the caller can
   * inspect/clear it.
   */
  abstract findByVerificationToken(token: string): Promise<User | null>;

  /**
   * Search users by name/email ILIKE term, optionally excluding members of a
   * specific project. Returns slim rows for autocomplete.
   */
  abstract searchUsers(
    term: string,
    excludeProjectId?: string,
    organizationId?: string,
  ): Promise<UserSearchRow[]>;

  /** Aggregated user list with project memberships, scoped to organization. */
  abstract findAllWithMemberships(
    organizationId?: string,
  ): Promise<UserWithMemberships[]>;

  /** Users with NO project membership, scoped to organization. */
  abstract findUnassigned(organizationId?: string): Promise<UserSearchRow[]>;
}
