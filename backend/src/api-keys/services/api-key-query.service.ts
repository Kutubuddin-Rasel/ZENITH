import { Injectable } from '@nestjs/common';
import { ApiKeySummary, IApiKeyQuery } from '../interfaces/api-keys.interfaces';
import { AbstractApiKeyRepository } from '../repositories/abstract/api-key.repository.abstract';
import { toSummary } from './api-key.mapper';

/**
 * Read-only projection of the api-keys aggregate. Returns
 * `ApiKeySummary` (never the raw entity) so `keyHash` never leaves
 * the module through the query path.
 */
@Injectable()
export class ApiKeyQueryService implements IApiKeyQuery {
  constructor(private readonly repo: AbstractApiKeyRepository) {}

  async findAllForUser(userId: string): Promise<readonly ApiKeySummary[]> {
    const rows = await this.repo.findAllByUserId(userId);
    return rows.map(toSummary);
  }

  async findOneForUser(
    id: string,
    userId: string,
  ): Promise<ApiKeySummary | null> {
    const row = await this.repo.findOneByIdForUser(id, userId);
    return row ? toSummary(row) : null;
  }
}
