import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Migration: notifications DSA indexes for the CQRS refactor.
 *
 * 1. IDX_notification_feed (userId, status, createdAt, id)
 *    — covering composite for the keyset feed query
 *      (`WHERE userId=? AND status=? ORDER BY createdAt DESC, id DESC`).
 *      Turns the previous (userId, createdAt)-only path (which could not cover
 *      the status filter) into an O(log N) index-only seek, no Sort node.
 *      Declared on the entity via @Index; created here explicitly so existing
 *      deployments pick it up without a destructive `synchronize`.
 *
 * 2. IDX_notification_snooze_due (snoozedUntil) WHERE status='snoozed'
 *    — PARTIAL index backing the 5-minute snooze-sweep cron
 *      (`WHERE status='snoozed' AND snoozedUntil<=now`). A partial predicate
 *      can't be expressed via the @Index decorator, so it lives only here.
 *      Keeps the index tiny (only currently-snoozed rows).
 */
export class AddNotificationFeedIndexes1765476600000 implements MigrationInterface {
  name = 'AddNotificationFeedIndexes1765476600000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_notification_feed" ON "notifications" ("userId", "status", "createdAt", "id")`,
    );
    console.log('✅ Created index: IDX_notification_feed');

    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_notification_snooze_due" ON "notifications" ("snoozedUntil") WHERE "status" = 'snoozed'`,
    );
    console.log('✅ Created partial index: IDX_notification_snooze_due');
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DROP INDEX IF EXISTS "IDX_notification_snooze_due"`,
    );
    console.log('Dropped index: IDX_notification_snooze_due');

    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_notification_feed"`);
    console.log('Dropped index: IDX_notification_feed');
  }
}
