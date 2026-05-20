import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Role } from '../../entities/role.entity';
import { Permission } from '../../entities/permission.entity';
import {
  AbstractRoleRepository,
  RoleCreateInput,
} from '../abstract/role.repository.abstract';

/**
 * Postgres Role Repository
 *
 * The ONLY class inside the RBAC module that owns TypeORM's
 * `Repository<Role>`. All other rbac services depend on
 * `AbstractRoleRepository` so the ORM can be swapped without touching
 * domain logic.
 *
 * Relation Loading
 * ----------------
 * `Role.permissions` is no longer eager-loaded (Step 2). Each read path
 * declares the relations it needs:
 *
 *  - `findById`                          → bare row (admin lookups)
 *  - `findByIdWithPermissions`           → role + permissions
 *  - `findByIdWithPermissionsAndParent`  → role + permissions + parent (used
 *                                          by inheritance resolution)
 *  - `findByLegacyEnumValue` /
 *    `findSystemRoles` /
 *    `findForOrganization`               → role + permissions (legacy
 *                                          consumers expected eager load)
 *
 * If you ever feel the need to add `eager: true` back to the entity,
 * add a focused query method here instead.
 */
@Injectable()
export class PostgresRoleRepository extends AbstractRoleRepository {
  constructor(
    @InjectRepository(Role)
    private readonly roleRepository: Repository<Role>,
  ) {
    super();
  }

  // -------------------------------------------------------------------------
  // Reads
  // -------------------------------------------------------------------------

  async findById(id: string): Promise<Role | null> {
    return this.roleRepository.findOne({ where: { id } });
  }

  async findByIdWithPermissions(id: string): Promise<Role | null> {
    return this.roleRepository.findOne({
      where: { id },
      relations: ['permissions'],
    });
  }

  async findByIdWithPermissionsAndParent(id: string): Promise<Role | null> {
    return this.roleRepository.findOne({
      where: { id },
      relations: ['permissions', 'parentRole'],
    });
  }

  async findByLegacyEnumValue(value: string): Promise<Role | null> {
    return this.roleRepository.findOne({
      where: { legacyEnumValue: value },
      relations: ['permissions'],
    });
  }

  async findByOrganizationAndName(
    organizationId: string,
    name: string,
  ): Promise<Role | null> {
    return this.roleRepository.findOne({
      where: { organizationId, name },
    });
  }

  async findSystemRoles(): Promise<Role[]> {
    return this.roleRepository.find({
      where: { isSystemRole: true },
      order: { sortOrder: 'ASC' },
      relations: ['permissions'],
    });
  }

  async findForOrganization(organizationId: string): Promise<Role[]> {
    return this.roleRepository.find({
      where: [{ isSystemRole: true }, { organizationId }],
      order: { sortOrder: 'ASC' },
      relations: ['permissions'],
    });
  }

  // -------------------------------------------------------------------------
  // Writes
  // -------------------------------------------------------------------------

  async create(input: RoleCreateInput): Promise<Role> {
    const role = this.roleRepository.create({
      name: input.name,
      description: input.description,
      organizationId: input.organizationId,
      isSystemRole: input.isSystemRole,
      legacyEnumValue: input.legacyEnumValue,
      color: input.color,
      sortOrder: input.sortOrder,
      parentRoleId: input.parentRoleId,
      permissions: [...input.permissions],
    });
    return this.roleRepository.save(role);
  }

  async replacePermissions(
    role: Role,
    permissions: readonly Permission[],
  ): Promise<Role> {
    role.permissions = [...permissions];
    return this.roleRepository.save(role);
  }

  async remove(role: Role): Promise<void> {
    await this.roleRepository.remove(role);
  }
}
