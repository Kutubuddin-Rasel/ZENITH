import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Migration: Add FK indexes on attachments(sprintId), (releaseId), (commentId).
 *
 * The entity already indexed issueId / projectId / uploaderId / createdAt, but
 * the sprint, release, and comment list paths (`findByTarget(column, value)`)
 * fell through to a sequential scan. These three single-column indexes make
 * every per-target `findAll` index-backed (O(log N) Index Scan).
 */
export class AddAttachmentTargetIndexes1765476500000 implements MigrationInterface {
  name = 'AddAttachmentTargetIndexes1765476500000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_attachment_sprint_id" ON "attachments" ("sprintId")`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_attachment_release_id" ON "attachments" ("releaseId")`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_attachment_comment_id" ON "attachments" ("commentId")`,
    );
    console.log(
      '✅ Created indexes: IDX_attachment_sprint_id, IDX_attachment_release_id, IDX_attachment_comment_id',
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_attachment_comment_id"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_attachment_release_id"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_attachment_sprint_id"`);
    console.log(
      'Dropped indexes: IDX_attachment_sprint_id, IDX_attachment_release_id, IDX_attachment_comment_id',
    );
  }
}
