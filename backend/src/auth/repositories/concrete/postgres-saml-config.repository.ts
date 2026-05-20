import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import { SAMLConfig, SAMLStatus } from '../../entities/saml-config.entity';
import { SAMLConfigRepository } from '../abstract/saml-config.repository.abstract';

/**
 * Step 2 — Concrete TypeORM implementation of the `SAMLConfigRepository`
 * DIP token. All TypeORM imports (`@InjectRepository`, `Repository`) and
 * status-enum policy are confined to this file.
 */
@Injectable()
export class PostgresSAMLConfigRepository implements SAMLConfigRepository {
  constructor(
    @InjectRepository(SAMLConfig)
    private readonly repo: Repository<SAMLConfig>,
  ) {}

  findById(id: string): Promise<SAMLConfig | null> {
    return this.repo.findOne({ where: { id } });
  }

  findActive(): Promise<SAMLConfig | null> {
    return this.repo.findOne({ where: { status: SAMLStatus.ACTIVE } });
  }

  listOrderedByCreatedDesc(): Promise<SAMLConfig[]> {
    return this.repo.find({ order: { createdAt: 'DESC' } });
  }

  create(seed: Partial<SAMLConfig>): SAMLConfig {
    return this.repo.create(seed);
  }

  save(config: SAMLConfig): Promise<SAMLConfig> {
    return this.repo.save(config);
  }

  async remove(config: SAMLConfig): Promise<void> {
    await this.repo.remove(config);
  }

  async demoteActiveConfigs(): Promise<void> {
    await this.repo.update(
      { status: SAMLStatus.ACTIVE },
      { status: SAMLStatus.INACTIVE },
    );
  }
}
