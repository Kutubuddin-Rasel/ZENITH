/**
 * Template Scorer Service
 * 6-factor weighted scoring for template recommendations
 */

import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import {
  ProjectTemplate,
  ProjectCategory,
  ProjectMethodology,
} from '../../project-templates/entities/project-template.entity';
import {
  IntelligentCriteria,
  TemplateScoringResult,
  TeamSizeRange,
} from '../interfaces/intelligent-criteria.interface';

/**
 * Scoring weights for different factors
 */
const SCORING_WEIGHTS = {
  categoryMatch: 0.25, // Project type match
  methodologyMatch: 0.2, // Work style match
  teamSizeFit: 0.15, // Template complexity vs team size
  stakeholderFit: 0.15, // External stakeholder handling
  industryMatch: 0.1, // Industry vertical match
  userPreference: 0.1, // User's historical preferences
  popularity: 0.05, // Usage count boost
};

/**
 * Team size to number mapping
 */
const TEAM_SIZE_MAP: Record<TeamSizeRange, number> = {
  '1': 1,
  '2-5': 3,
  '6-10': 8,
  '11-20': 15,
  '20+': 25,
};

@Injectable()
export class TemplateScorerService {
  private readonly logger = new Logger(TemplateScorerService.name);

  constructor(
    @InjectRepository(ProjectTemplate)
    private readonly templateRepo: Repository<ProjectTemplate>,
  ) {}

  /**
   * Score all active templates against criteria
   * @param criteria The intelligent criteria to score against
   * @param userPrefs Optional user preferences for personalization
   */
  async scoreTemplates(
    criteria: IntelligentCriteria,
    userPrefs?: Record<string, unknown> | null,
  ): Promise<TemplateScoringResult[]> {
    // Fetch active templates
    const templates = await this.templateRepo.find({
      where: { isActive: true },
      order: { usageCount: 'DESC' },
    });

    // Score each template
    const results = templates.map((template) =>
      this.scoreTemplate(template, criteria, userPrefs),
    );

    // Sort by score descending
    results.sort((a, b) => b.score - a.score);

    return results;
  }

  /**
   * Score a single template against criteria
   */
  scoreTemplate(
    template: ProjectTemplate,
    criteria: IntelligentCriteria,
    userPrefs?: Record<string, unknown> | null,
  ): TemplateScoringResult {
    const breakdown = {
      categoryMatch: 0,
      methodologyMatch: 0,
      teamSizeFit: 0,
      stakeholderFit: 0,
      industryMatch: 0,
      userPreference: 0,
      popularity: 0,
    };
    const reasons: string[] = [];

    // 1. Category Match (25%)
    if (criteria.projectType && template.category === criteria.projectType) {
      breakdown.categoryMatch = 1;
      reasons.push(
        `Matches ${this.formatCategory(criteria.projectType)} category`,
      );
    } else if (template.category === ProjectCategory.CUSTOM) {
      breakdown.categoryMatch = 0.3; // Custom templates are flexible
    }

    // 2. Methodology Match (20%)
    if (criteria.workStyle) {
      if (template.methodology === criteria.workStyle) {
        breakdown.methodologyMatch = 1;
        reasons.push(`Uses ${criteria.workStyle} methodology`);
      } else if (
        template.methodology === ProjectMethodology.AGILE &&
        (criteria.workStyle === ProjectMethodology.SCRUM ||
          criteria.workStyle === ProjectMethodology.KANBAN)
      ) {
        breakdown.methodologyMatch = 0.5; // Agile is compatible
      } else if (template.methodology === ProjectMethodology.HYBRID) {
        breakdown.methodologyMatch = 0.4; // Hybrid is flexible
      }
    }

    // 3. Team Size Fit (15%)
    if (criteria.teamSize) {
      const teamSizeFit = this.calculateTeamSizeFit(
        template,
        criteria.teamSize,
      );
      breakdown.teamSizeFit = teamSizeFit;
      if (teamSizeFit >= 0.8) {
        reasons.push(
          `Good fit for ${criteria.teamSize === '1' ? 'solo' : criteria.teamSize + ' person'} teams`,
        );
      }
    } else {
      breakdown.teamSizeFit = 0.5; // Unknown team size, neutral
    }

    // 4. Stakeholder Fit (15%)
    if (criteria.hasExternalStakeholders) {
      const hasApprovalWorkflow = this.hasApprovalWorkflow(template);
      if (hasApprovalWorkflow) {
        breakdown.stakeholderFit = 1;
        reasons.push('Has approval workflow for external stakeholders');
      } else {
        breakdown.stakeholderFit = 0.3;
      }
    } else {
      // Internal project: simpler templates score higher
      const stageCount = template.templateConfig?.workflowStages?.length || 4;
      if (stageCount <= 5) {
        breakdown.stakeholderFit = 0.8;
      } else {
        breakdown.stakeholderFit = 0.5;
      }
    }

    // 5. Industry Match (10%)
    if (criteria.industry && template.tags) {
      const industryLower = criteria.industry.toLowerCase();
      if (template.tags.some((tag) => tag.toLowerCase() === industryLower)) {
        breakdown.industryMatch = 1;
        reasons.push(`Tagged for ${criteria.industry}`);
      } else if (
        template.tags.some((tag) => industryLower.includes(tag.toLowerCase()))
      ) {
        breakdown.industryMatch = 0.5;
      }
    }

    // 6. User Preference (10%)
    if (userPrefs) {
      const prefScore = this.calculatePreferenceMatch(template, userPrefs);
      breakdown.userPreference = prefScore;
      if (prefScore > 0.7) {
        reasons.push('Matches your preferences');
      }
    }

    // 7. Popularity (5%)
    if (template.usageCount > 100) {
      breakdown.popularity = 1;
    } else if (template.usageCount > 50) {
      breakdown.popularity = 0.7;
    } else if (template.usageCount > 10) {
      breakdown.popularity = 0.4;
    }

    // Calculate weighted score
    let totalScore = 0;
    for (const [factor, weight] of Object.entries(SCORING_WEIGHTS)) {
      totalScore += breakdown[factor as keyof typeof breakdown] * weight;
    }

    // Calculate confidence based on how many criteria we have
    const confidence = this.calculateConfidence(criteria);

    return {
      templateId: template.id,
      score: Math.round(totalScore * 100) / 100,
      confidence,
      reasons,
      breakdown,
    };
  }

