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
 *
 * Note: TransformInterceptor automatically wraps responses with {success, data}.
 * Do NOT manually wrap responses here or it will cause double-nesting.
 */
@Controller('user-preferences')
@UseGuards(JwtAuthGuard)
export class UserPreferencesController {
  constructor(private readonly smartDefaultsService: SmartDefaultsService) {}

  /**
   * Get current user's preferences
   * Returns just the preferences data (TransformInterceptor wraps it)
   */
  @Get('me')
  async getMyPreferences(
    @Request() req: AuthenticatedRequest,
  ): Promise<UserPreferencesData> {
    const preferencesEntity =
      await this.smartDefaultsService.getUserPreferences(req.user.userId);

    // Return raw preferences data - TransformInterceptor wraps it with {success, data}
    return preferencesEntity.preferences;
  }

  /**
   * Update current user's preferences (partial update)
   * Returns just the updated preferences data (TransformInterceptor wraps it)
   */
  @Patch('me')
  async updateMyPreferences(
    @Request() req: AuthenticatedRequest,
    @Body() body: Partial<UserPreferencesData>,
  ): Promise<UserPreferencesData> {
    const preferencesEntity =
      await this.smartDefaultsService.updateUserPreferences(
        req.user.userId,
        body,
      );

    // Return raw preferences data - TransformInterceptor wraps it with {success, data}
    return preferencesEntity.preferences;
  }
}
