import {
  Injectable,
  NotFoundException,
  Inject,
  forwardRef,
  Logger,
  Optional,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource } from 'typeorm';
import { CacheService } from '../../cache/cache.service';
import {
  ProjectTemplate,
  ProjectCategory,
  ProjectMethodology,
} from '../entities/project-template.entity';
import { UserPreferences } from '../../user-preferences/entities/user-preferences.entity';
import { ProjectsService } from '../../projects/projects.service';
import { CreateProjectDto } from '../../projects/dto/create-project.dto';
import { BoardsService } from '../../boards/boards.service';
import { SprintsService } from '../../sprints/sprints.service';
import { Project } from '../../projects/entities/project.entity';
import { ProjectIntelligenceService } from '../../ai/services/project-intelligence.service';
import { TemplateScorerService } from '../../ai/services/template-scorer.service';
import {
  IntelligentCriteria,
  TeamSizeRange,
  TimelineRange,
} from '../../ai/interfaces/intelligent-criteria.interface';
// NEW: Import unified template application service
import { TemplateApplicationService } from './template-application.service';

export interface WizardQuestion {
  id: string;
  question: string;
  type: 'single' | 'multiple' | 'text' | 'number' | 'select';
  options?: Array<{ value: string; label: string; description?: string }>;
  required: boolean;
  order: number;
  category: string;
}

export interface WizardResponse {
  questionId: string;
  answer: string | string[] | number;
  timestamp: Date;
}

export interface ProjectWizardData {
  projectName: string;
  projectKey?: string;
  description?: string;
  teamSize: string;
  timeline: 'short' | 'medium' | 'long'; // 1-3 months, 3-6 months, 6+ months
  industry: string;
  methodology: ProjectMethodology;
  // goals: string[]; // Removed as it was causing type errors and not in interface
  complexity: 'simple' | 'moderate' | 'complex';
  teamExperience: 'beginner' | 'intermediate' | 'advanced';
  // hasExternalStakeholders: boolean; // Removed
  // requiresCompliance: boolean; // Removed
  // budget: 'low' | 'medium' | 'high'; // Removed
  userExperience: 'beginner' | 'intermediate' | 'advanced';
}

@Injectable()
export class ProjectWizardService {
  private readonly logger = new Logger(ProjectWizardService.name);

  constructor(
    @InjectRepository(ProjectTemplate)
    private templateRepo: Repository<ProjectTemplate>,
    @InjectRepository(UserPreferences)
    private preferencesRepo: Repository<UserPreferences>,
    @InjectRepository(Project)
    private projectRepo: Repository<Project>,
    private projectsService: ProjectsService,
    @Inject(forwardRef(() => BoardsService))
    private boardsService: BoardsService,
    @Inject(forwardRef(() => SprintsService))
    private sprintsService: SprintsService,
    private dataSource: DataSource,
    @Optional() private projectIntelligence?: ProjectIntelligenceService,
    @Optional() private cacheService?: CacheService,
    @Optional() private templateScorer?: TemplateScorerService,
    // NEW: Unified template application service
    @Optional() private templateApplicationService?: TemplateApplicationService,
  ) {}

