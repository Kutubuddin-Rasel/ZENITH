import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Migration: Change Reporter FK from CASCADE to SET NULL
 *
 * Problem: Deleting a User currently deletes all issues they reported.
 * Solution: Change to SET NULL to preserve issues with reporterId = NULL.
 *
 * This is a DDL-only operation (no data modification), very fast.
 */
export class ChangeReporterCascade1765476000000 implements MigrationInterface {
  name = 'ChangeReporterCascade1765476000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Step 1: Make column nullable (if not already)
    // This is idempotent - safe to run even if already nullable
    await queryRunner.query(`
      ALTER TABLE issues 
      ALTER COLUMN "reporterId" DROP NOT NULL;
    `);

    // Step 2: Find and drop existing FK constraint
    // TypeORM may have generated different constraint names
    const constraints = (await queryRunner.query(`
      SELECT conname 
      FROM pg_constraint 
      WHERE conrelid = 'issues'::regclass 
        AND contype = 'f' 
        AND (conname LIKE '%reporterId%' OR conname LIKE '%reporter%');
    `)) as Array<{ conname: string }>;

    for (const constraint of constraints) {
      console.log(`Dropping FK constraint: ${constraint.conname}`);
      await queryRunner.query(`
        ALTER TABLE issues DROP CONSTRAINT IF EXISTS "${constraint.conname}";
      `);
    }

    // Step 3: Re-add with SET NULL behavior
    await queryRunner.query(`
      ALTER TABLE issues 
      ADD CONSTRAINT "FK_issues_reporterId" 
      FOREIGN KEY ("reporterId") 
      REFERENCES users(id) 
      ON DELETE SET NULL;
    `);

    console.log('✅ Changed issues.reporterId FK to ON DELETE SET NULL');
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Rollback: Restore CASCADE (DANGER: for emergency only)
    // WARNING: This will cause data loss if users are deleted!

    await queryRunner.query(`
      ALTER TABLE issues DROP CONSTRAINT IF EXISTS "FK_issues_reporterId";
    `);

    await queryRunner.query(`
      ALTER TABLE issues 
      ADD CONSTRAINT "FK_issues_reporterId" 
      FOREIGN KEY ("reporterId") 
      REFERENCES users(id) 
      ON DELETE CASCADE;
    `);

    // Note: We don't restore NOT NULL as there may now be NULL values
    console.warn('⚠️ Restored issues.reporterId FK to ON DELETE CASCADE');
  }
}
