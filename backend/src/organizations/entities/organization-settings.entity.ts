/**
 * Organization Settings Entity
 *
 * ARCHITECTURE:
 * Separated from Organization entity following SRP:
 * - Organization: identity, billing, slug (referenced by 10+ modules)
 * - OrganizationSettings: admin customization (only loaded on settings page)
 *
 * RELATIONSHIP: 1-to-1 with Organization (CASCADE delete)
 *
 * PATTERN: "getOrCreate" — settings are lazily created on first access
 * with sensible defaults, so no migration backfill is needed.
 *
 * @see OrganizationSettingsService for the getOrCreate pattern
 */

import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  OneToOne,
  JoinColumn,
  CreateDateColumn,
  UpdateDateColumn,
} from 'typeorm';
import { Organization } from './organization.entity';

// =============================================================================
// ENUMS
// =============================================================================

/**
 * Default visibility for new projects created within the organization.
 *
 * PUBLIC   — Visible to anyone (open-source orgs)
 * INTERNAL — Visible to all organization members
 * PRIVATE  — Visible only to project members (default, most restrictive)
 */
export enum ProjectVisibility {
  PUBLIC = 'PUBLIC',
  INTERNAL = 'INTERNAL',
  PRIVATE = 'PRIVATE',
}

// =============================================================================
// ENTITY
// =============================================================================

@Entity('organization_settings')
export class OrganizationSettings {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ unique: true })
  organizationId: string;

  @OneToOne(() => Organization, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'organizationId' })
  organization: Organization;

  // ---------------------------------------------------------------------------
  // Branding
  // ---------------------------------------------------------------------------

  /** Organization logo URL (S3/CDN path or external URL) */
  @Column({ type: 'varchar', nullable: true })
  logoUrl: string | null;

  // ---------------------------------------------------------------------------
  // Regional Settings
  // ---------------------------------------------------------------------------

  /**
   * IANA timezone identifier (e.g., 'America/New_York', 'Asia/Dhaka').
   * Used for scheduling, reports, and deadline calculations.
   */
  @Column({ type: 'varchar', default: 'UTC' })
  timezone: string;

  // ---------------------------------------------------------------------------
  // Project Defaults
  // ---------------------------------------------------------------------------

  /** Default visibility for new projects */
  @Column({
    type: 'enum',
    enum: ProjectVisibility,
    default: ProjectVisibility.PRIVATE,
  })
  defaultProjectVisibility: ProjectVisibility;

  // ---------------------------------------------------------------------------
  // Access Control
  // ---------------------------------------------------------------------------

  /**
   * Allowed email domains for invitations.
   * Empty array = no restriction (any email can be invited).
   * Non-empty = only emails matching these domains are allowed.
   *
   * Example: ['acme.com', 'acme.co.uk']
   *
   * PostgreSQL stores this as text[] for efficient ARRAY operations.
   */
  @Column('text', { array: true, default: '{}' })
  allowedEmailDomains: string[];

  /**
   * Maximum number of members allowed in the organization.
   * Used for seat-based billing enforcement.
   * Default: 50 (free tier). Updated by Stripe webhook on plan change.
   */
  @Column({ type: 'int', default: 50 })
  maxMembers: number;

  // ---------------------------------------------------------------------------
  // Timestamps
  // ---------------------------------------------------------------------------

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
