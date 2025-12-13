import { Invite } from '../../invites/entities/invite.entity';
import { Project } from '../../projects/entities/project.entity';
import { User } from '../../users/entities/user.entity';

export interface InviteCreatedPayload {
  invite: Invite;
  project: Project;
  role: string;
}

export interface InviteResendPayload {
  invite: Invite;
  project: Project;
}

export interface InviteRespondedPayload {
  invite: Invite;
  project: Project;
  invitee: User;
  message: string;
  accept: boolean;
  reason?: string;
}

export interface InviteRevokedPayload {
  invite: Invite;
  project: Project;
}
