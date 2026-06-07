import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Body,
  Param,
  UseGuards,
  Request,
  HttpCode,
  HttpStatus,
  NotFoundException,
} from '@nestjs/common';
import {
  AccessCheckResult,
  HistoryContext,
  IAccessChecker,
  IAccessRuleCommand,
  IAccessRuleQuery,
  IAccessStats,
  TenantScope,
} from './interfaces/access-control.interfaces';
import {
  IPAccessRule,
  AccessRuleType,
  AccessRuleStatus,
  IPType,
} from './entities/ip-access-rule.entity';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { PermissionsGuard } from '../core/auth/guards/permissions.guard';
import { RequirePermission } from '../auth/decorators/require-permission.decorator';
import { AuthenticatedRequest } from '../common/types/authenticated-request.interface';
import { CreateAccessRuleDto, UpdateAccessRuleDto, TestAccessDto } from './dto';

@Controller('access-control')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class AccessControlController {
  constructor(
    private readonly accessChecker: IAccessChecker,
    private readonly command: IAccessRuleCommand,
    private readonly query: IAccessRuleQuery,
    private readonly stats: IAccessStats,
  ) {}

  private scopeOf(req: AuthenticatedRequest): TenantScope {
    return {
      organizationId: req.user.organizationId,
      isSuperAdmin: req.user.isSuperAdmin,
    };
  }

  private historyOf(req: AuthenticatedRequest): HistoryContext {
    return {
      actorId: req.user.userId,
      actorIpAddress: req.ip,
      actorUserAgent: req.headers?.['user-agent'],
    };
  }

  @Post('test')
  @HttpCode(HttpStatus.OK)
  @RequirePermission('access_control:test')
  async testAccess(
    @Body() testData: TestAccessDto,
    @Request() req: AuthenticatedRequest,
  ): Promise<AccessCheckResult> {
    return this.accessChecker.checkAccess(
      testData.ipAddress,
      testData.userId || req.user.userId,
      req.headers?.['user-agent'] || '',
      testData.projectId,
      testData.userRoles,
    );
  }

  @Post('rules')
  @HttpCode(HttpStatus.CREATED)
  @RequirePermission('access_control:create')
  async createRule(
    @Body() createRuleDto: CreateAccessRuleDto,
    @Request() req: AuthenticatedRequest,
  ): Promise<IPAccessRule> {
    return this.command.create(
      { ...createRuleDto, createdBy: req.user.userId },
      this.scopeOf(req),
      this.historyOf(req),
    );
  }

  @Get('rules')
  @RequirePermission('access_control:read')
  async getAllRules(): Promise<IPAccessRule[]> {
    return this.query.findAll();
  }

  @Get('rules/active')
  @RequirePermission('access_control:read')
  async getActiveRules(): Promise<IPAccessRule[]> {
    return this.query.findActive();
  }

  @Get('rules/:id')
  @RequirePermission('access_control:read')
  async getRule(@Param('id') id: string): Promise<IPAccessRule> {
    const rule = await this.query.findById(id);
    if (!rule) {
      throw new NotFoundException('Rule not found');
    }
    return rule;
  }

  @Put('rules/:id')
  @RequirePermission('access_control:update')
  async updateRule(
    @Param('id') id: string,
    @Body() updateRuleDto: UpdateAccessRuleDto,
    @Request() req: AuthenticatedRequest,
  ): Promise<IPAccessRule> {
    return this.command.update(
      id,
      { ...updateRuleDto, createdBy: req.user.userId },
      this.scopeOf(req),
      this.historyOf(req),
    );
  }

  @Delete('rules/:id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @RequirePermission('access_control:delete')
  async deleteRule(
    @Param('id') id: string,
    @Request() req: AuthenticatedRequest,
  ): Promise<void> {
    return this.command.delete(
      id,
      req.user.userId,
      this.scopeOf(req),
      this.historyOf(req),
    );
  }

  @Get('stats')
  @RequirePermission('access_control:read:stats')
  async getStats(): Promise<Record<string, unknown>> {
    return this.stats.getAccessStats();
  }

  @Post('rules/:id/activate')
  @HttpCode(HttpStatus.OK)
  @RequirePermission('access_control:update')
  async activateRule(
    @Param('id') id: string,
    @Request() req: AuthenticatedRequest,
  ): Promise<IPAccessRule> {
    return this.command.update(
      id,
      { status: AccessRuleStatus.ACTIVE, isActive: true },
      this.scopeOf(req),
      this.historyOf(req),
    );
  }

  @Post('rules/:id/deactivate')
  @HttpCode(HttpStatus.OK)
  @RequirePermission('access_control:update')
  async deactivateRule(
    @Param('id') id: string,
    @Request() req: AuthenticatedRequest,
  ): Promise<IPAccessRule> {
    return this.command.update(
      id,
      { status: AccessRuleStatus.INACTIVE, isActive: false },
      this.scopeOf(req),
      this.historyOf(req),
    );
  }

  @Post('rules/:id/approve')
  @HttpCode(HttpStatus.OK)
  @RequirePermission('access_control:approve')
  async approveRule(
    @Param('id') id: string,
    @Request() req: AuthenticatedRequest,
  ): Promise<IPAccessRule> {
    return this.command.update(
      id,
      {
        requiresApproval: false,
        approvedBy: req.user.userId,
        approvedAt: new Date(),
      },
      this.scopeOf(req),
      this.historyOf(req),
    );
  }

  @Post('emergency-access')
  @HttpCode(HttpStatus.CREATED)
  @RequirePermission('access_control:emergency')
  async createEmergencyAccess(
    @Body()
    emergencyData: {
      ipAddress: string;
      reason: string;
      expiresAt: Date;
    },
    @Request() req: AuthenticatedRequest,
  ): Promise<IPAccessRule> {
    return this.command.create(
      {
        ruleType: AccessRuleType.WHITELIST,
        name: `Emergency Access - ${emergencyData.reason}`,
        description: `Emergency access granted by ${req.user.name}`,
        ipAddress: emergencyData.ipAddress,
        ipType: IPType.SINGLE,
        isEmergency: true,
        emergencyReason: emergencyData.reason,
        isTemporary: true,
        expiresAt: emergencyData.expiresAt,
        priority: 1000, // Highest priority
        createdBy: req.user.userId,
      },
      this.scopeOf(req),
      this.historyOf(req),
    );
  }

  @Get('health')
  @HttpCode(HttpStatus.OK)
  healthCheck(): {
    status: string;
    enabled: boolean;
    defaultPolicy: string;
  } {
    return {
      status: 'healthy',
      enabled: true,
      defaultPolicy: 'deny',
    };
  }
}
