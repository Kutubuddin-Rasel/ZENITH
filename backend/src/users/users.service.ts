import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
} from '@nestjs/common';
import { Repository } from 'typeorm';
import { InjectRepository } from '@nestjs/typeorm';
import { User } from './entities/user.entity';
import { Brackets } from 'typeorm';
import * as argon2 from 'argon2';
import { ChangePasswordDto } from './dto/create-user.dto';

interface RawUserRow {
  user_id: string;
  user_name: string;
  user_email: string;
  user_avatarUrl: string;
  user_isActive: boolean;
  user_isSuperAdmin: boolean;
  user_defaultRole: string;
  pm_projectId: string | null;
  pm_roleName: string | null;
  project_id: string | null;
  project_name: string | null;
  project_key: string | null;
}

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
    isSuperAdmin?: boolean,
    organizationId?: string,
    defaultRole?: string,
    passwordVersion: number = 1,
  ): Promise<User> {
    const user = this.userRepo.create({
      email,
      passwordHash,
      name,
      isSuperAdmin: isSuperAdmin || false,
      organizationId,
      defaultRole,
      passwordVersion,
    });
    return this.userRepo.save(user);
  }

  /** Get all users (scoped to organization if provided) */
  async findAll(organizationId?: string): Promise<User[]> {
    if (organizationId) {
      return this.userRepo.find({ where: { organizationId } });
    }
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

  async search(
    term: string,
    excludeProjectId?: string,
    organizationId?: string,
  ): Promise<Partial<User>[]> {
    try {
      const qb = this.userRepo
        .createQueryBuilder('user')
        .select(['user.id', 'user.name', 'user.email', 'user.defaultRole'])
        .where(
          new Brackets((qb) => {
            qb.where('user.name ILIKE :term', { term: `%${term}%` }).orWhere(
              'user.email ILIKE :term',
              { term: `%${term}%` },
            );
          }),
        );

      // Filter by organization
      if (organizationId) {
        qb.andWhere('user.organizationId = :organizationId', {
          organizationId,
        });
      }

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
    if (dto.organizationId !== undefined)
      user.organizationId = dto.organizationId;
    if (dto.hashedRefreshToken !== undefined)
      user.hashedRefreshToken = dto.hashedRefreshToken;
    if (dto.passwordHash !== undefined) user.passwordHash = dto.passwordHash;
    if (dto.passwordVersion !== undefined)
      user.passwordVersion = dto.passwordVersion;
    return this.userRepo.save(user);
  }

  /** Get all users with their project memberships (scoped to organization) */
  async findAllWithProjectMemberships(organizationId?: string): Promise<any[]> {
    const qb = this.userRepo
      .createQueryBuilder('user')
      .leftJoinAndSelect('project_members', 'pm', 'pm.userId = user.id')
      .leftJoinAndSelect('pm.project', 'project')
      .select([
        'user.id',
        'user.name',
        'user.email',
        'user.avatarUrl',
        'user.isActive',
        'user.isSuperAdmin',
        'user.defaultRole',
        'pm.projectId',
        'pm.roleName',
        'project.id',
        'project.name',
        'project.key',
      ]);

    if (organizationId) {
      qb.where('user.organizationId = :organizationId', { organizationId });
    }

    const rawResults = await qb.getRawMany<RawUserRow>();

    // Group by user
    interface UserMapValue {
      id: string;
      name: string;
      email: string;
      avatarUrl: string;
      isActive: boolean;
      isSuperAdmin: boolean;
      defaultRole: string;
      projectMemberships: {
        projectId: string;
        projectName: string | null;
        projectKey: string | null;
        roleName: string | null;
      }[];
    }
    const usersMap = new Map<string, UserMapValue>();

    for (const row of rawResults) {
      if (!usersMap.has(row.user_id)) {
        usersMap.set(row.user_id, {
          id: row.user_id,
          name: row.user_name,
          email: row.user_email,
          avatarUrl: row.user_avatarUrl,
          isActive: row.user_isActive,
          isSuperAdmin: row.user_isSuperAdmin,
          defaultRole: row.user_defaultRole,
          projectMemberships: [],
        });
      }

      if (row.pm_projectId) {
        usersMap.get(row.user_id)!.projectMemberships.push({
          projectId: row.pm_projectId,
          projectName: row.project_name,
          projectKey: row.project_key,
          roleName: row.pm_roleName,
        });
      }
    }

    return Array.from(usersMap.values());
  }

  /** List all users not assigned to any project (scoped to organization) */
  async findUnassigned(organizationId?: string): Promise<Partial<User>[]> {
    try {
      const qb = this.userRepo
        .createQueryBuilder('user')
        .leftJoin('project_members', 'pm', 'pm.userId = user.id')
        .where('pm.userId IS NULL')
        .select(['user.id', 'user.name', 'user.email', 'user.defaultRole']);

      if (organizationId) {
        qb.andWhere('user.organizationId = :organizationId', {
          organizationId,
        });
      }

      return qb.getMany();
    } catch (err) {
      console.error('Error in findUnassigned:', err);
      throw err;
    }
  }

  /** Change a user's password */
  async changePassword(
    id: string,
    dto: ChangePasswordDto,
    isSuperAdmin: boolean,
  ): Promise<{ success: boolean }> {
    const user = await this.findOneById(id);
    // If not super admin, verify current password
    if (!isSuperAdmin) {
      if (!dto.currentPassword)
        throw new BadRequestException('Current password required');
      const valid = await argon2.verify(user.passwordHash, dto.currentPassword);
      if (!valid) throw new ForbiddenException('Current password is incorrect');
    }
    if (!dto.newPassword || dto.newPassword.length < 6) {
      throw new BadRequestException(
        'New password must be at least 6 characters',
      );
    }
    if (dto.newPassword !== dto.confirmNewPassword) {
      throw new BadRequestException(
        'New password and confirmation do not match',
      );
    }
    // Use Argon2id for new password hash
    user.passwordHash = await argon2.hash(dto.newPassword, {
      type: argon2.argon2id,
      memoryCost: 65536,
      timeCost: 3,
      parallelism: 4,
    });
    user.passwordVersion = 3; // Argon2id version
    await this.userRepo.save(user);
    return { success: true };
  }

  /** Delete a user's account (soft-delete: deactivate and anonymize) */
  async deleteAccount(id: string): Promise<{ success: boolean }> {
    const user = await this.findOneById(id);

    // Soft-delete: deactivate and anonymize user data for GDPR compliance
    user.isActive = false;
    user.name = 'Deleted User';
    user.email = `deleted-${user.id}@deleted.local`;
    user.avatarUrl = undefined;
    user.hashedRefreshToken = undefined;
    user.passwordHash = ''; // Invalidate password

    await this.userRepo.save(user);
    return { success: true };
  }
}
