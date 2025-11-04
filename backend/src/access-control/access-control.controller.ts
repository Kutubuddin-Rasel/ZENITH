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
import { PermissionsGuard } from '../auth/guards/permissions.guard';
import { RequirePermission } from '../auth/decorators/require-permission.decorator';

export class CreateAccessRuleDto {
  ruleType: AccessRuleType;
  name: string;
  description?: string;
  ipAddress: string;
  ipType?: IPType;
  endIpAddress?: string;
  country?: string;
  region?: string;
  city?: string;
  timezone?: string;
  allowedStartTime?: string;
  allowedEndTime?: string;
  allowedDays?: number[];
  userId?: string;
  allowedRoles?: string[];
  allowedProjects?: string[];
  validFrom?: Date;
  validUntil?: Date;
  isTemporary?: boolean;
  expiresAt?: Date;
  isEmergency?: boolean;
  emergencyReason?: string;
  requiresApproval?: boolean;
  priority?: number;
  isLoggingEnabled?: boolean;
  isNotificationEnabled?: boolean;
  notificationChannels?: string[];
  metadata?: Record<string, any>;
}

export class UpdateAccessRuleDto {
  name?: string;
  description?: string;
  status?: AccessRuleStatus;
  ipAddress?: string;
  ipType?: IPType;
  endIpAddress?: string;
  country?: string;
  region?: string;
  city?: string;
  timezone?: string;
  allowedStartTime?: string;
  allowedEndTime?: string;
  allowedDays?: number[];
  allowedRoles?: string[];
  allowedProjects?: string[];
  validFrom?: Date;
  validUntil?: Date;
  isTemporary?: boolean;
  expiresAt?: Date;
  isEmergency?: boolean;
  emergencyReason?: string;
  requiresApproval?: boolean;
  priority?: number;
  isLoggingEnabled?: boolean;
  isNotificationEnabled?: boolean;
  notificationChannels?: string[];
  metadata?: Record<string, any>;
}

export class TestAccessDto {
  ipAddress: string;
  userId?: string;
  projectId?: string;
  userRoles?: string[];
}

@Controller('access-control')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class AccessControlController {
  constructor(private accessControlService: AccessControlService) {}

  @Post('test')
  @HttpCode(HttpStatus.OK)
  @RequirePermission('access_control:test')
  async testAccess(
    @Body() testData: TestAccessDto,
    @Request() req: any,
  ): Promise<AccessCheckResult> {
    const reqData = req as Record<string, unknown>;
    return this.accessControlService.checkAccess(
      testData.ipAddress,
      testData.userId ||
        ((reqData.user as Record<string, unknown>)?.userId as string),
      (reqData.headers as Record<string, unknown>)['user-agent'] as string,
      testData.projectId,
      testData.userRoles ||
        ((reqData.user as Record<string, unknown>)?.roles as string[]),
    );
  }

  @Post('rules')
  @HttpCode(HttpStatus.CREATED)
  @RequirePermission('access_control:create')
  async createRule(
    @Body() createRuleDto: CreateAccessRuleDto,
    @Request() req: any,
  ): Promise<IPAccessRule> {
    const reqData = req as Record<string, unknown>;
    return this.accessControlService.createRule({
      ...createRuleDto,
      createdBy: (reqData.user as Record<string, unknown>)?.userId as string,
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
    @Request() req: any,
  ): Promise<IPAccessRule> {
    const reqData = req as Record<string, unknown>;
    return this.accessControlService.updateRule(id, {
      ...updateRuleDto,
      createdBy: (reqData.user as Record<string, unknown>)?.userId as string,
    });
  }

  @Delete('rules/:id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @RequirePermission('access_control:delete')
  async deleteRule(
    @Param('id') id: string,
    @Request() req: any,
  ): Promise<void> {
    const reqData = req as Record<string, unknown>;
    return this.accessControlService.deleteRule(
      id,
      (reqData.user as Record<string, unknown>)?.userId as string,
    );
  }

  @Get('stats')
  @RequirePermission('access_control:read:stats')
  async getStats(): Promise<any> {
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
    @Request() req: any,
  ): Promise<IPAccessRule> {
    const reqData = req as Record<string, unknown>;
    return this.accessControlService.updateRule(id, {
      requiresApproval: false,
      approvedBy: (reqData.user as Record<string, unknown>)?.userId as string,
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
    @Request() req: any,
  ): Promise<IPAccessRule> {
    return this.accessControlService.createRule({
      ruleType: AccessRuleType.WHITELIST,
      name: `Emergency Access - ${emergencyData.reason}`,
      description: `Emergency access granted by ${((req as Record<string, unknown>).user as Record<string, unknown>)?.name as string}`,
      ipAddress: emergencyData.ipAddress,
      ipType: IPType.SINGLE,
      isEmergency: true,
      emergencyReason: emergencyData.reason,
      isTemporary: true,
      expiresAt: emergencyData.expiresAt,
      priority: 1000, // Highest priority
      createdBy: (
        (req as Record<string, unknown>).user as Record<string, unknown>
      )?.userId as string,
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
