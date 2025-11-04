import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, Between } from 'typeorm';
import { ResourceForecast as ResourceForecastEntity } from '../entities/resource-forecast.entity';
import { ResourceAllocation } from '../entities/resource-allocation.entity';
import { UserCapacity } from '../entities/user-capacity.entity';
import { SkillMatrix } from '../entities/skill-matrix.entity';

export interface ResourceForecast {
  projectId: string;
  forecastDate: Date;
  resourceNeeds: Record<string, unknown>;
  predictedAllocations: Record<string, unknown>;
  confidenceScore: number;
  assumptions: Record<string, unknown>;
}

export interface SkillGapAnalysis {
  teamId: string;
  requiredSkills: string[];
  availableSkills: string[];
  gaps: {
    skill: string;
    requiredLevel: number;
    availableLevel: number;
    gap: number;
    criticality: string;
  }[];
  recommendations: string[];
}

export interface ResourceROI {
  projectId: string;
  totalInvestment: number;
  expectedReturn: number;
  roiPercentage: number;
  paybackPeriod: number;
  riskFactors: string[];
  recommendations: string[];
}

export interface BurnoutRiskScore {
  userId: string;
  userName: string;
  riskScore: number; // 0-100
  factors: {
    factor: string;
    impact: number;
    description: string;
  }[];
  recommendations: string[];
  urgency: 'low' | 'medium' | 'high' | 'critical';
}

export interface ResourceInsights {
  organizationId: string;
  period: {
    startDate: Date;
    endDate: Date;
  };
  utilization: {
    average: number;
    trend: 'increasing' | 'decreasing' | 'stable';
    distribution: Record<string, number>;
  };
  skills: {
    mostInDemand: string[];
    skillGaps: string[];
    emergingSkills: string[];
  };
  costs: {
    totalSpent: number;
    averageHourlyRate: number;
    costTrend: 'increasing' | 'decreasing' | 'stable';
  };
  recommendations: string[];
}

export interface ROICalculationParams {
  projectId: string;
  timeHorizon: number; // months
  includeOpportunityCost?: boolean;
  discountRate?: number;
}

@Injectable()
export class ResourceAnalyticsService {
  constructor(
    @InjectRepository(ResourceForecastEntity)
    private forecastRepo: Repository<ResourceForecastEntity>,
    @InjectRepository(ResourceAllocation)
    private allocationRepo: Repository<ResourceAllocation>,
    @InjectRepository(UserCapacity)
    private capacityRepo: Repository<UserCapacity>,
    @InjectRepository(SkillMatrix)
    private skillRepo: Repository<SkillMatrix>,
  ) {}

  async predictResourceDemand(projectId: string): Promise<ResourceForecast> {
    const existingForecasts = await this.forecastRepo.find({
      where: { project: { id: projectId } },
      order: { generatedAt: 'DESC' },
      take: 1,
    });

    if (existingForecasts.length > 0) {
      const forecast = existingForecasts[0];
      if (forecast.expiresAt && forecast.expiresAt > new Date()) {
        return {
          projectId: forecast.project.id,
          forecastDate: forecast.forecastDate,
          resourceNeeds: forecast.resourceNeeds,
          predictedAllocations: forecast.predictedAllocations,
          confidenceScore: forecast.confidenceScore,
          assumptions: forecast.assumptions,
        };
      }
    }

    // Generate new forecast
    const allocations = this.allocationRepo.find({
      where: { project: { id: projectId } },
      relations: ['user', 'project'],
    });

    const resourceNeeds = this.analyzeResourceNeeds(allocations);
    const predictedAllocations = this.predictFutureAllocations(allocations);
    const confidenceScore = this.calculateConfidenceScore(allocations);

    const forecast = this.forecastRepo.create({
      project: { id: projectId } as any,
      forecastDate: new Date(),
      resourceNeeds,
      predictedAllocations,
      confidenceScore,
      assumptions: this.generateAssumptions(allocations),
      modelVersion: '1.0',
      expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // 7 days
    });

    await this.forecastRepo.save(forecast);

    return {
      projectId: forecast.project.id,
      forecastDate: forecast.forecastDate,
      resourceNeeds: forecast.resourceNeeds,
      predictedAllocations: forecast.predictedAllocations,
      confidenceScore: forecast.confidenceScore,
      assumptions: forecast.assumptions,
    };
  }

