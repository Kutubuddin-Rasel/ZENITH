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
} from '@nestjs/common';
import {
  AccessControlService,
  AccessCheckResult,
} from './access-control.service';
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
  constructor(private accessControlService: AccessControlService) {}

  @Post('test')
  @HttpCode(HttpStatus.OK)
  @RequirePermission('access_control:test')
  async testAccess(
    @Body() testData: TestAccessDto,
    @Request() req: AuthenticatedRequest,
  ): Promise<AccessCheckResult> {
    return this.accessControlService.checkAccess(
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
    return this.accessControlService.createRule({
      ...createRuleDto,
      createdBy: req.user.userId,
    });
  }

  @Get('rules')
  @RequirePermission('access_control:read')
  async getAllRules(): Promise<IPAccessRule[]> {
    return this.accessControlService.getAllRules();
  }

  @Get('rules/active')
  @RequirePermission('access_control:read')
  async getActiveRules(): Promise<IPAccessRule[]> {
    return this.accessControlService.getActiveRules();
  }

  @Get('rules/:id')
  @RequirePermission('access_control:read')
  async getRule(@Param('id') id: string): Promise<IPAccessRule> {
    const rules = await this.accessControlService.getAllRules();
    const rule = rules.find((r) => r.id === id);
    if (!rule) {
      throw new Error('Rule not found');
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
    return this.accessControlService.updateRule(id, {
      ...updateRuleDto,
      createdBy: req.user.userId,
    });
  }

  @Delete('rules/:id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @RequirePermission('access_control:delete')
  async deleteRule(
    @Param('id') id: string,
    @Request() req: AuthenticatedRequest,
  ): Promise<void> {
    return this.accessControlService.deleteRule(id, req.user.userId);
  }

  @Get('stats')
  @RequirePermission('access_control:read:stats')
  async getStats(): Promise<Record<string, unknown>> {
    return this.accessControlService.getAccessStats();
  }

  @Post('rules/:id/activate')
  @HttpCode(HttpStatus.OK)
  @RequirePermission('access_control:update')
  async activateRule(@Param('id') id: string): Promise<IPAccessRule> {
    return this.accessControlService.updateRule(id, {
      status: AccessRuleStatus.ACTIVE,
      isActive: true,
    });
  }

  @Post('rules/:id/deactivate')
  @HttpCode(HttpStatus.OK)
  @RequirePermission('access_control:update')
  async deactivateRule(@Param('id') id: string): Promise<IPAccessRule> {
    return this.accessControlService.updateRule(id, {
      status: AccessRuleStatus.INACTIVE,
      isActive: false,
    });
  }

  @Post('rules/:id/approve')
  @HttpCode(HttpStatus.OK)
  @RequirePermission('access_control:approve')
  async approveRule(
    @Param('id') id: string,
    @Request() req: AuthenticatedRequest,
  ): Promise<IPAccessRule> {
    return this.accessControlService.updateRule(id, {
      requiresApproval: false,
      approvedBy: req.user.userId,
      approvedAt: new Date(),
    });
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
    return this.accessControlService.createRule({
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
    });
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
