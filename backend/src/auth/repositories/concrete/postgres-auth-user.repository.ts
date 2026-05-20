import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import { User } from '../../../users/entities/user.entity';
import { AuthUserRepository } from '../abstract/auth-user.repository.abstract';

/**
 * Step 2 — Concrete TypeORM implementation of the `AuthUserRepository` DIP
 * token. All TypeORM imports (`@InjectRepository`, `Repository`) are
 * confined to this file so the auth services never inject `User` directly.
 */
@Injectable()
export class PostgresAuthUserRepository implements AuthUserRepository {
  constructor(
    @InjectRepository(User)
    private readonly repo: Repository<User>,
  ) {}

  findById(id: string): Promise<User | null> {
    return this.repo.findOne({ where: { id } });
  }

  findByEmail(email: string): Promise<User | null> {
    return this.repo.findOne({ where: { email } });
  }

  create(seed: Partial<User>): User {
    return this.repo.create(seed);
  }

  save(user: User): Promise<User> {
    return this.repo.save(user);
  }
}
