import { Inject, Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { NotificationType } from '../entities/notification.entity';
import { INotificationRouter } from '../interfaces/notifications.interfaces';
import { NOTIFICATION_ROUTER_TOKEN } from '../constants/notifications.tokens';

/**
 * Bridges gamification events into the Notifications subsystem.
 *
 * Listens to 'achievement.unlocked' emitted by GamificationService
 * and creates an in-app + WebSocket notification via NotificationsService.
 *
 * This listener lives in the notifications module (not gamification)
 * because it depends on NotificationsService, which is NOT exported
 * to gamification. It follows the same architectural pattern as
 * NotificationsListener for invite events.
 */
@Injectable()
export class AchievementNotificationListener {
  private readonly logger = new Logger(AchievementNotificationListener.name);

  constructor(
    @Inject(NOTIFICATION_ROUTER_TOKEN)
    private readonly router: INotificationRouter,
  ) {}

  @OnEvent('achievement.unlocked')
  async handleAchievementUnlocked(payload: {
    userId: string;
    achievement: {
      id: string;
      slug: string;
      name: string;
      description: string;
      icon: string;
      xp: number;
    };
    unlockedAt: Date;
  }) {
    try {
      await this.router.createMany(
        [payload.userId],
        `🏆 Achievement Unlocked: ${payload.achievement.name} (+${payload.achievement.xp} XP)`,
        {
          type: 'achievement_unlocked',
          achievementId: payload.achievement.id,
          slug: payload.achievement.slug,
          icon: payload.achievement.icon,
          xp: payload.achievement.xp,
          description: payload.achievement.description,
        },
        NotificationType.SUCCESS,
      );

      this.logger.log(
        `Sent achievement notification to user ${payload.userId}: ${payload.achievement.name}`,
      );
    } catch (error) {
      this.logger.error(
        `Failed to send achievement notification: ${(error as Error).message}`,
      );
    }
  }
}
