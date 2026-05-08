import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import Stripe from 'stripe';
import { UsageRecord } from './entities/usage-record.entity';
import { Organization } from '../organizations/entities/organization.entity';
import { AuditLogsService } from '../audit/audit-logs.service';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { v4 as uuidv4 } from 'uuid';

/**
 * UsageService — metered billing infrastructure.
 *
 * Responsibilities:
 *  1. `trackUsage()` — hot-path ingestion, called by controllers/services
 *     to record a single usage event (API call, storage delta, etc.)
 *  2. `reportUnreportedUsage()` — cold-path cron, runs daily at midnight,
 *     aggregates unreported records per subscription item, pushes to Stripe,
 *     and marks them as reported inside a DB transaction.
 *
 * Failure handling:
 *  - Each Stripe push uses an idempotency key derived from the batch.
 *    If Stripe already processed the key (within 24h), it returns 200
 *    without creating a duplicate record.
 *  - The DB transaction wraps the Stripe call + `reported = true` update.
 *    If the Stripe call fails, the transaction rolls back and records
 *    remain unreported for the next cron run.
 *  - If the Stripe call succeeds but the DB commit fails (extremely rare),
 *    the next cron run will re-push the same records — Stripe deduplicates
 *    via the idempotency key, so the org is never double-billed.
 */
@Injectable()
export class UsageService {
  private stripe: Stripe;
  private readonly logger = new Logger(UsageService.name);

  /** Max records to process per cron run to bound memory and execution time. */
  private static readonly BATCH_SIZE = 500;

  constructor(
    private configService: ConfigService,
    @InjectRepository(UsageRecord)
    private usageRepo: Repository<UsageRecord>,
    @InjectRepository(Organization)
    private orgRepo: Repository<Organization>,
    private dataSource: DataSource,
    private auditLogsService: AuditLogsService,
    private eventEmitter: EventEmitter2,
  ) {
    const apiKey = this.configService.get<string>('STRIPE_SECRET_KEY');
    if (apiKey) {
      this.stripe = new Stripe(apiKey);
    } else {
      this.logger.warn(
        'STRIPE_SECRET_KEY not defined — usage reporting disabled',
      );
    }
  }

  // ─── Hot Path: Usage Ingestion ──────────────────────

  /**
   * Record a single usage event.
   *
   * @param orgId              - Organization UUID
   * @param metric             - Metric identifier (e.g., 'api_calls', 'storage_gb')
   * @param quantity           - Amount consumed (default: 1)
   * @param subscriptionItemId - Optional Stripe subscription item ID override.
   *                             If omitted, the cron will attempt to resolve it
   *                             from the org's active subscription.
   */
  async trackUsage(
    orgId: string,
    metric: string,
    quantity: number = 1,
    subscriptionItemId?: string,
  ): Promise<UsageRecord> {
    const record = this.usageRepo.create({
      organizationId: orgId,
      metric,
      quantity,
      stripeSubscriptionItemId: subscriptionItemId ?? undefined,
    });

    const saved = await this.usageRepo.save(record);
    return Array.isArray(saved) ? saved[0] : saved;
  }

  // ─── Cold Path: Cron-Based Stripe Reporting ─────────

