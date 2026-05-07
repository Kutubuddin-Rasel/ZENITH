// src/revisions/jobs/revision-pruning.job.ts
import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Revision } from '../entities/revision.entity';

/**
 * RevisionPruningJob
 *
 * Hard-deletes revisions older than RETENTION_DAYS in small batches to avoid
 * long-running locks on the `revisions` table. Runs once a week.
 *
 * Strategy:
 *   DELETE FROM revisions WHERE id IN (
 *     SELECT id FROM revisions WHERE "createdAt" < $cutoff LIMIT $BATCH_SIZE
 *   )
 *
 * Each iteration deletes at most BATCH_SIZE rows, yields the event loop, and
 * loops until a batch reports zero affected rows.
 */
@Injectable()
export class RevisionPruningJob {
  private readonly logger = new Logger(RevisionPruningJob.name);

  private static readonly RETENTION_DAYS = 365;
  private static readonly BATCH_SIZE = 1000;
  private static readonly INTER_BATCH_DELAY_MS = 50;
  private static readonly MAX_ITERATIONS = 100_000; // safety fuse

  constructor(
    @InjectRepository(Revision)
    private readonly revRepo: Repository<Revision>,
  ) {}

  @Cron(CronExpression.EVERY_WEEK, { name: 'revision-pruning' })
  async pruneOldRevisions(): Promise<void> {
    const startedAt: number = Date.now();
    const cutoff: Date = new Date(
      Date.now() - RevisionPruningJob.RETENTION_DAYS * 24 * 60 * 60 * 1000,
    );

    this.logger.log(
      `Starting revision pruning: cutoff=${cutoff.toISOString()} batchSize=${RevisionPruningJob.BATCH_SIZE}`,
    );

    let totalDeleted: number = 0;
    let iterations: number = 0;

    while (iterations < RevisionPruningJob.MAX_ITERATIONS) {
      const subQuery = this.revRepo
        .createQueryBuilder('r')
        .select('r.id')
        .where('r."createdAt" < :cutoff', { cutoff })
        .limit(RevisionPruningJob.BATCH_SIZE);

      const result = await this.revRepo
        .createQueryBuilder()
        .delete()
        .from(Revision)
        .where(`id IN (${subQuery.getQuery()})`)
        .setParameters(subQuery.getParameters())
        .execute();

      const affected: number =
        typeof result.affected === 'number' ? result.affected : 0;

      if (affected === 0) {
        break;
      }

      totalDeleted += affected;
      iterations += 1;

      await this.sleep(RevisionPruningJob.INTER_BATCH_DELAY_MS);
    }

    const durationMs: number = Date.now() - startedAt;
    this.logger.log(
      `Revision pruning complete: deleted=${totalDeleted} iterations=${iterations} durationMs=${durationMs}`,
    );

    if (iterations >= RevisionPruningJob.MAX_ITERATIONS) {
      this.logger.warn(
        `Revision pruning hit MAX_ITERATIONS (${RevisionPruningJob.MAX_ITERATIONS}); next cron run will continue.`,
      );
    }
  }

  private sleep(ms: number): Promise<void> {
    return new Promise<void>((resolve) => setTimeout(resolve, ms));
  }
}
