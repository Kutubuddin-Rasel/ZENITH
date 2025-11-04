import { MigrationInterface, QueryRunner } from 'typeorm';

export class DatabaseIndexes1700000000000 implements MigrationInterface {
  name = 'DatabaseIndexes1700000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // User table indexes
    await queryRunner.query(`
      CREATE INDEX CONCURRENTLY IF NOT EXISTS "IDX_user_email" ON "user" ("email");
    `);
    await queryRunner.query(`
      CREATE INDEX CONCURRENTLY IF NOT EXISTS "IDX_user_is_active" ON "user" ("isActive");
    `);
    await queryRunner.query(`
      CREATE INDEX CONCURRENTLY IF NOT EXISTS "IDX_user_is_super_admin" ON "user" ("isSuperAdmin");
    `);
    await queryRunner.query(`
      CREATE INDEX CONCURRENTLY IF NOT EXISTS "IDX_user_created_at" ON "user" ("createdAt");
    `);

    // Project table indexes
    await queryRunner.query(`
      CREATE INDEX CONCURRENTLY IF NOT EXISTS "IDX_project_name" ON "project" ("name");
    `);
    await queryRunner.query(`
      CREATE INDEX CONCURRENTLY IF NOT EXISTS "IDX_project_status" ON "project" ("status");
    `);
    await queryRunner.query(`
      CREATE INDEX CONCURRENTLY IF NOT EXISTS "IDX_project_created_at" ON "project" ("createdAt");
    `);
    await queryRunner.query(`
      CREATE INDEX CONCURRENTLY IF NOT EXISTS "IDX_project_updated_at" ON "project" ("updatedAt");
    `);

    // Issue table indexes
    await queryRunner.query(`
      CREATE INDEX CONCURRENTLY IF NOT EXISTS "IDX_issue_project_id" ON "issue" ("projectId");
    `);
    await queryRunner.query(`
      CREATE INDEX CONCURRENTLY IF NOT EXISTS "IDX_issue_status" ON "issue" ("status");
    `);
    await queryRunner.query(`
      CREATE INDEX CONCURRENTLY IF NOT EXISTS "IDX_issue_priority" ON "issue" ("priority");
    `);
    await queryRunner.query(`
      CREATE INDEX CONCURRENTLY IF NOT EXISTS "IDX_issue_type" ON "issue" ("type");
    `);
    await queryRunner.query(`
      CREATE INDEX CONCURRENTLY IF NOT EXISTS "IDX_issue_assignee_id" ON "issue" ("assigneeId");
    `);
    await queryRunner.query(`
      CREATE INDEX CONCURRENTLY IF NOT EXISTS "IDX_issue_reporter_id" ON "issue" ("reporterId");
    `);
    await queryRunner.query(`
      CREATE INDEX CONCURRENTLY IF NOT EXISTS "IDX_issue_created_at" ON "issue" ("createdAt");
    `);
    await queryRunner.query(`
      CREATE INDEX CONCURRENTLY IF NOT EXISTS "IDX_issue_updated_at" ON "issue" ("updatedAt");
    `);
    await queryRunner.query(`
      CREATE INDEX CONCURRENTLY IF NOT EXISTS "IDX_issue_due_date" ON "issue" ("dueDate");
    `);
    await queryRunner.query(`
      CREATE INDEX CONCURRENTLY IF NOT EXISTS "IDX_issue_story_points" ON "issue" ("storyPoints");
    `);

    // Composite indexes for common queries
    await queryRunner.query(`
      CREATE INDEX CONCURRENTLY IF NOT EXISTS "IDX_issue_project_status" ON "issue" ("projectId", "status");
    `);
    await queryRunner.query(`
      CREATE INDEX CONCURRENTLY IF NOT EXISTS "IDX_issue_project_assignee" ON "issue" ("projectId", "assigneeId");
    `);
    await queryRunner.query(`
      CREATE INDEX CONCURRENTLY IF NOT EXISTS "IDX_issue_project_priority" ON "issue" ("projectId", "priority");
    `);
    await queryRunner.query(`
      CREATE INDEX CONCURRENTLY IF NOT EXISTS "IDX_issue_project_type" ON "issue" ("projectId", "type");
    `);

