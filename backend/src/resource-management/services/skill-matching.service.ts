import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, In } from 'typeorm';
import { SkillMatrix } from '../entities/skill-matrix.entity';
import { User } from '../../users/entities/user.entity';

export interface Skill {
  name: string;
  requiredLevel: number;
  weight: number; // Importance weight (0-1)
  category: string;
}

export interface SkillMatch {
  userId: string;
  userName: string;
  skill: string;
  userLevel: number;
  requiredLevel: number;
  matchScore: number; // 0-1
  experienceYears: number;
  isVerified: boolean;
  lastUsed: Date | null;
  certifications: string[];
}

export interface SkillRecommendation {
  userId: string;
  userName: string;
  skill: string;
  currentLevel: number;
  targetLevel: number;
  learningPath: {
    step: string;
    description: string;
    estimatedTime: number; // hours
    resources: string[];
  }[];
  priority: 'low' | 'medium' | 'high' | 'critical';
  expectedImpact: string;
}

export interface SkillAnalysis {
  organizationId: string;
  skillSupply: {
    skill: string;
    totalUsers: number;
    averageLevel: number;
    distribution: Record<number, number>; // level -> count
  }[];
  skillDemand: {
    skill: string;
    requiredCount: number;
    averageRequiredLevel: number;
    projects: string[];
  }[];
  skillGaps: {
    skill: string;
    gap: number; // demand - supply
    severity: 'low' | 'medium' | 'high' | 'critical';
    recommendations: string[];
  }[];
  emergingSkills: {
    skill: string;
    growthRate: number;
    adoptionRate: number;
    futureDemand: number;
  }[];
}

export interface TeamSkillMatrix {
  teamId: string;
  teamName: string;
  skills: {
    skill: string;
    teamAverage: number;
    coverage: number; // percentage of team members with this skill
    strongestMember: {
      userId: string;
      userName: string;
      level: number;
    };
    weakestMember: {
      userId: string;
      userName: string;
      level: number;
    };
  }[];
  recommendations: string[];
}

@Injectable()
export class SkillMatchingService {
  constructor(
    @InjectRepository(SkillMatrix)
    private skillRepo: Repository<SkillMatrix>,
    @InjectRepository(User)
    private userRepo: Repository<User>,
  ) {}

  async findSkillMatches(
    requiredSkills: Skill[],
    teamId?: string,
  ): Promise<SkillMatch[]> {
    const skillNames = requiredSkills.map((s) => s.name);
    const skillMatrix = await this.skillRepo.find({
      where: {
        skill: In(skillNames),
        ...(teamId && { user: { id: teamId } }),
      },
      relations: ['user'],
    });

    const matches: SkillMatch[] = [];

    for (const skillRecord of skillMatrix) {
      const requiredSkill = requiredSkills.find(
        (s) => s.name === skillRecord.skill,
      );
      if (!requiredSkill) continue;

      const matchScore = this.calculateSkillMatchScore(
        skillRecord.proficiencyLevel,
        requiredSkill.requiredLevel,
        requiredSkill.weight,
      );

      matches.push({
        userId: skillRecord.user.id,
        userName: skillRecord.user.name || 'Unknown',
        skill: skillRecord.skill,
        userLevel: skillRecord.proficiencyLevel,
        requiredLevel: requiredSkill.requiredLevel,
        matchScore,
        experienceYears: skillRecord.experienceYears,
        isVerified: skillRecord.isVerified,
        lastUsed: skillRecord.lastUsed,
        certifications: skillRecord.certifications
          ? skillRecord.certifications.split(',')
          : [],
      });
    }

    // Sort by match score descending
    return matches.sort((a, b) => b.matchScore - a.matchScore);
  }

