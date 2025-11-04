import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  Query,
  UseGuards,
  Request,
} from '@nestjs/common';
import { SkillMatchingService } from '../services/skill-matching.service';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { RequirePermission } from '../../auth/decorators/require-permission.decorator';

@Controller('skill-matching')
@UseGuards(JwtAuthGuard)
export class SkillMatchingController {
  constructor(private skillMatchingService: SkillMatchingService) {}

  @Post('find-matches')
  @RequirePermission('resources:view')
  async findSkillMatches(
    @Body()
    body: {
      requiredSkills: {
        name: string;
        requiredLevel: number;
        weight: number;
        category: string;
      }[];
      teamId?: string;
    },
  ) {
    const matches = await this.skillMatchingService.findSkillMatches(
      body.requiredSkills,
      body.teamId,
    );

    return {
      success: true,
      data: matches,
    };
  }

  @Get('recommendations/:userId')
  @RequirePermission('resources:view')
  async getSkillRecommendations(@Param('userId') userId: string) {
    const recommendations =
      await this.skillMatchingService.recommendSkillDevelopment(userId);

    return {
      success: true,
      data: recommendations,
    };
  }

  @Get('analysis/:organizationId')
  @RequirePermission('resources:view')
  async getSkillAnalysis(@Param('organizationId') organizationId: string) {
    const analysis =
      await this.skillMatchingService.analyzeSkillSupplyDemand(organizationId);

    return {
      success: true,
      data: analysis,
    };
  }

  @Get('team-matrix/:teamId')
  @RequirePermission('resources:view')
  async getTeamSkillMatrix(@Param('teamId') teamId: string) {
    const matrix = await this.skillMatchingService.createSkillMatrix(teamId);

    return {
      success: true,
      data: matrix,
    };
  }

  @Get('dashboard')
  @RequirePermission('resources:view')
  async getSkillDashboard(@Request() req: { user: { userId: string } }) {
    const userId = req.user.userId;
    const organizationId = 'default'; // This would come from user context

    const [recommendations, analysis] = await Promise.all([
      this.skillMatchingService.recommendSkillDevelopment(userId),
      this.skillMatchingService.analyzeSkillSupplyDemand(organizationId),
    ]);

    return {
      success: true,
      data: {
        recommendations,
        analysis,
        summary: {
          totalRecommendations: recommendations.length,
          criticalSkills: recommendations.filter(
            (r) => r.priority === 'critical',
          ).length,
          skillGaps: analysis.skillGaps.length,
          emergingSkills: analysis.emergingSkills.length,
        },
      },
    };
  }

  @Get('skills')
  @RequirePermission('resources:view')
  getAvailableSkills(
    @Query('category') category?: string,
    @Query('search') search?: string,
  ) {
    // This would return available skills from the database
    const skills = [
      { name: 'JavaScript', category: 'Programming', level: 1 },
      { name: 'TypeScript', category: 'Programming', level: 1 },
      { name: 'React', category: 'Frontend', level: 1 },
      { name: 'Node.js', category: 'Backend', level: 1 },
      { name: 'PostgreSQL', category: 'Database', level: 1 },
      { name: 'Docker', category: 'DevOps', level: 1 },
      { name: 'AWS', category: 'Cloud', level: 1 },
    ];

    let filteredSkills = skills;

    if (category) {
      filteredSkills = filteredSkills.filter((s) => s.category === category);
    }

    if (search) {
      filteredSkills = filteredSkills.filter((s) =>
        s.name.toLowerCase().includes(search.toLowerCase()),
      );
    }

    return {
      success: true,
      data: filteredSkills,
    };
  }

  @Post('add-skill')
  @RequirePermission('resources:manage')
  addUserSkill(
    @Body()
    body: {
      userId: string;
      skill: string;
      proficiencyLevel: number;
      experienceYears: number;
      isVerified: boolean;
      certifications?: string;
    },
  ) {
    // This would add a skill to a user's skill matrix
    return {
      success: true,
      message: 'Skill added successfully',
      data: {
        userId: body.userId,
        skill: body.skill,
        proficiencyLevel: body.proficiencyLevel,
      },
    };
  }

  @Post('update-skill')
  @RequirePermission('resources:manage')
  updateUserSkill(
    @Body()
    body: {
      userId: string;
      skill: string;
      proficiencyLevel: number;
      experienceYears: number;
      lastUsed?: string;
    },
  ) {
    // This would update a user's skill level
    return {
      success: true,
      message: 'Skill updated successfully',
      data: {
        userId: body.userId,
        skill: body.skill,
        proficiencyLevel: body.proficiencyLevel,
      },
    };
  }

  @Get('skill-trends')
  @RequirePermission('resources:view')
  getSkillTrends(
    @Query('skill') skill?: string,
    @Query('period') period: string = '12m',
  ) {
    // This would return skill trend data
    const trends = {
      skill: skill || 'JavaScript',
      period,
      data: [
        { month: '2024-01', demand: 15, supply: 12, gap: 3 },
        { month: '2024-02', demand: 18, supply: 14, gap: 4 },
        { month: '2024-03', demand: 22, supply: 16, gap: 6 },
        // ... more data points
      ],
      trend: 'increasing',
      recommendation: 'Consider training more team members in this skill',
    };

    return {
      success: true,
      data: trends,
    };
  }
}
