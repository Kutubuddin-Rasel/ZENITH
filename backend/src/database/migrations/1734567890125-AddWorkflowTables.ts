import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddWorkflowTables1734567890125 implements MigrationInterface {
  name = 'AddWorkflowTables1734567890125';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Create workflows table
    await queryRunner.query(`
            CREATE TABLE "workflows" (
                "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
                "projectId" character varying NOT NULL,
                "name" character varying NOT NULL,
                "description" text,
                "definition" jsonb NOT NULL,
                "metadata" jsonb,
                "status" character varying NOT NULL DEFAULT 'draft',
                "isActive" boolean NOT NULL DEFAULT true,
                "version" integer NOT NULL DEFAULT 1,
                "parentWorkflowId" character varying,
                "createdBy" character varying NOT NULL,
                "tags" jsonb,
                "category" character varying,
                "icon" character varying,
                "color" character varying,
                "executionCount" integer NOT NULL DEFAULT 0,
                "lastExecutedAt" timestamp,
                "successRate" numeric(5,2),
                "averageExecutionTime" numeric(10,2),
                "createdAt" timestamp NOT NULL DEFAULT now(),
                "updatedAt" timestamp NOT NULL DEFAULT now(),
                CONSTRAINT "PK_workflows" PRIMARY KEY ("id")
            )
        `);

    // Create automation_rules table
    await queryRunner.query(`
            CREATE TABLE "automation_rules" (
                "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
                "projectId" character varying NOT NULL,
                "name" character varying NOT NULL,
                "description" text,
                "triggerType" character varying NOT NULL,
                "triggerConfig" jsonb NOT NULL,
                "conditions" jsonb,
                "actions" jsonb NOT NULL,
                "status" character varying NOT NULL DEFAULT 'active',
                "isActive" boolean NOT NULL DEFAULT true,
                "executionCount" integer NOT NULL DEFAULT 0,
                "lastExecutedAt" timestamp,
                "nextExecutionAt" timestamp,
                "lastError" text,
                "successRate" numeric(5,2),
                "averageExecutionTime" numeric(10,2),
                "createdBy" character varying NOT NULL,
                "tags" jsonb,
                "category" character varying,
                "icon" character varying,
                "color" character varying,
                "metadata" jsonb,
                "createdAt" timestamp NOT NULL DEFAULT now(),
                "updatedAt" timestamp NOT NULL DEFAULT now(),
                CONSTRAINT "PK_automation_rules" PRIMARY KEY ("id")
            )
        `);

    // Create workflow_executions table
    await queryRunner.query(`
            CREATE TABLE "workflow_executions" (
                "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
                "workflowId" character varying NOT NULL,
                "triggerEvent" character varying NOT NULL,
                "context" jsonb NOT NULL,
                "status" character varying NOT NULL DEFAULT 'pending',
                "startedAt" timestamp NOT NULL DEFAULT now(),
                "completedAt" timestamp,
                "executionLog" jsonb,
                "errorMessage" text,
                "result" jsonb,
                "executionTime" numeric(10,2),
                "retryCount" integer NOT NULL DEFAULT 0,
                "maxRetries" integer NOT NULL DEFAULT 3,
                "nextRetryAt" timestamp,
                "metadata" jsonb,
                "createdAt" timestamp NOT NULL DEFAULT now(),
                "updatedAt" timestamp NOT NULL DEFAULT now(),
                CONSTRAINT "PK_workflow_executions" PRIMARY KEY ("id")
            )
        `);

    // Create workflow_templates table
    await queryRunner.query(`
            CREATE TABLE "workflow_templates" (
                "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
                "name" character varying NOT NULL,
                "description" text,
                "category" character varying NOT NULL,
                "templateDefinition" jsonb NOT NULL,
                "metadata" jsonb,
                "status" character varying NOT NULL DEFAULT 'draft',
                "isPublic" boolean NOT NULL DEFAULT false,
                "usageCount" integer NOT NULL DEFAULT 0,
                "rating" numeric(3,2),
                "reviewCount" integer NOT NULL DEFAULT 0,
                "tags" jsonb,
                "icon" character varying,
                "color" character varying,
                "previewImage" character varying,
                "instructions" text,
                "requirements" jsonb,
                "createdBy" character varying NOT NULL,
                "reviews" jsonb,
                "analytics" jsonb,
                "createdAt" timestamp NOT NULL DEFAULT now(),
                "updatedAt" timestamp NOT NULL DEFAULT now(),
                CONSTRAINT "PK_workflow_templates" PRIMARY KEY ("id")
            )
        `);

    // Create indexes for workflows table
    await queryRunner.query(
      `CREATE INDEX "IDX_workflows_projectId_isActive" ON "workflows" ("projectId", "isActive")`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_workflows_createdBy_status" ON "workflows" ("createdBy", "status")`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_workflows_category" ON "workflows" ("category")`,
    );

    // Create indexes for automation_rules table
    await queryRunner.query(
      `CREATE INDEX "IDX_automation_rules_projectId_isActive" ON "automation_rules" ("projectId", "isActive")`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_automation_rules_triggerType_isActive" ON "automation_rules" ("triggerType", "isActive")`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_automation_rules_createdBy_status" ON "automation_rules" ("createdBy", "status")`,
    );

    // Create indexes for workflow_executions table
    await queryRunner.query(
      `CREATE INDEX "IDX_workflow_executions_workflowId_status" ON "workflow_executions" ("workflowId", "status")`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_workflow_executions_status_startedAt" ON "workflow_executions" ("status", "startedAt")`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_workflow_executions_triggerEvent_startedAt" ON "workflow_executions" ("triggerEvent", "startedAt")`,
    );

    // Create indexes for workflow_templates table
    await queryRunner.query(
      `CREATE INDEX "IDX_workflow_templates_category_isPublic" ON "workflow_templates" ("category", "isPublic")`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_workflow_templates_status_usageCount" ON "workflow_templates" ("status", "usageCount")`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_workflow_templates_createdBy_status" ON "workflow_templates" ("createdBy", "status")`,
    );

    // Add foreign key constraints
    await queryRunner.query(
      `ALTER TABLE "workflows" ADD CONSTRAINT "FK_workflows_projectId" FOREIGN KEY ("projectId") REFERENCES "projects"("id") ON DELETE CASCADE`,
    );
    await queryRunner.query(
      `ALTER TABLE "workflows" ADD CONSTRAINT "FK_workflows_createdBy" FOREIGN KEY ("createdBy") REFERENCES "users"("id") ON DELETE CASCADE`,
    );
    await queryRunner.query(
      `ALTER TABLE "workflows" ADD CONSTRAINT "FK_workflows_parentWorkflowId" FOREIGN KEY ("parentWorkflowId") REFERENCES "workflows"("id") ON DELETE SET NULL`,
    );

    await queryRunner.query(
      `ALTER TABLE "automation_rules" ADD CONSTRAINT "FK_automation_rules_projectId" FOREIGN KEY ("projectId") REFERENCES "projects"("id") ON DELETE CASCADE`,
    );
    await queryRunner.query(
      `ALTER TABLE "automation_rules" ADD CONSTRAINT "FK_automation_rules_createdBy" FOREIGN KEY ("createdBy") REFERENCES "users"("id") ON DELETE CASCADE`,
    );

    await queryRunner.query(
      `ALTER TABLE "workflow_executions" ADD CONSTRAINT "FK_workflow_executions_workflowId" FOREIGN KEY ("workflowId") REFERENCES "workflows"("id") ON DELETE CASCADE`,
    );

    await queryRunner.query(
      `ALTER TABLE "workflow_templates" ADD CONSTRAINT "FK_workflow_templates_createdBy" FOREIGN KEY ("createdBy") REFERENCES "users"("id") ON DELETE CASCADE`,
    );

    // Insert system workflow templates
    await queryRunner.query(`
            INSERT INTO "workflow_templates" (
                "id", "name", "description", "category", "templateDefinition", "metadata", 
                "status", "isPublic", "usageCount", "rating", "reviewCount", "tags", 
                "icon", "color", "createdBy", "createdAt", "updatedAt"
            ) VALUES (
                'system-simple-approval',
                'Simple Approval Workflow',
                'Basic approval workflow for issue review',
                'approval',
                '{"nodes":[{"id":"start","type":"start","name":"Start","position":{"x":100,"y":100},"config":{}},{"id":"approval","type":"approval","name":"Approval","position":{"x":300,"y":100},"config":{"approvers":[],"autoApprove":false,"timeout":24}},{"id":"end","type":"end","name":"End","position":{"x":500,"y":100},"config":{}}],"connections":[{"id":"conn1","source":"start","target":"approval"},{"id":"conn2","source":"approval","target":"end"}]}',
                '{"version":"1.0.0","author":"System","category":"approval","tags":["approval","simple","basic"],"complexity":"simple","estimatedSetupTime":5,"requiredPermissions":["issues:view"],"compatibleProjects":["software","general"],"lastUpdated":"2024-12-18T00:00:00.000Z"}',
                'published',
                true,
                0,
                4.5,
                0,
                '["approval","simple","basic"]',
                'check-circle',
                '#10B981',
                'system',
                now(),
                now()
            )
        `);

    await queryRunner.query(`
            INSERT INTO "workflow_templates" (
                "id", "name", "description", "category", "templateDefinition", "metadata", 
                "status", "isPublic", "usageCount", "rating", "reviewCount", "tags", 
                "icon", "color", "createdBy", "createdAt", "updatedAt"
            ) VALUES (
                'system-bug-triage',
                'Bug Triage Workflow',
                'Automated bug triage and assignment workflow',
                'development',
                '{"nodes":[{"id":"start","type":"start","name":"Bug Reported","position":{"x":100,"y":100},"config":{}},{"id":"triage","type":"decision","name":"Triage Decision","position":{"x":300,"y":100},"config":{"condition":"context.priority === \"high\""}},{"id":"assign","type":"action","name":"Assign to Developer","position":{"x":500,"y":50},"config":{"action":"assign_user","config":{}}},{"id":"notify","type":"action","name":"Notify Team","position":{"x":500,"y":150},"config":{"action":"send_notification","config":{}}},{"id":"end","type":"end","name":"End","position":{"x":700,"y":100},"config":{}}],"connections":[{"id":"conn1","source":"start","target":"triage"},{"id":"conn2","source":"triage","target":"assign","condition":"context.priority === \"high\""},{"id":"conn3","source":"triage","target":"notify","condition":"context.priority !== \"high\""},{"id":"conn4","source":"assign","target":"end"},{"id":"conn5","source":"notify","target":"end"}]}',
                '{"version":"1.0.0","author":"System","category":"development","tags":["bug","triage","automation"],"complexity":"moderate","estimatedSetupTime":15,"requiredPermissions":["issues:view","issues:edit"],"compatibleProjects":["software","development"],"lastUpdated":"2024-12-18T00:00:00.000Z"}',
                'published',
                true,
                0,
                4.8,
                0,
                '["bug","triage","automation"]',
                'bug-ant',
                '#EF4444',
                'system',
                now(),
                now()
            )
        `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Drop foreign key constraints
    await queryRunner.query(
      `ALTER TABLE "workflow_templates" DROP CONSTRAINT "FK_workflow_templates_createdBy"`,
    );
    await queryRunner.query(
      `ALTER TABLE "workflow_executions" DROP CONSTRAINT "FK_workflow_executions_workflowId"`,
    );
    await queryRunner.query(
      `ALTER TABLE "automation_rules" DROP CONSTRAINT "FK_automation_rules_createdBy"`,
    );
    await queryRunner.query(
      `ALTER TABLE "automation_rules" DROP CONSTRAINT "FK_automation_rules_projectId"`,
    );
    await queryRunner.query(
      `ALTER TABLE "workflows" DROP CONSTRAINT "FK_workflows_parentWorkflowId"`,
    );
    await queryRunner.query(
      `ALTER TABLE "workflows" DROP CONSTRAINT "FK_workflows_createdBy"`,
    );
    await queryRunner.query(
      `ALTER TABLE "workflows" DROP CONSTRAINT "FK_workflows_projectId"`,
    );

    // Drop indexes
    await queryRunner.query(
      `DROP INDEX "IDX_workflow_templates_createdBy_status"`,
    );
    await queryRunner.query(
      `DROP INDEX "IDX_workflow_templates_status_usageCount"`,
    );
    await queryRunner.query(
      `DROP INDEX "IDX_workflow_templates_category_isPublic"`,
    );
    await queryRunner.query(
      `DROP INDEX "IDX_workflow_executions_triggerEvent_startedAt"`,
    );
    await queryRunner.query(
      `DROP INDEX "IDX_workflow_executions_status_startedAt"`,
    );
    await queryRunner.query(
      `DROP INDEX "IDX_workflow_executions_workflowId_status"`,
    );
    await queryRunner.query(
      `DROP INDEX "IDX_automation_rules_createdBy_status"`,
    );
    await queryRunner.query(
      `DROP INDEX "IDX_automation_rules_triggerType_isActive"`,
    );
    await queryRunner.query(
      `DROP INDEX "IDX_automation_rules_projectId_isActive"`,
    );
    await queryRunner.query(`DROP INDEX "IDX_workflows_category"`);
    await queryRunner.query(`DROP INDEX "IDX_workflows_createdBy_status"`);
    await queryRunner.query(`DROP INDEX "IDX_workflows_projectId_isActive"`);

    // Drop tables
    await queryRunner.query(`DROP TABLE "workflow_templates"`);
    await queryRunner.query(`DROP TABLE "workflow_executions"`);
    await queryRunner.query(`DROP TABLE "automation_rules"`);
    await queryRunner.query(`DROP TABLE "workflows"`);
  }
}
