import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * CreateDynamicRBAC Migration
 *
 * CRITICAL: This migration creates the dynamic RBAC schema and seeds default roles
 * that map to the existing ProjectRole enum to ensure backward compatibility.
 *
 * Existing users will NOT lose access because:
 * 1. We create system roles with `legacyEnumValue` matching old enum values
 * 2. We update `project_members.roleId` to link to new roles based on `roleName`
 * 3. The old `roleName` column is preserved for rollback safety
 */
export class CreateDynamicRBAC1735400000000 implements MigrationInterface {
  name = 'CreateDynamicRBAC1735400000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Ensure uuid-ossp extension exists for uuid_generate_v4()
    await queryRunner.query(`CREATE EXTENSION IF NOT EXISTS "uuid-ossp";`);

    // =========================================================================
    // 1. CREATE PERMISSIONS TABLE
    // =========================================================================
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS permissions (
        id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        resource VARCHAR(50) NOT NULL,
        action VARCHAR(50) NOT NULL,
        description VARCHAR(255),
        "displayName" VARCHAR(100),
        "createdAt" TIMESTAMP DEFAULT NOW(),
        UNIQUE(resource, action)
      );
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_permissions_resource_action 
      ON permissions (resource, action);
    `);

    // =========================================================================
    // 2. CREATE ROLES TABLE
    // =========================================================================
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS roles (
        id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        name VARCHAR(100) NOT NULL,
        description VARCHAR(500),
        "organizationId" UUID,
        "isSystemRole" BOOLEAN DEFAULT FALSE,
        "legacyEnumValue" VARCHAR(50),
        color VARCHAR(7) DEFAULT '#6366f1',
        "sortOrder" INT DEFAULT 0,
        "createdAt" TIMESTAMP DEFAULT NOW(),
        "updatedAt" TIMESTAMP DEFAULT NOW()
      );
    `);

    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS idx_roles_org_name 
      ON roles ("organizationId", name);
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_roles_legacy_enum 
      ON roles ("legacyEnumValue");
    `);

    // =========================================================================
    // 3. CREATE ROLE_PERMISSIONS JOIN TABLE
    // =========================================================================
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS role_permissions (
        "roleId" UUID NOT NULL REFERENCES roles(id) ON DELETE CASCADE,
        "permissionId" UUID NOT NULL REFERENCES permissions(id) ON DELETE CASCADE,
        PRIMARY KEY ("roleId", "permissionId")
      );
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_role_permissions_role 
      ON role_permissions ("roleId");
    `);

    // =========================================================================
    // 4. ADD roleId COLUMN TO project_members (nullable initially)
    // =========================================================================
    await queryRunner.query(`
      ALTER TABLE project_members 
      ADD COLUMN IF NOT EXISTS "roleId" UUID REFERENCES roles(id) ON DELETE SET NULL;
    `);

    // =========================================================================
    // 5. SEED DEFAULT PERMISSIONS
    // =========================================================================
    console.log('Seeding default permissions...');

    await queryRunner.query(`
      INSERT INTO permissions (resource, action, description, "displayName") VALUES
      -- Issue Permissions
      ('issue', 'create', 'Create new issues in projects', 'Create Issues'),
      ('issue', 'read', 'View issues and their details', 'View Issues'),
      ('issue', 'update', 'Edit issue details and properties', 'Edit Issues'),
      ('issue', 'delete', 'Delete issues permanently', 'Delete Issues'),
      ('issue', 'assign', 'Assign issues to team members', 'Assign Issues'),
      ('issue', 'transition', 'Change issue status/workflow state', 'Transition Issues'),
      
      -- Project Permissions
      ('project', 'read', 'View project and its contents', 'View Project'),
      ('project', 'update', 'Edit project settings and details', 'Edit Project'),
      ('project', 'delete', 'Delete the entire project', 'Delete Project'),
      ('project', 'manage_members', 'Add, remove, and manage project members', 'Manage Members'),
      ('project', 'manage_settings', 'Configure project settings and integrations', 'Manage Settings'),
      
      -- Sprint Permissions
      ('sprint', 'create', 'Create new sprints', 'Create Sprints'),
      ('sprint', 'read', 'View sprint details and contents', 'View Sprints'),
      ('sprint', 'update', 'Edit sprint properties', 'Edit Sprints'),
      ('sprint', 'delete', 'Delete sprints', 'Delete Sprints'),
      ('sprint', 'start', 'Start a sprint', 'Start Sprints'),
      ('sprint', 'complete', 'Complete/close a sprint', 'Complete Sprints'),
      
      -- Board Permissions
      ('board', 'read', 'View Kanban/Scrum boards', 'View Boards'),
      ('board', 'update', 'Edit board columns and configuration', 'Edit Boards'),
      ('board', 'create', 'Create new boards', 'Create Boards'),
      ('board', 'delete', 'Delete boards', 'Delete Boards'),
      
      -- Comment Permissions
      ('comment', 'create', 'Add comments to issues', 'Add Comments'),
      ('comment', 'update', 'Edit own comments', 'Edit Comments'),
      ('comment', 'delete', 'Delete any comment', 'Delete Comments'),
      
      -- Attachment Permissions
      ('attachment', 'create', 'Upload attachments', 'Upload Attachments'),
      ('attachment', 'delete', 'Delete attachments', 'Delete Attachments'),
      
      -- Report/Analytics Permissions
      ('analytics', 'read', 'View project analytics and reports', 'View Analytics'),
      ('analytics', 'export', 'Export analytics data', 'Export Analytics')
      
      ON CONFLICT (resource, action) DO NOTHING;
    `);

    // =========================================================================
    // 6. SEED DEFAULT SYSTEM ROLES (Mapped to old ProjectRole enum)
    // =========================================================================
    console.log('Seeding default system roles...');

    await queryRunner.query(`
      INSERT INTO roles (name, description, "organizationId", "isSystemRole", "legacyEnumValue", color, "sortOrder") VALUES
      ('Project Lead', 'Full project access with administrative capabilities', NULL, TRUE, 'ProjectLead', '#dc2626', 1),
      ('Developer', 'Can create, edit, and manage issues and sprints', NULL, TRUE, 'Developer', '#2563eb', 2),
      ('QA', 'Can manage testing workflow and transition issues', NULL, TRUE, 'QA', '#7c3aed', 3),
      ('Designer', 'Can view and update design-related content', NULL, TRUE, 'Designer', '#db2777', 4),
      ('Member', 'Standard project member with basic permissions', NULL, TRUE, 'Member', '#059669', 5),
      ('Viewer', 'Read-only access to project content', NULL, TRUE, 'Viewer', '#6b7280', 6),
      ('Guest', 'Limited read-only access', NULL, TRUE, 'Guest', '#9ca3af', 7)
      ON CONFLICT DO NOTHING;
    `);

    // =========================================================================
    // 7. ASSIGN PERMISSIONS TO ROLES
    // =========================================================================
    console.log('Assigning permissions to roles...');

    // PROJECT LEAD: Gets ALL permissions
    await queryRunner.query(`
      INSERT INTO role_permissions ("roleId", "permissionId")
      SELECT r.id, p.id 
      FROM roles r
      CROSS JOIN permissions p
      WHERE r."legacyEnumValue" = 'ProjectLead'
      ON CONFLICT DO NOTHING;
    `);

    // DEVELOPER: Gets most permissions except project management
    await queryRunner.query(`
      INSERT INTO role_permissions ("roleId", "permissionId")
      SELECT r.id, p.id 
      FROM roles r
      CROSS JOIN permissions p
      WHERE r."legacyEnumValue" = 'Developer'
        AND NOT (
          p.resource = 'project' AND p.action IN ('delete', 'manage_members', 'manage_settings')
        )
        AND NOT (p.resource = 'analytics' AND p.action = 'export')
      ON CONFLICT DO NOTHING;
    `);

    // QA: Can read everything, manage issues and transitions
    await queryRunner.query(`
      INSERT INTO role_permissions ("roleId", "permissionId")
      SELECT r.id, p.id 
      FROM roles r
      CROSS JOIN permissions p
      WHERE r."legacyEnumValue" = 'QA'
        AND (
          p.action = 'read' 
          OR (p.resource = 'issue' AND p.action IN ('create', 'update', 'assign', 'transition'))
          OR (p.resource = 'comment' AND p.action IN ('create', 'update'))
          OR (p.resource = 'sprint' AND p.action IN ('start', 'complete'))
        )
      ON CONFLICT DO NOTHING;
    `);

    // DESIGNER: Can read and update issues, add comments
    await queryRunner.query(`
      INSERT INTO role_permissions ("roleId", "permissionId")
      SELECT r.id, p.id 
      FROM roles r
      CROSS JOIN permissions p
      WHERE r."legacyEnumValue" = 'Designer'
        AND (
          p.action = 'read'
          OR (p.resource = 'issue' AND p.action IN ('update', 'transition'))
          OR (p.resource = 'comment' AND p.action IN ('create', 'update'))
          OR (p.resource = 'attachment' AND p.action = 'create')
        )
      ON CONFLICT DO NOTHING;
    `);

    // MEMBER: Basic read/write on issues and comments
    await queryRunner.query(`
      INSERT INTO role_permissions ("roleId", "permissionId")
      SELECT r.id, p.id 
      FROM roles r
      CROSS JOIN permissions p
      WHERE r."legacyEnumValue" = 'Member'
        AND (
          p.action = 'read'
          OR (p.resource = 'issue' AND p.action IN ('create', 'update', 'transition'))
          OR (p.resource = 'comment' AND p.action IN ('create', 'update'))
        )
      ON CONFLICT DO NOTHING;
    `);

    // VIEWER: Read-only on all resources
    await queryRunner.query(`
      INSERT INTO role_permissions ("roleId", "permissionId")
      SELECT r.id, p.id 
      FROM roles r
      CROSS JOIN permissions p
      WHERE r."legacyEnumValue" = 'Viewer'
        AND p.action = 'read'
      ON CONFLICT DO NOTHING;
    `);

    // GUEST: Limited read (only issues and projects)
    await queryRunner.query(`
      INSERT INTO role_permissions ("roleId", "permissionId")
      SELECT r.id, p.id 
      FROM roles r
      CROSS JOIN permissions p
      WHERE r."legacyEnumValue" = 'Guest'
        AND p.action = 'read'
        AND p.resource IN ('issue', 'project', 'board')
      ON CONFLICT DO NOTHING;
    `);

    // =========================================================================
    // 8. MIGRATE EXISTING project_members TO USE roleId
    // =========================================================================
    console.log('Migrating existing project members to use roleId...');

    // Link existing members to new roles based on their roleName
    // NOTE: roleName is a PostgreSQL enum, so we cast it to text for comparison
    await queryRunner.query(`
      UPDATE project_members pm
      SET "roleId" = r.id
      FROM roles r
      WHERE pm."roleName"::text = r."legacyEnumValue"
        AND pm."roleId" IS NULL;
    `);

    console.log('Migrated existing project members to new role system');

    // =========================================================================
    // 9. SUMMARY
    // =========================================================================
    console.log('✅ Dynamic RBAC migration completed successfully');
    console.log('   - Created permissions table with 27 permissions');
    console.log('   - Created roles table with 7 system roles');
    console.log('   - Created role_permissions join table');
    console.log('   - Added roleId to project_members');
    console.log('   - Migrated existing members to new roleId');
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    console.log('Rolling back Dynamic RBAC migration...');

    // Remove roleId from project_members (keeping roleName for compatibility)
    await queryRunner.query(`
      ALTER TABLE project_members DROP COLUMN IF EXISTS "roleId";
    `);

    // Drop role_permissions join table
    await queryRunner.query(`DROP TABLE IF EXISTS role_permissions;`);

    // Drop roles table
    await queryRunner.query(`DROP TABLE IF EXISTS roles;`);

    // Drop permissions table
    await queryRunner.query(`DROP TABLE IF EXISTS permissions;`);

    console.log('✅ Dynamic RBAC rollback completed');
  }
}
