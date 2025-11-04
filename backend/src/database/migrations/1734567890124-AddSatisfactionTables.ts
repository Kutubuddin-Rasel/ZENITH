import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddSatisfactionTables1734567890124 implements MigrationInterface {
  name = 'AddSatisfactionTables1734567890124';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Create satisfaction_metrics table
    await queryRunner.query(`
            CREATE TABLE "satisfaction_metrics" (
                "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
                "userId" character varying NOT NULL,
                "metric" character varying NOT NULL,
                "value" numeric(10,2) NOT NULL,
                "context" jsonb,
                "timestamp" TIMESTAMP NOT NULL DEFAULT now(),
                CONSTRAINT "PK_satisfaction_metrics" PRIMARY KEY ("id")
            )
        `);

    // Create satisfaction_surveys table
    await queryRunner.query(`
            CREATE TABLE "satisfaction_surveys" (
                "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
                "userId" character varying NOT NULL,
                "type" character varying NOT NULL,
                "questions" jsonb NOT NULL,
                "overallScore" numeric(3,2) NOT NULL,
                "feedback" text,
                "timestamp" TIMESTAMP NOT NULL DEFAULT now(),
                CONSTRAINT "PK_satisfaction_surveys" PRIMARY KEY ("id")
            )
        `);

    // Create indexes
    await queryRunner.query(
      `CREATE INDEX "IDX_satisfaction_metrics_userId_metric" ON "satisfaction_metrics" ("userId", "metric")`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_satisfaction_metrics_metric_timestamp" ON "satisfaction_metrics" ("metric", "timestamp")`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_satisfaction_surveys_userId_type" ON "satisfaction_surveys" ("userId", "type")`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_satisfaction_surveys_type_timestamp" ON "satisfaction_surveys" ("type", "timestamp")`,
    );

    // Add foreign key constraints
    await queryRunner.query(
      `ALTER TABLE "satisfaction_metrics" ADD CONSTRAINT "FK_satisfaction_metrics_userId" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE`,
    );
    await queryRunner.query(
      `ALTER TABLE "satisfaction_surveys" ADD CONSTRAINT "FK_satisfaction_surveys_userId" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Drop foreign key constraints
    await queryRunner.query(
      `ALTER TABLE "satisfaction_surveys" DROP CONSTRAINT "FK_satisfaction_surveys_userId"`,
    );
    await queryRunner.query(
      `ALTER TABLE "satisfaction_metrics" DROP CONSTRAINT "FK_satisfaction_metrics_userId"`,
    );

    // Drop indexes
    await queryRunner.query(
      `DROP INDEX "IDX_satisfaction_surveys_type_timestamp"`,
    );
    await queryRunner.query(
      `DROP INDEX "IDX_satisfaction_surveys_userId_type"`,
    );
    await queryRunner.query(
      `DROP INDEX "IDX_satisfaction_metrics_metric_timestamp"`,
    );
    await queryRunner.query(
      `DROP INDEX "IDX_satisfaction_metrics_userId_metric"`,
    );

    // Drop tables
    await queryRunner.query(`DROP TABLE "satisfaction_surveys"`);
    await queryRunner.query(`DROP TABLE "satisfaction_metrics"`);
  }
}
