/**
 * Tenant Module Barrel Export
 *
 * Step 3 — the concrete `TenantContext` class is intentionally NOT
 * re-exported. External consumers must depend on the segregated
 * interfaces (`ITenantContextReader`, `ITenantContextWriter`,
 * `ITenantBypassController`, `ITenantIdentityResolver`,
 * `IBypassAuditWriter`) via the Symbol tokens declared in
 * `./constants/tenant.tokens`.
 *
 * The class itself is still registered inside the tenant module so
 * the `useExisting` bindings continue to resolve, but it is no
 * longer part of the module's public surface.
 */

// Contract layer
export * from './interfaces/tenant.interfaces';
export * from './interfaces/tenant-aware-entity.interface';

// DI tokens
export * from './constants/tenant.tokens';

// Public infrastructure
export * from './tenant-repository.factory';
export * from './tenant.repository';
export * from './tenant.module';
export * from './bypass-tenant-scope.decorator';
export * from './tenant.interceptor';
export * from './tenant-bypass.interceptor';

// Repository SRP providers (advanced consumers)
export * from './repository/tenant-query.filter';
export * from './repository/tenant-write.guard';
export * from './repository/tenant-rls-session.manager';
export * from './repository/unsafe-manager.gate';
