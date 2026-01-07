import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Migration: Add Soft Delete Support to Projects
 *
 * Adds deletedAt and deletedBy columns to enable soft delete pattern.
 * This prevents cascade avalanche when deleting projects.
 */
export class AddProjectSoftDelete1765476200000 implements MigrationInterface {
  name = 'AddProjectSoftDelete1765476200000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Add soft delete columns
    await queryRunner.query(`
      ALTER TABLE projects 
      ADD COLUMN IF NOT EXISTS "deletedAt" TIMESTAMP NULL DEFAULT NULL
    `);
    console.log('✅ Added projects.deletedAt column');

    await queryRunner.query(`
      ALTER TABLE projects 
      ADD COLUMN IF NOT EXISTS "deletedBy" UUID NULL DEFAULT NULL
    `);
    console.log('✅ Added projects.deletedBy column');

    // Add indexes for soft delete queries
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_project_deleted_at" 
      ON projects("deletedAt")
    `);
    console.log('✅ Created IDX_project_deleted_at index');

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_project_org_deleted" 
      ON projects("organizationId", "deletedAt")
    `);
    console.log('✅ Created IDX_project_org_deleted index');
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('DROP INDEX IF EXISTS "IDX_project_org_deleted"');
    await queryRunner.query('DROP INDEX IF EXISTS "IDX_project_deleted_at"');
    await queryRunner.query(
      'ALTER TABLE projects DROP COLUMN IF EXISTS "deletedBy"',
    );
    await queryRunner.query(
      'ALTER TABLE projects DROP COLUMN IF EXISTS "deletedAt"',
    );
    console.log('Reverted soft delete columns');
  }
}
