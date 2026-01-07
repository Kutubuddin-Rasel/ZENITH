import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  Index,
  CreateDateColumn,
} from 'typeorm';

/**
 * Permission Entity
 *
 * Defines granular permissions in the format: resource:action
 * Examples: 'issue:create', 'project:delete', 'sprint:start'
 *
 * These are system-wide definitions that can be assigned to roles.
 */
@Entity({ name: 'permissions' })
@Index('idx_permissions_resource_action', ['resource', 'action'], {
  unique: true,
})
export class Permission {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  /**
   * The resource this permission applies to
   * Examples: 'issue', 'project', 'sprint', 'board', 'comment'
   */
  @Column({ type: 'varchar', length: 50 })
  resource: string;

  /**
   * The action allowed on the resource
   * Examples: 'create', 'read', 'update', 'delete', 'manage', 'assign'
   */
  @Column({ type: 'varchar', length: 50 })
  action: string;

  /**
   * Human-readable description of what this permission allows
   */
  @Column({ type: 'varchar', length: 255, nullable: true })
  description: string | null;

  /**
   * Display name for UI (e.g., "Create Issues")
   */
  @Column({ type: 'varchar', length: 100, nullable: true })
  displayName: string | null;

  @CreateDateColumn()
  createdAt: Date;

  /**
   * Get the permission string in format "resource:action"
   */
  get permissionString(): string {
    return `${this.resource}:${this.action}`;
  }
}
