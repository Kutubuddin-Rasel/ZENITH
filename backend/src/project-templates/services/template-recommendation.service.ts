import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, Not } from 'typeorm';
import {
  ProjectTemplate,
  ProjectCategory,
  ProjectMethodology,
} from '../entities/project-template.entity';
import { UserPreferences } from '../../user-preferences/entities/user-preferences.entity';

export interface RecommendationContext {
  userId: string;
  projectType?: string;
  teamSize?: number;
  experienceLevel?: string;
  previousTemplates?: string[];
  industry?: string;
  methodology?: ProjectMethodology;
}

export interface TemplateRecommendation {
  template: ProjectTemplate;
  score: number;
  reasons: string[];
  confidence: 'low' | 'medium' | 'high';
}

@Injectable()
export class TemplateRecommendationService {
  constructor(
    @InjectRepository(ProjectTemplate)
    private templateRepo: Repository<ProjectTemplate>,
    @InjectRepository(UserPreferences)
    private preferencesRepo: Repository<UserPreferences>,
  ) {}

  /**
   * Get personalized template recommendations based on user context
   */
  async getRecommendations(
    context: RecommendationContext,
  ): Promise<TemplateRecommendation[]> {
    const userPreferences = await this.preferencesRepo.findOne({
      where: { userId: context.userId },
    });

    // Get all active templates
    const templates = await this.templateRepo.find({
      where: { isActive: true },
    });

    // Score each template
    const recommendations = templates.map((template) => {
      const { score, reasons } = this.calculateRecommendationScore(
        template,
        context,
        userPreferences || undefined,
      );

      return {
        template,
        score,
        reasons,
        confidence: this.calculateConfidence(score, reasons.length),
      };
    });

    // Sort by score and return top recommendations
    return recommendations.sort((a, b) => b.score - a.score).slice(0, 5);
  }

  /**
   * Get templates by category with smart filtering
   */
  async getTemplatesByCategory(
    category: ProjectCategory,
    context?: RecommendationContext,
  ): Promise<TemplateRecommendation[]> {
    const templates = await this.templateRepo.find({
      where: {
        category,
        isActive: true,
      },
      order: { usageCount: 'DESC' },
    });

    if (!context) {
      return templates.map((template) => ({
        template,
        score: template.usageCount,
        reasons: ['Popular choice'],
        confidence: 'medium' as const,
      }));
    }

    const userPreferences = await this.preferencesRepo.findOne({
      where: { userId: context.userId },
    });

    return templates
      .map((template) => {
        const { score, reasons } = this.calculateRecommendationScore(
          template,
          context,
          userPreferences || undefined,
        );

        return {
          template,
          score,
          reasons,
          confidence: this.calculateConfidence(score, reasons.length),
        };
      })
      .sort((a, b) => b.score - a.score);
  }

  /**
   * Get trending templates based on recent usage
   */
  async getTrendingTemplates(limit: number = 5): Promise<ProjectTemplate[]> {
    return this.templateRepo.find({
      where: { isActive: true },
      order: {
        usageCount: 'DESC',
        createdAt: 'DESC',
      },
      take: limit,
    });
  }

  /**
   * Get templates similar to a given template
   */
  async getSimilarTemplates(
    templateId: string,
    limit: number = 3,
  ): Promise<TemplateRecommendation[]> {
    const baseTemplate = await this.templateRepo.findOne({
      where: { id: templateId },
    });

    if (!baseTemplate) {
      return [];
    }

    const templates = await this.templateRepo.find({
      where: {
        category: baseTemplate.category,
        isActive: true,
        id: Not(templateId), // Exclude the base template
      },
    });

    return templates
      .map((template) => {
        const { score, reasons } = this.calculateSimilarityScore(
          baseTemplate,
          template,
        );

        return {
          template,
          score,
          reasons,
          confidence: this.calculateConfidence(score, reasons.length),
        };
      })
      .sort((a, b) => b.score - a.score)
      .slice(0, limit);
  }

