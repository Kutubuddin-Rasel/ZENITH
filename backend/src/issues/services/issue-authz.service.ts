import { ForbiddenException, Inject, Injectable } from '@nestjs/common';

import { PROJECT_MEMBER_QUERY_TOKEN } from '../../membership/constants/membership.tokens';
import type { IProjectMemberQuery } from '../../membership/interfaces/membership.interfaces';
import { ProjectRole } from '../../membership/enums/project-role.enum';
import { UserLookupPort } from '../ports/user-lookup.port';

/**
 * IssueAuthzService
 *
 * Shared role-check helper for the issues CQRS services. Consolidates
 * the membership + super-admin authorization patterns duplicated across
 * the legacy `IssuesService` god class. Mirrors `BoardAuthzService`.
 *
 * The error MESSAGES are preserved verbatim from the god class so the
 * HTTP boundary semantics (403 strings) do not change:
 *  - `requireMember`           → `'You are not a member of this project'`
 *  - `requireLeadOrSuperAdmin` → `'Only ProjectLead or Super Admin can <action> issues'`
 *
 * `requireMember` throws `ForbiddenException` (403) — the request is
 * already authenticated upstream; what fails here is project-scope
 * authorization, not authentication.
 */
@Injectable()
export class IssueAuthzService {
  constructor(
    @Inject(PROJECT_MEMBER_QUERY_TOKEN)
    private readonly members: IProjectMemberQuery,
    private readonly userLookup: UserLookupPort,
  ) {}

  /**
   * Require the caller to be ANY member of the project. Returns the
   * resolved role for callers that need it (e.g. `update`'s field-level
   * gating). Throws the legacy read-side 403 message when absent.
   */
  async requireMember(projectId: string, userId: string): Promise<string> {
    const role = await this.members.getUserRole(projectId, userId);
    if (!role) {
      throw new ForbiddenException('You are not a member of this project');
    }
    return role;
  }

  /**
   * Gate destructive lifecycle operations (archive / unarchive / delete)
   * to `PROJECT_LEAD` or platform super-admins. `action` customizes the
   * message verb (`'archive'`, `'unarchive'`, `'delete'`) to match the
   * legacy per-route strings exactly.
   */
  async requireLeadOrSuperAdmin(
    projectId: string,
    userId: string,
    action: string,
  ): Promise<void> {
    const user = await this.userLookup.findOneById(userId);
    const userRole = await this.members.getUserRole(projectId, userId);
    if (!user?.isSuperAdmin && userRole !== ProjectRole.PROJECT_LEAD) {
      throw new ForbiddenException(
        `Only ProjectLead or Super Admin can ${action} issues`,
      );
    }
  }
}
