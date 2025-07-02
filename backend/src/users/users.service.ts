import { Injectable, NotFoundException, BadRequestException, ForbiddenException } from '@nestjs/common';
import { Repository } from 'typeorm';
import { InjectRepository } from '@nestjs/typeorm';
import { User } from './entities/user.entity';
import { Brackets } from 'typeorm';
import * as bcrypt from 'bcrypt';
import { ChangePasswordDto } from './dto/create-user.dto';

@Injectable()
export class UsersService {
  constructor(
    @InjectRepository(User)
    private readonly userRepo: Repository<User>,
  ) {}

  /** Create a new user */
  async create(
    email: string,
    passwordHash: string,
    name: string,
    defaultRole?: string,
  ): Promise<User> {
    const user = this.userRepo.create({ email, passwordHash, name, defaultRole });
    return this.userRepo.save(user);
  }

  /** Get all users */
  async findAll(): Promise<User[]> {
    return this.userRepo.find();
  }

  /** Get one user by ID, or throw if not found */
  async findOneById(id: string): Promise<User> {
    const user = await this.userRepo.findOneBy({ id });
    if (!user) {
      throw new NotFoundException(`User with ID ${id} not found`);
    }
    return user;
  }

  /** Get one user by email, or null if not found */
  async findOneByEmail(email: string): Promise<User | null> {
    return this.userRepo.findOneBy({ email: email.toLowerCase() });
  }

  /** Activate or deactivate a user */
  async setActive(id: string, active: boolean): Promise<User> {
    const user = await this.findOneById(id);
    user.isActive = active;
    return this.userRepo.save(user);
  }

  async search(term: string, excludeProjectId?: string): Promise<Partial<User>[]> {
    try {
      const qb = this.userRepo
        .createQueryBuilder('user')
        .select(['user.id', 'user.name', 'user.email', 'user.defaultRole'])
        .where(
          new Brackets((qb) => {
            qb.where('user.name ILIKE :term', { term: `%${term}%` }).orWhere(
              'user.email ILIKE :term', { term: `%${term}%` }
            );
          }),
        );

      if (excludeProjectId) {
        qb.andWhere((qb) => {
          const subQuery = qb
            .subQuery()
            .select('pm.userId')
            .from('project_members', 'pm')
            .where('pm.projectId = :projectId', { projectId: excludeProjectId })
            .getQuery();
          return 'user.id NOT IN ' + subQuery;
        });
      }

      return qb.take(10).getRawMany();
    } catch (err) {
      console.error('Error in search:', err);
      throw err;
    }
  }

  async update(id: string, dto: Partial<User>): Promise<User> {
    const user = await this.findOneById(id);
    if (dto.name !== undefined) user.name = dto.name;
    if (dto.avatarUrl !== undefined) user.avatarUrl = dto.avatarUrl;
    if (dto.defaultRole !== undefined) user.defaultRole = dto.defaultRole;
    return this.userRepo.save(user);
  }

  /** Get all users with their project memberships */
  async findAllWithProjectMemberships(): Promise<any[]> {
    // Get all users
    const users = await this.userRepo.find();
    // Get all project memberships with project info
    const memberships = await this.userRepo.manager.getRepository('project_members').createQueryBuilder('pm')
      .leftJoinAndSelect('pm.project', 'project')
      .getMany();
    // Map userId to memberships
    const membershipsByUser: Record<string, any[]> = {};
    for (const m of memberships) {
      if (!membershipsByUser[m.userId]) membershipsByUser[m.userId] = [];
      membershipsByUser[m.userId].push({
        projectId: m.projectId,
        projectName: m.project?.name,
        projectKey: m.project?.key,
        roleName: m.roleName,
      });
    }
    // Return users with memberships
    return users.map(u => ({
      ...u,
      projectMemberships: membershipsByUser[u.id] || [],
    }));
  }

  /** List all users not assigned to any project */
  async findUnassigned(): Promise<Partial<User>[]> {
    try {
      return await this.userRepo
        .createQueryBuilder('user')
        .leftJoin('project_members', 'pm', 'pm.userId = user.id')
        .where('pm.userId IS NULL')
        .select(['user.id', 'user.name', 'user.email', 'user.defaultRole'])
        .getMany();
    } catch (err) {
      console.error('Error in findUnassigned:', err);
      throw err;
    }
  }

  /** Change a user's password */
  async changePassword(id: string, dto: ChangePasswordDto, isSuperAdmin: boolean): Promise<{ success: boolean }> {
    const user = await this.findOneById(id);
    // If not super admin, verify current password
    if (!isSuperAdmin) {
      if (!dto.currentPassword) throw new BadRequestException('Current password required');
      const valid = await bcrypt.compare(dto.currentPassword, user.passwordHash);
      if (!valid) throw new ForbiddenException('Current password is incorrect');
    }
    if (!dto.newPassword || dto.newPassword.length < 6) {
      throw new BadRequestException('New password must be at least 6 characters');
    }
    if (dto.newPassword !== dto.confirmNewPassword) {
      throw new BadRequestException('New password and confirmation do not match');
    }
    user.passwordHash = await bcrypt.hash(dto.newPassword, 10);
    await this.userRepo.save(user);
    return { success: true };
  }
}
