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
import { PermissionsGuard } from '../../core/auth/guards/permissions.guard';
import { OnboardingStepStatus } from '../entities/onboarding-progress.entity';
import { AuthenticatedRequest } from '../../common/types/authenticated-request.interface';

@Controller('api/onboarding')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class OnboardingController {
  constructor(private onboardingService: OnboardingService) {}

  @Post('initialize')
  @HttpCode(HttpStatus.OK)
  async initialize(
    @Request() req: AuthenticatedRequest,
    @Body()
    context?: {
      projectType?: string;
      teamSize?: number;
      methodology?: string;
      userRole?: string;
    },
  ) {
    const progress = await this.onboardingService.initializeOnboarding(
      req.user.id,
      context,
    );

    return {
      success: true,
      data: progress,
      message: 'Onboarding initialized successfully',
    };
  }

  @Get('progress')
  async getProgress(@Request() req: AuthenticatedRequest) {
    const progress = await this.onboardingService.getOnboardingProgress(
      req.user.id,
    );

    return {
      success: true,
      data: progress,
    };
  }

  @Get('steps')
  async getSteps(@Request() req: AuthenticatedRequest) {
    const steps = await this.onboardingService.getOnboardingSteps(req.user.id);

    return {
      success: true,
      data: steps,
    };
  }

  @Put('step/:stepId')
  @HttpCode(HttpStatus.OK)
  async updateStep(
    @Request() req: AuthenticatedRequest,
    @Param('stepId') stepId: string,
    @Body()
    body: {
      status: OnboardingStepStatus;
      data?: Record<string, unknown>;
    },
  ) {
    const progress = await this.onboardingService.updateStepProgress(
      req.user.id,
      stepId,
      body.status,
      body.data,
    );

    return {
      success: true,
      data: progress,
      message: 'Step progress updated successfully',
    };
  }

  @Post('step/:stepId/skip')
  @HttpCode(HttpStatus.OK)
  async skipStep(
    @Request() req: AuthenticatedRequest,
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
      message: 'Step skipped successfully',
    };
  }

  @Post('complete')
  @HttpCode(HttpStatus.OK)
  async complete(@Request() req: AuthenticatedRequest) {
    const progress = await this.onboardingService.completeOnboarding(
      req.user.id,
    );

    return {
      success: true,
      data: progress,
      message: 'Onboarding completed successfully! 🎉',
    };
  }

  @Post('reset')
  @HttpCode(HttpStatus.OK)
  async reset(@Request() req: AuthenticatedRequest) {
    const progress = await this.onboardingService.resetOnboarding(req.user.id);

    return {
      success: true,
      data: progress,
      message: 'Onboarding reset successfully',
    };
  }
}
