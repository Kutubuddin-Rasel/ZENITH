import { Inject, Injectable } from '@nestjs/common';

import { AbstractSprintRepository } from '../repositories/abstract/sprint.repository.abstract';
import { AbstractSprintSnapshotRepository } from '../repositories/abstract/sprint-snapshot.repository.abstract';
import { ProjectLookupPort } from '../ports/project-lookup.port';
import { NotFoundException } from '@nestjs/common';
import { SprintQueryService } from './sprint-query.service';
import {
  BurndownResponseDto,
  BurndownSnapshotDto,
  BurnupResponseDto,
  BurnupSnapshotDto,
  SprintSummaryDto,
  VelocityPointDto,
  VelocityResponseDto,
} from '../dto/sprint-metrics.dto';
import { CACHE_STORE_TOKEN } from '../../cache/constants/cache.tokens';
import type { ICacheStore } from '../../cache/interfaces/cache.interfaces';
import type {
  ISprintMetrics,
  SprintView,
} from '../interfaces/sprints.interfaces';

// Snapshots are daily, so 5-minute staleness on derived charts is fine.
const CACHE_TTL_SECONDS = 300;

/**
 * SprintAnalyticsService — read-heavy burndown/burnup/velocity surface
 * (`SPRINT_METRICS_TOKEN`), implementing `ISprintMetrics`.
 *
 * Directive B ("Prep for ClickHouse"): this is the ISOLATED analytics
 * read surface. It still reads Postgres `SprintSnapshot` rows through
 * `AbstractSprintSnapshotRepository`, but lives behind its own token so
 * the read backend can be swapped to ClickHouse in the Level-5 Data/ML
 * phase without touching any core sprint business logic. Sprint
 * resolution + membership checks are delegated to `SprintQueryService`.
 */
@Injectable()
export class SprintAnalyticsService implements ISprintMetrics {
  constructor(
    private readonly sprintRepo: AbstractSprintRepository,
    private readonly snapshotRepo: AbstractSprintSnapshotRepository,
    private readonly projectLookup: ProjectLookupPort,
    private readonly query: SprintQueryService,
    @Inject(CACHE_STORE_TOKEN) private readonly cacheStore: ICacheStore,
  ) {}

  async getVelocity(
    projectId: string,
    _userId: string,
  ): Promise<VelocityResponseDto> {
    const cacheKey = `project:${projectId}:velocity`;
    const cached = await this.cacheStore.get<VelocityResponseDto>(cacheKey);
    if (cached) return cached;

    const exists = await this.projectLookup.existsForTenant(projectId);
    if (!exists) throw new NotFoundException('Project not found');

    const sprints = await this.sprintRepo.findRecentCompleted(projectId, 5);

    // No history: neutral trend, do NOT cache the empty state.
    if (sprints.length === 0) {
      return { history: [], average: 0, trend: 'stable' };
    }

    const sprintIds = sprints.map((s) => s.id);
    const latestSnapshots =
      await this.snapshotRepo.findLatestPerSprint(sprintIds);
    const snapshotMap = new Map(latestSnapshots.map((s) => [s.sprintId, s]));

    const history: VelocityPointDto[] = sprints.reverse().map((sprint) => {
      const snapshot = snapshotMap.get(sprint.id);
      return {
        sprintId: sprint.id,
        sprintName: sprint.name,
        completedPoints: snapshot?.completedPoints || 0,
        totalPoints: snapshot?.totalPoints || 0,
      };
    });

    const totalCompleted = history.reduce(
      (sum, h) => sum + h.completedPoints,
      0,
    );
    const average = parseFloat((totalCompleted / history.length).toFixed(2));
    const trend = this.calculateVelocityTrend(history);

    const result: VelocityResponseDto = { history, average, trend };
    await this.cacheStore.set(cacheKey, result, {
      ttl: CACHE_TTL_SECONDS,
      tags: [`project:${projectId}`],
    });
    return result;
  }

