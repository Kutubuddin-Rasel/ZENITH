import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AIPredictionLog } from '../entities/ai-prediction-log.entity';

export interface ShadowModeStats {
  totalPredictions: number;
  evaluatedPredictions: number;
  accuratePredictions: number;
  inaccuratePredictions: number;
  accuracyRate: number;
  averageConfidence: number;
  confidenceDistribution: {
    high: number; // >= 0.95
    medium: number; // >= 0.75
    low: number; // < 0.75
  };
  byModel: Record<string, { total: number; accurate: number; rate: number }>;
  recentTrend: Array<{ date: string; accuracy: number; count: number }>;
}

export interface OutlierResult {
  id: string;
  issueId: string;
  confidence: number;
  predictedPriority: string;
  actualPriority: string;
  predictedLabels: string[];
  actualLabels: string[];
  createdAt: Date;
  reason: string;
}

@Injectable()
export class PredictionAnalyticsService {
  private readonly logger = new Logger(PredictionAnalyticsService.name);

  constructor(
    @InjectRepository(AIPredictionLog)
    private readonly predictionLogRepo: Repository<AIPredictionLog>,
  ) {}

  /**
   * Get comprehensive shadow mode statistics
   */
  async getShadowModeStats(daysLookback = 30): Promise<ShadowModeStats> {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - daysLookback);

    // Total and evaluated counts
    const total = await this.predictionLogRepo
      .createQueryBuilder('log')
      .where('log.createdAt >= :cutoffDate', { cutoffDate })
      .getCount();

    const evaluated = await this.predictionLogRepo
      .createQueryBuilder('log')
      .where('log.createdAt >= :cutoffDate', { cutoffDate })
      .andWhere('log.wasAccurate IS NOT NULL')
      .getCount();

    const accurate = await this.predictionLogRepo
      .createQueryBuilder('log')
      .where('log.createdAt >= :cutoffDate', { cutoffDate })
      .andWhere('log.wasAccurate = true')
      .getCount();

    const inaccurate = evaluated - accurate;
    const accuracyRate = evaluated > 0 ? accurate / evaluated : 0;

    // Confidence distribution using JSONB extraction
    const confidenceStats = await this.predictionLogRepo
      .createQueryBuilder('log')
      .select(
        "CASE WHEN (log.prediction->>'confidence')::float >= 0.95 THEN 'high' WHEN (log.prediction->>'confidence')::float >= 0.75 THEN 'medium' ELSE 'low' END",
        'bucket',
      )
      .addSelect('COUNT(*)', 'count')
      .where('log.createdAt >= :cutoffDate', { cutoffDate })
      .groupBy('bucket')
      .getRawMany<{ bucket: string; count: string }>();

    const confidenceDistribution = { high: 0, medium: 0, low: 0 };
    for (const row of confidenceStats) {
      confidenceDistribution[
        row.bucket as keyof typeof confidenceDistribution
      ] = parseInt(row.count);
    }

    // Average confidence
    const avgResult = await this.predictionLogRepo
      .createQueryBuilder('log')
      .select("AVG((log.prediction->>'confidence')::float)", 'avg')
      .where('log.createdAt >= :cutoffDate', { cutoffDate })
      .getRawOne<{ avg: string }>();

    const averageConfidence = parseFloat(avgResult?.avg || '0');

    // By model breakdown
    const modelStats = await this.predictionLogRepo
      .createQueryBuilder('log')
      .select('log.model', 'model')
      .addSelect('COUNT(*)', 'total')
      .addSelect(
        'SUM(CASE WHEN log.wasAccurate = true THEN 1 ELSE 0 END)',
        'accurate',
      )
      .where('log.createdAt >= :cutoffDate', { cutoffDate })
      .andWhere('log.model IS NOT NULL')
      .groupBy('log.model')
      .getRawMany<{ model: string; total: string; accurate: string }>();

