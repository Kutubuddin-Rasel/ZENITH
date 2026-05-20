import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { Permission } from '../../entities/permission.entity';
import {
  AbstractPermissionRepository,
  PermissionCreateInput,
} from '../abstract/permission.repository.abstract';

/**
 * Postgres Permission Repository
 *
 * The ONLY class inside the RBAC module that owns TypeORM's
 * `Repository<Permission>`. All other services consume
 * `AbstractPermissionRepository`.
 */
@Injectable()
export class PostgresPermissionRepository extends AbstractPermissionRepository {
  constructor(
    @InjectRepository(Permission)
    private readonly permissionRepository: Repository<Permission>,
  ) {
    super();
  }

  async findAll(): Promise<Permission[]> {
    return this.permissionRepository.find();
  }

  async findAllOrdered(): Promise<Permission[]> {
    return this.permissionRepository.find({
      order: { resource: 'ASC', action: 'ASC' },
    });
  }

  async findByIds(ids: readonly string[]): Promise<Permission[]> {
    if (ids.length === 0) {
      return [];
    }
    return this.permissionRepository.find({
      where: { id: In([...ids]) },
    });
  }

  async findByResourceAction(
    resource: string,
    action: string,
  ): Promise<Permission | null> {
    return this.permissionRepository.findOne({
      where: { resource, action },
    });
  }

  async createMany(
    inputs: readonly PermissionCreateInput[],
  ): Promise<Permission[]> {
    if (inputs.length === 0) {
      return [];
    }
    const entities = inputs.map((input) =>
      this.permissionRepository.create({
        resource: input.resource,
        action: input.action,
        description: input.description ?? null,
        displayName: input.displayName ?? null,
      }),
    );
    return this.permissionRepository.save(entities);
  }
}