  async analyzeSkillGaps(teamId: string): Promise<SkillGapAnalysis> {
    const teamSkills = await this.skillRepo.find({
      where: { user: { id: teamId } }, // This would need to be adjusted for team lookup
      relations: ['user'],
    });

    const requiredSkills = this.getRequiredSkills(teamId);
    const availableSkills = teamSkills.map((s) => s.skill);

    const gaps = this.identifySkillGaps(requiredSkills, teamSkills);
    const recommendations = this.generateSkillRecommendations(gaps);

    return {
      teamId,
      requiredSkills,
      availableSkills,
      gaps,
      recommendations,
    };
  }

  async calculateResourceROI(
    params: ROICalculationParams,
  ): Promise<ResourceROI> {
    const allocations = await this.allocationRepo.find({
      where: { project: { id: params.projectId } },
      relations: ['user', 'project'],
    });

    const totalInvestment = this.calculateTotalInvestment(allocations);
    const expectedReturn = this.calculateExpectedReturn(
      allocations,
      params.timeHorizon,
    );
    const roiPercentage =
      ((expectedReturn - totalInvestment) / totalInvestment) * 100;
    const paybackPeriod = this.calculatePaybackPeriod(
      totalInvestment,
      expectedReturn,
    );

    const riskFactors = this.identifyRiskFactors(allocations);
    const recommendations = this.generateROIRecommendations(
      roiPercentage,
      riskFactors,
    );

    return {
      projectId: params.projectId,
      totalInvestment,
      expectedReturn,
      roiPercentage,
      paybackPeriod,
      riskFactors,
      recommendations,
    };
  }

  async identifyBurnoutRisk(userId: string): Promise<BurnoutRiskScore> {
    const allocations = await this.allocationRepo.find({
      where: { user: { id: userId } },
      relations: ['user', 'project'],
    });

    const capacity = await this.capacityRepo.find({
      where: { user: { id: userId } },
      order: { date: 'DESC' },
      take: 30, // Last 30 days
    });

    const factors = this.analyzeBurnoutFactors(allocations, capacity);
    const riskScore = this.calculateBurnoutRiskScore(factors);
    const recommendations = this.generateBurnoutRecommendations(factors);
    const urgency = this.determineUrgency(riskScore);

    return {
      userId,
      userName: allocations[0]?.user.name || 'Unknown',
      riskScore,
      factors,
      recommendations,
      urgency,
    };
  }

  async generateResourceInsights(
    organizationId: string,
  ): Promise<ResourceInsights> {
    const endDate = new Date();
    const startDate = new Date(endDate.getTime() - 30 * 24 * 60 * 60 * 1000); // 30 days ago

    const allocations = await this.allocationRepo.find({
      where: {
        startDate: Between(startDate, endDate),
      },
      relations: ['user', 'project'],
    });

    const utilization = this.calculateUtilizationMetrics(allocations);
    const skills = await this.analyzeSkillTrends(organizationId);
    const costs = this.calculateCostMetrics(allocations);
    const recommendations = this.generateInsightRecommendations(
      utilization,
      skills,
      costs,
    );

    return {
      organizationId,
      period: { startDate, endDate },
      utilization,
      skills,
      costs,
      recommendations,
    };
  }

