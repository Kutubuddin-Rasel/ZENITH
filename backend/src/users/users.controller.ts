import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  ForbiddenException,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Query,
  Request,
  UseGuards,
} from '@nestjs/common';

import { UsersService } from './users.service';
import { User } from './entities/user.entity';
import { CreateUserDto, UpdateUserDto } from './dto/create-user.dto';
import { JwtAuthGuard } from 'src/auth/guards/jwt-auth.guard';
import { SuperAdminGuard } from 'src/core/auth/guards/super-admin.guard';
import { AuthenticatedRequest } from 'src/common/types/authenticated-request.interface';
import { CsrfGuard, RequireCsrf } from 'src/security/csrf/csrf.guard';

@Controller('users')
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  // GET /users (scoped to current user's organization)
  @UseGuards(JwtAuthGuard, SuperAdminGuard)
  @Get()
  findAll(@Request() req: AuthenticatedRequest): Promise<User[]> {
    return this.usersService.findAll(req.user.organizationId);
  }

  // GET /users/project-memberships (scoped to current user's organization)
  @UseGuards(JwtAuthGuard, SuperAdminGuard)
  @Get('project-memberships')
  async getAllWithProjectMemberships(@Request() req: AuthenticatedRequest) {
    return this.usersService.findAllWithProjectMemberships(
      req.user.organizationId,
    );
  }

  @UseGuards(JwtAuthGuard)
  @Get('search')
  search(
    @Query('term') term: string,
    @Query('excludeProjectId') excludeProjectId?: string,
    @Request() req?: AuthenticatedRequest,
  ) {
    return this.usersService.search(
      term,
      excludeProjectId,
      req?.user?.organizationId,
    );
  }

  // ===========================================================================
  // SECURITY SETTINGS (relocated)
  //
  // `/users/me/security-settings` (GET & PATCH) is served by
  // `UserSecurityController` in the auth module, which fans the request out
  // to `SessionPreferencesService` (auth) and `NotificationPreferencesService`
  // (users). The HTTP contract is unchanged.
  // ===========================================================================

  // ===========================================================================
  // EMAIL VERIFICATION (PUBLIC — no auth guard)
  // ===========================================================================

  /**
   * GET /users/verify-email/:token
   *
   * Public endpoint — user clicks this link from their email client.
   * No JwtAuthGuard because the user may not be logged in yet.
   *
   * SECURITY:
   * - Token is a 64-char hex string (256-bit entropy)
   * - Token is single-use (cleared after verification)
   * - Token has 24h expiry (OWASP compliance)
   * - Rate limited by global ThrottlerGuard (100 req/min)
   *
   * HTTP STATUS CODES:
   * - 200: Verification successful (or already verified — idempotent)
   * - 400: Malformed token or expired token
   * - 404: Token not found or already used
   */
  @Get('verify-email/:token')
  @HttpCode(HttpStatus.OK)
  async verifyEmail(
    @Param('token') token: string,
  ): Promise<{ success: boolean; message: string }> {
    return this.usersService.verifyEmail(token);
  }

  // ===========================================================================
  // LOGIN HISTORY (relocated)
  //
  // `/users/me/login-history` is served by `LoginHistoryController` in the
  // auth module, alongside the recording side-effect.
  // ===========================================================================

  // ===========================================================================
  // PROJECT MEMBERSHIPS (relocated)
  //
  // `/users/me/project-memberships` is served by
  // `UserProjectMembershipsController` in the membership module.
  // ===========================================================================

  // ===========================================================================
  // AVATAR UPLOAD (relocated)
  //
  // `POST /users/me/avatar` is served by `AvatarController` in the storage
  // module, which owns the multer/diskStorage configuration.
  // ===========================================================================

  // GET /users/available (scoped to current user's organization)
  @UseGuards(JwtAuthGuard, SuperAdminGuard)
  @Get('available')
  findAvailable(@Request() req: AuthenticatedRequest) {
    return this.usersService.findUnassigned(req.user.organizationId);
  }

  // POST /users (assign to current user's organization)
  @UseGuards(JwtAuthGuard, SuperAdminGuard)
  @Post()
  async create(
    @Body() dto: CreateUserDto,
    @Request() req: AuthenticatedRequest,
  ): Promise<User> {
    if (!dto.email || !dto.password || !dto.name) {
      throw new BadRequestException('email, password, and name required');
    }
    const email = dto.email.toLowerCase();
    // Use Argon2id for password hashing
    const argon2 = await import('argon2');
    const hash = await argon2.hash(dto.password, {
      type: argon2.argon2id,
      memoryCost: 65536,
      timeCost: 3,
      parallelism: 4,
    });
    return this.usersService.create(
      email,
      hash,
      dto.name,
      false, // isSuperAdmin
      req.user.organizationId, // Assign to current org
      dto.defaultRole,
      3, // passwordVersion = Argon2id
    );
  }

  // PATCH /users/:id/activate or /deactivate
  @UseGuards(JwtAuthGuard, SuperAdminGuard)
  @Patch(':id/activate')
  activate(@Param('id') id: string): Promise<User> {
    return this.usersService.setActive(id, true);
  }

  @UseGuards(JwtAuthGuard, SuperAdminGuard)
  @Patch(':id/deactivate')
  deactivate(@Param('id') id: string): Promise<User> {
    return this.usersService.setActive(id, false);
  }

  // PATCH /users/:id - User can update their own profile, or SuperAdmin can update any
  @UseGuards(JwtAuthGuard)
  @Patch(':id')
  async update(
    @Param('id') id: string,
    @Body() dto: UpdateUserDto,
    @Request() req: AuthenticatedRequest,
  ): Promise<User> {
    if (req.user.userId !== id && !req.user.isSuperAdmin) {
      throw new ForbiddenException('You can only update your own profile');
    }
    return this.usersService.update(id, dto);
  }

  // ===========================================================================
  // PASSWORD ROTATION
  //
  // `PATCH /users/:id/password` is served by `UserPasswordController`
  // (auth module) so that `UsersModule` can sever its dependency on
  // `AuthModule`. The HTTP contract is unchanged.
  // ===========================================================================

  // GET /users/:id (MOVED TO BOTTOM TO PREVENT ROUTE CONFLICTS)
  @UseGuards(JwtAuthGuard, SuperAdminGuard)
  @Get(':id')
  findOne(@Param('id') id: string): Promise<User> {
    return this.usersService.findOneById(id);
  }

  /**
   * DELETE /users/:id
   *
   * Delete user account. Only the user themselves or Super Admin can delete.
   *
   * CSRF REQUIRED: Destructive operation
   */
  @UseGuards(JwtAuthGuard, CsrfGuard)
  @Delete(':id')
  @RequireCsrf()
  async deleteAccount(
    @Param('id') id: string,
    @Request() req: AuthenticatedRequest,
  ): Promise<{ success: boolean }> {
    if (req.user.userId !== id && !req.user.isSuperAdmin) {
      throw new ForbiddenException('You can only delete your own account');
    }
    return this.usersService.deleteAccount(id);
  }
}
