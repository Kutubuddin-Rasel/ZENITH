import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import { User } from '../../users/entities/user.entity';

export enum SAMLProvider {
  ACTIVE_DIRECTORY = 'active_directory',
  OKTA = 'okta',
  AZURE_AD = 'azure_ad',
  GOOGLE_WORKSPACE = 'google_workspace',
  CUSTOM = 'custom',
}

export enum SAMLStatus {
  ACTIVE = 'active',
  INACTIVE = 'inactive',
  TESTING = 'testing',
}

@Entity({ name: 'saml_configs' })
export class SAMLConfig {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  name: string; // Display name for the configuration

  @Column({ type: 'enum', enum: SAMLProvider })
  provider: SAMLProvider;

  @Column({ type: 'enum', enum: SAMLStatus, default: SAMLStatus.INACTIVE })
  status: SAMLStatus;

  // SAML Configuration
  @Column({ type: 'text' })
  entryPoint: string; // SSO URL

  @Column({ type: 'text' })
  issuer: string; // Entity ID

  @Column({ type: 'text' })
  cert: string; // X.509 Certificate

  @Column({ type: 'text', nullable: true })
  privateCert: string; // Private certificate for signing

  @Column({ type: 'text', nullable: true })
  privateKey: string; // Private key for signing

  // Advanced Configuration
  @Column({ type: 'text', nullable: true })
  callbackUrl: string; // ACS URL

  @Column({ type: 'text', nullable: true })
  logoutUrl: string; // SLO URL

  @Column({ type: 'jsonb', nullable: true })
  attributeMapping: {
    email: string;
    firstName: string;
    lastName: string;
    username: string;
    groups: string;
  };

  @Column({ type: 'jsonb', nullable: true })
  groupMapping: {
    [key: string]: string; // SAML group -> Zenith role
  };

  // Security Settings
  @Column({ default: true })
  wantAssertionsSigned: boolean;

  @Column({ default: true })
  wantAuthnResponseSigned: boolean;

  @Column({ default: false })
  forceAuthn: boolean;

  @Column({ default: 3600 })
  acceptedClockSkewMs: number;

  @Column({ default: 28800000 }) // 8 hours
  maxAssertionAgeMs: number;

  // Metadata
  @Column({ type: 'text', nullable: true })
  metadataUrl: string;

  @Column({ type: 'text', nullable: true })
  metadata: string; // XML metadata

  // Audit
  @Column({ nullable: true })
  createdById: string;

  @ManyToOne(() => User, { nullable: true })
  @JoinColumn({ name: 'createdById' })
  createdBy: User;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;

  @Column({ type: 'timestamp', nullable: true })
  lastUsedAt: Date;

  @Column({ nullable: true })
  organizationId: string;

  @ManyToOne('Organization', { nullable: true })
  @JoinColumn({ name: 'organizationId' })
  organization: any;

  @Column({ default: 0 })
  usageCount: number;
}
