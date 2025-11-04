import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateResourceManagementTables1700000000001
  implements MigrationInterface
{
  name = 'CreateResourceManagementTables1700000000001';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Create user_capacity table
    await queryRunner.query(`
      CREATE TABLE user_capacity (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        date DATE NOT NULL,
        available_hours DECIMAL(4,2) DEFAULT 8.0,
        allocated_hours DECIMAL(4,2) DEFAULT 0,
        capacity_percentage DECIMAL(5,2) GENERATED ALWAYS AS (
          CASE WHEN available_hours > 0 THEN (allocated_hours / available_hours) * 100 ELSE 0 END
        ) STORED,
        is_working_day BOOLEAN DEFAULT true,
        notes TEXT,
        created_at TIMESTAMP DEFAULT NOW(),
        updated_at TIMESTAMP DEFAULT NOW(),
        UNIQUE(user_id, date)
      );
    `);

    // Create resource_allocations table
    await queryRunner.query(`
      CREATE TABLE resource_allocations (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
        task_id UUID REFERENCES tasks(id) ON DELETE SET NULL,
        allocation_percentage DECIMAL(5,2) NOT NULL CHECK (allocation_percentage > 0 AND allocation_percentage <= 100),
        start_date DATE NOT NULL,
        end_date DATE NOT NULL,
        hours_per_day DECIMAL(4,2),
        role_in_project VARCHAR(100) NOT NULL,
        billing_rate DECIMAL(10,2) DEFAULT 0,
        skill_requirements JSONB,
        allocation_confidence DECIMAL(3,2) DEFAULT 1.0,
        user_capacity_id UUID REFERENCES user_capacity(id),
        created_by UUID REFERENCES users(id),
        created_at TIMESTAMP DEFAULT NOW(),
        CHECK(start_date <= end_date)
      );
    `);

    // Create skill_matrix table
    await queryRunner.query(`
      CREATE TABLE skill_matrix (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        skill VARCHAR(100) NOT NULL,
        proficiency_level INTEGER NOT NULL CHECK (proficiency_level >= 1 AND proficiency_level <= 5),
        experience_years INTEGER DEFAULT 0,
        is_verified BOOLEAN DEFAULT false,
        last_used DATE,
        certifications TEXT,
        created_at TIMESTAMP DEFAULT NOW(),
        updated_at TIMESTAMP DEFAULT NOW(),
        UNIQUE(user_id, skill)
      );
    `);

    // Create resource_conflicts table
    await queryRunner.query(`
      CREATE TABLE resource_conflicts (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        conflict_date DATE NOT NULL,
        total_allocation_percentage DECIMAL(5,2) NOT NULL,
        conflicting_allocations JSONB NOT NULL,
        severity VARCHAR(20) DEFAULT 'medium' CHECK (severity IN ('low', 'medium', 'high', 'critical')),
        status VARCHAR(20) DEFAULT 'active' CHECK (status IN ('active', 'resolved', 'ignored')),
        resolved_at TIMESTAMP,
        resolved_by UUID REFERENCES users(id),
        resolution_notes TEXT,
        auto_resolution_attempted BOOLEAN DEFAULT false,
        detected_at TIMESTAMP DEFAULT NOW()
      );
    `);

    // Create resource_forecasts table
    await queryRunner.query(`
      CREATE TABLE resource_forecasts (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
        forecast_date DATE NOT NULL,
        resource_needs JSONB NOT NULL,
        predicted_allocations JSONB,
        confidence_score DECIMAL(3,2) DEFAULT 0.5 CHECK (confidence_score >= 0 AND confidence_score <= 1),
        assumptions JSONB,
        model_version VARCHAR(20),
        generated_at TIMESTAMP DEFAULT NOW(),
        expires_at TIMESTAMP
      );
    `);

    // Create indexes for performance
    await queryRunner.query(`
      CREATE INDEX idx_user_capacity_date_range ON user_capacity(user_id, date);
    `);

    await queryRunner.query(`
      CREATE INDEX idx_resource_allocations_date_range ON resource_allocations(user_id, start_date, end_date);
    `);

    await queryRunner.query(`
      CREATE INDEX idx_resource_allocations_project ON resource_allocations(project_id, start_date, end_date);
    `);

    await queryRunner.query(`
      CREATE INDEX idx_skill_matrix_skill ON skill_matrix(skill, proficiency_level);
    `);

    await queryRunner.query(`
      CREATE INDEX idx_conflicts_user_date ON resource_conflicts(user_id, conflict_date, status);
    `);

    await queryRunner.query(`
      CREATE INDEX idx_forecasts_project_date ON resource_forecasts(project_id, forecast_date);
    `);

    await queryRunner.query(`
      CREATE INDEX idx_forecasts_generated ON resource_forecasts(generated_at);
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Drop indexes
    await queryRunner.query(`DROP INDEX IF EXISTS idx_forecasts_generated;`);
    await queryRunner.query(`DROP INDEX IF EXISTS idx_forecasts_project_date;`);
    await queryRunner.query(`DROP INDEX IF EXISTS idx_conflicts_user_date;`);
    await queryRunner.query(`DROP INDEX IF EXISTS idx_skill_matrix_skill;`);
    await queryRunner.query(
      `DROP INDEX IF EXISTS idx_resource_allocations_project;`,
    );
    await queryRunner.query(
      `DROP INDEX IF EXISTS idx_resource_allocations_date_range;`,
    );
    await queryRunner.query(
      `DROP INDEX IF EXISTS idx_user_capacity_date_range;`,
    );

    // Drop tables
    await queryRunner.query(`DROP TABLE IF EXISTS resource_forecasts;`);
    await queryRunner.query(`DROP TABLE IF EXISTS resource_conflicts;`);
    await queryRunner.query(`DROP TABLE IF EXISTS skill_matrix;`);
    await queryRunner.query(`DROP TABLE IF EXISTS resource_allocations;`);
    await queryRunner.query(`DROP TABLE IF EXISTS user_capacity;`);
  }
}
