import {
  Body,
  Controller,
  ForbiddenException,
  Param,
  Patch,
  Request,
  UseGuards,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';

import { ChangePasswordDto } from '../../users/dto/create-user.dto';
import { AuthenticatedRequest } from '../../common/types/authenticated-request.interface';
import { JwtAuthGuard } from '../guards/jwt-auth.guard';
import { CsrfGuard, RequireCsrf } from '../../security/csrf/csrf.guard';
import {
  ChangePasswordResult,
  UserPasswordService,
} from '../services/users/user-password.service';

/**
 * Auth-owned HTTP surface for password rotation.
 *
 * The endpoint keeps its historical path (`PATCH /users/:id/password`) so the
 * public API contract is unchanged, but the implementation lives in `auth`
 * now that `UsersModule` no longer depends on `AuthModule`.
 *
 * REQUEST LIFECYCLE:
 *   1. ThrottlerGuard (APP_GUARD)  → 100 req/min global.
 *   2. @Throttle override          → 5 req/hour for this endpoint.
 *   3. JwtAuthGuard                 → Validates JWT, extracts userId.
 *   4. CsrfGuard                    → Validates CSRF token (double-submit cookie).
 *   5. Controller authorisation    → Self-or-SuperAdmin gate.
 *   6. UserPasswordService          → Policy → Breach → Argon2id → Sessions.
 */
@Controller('users')
export class UserPasswordController {
  constructor(private readonly userPasswordService: UserPasswordService) {}

  @UseGuards(JwtAuthGuard, CsrfGuard)
  @Throttle({ default: { limit: 5, ttl: 3600000 } })
  @Patch(':id/password')
  @RequireCsrf()
  async changePassword(
    @Param('id') id: string,
    @Body() dto: ChangePasswordDto,
    @Request() req: AuthenticatedRequest,
  ): Promise<ChangePasswordResult> {
    if (req.user.userId !== id && !req.user.isSuperAdmin) {
      throw new ForbiddenException('You can only change your own password');
    }
    return this.userPasswordService.changePassword(
      id,
      dto,
      req.user.isSuperAdmin,
      req.sessionID,
    );
  }
}
