import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import {
  ProjectTemplate,
  ProjectCategory,
  ProjectMethodology,
} from '../entities/project-template.entity';
import { UserPreferences } from '../../user-preferences/entities/user-preferences.entity';
import { ProjectsService } from '../../projects/projects.service';
import { CreateProjectDto } from '../../projects/dto/create-project.dto';

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
  description?: string;
  teamSize: number;
  timeline: 'short' | 'medium' | 'long'; // 1-3 months, 3-6 months, 6+ months
  industry: string;
  methodology: ProjectMethodology;
  complexity: 'simple' | 'moderate' | 'complex';
  teamExperience: 'beginner' | 'intermediate' | 'advanced';
  hasExternalStakeholders: boolean;
  requiresCompliance: boolean;
  budget: 'low' | 'medium' | 'high';
}

@Injectable()
export class ProjectWizardService {
  constructor(
    @InjectRepository(ProjectTemplate)
    private templateRepo: Repository<ProjectTemplate>,
    @InjectRepository(UserPreferences)
    private preferencesRepo: Repository<UserPreferences>,
    private projectsService: ProjectsService,
  ) {}

  /**
   * Get wizard questions based on user's experience and preferences
   */
  async getWizardQuestions(userId: string): Promise<WizardQuestion[]> {
    const preferences = await this.preferencesRepo.findOne({
      where: { userId },
    });

    const experienceLevel =
      preferences?.preferences?.learning?.experienceLevel || 'beginner';

    const baseQuestions: WizardQuestion[] = [
      {
        id: 'project_name',
        question: 'What would you like to call your project?',
        type: 'text',
        required: true,
        order: 1,
        category: 'basic',
      },
      {
        id: 'project_description',
        question: 'Briefly describe what this project is about',
        type: 'text',
        required: false,
        order: 2,
        category: 'basic',
      },
      {
        id: 'team_size',
        question: 'How many people will be working on this project?',
        type: 'select',
        options: [
          { value: '1', label: 'Just me (1 person)' },
          { value: '2-5', label: 'Small team (2-5 people)' },
          { value: '6-10', label: 'Medium team (6-10 people)' },
          { value: '11-20', label: 'Large team (11-20 people)' },
          { value: '20+', label: 'Very large team (20+ people)' },
        ],
        required: true,
        order: 3,
        category: 'team',
      },
      {
        id: 'timeline',
        question: "What's your project timeline?",
        type: 'select',
        options: [
          { value: 'short', label: 'Quick project (1-3 months)' },
          { value: 'medium', label: 'Medium project (3-6 months)' },
          { value: 'long', label: 'Long-term project (6+ months)' },
        ],
        required: true,
        order: 4,
        category: 'timeline',
      },
      {
        id: 'industry',
        question: 'What industry or domain is this project for?',
        type: 'select',
        options: [
          { value: 'software_development', label: 'Software Development' },
          { value: 'marketing', label: 'Marketing & Advertising' },
          { value: 'product_launch', label: 'Product Launch' },
          { value: 'research', label: 'Research & Development' },
          { value: 'event_planning', label: 'Event Planning' },
          { value: 'website_development', label: 'Website Development' },
          { value: 'mobile_development', label: 'Mobile App Development' },
          { value: 'data_analysis', label: 'Data Analysis' },
          { value: 'design', label: 'Design & Creative' },
          { value: 'sales', label: 'Sales & Business' },
          { value: 'other', label: 'Other' },
        ],
        required: true,
        order: 5,
        category: 'industry',
      },
    ];

    // Add advanced questions for experienced users
    if (experienceLevel === 'advanced' || experienceLevel === 'expert') {
      baseQuestions.push(
        {
          id: 'methodology',
          question: 'Which project methodology do you prefer?',
          type: 'select',
          options: [
            {
              value: 'agile',
              label: 'Agile',
              description: 'Iterative and flexible approach',
            },
            {
              value: 'scrum',
              label: 'Scrum',
              description: 'Structured sprints with defined roles',
            },
            {
              value: 'kanban',
              label: 'Kanban',
              description: 'Continuous flow with visual boards',
            },
            {
              value: 'waterfall',
              label: 'Waterfall',
              description: 'Sequential phases',
            },
            {
              value: 'hybrid',
              label: 'Hybrid',
              description: 'Mix of methodologies',
            },
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
              description: 'Straightforward with clear requirements',
            },
            {
              value: 'moderate',
              label: 'Moderate',
              description: 'Some complexity with changing requirements',
            },
            {
              value: 'complex',
              label: 'Complex',
              description: 'High complexity with many unknowns',
            },
          ],
          required: true,
          order: 7,
          category: 'complexity',
        },
        {
          id: 'team_experience',
          question:
            "What's your team's experience level with project management?",
          type: 'select',
          options: [
            {
              value: 'beginner',
              label: 'Beginner',
              description: 'New to project management tools',
            },
            {
              value: 'intermediate',
              label: 'Intermediate',
              description: 'Some experience with PM tools',
            },
            {
              value: 'advanced',
              label: 'Advanced',
              description: 'Experienced with PM methodologies',
            },
          ],
          required: true,
          order: 8,
          category: 'team',
        },
      );
    }

