import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToOne,
  JoinColumn,
  Index,
} from 'typeorm';
import { User } from '../../users/entities/user.entity';
import { InviteStatus } from '../enums/invite-status.enum';
// import { Project } from '../../projects/entities/project.entity';

@Entity({ name: 'invites' })
@Index('IDX_invites_project_email_status', [
  'projectId',
  'inviteeEmail',
  'status',
])
export class Invite {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ unique: true })
  token: string; // secure random string

  @Column({ nullable: true })
  inviteeId: string | null;
  @ManyToOne(() => User, { nullable: true })
  @JoinColumn({ name: 'inviteeId' })
  invitee: User | null;

  @Column({ nullable: true })
  inviteeEmail: string | null;

  @Column()
  inviterId: string;
  @ManyToOne(() => User)
  @JoinColumn({ name: 'inviterId' })
  inviter: User;

  @Column()
  projectId: string;

  @Column()
  role: string;

  @Column({ type: 'timestamp', nullable: true })
  expiresAt?: Date; // optional expiry date/time

  @Column({ type: 'varchar', default: InviteStatus.Pending })
  status: InviteStatus;

  @Column({ type: 'timestamp', nullable: true })
  respondedAt?: Date;

  @Column({ nullable: true })
  reason?: string;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
