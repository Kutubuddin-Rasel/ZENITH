import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToMany,
  ManyToOne,
  OneToMany,
  JoinTable,
  JoinColumn,
  Index,
  CreateDateColumn,
  UpdateDateColumn,
} from 'typeorm';
import { Permission } from './permission.entity';

/**
 * Role Entity
 *
 * Defines roles that can be assigned to project members.
 * Supports both system-wide roles and organization-specific custom roles.
 *
 * PERMISSION INHERITANCE (Phase 4):
 * - Roles can have a parentRole, from which they inherit all permissions
 * - Inheritance is recursive: Role A → Parent B → Grandparent C
 * - Final permissions = own permissions + all ancestor permissions
 * - Max inheritance depth: 10 levels (cycle detection enforced)
 *
 * BACKWARD COMPATIBILITY:
 * - System roles have `legacyEnumValue` that maps to the old ProjectRole enum
 * - This allows seamless migration from hardcoded enums to database-backed roles
 */
@Entity({ name: 'roles' })
@Index('idx_roles_org_name', ['organizationId', 'name'], { unique: true })
@Index('idx_roles_legacy_enum', ['legacyEnumValue'])
@Index('idx_roles_parent', ['parentRoleId'])
export class Role {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  /**
   * Role name (e.g., 'Project Lead', 'Developer', 'Intern')
   */
  @Column({ type: 'varchar', length: 100 })
  name: string;

  /**
   * Human-readable description of the role
   */
  @Column({ type: 'varchar', length: 500, nullable: true })
  description: string | null;

  /**
   * Organization this role belongs to
   * NULL = system-wide role (available to all organizations)
   */
  @Column({ type: 'uuid', nullable: true })
  organizationId: string | null;

  /**
   * System roles cannot be deleted or have core permissions removed
   * These are the default roles that map to the old ProjectRole enum
   */
  @Column({ type: 'boolean', default: false })
  isSystemRole: boolean;

  /**
   * Maps to the old ProjectRole enum value for backward compatibility
   * Allows existing project_members.roleName to be linked to new roleId
   *
   * Values: 'ProjectLead', 'Developer', 'QA', 'Designer', 'Viewer', 'Guest', 'Member'
   */
  @Column({ type: 'varchar', length: 50, nullable: true })
  legacyEnumValue: string | null;

  /**
   * Color for UI display (hex code)
   */
  @Column({ type: 'varchar', length: 7, nullable: true, default: '#6366f1' })
  color: string | null;

  /**
   * Sort order for display in role selection dropdowns
   */
  @Column({ type: 'int', default: 0 })
  sortOrder: number;

  // ===========================================================================
  // PERMISSION INHERITANCE (Phase 4)
  // ===========================================================================

  /**
   * Parent role ID for permission inheritance
   * NULL = no parent (top-level role)
   *
   * Example hierarchy:
   * - SuperAdmin (no parent) → has all permissions
   * - Admin (parent: SuperAdmin) → inherits SuperAdmin permissions
   * - Developer (parent: Admin) → inherits Admin + SuperAdmin permissions
   */
  @Column({ type: 'uuid', nullable: true })
  parentRoleId: string | null;

  /**
   * Parent role relationship
   * Used for recursive permission inheritance
   */
  @ManyToOne(() => Role, (role) => role.childRoles, {
    nullable: true,
    onDelete: 'SET NULL',
  })
  @JoinColumn({ name: 'parentRoleId' })
  parentRole: Role | null;

  /**
   * Child roles that inherit from this role
   * Inverse side of parentRole relationship
   */
  @OneToMany(() => Role, (role) => role.parentRole)
  childRoles: Role[];

  // ===========================================================================
  // PERMISSIONS
  // ===========================================================================

  /**
   * Permissions assigned directly to this role (not inherited)
   * Uses ManyToMany relationship with automatic join table
   */
  @ManyToMany(() => Permission, { eager: true })
  @JoinTable({
    name: 'role_permissions',
    joinColumn: { name: 'roleId', referencedColumnName: 'id' },
    inverseJoinColumn: { name: 'permissionId', referencedColumnName: 'id' },
  })
  permissions: Permission[];

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;

  // ===========================================================================
  // HELPER METHODS
  // ===========================================================================

  /**
   * Check if this role has a specific permission (direct only, not inherited)
   */
  hasPermission(resource: string, action: string): boolean {
    return (
      this.permissions?.some(
        (p) => p.resource === resource && p.action === action,
      ) ?? false
    );
  }

  /**
   * Get all direct permission strings for this role (not inherited)
   */
  getPermissionStrings(): string[] {
    return this.permissions?.map((p) => p.permissionString) ?? [];
  }

  /**
   * Check if this role has a parent (is part of a hierarchy)
   */
  hasParent(): boolean {
    return this.parentRoleId !== null;
  }
}
