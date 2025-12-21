import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  OneToOne,
  JoinColumn,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
} from 'typeorm';
import { User } from '../../users/entities/user.entity';

@Entity({ name: 'two_factor_auth' })
export class TwoFactorAuth {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ unique: true })
  userId: string;

  @OneToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'userId' })
  user: User;

  @Column({ type: 'text' })
  secret: string; // TOTP secret key

  @Column({ default: false })
  isEnabled: boolean;

  @Column({ type: 'text', nullable: true })
  backupCodes: string; // JSON array of backup codes

  @Column({ type: 'timestamp', nullable: true })
  lastUsedAt: Date;

  // Email recovery fields
  @Column({ type: 'text', nullable: true })
  @Index('IDX_2fa_recovery_token')
  recoveryToken: string | null; // Hashed recovery token

  @Column({ type: 'timestamp', nullable: true })
  recoveryTokenExpiresAt: Date | null;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}

