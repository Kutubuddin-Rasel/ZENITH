import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  JoinColumn,
  CreateDateColumn,
  UpdateDateColumn,
  OneToMany,
  Index,
} from 'typeorm';
import { Project } from '../../projects/entities/project.entity';
import { Organization } from '../../organizations/entities/organization.entity';
import { CustomFieldValue } from './custom-field-value.entity';

export enum CustomFieldType {
  TEXT = 'text',
  NUMBER = 'number',
  DATE = 'date',
  SELECT = 'select',
  MULTI_SELECT = 'multi_select',
}

/**
 * CustomFieldDefinition - Schema definition for custom fields
 *
 * SECURITY: Multi-tenancy enforced via organizationId
 * All queries MUST filter by organizationId for tenant isolation.
 */
@Entity('custom_field_definitions')
@Index(['organizationId', 'projectId']) // Compound index for tenant-scoped queries
export class CustomFieldDefinition {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  /**
   * Organization ID for strict tenant isolation
   * SECURITY: This field MUST be included in all queries
   */
  @Column()
  @Index()
  organizationId: string;

  @ManyToOne(() => Organization, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'organizationId' })
  organization: Organization;

  @Column()
  projectId: string;

  @ManyToOne(() => Project, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'projectId' })
  project: Project;

  @Column()
  name: string;

  @Column({ type: 'enum', enum: CustomFieldType })
  type: CustomFieldType;

  @Column({ nullable: true })
  description?: string;

  @Column({ type: 'jsonb', nullable: true })
  options?: string[]; // For SELECT and MULTI_SELECT types

  @Column({ default: false })
  isRequired: boolean;

  @OneToMany(() => CustomFieldValue, (value) => value.definition, {
    cascade: true,
  })
  values?: CustomFieldValue[];

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
