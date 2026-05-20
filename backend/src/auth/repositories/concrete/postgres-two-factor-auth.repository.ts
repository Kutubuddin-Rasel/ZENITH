import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import { TwoFactorAuth } from '../../entities/two-factor-auth.entity';
import { TwoFactorAuthRepository } from '../abstract/two-factor-auth.repository.abstract';

/**
 * Step 2 — Concrete TypeORM implementation of the `TwoFactorAuthRepository`
 * DIP token. All TypeORM imports (`@InjectRepository`, `Repository`) are
 * confined to this file.
 */
@Injectable()
export class PostgresTwoFactorAuthRepository implements TwoFactorAuthRepository {
  constructor(
    @InjectRepository(TwoFactorAuth)
    private readonly repo: Repository<TwoFactorAuth>,
  ) {}

  findByUserId(userId: string): Promise<TwoFactorAuth | null> {
    return this.repo.findOne({ where: { userId } });
  }

  findEnabledByUserId(userId: string): Promise<TwoFactorAuth | null> {
    return this.repo.findOne({ where: { userId, isEnabled: true } });
  }

  create(seed: Partial<TwoFactorAuth>): TwoFactorAuth {
    return this.repo.create(seed);
  }

  save(tfa: TwoFactorAuth): Promise<TwoFactorAuth> {
    return this.repo.save(tfa);
  }

  async remove(tfa: TwoFactorAuth): Promise<void> {
    await this.repo.remove(tfa);
  }
}