  async recommendSkillDevelopment(
    userId: string,
  ): Promise<SkillRecommendation[]> {
    const userSkills = await this.skillRepo.find({
      where: { user: { id: userId } },
      relations: ['user'],
    });

    const recommendations: SkillRecommendation[] = [];

    // Get skills in demand across the organization
    const inDemandSkills = await this.getInDemandSkills();

    // Find skills the user doesn't have or has at low level
    for (const demandSkill of inDemandSkills) {
      const userSkill = userSkills.find((s) => s.skill === demandSkill.skill);
      const currentLevel = userSkill?.proficiencyLevel || 0;
      const targetLevel = demandSkill.averageRequiredLevel;

      if (currentLevel < targetLevel) {
        const learningPath = this.generateLearningPath(
          demandSkill.skill,
          currentLevel,
          targetLevel,
        );

        const priority = this.calculateSkillPriority(
          demandSkill.skill,
          currentLevel,
          targetLevel,
          demandSkill.demandCount,
        );

        recommendations.push({
          userId,
          userName: userSkills[0]?.user.name || 'Unknown',
          skill: demandSkill.skill,
          currentLevel,
          targetLevel,
          learningPath,
          priority,
          expectedImpact: this.generateExpectedImpact(
            demandSkill.skill,
            currentLevel,
            targetLevel,
          ),
        });
      }
    }

    // Sort by priority and impact
    return recommendations.sort((a, b) => {
      const priorityOrder = { critical: 4, high: 3, medium: 2, low: 1 };
      return priorityOrder[b.priority] - priorityOrder[a.priority];
    });
  }

  async analyzeSkillSupplyDemand(
    organizationId: string,
  ): Promise<SkillAnalysis> {
    const allSkills = await this.skillRepo.find({
      relations: ['user'],
    });

    const skillSupply = this.calculateSkillSupply(allSkills);
    const skillDemand = await this.calculateSkillDemand();
    const skillGaps = this.identifySkillGaps(skillSupply, skillDemand);
    const emergingSkills = await this.identifyEmergingSkills();

    return {
      organizationId,
      skillSupply,
      skillDemand,
      skillGaps,
      emergingSkills,
    };
  }

  async createSkillMatrix(teamId: string): Promise<TeamSkillMatrix> {
    const teamSkills = await this.skillRepo.find({
      where: { user: { id: teamId } }, // This would need to be adjusted for team lookup
      relations: ['user'],
    });

    const skillGroups = this.groupSkillsByType(teamSkills);
    const skills = this.analyzeTeamSkills(skillGroups);
    const recommendations = this.generateTeamRecommendations(skills);

    return {
      teamId,
      teamName: 'Team', // This would come from team lookup
      skills,
      recommendations,
    };
  }

  private calculateSkillMatchScore(
    userLevel: number,
    requiredLevel: number,
    weight: number,
  ): number {
    if (userLevel >= requiredLevel) {
      // Perfect or over-qualified match
      return 1.0 * weight;
    } else if (userLevel >= requiredLevel * 0.7) {
      // Partial match with some training needed
      return (userLevel / requiredLevel) * weight * 0.8;
    } else {
      // Poor match, significant training needed
      return (userLevel / requiredLevel) * weight * 0.4;
    }
  }

  private getInDemandSkills(): Promise<
    {
      skill: string;
      averageRequiredLevel: number;
      demandCount: number;
    }[]
  > {
    // This would analyze project requirements, job postings, etc.
    // For now, returning common in-demand skills
    return Promise.resolve([
      { skill: 'JavaScript', averageRequiredLevel: 4, demandCount: 15 },
      { skill: 'TypeScript', averageRequiredLevel: 3, demandCount: 12 },
      { skill: 'React', averageRequiredLevel: 4, demandCount: 10 },
      { skill: 'Node.js', averageRequiredLevel: 3, demandCount: 8 },
      { skill: 'PostgreSQL', averageRequiredLevel: 3, demandCount: 6 },
      { skill: 'Docker', averageRequiredLevel: 2, demandCount: 5 },
      { skill: 'AWS', averageRequiredLevel: 3, demandCount: 4 },
    ]);
  }

  private generateLearningPath(
    skill: string,
    currentLevel: number,
    targetLevel: number,
  ): SkillRecommendation['learningPath'] {
    const learningPath: SkillRecommendation['learningPath'] = [];
    const steps = targetLevel - currentLevel;

    for (let i = 0; i < steps; i++) {
      const level = currentLevel + i + 1;
      learningPath.push({
        step: `Level ${level}`,
        description: this.getSkillLevelDescription(skill, level),
        estimatedTime: this.getEstimatedLearningTime(skill, level),
        resources: this.getLearningResources(skill),
      });
    }

    return learningPath;
  }

  private getSkillLevelDescription(skill: string, level: number): string {
    const descriptions: Record<string, Record<number, string>> = {
      JavaScript: {
        1: 'Basic syntax and variables',
        2: 'Functions and objects',
        3: 'DOM manipulation and events',
        4: 'ES6+ features and async programming',
        5: 'Advanced patterns and performance optimization',
      },
      TypeScript: {
        1: 'Basic types and interfaces',
        2: 'Classes and inheritance',
        3: 'Generics and utility types',
        4: 'Advanced type system features',
        5: 'Complex type patterns and performance',
      },
      // Add more skills as needed
    };

    return (
      descriptions[skill]?.[level] || `Level ${level} proficiency in ${skill}`
    );
  }

