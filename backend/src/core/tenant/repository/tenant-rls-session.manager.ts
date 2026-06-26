/**
 * TenantRlsSessionManager — Postgres Row-Level Security orchestration.
 *
 * Encapsulates the `SET LOCAL app.current_tenant` / `RESET` lifecycle
 * that drives the RLS policies declared in
 * `1735500100000-EnableRowLevelSecurity.ts`. Stateless — operates on
 * the EntityManager passed in by the caller (typically a transaction
 * manager), so this provider is a singleton.
 *
 * DIP: depends on `ITenantContextReader` via the segregated token.
 *
 * ⚠️  CALLER CONTRACT
 *     `setDbSession` MUST run inside an open transaction. `SET LOCAL`
 *     is scoped to the current transaction; calling it on a pooled
 *     auto-commit connection would either no-op or leak state across
 *     requests.
 */

import { Inject, Injectable, Logger } from '@nestjs/common';
import type { EntityManager } from 'typeorm';
import { TENANT_CONTEXT_READER_TOKEN } from '../constants/tenant.tokens';
import type { ITenantContextReader } from '../interfaces/tenant.interfaces';

@Injectable()
export class TenantRlsSessionManager {
  private readonly logger = new Logger(TenantRlsSessionManager.name);

  constructor(
    @Inject(TENANT_CONTEXT_READER_TOKEN)
    private readonly reader: ITenantContextReader,
  ) {}

  /**
   * Bind `app.current_tenant` for the current transaction. RLS
   * policies that gate row visibility on this variable will then
   * enforce isolation at the database level.
   *
   * No-op when bypass is enabled or no tenant is bound — the RLS
   * policies treat NULL as "all rows".
   */
  async setDbSession(manager: EntityManager): Promise<void> {
    if (this.reader.isBypassEnabled()) {
      this.logger.debug('Bypass enabled - skipping RLS session variable');
      return;
    }

    const tenantId = this.reader.getTenantId();
    if (!tenantId) {
      this.logger.debug('No tenant context - skipping RLS session variable');
      return;
    }

    await manager.query('SET LOCAL app.current_tenant = $1', [tenantId]);
    this.logger.debug(
      `RLS session variable set: app.current_tenant = ${tenantId}`,
    );
  }

  /**
   * Explicit cleanup — `SET LOCAL` clears at transaction end, but
   * this hook is exposed for long-lived sessions or test harnesses.
   */
  async resetDbSession(manager: EntityManager): Promise<void> {
    await manager.query('RESET app.current_tenant');
    this.logger.debug('RLS session variable reset');
  }
}
