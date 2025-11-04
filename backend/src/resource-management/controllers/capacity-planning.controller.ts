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
import { CapacityPlanningService } from '../services/capacity-planning.service';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { RequirePermission } from '../../auth/decorators/require-permission.decorator';

@Controller('capacity-planning')
@UseGuards(JwtAuthGuard)
export class CapacityPlanningController {
  constructor(private capacityPlanningService: CapacityPlanningService) {}

  @Get('user/:userId')
  @RequirePermission('resources:view')
  async getUserCapacity(
    @Param('userId') userId: string,
    @Query('startDate') startDate: string,
    @Query('endDate') endDate: string,
  ) {
    const start = new Date(startDate);
    const end = new Date(endDate);

    const capacity = await this.capacityPlanningService.getUserCapacity(
      userId,
      start,
      end,
    );

    return {
      success: true,
      data: capacity,
    };
  }

  @Get('team/:teamId')
  @RequirePermission('resources:view')
  async getTeamCapacity(
    @Param('teamId') teamId: string,
    @Query('startDate') startDate: string,
    @Query('endDate') endDate: string,
  ) {
    const start = new Date(startDate);
    const end = new Date(endDate);

    const capacity = await this.capacityPlanningService.getTeamCapacity(
      teamId,
      {
        startDate: start,
        endDate: end,
      },
    );

    return {
      success: true,
      data: capacity,
    };
  }

  @Get('utilization/:userId')
  @RequirePermission('resources:view')
  async getCapacityUtilization(
    @Param('userId') userId: string,
    @Query('date') date: string,
  ) {
    const targetDate = new Date(date);

    const utilization =
      await this.capacityPlanningService.calculateCapacityUtilization(
        userId,
        targetDate,
      );

    return {
      success: true,
      data: utilization,
    };
  }

  @Get('bottlenecks/:projectId')
  @RequirePermission('resources:view')
  async getCapacityBottlenecks(@Param('projectId') projectId: string) {
    const bottlenecks =
      await this.capacityPlanningService.identifyCapacityBottlenecks(projectId);

    return {
      success: true,
      data: bottlenecks,
    };
  }

  @Post('report')
  @RequirePermission('resources:view')
  async generateCapacityReport(
    @Body()
    body: {
      startDate: string;
      endDate: string;
      teamId?: string;
      projectId?: string;
      includeConflicts?: boolean;
    },
  ) {
    const report = await this.capacityPlanningService.generateCapacityReport({
      startDate: new Date(body.startDate),
      endDate: new Date(body.endDate),
      teamId: body.teamId,
      projectId: body.projectId,
      includeConflicts: body.includeConflicts,
    });

    return {
      success: true,
      data: report,
    };
  }

  @Get('dashboard')
  @RequirePermission('resources:view')
  async getCapacityDashboard(@Request() req: { user: { userId: string } }) {
    const userId = req.user.userId;
    const endDate = new Date();
    const startDate = new Date(endDate.getTime() - 30 * 24 * 60 * 60 * 1000); // 30 days ago

    const [userCapacity, utilization] = await Promise.all([
      this.capacityPlanningService.getUserCapacity(userId, startDate, endDate),
      this.capacityPlanningService.calculateCapacityUtilization(
        userId,
        endDate,
      ),
    ]);

    return {
      success: true,
      data: {
        userCapacity,
        utilization,
        summary: {
          totalDays: userCapacity.length,
          averageUtilization:
            userCapacity.reduce((sum, c) => sum + c.capacityPercentage, 0) /
            userCapacity.length,
          overallocatedDays: userCapacity.filter(
            (c) => c.capacityPercentage > 100,
          ).length,
        },
      },
    };
  }
}
