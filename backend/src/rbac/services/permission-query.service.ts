import { Injectable } from '@nestjs/common';
import { AbstractPermissionRepository } from '../repositories/abstract/permission.repository.abstract';
import { toPermissionDescriptor } from '../domain/rbac.mappers';
import type {
  IPermissionQueryService,
  PermissionDescriptor,
} from '../interfaces/rbac.interfaces';

/**
 * PermissionQueryService
 *
 * Read-only projection of the global permission catalog. Returns
 * `PermissionDescriptor` DTOs only — TypeORM `Permission` entities are
 * module-internal.
 */
@Injectable()
export class PermissionQueryService implements IPermissionQueryService {
  constructor(
    private readonly permissionRepository: AbstractPermissionRepository,
  ) {}

  async listAll(): Promise<readonly PermissionDescriptor[]> {
    const permissions = await this.permissionRepository.findAllOrdered();
    return permissions.map(toPermissionDescriptor);
  }

  async groupByResource(): Promise<
    Readonly<Record<string, readonly PermissionDescriptor[]>>
  > {
    const permissions = await this.listAll();
    const grouped: Record<string, PermissionDescriptor[]> = {};
    for (const permission of permissions) {
      const bucket = grouped[permission.resource] ?? [];
      bucket.push(permission);
      grouped[permission.resource] = bucket;
    }
    return grouped;
  }
}
