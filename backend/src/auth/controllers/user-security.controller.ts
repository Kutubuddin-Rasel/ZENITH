import {
  Body,
  Controller,
  Get,
  Patch,
  Request,
  UseGuards,
} from '@nestjs/common';

import { JwtAuthGuard } from '../guards/jwt-auth.guard';
import { AuthenticatedRequest } from '../../common/types/authenticated-request.interface';
import { SessionPreferencesService } from '../services/users/session-preferences.service';
import { NotificationPreferencesService } from '../../users/services/notification-preferences.service';
import { UpdateSessionPreferencesDto } from '../dto/update-session-preferences.dto';
import { UpdateNotificationPreferencesDto } from '../../users/dto/update-notification-preferences.dto';

/**
 * Step 4 relocation: the `/users/me/security-settings` endpoint used to live
 * in `UsersController` and read from a monolithic `UserSecuritySettingsService`.
 * Reads/writes now fan out to the two segregated services, but the HTTP
 * contract (single merged payload) is preserved so existing clients keep
 * working unchanged.
 */
interface CombinedSecuritySettingsDto
  extends UpdateSessionPreferencesDto, UpdateNotificationPreferencesDto {}

interface CombinedSecuritySettingsResponse {
  readonly userId: string;
  readonly sessionTimeoutMinutes: number;
  readonly maxConcurrentSessions: number;
  readonly killOldestOnLimit: boolean;
  readonly notifyOnNewLogin: boolean;
  readonly notifyOnPasswordChange: boolean;
  readonly notifyOnSecurityEvent: boolean;
}

@Controller('users')
export class UserSecurityController {
  constructor(
    private readonly sessionPreferencesService: SessionPreferencesService,
    private readonly notificationPreferencesService: NotificationPreferencesService,
  ) {}

  @UseGuards(JwtAuthGuard)
  @Get('me/security-settings')
  async getSecuritySettings(
    @Request() req: AuthenticatedRequest,
  ): Promise<CombinedSecuritySettingsResponse> {
    const userId = req.user.userId;
    const [session, notifications] = await Promise.all([
      this.sessionPreferencesService.getOrCreate(userId),
      this.notificationPreferencesService.getOrCreate(userId),
    ]);
    return {
      userId,
      sessionTimeoutMinutes: session.sessionTimeoutMinutes,
      maxConcurrentSessions: session.maxConcurrentSessions,
      killOldestOnLimit: session.killOldestOnLimit,
      notifyOnNewLogin: notifications.notifyOnNewLogin,
      notifyOnPasswordChange: notifications.notifyOnPasswordChange,
      notifyOnSecurityEvent: notifications.notifyOnSecurityEvent,
    };
  }

  @UseGuards(JwtAuthGuard)
  @Patch('me/security-settings')
  async updateSecuritySettings(
    @Request() req: AuthenticatedRequest,
    @Body() dto: CombinedSecuritySettingsDto,
  ): Promise<CombinedSecuritySettingsResponse> {
    const userId = req.user.userId;

    const sessionPatch: UpdateSessionPreferencesDto = {};
    if (dto.sessionTimeoutMinutes !== undefined) {
      sessionPatch.sessionTimeoutMinutes = dto.sessionTimeoutMinutes;
    }
    if (dto.maxConcurrentSessions !== undefined) {
      sessionPatch.maxConcurrentSessions = dto.maxConcurrentSessions;
    }
    if (dto.killOldestOnLimit !== undefined) {
      sessionPatch.killOldestOnLimit = dto.killOldestOnLimit;
    }

    const notificationPatch: UpdateNotificationPreferencesDto = {};
    if (dto.notifyOnNewLogin !== undefined) {
      notificationPatch.notifyOnNewLogin = dto.notifyOnNewLogin;
    }
    if (dto.notifyOnPasswordChange !== undefined) {
      notificationPatch.notifyOnPasswordChange = dto.notifyOnPasswordChange;
    }
    if (dto.notifyOnSecurityEvent !== undefined) {
      notificationPatch.notifyOnSecurityEvent = dto.notifyOnSecurityEvent;
    }

    const hasSessionPatch = Object.keys(sessionPatch).length > 0;
    const hasNotificationPatch = Object.keys(notificationPatch).length > 0;

    const [session, notifications] = await Promise.all([
      hasSessionPatch
        ? this.sessionPreferencesService.update(userId, sessionPatch)
        : this.sessionPreferencesService.getOrCreate(userId),
      hasNotificationPatch
        ? this.notificationPreferencesService.update(userId, notificationPatch)
        : this.notificationPreferencesService.getOrCreate(userId),
    ]);

    return {
      userId,
      sessionTimeoutMinutes: session.sessionTimeoutMinutes,
      maxConcurrentSessions: session.maxConcurrentSessions,
      killOldestOnLimit: session.killOldestOnLimit,
      notifyOnNewLogin: notifications.notifyOnNewLogin,
      notifyOnPasswordChange: notifications.notifyOnPasswordChange,
      notifyOnSecurityEvent: notifications.notifyOnSecurityEvent,
    };
  }
}
