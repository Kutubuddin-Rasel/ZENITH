import {
  Injectable,
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Logger,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ProjectMembersService } from '../../../membership/project-members/project-members.service';
import { CacheService } from '../../../cache/cache.service';

interface JwtRequestUser {
  userId: string;
  email: string;
  isSuperAdmin: boolean;
  organizationId?: string;
}

/**
 * PermissionsGuard
 *
 * Enforces action-based permissions with Redis caching.
 * This guard is registered as a global APP_GUARD in AuthCoreModule.
 */
@Injectable()
export class PermissionsGuard implements CanActivate {
  private readonly logger = new Logger(PermissionsGuard.name);
  private readonly CACHE_TTL = 300; // 5 minutes

  constructor(
    private reflector: Reflector,
    private projectMembersService: ProjectMembersService,
    private cacheService: CacheService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const requiredPerm = this.reflector.get<string>(
      'require_permission',
      context.getHandler(),
    );
    if (!requiredPerm) {
      return true;
    }

    const req = context.switchToHttp().getRequest<{
      user: JwtRequestUser;
      params?: { projectId?: string; id?: string; [key: string]: unknown };
      body?: { projectId?: string; [key: string]: unknown };
      query?: { projectId?: string; [key: string]: unknown };
    }>();
    const user = req.user;

    if (!user || !user.userId) {
      throw new ForbiddenException('No user in request context');
    }

    // SuperAdmin bypasses everything
    if (user.isSuperAdmin) {
      return true;
    }

    // Global user permissions
    const globalUserPerms = [
      'notifications:view',
      'notifications:update',
      'notifications:create',
    ];

    if (globalUserPerms.includes(requiredPerm)) {
      return true;
    }

    // Project creation requires organization
    if (requiredPerm === 'projects:create') {
      if (user.organizationId) {
        return true;
      }
      throw new ForbiddenException(
        'User must belong to an organization to create projects',
      );
    }

    // Project-scoped permissions
    const projectId =
      req.params?.projectId ||
      req.params?.id ||
      req.body?.projectId ||
      req.query?.projectId;

    if (projectId) {
      const cacheKey = `project_role:${projectId}:${user.userId}`;
      let roleName = await this.cacheService.get<string>(cacheKey);

      if (!roleName) {
        roleName = await this.projectMembersService.getUserRole(
          projectId,
          user.userId,
        );
        if (roleName) {
          await this.cacheService.set(cacheKey, roleName, {
            ttl: this.CACHE_TTL,
          });
        }
      }

      if (!roleName) {
        throw new ForbiddenException('Not a member of this project');
      }

      const projectPermissionsMap: Record<string, string[]> = {
        ProjectLead: [
          'projects:view',
          'projects:update',
          'projects:delete',
          'members:view',
          'members:add',
          'members:remove',
          'invites:create',
          'issues:create',
          'issues:view',
          'issues:update',
          'issues:delete',
          'sprints:create',
          'sprints:view',
          'sprints:update',
          'sprints:delete',
          'comments:create',
          'comments:view',
          'comments:update',
          'comments:delete',
          'attachments:create',
          'attachments:view',
          'attachments:delete',
          'boards:create',
          'boards:view',
          'boards:update',
          'boards:delete',
          'columns:create',
          'columns:update',
          'columns:delete',
          'releases:create',
          'releases:view',
          'releases:update',
          'releases:delete',
          'labels:create',
          'labels:view',
          'labels:update',
          'labels:delete',
          'components:create',
          'components:view',
          'components:update',
          'components:delete',
          'epics:create',
          'epics:view',
          'epics:update',
          'epics:delete',
          'stories:create',
          'stories:view',
          'stories:update',
          'stories:delete',
          'backlog:view',
          'backlog:update',
          'watchers:view',
          'watchers:update',
        ],
        Member: [
          'projects:view',
          'issues:create',
          'issues:view',
          'issues:update',
          'invites:view',
          'sprints:view',
          'comments:create',
          'comments:view',
          'comments:update',
          'attachments:create',
          'attachments:view',
          'boards:view',
          'releases:view',
          'labels:view',
          'components:view',
          'labels:update',
          'components:update',
          'epics:view',
          'stories:create',
          'stories:view',
          'stories:update',
          'backlog:view',
          'watchers:view',
          'watchers:update',
        ],
        Viewer: [
          'projects:view',
          'issues:view',
          'invites:view',
          'sprints:view',
          'comments:view',
          'comments:create',
          'attachments:view',
          'boards:view',
          'releases:view',
          'labels:view',
          'components:view',
          'epics:view',
          'stories:view',
          'backlog:view',
          'watchers:view',
        ],
      };

      // Aliases for deprecated roles
      projectPermissionsMap['Developer'] = projectPermissionsMap['Member'];
      projectPermissionsMap['QA'] = projectPermissionsMap['Member'];

      const allowedPerms = projectPermissionsMap[roleName] || [];
      if (allowedPerms.includes(requiredPerm)) {
        return true;
      }
      throw new ForbiddenException(
        `Insufficient project permissions: role ${roleName} cannot ${requiredPerm}`,
      );
    }

    throw new ForbiddenException('Insufficient permissions');
  }
}
