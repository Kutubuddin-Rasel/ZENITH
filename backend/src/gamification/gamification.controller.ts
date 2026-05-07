import {
  Controller,
  Get,
  UseGuards,
  Request,
  Query,
  DefaultValuePipe,
  ParseIntPipe,
} from '@nestjs/common';
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
   * Reads from Redis (O(1)) with SQL fallback.
   */
  @Get('xp')
  async getMyXp(@Request() req: { user: JwtRequestUser }) {
    const totalXp = await this.gamificationService.getUserXp(req.user.userId);
    return { userId: req.user.userId, totalXp };
  }

  /**
   * GET /gamification/leaderboard?limit=10
   * Returns the top N users by XP from the Redis sorted set.
   * Includes the requesting user's rank even if not in top N.
   */
  @Get('leaderboard')
  async getLeaderboard(
    @Request() req: { user: JwtRequestUser },
    @Query('limit', new DefaultValuePipe(10), ParseIntPipe) limit: number,
  ) {
    return this.gamificationService.getLeaderboard(limit, req.user.userId);
  }
}
