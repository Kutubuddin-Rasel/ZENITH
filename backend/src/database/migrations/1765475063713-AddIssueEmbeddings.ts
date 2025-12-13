import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddIssueEmbeddings1765475063713 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    // Enable vector extension
    await queryRunner.query(`CREATE EXTENSION IF NOT EXISTS vector`);

    // Add embedding column (1536 dimensions for OpenAI text-embedding-ada-002)
    await queryRunner.query(
      `ALTER TABLE "issues" ADD COLUMN IF NOT EXISTS "embedding" vector(1536)`,
    );

    // Add HNSW index for faster similarity search
    // Using vector_cosine_ops for cosine similarity
    await queryRunner.query(`
            CREATE INDEX IF NOT EXISTS "IDX_issues_embedding" 
            ON "issues" 
            USING hnsw ("embedding" vector_cosine_ops)
        `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_issues_embedding"`);
    await queryRunner.query(`ALTER TABLE "issues" DROP COLUMN "embedding"`);
  }
}
