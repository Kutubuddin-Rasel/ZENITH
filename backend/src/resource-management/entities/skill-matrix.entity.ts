import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  CreateDateColumn,
  UpdateDateColumn,
  Check,
  Unique,
} from 'typeorm';
import { User } from '../../users/entities/user.entity';

@Entity('skill_matrix')
@Unique(['user', 'skill'])
@Check('"proficiencyLevel" >= 1 AND "proficiencyLevel" <= 5')
export class SkillMatrix {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  user: User;

  @Column('varchar', { length: 100 })
  skill: string;

  @Column('int')
  proficiencyLevel: number; // 1-5 scale

  @Column('int', { default: 0 })
  experienceYears: number;

  @Column('boolean', { default: false })
  isVerified: boolean;

  @Column('date', { nullable: true })
  lastUsed: Date;

  @Column('text', { nullable: true })
  certifications: string;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;

  // @Index(['skill', 'proficiencyLevel'])
}
