import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Migration: Add Missing Performance Indexes
 *
 * Adds indexes identified in DB_HEALTH_REPORT.md for:
 * - Organization slug lookups
 * - User tenant filtering
 *
 * NOTE: Many indexes already exist in entity decorators:
 * - IDX_notification_user_read (notification.entity.ts:29)
 * - IDX_sprint_project_id (sprint.entity.ts:24)
 * - IDX_comment_issue_id (comment.entity.ts:16)
 * - entityId index (revision.entity.ts:30)
 *
 * We only add truly missing indexes here.
 */
export class AddMissingIndexes1765476100000 implements MigrationInterface {
  name = 'AddMissingIndexes1765476100000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // ============================================
    // Organization Indexes (Truly Missing)
    // ============================================

    // Organization slug - critical for URL lookups
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_org_slug 
      ON organizations(slug)
    `);
    console.log('✅ Created index: idx_org_slug');

    // Stripe customer ID (partial - only non-null values)
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_org_stripe 
      ON organizations("stripeCustomerId") 
      WHERE "stripeCustomerId" IS NOT NULL
    `);
    console.log('✅ Created index: idx_org_stripe');

    // ============================================
    // User Indexes (Truly Missing)
    // ============================================

    // User tenant filtering - uses quoted camelCase
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_user_org_id 
      ON users("organizationId")
    `);
    console.log('✅ Created index: idx_user_org_id');

    console.log('✅ All missing indexes created successfully');
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('DROP INDEX IF EXISTS idx_org_slug');
    await queryRunner.query('DROP INDEX IF EXISTS idx_org_stripe');
    await queryRunner.query('DROP INDEX IF EXISTS idx_user_org_id');
    console.log('Dropped all custom indexes');
  }
}
