import { ForbiddenException, Inject, Injectable } from '@nestjs/common';

import { PROJECT_MEMBER_QUERY_TOKEN } from '../../membership/constants/membership.tokens';
import type { IProjectMemberQuery } from '../../membership/interfaces/membership.interfaces';
import { ProjectRole } from '../../membership/enums/project-role.enum';

/**
 * BoardAuthzService
 *
 * Shared role-check helper for the four CQRS services
 * (`BoardQueryService`, `BoardCommandService`,
 * `BoardColumnCommandService`, `BoardOrderingService`). Consolidates
 * the eight duplicated authorization patterns that lived inside the
 * legacy `BoardsService` god class.
 *
 * Why a separate `@Injectable()` instead of static helpers?
 * ---------------------------------------------------------
 * The membership lookup depends on `IProjectMemberQuery` (an abstract
 * DI token bound by `MembershipModule`). Static helpers would need to
 * accept the membership service as a parameter at every call site,
 * which leaks DI plumbing back into the CQRS services. A small
 * `@Injectable()` wrapper centralizes the token resolution in one
 * place.
 *
 * Why not throw a 401 for missing members?
 * ----------------------------------------
 * `requireMember` throws `ForbiddenException` (HTTP 403) rather than
 * `UnauthorizedException` (HTTP 401) because the request is already
 * authenticated by `JwtAuthGuard` upstream — what's failing here is
 * project-scope authorization, not authentication. This preserves the
 * legacy 403 response semantics from the god class verbatim (zero
 * behavior change at the HTTP boundary).
 *
 * Throws
 * ------
 *  - `ForbiddenException('Not a project member')` when the caller has
 *    no role in the project.
 *  - `ForbiddenException('Only ProjectLead can <action>')` when the
 *    caller's role is not `PROJECT_LEAD`. The `<action>` verb is
 *    supplied by the caller so per-route error messages remain
 *    identical to the pre-refactor strings (`'create boards'`,
 *    `'update boards'`, `'delete boards'`, `'add columns'`,
 *    `'update columns'`, `'remove columns'`, `'reorder columns'`).
 */
@Injectable()
export class BoardAuthzService {
  constructor(
    @Inject(PROJECT_MEMBER_QUERY_TOKEN)
    private readonly members: IProjectMemberQuery,
  ) {}

  /**
   * Require the caller to be ANY member of the project. Used by every
   * read-side endpoint and as a precondition for ordering mutations
   * (the lead-only check is performed separately when applicable).
   */
  async requireMember(projectId: string, userId: string): Promise<void> {
    const role = await this.members.getUserRole(projectId, userId);
    if (!role) {
      throw new ForbiddenException('Not a project member');
    }
  }

  /**
   * Require the caller to be the project's `PROJECT_LEAD`. The
   * `action` parameter customizes the error message to match the
   * legacy per-route strings (e.g. `'create boards'`,
   * `'reorder columns'`).
   */
  async requireLead(
    projectId: string,
    userId: string,
    action: string,
  ): Promise<void> {
    const role = await this.members.getUserRole(projectId, userId);
    if (role !== ProjectRole.PROJECT_LEAD) {
      throw new ForbiddenException(`Only ProjectLead can ${action}`);
    }
  }
}
