import { IsEmail, IsString, IsNotEmpty, IsIn } from 'class-validator';

/**
 * Allowed roles for organization invitations.
 * Must match the roles defined in the RBAC system.
 */
const ALLOWED_INVITE_ROLES = [
  'Developer',
  'QA',
  'Designer',
  'ProjectLead',
  'Viewer',
] as const;

type InviteRole = (typeof ALLOWED_INVITE_ROLES)[number];

export class CreateInviteDto {
  @IsEmail({}, { message: 'A valid email address is required' })
  @IsNotEmpty()
  email: string;

  @IsString()
  @IsNotEmpty()
  @IsIn([...ALLOWED_INVITE_ROLES], {
    message: `Role must be one of: ${ALLOWED_INVITE_ROLES.join(', ')}`,
  })
  role: InviteRole;
}
