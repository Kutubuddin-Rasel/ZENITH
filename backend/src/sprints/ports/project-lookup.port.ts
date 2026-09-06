/**
 * Sprints Module — Outbound Port: ProjectLookupPort
 *
 * `Project` is a FOREIGN aggregate root. The legacy `SprintsService`
 * reached across the boundary by injecting `@InjectRepository(Project)`
 * and wrapping it in a `TenantRepository<Project>` (via
 * `TenantRepositoryFactory`) purely to answer ONE question on the
 * create / findAll / velocity paths: "does a project with this id
 * exist inside the caller's organization?" — it never read a single
 * `Project` field (`if (!project) throw NotFoundException`).
 *
 * This port collapses that to a tenant-scoped existence check, so the
 * sprints domain no longer depends on the `Project` entity, the ORM,
 * or the tenant-repository plumbing. The adapter
 * (`PostgresProjectLookupAdapter`) owns all of that.
 *
 * Tenant semantics: the adapter resolves `organizationId` from the
 * same async tenant context the legacy `tenantProjectRepo` used, so a
 * project belonging to another organization reads as "not found" —
 * identical behaviour, relocated behind an abstraction.
 *
 * Abstract-class-as-DI-token: the class itself IS the token, mirroring
 * `ProjectLookupPort` in the invites module (no symbol needed).
 */

export abstract class ProjectLookupPort {
  /**
   * @returns `true` iff a project with `projectId` exists within the
   *   caller's organization (tenant-scoped). Never throws for a
   *   missing project — callers map `false` to their own
   *   `NotFoundException`, preserving the legacy message.
   */
  abstract existsForTenant(projectId: string): Promise<boolean>;
}
