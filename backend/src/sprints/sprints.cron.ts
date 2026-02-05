import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { SprintsService } from './sprints.service';

@Injectable()
export class SprintsCron {
  private readonly logger = new Logger(SprintsCron.name);

  constructor(private sprintsService: SprintsService) { }

  // Run every day at midnight
  @Cron(CronExpression.EVERY_DAY_AT_MIDNIGHT)
  async handleDailySnapshots() {
    this.logger.log('Starting daily sprint snapshots...');

    // We can't access "active" sprints easily without context,
    // but the service method handles filtering usually.
    // Ideally we need a method to "Snapshot ALL projects/sprints".
    // For now, let's fetch all active sprints across the system if possible,
    // OR we iterate project by project?
    // Actually, captureSnapshot takes a sprintId.
    // We need a way to find all ACTIVE sprints in the system.

    // For MVP, if finding all is hard without userId, we might need a system-level finder.
    // Let's assume we add a system-level method to SprintsService.

    // For this step, I will implement a loop in SprintsService to get all active sprints.
    const activeSprints = await this.sprintsService.findAllActiveSystemWide_UNSAFE();

    for (const sprint of activeSprints) {
      try {
        await this.sprintsService.captureSnapshot(sprint.id);
      } catch (e) {
        this.logger.error(
          `Failed to capture snapshot for sprint ${sprint.id}`,
          e,
        );
      }
    }

    this.logger.log(`Completed snapshots for ${activeSprints.length} sprints.`);
  }
}
