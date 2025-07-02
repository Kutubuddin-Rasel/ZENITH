import { Injectable, BadRequestException } from '@nestjs/common';
import { Repository } from 'typeorm';
import { InjectRepository } from '@nestjs/typeorm';
import { ProjectMember } from '../entities/project-member.entity';

@Injectable()
export class ProjectMembersService {
  constructor(
    @InjectRepository(ProjectMember)
    private readonly pmRepo: Repository<ProjectMember>,
  ) {}

  /**
   * Add a user to a project with a specific role.
   * If user already in project:
   *   - Option A: throw an error 'already a member'
   *   - Option B: update the roleName if different
   */
  async addMemberToProject(params: {
    projectId: string;
    userId: string;
    roleName: string;
  }): Promise<ProjectMember> {
    const { projectId, userId, roleName } = params;
    const existing = await this.pmRepo.findOneBy({ projectId, userId });
    if (existing) {
      if (existing.roleName !== roleName) {
        existing.roleName = roleName;
        return this.pmRepo.save(existing);
      }
      throw new BadRequestException('User already a member of this project');
    }
    const pm = this.pmRepo.create({ projectId, userId, roleName });
    return this.pmRepo.save(pm);
  }

  /** Remove a member from a project */
  async removeMemberFromProject(
    projectId: string,
    userId: string,
  ): Promise<void> {
    const existing = await this.pmRepo.findOneBy({ projectId, userId });
    if (!existing) {
      throw new BadRequestException('User not a member of this project');
    }
    await this.pmRepo.remove(existing);
  }

  /** List all members of a project */
  async listMembers(projectId: string): Promise<any[]> {
    return this.pmRepo.createQueryBuilder('pm')
      .leftJoinAndSelect('pm.user', 'user')
      .where('pm.projectId = :projectId', { projectId })
      .select([
        'pm.userId',
        'pm.roleName',
        'user.id',
        'user.name',
        'user.email',
        'user.defaultRole',
      ])
      .getMany();
  }

  /** Get the user's roleName in a project, or null if not a member */
  async getUserRole(projectId: string, userId: string): Promise<string | null> {
    const pm = await this.pmRepo.findOneBy({ projectId, userId });
    return pm ? pm.roleName : null;
  }

  /** Update a member's role in a project */
  async updateMemberRole(
    projectId: string,
    userId: string,
    newRole: string,
  ): Promise<ProjectMember> {
    const existing = await this.pmRepo.findOneBy({ projectId, userId });
    if (!existing) {
      throw new BadRequestException('User not a member of this project');
    }
    if (existing.roleName === newRole) {
      throw new BadRequestException('User already has this role');
    }
    existing.roleName = newRole;
    return this.pmRepo.save(existing);
  }

  /**
   * List all project memberships for a user
   */
  async listMembershipsForUser(userId: string) {
    return this.pmRepo.find({
      where: { userId },
      select: ['projectId', 'roleName'],
    });
  }
}