    // Sprint table indexes
    await queryRunner.query(`
      CREATE INDEX CONCURRENTLY IF NOT EXISTS "IDX_sprint_project_id" ON "sprint" ("projectId");
    `);
    await queryRunner.query(`
      CREATE INDEX CONCURRENTLY IF NOT EXISTS "IDX_sprint_status" ON "sprint" ("status");
    `);
    await queryRunner.query(`
      CREATE INDEX CONCURRENTLY IF NOT EXISTS "IDX_sprint_is_active" ON "sprint" ("isActive");
    `);
    await queryRunner.query(`
      CREATE INDEX CONCURRENTLY IF NOT EXISTS "IDX_sprint_start_date" ON "sprint" ("startDate");
    `);
    await queryRunner.query(`
      CREATE INDEX CONCURRENTLY IF NOT EXISTS "IDX_sprint_end_date" ON "sprint" ("endDate");
    `);

    // Board table indexes
    await queryRunner.query(`
      CREATE INDEX CONCURRENTLY IF NOT EXISTS "IDX_board_project_id" ON "board" ("projectId");
    `);
    await queryRunner.query(`
      CREATE INDEX CONCURRENTLY IF NOT EXISTS "IDX_board_type" ON "board" ("type");
    `);
    await queryRunner.query(`
      CREATE INDEX CONCURRENTLY IF NOT EXISTS "IDX_board_is_active" ON "board" ("isActive");
    `);

    // Board Column table indexes
    await queryRunner.query(`
      CREATE INDEX CONCURRENTLY IF NOT EXISTS "IDX_board_column_board_id" ON "board_column" ("boardId");
    `);
    await queryRunner.query(`
      CREATE INDEX CONCURRENTLY IF NOT EXISTS "IDX_board_column_position" ON "board_column" ("position");
    `);

    // Comment table indexes
    await queryRunner.query(`
      CREATE INDEX CONCURRENTLY IF NOT EXISTS "IDX_comment_issue_id" ON "comment" ("issueId");
    `);
    await queryRunner.query(`
      CREATE INDEX CONCURRENTLY IF NOT EXISTS "IDX_comment_user_id" ON "comment" ("userId");
    `);
    await queryRunner.query(`
      CREATE INDEX CONCURRENTLY IF NOT EXISTS "IDX_comment_created_at" ON "comment" ("createdAt");
    `);

    // Attachment table indexes
    await queryRunner.query(`
      CREATE INDEX CONCURRENTLY IF NOT EXISTS "IDX_attachment_issue_id" ON "attachment" ("issueId");
    `);
    await queryRunner.query(`
      CREATE INDEX CONCURRENTLY IF NOT EXISTS "IDX_attachment_project_id" ON "attachment" ("projectId");
    `);
    await queryRunner.query(`
      CREATE INDEX CONCURRENTLY IF NOT EXISTS "IDX_attachment_uploaded_by" ON "attachment" ("uploadedBy");
    `);
    await queryRunner.query(`
      CREATE INDEX CONCURRENTLY IF NOT EXISTS "IDX_attachment_created_at" ON "attachment" ("createdAt");
    `);

    // Project Member table indexes
    await queryRunner.query(`
      CREATE INDEX CONCURRENTLY IF NOT EXISTS "IDX_project_member_project_id" ON "project_member" ("projectId");
    `);
    await queryRunner.query(`
      CREATE INDEX CONCURRENTLY IF NOT EXISTS "IDX_project_member_user_id" ON "project_member" ("userId");
    `);
    await queryRunner.query(`
      CREATE INDEX CONCURRENTLY IF NOT EXISTS "IDX_project_member_role" ON "project_member" ("role");
    `);

