import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * EnablePgvector Migration
 *
 * Enables the pgvector extension for semantic/vector similarity search.
 * This migration gracefully handles environments where pgvector is not installed.
 *
 * Prerequisites:
 * - PostgreSQL 14+ with pgvector extension installed
 * - For Docker: use pgvector/pgvector:pg16 image
 * - For local: install via package manager
 */
export class EnablePgvector1735500000000 implements MigrationInterface {
  name = 'EnablePgvector1735500000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    console.log('Enabling pgvector extension for semantic search...');

    // Check if pgvector extension is available and enable it
    try {
      await queryRunner.query(`CREATE EXTENSION IF NOT EXISTS vector;`);
      console.log('✅ pgvector extension enabled successfully');
    } catch (error: unknown) {
      const pgError = error as { code?: string; message?: string };

      if (pgError.code === '42501') {
        // Permission denied - need superuser
        console.warn(
          '⚠️ pgvector extension not available: Insufficient privileges',
        );
        console.warn('   Run as superuser: CREATE EXTENSION vector;');
        console.warn(
          '   Semantic search will be disabled until extension is installed.',
        );
        return; // Don't fail - allow app to work without vector search
      } else if (pgError.code === '58P01') {
        // Extension not installed in PostgreSQL
        console.warn(
          '⚠️ pgvector extension not installed in this PostgreSQL instance',
        );
        console.warn(
          '   Install via: apt-get install postgresql-16-pgvector (Linux)',
        );
        console.warn('   Or use: docker pull pgvector/pgvector:pg16');
        console.warn(
          '   Semantic search will be disabled until extension is installed.',
        );
        return; // Don't fail - allow app to work without vector search
      } else {
        console.error(
          '❌ Unexpected error enabling pgvector:',
          pgError.message,
        );
        // Continue without failing
        return;
      }
    }

    // Check if vector extension was successfully installed
    const extensionCheck = (await queryRunner.query(
      `SELECT 1 FROM pg_extension WHERE extname = 'vector'`,
    )) as { exists: number }[];

    if (extensionCheck.length === 0) {
      console.warn('⚠️ pgvector extension not detected, skipping vector setup');
      return;
    }

    // Add vector column to issues table if it doesn't exist
    // We use 1536 dimensions for OpenAI text-embedding-3-small
    console.log('Adding embedding_vector column to issues table...');

    await queryRunner.query(`
      ALTER TABLE issues 
      ADD COLUMN IF NOT EXISTS embedding_vector vector(1536);
    `);

    // Create IVFFlat index for fast cosine similarity search
    // lists = sqrt(n) where n = expected number of vectors
    // We estimate 100k issues = ~316 lists, but use 100 for safety
    console.log('Creating vector similarity index...');

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_issues_embedding_cosine 
      ON issues 
      USING ivfflat (embedding_vector vector_cosine_ops)
      WITH (lists = 100);
    `);

    // Migrate existing embeddings from float array to vector type
    console.log('Migrating existing embeddings to vector type...');

    await queryRunner.query(`
      UPDATE issues 
      SET embedding_vector = embedding::vector(1536)
      WHERE embedding IS NOT NULL 
        AND embedding_vector IS NULL
        AND array_length(embedding, 1) = 1536;
    `);

    console.log('✅ pgvector setup completed successfully');
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    console.log('Rolling back pgvector migration...');

    // Drop the vector index
    await queryRunner.query(`
      DROP INDEX IF EXISTS idx_issues_embedding_cosine;
    `);

    // Drop the vector column
    await queryRunner.query(`
      ALTER TABLE issues DROP COLUMN IF EXISTS embedding_vector;
    `);

    // Note: We don't drop the extension as it may be used by other tables

    console.log('✅ pgvector rollback completed');
  }
}
