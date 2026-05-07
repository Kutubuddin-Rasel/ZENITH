import { Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { GamificationService } from '../gamification.service';
import type { OnboardingCompletedEvent } from '../../onboarding/events/onboarding-events';

/**
 * Cross-module gamification hook for the onboarding funnel.
 *
 * Listens on the literal event name (not the constant) to avoid creating a
 * runtime import dependency on the OnboardingModule. The payload type is
 * imported with `import type` so TypeScript validates the contract without
 * coupling the modules.
 */
@Injectable()
export class OnboardingGamificationListener {
  private readonly logger = new Logger(OnboardingGamificationListener.name);

  constructor(private readonly gamificationService: GamificationService) {}

  @OnEvent('onboarding.completed', { async: true })
  async handleOnboardingCompleted(
    event: OnboardingCompletedEvent,
  ): Promise<void> {
    this.logger.log(
      `Onboarding completed by user ${event.userId} (skipped=${event.skippedSteps}/${event.totalSteps})`,
    );

    await this.gamificationService.unlockAchievement(
      event.userId,
      'onboarding-champion',
    );

    if (event.completedWithoutSkipping) {
      this.logger.log(
        `Flawless onboarding bonus granted to user ${event.userId}`,
      );
      await this.gamificationService.unlockAchievement(
        event.userId,
        'flawless-onboarding',
      );
    }
  }
}