  /**
   * Get wizard questions based on user's experience and preferences
   */
  getWizardQuestions(): WizardQuestion[] {
    const baseQuestions: WizardQuestion[] = [
      {
        id: 'projectName',
        question: 'What would you like to call your project?',
        type: 'text',
        required: true,
        order: 1,
        category: 'basic',
      },
      {
        id: 'description',
        question: 'Briefly describe what this project is about',
        type: 'text',
        required: false,
        order: 2,
        category: 'basic',
      },
      {
        id: 'teamSize',
        question: 'How many people will be working on this project?',
        type: 'select',
        options: [
          { value: '1', label: 'Just me (Solo)' },
          { value: '2-5', label: 'Small Team (2-5)' },
          { value: '6-10', label: 'Medium Team (6-10)' },
          { value: '11-20', label: 'Large Team (11-20)' },
          { value: '20+', label: 'Enterprise (20+)' },
        ],
        required: true,
        order: 3,
        category: 'team',
      },
      {
        id: 'timeline',
        question: 'What is the expected timeline?',
        type: 'select',
        options: [
          { value: 'short', label: 'Short Term (< 3 months)' },
          { value: 'medium', label: 'Medium Term (3-6 months)' },
          { value: 'long', label: 'Long Term (6+ months)' },
        ],
        required: true,
        order: 4,
        category: 'timeline',
      },
      {
        id: 'industry',
        question: 'What industry is this project for?',
        type: 'select',
        options: [
          {
            value: 'technology',
            label: 'Technology / Software',
            description: 'Software, SaaS, IT',
          },
          {
            value: 'healthcare',
            label: 'Healthcare / Medical',
            description: 'Clinics, hospitals, patient care',
          },
          {
            value: 'fintech',
            label: 'Fintech / Finance',
            description: 'Banking, payments, trading',
          },
          {
            value: 'ecommerce',
            label: 'E-commerce / Retail',
            description: 'Online stores, inventory',
          },
          {
            value: 'education',
            label: 'Education / EdTech',
            description: 'Schools, courses, learning',
          },
          {
            value: 'agency',
            label: 'Agency / Consulting',
            description: 'Client work, creative',
          },
          {
            value: 'startup',
            label: 'Startup / General',
            description: 'MVPs, side projects',
          },
          {
            value: 'enterprise',
            label: 'Enterprise / Corporate',
            description: 'Large organizations',
          },
        ],
        required: true,
        order: 5,
        category: 'industry',
      },
      {
        id: 'methodology',
        question: 'How do you prefer to manage work?',
        type: 'select',
        options: [
          { value: 'agile', label: 'Agile (Flexible, Iterative)' },
          { value: 'scrum', label: 'Scrum (Sprints, Structured)' },
          { value: 'kanban', label: 'Kanban (Continuous Flow)' },
          { value: 'waterfall', label: 'Waterfall (Sequential Phases)' },
          { value: 'hybrid', label: 'Hybrid (Mix of styles)' },
        ],
        required: true,
        order: 6,
        category: 'methodology',
      },
      {
        id: 'complexity',
        question: 'How complex is this project?',
        type: 'select',
        options: [
          {
            value: 'simple',
            label: 'Simple',
            description: 'Basic workflows, small scope',
          },
          {
            value: 'moderate',
            label: 'Moderate',
            description: 'Standard complexity',
          },
          {
            value: 'complex',
            label: 'Complex',
            description: 'Approvals, compliance, large scope',
          },
        ],
        required: true,
        order: 7,
        category: 'complexity',
      },
      {
        id: 'userExperience',
        question: 'What is your experience level with project management?',
        type: 'select',
        options: [
          { value: 'beginner', label: 'Beginner (Guide me)' },
          { value: 'intermediate', label: 'Intermediate' },
          { value: 'advanced', label: 'Advanced (Expert)' },
        ],
        required: true,
        order: 8,
        category: 'team',
      },
    ];
    return baseQuestions;
  }

