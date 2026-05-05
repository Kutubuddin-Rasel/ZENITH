import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  Index,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import { Organization } from '../../organizations/entities/organization.entity';

/**
 * UsageRecord — local ledger for metered billing.
 *
 * Each row captures a single usage increment (e.g., 1 API call, 50 MB storage).
 * The cron reporter aggregates unreported rows per subscription item, pushes them
 * to Stripe via `subscriptionItems.createUsageRecord()`, then flips `reported`
 * inside the same DB transaction to guarantee exactly-once semantics.
 *
 * Design decisions:
 *  - `metric` is a free-form string enum kept at the app layer, not DB,
 *    so new metric types never require a migration.
 *  - `stripeSubscriptionItemId` is stored per-record (not derived at report time)
 *    because a single org may have multiple metered line items on one subscription.
 *  - `idempotencyKey` prevents duplicate Stripe pushes if the cron re-runs
 *    after a partial failure (Stripe deduplicates on this key within 24h).
 *  - Composite index on [organizationId, reported, metric] covers the cron's
 *    hot query path: "give me unreported records grouped by org+metric."
 */
@Entity('usage_records')
@Index('IDX_usage_org_reported_metric', [
  'organizationId',
  'reported',
  'metric',
])
@Index('IDX_usage_reported', ['reported'])
export class UsageRecord {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column('uuid')
  organizationId: string;

  @ManyToOne(() => Organization, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'organizationId' })
  organization: Organization;

  /**
   * The Stripe subscription item ID that this usage should be reported against.
   * Retrieved from the org's active subscription at record-creation time.
   * Nullable for orgs that haven't subscribed to a metered plan yet —
   * the cron skips records without this field.
   */
  @Column({ nullable: true })
  stripeSubscriptionItemId: string;

  /**
   * Metric identifier. App-layer enum, not DB-level, for zero-migration extensibility.
   * Examples: 'api_calls', 'storage_gb', 'active_users', 'ai_tokens'
   */
  @Column()
  metric: string;

  /**
   * Quantity of the metric consumed. Always positive.
   * For storage: delta in MB. For API calls: count of requests.
   */
  @Column('bigint', { default: 1 })
  quantity: number;

  /** Whether this record has been successfully pushed to Stripe. */
  @Column({ default: false })
  reported: boolean;

  /**
   * Stripe idempotency key — set by the cron at report time.
   * Prevents double-billing if the process crashes after the Stripe API call
   * but before the DB commit. Stripe deduplicates within a 24h window.
   */
  @Column({ nullable: true })
  idempotencyKey: string;

  /** When the record was successfully reported to Stripe. */
  @Column({ type: 'timestamp', nullable: true })
  reportedAt: Date;

  @CreateDateColumn()
  createdAt: Date;
}
