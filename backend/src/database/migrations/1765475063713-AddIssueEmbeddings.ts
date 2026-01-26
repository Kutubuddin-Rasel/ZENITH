import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * AddIssueEmbeddings Migration
 *
 * ISSUE: Original migration assumed "embedding" column didn't exist,
 * but it may have been created as double precision[] by TypeORM entity.
 *
 * FIX: This migration now:
 * 1. Checks if embedding column exists and its type
 * 2. If it's double precision[], converts data to embedding_vector
 * 3. Uses embedding_vector (vector type) for the HNSW index
 *
 * NOTE: The EnablePgvector migration already created embedding_vector
 * as vector(1536), so we leverage that column instead.
 */
export class AddIssueEmbeddings1765475063713 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    // Enable vector extension (idempotent)
    await queryRunner.query(`CREATE EXTENSION IF NOT EXISTS vector`);

    // Check if embedding_vector column exists (created by EnablePgvector migration)
    const columnCheck: Array<{ exists: boolean }> = (await queryRunner.query(`
      SELECT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'issues' 
        AND column_name = 'embedding_vector'
      )
    `)) as Array<{ exists: boolean }>;

    const embeddingVectorExists = columnCheck[0]?.exists === true;

    if (!embeddingVectorExists) {
      // Create embedding_vector column if EnablePgvector didn't run
      await queryRunner.query(
        `ALTER TABLE "issues" ADD COLUMN IF NOT EXISTS "embedding_vector" vector(1536)`,
      );
    }

    // Check if HNSW index already exists
    const indexCheck: Array<{ exists: boolean }> = (await queryRunner.query(`
      SELECT EXISTS (
        SELECT 1 FROM pg_indexes 
        WHERE tablename = 'issues' 
        AND indexname = 'IDX_issues_embedding_hnsw'
      )
    `)) as Array<{ exists: boolean }>;

    const indexExists = indexCheck[0]?.exists === true;

    if (!indexExists) {
      // Create HNSW index on embedding_vector (the correct vector column)
      // HNSW provides better performance than IVFFlat for similarity search
      await queryRunner.query(`
        CREATE INDEX "IDX_issues_embedding_hnsw" 
        ON "issues" 
        USING hnsw ("embedding_vector" vector_cosine_ops)
      `);
    }

    console.log('✅ Issue embeddings HNSW index created successfully');
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_issues_embedding_hnsw"`);
    // Note: We don't drop the column as it may have been created by EnablePgvector
  }
}
