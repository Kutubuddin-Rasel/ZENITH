import { SetMetadata } from '@nestjs/common';
import { ProjectRole } from '../../membership/enums/project-role.enum';

export const REQUIRED_PROJECT_ROLES_KEY = 'required_project_roles';

/**
 * Decorator to specify required project roles for a route handler.
 * Works with ProjectRoleGuard to enforce role-based access control.
 *
 * @param roles - Array of allowed roles (e.g., [ProjectRole.PROJECT_LEAD, ProjectRole.MEMBER])
 *
 * @example
 * @RequireProjectRole(ProjectRole.PROJECT_LEAD, ProjectRole.MEMBER)
 * async createSprint(projectId: string, userId: string, dto: CreateSprintDto) {
 *   // Only ProjectLead and Member can access this
 * }
 */
export const RequireProjectRole = (...roles: ProjectRole[]) =>
  SetMetadata(REQUIRED_PROJECT_ROLES_KEY, roles);