  private analyzeResourceNeeds(
    allocations: ResourceAllocation[],
  ): Record<string, unknown> {
    const needs: Record<string, unknown> = {};

    // Analyze current allocations to predict future needs
    const skillCounts: Record<string, number> = {};
    const roleCounts: Record<string, number> = {};

    for (const allocation of allocations) {
      const role = allocation.roleInProject;
      roleCounts[role] = (roleCounts[role] || 0) + 1;

      if (allocation.skillRequirements) {
        for (const skill of Object.keys(allocation.skillRequirements)) {
          skillCounts[skill] = (skillCounts[skill] || 0) + 1;
        }
      }
    }

    needs.roles = roleCounts;
    needs.skills = skillCounts;
    needs.totalAllocations = allocations.length;

    return needs;
  }

  private predictFutureAllocations(
    allocations: ResourceAllocation[],
  ): Record<string, unknown> {
    // Simplified prediction - in reality this would use ML models
    return {
      predictedCount: Math.ceil(allocations.length * 1.1), // 10% growth
      confidence: 0.7,
      factors: ['historical_trend', 'project_phase', 'team_growth'],
    };
  }

  private calculateConfidenceScore(allocations: ResourceAllocation[]): number {
    // Simplified confidence calculation
    const dataPoints = allocations.length;
    const confidence = Math.min(0.9, 0.5 + dataPoints * 0.05);
    return Math.round(confidence * 100) / 100;
  }

  private generateAssumptions(
    _allocations: ResourceAllocation[],
  ): Record<string, unknown> {
    return {
      historical_trend: 'Based on last 30 days of data',
      team_stability: 'No major team changes expected',
      project_scope: 'Project scope remains stable',
      skill_availability: 'Required skills remain available',
    };
  }

  private getRequiredSkills(_teamId: string): string[] {
    // This would query project requirements for the team
    // For now, returning common skills
    return ['JavaScript', 'TypeScript', 'React', 'Node.js', 'PostgreSQL'];
  }

  private identifySkillGaps(
    requiredSkills: string[],
    teamSkills: SkillMatrix[],
  ): SkillGapAnalysis['gaps'] {
    const gaps: SkillGapAnalysis['gaps'] = [];

    for (const requiredSkill of requiredSkills) {
      const teamSkill = teamSkills.find((s) => s.skill === requiredSkill);
      const requiredLevel = 3; // Default required level
      const availableLevel = teamSkill?.proficiencyLevel || 0;
      const gap = Math.max(0, requiredLevel - availableLevel);

      if (gap > 0) {
        gaps.push({
          skill: requiredSkill,
          requiredLevel,
          availableLevel,
          gap,
          criticality: gap >= 3 ? 'high' : gap >= 2 ? 'medium' : 'low',
        });
      }
    }

    return gaps;
  }

  private generateSkillRecommendations(
    gaps: SkillGapAnalysis['gaps'],
  ): string[] {
    const recommendations: string[] = [];

    const highGaps = gaps.filter((g) => g.criticality === 'high');
    if (highGaps.length > 0) {
      recommendations.push(
        `Critical skill gaps: ${highGaps.map((g) => g.skill).join(', ')}`,
      );
    }

    const mediumGaps = gaps.filter((g) => g.criticality === 'medium');
    if (mediumGaps.length > 0) {
      recommendations.push(
        `Consider training for: ${mediumGaps.map((g) => g.skill).join(', ')}`,
      );
    }

    if (gaps.length === 0) {
      recommendations.push('No significant skill gaps identified');
    }

    return recommendations;
  }

  private calculateTotalInvestment(allocations: ResourceAllocation[]): number {
    return allocations.reduce((sum, allocation) => {
      const days = Math.ceil(
        (allocation.endDate.getTime() - allocation.startDate.getTime()) /
          (1000 * 60 * 60 * 24),
      );
      const hoursPerDay = (allocation.allocationPercentage / 100) * 8;
      return sum + days * hoursPerDay * allocation.billingRate;
    }, 0);
  }

  private calculateExpectedReturn(
    allocations: ResourceAllocation[],
    timeHorizon: number,
  ): number {
    // Simplified calculation - in reality this would be more complex
    const totalInvestment = this.calculateTotalInvestment(allocations);
    const expectedMultiplier = 1 + timeHorizon * 0.1; // 10% per month
    return totalInvestment * expectedMultiplier;
  }

