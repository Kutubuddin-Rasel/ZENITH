import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  Index,
  UpdateDateColumn,
  CreateDateColumn,
} from 'typeorm';

/**
 * Tracks multi-step achievement progress per user.
 *
 * Example: "Bug Hunter X" requires resolving 10 bugs.
 * Each bug resolution calls incrementProgress('bug-hunter-x', 1, 10).
 * The unique constraint on (userId, achievementSlug) ensures one row per
 * user-achievement pair, and the atomic UPSERT prevents race conditions.
 */
@Entity('achievement_progress')
@Index(['userId', 'achievementSlug'], { unique: true })
export class AchievementProgress {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  userId: string;

  @Column({ length: 128 })
  achievementSlug: string;

  @Column({ type: 'int', default: 0 })
  currentCount: number;

  @Column({ type: 'int' })
  targetCount: number;

  @Column({ type: 'boolean', default: false })
  completed: boolean;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
