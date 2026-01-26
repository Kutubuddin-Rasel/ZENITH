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
import { RBACService } from '../../../rbac/rbac.service';
import { AuditLogsService } from '../../../audit/audit-logs.service';
import { v4 as uuidv4 } from 'uuid';

interface JwtRequestUser {
  userId: string;
  email: string;
  isSuperAdmin: boolean;
  organizationId?: string;
}

/**
 * PermissionsGuard
 *
 * Enforces action-based permissions using database-backed RBAC.
 * This guard is registered as a global APP_GUARD in AuthCoreModule.
 *
 * ARCHITECTURE (NIST AC-3 Compliant):
 * - Single Source of Truth: All permission decisions flow through RBACService
 * - No hardcoded permission maps - supports custom roles dynamically
 * - Backward compatible: Falls back to legacy roleName when roleId is null
 * - Access Denial Logging: All rejections logged for SIEM integration (Phase 3)
 */
@Injectable()
export class PermissionsGuard implements CanActivate {
  private readonly logger = new Logger(PermissionsGuard.name);
  private readonly CACHE_TTL = 300; // 5 minutes

  constructor(
    private reflector: Reflector,
    private projectMembersService: ProjectMembersService,
    private cacheService: CacheService,
    private rbacService: RBACService,
    private auditLogsService: AuditLogsService,
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
      ip?: string;
      headers?: { [key: string]: string };
    }>();
    const user = req.user;

    // Extract client IP for audit logging
    const clientIp =
      req.headers?.['x-forwarded-for']?.toString().split(',')[0]?.trim() ||
      req.ip ||
      'unknown';

    if (!user || !user.userId) {
      // Log anonymous access attempt
      await this.logAccessDenied({
        userId: 'anonymous',
        organizationId: 'unknown',
        requiredPermission: requiredPerm,
        reason: 'No user in request context',
        clientIp,
      });
      throw new ForbiddenException('No user in request context');
    }

    // SuperAdmin bypasses everything
    if (user.isSuperAdmin) {
      return true;
    }

    // Global user permissions (available to all authenticated users)
    const globalUserPerms = [
      'notifications:view',
      'notifications:update',
      'notifications:create',
    ];

    if (globalUserPerms.includes(requiredPerm)) {
      return true;
    }

    // Project creation requires organization membership
    if (requiredPerm === 'projects:create') {
      if (user.organizationId) {
        return true;
      }
      await this.logAccessDenied({
        userId: user.userId,
        organizationId: user.organizationId || 'none',
        requiredPermission: requiredPerm,
        reason: 'User must belong to an organization to create projects',
        clientIp,
      });
      throw new ForbiddenException(
        'User must belong to an organization to create projects',
      );
    }

    // Project-scoped permissions: extract projectId
    const projectId =
      req.params?.projectId ||
      req.params?.id ||
      req.body?.projectId ||
      req.query?.projectId;

    if (projectId) {
      return this.checkProjectPermission(
        projectId,
        user.userId,
        requiredPerm,
        user.organizationId,
        clientIp,
      );
    }

    // No projectId context and not a global permission
    await this.logAccessDenied({
      userId: user.userId,
      organizationId: user.organizationId || 'unknown',
      requiredPermission: requiredPerm,
      reason: 'Insufficient permissions - no project context',
      clientIp,
    });
    throw new ForbiddenException('Insufficient permissions');
  }

  /**
   * Check project-scoped permission via database-backed RBAC
   * Uses RBACService as single source of truth (NIST AC-3)
   */
  private async checkProjectPermission(
    projectId: string,
    userId: string,
    requiredPerm: string,
    organizationId: string | undefined,
    clientIp: string,
  ): Promise<boolean> {
    // Check cache for roleId first
    const cacheKey = `project_role_id:${projectId}:${userId}`;
    let roleId = await this.cacheService.get<string>(cacheKey);
    let roleName: string | undefined;

    if (!roleId) {
      // Cache miss - fetch role details from database
      const roleDetails = await this.projectMembersService.getMemberRoleDetails(
        projectId,
        userId,
      );

      if (!roleDetails) {
        await this.logAccessDenied({
          userId,
          organizationId: organizationId || 'unknown',
          projectId,
          requiredPermission: requiredPerm,
          reason: 'Not a member of this project',
          clientIp,
        });
        throw new ForbiddenException('Not a member of this project');
      }

      roleName = roleDetails.roleName;

      // Get roleId - use direct roleId or resolve from legacy enum
      roleId = roleDetails.roleId ?? null;
      if (!roleId) {
        // Backward compatibility: resolve roleId from legacy roleName
        const legacyRole = await this.rbacService.getRoleByLegacyEnum(
          roleDetails.roleName,
        );
        roleId = legacyRole?.id ?? null;
      }

      if (!roleId) {
        this.logger.warn(
          `Role not found for user ${userId} in project ${projectId}`,
        );
        await this.logAccessDenied({
          userId,
          organizationId: organizationId || 'unknown',
          projectId,
          requiredPermission: requiredPerm,
          roleName: roleDetails.roleName,
          reason: 'Role not found in database',
          clientIp,
        });
        throw new ForbiddenException('Role not found');
      }

      // Cache the resolved roleId
      await this.cacheService.set(cacheKey, roleId, { ttl: this.CACHE_TTL });
    }

    // Check permission via RBACService (has its own cache layer)
    const permissions = await this.rbacService.getRolePermissions(roleId);

    if (permissions.includes(requiredPerm)) {
      this.logger.debug(
        `Permission granted: ${requiredPerm} for user ${userId} in project ${projectId}`,
      );
      return true;
    }

    // Permission denied - log before throwing
    await this.logAccessDenied({
      userId,
      organizationId: organizationId || 'unknown',
      projectId,
      roleId,
      roleName,
      requiredPermission: requiredPerm,
      grantedPermissions: permissions,
      reason: `Role lacks required permission: ${requiredPerm}`,
      clientIp,
    });

    throw new ForbiddenException(
      `Insufficient project permissions: cannot ${requiredPerm}`,
    );
  }

  /**
   * Log access denial event for security monitoring (SIEM integration)
   * Fire-and-forget: don't await in critical path, but catch errors
   */
  private async logAccessDenied(params: {
    userId: string;
    organizationId: string;
    projectId?: string;
    roleId?: string;
    roleName?: string;
    requiredPermission: string;
    grantedPermissions?: string[];
    reason: string;
    clientIp: string;
  }): Promise<void> {
    try {
      await this.auditLogsService.log({
        event_uuid: uuidv4(),
        timestamp: new Date(),
        tenant_id: params.organizationId,
        actor_id: params.userId,
        actor_ip: params.clientIp,
        resource_type: 'Permission',
        resource_id: params.requiredPermission,
        action_type: 'VIEW', // Closest to "attempted access"
        metadata: {
          event: 'ACCESS_DENIED',
          severity: 'WARNING',
          projectId: params.projectId,
          roleId: params.roleId,
          roleName: params.roleName,
          requiredPermission: params.requiredPermission,
          grantedPermissions: params.grantedPermissions,
          reason: params.reason,
          detectedAt: new Date().toISOString(),
        },
      });

      this.logger.warn(
        `ACCESS_DENIED: User ${params.userId} attempted "${params.requiredPermission}" ` +
          `in project ${params.projectId || 'N/A'}. Reason: ${params.reason}`,
      );
    } catch (error) {
      // Never let audit logging failure break the authorization flow
      this.logger.error(
        `Failed to log access denial: ${error instanceof Error ? error.message : 'Unknown error'}`,
      );
    }
  }
}
