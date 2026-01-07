import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToMany,
  JoinTable,
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
 * BACKWARD COMPATIBILITY:
 * - System roles have `legacyEnumValue` that maps to the old ProjectRole enum
 * - This allows seamless migration from hardcoded enums to database-backed roles
 */
@Entity({ name: 'roles' })
@Index('idx_roles_org_name', ['organizationId', 'name'], { unique: true })
@Index('idx_roles_legacy_enum', ['legacyEnumValue'])
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

  /**
   * Permissions assigned to this role
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

  /**
   * Check if this role has a specific permission
   */
  hasPermission(resource: string, action: string): boolean {
    return (
      this.permissions?.some(
        (p) => p.resource === resource && p.action === action,
      ) ?? false
    );
  }

  /**
   * Get all permission strings for this role
   */
  getPermissionStrings(): string[] {
    return this.permissions?.map((p) => p.permissionString) ?? [];
  }
}
