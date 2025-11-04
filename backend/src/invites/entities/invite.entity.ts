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
// import { Project } from '../../projects/entities/project.entity';

@Entity({ name: 'invites' })
export class Invite {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ unique: true })
  token: string; // secure random string

  @Column()
  inviteeId: string;
  @ManyToOne(() => User)
  @JoinColumn({ name: 'inviteeId' })
  invitee: User;

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

  @Column({ default: 'Pending' })
  status: 'Pending' | 'Accepted' | 'Rejected' | 'Revoked';

  @Column({ type: 'timestamp', nullable: true })
  respondedAt?: Date;

  @Column({ nullable: true })
  reason?: string;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