    // Audit Log table indexes
    await queryRunner.query(`
      CREATE INDEX CONCURRENTLY IF NOT EXISTS "IDX_audit_log_user_id" ON "audit_log" ("userId");
    `);
    await queryRunner.query(`
      CREATE INDEX CONCURRENTLY IF NOT EXISTS "IDX_audit_log_event_type" ON "audit_log" ("eventType");
    `);
    await queryRunner.query(`
      CREATE INDEX CONCURRENTLY IF NOT EXISTS "IDX_audit_log_severity" ON "audit_log" ("severity");
    `);
    await queryRunner.query(`
      CREATE INDEX CONCURRENTLY IF NOT EXISTS "IDX_audit_log_timestamp" ON "audit_log" ("timestamp");
    `);
    await queryRunner.query(`
      CREATE INDEX CONCURRENTLY IF NOT EXISTS "IDX_audit_log_project_id" ON "audit_log" ("projectId");
    `);
    await queryRunner.query(`
      CREATE INDEX CONCURRENTLY IF NOT EXISTS "IDX_audit_log_resource_type" ON "audit_log" ("resourceType");
    `);
    await queryRunner.query(`
      CREATE INDEX CONCURRENTLY IF NOT EXISTS "IDX_audit_log_resource_id" ON "audit_log" ("resourceId");
    `);

    // Session table indexes
    await queryRunner.query(`
      CREATE INDEX CONCURRENTLY IF NOT EXISTS "IDX_session_user_id" ON "sessions" ("userId");
    `);
    await queryRunner.query(`
      CREATE INDEX CONCURRENTLY IF NOT EXISTS "IDX_session_status" ON "sessions" ("status");
    `);
    await queryRunner.query(`
      CREATE INDEX CONCURRENTLY IF NOT EXISTS "IDX_session_expires_at" ON "sessions" ("expiresAt");
    `);
    await queryRunner.query(`
      CREATE INDEX CONCURRENTLY IF NOT EXISTS "IDX_session_last_activity" ON "sessions" ("lastActivity");
    `);
    await queryRunner.query(`
      CREATE INDEX CONCURRENTLY IF NOT EXISTS "IDX_session_ip_address" ON "sessions" ("ipAddress");
    `);

    // IP Access Rule table indexes
    await queryRunner.query(`
      CREATE INDEX CONCURRENTLY IF NOT EXISTS "IDX_ip_access_rule_rule_type" ON "ip_access_rules" ("ruleType");
    `);
    await queryRunner.query(`
      CREATE INDEX CONCURRENTLY IF NOT EXISTS "IDX_ip_access_rule_status" ON "ip_access_rules" ("status");
    `);
    await queryRunner.query(`
      CREATE INDEX CONCURRENTLY IF NOT EXISTS "IDX_ip_access_rule_ip_address" ON "ip_access_rules" ("ipAddress");
    `);
    await queryRunner.query(`
      CREATE INDEX CONCURRENTLY IF NOT EXISTS "IDX_ip_access_rule_user_id" ON "ip_access_rules" ("userId");
    `);
    await queryRunner.query(`
      CREATE INDEX CONCURRENTLY IF NOT EXISTS "IDX_ip_access_rule_priority" ON "ip_access_rules" ("priority");
    `);
    await queryRunner.query(`
      CREATE INDEX CONCURRENTLY IF NOT EXISTS "IDX_ip_access_rule_is_active" ON "ip_access_rules" ("isActive");
    `);

    // Full-text search indexes
    await queryRunner.query(`
      CREATE INDEX CONCURRENTLY IF NOT EXISTS "IDX_issue_title_search" ON "issue" USING gin(to_tsvector('english', "title"));
    `);
    await queryRunner.query(`
      CREATE INDEX CONCURRENTLY IF NOT EXISTS "IDX_issue_description_search" ON "issue" USING gin(to_tsvector('english', "description"));
    `);
    await queryRunner.query(`
      CREATE INDEX CONCURRENTLY IF NOT EXISTS "IDX_project_name_search" ON "project" USING gin(to_tsvector('english', "name"));
    `);
    await queryRunner.query(`
      CREATE INDEX CONCURRENTLY IF NOT EXISTS "IDX_project_description_search" ON "project" USING gin(to_tsvector('english', "description"));
    `);
    await queryRunner.query(`
      CREATE INDEX CONCURRENTLY IF NOT EXISTS "IDX_comment_content_search" ON "comment" USING gin(to_tsvector('english', "content"));
    `);