  /**
   * Process wizard answers and return recommended templates + configuration
   * Priority: 1. TemplateScorerService (enhanced 7-factor) → 2. AI Intelligence → 3. Local fallback
   */
  async processWizardResponses(
    userId: string,
    responses: WizardResponse[],
  ): Promise<{ recommendations: any[]; suggestedConfig: any }> {
    const wizardData = this.parseWizardResponses(responses);

    // PRIORITY 1: Try TemplateScorerService (enhanced 7-factor scoring)
    // This works WITHOUT AI and uses the new industry/complexity matching
    if (this.templateScorer) {
      try {
        const criteria = this.convertToIntelligentCriteria(wizardData);
        const { results, templates } =
          await this.templateScorer.getTopRecommendations(
            criteria,
            null, // userPrefs
            5, // limit
          );

        if (results && results.length > 0) {
          this.logger.log(
            'Using TemplateScorerService for wizard recommendations',
          );

          const recommendations = results
            .map((r) => {
              const template = templates.get(r.templateId);
              return {
                template,
                score: r.score,
                reasons: this.generateReasons(r.breakdown),
                confidence: r.confidence,
                breakdown: r.breakdown,
              };
            })
            .filter((r) => r.template); // Filter out any without templates

          if (recommendations.length > 0) {
            return {
              recommendations,
              suggestedConfig: this.generateSuggestedConfig(
                wizardData,
                recommendations[0]?.template,
              ),
            };
          }
        }
      } catch (error) {
        this.logger.warn(
          'TemplateScorerService failed, trying AI fallback',
          error,
        );
      }
    }

    // PRIORITY 2: AI-Enhanced Setup
    if (this.projectIntelligence?.isAvailable) {
      try {
        const aiRecommendation =
          await this.projectIntelligence.generateProjectRecommendation({
            projectName: wizardData.projectName,
            projectDescription: wizardData.description,
            teamSize: parseInt(wizardData.teamSize.replace(/\D/g, '')) || 5, // Approximate
            timeline: wizardData.timeline,
            industry: wizardData.industry,
            userExperience: wizardData.userExperience,
          });

        if (aiRecommendation) {
          // Find matching templates based on AI recommendation
          const templates = await this.templateRepo.find({
            where: {
              isActive: true, // Broaden search, filter in memory if needed or use fuzzy match in future
            },
          });

          // AI Scoring
          const aiScores =
            await this.projectIntelligence.enhanceTemplateScoring(
              templates.map((t) => ({
                id: t.id,
                name: t.name,
                category: t.category,
                methodology: t.methodology,
              })),
              {
                industry: wizardData.industry,
                teamSize: parseInt(wizardData.teamSize.replace(/\D/g, '')) || 5,
                experience: wizardData.userExperience,
              },
            );

          // Merge AI scores
          const recommendations = templates
            .map((t) => {
              const aiScore = aiScores?.find((s) => s.templateId === t.id);
              const baseScore = this.calculateTemplateScore(t, wizardData);
              const finalScore = aiScore
                ? (baseScore + aiScore.aiScore / 100) / 2
                : baseScore;

              return {
                template: t,
                score: finalScore,
                reasoning: aiScore?.reasoning || 'Matches your criteria',
                confidence: aiScore ? 'high' : 'medium',
              };
            })
            .sort((a, b) => b.score - a.score)
            .slice(0, 3);

          return {
            recommendations: recommendations.map((r) => ({
              template: r.template,
              score: r.score,
              reasons: [r.reasoning],
              confidence: r.confidence,
            })),
            suggestedConfig: this.generateSuggestedConfig(
              wizardData,
              recommendations[0]?.template,
            ),
          };
        }
      } catch (error) {
        this.logger.warn(
          'AI project recommendations failed, falling back to rules',
          error,
        );
      }
    }

    // PRIORITY 3: Fallback to rule-based logic
    return this.getManualWizardRecommendations(userId, wizardData);
  }

  private parseWizardResponses(responses: WizardResponse[]): ProjectWizardData {
    const data: Record<string, any> = {
      projectName: 'New Project',
      description: '',
      industry: 'software_development', // Default
      teamSize: '2-5',
      methodology: 'agile',
      timeline: 'medium',
      goals: [],
      complexity: 'moderate',
      userExperience: 'intermediate',
    };

    responses.forEach((r) => {
      // Direct mapping for now, assuming question IDs match data keys
      if (typeof r.answer === 'string') {
        data[r.questionId] = r.answer;
      }
    });

    return data as ProjectWizardData;
  }

  private async getManualWizardRecommendations(
    userId: string,
    wizardData: ProjectWizardData,
  ) {
    // 1. Filter templates by category and logic
    const templates = await this.templateRepo.find({
      where: {
        category: wizardData.industry as ProjectCategory,
        isActive: true,
      },
    });

    // 2. Score and rank templates
    const scoredTemplates = templates.map((template) => ({
      template,
      score: this.calculateTemplateScore(template, wizardData),
    }));

    // 3. Sort by score and return top 3
    const recommendations = scoredTemplates
      .sort((a, b) => b.score - a.score)
      .slice(0, 3)
      .map((item) => ({
        template: item.template,
        score: item.score,
        reasons: ['Matches your criteria'],
        confidence: 'high',
      }));

    // 4. Generate suggested configuration
    const suggestedConfig = this.generateSuggestedConfig(
      wizardData,
      recommendations[0]?.template,
    );

    return { recommendations, suggestedConfig };
  }

