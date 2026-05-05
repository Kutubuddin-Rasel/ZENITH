import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { Achievement } from './entities/achievement.entity';
import { UserAchievement } from './entities/user-achievement.entity';

@Injectable()
export class GamificationService implements OnModuleInit {
  private readonly logger = new Logger(GamificationService.name);

  constructor(
    @InjectRepository(Achievement)
    private achievementRepo: Repository<Achievement>,
    @InjectRepository(UserAchievement)
    private userAchievementRepo: Repository<UserAchievement>,
    private readonly eventEmitter: EventEmitter2,
  ) {}

  async onModuleInit() {
    await this.seedAchievements();
  }

  private async seedAchievements() {
    const defaults = [
      {
        slug: 'first-sprint',
        name: 'First Sprint',
        description: 'Completed your first sprint',
        icon: 'trophy',
        xp: 100,
      },
      {
        slug: 'first-issue',
        name: 'First Issue',
        description: 'Created your first issue',
        icon: 'ticket',
        xp: 50,
      },
      {
        slug: 'bug-hunter',
        name: 'Bug Hunter',
        description: 'Resolved 1 bug',
        icon: 'bug',
        xp: 75,
      },
      {
        slug: 'early-bird',
        name: 'Early Bird',
        description: 'Completed a task before its due date',
        icon: 'clock',
        xp: 60,
      },
      {
        slug: 'collaborator',
        name: 'Collaborator',
        description: 'Left your first comment on an issue',
        icon: 'message-circle',
        xp: 40,
      },
      {
        slug: 'team-player',
        name: 'Team Player',
        description: 'Joined your first project as a member',
        icon: 'users',
        xp: 80,
      },
    ];

    for (const def of defaults) {
      const exists = await this.achievementRepo.findOneBy({ slug: def.slug });
      if (!exists) {
        await this.achievementRepo.save(this.achievementRepo.create(def));
        this.logger.log(`Seeded achievement: ${def.name}`);
      }
    }
  }

  // ── Query Methods (Controller Layer) ────────────────────────────

  /**
   * Return the full achievement catalog.
   */
  async getAllAchievements(): Promise<Achievement[]> {
    return this.achievementRepo.find({ order: { xp: 'ASC' } });
  }

  /**
   * Return achievements unlocked by a specific user,
   * with the Achievement entity eagerly joined.
   */
  async getUserAchievements(userId: string): Promise<UserAchievement[]> {
    return this.userAchievementRepo.find({
      where: { userId },
      relations: ['achievement'],
      order: { unlockedAt: 'DESC' },
    });
  }

  /**
   * Return total XP for a user by summing their unlocked achievement XP values.
   */
  async getUserXp(userId: string): Promise<number> {
    const result = await this.userAchievementRepo
      .createQueryBuilder('ua')
      .innerJoin('ua.achievement', 'a')
      .select('COALESCE(SUM(a.xp), 0)', 'totalXp')
      .where('ua.userId = :userId', { userId })
      .getRawOne();

    return parseInt(result?.totalXp ?? '0', 10);
  }

  // ── Core Unlock Logic ───────────────────────────────────────────

  /**
   * Unlock an achievement for a user if not already unlocked.
   * Emits 'achievement.unlocked' for real-time notification delivery.
   */
  async unlockAchievement(
    userId: string,
    slug: string,
  ): Promise<UserAchievement | null> {
    const achievement = await this.achievementRepo.findOneBy({ slug });
    if (!achievement) {
      this.logger.warn(`Achievement slug not found: ${slug}`);
      return null;
    }

    const existing = await this.userAchievementRepo.findOneBy({
      userId,
      achievementId: achievement.id,
    });

    if (existing) {
      return null; // Already unlocked
    }

    const unlocked = this.userAchievementRepo.create({
      userId,
      achievementId: achievement.id,
    });
    await this.userAchievementRepo.save(unlocked);
    this.logger.log(`User ${userId} unlocked achievement: ${achievement.name}`);

    // Emit event for real-time notification delivery via WebSocket
    this.eventEmitter.emit('achievement.unlocked', {
      userId,
      achievement: {
        id: achievement.id,
        slug: achievement.slug,
        name: achievement.name,
        description: achievement.description,
        icon: achievement.icon,
        xp: achievement.xp,
      },
      unlockedAt: unlocked.unlockedAt ?? new Date(),
    });

    return unlocked;
  }
}
