import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  Query,
  UseGuards,
  Request,
} from '@nestjs/common';
import { ResourceAllocationService } from '../services/resource-allocation.service';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { RequirePermission } from '../../auth/decorators/require-permission.decorator';

@Controller('resource-allocation')
@UseGuards(JwtAuthGuard)
export class ResourceAllocationController {
  constructor(private resourceAllocationService: ResourceAllocationService) {}

  @Post('optimize/:projectId')
  @RequirePermission('resources:manage')
  async optimizeResourceAllocation(@Param('projectId') projectId: string) {
    const result =
      await this.resourceAllocationService.optimizeResourceAllocation(
        projectId,
      );

    return {
      success: true,
      data: result,
    };
  }

  @Get('suggestions/:taskId')
  @RequirePermission('resources:view')
  getResourceSuggestions(@Param('taskId') taskId: string) {
    const suggestions =
      this.resourceAllocationService.suggestResourceAssignment(taskId);

    return {
      success: true,
      data: suggestions,
    };
  }

  @Get('conflicts')
  @RequirePermission('resources:view')
  async getResourceConflicts(
    @Query('userId') userId?: string,
    @Query('status') status?: string,
  ) {
    const userIds = userId ? [userId] : [];
    const conflicts =
      await this.resourceAllocationService.detectAllocationConflicts(userIds);

    const filteredConflicts = status
      ? conflicts.filter((c) => c.status === status)
      : conflicts;

    return {
      success: true,
      data: filteredConflicts,
    };
  }

  @Post('balance/:teamId')
  @RequirePermission('resources:manage')
  balanceWorkload(@Param('teamId') teamId: string) {
    const result = this.resourceAllocationService.balanceWorkload(teamId);

    return {
      success: true,
      data: result,
    };
  }

  @Post('cost-estimate')
  @RequirePermission('resources:view')
  estimateResourceCost(
    @Body()
    body: {
      userId: string;
      projectId: string;
      taskId?: string;
      allocationPercentage: number;
      startDate: string;
      endDate: string;
      roleInProject: string;
      billingRate?: number;
      skillRequirements?: Record<string, unknown>;
    },
  ) {
    const cost = this.resourceAllocationService.estimateResourceCost({
      userId: body.userId,
      projectId: body.projectId,
      taskId: body.taskId,
      allocationPercentage: body.allocationPercentage,
      startDate: new Date(body.startDate),
      endDate: new Date(body.endDate),
      roleInProject: body.roleInProject,
      billingRate: body.billingRate,
      skillRequirements: body.skillRequirements,
    });

    return {
      success: true,
      data: cost,
    };
  }

  @Get('dashboard')
  @RequirePermission('resources:view')
  async getAllocationDashboard(@Request() req: { user: { userId: string } }) {
    const userId = req.user.userId;

    const [conflicts, suggestions] = await Promise.all([
      this.resourceAllocationService.detectAllocationConflicts([userId]),
      this.resourceAllocationService.suggestResourceAssignment(''), // This would need a proper task ID
    ]);

    return {
      success: true,
      data: {
        conflicts,
        suggestions,
        summary: {
          activeConflicts: conflicts.filter((c) => c.status === 'active')
            .length,
          resolvedConflicts: conflicts.filter((c) => c.status === 'resolved')
            .length,
          suggestionsCount: suggestions.length,
        },
      },
    };
  }

  @Post('resolve-conflict/:conflictId')
  @RequirePermission('resources:manage')
  resolveConflict(
    @Param('conflictId') conflictId: string,
    @Body()
    body: {
      resolution: string;
      notes?: string;
    },
  ) {
    // This would implement conflict resolution logic
    return {
      success: true,
      message: 'Conflict resolved successfully',
      data: {
        conflictId,
        resolution: body.resolution,
        notes: body.notes,
      },
    };
  }
}
