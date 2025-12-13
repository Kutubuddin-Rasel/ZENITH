import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  JoinColumn,
  Index,
} from 'typeorm';
import { Organization } from '../../organizations/entities/organization.entity';

@Entity({ name: 'users' })
@Index('IDX_user_email', ['email'])
@Index('IDX_user_is_active', ['isActive'])
@Index('IDX_user_is_super_admin', ['isSuperAdmin'])
// @Index('IDX_user_name_search') // Requires pg_trgm
// @Index('IDX_user_email_search') // Requires pg_trgm
export class User {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ unique: true })
  email: string;

  @Column()
  passwordHash: string;

  @Column()
  name: string;

  @Column({ default: false })
  isSuperAdmin: boolean;

  @Column({ default: true })
  isActive: boolean;

  @Column({ nullable: true })
  defaultRole: string; // e.g. 'Developer', 'QA', etc.

  @Column({ default: false })
  mustChangePassword: boolean; // Force password change on first login

  @Column({ nullable: true })
  avatarUrl?: string;

  @Column({ type: 'varchar', nullable: true, select: false })
  hashedRefreshToken?: string | null;

  // Password hashing version for lazy migration
  // 1 = bcrypt 10 rounds (legacy), 2 = bcrypt 12, 3 = argon2id
  @Column({ default: 1 })
  passwordVersion: number;

  // Organization relationship
  @Column({ type: 'uuid', nullable: true })
  organizationId?: string;

  @ManyToOne(() => Organization, { nullable: true })
  @JoinColumn({ name: 'organizationId' })
  organization?: Organization;
}
