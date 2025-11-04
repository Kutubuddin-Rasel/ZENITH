import {
  Controller,
  Get,
  Post,
  Put,
  Body,
  Param,
  UseGuards,
  Request,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { OnboardingService } from '../services/onboarding.service';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { PermissionsGuard } from '../../auth/guards/permissions.guard';
import { RequirePermission } from '../../auth/decorators/require-permission.decorator';

@Controller('api/onboarding')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class OnboardingController {
  constructor(private onboardingService: OnboardingService) {}

  @Post('initialize')
  @RequirePermission('projects:view')
  async initializeOnboarding(
    @Request() req: any,
    @Body()
    body: {
      projectType?: string;
      teamSize?: number;
      methodology?: string;
      userRole?: string;
    },
  ) {
    const onboarding = await this.onboardingService.initializeOnboarding(
      req.user.id,
      body,
    );

    return {
      success: true,
      data: onboarding,
    };
  }

  @Get('progress')
  @RequirePermission('projects:view')
  async getOnboardingProgress(@Request() req: any) {
    const progress = await this.onboardingService.getOnboardingProgress(
      req.user.id,
    );

    return {
      success: true,
      data: progress,
    };
  }

  @Get('steps')
  @RequirePermission('projects:view')
  async getOnboardingSteps(@Request() req: any) {
    const steps = await this.onboardingService.getOnboardingSteps(req.user.id);

    return {
      success: true,
      data: steps,
    };
  }

  @Put('step/:stepId')
  @RequirePermission('projects:view')
  async updateStepProgress(
    @Request() req: any,
    @Param('stepId') stepId: string,
    @Body()
    body: {
      status: 'pending' | 'in_progress' | 'completed' | 'skipped';
      data?: Record<string, any>;
    },
  ) {
    const progress = await this.onboardingService.updateStepProgress(
      req.user.id,
      stepId,
      body.status as any,
      body.data,
    );

    return {
      success: true,
      data: progress,
    };
  }

  @Post('step/:stepId/skip')
  @HttpCode(HttpStatus.OK)
  @RequirePermission('projects:view')
  async skipStep(
    @Request() req: any,
    @Param('stepId') stepId: string,
    @Body() body: { reason?: string },
  ) {
    const progress = await this.onboardingService.skipStep(
      req.user.id,
      stepId,
      body.reason,
    );

    return {
      success: true,
      data: progress,
    };
  }

  @Post('complete')
  @HttpCode(HttpStatus.OK)
  @RequirePermission('projects:view')
  async completeOnboarding(@Request() req: any) {
    const progress = await this.onboardingService.completeOnboarding(
      req.user.id,
    );

    return {
      success: true,
      data: progress,
    };
  }

  @Post('reset')
  @HttpCode(HttpStatus.OK)
  @RequirePermission('projects:view')
  async resetOnboarding(@Request() req: any) {
    const progress = await this.onboardingService.resetOnboarding(req.user.id);

    return {
      success: true,
      data: progress,
    };
  }
}
