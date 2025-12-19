import {
  Controller,
  Get,
  Patch,
  Body,
  UseGuards,
  Request,
} from '@nestjs/common';
import { SmartDefaultsService } from '../services/smart-defaults.service';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { AuthenticatedRequest } from '../../common/types/authenticated-request.interface';
import { UserPreferencesData } from '../entities/user-preferences.entity';

/**
 * User Preferences Controller
 * Provides simple endpoints for users to manage their own preferences
 *
 * Endpoints:
 * - GET /user-preferences/me - Fetch current user's preferences
 * - PATCH /user-preferences/me - Update current user's preferences (partial)
 */
@Controller('user-preferences')
@UseGuards(JwtAuthGuard)
export class UserPreferencesController {
  constructor(private readonly smartDefaultsService: SmartDefaultsService) {}

  /**
   * Get current user's preferences
   * Uses @CurrentUser from JwtAuthGuard via req.user
   */
  @Get('me')
  async getMyPreferences(@Request() req: AuthenticatedRequest) {
    const preferences = await this.smartDefaultsService.getUserPreferences(
      req.user.userId,
    );

    return {
      success: true,
      data: preferences,
    };
  }

  /**
   * Update current user's preferences (partial update)
   * Accepts any subset of UserPreferencesData
   */
  @Patch('me')
  async updateMyPreferences(
    @Request() req: AuthenticatedRequest,
    @Body() body: Partial<UserPreferencesData>,
  ) {
    const preferences = await this.smartDefaultsService.updateUserPreferences(
      req.user.userId,
      body,
    );

    return {
      success: true,
      data: preferences,
      message: 'Preferences updated successfully',
    };
  }
}
