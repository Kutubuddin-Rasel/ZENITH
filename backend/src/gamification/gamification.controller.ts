import { Controller, Get, UseGuards, Request } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { JwtRequestUser } from '../auth/types/jwt-request-user.interface';
import { GamificationService } from './gamification.service';

@Controller('gamification')
@UseGuards(JwtAuthGuard)
export class GamificationController {
  constructor(private readonly gamificationService: GamificationService) {}

  /**
   * GET /gamification/achievements
   * Returns the full catalog of available achievements.
   */
  @Get('achievements')
  async listAchievements() {
    return this.gamificationService.getAllAchievements();
  }

  /**
   * GET /gamification/my-achievements
   * Returns achievements unlocked by the authenticated user,
   * including the full Achievement entity via eager join.
   */
  @Get('my-achievements')
  async listMyAchievements(@Request() req: { user: JwtRequestUser }) {
    return this.gamificationService.getUserAchievements(req.user.userId);
  }

  /**
   * GET /gamification/xp
   * Returns the total XP accumulated by the authenticated user.
   */
  @Get('xp')
  async getMyXp(@Request() req: { user: JwtRequestUser }) {
    const totalXp = await this.gamificationService.getUserXp(req.user.userId);
    return { userId: req.user.userId, totalXp };
  }
}