  private calculatePaybackPeriod(
    totalInvestment: number,
    expectedReturn: number,
  ): number {
    if (expectedReturn <= totalInvestment) return Infinity;
    const monthlyReturn = expectedReturn / 12; // Simplified
    return totalInvestment / monthlyReturn;
  }

  private identifyRiskFactors(allocations: ResourceAllocation[]): string[] {
    const risks: string[] = [];

    if (allocations.length === 0) {
      risks.push('No resource allocations found');
    }

    const highAllocations = allocations.filter(
      (a) => a.allocationPercentage > 80,
    );
    if (highAllocations.length > 0) {
      risks.push('High allocation percentages may lead to burnout');
    }

    const longAllocations = allocations.filter((a) => {
      const days =
        (a.endDate.getTime() - a.startDate.getTime()) / (1000 * 60 * 60 * 24);
      return days > 90;
    });
    if (longAllocations.length > 0) {
      risks.push('Long-term allocations may reduce flexibility');
    }

    return risks;
  }

  private generateROIRecommendations(
    roiPercentage: number,
    riskFactors: string[],
  ): string[] {
    const recommendations: string[] = [];

    if (roiPercentage < 0) {
      recommendations.push(
        'Negative ROI detected - consider project termination',
      );
    } else if (roiPercentage < 10) {
      recommendations.push('Low ROI - consider optimizing resource allocation');
    } else if (roiPercentage > 50) {
      recommendations.push('High ROI - consider scaling similar projects');
    }

    if (riskFactors.length > 0) {
      recommendations.push('Address risk factors to improve ROI');
    }

    return recommendations;
  }

  private analyzeBurnoutFactors(
    allocations: ResourceAllocation[],
    capacity: UserCapacity[],
  ): BurnoutRiskScore['factors'] {
    const factors: BurnoutRiskScore['factors'] = [];

    // High allocation percentage
    const avgAllocation =
      allocations.reduce((sum, a) => sum + a.allocationPercentage, 0) /
      allocations.length;
    if (avgAllocation > 80) {
      factors.push({
        factor: 'High allocation percentage',
        impact: Math.min(100, avgAllocation),
        description: `Average allocation is ${avgAllocation.toFixed(1)}%`,
      });
    }

    // Long working hours
    const avgCapacity =
      capacity.reduce((sum, c) => sum + c.availableHours, 0) / capacity.length;
    if (avgCapacity > 8) {
      factors.push({
        factor: 'Long working hours',
        impact: Math.min(100, (avgCapacity - 8) * 10),
        description: `Average ${avgCapacity.toFixed(1)} hours per day`,
      });
    }

    // Multiple projects
    const projectCount = new Set(allocations.map((a) => a.project.id)).size;
    if (projectCount > 3) {
      factors.push({
        factor: 'Multiple concurrent projects',
        impact: Math.min(100, projectCount * 20),
        description: `Working on ${projectCount} projects simultaneously`,
      });
    }

    return factors;
  }

  private calculateBurnoutRiskScore(
    factors: BurnoutRiskScore['factors'],
  ): number {
    if (factors.length === 0) return 0;

    const totalImpact = factors.reduce((sum, f) => sum + f.impact, 0);
    return Math.min(100, totalImpact / factors.length);
  }

  private generateBurnoutRecommendations(
    factors: BurnoutRiskScore['factors'],
  ): string[] {
    const recommendations: string[] = [];

    for (const factor of factors) {
      if (factor.factor === 'High allocation percentage') {
        recommendations.push(
          'Reduce allocation percentage or add team members',
        );
      } else if (factor.factor === 'Long working hours') {
        recommendations.push('Implement better work-life balance policies');
      } else if (factor.factor === 'Multiple concurrent projects') {
        recommendations.push(
          'Consolidate projects or delegate responsibilities',
        );
      }
    }

    if (recommendations.length === 0) {
      recommendations.push('Monitor workload and maintain current practices');
    }

    return recommendations;
  }

