import {
  Controller,
  Get,
  Param,
  Post,
  Body,
  Patch,
  BadRequestException,
  Query,
  UseGuards,
  Request,
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { UsersService } from './users.service';
import { User } from './entities/user.entity';
import {
  CreateUserDto,
  UpdateUserDto,
  ChangePasswordDto,
} from './dto/create-user.dto';
import { JwtAuthGuard } from 'src/auth/guards/jwt-auth.guard';
import { ProjectMembersService } from 'src/membership/project-members/project-members.service';
import * as bcrypt from 'bcrypt';
import { AuthenticatedRequest } from 'src/common/types/authenticated-request.interface';

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
    const hash = await bcrypt.hash(dto.password, 10);
    return this.usersService.create(
      email,
      hash,
      dto.name,
      false, // isSuperAdmin
      req.user.organizationId, // Assign to current org
      dto.defaultRole,
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

  // PATCH /users/:id
  @UseGuards(JwtAuthGuard, SuperAdminGuard)
  @Patch(':id')
  async update(
    @Param('id') id: string,
    @Body() dto: UpdateUserDto,
  ): Promise<User> {
    return this.usersService.update(id, dto);
  }

  // PATCH /users/:id/password
  @UseGuards(JwtAuthGuard)
  @Patch(':id/password')
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
}
