import { Inject, Injectable } from '@nestjs/common';

import { AbstractSprintRepository } from '../repositories/abstract/sprint.repository.abstract';
import { AbstractSprintSnapshotRepository } from '../repositories/abstract/sprint-snapshot.repository.abstract';
import { SprintStatus } from '../entities/sprint.entity';
import { CACHE_INVALIDATOR_TOKEN } from '../../cache/constants/cache.tokens';
import type { ICacheInvalidator } from '../../cache/interfaces/cache.interfaces';
import type {
  ISprintSnapshot,
  SprintView,
} from '../interfaces/sprints.interfaces';

/**
 * SprintSnapshotService — burndown/burnup snapshot capture and the
 * system-wide active-sprint finder consumed by `SprintsCron`
 * (`SPRINT_SNAPSHOT_TOKEN`).
 *
 * Single owner of snapshot persistence: `SprintCommandService.startSprint`
 * delegates the initial capture here rather than duplicating it.
 * `findAllActiveSystemWide` replaces the legacy `_UNSAFE` smell with an
 * explicitly-named background-only contract (it bypasses tenant
 * isolation and must never be reached from a user-facing path).
 */
@Injectable()
export class SprintSnapshotService implements ISprintSnapshot {
  constructor(
    private readonly sprintRepo: AbstractSprintRepository,
    private readonly snapshotRepo: AbstractSprintSnapshotRepository,
    @Inject(CACHE_INVALIDATOR_TOKEN)
    private readonly cacheInvalidator: ICacheInvalidator,
  ) {}

  async captureSnapshot(sprintId: string): Promise<void> {
    const sprint = await this.sprintRepo.findById(sprintId);
    if (!sprint || sprint.status !== SprintStatus.ACTIVE) return;

    // DB-side aggregation instead of loading every issue.
    const stats = await this.sprintRepo.aggregateSprintStats(sprintId);
    if (!stats) return;

    const totalPoints = Number(stats.totalPoints || 0);
    const completedPoints = Number(stats.completedPoints || 0);
    const totalIssues = Number(stats.totalIssues || 0);
    const completedIssues = Number(stats.completedIssues || 0);

    const today = new Date().toISOString().split('T')[0];

    let snapshot = await this.snapshotRepo.findBySprintAndDate(sprintId, today);
    if (!snapshot) {
      snapshot = this.snapshotRepo.createEntity({ sprintId, date: today });
    }

    snapshot.totalPoints = totalPoints;
    snapshot.completedPoints = completedPoints;
    snapshot.remainingPoints = totalPoints - completedPoints;
    snapshot.totalIssues = totalIssues;
    snapshot.completedIssues = completedIssues;

    await this.snapshotRepo.save(snapshot);

    try {
      await this.cacheInvalidator.invalidateByTags([`sprint:${sprintId}`]);
    } catch {
      // Fire and forget — never fail snapshot capture for a cache issue.
    }
  }

  findAllActiveSystemWide(): Promise<readonly SprintView[]> {
    return this.sprintRepo.findAllActiveSystemWide();
  }
}
