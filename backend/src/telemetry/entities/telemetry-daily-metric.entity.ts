/**
 * TelemetryDailyMetric Entity — Time-Series Storage for Telemetry Analytics
 *
 * PURPOSE:
 * Stores daily aggregated telemetry snapshots (heartbeat counts, unique users,
 * session durations, auto-transitions) for historical trend visualization.
 * Populated by the TelemetryFlushProcessor every 5 minutes.
 *
 * DESIGN DECISIONS:
 * - Does NOT extend AbstractBaseEntity (no @VersionColumn).
 *   Time-series snapshots are upserted, never manually edited. Lighter entity.
 * - organizationId is NOT nullable — enforced tenant isolation at DB level.
 * - Compound index starts with organizationId for tenant-first query plans.
 * - Unique constraint on (org, project, metricType, metricDate) ensures
 *   idempotent flushes — duplicate cron runs resolve via ON CONFLICT UPDATE.
 *
 * INDEXING STRATEGY:
 * Compound B-tree: (organizationId, projectId, metricType, metricDate)
 * At 10M rows: organizationId eliminates ~99% → projectId → metricType → date scan.
 *
 * ZERO `any` TOLERANCE.
 */

import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  Index,
  Unique,
  CreateDateColumn,
  UpdateDateColumn,
} from 'typeorm';

// =============================================================================
// METRIC TYPE ENUM
// =============================================================================

/**
 * Strictly defined telemetry metric types.
 * Adding a new metric requires a code change — no arbitrary strings.
 */
export enum TelemetryMetricType {
  /** Total heartbeats received for this project on this day */
  HEARTBEAT_COUNT = 'HEARTBEAT_COUNT',

  /** Unique active users (from HyperLogLog) */
  UNIQUE_USERS = 'UNIQUE_USERS',

  /** Average session duration in seconds */
  AVG_SESSION_DURATION = 'AVG_SESSION_DURATION',

  /** Number of auto-transitions triggered */
  AUTO_TRANSITIONS = 'AUTO_TRANSITIONS',
}

// =============================================================================
// ENTITY
// =============================================================================

@Entity({ name: 'telemetry_daily_metrics' })
@Index('idx_telemetry_daily_query', [
  'organizationId',
  'projectId',
  'metricType',
  'metricDate',
])
@Unique('uq_telemetry_daily', [
  'organizationId',
  'projectId',
  'metricType',
  'metricDate',
])
export class TelemetryDailyMetric {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  /**
   * Tenant isolation — NOT nullable.
   * First column in compound index for optimal query plan narrowing.
   */
  @Column({ type: 'uuid' })
  organizationId: string;

  /** The project this metric was aggregated for */
  @Column({ type: 'uuid' })
  projectId: string;

  /** What kind of telemetry metric this row represents */
  @Column({
    type: 'enum',
    enum: TelemetryMetricType,
  })
  metricType: TelemetryMetricType;

  /**
   * The aggregated metric value.
   * - HEARTBEAT_COUNT: total heartbeats
   * - UNIQUE_USERS: approximate unique count (HyperLogLog)
   * - AVG_SESSION_DURATION: average seconds
   * - AUTO_TRANSITIONS: total transitions
   */
  @Column({
    type: 'decimal',
    precision: 12,
    scale: 2,
    default: 0,
  })
  value: number;

  /**
   * Date boundary (day granularity).
   * Used in UNIQUE constraint for idempotent upserts.
   * Stored as 'date' type for clean equality checks.
   */
  @Column({ type: 'date' })
  metricDate: string;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
