import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Migration: Add Lexorank column for efficient drag & drop ordering
 *
 * This migration:
 * 1. Adds a lexorank VARCHAR column
 * 2. Creates indexes for efficient ordering
 * 3. Migrates existing backlogOrder (number) to lexorank (string)
 *
 * IMPORTANT: This is a DATA MIGRATION - it converts existing order data.
 * Backup your database before running this migration.
 */
export class AddLexorank1735236000000 implements MigrationInterface {
  name = 'AddLexorank1735236000000';

  // Character set for lexorank (base-36)
  private readonly CHARS = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ';
  private readonly BASE = this.CHARS.length;

  /**
   * Convert a position number to a 6-character lexorank string
   * e.g., 0 → "0|000000:", 1 → "0|000001:", 36 → "0|000010:"
   */
  private numberToLexorank(num: number): string {
    let result = '';
    let n = num;

    for (let i = 0; i < 6; i++) {
      result = this.CHARS[n % this.BASE] + result;
      n = Math.floor(n / this.BASE);
    }

    return `0|${result}:`;
  }

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Step 1: Add lexorank column
    await queryRunner.query(`
      ALTER TABLE issues 
      ADD COLUMN IF NOT EXISTS lexorank VARCHAR(50);
    `);

    // Step 2: Create index for ordering by lexorank
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_issues_lexorank 
      ON issues (lexorank);
    `);

    // Step 3: Create composite index for project + lexorank ordering
    // This is used for: SELECT * FROM issues WHERE projectId = ? ORDER BY lexorank
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_issues_project_lexorank 
      ON issues ("projectId", lexorank);
    `);

    // Step 4: Migrate existing data per project
    // Get all projects that have issues
    const projects = (await queryRunner.query(`
      SELECT DISTINCT "projectId" FROM issues WHERE "projectId" IS NOT NULL;
    `)) as Array<{ projectId: string }>;

    console.log(`Migrating lexorank for ${projects.length} projects...`);

    for (const project of projects) {
      const projectId = project.projectId;

      // Get issues for this project ordered by current backlogOrder
      const issues = (await queryRunner.query(
        `
        SELECT id, "backlogOrder" 
        FROM issues 
        WHERE "projectId" = $1 
        ORDER BY "backlogOrder" ASC;
      `,
        [projectId],
      )) as Array<{ id: string; backlogOrder: number }>;

      console.log(
        `  Project ${projectId}: migrating ${issues.length} issues...`,
      );

      // Generate lexorank for each issue based on position
      // Using batch update for better performance
      if (issues.length > 0) {
        const updates: string[] = [];
        for (let i = 0; i < issues.length; i++) {
          const lexorank = this.numberToLexorank(i);
          updates.push(`('${issues[i].id}', '${lexorank}')`);
        }

        // Batch update using VALUES and UPDATE FROM
        await queryRunner.query(`
          UPDATE issues AS i
          SET lexorank = v.lexorank
          FROM (VALUES ${updates.join(', ')}) AS v(id, lexorank)
          WHERE i.id::text = v.id;
        `);
      }
    }

    // Step 5: Set default for new issues (middle of the range)
    await queryRunner.query(`
      ALTER TABLE issues 
      ALTER COLUMN lexorank SET DEFAULT '0|HZZZZZ:';
    `);

    console.log('Lexorank migration complete!');
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DROP INDEX IF EXISTS idx_issues_project_lexorank;`,
    );
    await queryRunner.query(`DROP INDEX IF EXISTS idx_issues_lexorank;`);
    await queryRunner.query(
      `ALTER TABLE issues DROP COLUMN IF EXISTS lexorank;`,
    );
  }
}
