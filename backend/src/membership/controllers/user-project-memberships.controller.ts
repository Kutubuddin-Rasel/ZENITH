import { Controller, Get, Inject, Request, UseGuards } from '@nestjs/common';

import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { AuthenticatedRequest } from '../../common/types/authenticated-request.interface';
import { PROJECT_MEMBER_QUERY_TOKEN } from '../constants/membership.tokens';
import type {
  IProjectMemberQuery,
  UserMembership,
} from '../interfaces/membership.interfaces';

/**
 * Step 6 — `GET /users/me/project-memberships` moved out of `UsersController`
 * and into the membership module where the underlying read already lives.
 * The HTTP path is preserved; the endpoint is mounted at `@Controller('users')`
 * so existing frontend clients keep working unchanged.
 *
 * Step 3 — Read flows through the ISP query surface
 * (`PROJECT_MEMBER_QUERY_TOKEN`) instead of the now-deleted
 * `ProjectMembersService` god-class.
 */
@Controller('users')
export class UserProjectMembershipsController {
  constructor(
    @Inject(PROJECT_MEMBER_QUERY_TOKEN)
    private readonly memberQuery: IProjectMemberQuery,
  ) {}

  @UseGuards(JwtAuthGuard)
  @Get('me/project-memberships')
  async getMyProjectMemberships(
    @Request() req: AuthenticatedRequest,
  ): Promise<readonly UserMembership[]> {
    return this.memberQuery.listMembershipsForUser(req.user.userId);
  }
}
