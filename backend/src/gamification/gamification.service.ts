import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { Achievement } from './entities/achievement.entity';
import { UserAchievement } from './entities/user-achievement.entity';
import { AchievementProgress } from './entities/achievement-progress.entity';
import { CacheService } from '../cache/cache.service';

/** Redis sorted-set key for the XP leaderboard */
const LEADERBOARD_KEY = 'leaderboard:xp';
const LEADERBOARD_NS = 'gamification';

@Injectable()
export class GamificationService implements OnModuleInit {
  private readonly logger = new Logger(GamificationService.name);

  constructor(
    @InjectRepository(Achievement)
    private achievementRepo: Repository<Achievement>,
    @InjectRepository(UserAchievement)
    private userAchievementRepo: Repository<UserAchievement>,
    @InjectRepository(AchievementProgress)
    private progressRepo: Repository<AchievementProgress>,
    private readonly eventEmitter: EventEmitter2,
    private readonly dataSource: DataSource,
    private readonly cacheService: CacheService,
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
      {
        slug: 'bug-hunter-x',
        name: 'Bug Hunter X',
        description: 'Resolved 10 bugs',
        icon: 'shield',
        xp: 500,
      },
      {
        slug: 'prolific-creator',
        name: 'Prolific Creator',
        description: 'Created 25 issues',
        icon: 'layers',
        xp: 300,
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
   * Falls back to SQL if Redis is unavailable.
   */
  async getUserXp(userId: string): Promise<number> {
    // Try Redis first (O(1) lookup)
    const cachedXp = await this.cacheService.zscore(LEADERBOARD_KEY, userId, {
      namespace: LEADERBOARD_NS,
    });
    if (cachedXp !== null) {
      return cachedXp;
    }

    // SQL fallback
    return this.computeXpFromSql(userId);
  }

  /**
   * Get the XP leaderboard from Redis sorted set.
   * Falls back to SQL aggregate if Redis is unavailable.
   *
   * @param limit - Number of top entries to return (default 10, max 100)
   * @param userId - Optional: include the requesting user's rank even if not in top N
   */
  async getLeaderboard(
    limit = 10,
    userId?: string,
  ): Promise<{
    entries: { userId: string; xp: number; rank: number }[];
    userRank?: { userId: string; xp: number; rank: number } | null;
  }> {
    const safeLimit = Math.min(Math.max(limit, 1), 100);

    // Try Redis (O(log N + M))
    const redisEntries = await this.cacheService.zrevrangeWithScores(
      LEADERBOARD_KEY,
      0,
      safeLimit - 1,
      { namespace: LEADERBOARD_NS },
    );

    if (redisEntries.length > 0) {
      const entries = redisEntries.map((entry, index) => ({
        userId: entry.member,
        xp: entry.score,
        rank: index + 1,
      }));

      // Fetch requesting user's rank if not in top N
      let userRank: { userId: string; xp: number; rank: number } | null = null;
      if (userId) {
        const inTop = entries.find((e) => e.userId === userId);
        if (!inTop) {
          const [rank, score] = await Promise.all([
            this.cacheService.zrevrank(LEADERBOARD_KEY, userId, {
              namespace: LEADERBOARD_NS,
            }),
            this.cacheService.zscore(LEADERBOARD_KEY, userId, {
              namespace: LEADERBOARD_NS,
            }),
          ]);
          if (rank !== null && score !== null) {
            userRank = { userId, xp: score, rank: rank + 1 };
          }
        } else {
          userRank = inTop;
        }
      }

      return { entries, userRank };
    }

    // SQL fallback: aggregate from user_achievements
    return this.getLeaderboardFromSql(safeLimit, userId);
  }

  // ── Progress Tracking (Stateful Multi-Step Achievements) ────────

  /**
   * Atomically increment progress toward a multi-step achievement.
   *
   * Concurrency Strategy: PostgreSQL atomic UPSERT via
   * INSERT ... ON CONFLICT DO UPDATE SET currentCount = currentCount + :amount
   * RETURNING currentCount.
   *
   * This is a single atomic statement — no explicit locks or transactions needed.
   * The RETURNING clause provides the post-increment value to check against the
   * target threshold. If the threshold is met, unlockAchievement() is called.
   *
   * @param userId - The user making progress
   * @param slug - Achievement slug (e.g., 'bug-hunter-x')
   * @param amount - Increment amount (default: 1)
   * @param target - Target count required for unlock (e.g., 10)
   * @returns The new current count, or null if already completed
   */
  async incrementProgress(
    userId: string,
    slug: string,
    amount = 1,
    target: number,
  ): Promise<number | null> {
    // Atomic upsert: INSERT or UPDATE in one statement
    const result = await this.dataSource.query(
      `INSERT INTO achievement_progress ("userId", "achievementSlug", "currentCount", "targetCount", "completed")
       VALUES ($1, $2, $3, $4, false)
       ON CONFLICT ("userId", "achievementSlug")
       DO UPDATE SET
         "currentCount" = CASE
           WHEN achievement_progress."completed" = true THEN achievement_progress."currentCount"
           ELSE achievement_progress."currentCount" + $3
         END,
         "updatedAt" = CURRENT_TIMESTAMP
       RETURNING "currentCount", "completed"`,
      [userId, slug, amount, target],
    );

    const row = result[0];
    if (!row || row.completed) {
      return null; // Already completed, no further increments
    }

    const newCount: number = row.currentCount;

    // Check if threshold is met
    if (newCount >= target) {
      // Mark as completed atomically to prevent re-triggering
      await this.dataSource.query(
        `UPDATE achievement_progress
         SET "completed" = true, "updatedAt" = CURRENT_TIMESTAMP
         WHERE "userId" = $1 AND "achievementSlug" = $2 AND "completed" = false`,
        [userId, slug],
      );

      // Trigger unlock
      await this.unlockAchievement(userId, slug);
    }

    return newCount;
  }

  // ── Core Unlock Logic ───────────────────────────────────────────

  /**
   * Unlock an achievement for a user if not already unlocked.
   * Emits 'achievement.unlocked' for real-time notification delivery.
   * Synchronizes the user's total XP to the Redis leaderboard.
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

    // Sync XP to Redis leaderboard (fire-and-forget, non-blocking)
    this.syncUserXpToRedis(userId).catch((err) =>
      this.logger.error(`Failed to sync XP to Redis for ${userId}: ${err.message}`),
    );

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

  // ── Redis Leaderboard Sync ──────────────────────────────────────

  /**
   * Recompute total XP from SQL and write to Redis sorted set.
   * Called after every achievement unlock to keep the leaderboard current.
   */
  private async syncUserXpToRedis(userId: string): Promise<void> {
    const totalXp = await this.computeXpFromSql(userId);
    await this.cacheService.zadd(LEADERBOARD_KEY, totalXp, userId, {
      namespace: LEADERBOARD_NS,
    });
    this.logger.debug(`Synced leaderboard: user=${userId} xp=${totalXp}`);
  }

  /**
   * Compute total XP from SQL (source of truth).
   */
  private async computeXpFromSql(userId: string): Promise<number> {
    const result = await this.userAchievementRepo
      .createQueryBuilder('ua')
      .innerJoin('ua.achievement', 'a')
      .select('COALESCE(SUM(a.xp), 0)', 'totalXp')
      .where('ua.userId = :userId', { userId })
      .getRawOne();

    return parseInt(result?.totalXp ?? '0', 10);
  }

  /**
   * SQL fallback for leaderboard when Redis is unavailable.
   */
  private async getLeaderboardFromSql(
    limit: number,
    userId?: string,
  ): Promise<{
    entries: { userId: string; xp: number; rank: number }[];
    userRank?: { userId: string; xp: number; rank: number } | null;
  }> {
    const rows: { userId: string; totalXp: string }[] =
      await this.userAchievementRepo
        .createQueryBuilder('ua')
        .innerJoin('ua.achievement', 'a')
        .select('ua.userId', 'userId')
        .addSelect('SUM(a.xp)', 'totalXp')
        .groupBy('ua.userId')
        .orderBy('"totalXp"', 'DESC')
        .limit(limit)
        .getRawMany();

    const entries = rows.map((row, index) => ({
      userId: row.userId,
      xp: parseInt(row.totalXp, 10),
      rank: index + 1,
    }));

    let userRank: { userId: string; xp: number; rank: number } | null = null;
    if (userId) {
      const inTop = entries.find((e) => e.userId === userId);
      if (inTop) {
        userRank = inTop;
      } else {
        const xp = await this.computeXpFromSql(userId);
        if (xp > 0) {
          // Count users with higher XP to determine rank
          const result = await this.userAchievementRepo
            .createQueryBuilder('ua')
            .innerJoin('ua.achievement', 'a')
            .select('ua.userId')
            .addSelect('SUM(a.xp)', 'totalXp')
            .groupBy('ua.userId')
            .having('SUM(a.xp) > :xp', { xp })
            .getRawMany();
          userRank = { userId, xp, rank: result.length + 1 };
        }
      }
    }

    return { entries, userRank };
  }
}
