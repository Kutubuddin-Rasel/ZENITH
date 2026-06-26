/**
 * TenantWriteGuard — write-side SRP provider.
 *
 * Centralises the two defence-in-depth checks that previously lived
 * inside `TenantRepository`:
 *
 *   - `validateTenantOnWrite` — invoked before save/insert to reject
 *     payloads whose `organizationId` does not match the active
 *     tenant.
 *   - `validateTenantOwnership` — invoked just-in-time before
 *     remove/delete to block IDOR attempts on entities loaded outside
 *     the current tenant scope.
 *
 * DIP: depends on `ITenantContextReader` via the segregated token.
 */

import { ForbiddenException, Inject, Injectable, Logger } from '@nestjs/common';
import type { DeepPartial } from 'typeorm';
import { TENANT_CONTEXT_READER_TOKEN } from '../constants/tenant.tokens';
import type { ITenantContextReader } from '../interfaces/tenant.interfaces';
import type { TenantAwareEntity } from '../interfaces/tenant-aware-entity.interface';

@Injectable()
export class TenantWriteGuard {
  private readonly logger = new Logger(TenantWriteGuard.name);

  constructor(
    @Inject(TENANT_CONTEXT_READER_TOKEN)
    private readonly reader: ITenantContextReader,
  ) {}

  /**
   * Reject payloads whose `organizationId` differs from the active
   * tenant context.
   *
   * No-op when bypass is active or no tenant is bound — the legitimate
   * cross-tenant flows must explicitly opt out via `enableBypass`,
   * which is audited (Phase 1).
   */
  validateTenantOnWrite<T extends TenantAwareEntity>(
    entity: DeepPartial<T>,
  ): void {
    if (this.reader.isBypassEnabled()) {
      return;
    }

    const currentTenantId = this.reader.getTenantId();
    if (!currentTenantId) return;

    const entityOrgId = (entity as TenantAwareEntity).organizationId;
    if (entityOrgId === undefined) return;

    if (entityOrgId !== currentTenantId) {
      this.logger.error(
        `Tenant violation detected! Context: ${currentTenantId}, Entity: ${entityOrgId}`,
      );
      throw new ForbiddenException(
        'Cannot write entity belonging to different organization',
      );
    }
  }

  /**
   * Just-in-time ownership check before destructive operations.
   *
   * ZERO TRUST: even if the caller obtained the entity through a
   * tenant-filtered read, we re-check ownership here because the
   * entity could have been cached, serialised across contexts, or
   * loaded under a bypass that has since been disabled.
   */
  validateTenantOwnership<T extends TenantAwareEntity>(entity: T): void {
    if (this.reader.isBypassEnabled()) {
      this.logger.debug(
        'Bypass enabled - skipping tenant ownership validation for remove',
      );
      return;
    }

    const currentTenantId = this.reader.getTenantId();
    if (!currentTenantId) {
      this.logger.debug(
        'No tenant context - skipping ownership validation for remove',
      );
      return;
    }

    const entityOrgId = (entity as TenantAwareEntity).organizationId;
    if (entityOrgId === undefined) {
      this.logger.debug(
        'Entity has no organizationId - skipping ownership validation',
      );
      return;
    }

    if (entityOrgId !== currentTenantId) {
      this.logger.error(
        `IDOR ATTACK BLOCKED: Attempted to delete entity ` +
          `(org: ${entityOrgId}) from context (tenant: ${currentTenantId})`,
      );
      throw new ForbiddenException(
        'Cannot delete entity belonging to different organization',
      );
    }
  }
}
