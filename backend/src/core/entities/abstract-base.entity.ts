/**
 * AbstractBaseEntity - Foundation for all core entities
 *
 * Provides:
 * - UUID primary key
 * - Optimistic locking via @VersionColumn
 * - Audit fields (createdAt, updatedAt, createdBy, updatedBy)
 * - Tenant binding (organizationId)
 *
 * All core entities should extend this class to inherit these standard columns.
 */

import {
  PrimaryGeneratedColumn,
  VersionColumn,
  CreateDateColumn,
  UpdateDateColumn,
  Column,
  Index,
} from 'typeorm';

export abstract class AbstractBaseEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  /**
   * Optimistic Locking: Auto-incremented on each update
   *
   * When updating, pass `expectedVersion` in the DTO.
   * If the DB version != expectedVersion, a 409 Conflict is thrown.
   * This prevents "last-write-wins" data loss.
   */
  @VersionColumn()
  version: number;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;

  /**
   * Audit: Who created this entity
   * Nullable for system-created entities
   */
  @Column({ type: 'uuid', nullable: true })
  @Index()
  createdBy?: string;

  /**
   * Audit: Who last updated this entity
   * Updated on every modification
   */
  @Column({ type: 'uuid', nullable: true })
  updatedBy?: string;

  /**
   * Tenant isolation: Organization this entity belongs to
   *
   * This is the key field for multi-tenant isolation.
   * TenantRepository automatically filters by this field.
   *
   * Nullable for:
   * - Global entities (templates, system config)
   * - Entities created before multi-tenancy was added
   */
  @Column({ type: 'uuid', nullable: true })
  @Index()
  organizationId?: string;
}