  async getBurndown(
    projectId: string,
    sprintId: string,
    userId: string,
  ): Promise<BurndownResponseDto> {
    const cacheKey = `sprint:${sprintId}:burndown`;
    const cached = await this.cacheStore.get<BurndownResponseDto>(cacheKey);
    if (cached) return cached;

    const sprint = await this.query.findOne(projectId, sprintId, userId);
    const snapshots = await this.snapshotRepo.findBySprintOrdered(sprintId);

    const start = new Date(sprint.startDate);
    const end = new Date(sprint.endDate);
    const totalDays = Math.ceil(
      (end.getTime() - start.getTime()) / (1000 * 3600 * 24),
    );

    const initialScope = snapshots.length > 0 ? snapshots[0].totalPoints : 0;
    const idealBurnRate = parseFloat(
      (initialScope / (totalDays || 1)).toFixed(2),
    );

    const sprintSummary = this.toSummary(sprint);
    const burndownSnapshots: BurndownSnapshotDto[] = snapshots.map((s) => ({
      date: s.date,
      totalPoints: s.totalPoints,
      completedPoints: s.completedPoints,
      remainingPoints: s.remainingPoints,
      totalIssues: s.totalIssues,
      completedIssues: s.completedIssues,
    }));

    const result: BurndownResponseDto = {
      sprint: sprintSummary,
      snapshots: burndownSnapshots,
      idealBurnRate,
      initialScope,
      totalDays,
    };
    await this.cacheStore.set(cacheKey, result, {
      ttl: CACHE_TTL_SECONDS,
      tags: [`sprint:${sprintId}`],
    });
    return result;
  }

  async getBurnup(
    projectId: string,
    sprintId: string,
    userId: string,
  ): Promise<BurnupResponseDto> {
    const cacheKey = `sprint:${sprintId}:burnup`;
    const cached = await this.cacheStore.get<BurnupResponseDto>(cacheKey);
    if (cached) return cached;

    const sprint = await this.query.findOne(projectId, sprintId, userId);
    const snapshots = await this.snapshotRepo.findBySprintOrdered(sprintId);

    const initialScope = snapshots.length > 0 ? snapshots[0].totalPoints : 0;
    const currentScope =
      snapshots.length > 0 ? snapshots[snapshots.length - 1].totalPoints : 0;
    const scopeCreep = currentScope - initialScope;
    const scopeCreepPercentage =
      initialScope > 0
        ? parseFloat(((scopeCreep / initialScope) * 100).toFixed(2))
        : 0;

    const sprintSummary = this.toSummary(sprint);
    const burnupSnapshots: BurnupSnapshotDto[] = snapshots.map((s) => ({
      date: s.date,
      completedPoints: s.completedPoints,
      totalScope: s.totalPoints,
      remainingPoints: s.remainingPoints,
    }));

    const result: BurnupResponseDto = {
      sprint: sprintSummary,
      snapshots: burnupSnapshots,
      initialScope,
      currentScope,
      scopeCreep,
      scopeCreepPercentage,
    };
    await this.cacheStore.set(cacheKey, result, {
      ttl: CACHE_TTL_SECONDS,
      tags: [`sprint:${sprintId}`],
    });
    return result;
  }

  private toSummary(sprint: SprintView): SprintSummaryDto {
    return {
      id: sprint.id,
      name: sprint.name,
      startDate: sprint.startDate,
      endDate: sprint.endDate,
      status: sprint.status,
    };
  }

  private calculateVelocityTrend(
    history: VelocityPointDto[],
  ): 'stable' | 'increasing' | 'decreasing' {
    if (history.length < 2) return 'stable';

    const mid = Math.floor(history.length / 2);
    const firstHalf = history.slice(0, mid);
    const secondHalf = history.slice(mid);

    const firstAvg =
      firstHalf.reduce((s, h) => s + h.completedPoints, 0) / firstHalf.length;
    const secondAvg =
      secondHalf.reduce((s, h) => s + h.completedPoints, 0) / secondHalf.length;

    const threshold = 0.1;
    const percentChange = (secondAvg - firstAvg) / (firstAvg || 1);

    if (percentChange > threshold) return 'increasing';
    if (percentChange < -threshold) return 'decreasing';
    return 'stable';
  }
}