  private calculateRecommendationScore(
    template: ProjectTemplate,
    context: RecommendationContext,
    preferences?: UserPreferences,
  ): { score: number; reasons: string[] } {
    let score = 0;
    const reasons: string[] = [];

    // Base popularity score
    score += Math.min(template.usageCount * 0.1, 20);
    if (template.usageCount > 10) {
      reasons.push('Popular choice');
    }

    // Category match
    if (context.industry && template.category === (context.industry as any)) {
      score += 30;
      reasons.push(`Perfect for ${context.industry} projects`);
    }

    // Methodology match
    if (
      context.methodology &&
      template.methodology === (context.methodology as any)
    ) {
      score += 25;
      reasons.push(`Uses ${context.methodology} methodology`);
    }

    // Team size compatibility
    if (context.teamSize) {
      const templateRoles = template.templateConfig.suggestedRoles.length;
      if (context.teamSize <= 5 && templateRoles <= 5) {
        score += 15;
        reasons.push('Good for small teams');
      } else if (context.teamSize > 5 && templateRoles > 5) {
        score += 15;
        reasons.push('Designed for larger teams');
      }
    }

    // Experience level match
    if (context.experienceLevel) {
      const isAdvanced =
        template.templateConfig.smartDefaults.enableStoryPoints ||
        template.templateConfig.smartDefaults.enableTimeTracking;

      if (context.experienceLevel === 'beginner' && !isAdvanced) {
        score += 20;
        reasons.push('Beginner-friendly');
      } else if (context.experienceLevel === 'advanced' && isAdvanced) {
        score += 20;
        reasons.push('Advanced features included');
      }
    }

    // User preferences match
    if (preferences?.preferences?.learning?.preferredIssueTypes) {
      const commonTypes = template.templateConfig.defaultIssueTypes.filter(
        (type) =>
          preferences.preferences.learning.preferredIssueTypes.includes(type),
      );
      if (commonTypes.length > 0) {
        score += commonTypes.length * 5;
        reasons.push(`Matches your preferred issue types`);
      }
    }

    // Previous template usage
    if (context.previousTemplates?.includes(template.id)) {
      score += 10;
      reasons.push("You've used this before");
    }

    // System template bonus
    if (template.isSystemTemplate) {
      score += 5;
      reasons.push('Verified template');
    }

    return { score, reasons };
  }

  private calculateSimilarityScore(
    baseTemplate: ProjectTemplate,
    template: ProjectTemplate,
  ): { score: number; reasons: string[] } {
    let score = 0;
    const reasons: string[] = [];

    // Same category
    if (baseTemplate.category === template.category) {
      score += 40;
      reasons.push('Same industry');
    }

    // Same methodology
    if (baseTemplate.methodology === template.methodology) {
      score += 30;
      reasons.push('Same methodology');
    }

    // Similar team structure
    const baseRoles = baseTemplate.templateConfig.suggestedRoles.length;
    const templateRoles = template.templateConfig.suggestedRoles.length;
    if (Math.abs(baseRoles - templateRoles) <= 2) {
      score += 15;
      reasons.push('Similar team structure');
    }

    // Similar complexity
    const baseComplex =
      baseTemplate.templateConfig.smartDefaults.enableStoryPoints ||
      baseTemplate.templateConfig.smartDefaults.enableTimeTracking;
    const templateComplex =
      template.templateConfig.smartDefaults.enableStoryPoints ||
      template.templateConfig.smartDefaults.enableTimeTracking;

    if (baseComplex === templateComplex) {
      score += 15;
      reasons.push('Similar complexity level');
    }

    return { score, reasons };
  }

  private calculateConfidence(
    score: number,
    reasonCount: number,
  ): 'low' | 'medium' | 'high' {
    if (score >= 60 && reasonCount >= 3) return 'high';
    if (score >= 40 && reasonCount >= 2) return 'medium';
    return 'low';
  }

