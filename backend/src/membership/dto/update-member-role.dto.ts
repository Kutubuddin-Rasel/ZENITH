import { IsString, IsIn } from 'class-validator';
import { ProjectRole } from '../enums/project-role.enum';

/**
 * Allowed roles for role update operations.
 * Matches the ProjectRole enum values exposed to the API.
 */
const ALLOWED_ROLES: readonly string[] = [
  ProjectRole.PROJECT_LEAD,
  ProjectRole.DEVELOPER,
  ProjectRole.QA,
  ProjectRole.DESIGNER,
  ProjectRole.VIEWER,
] as const;

export class UpdateMemberRoleDto {
  @IsString()
  @IsIn([...ALLOWED_ROLES], {
    message: `roleName must be one of: ${ALLOWED_ROLES.join(', ')}`,
  })
  roleName!: string;
}
