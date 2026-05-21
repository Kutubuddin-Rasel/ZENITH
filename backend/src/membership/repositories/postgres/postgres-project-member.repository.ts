import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ProjectMember } from '../../entities/project-member.entity';
import { AbstractProjectMemberRepository } from '../abstract/project-member.repository.abstract';

/**
 * Postgres Project-Member Repository
 *
 * The ONLY class inside (or outside) the membership module that owns
 * TypeORM's `Repository<ProjectMember>`. Every other consumer — services,
 * adapters, external modules — must depend on
 * `AbstractProjectMemberRepository` so the ORM can be swapped without
 * touching domain logic.
 *
 * Query Shape Notes
 * -----------------
 *  - `listByProjectWithUser` uses an explicit column projection so the
 *    User join never leaks password hashes, refresh tokens, MFA
 *    secrets, or any other sensitive credential column. Both composite
 *    PK columns (`projectId`, `userId`) are selected so DTO mapping in
 *    `ProjectMemberQueryService` has a complete shape.
 *  - `findByUser` uses `find({ select: [...] })` instead of a query
 *    builder because no joins are needed.
 *  - `countByRoleId` is a scalar `COUNT(*)` driven by the
 *    `IDX_project_member_role_id` index on the table.
 */
@Injectable()
export class PostgresProjectMemberRepository extends AbstractProjectMemberRepository {
  constructor(
    @InjectRepository(ProjectMember)
    private readonly pmRepo: Repository<ProjectMember>,
  ) {
    super();
  }

  async findOne(
    projectId: string,
    userId: string,
  ): Promise<ProjectMember | null> {
    return this.pmRepo.findOneBy({ projectId, userId });
  }

  async findByUser(userId: string): Promise<ProjectMember[]> {
    return this.pmRepo.find({
      where: { userId },
      select: ['projectId', 'userId', 'roleName'],
    });
  }

  async listByProjectWithUser(projectId: string): Promise<ProjectMember[]> {
    return this.pmRepo
      .createQueryBuilder('pm')
      .leftJoinAndSelect('pm.user', 'user')
      .where('pm.projectId = :projectId', { projectId })
      .select([
        'pm.projectId',
        'pm.userId',
        'pm.roleName',
        'user.id',
        'user.name',
        'user.email',
        'user.defaultRole',
      ])
      .getMany();
  }

  async save(pm: ProjectMember): Promise<ProjectMember> {
    return this.pmRepo.save(pm);
  }

  async remove(pm: ProjectMember): Promise<void> {
    await this.pmRepo.remove(pm);
  }

  async countByRoleId(roleId: string): Promise<number> {
    return this.pmRepo.count({ where: { roleId } });
  }
}
