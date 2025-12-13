import { Injectable, Optional } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, Not } from 'typeorm';
import {
  ProjectTemplate,
  ProjectCategory,
  ProjectMethodology,
} from '../entities/project-template.entity';
import { UserPreferences } from '../../user-preferences/entities/user-preferences.entity';
import { CacheService } from '../../cache/cache.service';

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
  // Cache TTL: 5 minutes for template recommendations
  private readonly CACHE_TTL = 300;

  constructor(
    @InjectRepository(ProjectTemplate)
    private templateRepo: Repository<ProjectTemplate>,
    @InjectRepository(UserPreferences)
    private preferencesRepo: Repository<UserPreferences>,
    @Optional() private cacheService?: CacheService,
  ) {}

  /**
   * Get personalized template recommendations based on user context
   * Optimized with caching and pre-filtered SQL queries
   */
  async getRecommendations(
    context: RecommendationContext,
  ): Promise<TemplateRecommendation[]> {
    // Try to get from cache first
    const cacheKey = `template_recommendations:${context.userId}:${context.industry || 'all'}:${context.methodology || 'all'}`;

    if (this.cacheService) {
      const cached =
        await this.cacheService.get<TemplateRecommendation[]>(cacheKey);
      if (cached) {
        return cached;
      }
    }

    const userPreferences = await this.preferencesRepo.findOne({
      where: { userId: context.userId },
    });

    // Optimized query: pre-filter and limit in SQL using indexes
    const queryBuilder = this.templateRepo
      .createQueryBuilder('template')
      .where('template.isActive = :active', { active: true });

    // Pre-filter by category if specified (uses IDX_template_recommendation index)
    if (context.industry) {
      queryBuilder.andWhere(
        '(template.category = :category OR template.category = :custom)',
        { category: context.industry, custom: ProjectCategory.CUSTOM },
      );
    }

    // Pre-filter by methodology if specified
    if (context.methodology) {
      queryBuilder.andWhere(
        '(template.methodology = :methodology OR template.methodology = :hybrid)',
        { methodology: context.methodology, hybrid: ProjectMethodology.HYBRID },
      );
    }

    // Order by usage count (popular templates first) and limit early for performance
    const templates = await queryBuilder
      .orderBy('template.usageCount', 'DESC')
      .take(15) // Limit early - we only need top 5, get 15 for scoring
      .getMany();

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

    // Sort by score and return top 5 recommendations
    const result = recommendations
      .sort((a, b) => b.score - a.score)
      .slice(0, 5);

    if (this.cacheService) {
      await this.cacheService.set(cacheKey, result, { ttl: this.CACHE_TTL });
    }

    return result;
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
      // ========== SOFTWARE DEVELOPMENT ==========
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
            'Review',
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
                { name: 'Review', status: 'Review', order: 3 },
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
        icon: '💻',
        color: '#3B82F6',
        tags: [
          'agile',
          'development',
          'scrum',
          'structured',
          'iterative',
          'sprints',
          'team-focused',
        ],
      },
      {
        name: 'Software Development (Kanban)',
        description:
          'Continuous flow development with visual board and WIP limits',
        category: ProjectCategory.SOFTWARE_DEVELOPMENT,
        methodology: ProjectMethodology.KANBAN,
        templateConfig: {
          defaultSprintDuration: 0,
          defaultIssueTypes: ['Bug', 'Task', 'Feature', 'Improvement'],
          defaultPriorities: ['Low', 'Medium', 'High', 'Critical'],
          defaultStatuses: [
            'Backlog',
            'Ready',
            'In Progress',
            'In Review',
            'Done',
          ],
          suggestedRoles: [
            {
              role: 'Team Lead',
              description: 'Leads the development team',
              permissions: ['manage_board'],
            },
            {
              role: 'Developer',
              description: 'Builds features',
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
              description: 'Items waiting',
              order: 1,
              isDefault: true,
            },
            {
              name: 'Ready',
              description: 'Ready to start',
              order: 2,
              isDefault: true,
            },
            {
              name: 'In Progress',
              description: 'Being worked on',
              order: 3,
              isDefault: true,
            },
            {
              name: 'Done',
              description: 'Completed',
              order: 4,
              isDefault: true,
            },
          ],
          defaultBoards: [
            {
              name: 'Kanban Board',
              type: 'kanban' as const,
              columns: [
                { name: 'Backlog', status: 'Backlog', order: 1 },
                { name: 'Ready', status: 'Ready', order: 2 },
                { name: 'In Progress', status: 'In Progress', order: 3 },
                { name: 'Done', status: 'Done', order: 4 },
              ],
            },
          ],
          defaultMilestones: [],
          smartDefaults: {
            autoAssignIssues: false,
            suggestDueDates: false,
            enableTimeTracking: true,
            enableStoryPoints: false,
            defaultStoryPointScale: [],
          },
        },
        icon: '📋',
        color: '#6366F1',
        tags: [
          'kanban',
          'development',
          'continuous',
          'flexible',
          'flow-based',
          'maintenance',
        ],
      },
      // ========== MARKETING ==========
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
        icon: '📢',
        color: '#10B981',
        tags: [
          'marketing',
          'campaign',
          'content',
          'creative',
          'collaborative',
          'visual',
        ],
      },
      // ========== PRODUCT LAUNCH ==========
      {
        name: 'Product Launch',
        description:
          'Comprehensive product launch planning from ideation to market release',
        category: ProjectCategory.PRODUCT_LAUNCH,
        methodology: ProjectMethodology.HYBRID,
        templateConfig: {
          defaultSprintDuration: 14,
          defaultIssueTypes: [
            'Feature',
            'Milestone',
            'Risk',
            'Task',
            'Blocker',
          ],
          defaultPriorities: ['Low', 'Medium', 'High', 'Critical'],
          defaultStatuses: [
            'Planning',
            'In Development',
            'Beta',
            'Ready',
            'Launched',
          ],
          suggestedRoles: [
            {
              role: 'Product Manager',
              description: 'Owns the product vision',
              permissions: ['manage_product'],
            },
            {
              role: 'Engineering Lead',
              description: 'Leads development',
              permissions: ['manage_engineering'],
            },
            {
              role: 'Marketing Lead',
              description: 'Handles go-to-market',
              permissions: ['manage_marketing'],
            },
            {
              role: 'QA Lead',
              description: 'Ensures quality',
              permissions: ['manage_qa'],
            },
          ],
          workflowStages: [
            {
              name: 'Planning',
              description: 'Product planning',
              order: 1,
              isDefault: true,
            },
            {
              name: 'Development',
              description: 'Building the product',
              order: 2,
              isDefault: true,
            },
            {
              name: 'Beta',
              description: 'Beta testing phase',
              order: 3,
              isDefault: true,
            },
            {
              name: 'Launch Prep',
              description: 'Launch preparation',
              order: 4,
              isDefault: true,
            },
            {
              name: 'Launched',
              description: 'Product is live',
              order: 5,
              isDefault: true,
            },
          ],
          defaultBoards: [
            {
              name: 'Launch Board',
              type: 'kanban' as const,
              columns: [
                { name: 'Planning', status: 'Planning', order: 1 },
                { name: 'In Development', status: 'In Development', order: 2 },
                { name: 'Beta', status: 'Beta', order: 3 },
                { name: 'Ready', status: 'Ready', order: 4 },
                { name: 'Launched', status: 'Launched', order: 5 },
              ],
            },
          ],
          defaultMilestones: [
            {
              name: 'Feature Freeze',
              description: 'No new features',
              estimatedDuration: 30,
              order: 1,
            },
            {
              name: 'Beta Release',
              description: 'Beta testing begins',
              estimatedDuration: 45,
              order: 2,
            },
            {
              name: 'Launch Day',
              description: 'Product goes live',
              estimatedDuration: 60,
              order: 3,
            },
          ],
          smartDefaults: {
            autoAssignIssues: false,
            suggestDueDates: true,
            enableTimeTracking: true,
            enableStoryPoints: true,
            defaultStoryPointScale: [1, 2, 3, 5, 8, 13],
          },
        },
        icon: '🚀',
        color: '#F59E0B',
        tags: [
          'product',
          'launch',
          'cross-functional',
          'deadline-driven',
          'roadmap',
        ],
      },
      // ========== WEBSITE DEVELOPMENT ==========
      {
        name: 'Website Development',
        description:
          'Full website development project from design to deployment',
        category: ProjectCategory.WEBSITE_DEVELOPMENT,
        methodology: ProjectMethodology.AGILE,
        templateConfig: {
          defaultSprintDuration: 14,
          defaultIssueTypes: ['Page', 'Feature', 'Bug', 'Design', 'Content'],
          defaultPriorities: ['Low', 'Medium', 'High', 'Critical'],
          defaultStatuses: [
            'Backlog',
            'Design',
            'Development',
            'Testing',
            'Deployed',
          ],
          suggestedRoles: [
            {
              role: 'Project Manager',
              description: 'Manages the project',
              permissions: ['manage_project'],
            },
            {
              role: 'UI/UX Designer',
              description: 'Creates designs',
              permissions: ['manage_design'],
            },
            {
              role: 'Frontend Developer',
              description: 'Builds the frontend',
              permissions: ['manage_issues'],
            },
            {
              role: 'Backend Developer',
              description: 'Builds the backend',
              permissions: ['manage_issues'],
            },
          ],
          workflowStages: [
            {
              name: 'Backlog',
              description: 'Items to be done',
              order: 1,
              isDefault: true,
            },
            {
              name: 'Design',
              description: 'Design phase',
              order: 2,
              isDefault: true,
            },
            {
              name: 'Development',
              description: 'Building the site',
              order: 3,
              isDefault: true,
            },
            {
              name: 'Testing',
              description: 'Testing the site',
              order: 4,
              isDefault: true,
            },
            {
              name: 'Deployed',
              description: 'Live on production',
              order: 5,
              isDefault: true,
            },
          ],
          defaultBoards: [
            {
              name: 'Website Board',
              type: 'scrum' as const,
              columns: [
                { name: 'Backlog', status: 'Backlog', order: 1 },
                { name: 'Design', status: 'Design', order: 2 },
                { name: 'Development', status: 'Development', order: 3 },
                { name: 'Testing', status: 'Testing', order: 4 },
                { name: 'Deployed', status: 'Deployed', order: 5 },
              ],
            },
          ],
          defaultMilestones: [
            {
              name: 'Design Complete',
              description: 'All designs approved',
              estimatedDuration: 14,
              order: 1,
            },
            {
              name: 'Development Complete',
              description: 'All features built',
              estimatedDuration: 30,
              order: 2,
            },
            {
              name: 'Launch',
              description: 'Website goes live',
              estimatedDuration: 45,
              order: 3,
            },
          ],
          smartDefaults: {
            autoAssignIssues: false,
            suggestDueDates: true,
            enableTimeTracking: true,
            enableStoryPoints: true,
            defaultStoryPointScale: [1, 2, 3, 5, 8, 13],
          },
        },
        icon: '🌐',
        color: '#8B5CF6',
        tags: ['website', 'web', 'development'],
      },
      // ========== MOBILE DEVELOPMENT ==========
      {
        name: 'Mobile App Development',
        description:
          'Mobile application development with platform-specific workflows',
        category: ProjectCategory.MOBILE_DEVELOPMENT,
        methodology: ProjectMethodology.SCRUM,
        templateConfig: {
          defaultSprintDuration: 14,
          defaultIssueTypes: [
            'Feature',
            'Bug',
            'UI/UX',
            'Performance',
            'Testing',
          ],
          defaultPriorities: ['Low', 'Medium', 'High', 'Critical'],
          defaultStatuses: [
            'Backlog',
            'In Progress',
            'Code Review',
            'Testing',
            'Ready for Release',
            'Released',
          ],
          suggestedRoles: [
            {
              role: 'Product Owner',
              description: 'Owns the product',
              permissions: ['manage_backlog'],
            },
            {
              role: 'iOS Developer',
              description: 'Builds iOS app',
              permissions: ['manage_issues'],
            },
            {
              role: 'Android Developer',
              description: 'Builds Android app',
              permissions: ['manage_issues'],
            },
            {
              role: 'QA Engineer',
              description: 'Tests the apps',
              permissions: ['manage_issues'],
            },
          ],
          workflowStages: [
            {
              name: 'Backlog',
              description: 'Pending items',
              order: 1,
              isDefault: true,
            },
            {
              name: 'In Progress',
              description: 'Being developed',
              order: 2,
              isDefault: true,
            },
            {
              name: 'Code Review',
              description: 'Under review',
              order: 3,
              isDefault: true,
            },
            {
              name: 'Testing',
              description: 'QA testing',
              order: 4,
              isDefault: true,
            },
            {
              name: 'Released',
              description: 'In the app store',
              order: 5,
              isDefault: true,
            },
          ],
          defaultBoards: [
            {
              name: 'Mobile Sprint Board',
              type: 'scrum' as const,
              columns: [
                { name: 'Backlog', status: 'Backlog', order: 1 },
                { name: 'In Progress', status: 'In Progress', order: 2 },
                { name: 'Code Review', status: 'Code Review', order: 3 },
                { name: 'Testing', status: 'Testing', order: 4 },
                { name: 'Released', status: 'Released', order: 5 },
              ],
            },
          ],
          defaultMilestones: [
            {
              name: 'Alpha Build',
              description: 'Internal testing build',
              estimatedDuration: 21,
              order: 1,
            },
            {
              name: 'Beta Release',
              description: 'TestFlight/Beta release',
              estimatedDuration: 42,
              order: 2,
            },
            {
              name: 'App Store Release',
              description: 'Public release',
              estimatedDuration: 60,
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
        icon: '📱',
        color: '#EC4899',
        tags: ['mobile', 'ios', 'android', 'app'],
      },
      // ========== EVENT PLANNING ==========
      {
        name: 'Event Planning',
        description:
          'Plan and execute events with vendor management and logistics tracking',
        category: ProjectCategory.EVENT_PLANNING,
        methodology: ProjectMethodology.WATERFALL,
        templateConfig: {
          defaultSprintDuration: 0,
          defaultIssueTypes: [
            'Task',
            'Vendor',
            'Logistics',
            'Marketing',
            'Follow-up',
          ],
          defaultPriorities: ['Low', 'Medium', 'High', 'Urgent'],
          defaultStatuses: [
            'Planning',
            'Confirmed',
            'In Progress',
            'Event Day',
            'Post-Event',
          ],
          suggestedRoles: [
            {
              role: 'Event Manager',
              description: 'Manages the event',
              permissions: ['manage_event'],
            },
            {
              role: 'Vendor Coordinator',
              description: 'Handles vendors',
              permissions: ['manage_vendors'],
            },
            {
              role: 'Marketing Coordinator',
              description: 'Handles promotion',
              permissions: ['manage_marketing'],
            },
            {
              role: 'Logistics Coordinator',
              description: 'Handles logistics',
              permissions: ['manage_logistics'],
            },
          ],
          workflowStages: [
            {
              name: 'Planning',
              description: 'Initial planning',
              order: 1,
              isDefault: true,
            },
            {
              name: 'Vendor Selection',
              description: 'Selecting vendors',
              order: 2,
              isDefault: true,
            },
            {
              name: 'Preparation',
              description: 'Event preparation',
              order: 3,
              isDefault: true,
            },
            {
              name: 'Event Day',
              description: 'The event',
              order: 4,
              isDefault: true,
            },
            {
              name: 'Post-Event',
              description: 'Follow-up and review',
              order: 5,
              isDefault: true,
            },
          ],
          defaultBoards: [
            {
              name: 'Event Board',
              type: 'kanban' as const,
              columns: [
                { name: 'Planning', status: 'Planning', order: 1 },
                { name: 'Confirmed', status: 'Confirmed', order: 2 },
                { name: 'In Progress', status: 'In Progress', order: 3 },
                { name: 'Done', status: 'Done', order: 4 },
              ],
            },
          ],
          defaultMilestones: [
            {
              name: 'Venue Booked',
              description: 'Venue confirmed',
              estimatedDuration: 14,
              order: 1,
            },
            {
              name: 'Vendors Confirmed',
              description: 'All vendors confirmed',
              estimatedDuration: 30,
              order: 2,
            },
            {
              name: 'Event Day',
              description: 'The main event',
              estimatedDuration: 60,
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
        icon: '🎉',
        color: '#F97316',
        tags: ['event', 'planning', 'coordination'],
      },
      // ========== RESEARCH ==========
      {
        name: 'Research & Development',
        description:
          'Research project management with hypothesis tracking and experiment workflows',
        category: ProjectCategory.RESEARCH,
        methodology: ProjectMethodology.AGILE,
        templateConfig: {
          defaultSprintDuration: 21,
          defaultIssueTypes: [
            'Hypothesis',
            'Experiment',
            'Analysis',
            'Documentation',
            'Review',
          ],
          defaultPriorities: ['Low', 'Medium', 'High', 'Critical'],
          defaultStatuses: [
            'Proposed',
            'In Progress',
            'Analysis',
            'Review',
            'Completed',
          ],
          suggestedRoles: [
            {
              role: 'Principal Researcher',
              description: 'Leads the research',
              permissions: ['manage_research'],
            },
            {
              role: 'Researcher',
              description: 'Conducts research',
              permissions: ['manage_issues'],
            },
            {
              role: 'Data Analyst',
              description: 'Analyzes data',
              permissions: ['manage_issues'],
            },
            {
              role: 'Reviewer',
              description: 'Reviews findings',
              permissions: ['view_issues'],
            },
          ],
          workflowStages: [
            {
              name: 'Proposed',
              description: 'Proposed research',
              order: 1,
              isDefault: true,
            },
            {
              name: 'In Progress',
              description: 'Research in progress',
              order: 2,
              isDefault: true,
            },
            {
              name: 'Analysis',
              description: 'Analyzing results',
              order: 3,
              isDefault: true,
            },
            {
              name: 'Documentation',
              description: 'Documenting findings',
              order: 4,
              isDefault: true,
            },
            {
              name: 'Completed',
              description: 'Research complete',
              order: 5,
              isDefault: true,
            },
          ],
          defaultBoards: [
            {
              name: 'Research Board',
              type: 'kanban' as const,
              columns: [
                { name: 'Proposed', status: 'Proposed', order: 1 },
                { name: 'In Progress', status: 'In Progress', order: 2 },
                { name: 'Analysis', status: 'Analysis', order: 3 },
                { name: 'Completed', status: 'Completed', order: 4 },
              ],
            },
          ],
          defaultMilestones: [
            {
              name: 'Initial Findings',
              description: 'First results',
              estimatedDuration: 30,
              order: 1,
            },
            {
              name: 'Final Report',
              description: 'Complete documentation',
              estimatedDuration: 60,
              order: 2,
            },
          ],
          smartDefaults: {
            autoAssignIssues: false,
            suggestDueDates: true,
            enableTimeTracking: true,
            enableStoryPoints: false,
            defaultStoryPointScale: [],
          },
        },
        icon: '🔬',
        color: '#06B6D4',
        tags: ['research', 'r&d', 'experiment'],
      },
      // ========== DATA ANALYSIS ==========
      {
        name: 'Data Analysis Project',
        description:
          'Data analysis and reporting workflow with visualization tracking',
        category: ProjectCategory.DATA_ANALYSIS,
        methodology: ProjectMethodology.KANBAN,
        templateConfig: {
          defaultSprintDuration: 0,
          defaultIssueTypes: [
            'Analysis',
            'Report',
            'Visualization',
            'Data Quality',
            'Insight',
          ],
          defaultPriorities: ['Low', 'Medium', 'High', 'Critical'],
          defaultStatuses: [
            'Backlog',
            'Data Prep',
            'Analysis',
            'Visualization',
            'Delivered',
          ],
          suggestedRoles: [
            {
              role: 'Lead Analyst',
              description: 'Leads analysis',
              permissions: ['manage_analysis'],
            },
            {
              role: 'Data Analyst',
              description: 'Performs analysis',
              permissions: ['manage_issues'],
            },
            {
              role: 'Data Engineer',
              description: 'Prepares data',
              permissions: ['manage_issues'],
            },
          ],
          workflowStages: [
            {
              name: 'Backlog',
              description: 'Pending analysis',
              order: 1,
              isDefault: true,
            },
            {
              name: 'Data Prep',
              description: 'Preparing data',
              order: 2,
              isDefault: true,
            },
            {
              name: 'Analysis',
              description: 'Performing analysis',
              order: 3,
              isDefault: true,
            },
            {
              name: 'Visualization',
              description: 'Creating visuals',
              order: 4,
              isDefault: true,
            },
            {
              name: 'Delivered',
              description: 'Delivered to stakeholders',
              order: 5,
              isDefault: true,
            },
          ],
          defaultBoards: [
            {
              name: 'Analysis Board',
              type: 'kanban' as const,
              columns: [
                { name: 'Backlog', status: 'Backlog', order: 1 },
                { name: 'Data Prep', status: 'Data Prep', order: 2 },
                { name: 'Analysis', status: 'Analysis', order: 3 },
                { name: 'Delivered', status: 'Delivered', order: 4 },
              ],
            },
          ],
          defaultMilestones: [],
          smartDefaults: {
            autoAssignIssues: false,
            suggestDueDates: true,
            enableTimeTracking: true,
            enableStoryPoints: false,
            defaultStoryPointScale: [],
          },
        },
        icon: '📊',
        color: '#14B8A6',
        tags: ['data', 'analysis', 'reporting'],
      },
      // ========== DESIGN ==========
      {
        name: 'Design Project',
        description:
          'Creative design project with feedback loops and asset management',
        category: ProjectCategory.DESIGN,
        methodology: ProjectMethodology.KANBAN,
        templateConfig: {
          defaultSprintDuration: 0,
          defaultIssueTypes: [
            'Design',
            'Mockup',
            'Prototype',
            'Review',
            'Asset',
          ],
          defaultPriorities: ['Low', 'Medium', 'High', 'Urgent'],
          defaultStatuses: [
            'Briefing',
            'Concept',
            'Design',
            'Review',
            'Approved',
          ],
          suggestedRoles: [
            {
              role: 'Creative Director',
              description: 'Leads creative vision',
              permissions: ['manage_design'],
            },
            {
              role: 'UI Designer',
              description: 'Creates UI designs',
              permissions: ['manage_issues'],
            },
            {
              role: 'UX Designer',
              description: 'Creates UX flows',
              permissions: ['manage_issues'],
            },
            {
              role: 'Graphic Designer',
              description: 'Creates graphics',
              permissions: ['manage_issues'],
            },
          ],
          workflowStages: [
            {
              name: 'Briefing',
              description: 'Understanding requirements',
              order: 1,
              isDefault: true,
            },
            {
              name: 'Concept',
              description: 'Conceptual designs',
              order: 2,
              isDefault: true,
            },
            {
              name: 'Design',
              description: 'Final designs',
              order: 3,
              isDefault: true,
            },
            {
              name: 'Review',
              description: 'Client review',
              order: 4,
              isDefault: true,
            },
            {
              name: 'Approved',
              description: 'Design approved',
              order: 5,
              isDefault: true,
            },
          ],
          defaultBoards: [
            {
              name: 'Design Board',
              type: 'kanban' as const,
              columns: [
                { name: 'Briefing', status: 'Briefing', order: 1 },
                { name: 'Concept', status: 'Concept', order: 2 },
                { name: 'Design', status: 'Design', order: 3 },
                { name: 'Review', status: 'Review', order: 4 },
                { name: 'Approved', status: 'Approved', order: 5 },
              ],
            },
          ],
          defaultMilestones: [],
          smartDefaults: {
            autoAssignIssues: true,
            suggestDueDates: true,
            enableTimeTracking: false,
            enableStoryPoints: false,
            defaultStoryPointScale: [],
          },
        },
        icon: '🎨',
        color: '#A855F7',
        tags: ['design', 'creative', 'ui', 'ux'],
      },
      // ========== SALES ==========
      {
        name: 'Sales Pipeline',
        description: 'Sales opportunity tracking and pipeline management',
        category: ProjectCategory.SALES,
        methodology: ProjectMethodology.KANBAN,
        templateConfig: {
          defaultSprintDuration: 0,
          defaultIssueTypes: [
            'Lead',
            'Opportunity',
            'Follow-up',
            'Proposal',
            'Contract',
          ],
          defaultPriorities: ['Low', 'Medium', 'High', 'Hot'],
          defaultStatuses: [
            'New Lead',
            'Qualified',
            'Proposal',
            'Negotiation',
            'Won',
            'Lost',
          ],
          suggestedRoles: [
            {
              role: 'Sales Manager',
              description: 'Manages sales team',
              permissions: ['manage_sales'],
            },
            {
              role: 'Account Executive',
              description: 'Closes deals',
              permissions: ['manage_issues'],
            },
            {
              role: 'SDR',
              description: 'Qualifies leads',
              permissions: ['manage_issues'],
            },
          ],
          workflowStages: [
            {
              name: 'New Lead',
              description: 'New incoming lead',
              order: 1,
              isDefault: true,
            },
            {
              name: 'Qualified',
              description: 'Lead qualified',
              order: 2,
              isDefault: true,
            },
            {
              name: 'Proposal',
              description: 'Proposal sent',
              order: 3,
              isDefault: true,
            },
            {
              name: 'Negotiation',
              description: 'In negotiation',
              order: 4,
              isDefault: true,
            },
            {
              name: 'Closed',
              description: 'Deal closed',
              order: 5,
              isDefault: true,
            },
          ],
          defaultBoards: [
            {
              name: 'Sales Pipeline',
              type: 'kanban' as const,
              columns: [
                { name: 'New Lead', status: 'New Lead', order: 1 },
                { name: 'Qualified', status: 'Qualified', order: 2 },
                { name: 'Proposal', status: 'Proposal', order: 3 },
                { name: 'Negotiation', status: 'Negotiation', order: 4 },
                { name: 'Won', status: 'Won', order: 5 },
              ],
            },
          ],
          defaultMilestones: [],
          smartDefaults: {
            autoAssignIssues: true,
            suggestDueDates: true,
            enableTimeTracking: false,
            enableStoryPoints: false,
            defaultStoryPointScale: [],
          },
        },
        icon: '💼',
        color: '#EF4444',
        tags: ['sales', 'pipeline', 'crm'],
      },
      // ========== BUG TRACKING ==========
      {
        name: 'Bug Tracking',
        description:
          'Track and manage bugs throughout the development lifecycle with priority-based workflows',
        category: ProjectCategory.SOFTWARE_DEVELOPMENT,
        methodology: ProjectMethodology.KANBAN,
        templateConfig: {
          defaultSprintDuration: 0,
          defaultIssueTypes: [
            'Bug',
            'Defect',
            'Regression',
            'Enhancement',
            'Hotfix',
          ],
          defaultPriorities: ['Critical', 'High', 'Medium', 'Low'],
          defaultStatuses: [
            'Reported',
            'Confirmed',
            'In Progress',
            'Testing',
            'Resolved',
            'Closed',
          ],
          suggestedRoles: [
            {
              role: 'QA Lead',
              description: 'Manages QA processes and priorities',
              permissions: ['manage_issues'],
            },
            {
              role: 'QA Engineer',
              description: 'Tests and verifies bugs',
              permissions: ['manage_issues'],
            },
            {
              role: 'Developer',
              description: 'Fixes bugs',
              permissions: ['manage_issues'],
            },
          ],
          workflowStages: [
            {
              name: 'Reported',
              description: 'Newly reported bug',
              order: 1,
              isDefault: true,
            },
            {
              name: 'Confirmed',
              description: 'Bug confirmed and reproduced',
              order: 2,
              isDefault: true,
            },
            {
              name: 'In Progress',
              description: 'Being fixed',
              order: 3,
              isDefault: true,
            },
            {
              name: 'Testing',
              description: 'Fix is being tested',
              order: 4,
              isDefault: true,
            },
            {
              name: 'Resolved',
              description: 'Bug fixed and verified',
              order: 5,
              isDefault: true,
            },
          ],
          defaultBoards: [
            {
              name: 'Bug Board',
              type: 'kanban' as const,
              columns: [
                { name: 'Reported', status: 'Reported', order: 1 },
                { name: 'Confirmed', status: 'Confirmed', order: 2 },
                { name: 'In Progress', status: 'In Progress', order: 3 },
                { name: 'Testing', status: 'Testing', order: 4 },
                { name: 'Resolved', status: 'Resolved', order: 5 },
              ],
            },
          ],
          defaultMilestones: [],
          smartDefaults: {
            autoAssignIssues: false,
            suggestDueDates: true,
            enableTimeTracking: true,
            enableStoryPoints: false,
            defaultStoryPointScale: [],
          },
        },
        icon: '🐛',
        color: '#DC2626',
        tags: ['bug', 'qa', 'testing', 'defects'],
      },
      // ========== HR ONBOARDING ==========
      {
        name: 'HR Onboarding',
        description:
          'Streamline employee onboarding with structured checklists and task tracking',
        category: ProjectCategory.CUSTOM,
        methodology: ProjectMethodology.KANBAN,
        templateConfig: {
          defaultSprintDuration: 0,
          defaultIssueTypes: [
            'Onboarding Task',
            'Document',
            'Training',
            'Equipment',
            'Access Request',
          ],
          defaultPriorities: ['Urgent', 'High', 'Medium', 'Low'],
          defaultStatuses: [
            'Not Started',
            'In Progress',
            'Pending Approval',
            'Completed',
          ],
          suggestedRoles: [
            {
              role: 'HR Manager',
              description: 'Oversees onboarding process',
              permissions: ['manage_project'],
            },
            {
              role: 'HR Coordinator',
              description: 'Coordinates onboarding tasks',
              permissions: ['manage_issues'],
            },
            {
              role: 'IT Support',
              description: 'Handles equipment and access',
              permissions: ['manage_issues'],
            },
          ],
          workflowStages: [
            {
              name: 'Not Started',
              description: 'Task not yet begun',
              order: 1,
              isDefault: true,
            },
            {
              name: 'In Progress',
              description: 'Task is underway',
              order: 2,
              isDefault: true,
            },
            {
              name: 'Pending Approval',
              description: 'Awaiting sign-off',
              order: 3,
              isDefault: true,
            },
            {
              name: 'Completed',
              description: 'Task finished',
              order: 4,
              isDefault: true,
            },
          ],
          defaultBoards: [
            {
              name: 'Onboarding Board',
              type: 'kanban' as const,
              columns: [
                { name: 'Not Started', status: 'Not Started', order: 1 },
                { name: 'In Progress', status: 'In Progress', order: 2 },
                {
                  name: 'Pending Approval',
                  status: 'Pending Approval',
                  order: 3,
                },
                { name: 'Completed', status: 'Completed', order: 4 },
              ],
            },
          ],
          defaultMilestones: [
            {
              name: 'Day 1 Complete',
              description: 'First day tasks finished',
              estimatedDuration: 1,
              order: 1,
            },
            {
              name: 'Week 1 Complete',
              description: 'First week onboarding finished',
              estimatedDuration: 7,
              order: 2,
            },
            {
              name: 'Fully Onboarded',
              description: 'Employee fully onboarded',
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
        icon: '👤',
        color: '#0EA5E9',
        tags: ['hr', 'onboarding', 'employee', 'recruitment'],
      },
      // ========== EVENT PLANNING ==========
      {
        name: 'Event Planning',
        description:
          'Plan and execute events with vendor management, logistics, and timeline tracking',
        category: ProjectCategory.EVENT_PLANNING,
        methodology: ProjectMethodology.KANBAN,
        templateConfig: {
          defaultSprintDuration: 0,
          defaultIssueTypes: [
            'Task',
            'Vendor',
            'Logistics',
            'Marketing',
            'Budget',
          ],
          defaultPriorities: ['Critical', 'High', 'Medium', 'Low'],
          defaultStatuses: [
            'Ideas',
            'Planning',
            'In Progress',
            'Ready',
            'Complete',
          ],
          suggestedRoles: [
            {
              role: 'Event Manager',
              description: 'Leads event planning',
              permissions: ['manage_project'],
            },
            {
              role: 'Event Coordinator',
              description: 'Coordinates logistics',
              permissions: ['manage_issues'],
            },
            {
              role: 'Marketing Lead',
              description: 'Handles event promotion',
              permissions: ['manage_issues'],
            },
          ],
          workflowStages: [
            {
              name: 'Ideas',
              description: 'Initial concepts',
              order: 1,
              isDefault: true,
            },
            {
              name: 'Planning',
              description: 'Detailed planning',
              order: 2,
              isDefault: true,
            },
            {
              name: 'In Progress',
              description: 'Execution phase',
              order: 3,
              isDefault: true,
            },
            {
              name: 'Ready',
              description: 'Ready for event',
              order: 4,
              isDefault: true,
            },
            {
              name: 'Complete',
              description: 'Task finished',
              order: 5,
              isDefault: true,
            },
          ],
          defaultBoards: [
            {
              name: 'Event Board',
              type: 'kanban' as const,
              columns: [
                { name: 'Ideas', status: 'Ideas', order: 1 },
                { name: 'Planning', status: 'Planning', order: 2 },
                { name: 'In Progress', status: 'In Progress', order: 3 },
                { name: 'Ready', status: 'Ready', order: 4 },
                { name: 'Complete', status: 'Complete', order: 5 },
              ],
            },
          ],
          defaultMilestones: [
            {
              name: 'Venue Confirmed',
              description: 'Event venue booked',
              estimatedDuration: 14,
              order: 1,
            },
            {
              name: 'Event Day',
              description: 'The event itself',
              estimatedDuration: 60,
              order: 2,
            },
            {
              name: 'Post-Event Review',
              description: 'Review and follow-up',
              estimatedDuration: 75,
              order: 3,
            },
          ],
          smartDefaults: {
            autoAssignIssues: true,
            suggestDueDates: true,
            enableTimeTracking: true,
            enableStoryPoints: false,
            defaultStoryPointScale: [],
          },
        },
        icon: '🎉',
        color: '#A855F7',
        tags: ['event', 'planning', 'conference', 'meeting'],
      },
      // ========== CONTENT CALENDAR ==========
      {
        name: 'Content Calendar',
        description:
          'Plan, create, and publish content with editorial workflow and scheduling',
        category: ProjectCategory.MARKETING,
        methodology: ProjectMethodology.KANBAN,
        templateConfig: {
          defaultSprintDuration: 0,
          defaultIssueTypes: [
            'Blog Post',
            'Social Media',
            'Video',
            'Newsletter',
            'Podcast',
          ],
          defaultPriorities: ['Urgent', 'High', 'Medium', 'Low'],
          defaultStatuses: [
            'Ideas',
            'Writing',
            'Editing',
            'Scheduled',
            'Published',
          ],
          suggestedRoles: [
            {
              role: 'Content Manager',
              description: 'Manages content strategy',
              permissions: ['manage_project'],
            },
            {
              role: 'Writer',
              description: 'Creates content',
              permissions: ['manage_issues'],
            },
            {
              role: 'Editor',
              description: 'Reviews and edits content',
              permissions: ['manage_issues'],
            },
            {
              role: 'Designer',
              description: 'Creates visual assets',
              permissions: ['manage_issues'],
            },
          ],
          workflowStages: [
            {
              name: 'Ideas',
              description: 'Content ideas',
              order: 1,
              isDefault: true,
            },
            {
              name: 'Writing',
              description: 'Content being written',
              order: 2,
              isDefault: true,
            },
            {
              name: 'Editing',
              description: 'Under review',
              order: 3,
              isDefault: true,
            },
            {
              name: 'Scheduled',
              description: 'Ready to publish',
              order: 4,
              isDefault: true,
            },
            {
              name: 'Published',
              description: 'Live content',
              order: 5,
              isDefault: true,
            },
          ],
          defaultBoards: [
            {
              name: 'Content Board',
              type: 'kanban' as const,
              columns: [
                { name: 'Ideas', status: 'Ideas', order: 1 },
                { name: 'Writing', status: 'Writing', order: 2 },
                { name: 'Editing', status: 'Editing', order: 3 },
                { name: 'Scheduled', status: 'Scheduled', order: 4 },
                { name: 'Published', status: 'Published', order: 5 },
              ],
            },
          ],
          defaultMilestones: [],
          smartDefaults: {
            autoAssignIssues: false,
            suggestDueDates: true,
            enableTimeTracking: false,
            enableStoryPoints: false,
            defaultStoryPointScale: [],
          },
        },
        icon: '📅',
        color: '#F97316',
        tags: ['content', 'marketing', 'blog', 'social media'],
      },
    ];

    for (const templateData of defaultTemplates) {
      const existingTemplate = await this.templateRepo.findOne({
        where: { name: templateData.name },
      });

      if (existingTemplate) {
        // Update existing template to ensure fixes (like status mapping) are applied
        Object.assign(existingTemplate, templateData);
        await this.templateRepo.save(existingTemplate);
      } else {
        const template = this.templateRepo.create(templateData);
        await this.templateRepo.save(template);
      }
    }
  }
}