  /**
   * Create project from wizard data and selected template
   */
  async createProjectFromWizard(
    userId: string,
    wizardData: ProjectWizardData,
    templateId: string,
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    _organizationId?: string,
  ): Promise<any> {
    try {
      const template = await this.templateRepo.findOne({
        where: { id: templateId },
      });

      if (!template) {
        throw new NotFoundException('Template not found');
      }

      // Generate a unique key if one wasn't provided
      const projectKey = wizardData.projectKey
        ? wizardData.projectKey
        : await this.ensureUniqueProjectKey(wizardData.projectName);

      // Create project with template configuration
      const projectData: CreateProjectDto = {
        name: wizardData.projectName,
        description: wizardData.description,
        key: projectKey,
      };

      const project = await this.projectsService.create(userId, projectData);

      // Apply template configuration using unified service
      if (this.templateApplicationService) {
        await this.templateApplicationService.applyTemplate(
          project.id,
          templateId,
          userId,
        );
      } else {
        // Fallback to legacy method if service unavailable
        await this.applyTemplateConfiguration(project.id, template, userId);
      }

      // Invalidate cache
      if (this.cacheService) {
        await this.cacheService.del(`project_setup:${userId}`);
      }

      return project;
    } catch (error) {
      this.logger.error('Failed to create project from wizard:', error);
      throw error;
    }
  }

  private async ensureUniqueProjectKey(projectName: string): Promise<string> {
    let key = this.generateProjectKey(projectName);
    let attempts = 0;
    // Check for global uniqueness (pass no organizationId to findByKey)
    while ((await this.projectsService.findByKey(key)) !== null) {
      if (attempts++ > 10) {
        throw new Error(
          'Failed to generate unique project key after multiple attempts',
        );
      }
      key = this.generateProjectKey(projectName);
    }
    return key;
  }

  private generateProjectKey(projectName: string): string {
    const baseKey = projectName
      .replace(/[^a-zA-Z0-9\s]/g, '')
      .split(' ')
      .map((word) => word.charAt(0).toUpperCase())
      .join('')
      .substring(0, 6);

    // Append 4 random characters to ensure uniqueness
    const randomSuffix = Math.random()
      .toString(36)
      .substring(2, 6)
      .toUpperCase();
    return `${baseKey}${randomSuffix}`;
  }

  private async applyTemplateConfiguration(
    projectId: string,
    template: ProjectTemplate,
    userId: string,
  ): Promise<void> {
    const config = template.templateConfig;

    // 1. Update project with template configuration
    await this.dataSource.transaction(async (manager) => {
      await manager.update(Project, projectId, {
        // Changed ProjectTemplate to Project
        templateId: template.id,
        // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
        templateConfig: config as any,
      });

      // 2. Get the project to find the creator (for board/sprint creation)
      const project = await manager.findOne(Project, {
        // Changed ProjectTemplate to Project
        where: { id: projectId },
      });
      if (!project) {
        throw new NotFoundException('Project not found');
      }

      try {
        // 3. Create default board(s) from template
        // Linear-style: column.name IS the status (no separate statusId needed)
        if (config.defaultBoards) {
          for (const boardConfig of config.defaultBoards) {
            const columns = boardConfig.columns.map((col) => ({
              name: col.name, // Linear-style: column name IS the issue status
              order: col.order,
            }));

            this.logger.log(
              `Creating board "${boardConfig.name}" with columns: ${columns.map((c) => c.name).join(', ')}`,
            );

            // eslint-disable-next-line @typescript-eslint/no-unsafe-argument
            await this.boardsService.create(projectId, userId, {
              name: boardConfig.name,
              type: boardConfig.type as 'kanban' | 'scrum',
              description: `${boardConfig.type.charAt(0).toUpperCase() + boardConfig.type.slice(1)} board for ${template.name}`,
              columns,
            } as any);
          }
        }

        // 4. Create initial sprint for Agile/Scrum projects
        if (
          config.defaultSprintDuration &&
          config.defaultSprintDuration > 0 &&
          (template.methodology === ProjectMethodology.AGILE ||
            template.methodology === ProjectMethodology.SCRUM)
        ) {
          const firstMilestone = config.defaultMilestones?.[0];
          const startDate = new Date();
          const endDate = new Date(
            Date.now() + config.defaultSprintDuration * 24 * 60 * 60 * 1000,
          );

          await this.sprintsService.create(projectId, userId, {
            name: firstMilestone?.name || 'Sprint 1',
            startDate: startDate.toISOString().split('T')[0],
            endDate: endDate.toISOString().split('T')[0],
            goal: firstMilestone?.description || 'First sprint',
          });
        }
      } catch (error) {
        this.logger.error('Error applying template configuration:', error);
        this.logger.error(
          'Template application error details:',
          (error as Error).message,
        );
        // Don't fail project creation if template application fails
        // The project itself is already created
      }
    });
  }

