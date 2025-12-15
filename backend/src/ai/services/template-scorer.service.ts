/**
 * Template Scorer Service
 * 7-factor weighted scoring for template recommendations
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
import { matchIndustry } from '../../project-templates/constants/industry.constants';

/**
 * Scoring weights for different factors
 * Updated for enhanced industry-level matching and experience/timeline fit
 * Total: 100%
 */
const SCORING_WEIGHTS = {
  categoryMatch: 0.2, // Project type match (was 0.22)
  methodologyMatch: 0.16, // Work style match (was 0.18)
  teamSizeFit: 0.14, // Template complexity vs team size (was 0.15)
  stakeholderFit: 0.08, // External stakeholder handling (was 0.10)
  industryMatch: 0.16, // Industry vertical match (was 0.18)
  complexityFit: 0.1, // Complexity matching
  userPreference: 0.04, // User's historical preferences (was 0.07)
  experienceFit: 0.06, // NEW: User experience level match
  timelineFit: 0.06, // NEW: Timeline duration match
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
      complexityFit: 0,
      userPreference: 0,
      experienceFit: 0, // NEW: User experience level match
      timelineFit: 0, // NEW: Timeline duration match
    };
    const reasons: string[] = [];

    // 1. Category Match (22%)
    if (criteria.projectType && template.category === criteria.projectType) {
      breakdown.categoryMatch = 1;
      reasons.push(
        `Matches ${this.formatCategory(criteria.projectType)} category`,
      );
    } else if (template.category === ProjectCategory.CUSTOM) {
      breakdown.categoryMatch = 0.3; // Custom templates are flexible
    }

    // 2. Methodology Match (18%)
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

    // 3. Team Size Fit (15%) - Enhanced with idealTeamSize
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

    // 4. Stakeholder Fit (10%) - Use features if available
    if (criteria.hasExternalStakeholders) {
      // NEW: Check features.supportsExternalStakeholders if available
      if (template.features?.supportsExternalStakeholders) {
        breakdown.stakeholderFit = 1;
        reasons.push('Designed for external stakeholder collaboration');
      } else if (this.hasApprovalWorkflow(template)) {
        breakdown.stakeholderFit = 0.8;
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

    // 5. Industry Match (18%) - Enhanced with industries array
    if (criteria.industry) {
      breakdown.industryMatch = this.calculateIndustryMatch(
        template,
        criteria.industry,
      );
      if (breakdown.industryMatch >= 0.8) {
        reasons.push(`Optimized for ${criteria.industry} industry`);
      }
    } else {
      breakdown.industryMatch = 0.3; // Unknown industry, neutral
    }

    // 6. Complexity Fit (10%) - NEW
    breakdown.complexityFit = this.calculateComplexityFit(template, criteria);
    if (breakdown.complexityFit >= 0.8) {
      reasons.push(`Matches your project complexity`);
    }

    // 7. User Preference (4%)
    if (userPrefs) {
      const prefScore = this.calculatePreferenceMatch(template, userPrefs);
      breakdown.userPreference = prefScore;
      if (prefScore > 0.7) {
        reasons.push('Matches your preferences');
      }
    }

    // 8. Experience Fit (6%) - NEW: Match template complexity to user experience
    breakdown.experienceFit = this.calculateExperienceFit(template, criteria);
    if (breakdown.experienceFit >= 0.8 && criteria.experienceLevel) {
      reasons.push(`Great for ${criteria.experienceLevel} users`);
    }

    // 9. Timeline Fit (6%) - NEW: Match methodology to timeline
    breakdown.timelineFit = this.calculateTimelineFit(template, criteria);
    if (breakdown.timelineFit >= 0.8 && criteria.timeline) {
      reasons.push(`Suits ${criteria.timeline}-term projects`);
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
    const teamNum = TEAM_SIZE_MAP[teamSize] || 5;

    // NEW: Use idealTeamSize if available for direct matching
    if (template.idealTeamSize) {
      const { min, max } = template.idealTeamSize;

      // Perfect fit
      if (teamNum >= min && teamNum <= max) {
        return 1.0;
      }

      // Calculate distance-based score
      const distance =
        teamNum < min ? (min - teamNum) / min : (teamNum - max) / max;

      return Math.max(0.2, 1 - distance);
    }

    // Fallback: use role count heuristic
    const roleCount = template.templateConfig?.suggestedRoles?.length || 3;

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
   * Calculate industry match using new industries array
   */
  private calculateIndustryMatch(
    template: ProjectTemplate,
    industry: string,
  ): number {
    const industryLower = industry.toLowerCase();

    // NEW: Use industries array if available (preferred)
    if (template.industries && template.industries.length > 0) {
      // Direct match
      if (
        template.industries.some((ind) => ind.toLowerCase() === industryLower)
      ) {
        return 1.0;
      }

      // Use matchIndustry helper for alias matching
      const matchedIndustry = matchIndustry(industry);
      if (matchedIndustry && template.industries.includes(matchedIndustry)) {
        return 0.9;
      }

      // Partial match (any word matches)
      if (
        template.industries.some(
          (ind) =>
            industryLower.includes(ind.toLowerCase()) ||
            ind.toLowerCase().includes(industryLower.slice(0, 4)),
        )
      ) {
        return 0.6;
      }
    }

    // Fallback: use tags array
    if (template.tags && template.tags.length > 0) {
      if (template.tags.some((tag) => tag.toLowerCase() === industryLower)) {
        return 0.8;
      }
      if (
        template.tags.some((tag) => industryLower.includes(tag.toLowerCase()))
      ) {
        return 0.4;
      }
    }

    return 0; // No match
  }

  /**
   * Calculate complexity fit between template and inferred user complexity
   */
  private calculateComplexityFit(
    template: ProjectTemplate,
    criteria: IntelligentCriteria,
  ): number {
    const userComplexity = this.inferUserComplexity(criteria);
    const templateComplexity = template.complexity || 'medium';

    // Perfect match
    if (userComplexity === templateComplexity) {
      return 1.0;
    }

    // Adjacent complexity levels get partial score
    const levels = ['simple', 'medium', 'complex'];
    const userIdx = levels.indexOf(userComplexity);
    const templateIdx = levels.indexOf(templateComplexity);
    const distance = Math.abs(userIdx - templateIdx);

    return distance === 1 ? 0.6 : 0.2;
  }

  /**
   * Infer user's expected complexity from criteria
   */
  private inferUserComplexity(criteria: IntelligentCriteria): string {
    const teamNum = criteria.teamSize
      ? TEAM_SIZE_MAP[criteria.teamSize] || 5
      : 5;

    // Solo/tiny team + no external stakeholders = simple
    if (teamNum <= 3 && !criteria.hasExternalStakeholders) {
      return 'simple';
    }

    // Large team OR has external stakeholders = complex
    if (teamNum >= 15 || (criteria.hasExternalStakeholders && teamNum > 5)) {
      return 'complex';
    }

    return 'medium';
  }

  /**
   * Calculate experience fit between template complexity and user experience level
   * NEW: Maps user experience (beginner/intermediate/advanced) to appropriate template
   */
  private calculateExperienceFit(
    template: ProjectTemplate,
    criteria: IntelligentCriteria,
  ): number {
    const experience = criteria.experienceLevel;
    if (!experience) {
      return 0.5; // No experience specified, neutral score
    }

    const templateComplexity = template.complexity || 'medium';
    const stageCount = template.templateConfig?.workflowStages?.length || 4;

    // Beginner: prefer simple templates with fewer stages (1-4)
    if (experience === 'beginner') {
      if (templateComplexity === 'simple' && stageCount <= 4) return 1.0;
      if (templateComplexity === 'simple' || stageCount <= 5) return 0.7;
      if (templateComplexity === 'medium') return 0.4;
      return 0.2; // Complex templates not recommended for beginners
    }

    // Intermediate: prefer medium complexity (3-6 stages)
    if (experience === 'intermediate') {
      if (templateComplexity === 'medium') return 1.0;
      if (stageCount >= 3 && stageCount <= 6) return 0.8;
      return 0.5; // Either too simple or too complex
    }

    // Advanced: prefer complex templates with many stages
    if (experience === 'advanced') {
      if (templateComplexity === 'complex' && stageCount >= 5) return 1.0;
      if (templateComplexity === 'complex' || stageCount >= 5) return 0.8;
      if (templateComplexity === 'medium') return 0.6;
      return 0.4; // Simple templates may feel limiting
    }

    return 0.5;
  }

  /**
   * Calculate timeline fit between project methodology and timeline duration
   * NEW: Matches methodology to project duration expectations
   */
  private calculateTimelineFit(
    template: ProjectTemplate,
    criteria: IntelligentCriteria,
  ): number {
    const timeline = criteria.timeline;
    if (!timeline) {
      return 0.5; // No timeline specified, neutral score
    }

    const methodology = template.methodology;

    // Short-term projects (< 3 months): Kanban, Agile preferred
    if (timeline === 'short') {
      switch (methodology) {
        case ProjectMethodology.KANBAN:
          return 1.0; // Best for quick, continuous delivery
        case ProjectMethodology.AGILE:
          return 0.9; // Good flexibility
        case ProjectMethodology.SCRUM:
          return 0.7; // Sprints may feel rushed
        case ProjectMethodology.HYBRID:
          return 0.6;
        case ProjectMethodology.WATERFALL:
          return 0.3; // Too rigid for short projects
        default:
          return 0.5;
      }
    }

    // Medium-term projects (3-6 months): Scrum, Agile preferred
    if (timeline === 'medium') {
      switch (methodology) {
        case ProjectMethodology.SCRUM:
          return 1.0; // Sweet spot for sprints
        case ProjectMethodology.AGILE:
          return 0.9;
        case ProjectMethodology.HYBRID:
          return 0.8;
        case ProjectMethodology.KANBAN:
          return 0.6;
        case ProjectMethodology.WATERFALL:
          return 0.5;
        default:
          return 0.5;
      }
    }

    // Long-term projects (6+ months): Waterfall, Hybrid preferred
    if (timeline === 'long') {
      switch (methodology) {
        case ProjectMethodology.WATERFALL:
          return 1.0; // Planning-heavy approach suits long projects
        case ProjectMethodology.HYBRID:
          return 0.9;
        case ProjectMethodology.SCRUM:
          return 0.7; // Many sprints can work
        case ProjectMethodology.AGILE:
          return 0.6;
        case ProjectMethodology.KANBAN:
          return 0.5; // May lack structure
        default:
          return 0.5;
      }
    }

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
