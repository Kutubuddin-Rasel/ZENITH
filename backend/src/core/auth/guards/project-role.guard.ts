import {
  Injectable,
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Logger,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Request } from 'express';
import { ProjectMembersService } from '../../../membership/project-members/project-members.service';
import { CacheService } from '../../../cache/cache.service';
import { ProjectRole } from '../../../membership/enums/project-role.enum';

export const REQUIRED_PROJECT_ROLES_KEY = 'required_project_roles';

interface JwtRequestUser {
  userId: string;
  email: string;
  isSuperAdmin: boolean;
  organizationId?: string;
}

/**
 * ProjectRoleGuard
 *
 * Enforces project role requirements with Redis caching.
 * Use with @RequireProjectRole() decorator.
 */
@Injectable()
export class ProjectRoleGuard implements CanActivate {
  private readonly logger = new Logger(ProjectRoleGuard.name);
  private readonly CACHE_TTL = 300;

  constructor(
    private reflector: Reflector,
    private projectMembersService: ProjectMembersService,
    private cacheService: CacheService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const requiredRoles = this.reflector.get<ProjectRole[]>(
      REQUIRED_PROJECT_ROLES_KEY,
      context.getHandler(),
    );

    if (!requiredRoles || requiredRoles.length === 0) {
      return true;
    }

    const request = context.switchToHttp().getRequest<Request>();
    const user = request.user as unknown as JwtRequestUser;
    const userId = user?.userId;
    const projectId =
      request.params?.id ||
      request.params?.projectId ||
      ((request.body as Record<string, any>)?.projectId as string);

    // SuperAdmin bypass
    if (user?.isSuperAdmin) {
      return true;
    }

    if (!userId) {
      throw new ForbiddenException('User not authenticated');
    }

    if (!projectId) {
      throw new ForbiddenException('Project ID not found in request');
    }

    // Narrow projectId to string (handle potential array from Express params)
    const projectIdStr = Array.isArray(projectId) ? projectId[0] : projectId;

    const cacheKey = `project_role:${projectIdStr}:${userId}`;
    let userRole = await this.cacheService.get<ProjectRole>(cacheKey);

    if (!userRole) {
      userRole = (await this.projectMembersService.getUserRole(
        projectIdStr,
        userId,
      )) as ProjectRole;

      if (userRole) {
        await this.cacheService.set(cacheKey, userRole, {
          ttl: this.CACHE_TTL,
        });
      }
    }

    if (!userRole) {
      throw new ForbiddenException('You are not a member of this project');
    }

    if (!requiredRoles.includes(userRole)) {
      throw new ForbiddenException(
        `Access denied. Required roles: ${requiredRoles.join(', ')}. Your role: ${userRole}`,
      );
    }

    return true;
  }
}
