import {
  Injectable,
  CanActivate,
  ExecutionContext,
  ForbiddenException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ProjectMembersService } from 'src/membership/project-members/project-members.service';

interface JwtRequestUser {
  userId: string;
  email: string;
  isSuperAdmin: boolean;
}

@Injectable()
export class PermissionsGuard implements CanActivate {
  constructor(
    private reflector: Reflector,
    private projectMembersService: ProjectMembersService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const requiredPerm = this.reflector.get<string>(
      'require_permission',
      context.getHandler(),
    );
    if (!requiredPerm) {
      // No metadata => allow by default
      return true;
    }

    const req = context.switchToHttp().getRequest<{
      user: JwtRequestUser;
      params?: any;
      body?: any;
      query?: any;
    }>();
    const user = req.user;
    console.log('User in PermissionsGuard:', user);
    if (!user || !user.userId) {
      throw new ForbiddenException('No user in request context');
    }

    // 1) SuperAdmin bypasses everything
    if (user.isSuperAdmin) {
      return true;
    }

    // 2) Handle global-only permissions
    // If you have other global-only perms (e.g. 'users:manage'), handle similarly:
    // In PermissionsGuard:
    const otherGlobalOnlyPerms: string[] = [
      'projects:create', // Only superadmin can create projects
      'sprints:create', // Only superadmin can create sprints globally
      'sprints:list-all', // optional: list every sprint globally
      'boards:create',
      'boards:delete',
      'releases:create',
      'releases:delete',
      'labels:create',
      'labels:delete',
      'components:create',
      'components:delete',
      'epics:create',
      'epics:delete',
      'stories:create',
      'stories:delete',
      'backlog:update',
      'watchers:update',
      // e.g. 'users:manage', 'projects:list-all', etc.
    ];

    // Global permissions that all authenticated users have
    const globalUserPerms: string[] = [
      'notifications:view',
      'notifications:update',
      'notifications:create',
    ];

    if (globalUserPerms.includes(requiredPerm)) {
      return true; // All authenticated users can access notifications
    }

    if (otherGlobalOnlyPerms.includes(requiredPerm)) {
      // Only superadmin allowed; since we're not superadmin here, forbid
      throw new ForbiddenException(
        `Insufficient global permissions: cannot ${requiredPerm}`,
      );
    }

    // 3) Project-scoped permission: extract projectId from params/body/query
    const projectId: string | undefined =
      req.params?.projectId ||
      req.params?.id || // for /projects/:id or /projects/:id/...
      req.body?.projectId ||
      req.query?.projectId;

    if (projectId) {
      // Check membership in that project
      const roleName = await this.projectMembersService.getUserRole(
        projectId,
        user.userId,
      );
      if (!roleName) {
        throw new ForbiddenException('Not a member of this project');
      }
      // Map roles to allowed perms
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
          'releases:update',
          'releases:delete',
          'releases:view',
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
          // etc.
        ],
        Developer: [
          'projects:view',
          'issues:create',
          'issues:view',
          'issues:update',
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
          // omit 'projects:update', etc.
        ],
        QA: [
          'projects:view',
          'issues:create',
          'issues:view',
          'issues:update',
          'comments:create',
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
          'stories:view',
          'stories:create',
          'backlog:view',
          'watchers:view',
          'watchers:update',
        ],
        Viewer: [
          'projects:view',
          'issues:view',
          'comments:create',
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
      const allowedPerms = projectPermissionsMap[roleName] || [];
      if (allowedPerms.includes(requiredPerm)) {
        return true;
      }
      throw new ForbiddenException(
        `Insufficient project permissions: role ${roleName} cannot ${requiredPerm}`,
      );
    }

    // 4) No projectId context, not a global-only perm, and not superadmin => forbid
    throw new ForbiddenException('Insufficient permissions');
  }
}
