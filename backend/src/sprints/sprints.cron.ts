import { Inject, Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { SPRINT_SNAPSHOT_TOKEN } from './constants/sprints.tokens';
import type { ISprintSnapshot } from './interfaces/sprints.interfaces';

@Injectable()
export class SprintsCron {
  private readonly logger = new Logger(SprintsCron.name);

  // SOLID Refactor (Step 4): the cron depends only on the snapshot surface
  // (`SPRINT_SNAPSHOT_TOKEN` → `SprintSnapshotService`), not the deleted
  // `SprintsService` god class. `findAllActiveSystemWide` replaces the
  // legacy `_UNSAFE` smell with an explicitly background-only contract.
  constructor(
    @Inject(SPRINT_SNAPSHOT_TOKEN)
    private readonly sprintSnapshots: ISprintSnapshot,
  ) {}

  // Run every day at midnight
  @Cron(CronExpression.EVERY_DAY_AT_MIDNIGHT)
  async handleDailySnapshots() {
    this.logger.log('Starting daily sprint snapshots...');

    const activeSprints = await this.sprintSnapshots.findAllActiveSystemWide();

    for (const sprint of activeSprints) {
      try {
        await this.sprintSnapshots.captureSnapshot(sprint.id);
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