  private determineUrgency(
    riskScore: number,
  ): 'low' | 'medium' | 'high' | 'critical' {
    if (riskScore >= 80) return 'critical';
    if (riskScore >= 60) return 'high';
    if (riskScore >= 40) return 'medium';
    return 'low';
  }

  private calculateUtilizationMetrics(
    allocations: ResourceAllocation[],
  ): ResourceInsights['utilization'] {
    const utilizationPercentages = allocations.map(
      (a) => a.allocationPercentage,
    );
    const average =
      utilizationPercentages.reduce((sum, u) => sum + u, 0) /
      utilizationPercentages.length;

    // Simplified trend calculation
    const trend: 'increasing' | 'decreasing' | 'stable' = 'stable';

    const distribution: Record<string, number> = {
      '0-25%': 0,
      '26-50%': 0,
      '51-75%': 0,
      '76-100%': 0,
      '100%+': 0,
    };

    for (const util of utilizationPercentages) {
      if (util <= 25) distribution['0-25%']++;
      else if (util <= 50) distribution['26-50%']++;
      else if (util <= 75) distribution['51-75%']++;
      else if (util <= 100) distribution['76-100%']++;
      else distribution['100%+']++;
    }

    return { average, trend, distribution };
  }

  private async analyzeSkillTrends(
    _organizationId: string,
  ): Promise<ResourceInsights['skills']> {
    const skills = await this.skillRepo.find({
      relations: ['user'],
    });

    const skillCounts: Record<string, number> = {};
    for (const skill of skills) {
      skillCounts[skill.skill] = (skillCounts[skill.skill] || 0) + 1;
    }

    const sortedSkills = Object.entries(skillCounts)
      .sort(([, a], [, b]) => b - a)
      .map(([skill]) => skill);

    return {
      mostInDemand: sortedSkills.slice(0, 5),
      skillGaps: [], // This would be calculated based on project requirements
      emergingSkills: sortedSkills.slice(-3), // Newest skills
    };
  }

  private calculateCostMetrics(
    allocations: ResourceAllocation[],
  ): ResourceInsights['costs'] {
    const totalSpent = allocations.reduce((sum, allocation) => {
      const days = Math.ceil(
        (allocation.endDate.getTime() - allocation.startDate.getTime()) /
          (1000 * 60 * 60 * 24),
      );
      const hoursPerDay = (allocation.allocationPercentage / 100) * 8;
      return sum + days * hoursPerDay * allocation.billingRate;
    }, 0);

    const totalHours = allocations.reduce((sum, allocation) => {
      const days = Math.ceil(
        (allocation.endDate.getTime() - allocation.startDate.getTime()) /
          (1000 * 60 * 60 * 24),
      );
      const hoursPerDay = (allocation.allocationPercentage / 100) * 8;
      return sum + days * hoursPerDay;
    }, 0);

    const averageHourlyRate = totalHours > 0 ? totalSpent / totalHours : 0;

    return {
      totalSpent,
      averageHourlyRate,
      costTrend: 'stable', // This would be calculated based on historical data
    };
  }

  private generateInsightRecommendations(
    utilization: ResourceInsights['utilization'],
    skills: ResourceInsights['skills'],
    costs: ResourceInsights['costs'],
  ): string[] {
    const recommendations: string[] = [];

    if (utilization.average < 60) {
      recommendations.push(
        'Low utilization detected - consider taking on additional projects',
      );
    } else if (utilization.average > 90) {
      recommendations.push(
        'High utilization - consider hiring additional team members',
      );
    }

    if (skills.skillGaps.length > 0) {
      recommendations.push(
        `Address skill gaps: ${skills.skillGaps.join(', ')}`,
      );
    }

    if (costs.averageHourlyRate > 100) {
      recommendations.push(
        'High hourly rates - consider cost optimization strategies',
      );
    }

    return recommendations;
  }
}
