import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, SelectQueryBuilder, ObjectLiteral } from 'typeorm';
import { SatisfactionMetric } from './entities/satisfaction-metric.entity';
import { SatisfactionSurvey } from './entities/satisfaction-survey.entity';
import { TimeRangeDto } from './dto/time-range.dto';

// ── Response Interfaces ─────────────────────────────────────────────

/**
 * NPS result containing the score and breakdown counts.
 */
export interface NpsResult {
  /** Net Promoter Score: range [-100, +100] */
  nps: number;
  /** Count of respondents scoring 9-10 */
  promoters: number;
  /** Count of respondents scoring 7-8 */
  passives: number;
  /** Count of respondents scoring 0-6 */
  detractors: number;
  /** Total survey responses included */
  totalResponses: number;
}

/**
 * Satisfaction breakdown by survey type.
 */
export interface SatisfactionByType {
  type: string;
  averageScore: number;
  responseCount: number;
}

/**
 * Admin overview payload for org-wide reporting.
 */
export interface AdminOverviewResult {
  orgId: string;
  nps: NpsResult;
  satisfactionByType: SatisfactionByType[];
  overallAverageScore: number;
  totalResponses: number;
  timeRange: {
    startDate: string | null;
    endDate: string | null;
  };
}

@Injectable()
export class SatisfactionService {
  private readonly logger = new Logger(SatisfactionService.name);

  constructor(
    @InjectRepository(SatisfactionMetric)
    private metricRepo: Repository<SatisfactionMetric>,
    @InjectRepository(SatisfactionSurvey)
    private surveyRepo: Repository<SatisfactionSurvey>,
  ) { }

  async trackMetric(
    userId: string,
    metric: string,
    value: number,
    context?: Record<string, unknown>,
  ): Promise<SatisfactionMetric> {
    const metricEntity = this.metricRepo.create({
      userId,
      metric,
      value,
      context,
    });

    return this.metricRepo.save(metricEntity);
  }

  async submitSurvey(
    userId: string,
    type: 'onboarding' | 'feature' | 'general',
    questions: Array<{
      id: string;
      question: string;
      answer: number;
      context?: string;
    }>,
    overallScore: number,
    feedback?: string,
  ): Promise<SatisfactionSurvey> {
    const survey = this.surveyRepo.create({
      userId,
      type,
      questions,
      overallScore,
      feedback,
    });

    return this.surveyRepo.save(survey);
  }

  async getMetrics(
    userId: string,
    metric?: string,
    timeRange?: TimeRangeDto,
  ): Promise<SatisfactionMetric[]> {
    const query = this.metricRepo
      .createQueryBuilder('metric')
      .where('metric.userId = :userId', { userId });

    if (metric) {
      query.andWhere('metric.metric = :metric', { metric });
    }

    this.applyTimeFilter(query, 'metric.timestamp', timeRange);

    return query.orderBy('metric.timestamp', 'DESC').getMany();
  }

  async getSurveys(
    userId: string,
    type?: string,
    timeRange?: TimeRangeDto,
  ): Promise<SatisfactionSurvey[]> {
    const query = this.surveyRepo
      .createQueryBuilder('survey')
      .where('survey.userId = :userId', { userId });

    if (type) {
      query.andWhere('survey.type = :type', { type });
    }

    this.applyTimeFilter(query, 'survey.timestamp', timeRange);

    return query.orderBy('survey.timestamp', 'DESC').getMany();
  }

  async getAverageScore(
    userId: string,
    metric: string,
    timeRange?: TimeRangeDto,
  ): Promise<number> {
    const query = this.metricRepo
      .createQueryBuilder('metric')
      .select('AVG(metric.value)', 'average')
      .where('metric.userId = :userId', { userId })
      .andWhere('metric.metric = :metric', { metric });

    this.applyTimeFilter(query, 'metric.timestamp', timeRange);

    const result = await query.getRawOne<{ average: string }>();

    if (!result) return 0;

    return parseFloat(result.average) || 0;
  }

  async getOverallSatisfaction(
    userId: string,
    timeRange?: TimeRangeDto,
  ): Promise<number> {
    const query = this.surveyRepo
      .createQueryBuilder('survey')
      .select('AVG(survey.overallScore)', 'average')
      .where('survey.userId = :userId', { userId });

    this.applyTimeFilter(query, 'survey.timestamp', timeRange);

    const result = await query.getRawOne<{ average: string }>();

    if (!result) return 0;

    return parseFloat(result.average) || 0;
  }

  // ── NPS Engine ────────────────────────────────────────────────────

