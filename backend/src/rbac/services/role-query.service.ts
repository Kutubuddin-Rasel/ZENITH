import { Injectable } from '@nestjs/common';
import { AbstractRoleRepository } from '../repositories/abstract/role.repository.abstract';
import { toRoleDetails, toRoleSummary } from '../domain/rbac.mappers';
import type {
  IRoleQueryService,
  RoleDetails,
  RoleSummary,
} from '../interfaces/rbac.interfaces';

/**
 * RoleQueryService
 *
 * Read-only projection of the role catalog. Returns DTOs (`RoleSummary`
 * / `RoleDetails`) — never TypeORM entities — so external consumers
 * remain decoupled from the persistence shape.
 */
@Injectable()
export class RoleQueryService implements IRoleQueryService {
  constructor(private readonly roleRepository: AbstractRoleRepository) {}

  async findById(id: string): Promise<RoleDetails | null> {
    const role = await this.roleRepository.findByIdWithPermissions(id);
    return role ? toRoleDetails(role) : null;
  }

  async findByLegacyEnum(enumValue: string): Promise<RoleDetails | null> {
    const role = await this.roleRepository.findByLegacyEnumValue(enumValue);
    return role ? toRoleDetails(role) : null;
  }

  async listSystemRoles(): Promise<readonly RoleSummary[]> {
    const roles = await this.roleRepository.findSystemRoles();
    return roles.map(toRoleSummary);
  }

  async listOrganizationRoles(
    organizationId: string,
  ): Promise<readonly RoleSummary[]> {
    const roles = await this.roleRepository.findForOrganization(organizationId);
    return roles.map(toRoleSummary);
  }
}
