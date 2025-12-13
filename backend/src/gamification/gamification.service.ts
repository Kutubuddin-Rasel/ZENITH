import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
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
      // Future: { slug: 'bug-hunter', ... }
    ];

    for (const def of defaults) {
      const exists = await this.achievementRepo.findOneBy({ slug: def.slug });
      if (!exists) {
        await this.achievementRepo.save(this.achievementRepo.create(def));
        this.logger.log(`Seeded achievement: ${def.name}`);
      }
    }
  }

  /**
   * Unlock an achievement for a user if not already unlocked.
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

    // Future: In-app notification or toast
    return unlocked;
  }
}