  private getEstimatedLearningTime(skill: string, level: number): number {
    // Estimated hours to reach this level
    const baseHours = {
      JavaScript: 20,
      TypeScript: 15,
      React: 25,
      'Node.js': 30,
      PostgreSQL: 20,
      Docker: 10,
      AWS: 40,
    };

    return (baseHours[skill] || 20) * level;
  }

  private getLearningResources(skill: string): string[] {
    const resources: Record<string, string[]> = {
      JavaScript: [
        'MDN Web Docs',
        'JavaScript.info',
        'Eloquent JavaScript',
        "You Don't Know JS series",
      ],
      TypeScript: [
        'TypeScript Handbook',
        'TypeScript Deep Dive',
        'TypeScript Playground',
      ],
      React: ['React Documentation', 'React Tutorial', 'React Patterns'],
      // Add more resources as needed
    };

    return resources[skill] || ['Official Documentation', 'Online Tutorials'];
  }

  private calculateSkillPriority(
    skill: string,
    currentLevel: number,
    targetLevel: number,
    demandCount: number,
  ): 'low' | 'medium' | 'high' | 'critical' {
    const gap = targetLevel - currentLevel;
    const demandScore = Math.min(demandCount / 10, 1); // Normalize demand

    if (gap >= 3 && demandScore > 0.8) return 'critical';
    if (gap >= 2 && demandScore > 0.6) return 'high';
    if (gap >= 1 && demandScore > 0.4) return 'medium';
    return 'low';
  }

  private generateExpectedImpact(
    skill: string,
    currentLevel: number,
    targetLevel: number,
  ): string {
    const improvement = targetLevel - currentLevel;

    if (improvement >= 3) {
      return `Significant career advancement opportunities and increased project eligibility`;
    } else if (improvement >= 2) {
      return `Better project assignments and potential for leadership roles`;
    } else if (improvement >= 1) {
      return `Improved performance on current projects and skill diversification`;
    } else {
      return `Maintain current skill level and stay competitive`;
    }
  }

  private calculateSkillSupply(
    skills: SkillMatrix[],
  ): SkillAnalysis['skillSupply'] {
    const skillGroups = this.groupSkillsByType(skills);
    const supply: SkillAnalysis['skillSupply'] = [];

    for (const [skill, skillRecords] of skillGroups) {
      const totalUsers = skillRecords.length;
      const averageLevel =
        skillRecords.reduce((sum, s) => sum + s.proficiencyLevel, 0) /
        totalUsers;

      const distribution: Record<number, number> = {};
      for (const record of skillRecords) {
        distribution[record.proficiencyLevel] =
          (distribution[record.proficiencyLevel] || 0) + 1;
      }

      supply.push({
        skill,
        totalUsers,
        averageLevel,
        distribution,
      });
    }

    return supply;
  }

  private calculateSkillDemand(): Promise<SkillAnalysis['skillDemand']> {
    // This would analyze project requirements, job postings, etc.
    // For now, returning placeholder data
    return Promise.resolve([
      {
        skill: 'JavaScript',
        requiredCount: 20,
        averageRequiredLevel: 4,
        projects: ['Project A', 'Project B'],
      },
      {
        skill: 'TypeScript',
        requiredCount: 15,
        averageRequiredLevel: 3,
        projects: ['Project A', 'Project C'],
      },
    ]);
  }

  private identifySkillGaps(
    supply: SkillAnalysis['skillSupply'],
    demand: SkillAnalysis['skillDemand'],
  ): SkillAnalysis['skillGaps'] {
    const gaps: SkillAnalysis['skillGaps'] = [];

    for (const demandSkill of demand) {
      const supplySkill = supply.find((s) => s.skill === demandSkill.skill);
      const availableCount = supplySkill?.totalUsers || 0;
      const gap = demandSkill.requiredCount - availableCount;

      if (gap > 0) {
        const severity = this.calculateGapSeverity(
          gap,
          demandSkill.requiredCount,
        );
        const recommendations = this.generateGapRecommendations(
          demandSkill.skill,
          gap,
          severity,
        );

        gaps.push({
          skill: demandSkill.skill,
          gap,
          severity,
          recommendations,
        });
      }
    }

    return gaps;
  }