  /**
   * Calculate team size fit between template and criteria
   */
  private calculateTeamSizeFit(
    template: ProjectTemplate,
    teamSize: TeamSizeRange,
  ): number {
    const roleCount = template.templateConfig?.suggestedRoles?.length || 3;
    const teamNum = TEAM_SIZE_MAP[teamSize] || 5;

    // Small team (1-5): prefer 2-4 roles
    if (teamNum <= 5) {
      if (roleCount <= 3) return 1.0;
      if (roleCount <= 5) return 0.6;
      return 0.3;
    }

    // Medium team (6-10): prefer 3-5 roles
    if (teamNum <= 10) {
      if (roleCount >= 3 && roleCount <= 5) return 1.0;
      if (roleCount >= 2 && roleCount <= 6) return 0.7;
      return 0.4;
    }

    // Large team (11+): prefer 5+ roles
    if (roleCount >= 5) return 1.0;
    if (roleCount >= 4) return 0.7;
    return 0.5;
  }

  /**
   * Check if template has approval workflow
   */
  private hasApprovalWorkflow(template: ProjectTemplate): boolean {
    const stages = template.templateConfig?.workflowStages || [];
    const statuses = template.templateConfig?.defaultStatuses || [];

    const approvalKeywords = [
      'approval',
      'review',
      'client',
      'sign-off',
      'waiting',
    ];

    for (const stage of stages) {
      const stageName = stage.name.toLowerCase();
      if (approvalKeywords.some((kw) => stageName.includes(kw))) {
        return true;
      }
    }

    for (const status of statuses) {
      const statusLower = status.toLowerCase();
      if (approvalKeywords.some((kw) => statusLower.includes(kw))) {
        return true;
      }
    }

    return false;
  }

  /**
   * Calculate match against user preferences
   */
  private calculatePreferenceMatch(
    template: ProjectTemplate,
    userPrefs: Record<string, unknown>,
  ): number {
    let score = 0;
    let factors = 0;

    // Check methodology preference
    const workPrefs = userPrefs.work as Record<string, unknown> | undefined;
    if (workPrefs) {
      // Check story points preference
      const wantsStoryPoints =
        workPrefs.storyPointScale &&
        Array.isArray(workPrefs.storyPointScale) &&
        workPrefs.storyPointScale.length > 0;
      const templateHasStoryPoints =
        template.templateConfig?.smartDefaults?.enableStoryPoints;

      if (wantsStoryPoints === templateHasStoryPoints) {
        score += 1;
      }
      factors++;

      // Check time tracking preference
      const wantsTimeTracking = workPrefs.enableTimeTracking;
      const templateHasTimeTracking =
        template.templateConfig?.smartDefaults?.enableTimeTracking;

      if (wantsTimeTracking === templateHasTimeTracking) {
        score += 1;
      }
      factors++;
    }

    // Check learning data for preferred issue types
    const learning = userPrefs.learning as Record<string, unknown> | undefined;
    if (
      learning?.preferredIssueTypes &&
      Array.isArray(learning.preferredIssueTypes)
    ) {
      const templateIssueTypes =
        template.templateConfig?.defaultIssueTypes || [];
      const overlap = (learning.preferredIssueTypes as string[]).filter(
        (type) => templateIssueTypes.includes(type),
      );
      if (overlap.length > 0) {
        score +=
          overlap.length / (learning.preferredIssueTypes as string[]).length;
      }
      factors++;
    }

    return factors > 0 ? score / factors : 0;
  }

  /**
   * Calculate overall confidence based on criteria completeness
   */
  private calculateConfidence(criteria: IntelligentCriteria): number {
    let score = 0;
    let maxScore = 0;

    // Required fields (weighted heavily)
    if (criteria.projectType) score += 30;
    maxScore += 30;

    if (criteria.teamSize) score += 25;
    maxScore += 25;

    if (criteria.workStyle) score += 25;
    maxScore += 25;

    // Optional but helpful fields
    if (criteria.timeline) score += 10;
    maxScore += 10;

    if (criteria.hasExternalStakeholders !== undefined) score += 5;
    maxScore += 5;

    if (criteria.industry) score += 5;
    maxScore += 5;

    return Math.round((score / maxScore) * 100);
  }

  /**
   * Format category for display
   */
  private formatCategory(category: ProjectCategory): string {
    return category.replace(/_/g, ' ').toLowerCase();
  }

  /**
   * Get top N template recommendations
   */
  async getTopRecommendations(
    criteria: IntelligentCriteria,
    userPrefs?: Record<string, unknown> | null,
    limit: number = 3,
  ): Promise<{
    results: TemplateScoringResult[];
    templates: Map<string, ProjectTemplate>;
  }> {
    const allResults = await this.scoreTemplates(criteria, userPrefs);
    const topResults = allResults.slice(0, limit);

    // Fetch full template data for top results
    const templates = new Map<string, ProjectTemplate>();
    const templateIds = topResults.map((r) => r.templateId);

    const fullTemplates = await this.templateRepo.findByIds(templateIds);
    for (const template of fullTemplates) {
      templates.set(template.id, template);
    }

    return { results: topResults, templates };
  }
}
