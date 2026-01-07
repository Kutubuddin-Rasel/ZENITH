import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Migration: Add full-text search support to issues table
 *
 * This migration:
 * 1. Adds a tsvector column for search
 * 2. Creates a GIN index for fast full-text queries
 * 3. Creates a trigger to auto-update the search vector
 * 4. Backfills existing data
 */
export class AddSearchVector1735235000000 implements MigrationInterface {
  name = 'AddSearchVector1735235000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Step 1: Add the tsvector column
    await queryRunner.query(`
      ALTER TABLE issues 
      ADD COLUMN IF NOT EXISTS search_vector tsvector;
    `);

    // Step 2: Create GIN index for fast full-text search
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_issues_search_vector 
      ON issues USING GIN(search_vector);
    `);

    // Step 3: Create function to update search vector
    // Weights: A = title (highest priority), B = description
    await queryRunner.query(`
      CREATE OR REPLACE FUNCTION issues_search_vector_update() 
      RETURNS trigger AS $$
      BEGIN
        NEW.search_vector := 
          setweight(to_tsvector('english', COALESCE(NEW.title, '')), 'A') ||
          setweight(to_tsvector('english', COALESCE(NEW.description, '')), 'B');
        RETURN NEW;
      END;
      $$ LANGUAGE plpgsql;
    `);

    // Step 4: Create trigger for auto-update on INSERT/UPDATE
    await queryRunner.query(`
      DROP TRIGGER IF EXISTS issues_search_vector_trigger ON issues;
      CREATE TRIGGER issues_search_vector_trigger
        BEFORE INSERT OR UPDATE OF title, description
        ON issues
        FOR EACH ROW
        EXECUTE FUNCTION issues_search_vector_update();
    `);

    // Step 5: Backfill existing data (CRITICAL for existing issues)
    await queryRunner.query(`
      UPDATE issues 
      SET search_vector = 
        setweight(to_tsvector('english', COALESCE(title, '')), 'A') ||
        setweight(to_tsvector('english', COALESCE(description, '')), 'B')
      WHERE search_vector IS NULL;
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DROP TRIGGER IF EXISTS issues_search_vector_trigger ON issues;`,
    );
    await queryRunner.query(
      `DROP FUNCTION IF EXISTS issues_search_vector_update;`,
    );
    await queryRunner.query(`DROP INDEX IF EXISTS idx_issues_search_vector;`);
    await queryRunner.query(
      `ALTER TABLE issues DROP COLUMN IF EXISTS search_vector;`,
    );
  }
}
