import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { User } from '../../../users/entities/user.entity';
import { ISessionUserLookup } from '../abstract/session-store.repository';

/**
 * TypeORM-backed {@link ISessionUserLookup}. Replaces the direct
 * `Repository<User>` injection that previously lived in SessionService,
 * keeping the user-existence check inside the module's persistence layer.
 */
@Injectable()
export class PostgresSessionUserLookupRepository extends ISessionUserLookup {
  constructor(
    @InjectRepository(User)
    private readonly userRepo: Repository<User>,
  ) {
    super();
  }

  async userExists(userId: string): Promise<boolean> {
    const count = await this.userRepo.count({ where: { id: userId } });
    return count > 0;
  }
}
