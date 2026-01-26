/**
 * TenantModule - Provides tenant isolation infrastructure
 *
 * This module is global and provides:
 * - TenantContext: Request-scoped tenant ID storage
 * - TenantInterceptor: Extracts tenant from JWT
 * - TenantBypassInterceptor: Wires @BypassTenantScope decorator (Phase 2)
 * - TenantRepositoryFactory: Creates tenant-aware repositories
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

@Global()
@Module({
  providers: [
    TenantContext,
    TenantInterceptor,
    TenantBypassInterceptor,
    TenantRepositoryFactory,
  ],
  exports: [
    TenantContext,
    TenantInterceptor,
    TenantBypassInterceptor,
    TenantRepositoryFactory,
  ],
})
export class TenantModule {}
