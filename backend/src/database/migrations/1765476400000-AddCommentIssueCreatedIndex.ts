import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Migration: Add (issueId, createdAt, id) composite index on comments.
 *
 * Backs both the offset list (eliminates the ORDER BY createdAt sort that the
 * issueId-only index could not cover) and the new keyset/seek pagination path
 * `(createdAt, id) > (:cAt, :cId)` (O(log N) Index Scan, no Sort node).
 */
export class AddCommentIssueCreatedIndex1765476400000 implements MigrationInterface {
  name = 'AddCommentIssueCreatedIndex1765476400000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_comment_issue_created_id" ON "comments" ("issueId", "createdAt", "id")`,
    );
    console.log('✅ Created index: IDX_comment_issue_created_id');
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DROP INDEX IF EXISTS "IDX_comment_issue_created_id"`,
    );
    console.log('Dropped index: IDX_comment_issue_created_id');
  }
}
