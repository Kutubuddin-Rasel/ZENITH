/**
 * TenantModule - Provides tenant isolation infrastructure
 *
 * This module is global and provides:
 * - TenantContext: Request-scoped tenant ID storage
 * - TenantInterceptor: Extracts tenant from JWT
 * - TenantBypassInterceptor: Wires @BypassTenantScope decorator (Phase 2)
 * - TenantRepositoryFactory: Creates tenant-aware repositories
 *
 * SOLID Refactor (Step 1) — segregated DI tokens:
 *   The concrete `TenantContext` is also bound to three ISP-compliant
 *   tokens (reader / writer / bypass-controller) via `useExisting`,
 *   and `JwtTenantIdentityResolver` is bound as the default
 *   `ITenantIdentityResolver`. Consumers may continue to inject the
 *   concrete `TenantContext` during the transitional window — Step 3
 *   migrates them to the segregated tokens.
 *
 * Usage in other modules:
 *   constructor(
 *     private readonly tenantRepoFactory: TenantRepositoryFactory,
 *     @InjectRepository(Issue) issueRepo: Repository<Issue>,
 *   ) {
 *     this.tenantIssueRepo = tenantRepoFactory.create(issueRepo);
 *   }
 */

import { Global, Module } from '@nestjs/common';
import { TenantContext } from './tenant-context.service';
import { TenantInterceptor } from './tenant.interceptor';
import { TenantBypassInterceptor } from './tenant-bypass.interceptor';
import { TenantRepositoryFactory } from './tenant-repository.factory';
import { JwtTenantIdentityResolver } from './adapters/jwt-tenant-identity.resolver';
import { TenantQueryFilter } from './repository/tenant-query.filter';
import { TenantWriteGuard } from './repository/tenant-write.guard';
import { TenantRlsSessionManager } from './repository/tenant-rls-session.manager';
import { UnsafeManagerGate } from './repository/unsafe-manager.gate';
import {
  TENANT_BYPASS_CONTROLLER_TOKEN,
  TENANT_CONTEXT_READER_TOKEN,
  TENANT_CONTEXT_WRITER_TOKEN,
  TENANT_IDENTITY_RESOLVER_TOKEN,
} from './constants/tenant.tokens';

@Global()
@Module({
  providers: [
    TenantContext,
    TenantInterceptor,
    TenantBypassInterceptor,
    TenantRepositoryFactory,
    JwtTenantIdentityResolver,
    // Step 2 — SRP-decomposed repository providers (singletons).
    TenantQueryFilter,
    TenantWriteGuard,
    TenantRlsSessionManager,
    UnsafeManagerGate,
    // Step 1 — segregated contract bindings (backward compatible).
    {
      provide: TENANT_CONTEXT_READER_TOKEN,
      useExisting: TenantContext,
    },
    {
      provide: TENANT_CONTEXT_WRITER_TOKEN,
      useExisting: TenantContext,
    },
    {
      provide: TENANT_BYPASS_CONTROLLER_TOKEN,
      useExisting: TenantContext,
    },
    {
      provide: TENANT_IDENTITY_RESOLVER_TOKEN,
      useExisting: JwtTenantIdentityResolver,
    },
  ],
  exports: [
    TenantContext,
    TenantInterceptor,
    TenantBypassInterceptor,
    TenantRepositoryFactory,
    TenantQueryFilter,
    TenantWriteGuard,
    TenantRlsSessionManager,
    UnsafeManagerGate,
    TENANT_CONTEXT_READER_TOKEN,
    TENANT_CONTEXT_WRITER_TOKEN,
    TENANT_BYPASS_CONTROLLER_TOKEN,
    TENANT_IDENTITY_RESOLVER_TOKEN,
  ],
})
export class TenantModule {}