  /**
   * Calculate Net Promoter Score for an organization.
   *
   * The NPS formula:
   *   NPS = ((Promoters - Detractors) / Total) × 100
   *
   * Score bands (industry standard):
   *   - Promoters:  overallScore >= 9
   *   - Passives:   overallScore >= 7 AND < 9
   *   - Detractors: overallScore < 7
   *
   * Implementation: Single SQL aggregate query with CASE WHEN expressions.
   * The categorization and counting happen in PostgreSQL (no in-memory
   * iteration), making this O(1) in memory regardless of survey volume.
   *
   * The survey table does not have an organizationId column, so we join
   * through the users table: satisfaction_surveys → users.organizationId.
   *
   * @param orgId - Organization UUID to calculate NPS for
   * @param timeRange - Optional date range filter
   * @returns NPS score (-100 to +100) with breakdown counts
   */
  async calculateNps(
    orgId: string,
    timeRange?: TimeRangeDto,
  ): Promise<NpsResult> {
    const query = this.surveyRepo
      .createQueryBuilder('survey')
      .innerJoin('users', 'u', 'survey."userId" = u.id')
      .select(
        `COUNT(CASE WHEN survey."overallScore" >= 9 THEN 1 END)`,
        'promoterCount',
      )
      .addSelect(
        `COUNT(CASE WHEN survey."overallScore" >= 7 AND survey."overallScore" < 9 THEN 1 END)`,
        'passiveCount',
      )
      .addSelect(
        `COUNT(CASE WHEN survey."overallScore" < 7 THEN 1 END)`,
        'detractorCount',
      )
      .addSelect('COUNT(*)', 'totalCount')
      .where('u."organizationId" = :orgId', { orgId });

    this.applyTimeFilter(query, 'survey.timestamp', timeRange);

    const result = await query.getRawOne<{
      promoterCount: string;
      passiveCount: string;
      detractorCount: string;
      totalCount: string;
    }>();

    const promoters = parseInt(result?.promoterCount ?? '0', 10);
    const passives = parseInt(result?.passiveCount ?? '0', 10);
    const detractors = parseInt(result?.detractorCount ?? '0', 10);
    const totalResponses = parseInt(result?.totalCount ?? '0', 10);

    // Guard: avoid division by zero
    if (totalResponses === 0) {
      this.logger.debug(`NPS calculation: no surveys found for org ${orgId}`);
      return {
        nps: 0,
        promoters: 0,
        passives: 0,
        detractors: 0,
        totalResponses: 0,
      };
    }

    // Industry-standard NPS formula
    const nps =
      Math.round(
        ((promoters - detractors) / totalResponses) * 100 * 10,
      ) / 10;

    this.logger.debug(
      `NPS for org ${orgId}: ${nps} (P=${promoters} Pa=${passives} D=${detractors} T=${totalResponses})`,
    );

    return {
      nps,
      promoters,
      passives,
      detractors,
      totalResponses,
    };
  }

  // ── Admin Overview ────────────────────────────────────────────────

  /**
   * Generate an org-wide satisfaction overview for admin reporting.
   *
   * Returns:
   *   - NPS score with breakdown
   *   - Satisfaction by survey type (average score + count)
   *   - Overall average score
   *   - Total response count
   *
   * All queries are scoped to the organization via users.organizationId join.
   * Time-range filtering is applied when provided; omitting dates returns all-time.
   */
  async getAdminOverview(
    orgId: string,
    timeRange?: TimeRangeDto,
  ): Promise<AdminOverviewResult> {
    // Run NPS + by-type + overall in parallel (independent queries)
    const [nps, satisfactionByType, overallAvg] = await Promise.all([
      this.calculateNps(orgId, timeRange),
      this.getSatisfactionByType(orgId, timeRange),
      this.getOrgOverallAverage(orgId, timeRange),
    ]);

    return {
      orgId,
      nps,
      satisfactionByType,
      overallAverageScore: overallAvg,
      totalResponses: nps.totalResponses,
      timeRange: {
        startDate: timeRange?.startDate ?? null,
        endDate: timeRange?.endDate ?? null,
      },
    };
  }

  // ── Private Helpers ───────────────────────────────────────────────

  /**
   * Get satisfaction breakdown by survey type for an organization.
   */
  private async getSatisfactionByType(
    orgId: string,
    timeRange?: TimeRangeDto,
  ): Promise<SatisfactionByType[]> {
    const query = this.surveyRepo
      .createQueryBuilder('survey')
      .innerJoin('users', 'u', 'survey."userId" = u.id')
      .select('survey.type', 'type')
      .addSelect('AVG(survey."overallScore")', 'averageScore')
      .addSelect('COUNT(*)', 'responseCount')
      .where('u."organizationId" = :orgId', { orgId })
      .groupBy('survey.type');

    this.applyTimeFilter(query, 'survey.timestamp', timeRange);

    const rows = await query.getRawMany<{
      type: string;
      averageScore: string;
      responseCount: string;
    }>();

    return rows.map((row) => ({
      type: row.type,
      averageScore:
        Math.round(parseFloat(row.averageScore || '0') * 100) / 100,
      responseCount: parseInt(row.responseCount, 10),
    }));
  }

  /**
   * Get the overall average satisfaction score for an organization.
   */
  private async getOrgOverallAverage(
    orgId: string,
    timeRange?: TimeRangeDto,
  ): Promise<number> {
    const query = this.surveyRepo
      .createQueryBuilder('survey')
      .innerJoin('users', 'u', 'survey."userId" = u.id')
      .select('AVG(survey."overallScore")', 'average')
      .where('u."organizationId" = :orgId', { orgId });

    this.applyTimeFilter(query, 'survey.timestamp', timeRange);

    const result = await query.getRawOne<{ average: string }>();

    return Math.round(parseFloat(result?.average || '0') * 100) / 100;
  }

  /**
   * Apply optional time-range filtering to a query builder.
   *
   * Uses >= startDate and <= endDate with parameterized queries.
   * If neither date is provided, the query is unmodified (all-time fallback).
   *
   * @param qb - The active query builder
   * @param timestampColumn - Fully qualified column name (e.g., 'survey.timestamp')
   * @param timeRange - Optional time range with startDate/endDate
   */
  private applyTimeFilter<T extends ObjectLiteral>(
    qb: SelectQueryBuilder<T>,
    timestampColumn: string,
    timeRange?: TimeRangeDto,
  ): void {
    if (!timeRange) return;

    if (timeRange.startDate) {
      qb.andWhere(`${timestampColumn} >= :startDate`, {
        startDate: timeRange.startDate,
      });
    }

    if (timeRange.endDate) {
      qb.andWhere(`${timestampColumn} <= :endDate`, {
        endDate: timeRange.endDate,
      });
    }
  }
}