    // Partial indexes for better performance
    await queryRunner.query(`
      CREATE INDEX CONCURRENTLY IF NOT EXISTS "IDX_issue_active_project" ON "issue" ("projectId", "status") WHERE "status" != 'CLOSED';
    `);
    await queryRunner.query(`
      CREATE INDEX CONCURRENTLY IF NOT EXISTS "IDX_sprint_active_project" ON "sprint" ("projectId", "status") WHERE "status" = 'ACTIVE';
    `);
    await queryRunner.query(`
      CREATE INDEX CONCURRENTLY IF NOT EXISTS "IDX_audit_log_recent" ON "audit_log" ("timestamp") WHERE "timestamp" > NOW() - INTERVAL '30 days';
    `);
    await queryRunner.query(`
      CREATE INDEX CONCURRENTLY IF NOT EXISTS "IDX_session_active" ON "sessions" ("userId", "lastActivity") WHERE "status" = 'active';
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Drop all indexes
    const indexes = [
      'IDX_user_email',
      'IDX_user_is_active',
      'IDX_user_is_super_admin',
      'IDX_user_created_at',
      'IDX_project_name',
      'IDX_project_status',
      'IDX_project_created_at',
      'IDX_project_updated_at',
      'IDX_issue_project_id',
      'IDX_issue_status',
      'IDX_issue_priority',
      'IDX_issue_type',
      'IDX_issue_assignee_id',
      'IDX_issue_reporter_id',
      'IDX_issue_created_at',
      'IDX_issue_updated_at',
      'IDX_issue_due_date',
      'IDX_issue_story_points',
      'IDX_issue_project_status',
      'IDX_issue_project_assignee',
      'IDX_issue_project_priority',
      'IDX_issue_project_type',
      'IDX_sprint_project_id',
      'IDX_sprint_status',
      'IDX_sprint_is_active',
      'IDX_sprint_start_date',
      'IDX_sprint_end_date',
      'IDX_board_project_id',
      'IDX_board_type',
      'IDX_board_is_active',
      'IDX_board_column_board_id',
      'IDX_board_column_position',
      'IDX_comment_issue_id',
      'IDX_comment_user_id',
      'IDX_comment_created_at',
      'IDX_attachment_issue_id',
      'IDX_attachment_project_id',
      'IDX_attachment_uploaded_by',
      'IDX_attachment_created_at',
      'IDX_project_member_project_id',
      'IDX_project_member_user_id',
      'IDX_project_member_role',
      'IDX_audit_log_user_id',
      'IDX_audit_log_event_type',
      'IDX_audit_log_severity',
      'IDX_audit_log_timestamp',
      'IDX_audit_log_project_id',
      'IDX_audit_log_resource_type',
      'IDX_audit_log_resource_id',
      'IDX_session_user_id',
      'IDX_session_status',
      'IDX_session_expires_at',
      'IDX_session_last_activity',
      'IDX_session_ip_address',
      'IDX_ip_access_rule_rule_type',
      'IDX_ip_access_rule_status',
      'IDX_ip_access_rule_ip_address',
      'IDX_ip_access_rule_user_id',
      'IDX_ip_access_rule_priority',
      'IDX_ip_access_rule_is_active',
      'IDX_issue_title_search',
      'IDX_issue_description_search',
      'IDX_project_name_search',
      'IDX_project_description_search',
      'IDX_comment_content_search',
      'IDX_issue_active_project',
      'IDX_sprint_active_project',
      'IDX_audit_log_recent',
      'IDX_session_active',
    ];

    for (const index of indexes) {
      await queryRunner.query(`DROP INDEX CONCURRENTLY IF EXISTS "${index}";`);
    }
  }
}