    const byModel: Record<
      string,
      { total: number; accurate: number; rate: number }
    > = {};
    for (const row of modelStats) {
      const totalCount = parseInt(row.total);
      const accurateCount = parseInt(row.accurate);
      byModel[row.model] = {
        total: totalCount,
        accurate: accurateCount,
        rate: totalCount > 0 ? accurateCount / totalCount : 0,
      };
    }

    // Recent trend (last 7 days)
    const trendData = await this.predictionLogRepo
      .createQueryBuilder('log')
      .select('DATE(log.createdAt)', 'date')
      .addSelect('COUNT(*)', 'count')
      .addSelect(
        'SUM(CASE WHEN log.wasAccurate = true THEN 1 ELSE 0 END)',
        'accurate',
      )
      .where('log.createdAt >= :startDate', {
        startDate: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000),
      })
      .andWhere('log.wasAccurate IS NOT NULL')
      .groupBy('DATE(log.createdAt)')
      .orderBy('DATE(log.createdAt)', 'ASC')
      .getRawMany<{ date: string; count: string; accurate: string }>();

    const recentTrend = trendData.map((row) => ({
      date: row.date,
      count: parseInt(row.count),
      accuracy:
        parseInt(row.count) > 0
          ? parseInt(row.accurate) / parseInt(row.count)
          : 0,
    }));

    return {
      totalPredictions: total,
      evaluatedPredictions: evaluated,
      accuratePredictions: accurate,
      inaccuratePredictions: inaccurate,
      accuracyRate,
      averageConfidence,
      confidenceDistribution,
      byModel,
      recentTrend,
    };
  }

  /**
   * Find outliers - predictions that were highly confident but inaccurate
   */
  async getOutliers(limit = 20): Promise<OutlierResult[]> {
    // Find high-confidence predictions that were wrong
    const outliers = await this.predictionLogRepo
      .createQueryBuilder('log')
      .where("(log.prediction->>'confidence')::float >= 0.75")
      .andWhere('log.wasAccurate = false')
      .orderBy("(log.prediction->>'confidence')::float", 'DESC')
      .take(limit)
      .getMany();

    return outliers.map((log) => ({
      id: log.id,
      issueId: log.issueId,
      confidence:
        typeof log.prediction.confidence === 'number'
          ? log.prediction.confidence
          : 0,
      predictedPriority: log.prediction.priority || 'Unknown',
      actualPriority: log.actualOutcome?.priority || 'Unknown',
      predictedLabels: log.prediction.labels || [],
      actualLabels: log.actualOutcome?.labels || [],
      createdAt: log.createdAt,
      reason: this.determineOutlierReason(log),
    }));
  }

  /**
   * Get predictions needing human review
   */
  async getPendingReview(limit = 50): Promise<AIPredictionLog[]> {
    return this.predictionLogRepo
      .createQueryBuilder('log')
      .where('log.wasAccurate IS NULL')
      .orderBy('log.createdAt', 'DESC')
      .take(limit)
      .getMany();
  }

  private determineOutlierReason(log: AIPredictionLog): string {
    const predicted = log.prediction;
    const actual = log.actualOutcome;

    if (!actual) return 'No actual outcome recorded';

    // Cast to string to avoid unsafe enum comparison
    const priorityMismatch =
      String(predicted.priority) !== String(actual.priority);
    const labelMismatch = !this.arraysEqual(
      predicted.labels || [],
      actual.labels || [],
    );

    if (priorityMismatch && labelMismatch) {
      return 'Both priority and labels incorrect';
    }
    if (priorityMismatch) {
      return `Priority mismatch: predicted ${predicted.priority}, actual ${actual.priority}`;
    }
    if (labelMismatch) {
      return 'Label mismatch';
    }
    return 'Unknown reason';
  }

  private arraysEqual(a: string[], b: string[]): boolean {
    if (a.length !== b.length) return false;
    const sortedA = [...a].sort();
    const sortedB = [...b].sort();
    return sortedA.every((val, idx) => val === sortedB[idx]);
  }
}