  private calculateTemplateScore(
    template: ProjectTemplate,
    wizardData: ProjectWizardData,
  ): number {
    let score = 0;

    // Industry match using new 8-industry system (18%)
    if (template.industries?.includes(wizardData.industry)) {
      score += 0.18;
    } else if (
      template.category === this.mapIndustryToProjectType(wizardData.industry)
    ) {
      score += 0.1; // Partial category match
    }

    // Methodology match (18%)
    if (template.methodology === wizardData.methodology) {
      score += 0.18;
    }

    // Team Size Fit (15%)
    if (template.idealTeamSize) {
      const teamNum = this.parseTeamSize(wizardData.teamSize);
      if (
        teamNum >= template.idealTeamSize.min &&
        teamNum <= template.idealTeamSize.max
      ) {
        score += 0.15;
      } else {
        score += 0.05; // Partial credit
      }
    } else {
      score += 0.08;
    }

    // Complexity Fit (10%)
    if (template.complexity === wizardData.complexity) {
      score += 0.1;
    } else if (
      this.isAdjacentComplexity(template.complexity, wizardData.complexity)
    ) {
      score += 0.05;
    }

    // Category bonus (22%)
    if (
      template.category === this.mapIndustryToProjectType(wizardData.industry)
    ) {
      score += 0.22;
    }

    return Math.min(score, 1);
  }

  /**
   * Convert wizard data to IntelligentCriteria for TemplateScorerService
   */
  private convertToIntelligentCriteria(
    wizardData: ProjectWizardData,
  ): IntelligentCriteria {
    return {
      projectName: wizardData.projectName,
      description: wizardData.description || null,
      industry: wizardData.industry,
      projectType: this.mapIndustryToProjectType(wizardData.industry),
      teamSize: wizardData.teamSize as TeamSizeRange,
      workStyle: wizardData.methodology,
      timeline: wizardData.timeline as TimelineRange,
      hasExternalStakeholders: wizardData.complexity === 'complex',
      stakeholderType: undefined,
      complianceNeeds: [],
      wantsApprovalWorkflow: wizardData.complexity !== 'simple',
      wantsTimeTracking: undefined,
      wantsStoryPoints: undefined,
      keyFeatures: [],
      excludedFeatures: [],
    };
  }

  /**
   * Map 8-industry system to ProjectCategory
   */
  private mapIndustryToProjectType(industry: string): ProjectCategory {
    const mapping: Record<string, ProjectCategory> = {
      technology: ProjectCategory.SOFTWARE_DEVELOPMENT,
      healthcare: ProjectCategory.CUSTOM,
      fintech: ProjectCategory.SOFTWARE_DEVELOPMENT,
      ecommerce: ProjectCategory.CUSTOM,
      education: ProjectCategory.CUSTOM,
      agency: ProjectCategory.CUSTOM,
      startup: ProjectCategory.SOFTWARE_DEVELOPMENT,
      enterprise: ProjectCategory.CUSTOM,
      // Legacy mappings for backwards compatibility
      software_development: ProjectCategory.SOFTWARE_DEVELOPMENT,
      marketing: ProjectCategory.MARKETING,
      product_launch: ProjectCategory.PRODUCT_LAUNCH,
      research: ProjectCategory.RESEARCH,
      event_planning: ProjectCategory.EVENT_PLANNING,
      website_development: ProjectCategory.WEBSITE_DEVELOPMENT,
      mobile_development: ProjectCategory.MOBILE_DEVELOPMENT,
      data_analysis: ProjectCategory.DATA_ANALYSIS,
      design: ProjectCategory.DESIGN,
      sales: ProjectCategory.SALES,
    };
    return mapping[industry] || ProjectCategory.CUSTOM;
  }

