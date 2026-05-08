import { User } from '../../users/entities/user.entity';
import {
  IUserReader,
  IUserWriter,
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
}
