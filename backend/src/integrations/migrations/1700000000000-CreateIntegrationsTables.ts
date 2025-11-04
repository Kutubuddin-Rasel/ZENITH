import { MigrationInterface, QueryRunner, Table } from 'typeorm';

export class CreateIntegrationsTables1700000000000
  implements MigrationInterface
{
  name = 'CreateIntegrationsTables1700000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Create integrations table
    await queryRunner.createTable(
      new Table({
        name: 'integrations',
        columns: [
          {
            name: 'id',
            type: 'uuid',
            isPrimary: true,
            generationStrategy: 'uuid',
            default: 'uuid_generate_v4()',
          },
          {
            name: 'name',
            type: 'varchar',
            length: '255',
            isNullable: false,
          },
          {
            name: 'type',
            type: 'enum',
            enum: [
              'slack',
              'github',
              'jira',
              'google_workspace',
              'microsoft_teams',
              'trello',
            ],
            isNullable: false,
          },
          {
            name: 'config',
            type: 'jsonb',
            isNullable: false,
          },
          {
            name: 'authConfig',
            type: 'jsonb',
            isNullable: false,
          },
          {
            name: 'organizationId',
            type: 'varchar',
            length: '255',
            isNullable: false,
          },
          {
            name: 'isActive',
            type: 'boolean',
            default: true,
          },
          {
            name: 'healthStatus',
            type: 'enum',
            enum: ['healthy', 'warning', 'error', 'disconnected'],
            default: "'healthy'",
          },
          {
            name: 'lastSyncAt',
            type: 'timestamp',
            isNullable: true,
          },
          {
            name: 'lastErrorAt',
            type: 'timestamp',
            isNullable: true,
          },
          {
            name: 'lastErrorMessage',
            type: 'text',
            isNullable: true,
          },
          {
            name: 'createdAt',
            type: 'timestamp',
            default: 'CURRENT_TIMESTAMP',
          },
          {
            name: 'updatedAt',
            type: 'timestamp',
            default: 'CURRENT_TIMESTAMP',
            onUpdate: 'CURRENT_TIMESTAMP',
          },
        ],
      }),
      true,
    );

    // Create external_data table
    await queryRunner.createTable(
      new Table({
        name: 'external_data',
        columns: [
          {
            name: 'id',
            type: 'uuid',
            isPrimary: true,
            generationStrategy: 'uuid',
            default: 'uuid_generate_v4()',
          },
          {
            name: 'externalId',
            type: 'varchar',
            length: '255',
            isNullable: false,
          },
          {
            name: 'externalType',
            type: 'varchar',
            length: '100',
            isNullable: false,
          },
          {
            name: 'integrationId',
            type: 'uuid',
            isNullable: false,
          },
          {
            name: 'rawData',
            type: 'jsonb',
            isNullable: false,
          },
          {
            name: 'mappedData',
            type: 'jsonb',
            isNullable: true,
          },
          {
            name: 'searchContent',
            type: 'text',
            isNullable: true,
          },
          {
            name: 'lastSyncAt',
            type: 'timestamp',
            isNullable: true,
          },
          {
            name: 'createdAt',
            type: 'timestamp',
            default: 'CURRENT_TIMESTAMP',
          },
        ],
      }),
      true,
    );

    // Create integration_sync_logs table
    await queryRunner.createTable(
      new Table({
        name: 'integration_sync_logs',
        columns: [
          {
            name: 'id',
            type: 'uuid',
            isPrimary: true,
            generationStrategy: 'uuid',
            default: 'uuid_generate_v4()',
          },
          {
            name: 'integrationId',
            type: 'uuid',
            isNullable: false,
          },
          {
            name: 'operation',
            type: 'enum',
            enum: [
              'full_sync',
              'incremental_sync',
              'webhook_sync',
              'manual_sync',
              'test_connection',
            ],
            isNullable: false,
          },
          {
            name: 'status',
            type: 'enum',
            enum: ['running', 'success', 'failed', 'partial'],
            isNullable: false,
          },
          {
            name: 'details',
            type: 'jsonb',
            isNullable: false,
          },
          {
            name: 'startedAt',
            type: 'timestamp',
            isNullable: false,
          },
          {
            name: 'completedAt',
            type: 'timestamp',
            isNullable: true,
          },
          {
            name: 'createdAt',
            type: 'timestamp',
            default: 'CURRENT_TIMESTAMP',
          },
        ],
      }),
      true,
    );

    // Create search_index table
    await queryRunner.createTable(
      new Table({
        name: 'search_index',
        columns: [
          {
            name: 'id',
            type: 'uuid',
            isPrimary: true,
            generationStrategy: 'uuid',
            default: 'uuid_generate_v4()',
          },
          {
            name: 'integrationId',
            type: 'uuid',
            isNullable: false,
          },
          {
            name: 'contentType',
            type: 'varchar',
            length: '100',
            isNullable: false,
          },
          {
            name: 'title',
            type: 'varchar',
            length: '500',
            isNullable: false,
          },
          {
            name: 'content',
            type: 'text',
            isNullable: false,
          },
          {
            name: 'metadata',
            type: 'jsonb',
            isNullable: false,
          },
          {
            name: 'searchVector',
            type: 'tsvector',
            isNullable: true,
          },
          {
            name: 'createdAt',
            type: 'timestamp',
            default: 'CURRENT_TIMESTAMP',
          },
          {
            name: 'updatedAt',
            type: 'timestamp',
            default: 'CURRENT_TIMESTAMP',
            onUpdate: 'CURRENT_TIMESTAMP',
          },
        ],
      }),
      true,
    );

    // Create indexes using raw SQL
    await queryRunner.query(`
      CREATE INDEX "IDX_external_data_integration_external" 
      ON "external_data" ("integrationId", "externalId", "externalType")
    `);

    await queryRunner.query(`
      CREATE INDEX "IDX_search_vector" 
      ON "search_index" USING gin ("searchVector")
    `);

    await queryRunner.query(`
      CREATE INDEX "IDX_integrations_organization_type" 
      ON "integrations" ("organizationId", "type")
    `);

    await queryRunner.query(`
      CREATE INDEX "IDX_sync_logs_integration_created" 
      ON "integration_sync_logs" ("integrationId", "createdAt")
    `);

    // Add unique constraint for external_data
    await queryRunner.query(`
      ALTER TABLE "external_data" 
      ADD CONSTRAINT "UQ_external_data_integration_external" 
      UNIQUE ("integrationId", "externalId", "externalType")
    `);

    // Add foreign key constraints
    await queryRunner.query(`
      ALTER TABLE "external_data" 
      ADD CONSTRAINT "FK_external_data_integration" 
      FOREIGN KEY ("integrationId") REFERENCES "integrations"("id") ON DELETE CASCADE
    `);

    await queryRunner.query(`
      ALTER TABLE "integration_sync_logs" 
      ADD CONSTRAINT "FK_sync_logs_integration" 
      FOREIGN KEY ("integrationId") REFERENCES "integrations"("id") ON DELETE CASCADE
    `);

    await queryRunner.query(`
      ALTER TABLE "search_index" 
      ADD CONSTRAINT "FK_search_index_integration" 
      FOREIGN KEY ("integrationId") REFERENCES "integrations"("id") ON DELETE CASCADE
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Drop foreign key constraints
    await queryRunner.query(
      'ALTER TABLE "search_index" DROP CONSTRAINT "FK_search_index_integration"',
    );
    await queryRunner.query(
      'ALTER TABLE "integration_sync_logs" DROP CONSTRAINT "FK_sync_logs_integration"',
    );
    await queryRunner.query(
      'ALTER TABLE "external_data" DROP CONSTRAINT "FK_external_data_integration"',
    );

    // Drop indexes
    await queryRunner.dropIndex(
      'integration_sync_logs',
      'IDX_sync_logs_integration_created',
    );
    await queryRunner.dropIndex(
      'integrations',
      'IDX_integrations_organization_type',
    );
    await queryRunner.dropIndex('search_index', 'IDX_search_vector');
    await queryRunner.dropIndex(
      'external_data',
      'IDX_external_data_integration_external',
    );

    // Drop tables
    await queryRunner.dropTable('search_index');
    await queryRunner.dropTable('integration_sync_logs');
    await queryRunner.dropTable('external_data');
    await queryRunner.dropTable('integrations');
  }
}
