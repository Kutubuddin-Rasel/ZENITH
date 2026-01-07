import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Migration: Remove CASCADE and Add RESTRICT on Project FKs
 *
 * This migration changes all foreign key constraints that point to projects
 * from ON DELETE CASCADE to ON DELETE RESTRICT.
 *
 * This prevents accidental mass deletion of child records when a project
 * is hard-deleted. With soft delete in place, projects should be soft-deleted
 * first, then a background job can clean up children safely.
 *
 * IMPORTANT: Run this AFTER AddProjectSoftDelete migration.
 */
export class RemoveProjectCascades1765476300000 implements MigrationInterface {
  name = 'RemoveProjectCascades1765476300000';

  /**
   * Tables that have projectId FK pointing to projects table
   * Based on DB_HEALTH_REPORT.md analysis
   */
  private readonly tablesToUpdate = [
    'issues',
    'boards',
    'sprints',
    'project_members',
    'webhooks',
    'labels',
    'components',
    'attachments',
    'custom_field_definitions',
    'resource_allocations',
    'resource_forecasts',
    'documents',
    'work_logs',
    'onboarding_progress',
  ];

  public async up(queryRunner: QueryRunner): Promise<void> {
    for (const table of this.tablesToUpdate) {
      try {
        // Find existing FK constraint name dynamically
        const constraints = (await queryRunner.query(`
          SELECT con.conname
          FROM pg_constraint con
          JOIN pg_class rel ON rel.oid = con.conrelid
          JOIN pg_namespace nsp ON nsp.oid = rel.relnamespace
          WHERE rel.relname = '${table}'
            AND con.contype = 'f'
            AND con.confrelid = 'projects'::regclass
        `)) as Array<{ conname: string }>;

        if (constraints.length === 0) {
          console.log(
            `⏭️ No FK constraint found for ${table} → projects, skipping`,
          );
          continue;
        }

        for (const constraint of constraints) {
          // Drop existing CASCADE constraint
          await queryRunner.query(`
            ALTER TABLE "${table}" DROP CONSTRAINT IF EXISTS "${constraint.conname}"
          `);

          // Re-add with RESTRICT
          await queryRunner.query(`
            ALTER TABLE "${table}" 
            ADD CONSTRAINT "${constraint.conname}" 
            FOREIGN KEY ("projectId") 
            REFERENCES projects(id) 
            ON DELETE RESTRICT
          `);

          console.log(`✅ Changed ${table}.projectId to ON DELETE RESTRICT`);
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        console.warn(`⚠️ Could not update ${table}: ${message}`);
      }
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // DANGER: Rollback restores CASCADE behavior
    console.warn('⚠️ DANGER: Restoring CASCADE behavior on project FKs');

    for (const table of this.tablesToUpdate) {
      try {
        const constraints = (await queryRunner.query(`
          SELECT con.conname
          FROM pg_constraint con
          JOIN pg_class rel ON rel.oid = con.conrelid
          WHERE rel.relname = '${table}'
            AND con.contype = 'f'
            AND con.confrelid = 'projects'::regclass
        `)) as Array<{ conname: string }>;

        for (const constraint of constraints) {
          await queryRunner.query(`
            ALTER TABLE "${table}" DROP CONSTRAINT IF EXISTS "${constraint.conname}"
          `);

          await queryRunner.query(`
            ALTER TABLE "${table}" 
            ADD CONSTRAINT "${constraint.conname}" 
            FOREIGN KEY ("projectId") 
            REFERENCES projects(id) 
            ON DELETE CASCADE
          `);

          console.warn(`⚠️ Restored ${table}.projectId to ON DELETE CASCADE`);
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        console.warn(`⚠️ Could not restore ${table}: ${message}`);
      }
    }
  }
}
