import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { AbstractPermissionRepository } from '../repositories/abstract/permission.repository.abstract';
import { AbstractRoleRepository } from '../repositories/abstract/role.repository.abstract';
import { permissionKey } from '../domain/role.domain';
import { STANDARD_ROLES } from '../constants/standard-roles.constant';
import type { PermissionCreateInput } from '../repositories/abstract/permission.repository.abstract';
import type { IRbacSeeder } from '../interfaces/rbac.interfaces';
import { Permission } from '../entities/permission.entity';

/**
 * RbacSeederService
 *
 * Owns the bootstrap lifecycle that used to live as `onModuleInit` on
 * the god-class. Idempotent by design: every step checks whether the
 * target row already exists before insertion.
 *
 * Concurrency note (multi-pod)
 * ----------------------------
 * Two pods racing the same cold start can each enter `seed()`
 * simultaneously. The current implementation relies on the unique
 * indexes `(roles.legacyEnumValue)` and `(permissions.resource, action)`
 * to make the loser of any insert race idempotent — failed inserts
 * surface as DB-level uniqueness errors and the seed completes without
 * data corruption. A Postgres advisory lock will be added in Step 6 to
 * eliminate the noisy duplicate-key logs entirely.
 */
@Injectable()
export class RbacSeederService implements IRbacSeeder, OnModuleInit {
  private readonly logger = new Logger(RbacSeederService.name);

  constructor(
    private readonly roleRepository: AbstractRoleRepository,
    private readonly permissionRepository: AbstractPermissionRepository,
  ) {}

  async onModuleInit(): Promise<void> {
    this.logger.log(
      'RBAC seeder running — checking for standard roles & permissions...',
    );
    try {
      await this.seed();
      this.logger.log('RBAC seeding complete');
    } catch (error) {
      this.logger.error(
        `RBAC seeding failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
      );
      // Do not throw — allow the app to start even if seeding fails.
    }
  }

  async seed(): Promise<void> {
    await this.seedPermissions();
    await this.seedStandardRoles();
  }

  // -------------------------------------------------------------------------
  // Permission catalog seeding
  // -------------------------------------------------------------------------

  private async seedPermissions(): Promise<void> {
    const required = new Set<string>();
    for (const role of STANDARD_ROLES) {
      for (const perm of role.permissions) {
        required.add(perm);
      }
    }

    const existing = await this.permissionRepository.findAll();
    const existingKeys = new Set(existing.map(permissionKey));

    const inputs: PermissionCreateInput[] = [];
    for (const permString of required) {
      if (existingKeys.has(permString)) {
        continue;
      }
      const [resource, action] = permString.split(':');
      inputs.push({
        resource,
        action,
        description: `${action} ${resource}`,
      });
    }

    if (inputs.length > 0) {
      const created = await this.permissionRepository.createMany(inputs);
      this.logger.log(`Seeded ${created.length} new permissions`);
    }
  }

  // -------------------------------------------------------------------------
  // Standard role seeding
  // -------------------------------------------------------------------------

  private async seedStandardRoles(): Promise<void> {
    for (const roleDef of STANDARD_ROLES) {
      const existing = await this.roleRepository.findByLegacyEnumValue(
        roleDef.legacyEnumValue,
      );
      if (existing) {
        this.logger.debug(`Role "${roleDef.name}" already exists, skipping`);
        continue;
      }

      const permissions = await this.hydratePermissions(roleDef.permissions);

      await this.roleRepository.create({
        name: roleDef.name,
        description: roleDef.description,
        organizationId: null,
        isSystemRole: true,
        legacyEnumValue: roleDef.legacyEnumValue,
        color: roleDef.color,
        sortOrder: roleDef.sortOrder,
        parentRoleId: null,
        permissions,
      });

      this.logger.log(
        `Seeded system role "${roleDef.name}" with ${permissions.length} permissions`,
      );
    }
  }

  private async hydratePermissions(
    permissionKeys: readonly string[],
  ): Promise<Permission[]> {
    const out: Permission[] = [];
    for (const key of permissionKeys) {
      const [resource, action] = key.split(':');
      const permission = await this.permissionRepository.findByResourceAction(
        resource,
        action,
      );
      if (permission) {
        out.push(permission);
      }
    }
    return out;
  }
}
