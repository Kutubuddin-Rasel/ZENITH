import { Injectable, Logger } from '@nestjs/common';
import { SprintsService } from '../../sprints/sprints.service';

export interface RiskFactor {
  name: string;
  score: number; // 0-100, where 100 is high risk
  description: string;
}

interface Snapshot {
  totalPoints: number;
  completedPoints: number;
}

interface VelocityPoint {
  completedPoints: number;
}

export interface SprintRiskResult {
  score: number;
  level: string;
  factors: RiskFactor[];
}

@Injectable()
export class SprintRiskService {
  private readonly logger = new Logger(SprintRiskService.name);

  constructor(private readonly sprintsService: SprintsService) { }

  // Unused method kept for interface compatibility if needed, but erroring out
  async calculateSprintRisk(
    projectId: string,
    sprintId: string,
    userId: string,
  ): Promise<SprintRiskResult> {
    try {
      // 1. Fetch Sprint & Burndown & Velocity
      const [sprint, burndown, velocityData] = await Promise.all([
        this.sprintsService.findOne(projectId, sprintId, userId),
        this.sprintsService.getBurndown(
          projectId,
          sprintId,
          userId,
        ) as Promise<{ initialScope: number; snapshots: Snapshot[] }>,
        this.sprintsService.getVelocity(projectId, userId),
      ]);

      // 2. Scope Creep Risk
      const initialPoints = Number(burndown.initialScope) || 1;
      const currentPoints =
        Number(
          burndown.snapshots[burndown.snapshots.length - 1]?.totalPoints,
        ) || initialPoints;
      const pointsAdded = Math.max(0, currentPoints - initialPoints);
      const scopeCreep = (pointsAdded / initialPoints) * 100;

      const scopeRiskRef = {
        name: 'Scope Creep',
        score: Math.min(100, Math.round(scopeCreep * 2)),
        description: scopeCreep > 10 ? 'High scope expansion' : 'Stable scope',
      };

      // 3. Velocity Risk - use velocityData.history from new DTO structure
      const velocityHistory = velocityData.history;
      const avgVelocity =
        velocityHistory.reduce(
          (acc: number, v: VelocityPoint) => acc + Number(v.completedPoints),
          0,
        ) / (velocityHistory.length || 1);
      const velocityRiskScore =
        avgVelocity > 0 ? currentPoints / avgVelocity : 1.0;

      const velocityRiskRef = {
        name: 'Velocity Variance',
        score: velocityRiskScore > 1.2 ? 100 : velocityRiskScore > 1.0 ? 50 : 0,
        description:
          velocityRiskScore > 1.1
            ? 'Overcommitted vs Velocity'
            : 'Commitment fits Velocity',
      };

      // 4. Time Pressure
      const now = new Date();
      const start = new Date(sprint.startDate);
      const end = new Date(sprint.endDate);
      const totalDuration = end.getTime() - start.getTime();
      const elapsed = Math.max(0, now.getTime() - start.getTime()); // Don't allow negative elapased
      const timeProgress =
        totalDuration > 0 ? Math.min(1, elapsed / totalDuration) : 1;

      const completed =
        Number(
          burndown.snapshots[burndown.snapshots.length - 1]?.completedPoints,
        ) || 0;
      const workProgress =
        currentPoints > 0 ? Math.min(1, completed / currentPoints) : 1;

      const gap = timeProgress - workProgress;
      const timeRiskRef = {
        name: 'Time Pressure',
        score: gap > 0.2 ? 90 : gap > 0.1 ? 50 : 10,
        description: gap > 0.1 ? 'Behind schedule' : 'On track',
      };

      const finalScore = Math.round(
        scopeRiskRef.score * 0.3 +
        velocityRiskRef.score * 0.3 +
        timeRiskRef.score * 0.4,
      );

      return {
        score: finalScore,
        level: finalScore > 75 ? 'High' : finalScore > 40 ? 'Medium' : 'Low',
        factors: [scopeRiskRef, velocityRiskRef, timeRiskRef],
      };
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Unknown error';
      this.logger.error(`Failed to calculate sprint risk: ${msg}`);
      return { score: 0, level: 'Error', factors: [] };
    }
  }
}
