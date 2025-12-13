import { Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { GamificationService } from '../gamification.service';

@Injectable()
export class GamificationListener {
  private readonly logger = new Logger(GamificationListener.name);

  constructor(private readonly gamificationService: GamificationService) {}

  @OnEvent('sprint.event')
  async handleSprintEvent(payload: {
    projectId: string;
    action: string;
    actorId: string;
    sprintName: string;
  }) {
    // Check if the event is a sprint completion (archive)
    // SprintsService emits: "archived sprint {name}"
    if (payload.action.startsWith('archived sprint')) {
      this.logger.log(`Detected sprint completion by user ${payload.actorId}`);

      // Unlock "First Sprint" achievement
      await this.gamificationService.unlockAchievement(
        payload.actorId,
        'first-sprint',
      );
    }
  }
}