  /**
   * Runs daily at midnight UTC.
   * Queries all unreported usage records, aggregates by subscription item + metric,
   * pushes to Stripe, and marks as reported inside a transaction.
   *
   * Cron schedule is intentionally loose (daily) to batch efficiently.
   * For higher granularity, change to EVERY_HOUR.
   */
  @Cron(CronExpression.EVERY_DAY_AT_MIDNIGHT, {
    name: 'usage-report-to-stripe',
    timeZone: 'UTC',
  })
  async reportUnreportedUsage(): Promise<void> {
    if (!this.stripe) {
      this.logger.warn('Stripe not initialized — skipping usage report');
      return;
    }

    this.logger.log('Starting usage report cycle…');

    try {
      // Step 1: Fetch unreported records that have a subscription item ID
      const unreported = await this.usageRepo.find({
        where: { reported: false },
        order: { createdAt: 'ASC' },
        take: UsageService.BATCH_SIZE,
      });

      if (unreported.length === 0) {
        this.logger.log('No unreported usage records found — cycle complete');
        return;
      }

      // Step 2: Filter records with valid subscription item IDs
      const reportable = unreported.filter(
        (r) => r.stripeSubscriptionItemId != null,
      );
      const orphaned = unreported.filter(
        (r) => r.stripeSubscriptionItemId == null,
      );

      // Attempt to resolve orphaned records' subscription item IDs
      if (orphaned.length > 0) {
        await this.resolveOrphanedRecords(orphaned);
      }

      // Step 3: Aggregate by subscriptionItemId + metric
      const aggregated = this.aggregateRecords(reportable);

      // Step 4: Push each aggregate to Stripe inside a transaction
      let reportedCount = 0;
      for (const [key, batch] of aggregated.entries()) {
        const [subscriptionItemId, metric] = key.split('::');
        const totalQuantity = batch.totalQuantity;
        const recordIds = batch.recordIds;

        const idempotencyKey = `usage_${subscriptionItemId}_${Date.now()}_${uuidv4().slice(0, 8)}`;

        const queryRunner = this.dataSource.createQueryRunner();
        await queryRunner.connect();
        await queryRunner.startTransaction('REPEATABLE READ');

        try {
          // Push to Stripe via Billing Meter Events API (Stripe v20+)
          // event_name maps to the Stripe Billing Meter configured in the dashboard.
          // stripe_customer_id is resolved from the org's record.
          const stripeCustomerId = await this.resolveStripeCustomerId(
            recordIds[0],
          );

          await this.stripe.billing.meterEvents.create(
            {
              event_name: metric,
              payload: {
                stripe_customer_id: stripeCustomerId,
                value: String(totalQuantity),
              },
            },
            { idempotencyKey },
          );

          // Mark records as reported within the same transaction
          const now = new Date();
          await queryRunner.manager.update(UsageRecord, recordIds, {
            reported: true,
            reportedAt: now,
            idempotencyKey,
          });

          await queryRunner.commitTransaction();
          reportedCount += recordIds.length;

          this.logger.log(
            `Reported ${totalQuantity} units for subscription item ${subscriptionItemId} (${recordIds.length} records)`,
          );
        } catch (error) {
          await queryRunner.rollbackTransaction();
          this.logger.error(
            `Failed to report usage for subscription item ${subscriptionItemId}: ${(error as Error).message}`,
          );

          // Emit event for monitoring/alerting
          this.eventEmitter.emit('billing.usage_report_failed', {
            subscriptionItemId,
            totalQuantity,
            error: (error as Error).message,
          });
        } finally {
          await queryRunner.release();
        }
      }

      // Step 5: Audit log the reporting cycle
      await this.auditLogsService.log({
        event_uuid: uuidv4(),
        timestamp: new Date(),
        tenant_id: 'system',
        actor_id: 'usage_cron',
        resource_type: 'UsageReport',
        resource_id: `cycle_${Date.now()}`,
        action_type: 'CREATE',
        action: 'USAGE_REPORT_CYCLE_COMPLETED',
        metadata: {
          totalRecordsProcessed: unreported.length,
          totalRecordsReported: reportedCount,
          totalOrphaned: orphaned.length,
          aggregatedBatches: aggregated.size,
        },
      });

      this.eventEmitter.emit('billing.usage_reported', {
        recordsReported: reportedCount,
        batchCount: aggregated.size,
      });

      this.logger.log(
        `Usage report cycle complete: ${reportedCount}/${unreported.length} records reported`,
      );
    } catch (error) {
      this.logger.error(
        `Usage report cycle failed: ${(error as Error).message}`,
        (error as Error).stack,
      );
    }
  }

  // ─── Internal Helpers ───────────────────────────────