  /**
   * Create default system templates
   */
  async createDefaultTemplates(): Promise<void> {
    const defaultTemplates = [
      {
        name: 'Software Development (Agile)',
        description:
          'Complete agile development workflow with sprints, stories, and retrospectives',
        category: ProjectCategory.SOFTWARE_DEVELOPMENT,
        methodology: ProjectMethodology.AGILE,
        templateConfig: {
          defaultSprintDuration: 14,
          defaultIssueTypes: ['Bug', 'Task', 'Story', 'Epic', 'Sub-task'],
          defaultPriorities: ['Low', 'Medium', 'High', 'Critical'],
          defaultStatuses: [
            'Backlog',
            'To Do',
            'In Progress',
            'In Review',
            'Done',
          ],
          suggestedRoles: [
            {
              role: 'Product Owner',
              description: 'Defines requirements and priorities',
              permissions: ['manage_backlog'],
            },
            {
              role: 'Scrum Master',
              description: 'Facilitates the process',
              permissions: ['manage_sprints'],
            },
            {
              role: 'Developer',
              description: 'Builds the product',
              permissions: ['manage_issues'],
            },
            {
              role: 'QA Engineer',
              description: 'Tests the product',
              permissions: ['manage_issues'],
            },
          ],
          workflowStages: [
            {
              name: 'Backlog',
              description: 'Items waiting to be planned',
              order: 1,
              isDefault: true,
            },
            {
              name: 'Sprint Planning',
              description: 'Planning next sprint',
              order: 2,
              isDefault: false,
            },
            {
              name: 'In Progress',
              description: 'Currently being worked on',
              order: 3,
              isDefault: true,
            },
            {
              name: 'Review',
              description: 'Ready for review',
              order: 4,
              isDefault: true,
            },
            {
              name: 'Done',
              description: 'Completed',
              order: 5,
              isDefault: true,
            },
          ],
          defaultBoards: [
            {
              name: 'Sprint Board',
              type: 'scrum' as const,
              columns: [
                { name: 'To Do', status: 'To Do', order: 1 },
                { name: 'In Progress', status: 'In Progress', order: 2 },
                { name: 'Review', status: 'In Review', order: 3 },
                { name: 'Done', status: 'Done', order: 4 },
              ],
            },
          ],
          defaultMilestones: [
            {
              name: 'Sprint 1',
              description: 'First sprint',
              estimatedDuration: 14,
              order: 1,
            },
            {
              name: 'Sprint 2',
              description: 'Second sprint',
              estimatedDuration: 14,
              order: 2,
            },
            {
              name: 'Release',
              description: 'Product release',
              estimatedDuration: 0,
              order: 3,
            },
          ],
          smartDefaults: {
            autoAssignIssues: false,
            suggestDueDates: true,
            enableTimeTracking: true,
            enableStoryPoints: true,
            defaultStoryPointScale: [1, 2, 3, 5, 8, 13, 21],
          },
        },
        icon: 'code',
        color: '#3B82F6',
        tags: ['agile', 'development', 'scrum'],
      },
      {
        name: 'Marketing Campaign',
        description:
          'End-to-end marketing campaign management with content planning and tracking',
        category: ProjectCategory.MARKETING,
        methodology: ProjectMethodology.KANBAN,
        templateConfig: {
          defaultSprintDuration: 7,
          defaultIssueTypes: [
            'Campaign',
            'Content',
            'Design',
            'Research',
            'Analysis',
          ],
          defaultPriorities: ['Low', 'Medium', 'High', 'Urgent'],
          defaultStatuses: [
            'Ideas',
            'Planning',
            'In Progress',
            'Review',
            'Published',
          ],
          suggestedRoles: [
            {
              role: 'Campaign Manager',
              description: 'Oversees the entire campaign',
              permissions: ['manage_campaign'],
            },
            {
              role: 'Content Creator',
              description: 'Creates marketing content',
              permissions: ['create_content'],
            },
            {
              role: 'Designer',
              description: 'Creates visual assets',
              permissions: ['create_designs'],
            },
            {
              role: 'Analyst',
              description: 'Analyzes campaign performance',
              permissions: ['view_analytics'],
            },
          ],
          workflowStages: [
            {
              name: 'Ideas',
              description: 'Campaign ideas and concepts',
              order: 1,
              isDefault: true,
            },
            {
              name: 'Planning',
              description: 'Detailed planning phase',
              order: 2,
              isDefault: true,
            },
            {
              name: 'Creation',
              description: 'Creating content and assets',
              order: 3,
              isDefault: true,
            },
            {
              name: 'Review',
              description: 'Review and approval',
              order: 4,
              isDefault: true,
            },
            {
              name: 'Published',
              description: 'Live and running',
              order: 5,
              isDefault: true,
            },
          ],
          defaultBoards: [
            {
              name: 'Campaign Board',
              type: 'kanban' as const,
              columns: [
                { name: 'Ideas', status: 'Ideas', order: 1 },
                { name: 'Planning', status: 'Planning', order: 2 },
                { name: 'In Progress', status: 'In Progress', order: 3 },
                { name: 'Review', status: 'Review', order: 4 },
                { name: 'Published', status: 'Published', order: 5 },
              ],
            },
          ],
          defaultMilestones: [
            {
              name: 'Campaign Launch',
              description: 'Campaign goes live',
              estimatedDuration: 0,
              order: 1,
            },
            {
              name: 'Mid-Campaign Review',
              description: 'Performance review',
              estimatedDuration: 14,
              order: 2,
            },
            {
              name: 'Campaign End',
              description: 'Campaign completion',
              estimatedDuration: 30,
              order: 3,
            },
          ],
          smartDefaults: {
            autoAssignIssues: true,
            suggestDueDates: true,
            enableTimeTracking: false,
            enableStoryPoints: false,
            defaultStoryPointScale: [],
          },
        },
        icon: 'megaphone',
        color: '#10B981',
        tags: ['marketing', 'campaign', 'content'],
      },
      // Add more default templates...
    ];

    for (const templateData of defaultTemplates) {
      const existingTemplate = await this.templateRepo.findOne({
        where: { name: templateData.name },
      });

      if (!existingTemplate) {
        const template = this.templateRepo.create(templateData);
        await this.templateRepo.save(template);
      }
    }
  }
}