    return baseQuestions;
  }

  /**
   * Process wizard responses and recommend templates
   */
  async processWizardResponses(
    userId: string,
    responses: WizardResponse[],
  ): Promise<{ recommendations: ProjectTemplate[]; suggestedConfig: any }> {
    const wizardData = this.parseWizardResponses(responses);

    // Get user preferences for additional context
    const preferences = await this.preferencesRepo.findOne({
      where: { userId },
    });

    // Find matching templates
    const templates = await this.templateRepo.find({
      where: {
        category: wizardData.industry as ProjectCategory,
        isActive: true,
      },
      order: { usageCount: 'DESC' },
    });

    // Score and rank templates
    const scoredTemplates = templates.map((template) => ({
      template,
      score: this.calculateTemplateScore(
        template,
        wizardData,
        preferences || undefined,
      ),
    }));

    // Sort by score and return top 3
    const recommendations = scoredTemplates
      .sort((a, b) => b.score - a.score)
      .slice(0, 3)
      .map((item) => item.template);

    // Generate suggested configuration
    const suggestedConfig = this.generateSuggestedConfig(
      wizardData,
      recommendations[0],
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
  ): Promise<any> {
    const template = await this.templateRepo.findOne({
      where: { id: templateId },
    });

    if (!template) {
      throw new NotFoundException('Template not found');
    }

    // Create project with template configuration
    const projectData: CreateProjectDto = {
      name: wizardData.projectName,
      description: wizardData.description,
      key: this.generateProjectKey(wizardData.projectName),
    };

    const project = await this.projectsService.create(userId, projectData);

    // Apply template configuration
    this.applyTemplateConfiguration(project.id, template);

    // Update template usage count
    await this.templateRepo.update(templateId, {
      usageCount: template.usageCount + 1,
    });

    return project;
  }

  private parseWizardResponses(responses: WizardResponse[]): ProjectWizardData {
    const data: Partial<ProjectWizardData> = {};

    responses.forEach((response) => {
      switch (response.questionId) {
        case 'project_name':
          data.projectName = response.answer as string;
          break;
        case 'project_description':
          data.description = response.answer as string;
          break;
        case 'team_size':
          data.teamSize = this.parseTeamSize(response.answer as string);
          break;
        case 'timeline':
          data.timeline = response.answer as 'short' | 'medium' | 'long';
          break;
        case 'industry':
          data.industry = response.answer as string;
          break;
        case 'methodology':
          data.methodology = response.answer as ProjectMethodology;
          break;
        case 'complexity':
          data.complexity = response.answer as
            | 'simple'
            | 'moderate'
            | 'complex';
          break;
        case 'team_experience':
          data.teamExperience = response.answer as
            | 'beginner'
            | 'intermediate'
            | 'advanced';
          break;
      }
    });

    return data as ProjectWizardData;
  }

  private parseTeamSize(teamSize: string): number {
    if (teamSize === '1') return 1;
    if (teamSize === '2-5') return 3;
    if (teamSize === '6-10') return 8;
    if (teamSize === '11-20') return 15;
    if (teamSize === '20+') return 25;
    return 1;
  }

  private calculateTemplateScore(
    template: ProjectTemplate,
    wizardData: ProjectWizardData,
    preferences?: UserPreferences,
  ): number {
    let score = 0;

    // Category match
    if (template.category === (wizardData.industry as any)) {
      score += 50;
    }

    // Methodology match
    if (template.methodology === (wizardData.methodology as any)) {
      score += 30;
    }

    // Team size compatibility
    const templateConfig = template.templateConfig;
    if (wizardData.teamSize <= 5 && templateConfig.suggestedRoles.length <= 5) {
      score += 20;
    } else if (
      wizardData.teamSize > 5 &&
      templateConfig.suggestedRoles.length > 5
    ) {
      score += 20;
    }

    // User preferences match
    if (preferences?.preferences?.learning?.preferredIssueTypes) {
      const commonTypes = templateConfig.defaultIssueTypes.filter((type) =>
        preferences.preferences.learning.preferredIssueTypes.includes(type),
      );
      score += commonTypes.length * 5;
    }

    // Usage count (popularity)
    score += Math.min(template.usageCount * 0.1, 10);

    return score;
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

  private generateProjectKey(projectName: string): string {
    return projectName
      .replace(/[^a-zA-Z0-9\s]/g, '')
      .split(' ')
      .map((word) => word.charAt(0).toUpperCase())
      .join('')
      .substring(0, 10);
  }

  private applyTemplateConfiguration(
    projectId: string,
    template: ProjectTemplate,
  ) {
    // This would apply the template configuration to the project
    // Implementation depends on your project structure
    // For now, we'll just return a placeholder
    return { projectId, templateId: template.id };
  }
}
