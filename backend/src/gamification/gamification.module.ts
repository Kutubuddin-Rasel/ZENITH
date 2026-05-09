import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Achievement } from './entities/achievement.entity';
import { UserAchievement } from './entities/user-achievement.entity';
import { AchievementProgress } from './entities/achievement-progress.entity';
import { GamificationService } from './gamification.service';
import { GamificationController } from './gamification.controller';
import { GamificationListener } from './listeners/gamification.listener';
import { OnboardingGamificationListener } from './listeners/onboarding-gamification.listener';

import { CacheModule } from '../cache/cache.module';
@Module({
  imports: [
    TypeOrmModule.forFeature([
      Achievement,
      UserAchievement,
      AchievementProgress,
    ]),
    CacheModule,
  ],
  controllers: [GamificationController],
  providers: [
    GamificationService,
    GamificationListener,
    OnboardingGamificationListener,
  ],
  exports: [GamificationService],
})
export class GamificationModule {}
