import {
  Controller,
  Get,
  Param,
  Post,
  Body,
  Patch,
  Delete,
  BadRequestException,
  Query,
  UseGuards,
  Request,
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  UseInterceptors,
  UploadedFile,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { diskStorage } from 'multer';
import { extname, join } from 'path';
import { v4 as uuidv4 } from 'uuid';
import { UsersService } from './users.service';
import { UserSecuritySettingsService } from './user-security-settings.service';
import { User } from './entities/user.entity';
import {
  CreateUserDto,
  UpdateUserDto,
  ChangePasswordDto,
} from './dto/create-user.dto';
import { UpdateUserSecuritySettingsDto } from './dto/user-security-settings.dto';
import { JwtAuthGuard } from 'src/auth/guards/jwt-auth.guard';
import { ProjectMembersService } from 'src/membership/project-members/project-members.service';
import { AuthenticatedRequest } from 'src/common/types/authenticated-request.interface';
import { CsrfGuard, RequireCsrf } from 'src/security/csrf/csrf.guard';

@Injectable()
export class SuperAdminGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const req = context.switchToHttp().getRequest<AuthenticatedRequest>();
    if (req.user?.isSuperAdmin) {
      return true;
    }
    throw new ForbiddenException('Only Super Admins can access this resource');
  }
}

@Controller('users')
export class UsersController {
  constructor(
    private readonly usersService: UsersService,
    private readonly userSecuritySettingsService: UserSecuritySettingsService,
    private readonly projectMembersService: ProjectMembersService,
  ) {}

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

  @UseGuards(JwtAuthGuard)
  @Get('me/project-memberships')
  async getMyProjectMemberships(
    @Param() params,
    @Body() body,
    @Query() query,
    @Request() req: { user: { userId: string } },
  ) {
    // req.user.userId is set by JwtAuthGuard
    return this.projectMembersService.listMembershipsForUser(
      (req.user as { userId: string }).userId,
    );
  }

  // ============ USER SECURITY SETTINGS ============

  // GET /users/me/security-settings - Get current user's security preferences
  @UseGuards(JwtAuthGuard)
  @Get('me/security-settings')
  async getSecuritySettings(@Request() req: AuthenticatedRequest) {
    return this.userSecuritySettingsService.getOrCreate(req.user.userId);
  }

  // PATCH /users/me/security-settings - Update current user's security preferences
  @UseGuards(JwtAuthGuard)
  @Patch('me/security-settings')
  async updateSecuritySettings(
    @Request() req: AuthenticatedRequest,
    @Body() dto: UpdateUserSecuritySettingsDto,
  ) {
    return this.userSecuritySettingsService.update(req.user.userId, dto);
  }

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
    // Only allow self-update or SuperAdmin
    if (req.user.userId !== id && !req.user.isSuperAdmin) {
      throw new ForbiddenException('You can only update your own profile');
    }
    return this.usersService.update(id, dto);
  }

  /**
   * PATCH /users/:id/password
   *
   * Change password for a user. Only the user themselves or Super Admin can change.
   *
   * CSRF REQUIRED: Critical security operation
   */
  @UseGuards(JwtAuthGuard, CsrfGuard)
  @Patch(':id/password')
  @RequireCsrf()
  async changePassword(
    @Param('id') id: string,
    @Body() dto: ChangePasswordDto,
    @Request() req: AuthenticatedRequest,
  ) {
    // Only the user themselves or Super Admin can change password
    if (req.user.userId !== id && !req.user.isSuperAdmin) {
      throw new ForbiddenException('You can only change your own password');
    }
    return this.usersService.changePassword(id, dto, req.user.isSuperAdmin);
  }

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
    // Only allow self-delete or SuperAdmin
    if (req.user.userId !== id && !req.user.isSuperAdmin) {
      throw new ForbiddenException('You can only delete your own account');
    }
    return this.usersService.deleteAccount(id);
  }

  // POST /users/me/avatar - Upload avatar for current user
  @UseGuards(JwtAuthGuard)
  @Post('me/avatar')
  @UseInterceptors(
    FileInterceptor('avatar', {
      storage: diskStorage({
        destination: join(process.cwd(), 'uploads', 'avatars'),
        filename: (_req, file, cb) => {
          const uniqueName = `${uuidv4()}${extname(file.originalname)}`;
          cb(null, uniqueName);
        },
      }),
      limits: { fileSize: 5 * 1024 * 1024 }, // 5MB
      fileFilter: (_req, file, cb) => {
        if (!file.mimetype.match(/^image\/(jpeg|jpg|png)$/)) {
          cb(
            new BadRequestException('Only JPG and PNG files are allowed'),
            false,
          );
        } else {
          cb(null, true);
        }
      },
    }),
  )
  async uploadAvatar(
    @UploadedFile() file: Express.Multer.File,
    @Request() req: AuthenticatedRequest,
  ): Promise<{ success: boolean; avatarUrl: string }> {
    // Generate URL for the uploaded file
    const avatarUrl = `/uploads/avatars/${file.filename}`;

    // Update user's avatarUrl
    await this.usersService.update(req.user.userId, { avatarUrl });

    return {
      success: true,
      avatarUrl,
    };
  }
}