  /**
   * Generate human-readable reasons from scoring breakdown
   */
  private generateReasons(breakdown: {
    categoryMatch: number;
    methodologyMatch: number;
    teamSizeFit: number;
    stakeholderFit: number;
    industryMatch: number;
    complexityFit: number;
    userPreference: number;
  }): string[] {
    const reasons: string[] = [];

    if (breakdown.industryMatch > 0.1) {
      reasons.push('Matches your industry');
    }
    if (breakdown.categoryMatch > 0.1) {
      reasons.push('Fits your project type');
    }
    if (breakdown.methodologyMatch > 0.1) {
      reasons.push('Matches your preferred methodology');
    }
    if (breakdown.teamSizeFit > 0.1) {
      reasons.push('Designed for your team size');
    }
    if (breakdown.complexityFit > 0.05) {
      reasons.push('Appropriate complexity level');
    }
    if (breakdown.stakeholderFit > 0.05) {
      reasons.push('Supports your stakeholder needs');
    }

    if (reasons.length === 0) {
      reasons.push('Good general match for your project');
    }

    return reasons;
  }

  /**
   * Parse team size string to number
   */
  private parseTeamSize(teamSize: string): number {
    const mapping: Record<string, number> = {
      '1': 1,
      '2-5': 3,
      '6-10': 8,
      '11-20': 15,
      '20+': 25,
    };
    return mapping[teamSize] || 5;
  }

  /**
   * Check if two complexity levels are adjacent
   */
  private isAdjacentComplexity(a?: string, b?: string): boolean {
    const levels = ['simple', 'moderate', 'complex'];
    const aIdx = levels.indexOf(a || '');
    const bIdx = levels.indexOf(b || '');
    return Math.abs(aIdx - bIdx) === 1;
  }

  private generateSuggestedConfig(
    wizardData: ProjectWizardData,
    template?: ProjectTemplate,
  ) {
    const baseConfig = {
      sprintDuration: this.getSprintDuration(wizardData.timeline),
      issueTypes: this.getDefaultIssueTypes(wizardData.industry),
      priorities: ['Low', 'Medium', 'High', 'Critical'],
      enableTimeTracking: wizardData.complexity !== 'simple',
      enableStoryPoints:
        wizardData.methodology === ProjectMethodology.AGILE ||
        wizardData.methodology === ProjectMethodology.SCRUM,
    };

    if (template) {
      return {
        ...baseConfig,
        ...template.templateConfig,
      };
    }

    return baseConfig;
  }

  private getSprintDuration(timeline: string): number {
    switch (timeline) {
      case 'short':
        return 7; // 1 week sprints
      case 'medium':
        return 14; // 2 week sprints
      case 'long':
        return 21; // 3 week sprints
      default:
        return 14;
    }
  }

  private getDefaultIssueTypes(industry: string): string[] {
    const typeMap: Record<string, string[]> = {
      software_development: ['Bug', 'Task', 'Story', 'Epic', 'Sub-task'],
      marketing: ['Campaign', 'Content', 'Design', 'Research', 'Analysis'],
      product_launch: ['Feature', 'Bug', 'Task', 'Milestone', 'Risk'],
      research: [
        'Research',
        'Analysis',
        'Experiment',
        'Documentation',
        'Review',
      ],
      event_planning: ['Task', 'Vendor', 'Logistics', 'Marketing', 'Follow-up'],
      website_development: ['Bug', 'Feature', 'Design', 'Content', 'SEO'],
      mobile_development: ['Bug', 'Feature', 'UI/UX', 'Performance', 'Testing'],
      data_analysis: [
        'Analysis',
        'Report',
        'Visualization',
        'Data Quality',
        'Insight',
      ],
      design: ['Design', 'Mockup', 'Prototype', 'Review', 'Asset'],
      sales: ['Lead', 'Opportunity', 'Follow-up', 'Proposal', 'Contract'],
    };

    return typeMap[industry] || ['Task', 'Bug', 'Feature', 'Story'];
  }
}