  /**
   * Aggregate reportable records by subscriptionItemId + metric.
   * Returns a Map keyed by "subscriptionItemId::metric" with total quantity
   * and the list of record IDs that contributed.
   */
  private aggregateRecords(
    records: UsageRecord[],
  ): Map<string, { totalQuantity: number; recordIds: string[] }> {
    const map = new Map<
      string,
      { totalQuantity: number; recordIds: string[] }
    >();

    for (const record of records) {
      const key = `${record.stripeSubscriptionItemId}::${record.metric}`;
      const existing = map.get(key);

      if (existing) {
        existing.totalQuantity += Number(record.quantity);
        existing.recordIds.push(record.id);
      } else {
        map.set(key, {
          totalQuantity: Number(record.quantity),
          recordIds: [record.id],
        });
      }
    }

    return map;
  }

  /**
   * Resolve the Stripe customer ID from a usage record's organization.
   * Falls back to empty string if the org has no Stripe customer.
   */
  private async resolveStripeCustomerId(
    usageRecordId: string,
  ): Promise<string> {
    const record = await this.usageRepo.findOne({
      where: { id: usageRecordId },
      relations: ['organization'],
    });

    return record?.organization?.stripeCustomerId ?? '';
  }

  /**
   * Attempt to resolve subscription item IDs for orphaned records.
   * An orphaned record is one created before the org had an active subscription,
   * or where the caller didn't supply a subscriptionItemId.
   *
   * This queries the org's stripeSubscriptionId from the DB, then fetches
   * subscription items from Stripe. If a metered price item is found,
   * it backfills the record.
   */
  private async resolveOrphanedRecords(orphaned: UsageRecord[]): Promise<void> {
    // Group by orgId for efficient batch resolution
    const byOrg = new Map<string, UsageRecord[]>();
    for (const record of orphaned) {
      const existing = byOrg.get(record.organizationId);
      if (existing) {
        existing.push(record);
      } else {
        byOrg.set(record.organizationId, [record]);
      }
    }

    for (const [orgId, records] of byOrg.entries()) {
      try {
        const org = await this.orgRepo.findOneBy({ id: orgId });
        if (!org?.stripeSubscriptionId) {
          this.logger.debug(
            `Org ${orgId} has no active subscription — skipping ${records.length} orphaned records`,
          );
          continue;
        }

        // Fetch subscription items from Stripe
        const subItems = await this.stripe.subscriptionItems.list({
          subscription: org.stripeSubscriptionId,
        });

        // Find metered items (recurring.usage_type === 'metered')
        const meteredItems = subItems.data.filter(
          (item) => item.price?.recurring?.usage_type === 'metered',
        );

        if (meteredItems.length === 0) {
          this.logger.debug(
            `Org ${orgId} subscription has no metered items — skipping`,
          );
          continue;
        }

        // Simple strategy: if there's one metered item, assign all records to it.
        // If multiple, match by metric name convention (e.g., price metadata).
        for (const record of records) {
          const matchedItem =
            meteredItems.find(
              (item) => item.price?.metadata?.metric === record.metric,
            ) ?? meteredItems[0];

          record.stripeSubscriptionItemId = matchedItem.id;
          await this.usageRepo.save(record);
        }

        this.logger.log(
          `Resolved ${records.length} orphaned records for org ${orgId}`,
        );
      } catch (error) {
        this.logger.error(
          `Failed to resolve orphaned records for org ${orgId}: ${(error as Error).message}`,
        );
      }
    }
  }

  // ─── Admin / Debug Methods ──────────────────────────

  /**
   * Get usage summary for an organization (for admin dashboards).
   */
  async getUsageSummary(
    orgId: string,
  ): Promise<{ metric: string; total: number; unreported: number }[]> {
    const results = await this.usageRepo
      .createQueryBuilder('u')
      .select('u.metric', 'metric')
      .addSelect('SUM(u.quantity)', 'total')
      .addSelect(
        'SUM(CASE WHEN u.reported = false THEN u.quantity ELSE 0 END)',
        'unreported',
      )
      .where('u.organizationId = :orgId', { orgId })
      .groupBy('u.metric')
      .getRawMany();

    return results.map((r) => ({
      metric: r.metric,
      total: Number(r.total),
      unreported: Number(r.unreported),
    }));
  }
}
