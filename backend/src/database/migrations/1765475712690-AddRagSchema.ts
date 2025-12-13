import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddRagSchema1765475712690 implements MigrationInterface {
  name = 'AddRagSchema1765475712690';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // TRUNCATE to avoid NOT NULL violations and ensure clean schema migration
    await queryRunner.query(`TRUNCATE TABLE "document_segments" CASCADE`);

    await queryRunner.query(
      `DROP INDEX IF EXISTS "public"."IDX_issues_embedding"`,
    ); // IF EXISTS added
    await queryRunner.query(
      `DROP INDEX IF EXISTS "public"."IDX_e146eb949c00cb7d2869e59a60"`,
    );

    await queryRunner.query(
      `CREATE TABLE "documents" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "projectId" uuid NOT NULL, "path" character varying NOT NULL, "hash" character varying NOT NULL, "mimeType" character varying, "lastIndexedAt" TIMESTAMP, "createdAt" TIMESTAMP NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "PK_ac51aa5181ee2036f5ca482857c" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "IDX_document_project_path" ON "documents" ("projectId", "path") `,
    );

    await queryRunner.query(
      `ALTER TABLE "document_segments" DROP COLUMN "sourceId"`,
    );
    await queryRunner.query(
      `ALTER TABLE "document_segments" DROP COLUMN "sourceType"`,
    );
    await queryRunner.query(
      `ALTER TABLE "document_segments" ADD "documentId" uuid NOT NULL`,
    );
    await queryRunner.query(
      `ALTER TABLE "document_segments" ADD "metadata" jsonb NOT NULL DEFAULT '{}'`,
    );
    await queryRunner.query(
      `ALTER TABLE "saml_configs" ADD "organizationId" uuid`,
    );

    // Handling embedding on document_segments (Drop old float[], Add new vector)
    // Manually executed to resolve syntax/parser issues in TypeORM runner
    // await queryRunner.query(`ALTER TABLE "document_segments" DROP COLUMN IF EXISTS "embedding"`);
    // await queryRunner.query(`ALTER TABLE "document_segments" ADD "embedding" vector(1536)`);
    // await queryRunner.query(`CREATE INDEX "IDX_document_segments_embedding" ON "document_segments" USING hnsw ("embedding" vector_cosine_ops)`);

    // Issues table handling (Already vector, skipping)
    // await queryRunner.query(ALTER TABLE "issues" ...);

    await queryRunner.query(
      `ALTER TABLE "document_segments" ADD CONSTRAINT "FK_9371629195a4f9542e574b5b76a" FOREIGN KEY ("documentId") REFERENCES "documents"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "saml_configs" ADD CONSTRAINT "FK_00e2b397bbbc8891a3c2f1cde08" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "saml_configs" DROP CONSTRAINT "FK_00e2b397bbbc8891a3c2f1cde08"`,
    );
    await queryRunner.query(
      `ALTER TABLE "document_segments" DROP CONSTRAINT "FK_9371629195a4f9542e574b5b76a"`,
    );
    await queryRunner.query(
      `ALTER TABLE "documents" DROP CONSTRAINT "FK_fe6ebd6e679c0feee3a7ecc0354"`,
    );
    await queryRunner.query(`DROP INDEX "public"."IDX_sprint_issue_lookup"`);
    await queryRunner.query(`DROP INDEX "public"."IDX_issue_project_updated"`);
    await queryRunner.query(`DROP INDEX "public"."IDX_issue_project_created"`);
    await queryRunner.query(
      `DROP INDEX "public"."IDX_issue_project_priority_created"`,
    );
    await queryRunner.query(`DROP INDEX "public"."IDX_user_name_search"`);
    await queryRunner.query(`DROP INDEX "public"."IDX_user_email_search"`);
    await queryRunner.query(`DROP INDEX "public"."IDX_project_org_archived"`);
    await queryRunner.query(
      `ALTER TABLE "resource_forecasts" ALTER COLUMN "confidenceScore" SET DEFAULT 0.5`,
    );
    await queryRunner.query(`ALTER TABLE "issues" DROP COLUMN "embedding"`);
    await queryRunner.query(
      `ALTER TABLE "issues" ADD "embedding" double precision array`,
    );
    await queryRunner.query(
      `ALTER TABLE "saml_configs" DROP COLUMN "organizationId"`,
    );
    await queryRunner.query(
      `ALTER TABLE "document_segments" DROP COLUMN "metadata"`,
    );
    await queryRunner.query(
      `ALTER TABLE "document_segments" DROP COLUMN "documentId"`,
    );
    await queryRunner.query(
      `ALTER TABLE "document_segments" ADD "sourceType" character varying NOT NULL`,
    );
    await queryRunner.query(
      `ALTER TABLE "document_segments" ADD "sourceId" character varying NOT NULL`,
    );
    await queryRunner.query(`DROP INDEX "public"."IDX_document_project_path"`);
    await queryRunner.query(`DROP TABLE "documents"`);
    await queryRunner.query(
      `CREATE INDEX "IDX_e146eb949c00cb7d2869e59a60" ON "document_segments" ("sourceId") `,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_issues_embedding" ON "issues" ("embedding") `,
    );
  }
}