  private calculateGapSeverity(
    gap: number,
    totalRequired: number,
  ): 'low' | 'medium' | 'high' | 'critical' {
    const gapPercentage = gap / totalRequired;

    if (gapPercentage >= 0.5) return 'critical';
    if (gapPercentage >= 0.3) return 'high';
    if (gapPercentage >= 0.1) return 'medium';
    return 'low';
  }

  private generateGapRecommendations(
    skill: string,
    gap: number,
    severity: string,
  ): string[] {
    const recommendations: string[] = [];

    if (severity === 'critical') {
      recommendations.push(
        `Urgent: Hire ${gap} ${skill} specialists immediately`,
      );
      recommendations.push('Consider external contractors or consultants');
    } else if (severity === 'high') {
      recommendations.push(`Hire ${gap} ${skill} professionals`);
      recommendations.push(
        'Accelerate training programs for existing team members',
      );
    } else if (severity === 'medium') {
      recommendations.push(`Plan to hire ${gap} ${skill} professionals`);
      recommendations.push('Invest in skill development programs');
    } else {
      recommendations.push(`Monitor ${skill} availability`);
      recommendations.push('Consider cross-training opportunities');
    }

    return recommendations;
  }

  private identifyEmergingSkills(): Promise<SkillAnalysis['emergingSkills']> {
    // This would analyze trends, job postings, technology adoption, etc.
    // For now, returning placeholder data
    return Promise.resolve([
      {
        skill: 'AI/ML',
        growthRate: 0.3,
        adoptionRate: 0.15,
        futureDemand: 0.8,
      },
      {
        skill: 'Blockchain',
        growthRate: 0.25,
        adoptionRate: 0.1,
        futureDemand: 0.6,
      },
    ]);
  }

  private groupSkillsByType(skills: SkillMatrix[]): Map<string, SkillMatrix[]> {
    const groups = new Map<string, SkillMatrix[]>();

    for (const skill of skills) {
      if (!groups.has(skill.skill)) {
        groups.set(skill.skill, []);
      }
      groups.get(skill.skill)?.push(skill);
    }

    return groups;
  }

  private analyzeTeamSkills(
    skillGroups: Map<string, SkillMatrix[]>,
  ): TeamSkillMatrix['skills'] {
    const skills: TeamSkillMatrix['skills'] = [];

    for (const [skill, skillRecords] of skillGroups) {
      const teamAverage =
        skillRecords.reduce((sum, s) => sum + s.proficiencyLevel, 0) /
        skillRecords.length;
      const coverage = (skillRecords.length / 5) * 100; // Assuming team size of 5

      const strongestMember = skillRecords.reduce((best, current) =>
        current.proficiencyLevel > best.proficiencyLevel ? current : best,
      );

      const weakestMember = skillRecords.reduce((worst, current) =>
        current.proficiencyLevel < worst.proficiencyLevel ? current : worst,
      );

      skills.push({
        skill,
        teamAverage,
        coverage,
        strongestMember: {
          userId: strongestMember.user.id,
          userName: strongestMember.user.name || 'Unknown',
          level: strongestMember.proficiencyLevel,
        },
        weakestMember: {
          userId: weakestMember.user.id,
          userName: weakestMember.user.name || 'Unknown',
          level: weakestMember.proficiencyLevel,
        },
      });
    }

    return skills;
  }

  private generateTeamRecommendations(
    skills: TeamSkillMatrix['skills'],
  ): string[] {
    const recommendations: string[] = [];

    const lowCoverageSkills = skills.filter((s) => s.coverage < 60);
    if (lowCoverageSkills.length > 0) {
      recommendations.push(
        `Improve coverage for: ${lowCoverageSkills.map((s) => s.skill).join(', ')}`,
      );
    }

    const lowAverageSkills = skills.filter((s) => s.teamAverage < 3);
    if (lowAverageSkills.length > 0) {
      recommendations.push(
        `Enhance team proficiency in: ${lowAverageSkills.map((s) => s.skill).join(', ')}`,
      );
    }

    const skillGaps = skills.filter(
      (s) => s.strongestMember.level - s.weakestMember.level > 2,
    );
    if (skillGaps.length > 0) {
      recommendations.push(
        `Address skill gaps in: ${skillGaps.map((s) => s.skill).join(', ')}`,
      );
    }

    if (recommendations.length === 0) {
      recommendations.push('Team skills are well-balanced');
    }

    return recommendations;
  }
}
