import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import {
  WorkflowTemplate,
  WorkflowTemplateStatus,
  WorkflowTemplateDefinition,
} from '../entities/workflow-template.entity';
import { Workflow } from '../entities/workflow.entity';
import { User } from '../../users/entities/user.entity';

export interface TemplateSearchFilters {
  category?: string;
  tags?: string[];
  complexity?: 'simple' | 'moderate' | 'complex';
  isPublic?: boolean;
  search?: string;
  minRating?: number;
  createdBy?: string;
}

export interface TemplateUsageStats {
  totalDownloads: number;
  successfulInstalls: number;
  averageSetupTime: number;
  commonCustomizations: string[];
  errorRate: number;
  userSatisfaction: number;
}

@Injectable()
export class WorkflowTemplateService {
  private readonly logger = new Logger(WorkflowTemplateService.name);

  constructor(
    @InjectRepository(WorkflowTemplate)
    private templateRepo: Repository<WorkflowTemplate>,
    @InjectRepository(Workflow)
    private workflowRepo: Repository<Workflow>,
  ) {}

  async createTemplate(
    userId: string,
    templateData: {
      name: string;
      description?: string;
      category: string;
      templateDefinition: WorkflowTemplateDefinition;
      metadata?: any;
      isPublic?: boolean;
      tags?: string[];
      icon?: string;
      color?: string;
      instructions?: string;
      requirements?: any;
    },
  ): Promise<WorkflowTemplate> {
    const template = this.templateRepo.create({
      createdBy: userId,
      ...templateData,
      status: WorkflowTemplateStatus.DRAFT,
    });

    return this.templateRepo.save(template);
  }

  async updateTemplate(
    templateId: string,
    userId: string,
    updates: Partial<{
      name: string;
      description: string;
      category: string;
      templateDefinition: WorkflowTemplateDefinition;
      metadata: any;
      isPublic: boolean;
      tags: string[];
      icon: string;
      color: string;
      instructions: string;
      requirements: any;
    }>,
  ): Promise<WorkflowTemplate> {
    const template = await this.templateRepo.findOne({
      where: { id: templateId, createdBy: userId },
    });

    if (!template) {
      throw new NotFoundException('Template not found');
    }

    Object.assign(template, updates);
    return this.templateRepo.save(template);
  }

  async publishTemplate(
    templateId: string,
    userId: string,
  ): Promise<WorkflowTemplate> {
    const template = await this.templateRepo.findOne({
      where: { id: templateId, createdBy: userId },
    });

    if (!template) {
      throw new NotFoundException('Template not found');
    }

    template.status = WorkflowTemplateStatus.PUBLISHED;
    return this.templateRepo.save(template);
  }

  async archiveTemplate(
    templateId: string,
    userId: string,
  ): Promise<WorkflowTemplate> {
    const template = await this.templateRepo.findOne({
      where: { id: templateId, createdBy: userId },
    });

    if (!template) {
      throw new NotFoundException('Template not found');
    }

    template.status = WorkflowTemplateStatus.ARCHIVED;
    return this.templateRepo.save(template);
  }

  async getTemplates(
    filters: TemplateSearchFilters = {},
    limit: number = 20,
    offset: number = 0,
  ): Promise<{ templates: WorkflowTemplate[]; total: number }> {
    const query = this.templateRepo.createQueryBuilder('template');

    if (filters.category) {
      query.andWhere('template.category = :category', {
        category: filters.category,
      });
    }

    if (filters.tags && filters.tags.length > 0) {
      query.andWhere('template.tags && :tags', { tags: filters.tags });
    }

    if (filters.complexity) {
      query.andWhere("template.metadata->>'complexity' = :complexity", {
        complexity: filters.complexity,
      });
    }

    if (filters.isPublic !== undefined) {
      query.andWhere('template.isPublic = :isPublic', {
        isPublic: filters.isPublic,
      });
    }

    if (filters.search) {
      query.andWhere(
        '(template.name ILIKE :search OR template.description ILIKE :search)',
        { search: `%${filters.search}%` },
      );
    }

    if (filters.minRating) {
      query.andWhere('template.rating >= :minRating', {
        minRating: filters.minRating,
      });
    }

    if (filters.createdBy) {
      query.andWhere('template.createdBy = :createdBy', {
        createdBy: filters.createdBy,
      });
    }

    const [templates, total] = await query
      .orderBy('template.usageCount', 'DESC')
      .addOrderBy('template.rating', 'DESC')
      .addOrderBy('template.createdAt', 'DESC')
      .take(limit)
      .skip(offset)
      .getManyAndCount();

    return { templates, total };
  }

  async getTemplateById(templateId: string): Promise<WorkflowTemplate> {
    const template = await this.templateRepo.findOne({
      where: { id: templateId },
    });

    if (!template) {
      throw new NotFoundException('Template not found');
    }

    return template;
  }

  async getTemplateCategories(): Promise<string[]> {
    const result = await this.templateRepo
      .createQueryBuilder('template')
      .select('DISTINCT template.category', 'category')
      .where('template.status = :status', {
        status: WorkflowTemplateStatus.PUBLISHED,
      })
      .getRawMany();

    return result.map((row) => row.category);
  }

  async getPopularTemplates(limit: number = 10): Promise<WorkflowTemplate[]> {
    return this.templateRepo.find({
      where: {
        status: WorkflowTemplateStatus.PUBLISHED,
        isPublic: true,
      },
      order: {
        usageCount: 'DESC',
        rating: 'DESC',
      },
      take: limit,
    });
  }

  async getFeaturedTemplates(limit: number = 5): Promise<WorkflowTemplate[]> {
    return this.templateRepo.find({
      where: {
        status: WorkflowTemplateStatus.PUBLISHED,
        isPublic: true,
      },
      order: {
        rating: 'DESC',
        usageCount: 'DESC',
      },
      take: limit,
    });
  }

  async createWorkflowFromTemplate(
    templateId: string,
    projectId: string,
    userId: string,
    customizations?: Record<string, any>,
  ): Promise<Workflow> {
    const template = await this.getTemplateById(templateId);

    if (template.status !== WorkflowTemplateStatus.PUBLISHED) {
      throw new Error('Template is not published');
    }

    // Apply customizations to template definition
    const workflowDefinition = this.applyCustomizations(
      template.templateDefinition,
      customizations || {},
    );

    // Create workflow from template
    const workflowData = {
      projectId,
      createdBy: userId,
      name: template.name,
      description: template.description,
      definition: workflowDefinition as any,
      metadata: {
        version: 1,
        lastModified: new Date(),
        createdBy: userId,
        templateId: template.id,
        templateVersion: template.metadata?.version || '1.0.0',
        customizations: customizations || {},
      },
      tags: template.tags,
      category: template.category,
      icon: template.icon,
      color: template.color,
    };

    const workflow = this.workflowRepo.create(workflowData);

    const savedWorkflow = await this.workflowRepo.save(workflow);

    // Update template usage statistics
    await this.updateTemplateUsageStats(templateId);

    return savedWorkflow;
  }

  private applyCustomizations(
    templateDefinition: WorkflowTemplateDefinition,
    customizations: Record<string, any>,
  ): WorkflowTemplateDefinition {
    const customized = { ...templateDefinition };

    // Apply node customizations
    if (customizations.nodes) {
      customized.nodes = customized.nodes.map((node) => {
        const customization = customizations.nodes[node.id];
        if (customization) {
          return {
            ...node,
            name: customization.name || node.name,
            config: {
              ...node.config,
              ...customization.config,
            },
          };
        }
        return node;
      });
    }

    // Apply connection customizations
    if (customizations.connections) {
      customized.connections = customized.connections.map((connection) => {
        const customization = customizations.connections[connection.id];
        if (customization) {
          return {
            ...connection,
            ...customization,
          };
        }
        return connection;
      });
    }

    // Apply variable customizations
    if (customizations.variables) {
      customized.variables = {
        ...customized.variables,
        ...customizations.variables,
      };
    }

    // Apply settings customizations
    if (customizations.settings) {
      customized.settings = {
        ...customized.settings,
        ...customizations.settings,
      };
    }

    return customized;
  }

  async addTemplateReview(
    templateId: string,
    userId: string,
    reviewData: {
      rating: number;
      comment: string;
    },
  ): Promise<WorkflowTemplate> {
    const template = await this.getTemplateById(templateId);

    const review = {
      id: `review_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      userId,
      userName: 'User', // In real implementation, get from user service
      rating: reviewData.rating,
      comment: reviewData.comment,
      createdAt: new Date(),
    };

    const reviews = template.reviews || [];
    reviews.push(review);

    // Calculate new average rating
    const totalRating = reviews.reduce((sum, r) => sum + r.rating, 0);
    const averageRating = totalRating / reviews.length;

    template.reviews = reviews;
    template.rating = parseFloat(averageRating.toFixed(2));
    template.reviewCount = reviews.length;

    return this.templateRepo.save(template);
  }

  async getTemplateUsageStats(templateId: string): Promise<TemplateUsageStats> {
    const template = await this.getTemplateById(templateId);

    return {
      totalDownloads: template.analytics?.totalDownloads || 0,
      successfulInstalls: template.analytics?.successfulInstalls || 0,
      averageSetupTime: template.analytics?.averageSetupTime || 0,
      commonCustomizations: template.analytics?.commonCustomizations || [],
      errorRate: template.analytics?.errorRate || 0,
      userSatisfaction: template.rating || 0,
    };
  }

  private async updateTemplateUsageStats(templateId: string): Promise<void> {
    const template = await this.getTemplateById(templateId);

    const analytics = template.analytics || {
      totalDownloads: 0,
      successfulInstalls: 0,
      averageSetupTime: 0,
      commonCustomizations: [],
      errorRate: 0,
    };

    analytics.totalDownloads += 1;
    analytics.successfulInstalls += 1;

    template.analytics = analytics;
    template.usageCount += 1;

    await this.templateRepo.save(template);
  }

  getSystemTemplates(): Promise<WorkflowTemplate[]> {
    // Return pre-built system templates
    return [
      {
        id: 'system-simple-approval',
        name: 'Simple Approval Workflow',
        description: 'Basic approval workflow for issue review',
        category: 'approval',
        templateDefinition: {
          nodes: [
            {
              id: 'start',
              type: 'start',
              name: 'Start',
              position: { x: 100, y: 100 },
              config: {},
            },
            {
              id: 'approval',
              type: 'approval',
              name: 'Approval',
              position: { x: 300, y: 100 },
              config: {
                approvers: [],
                autoApprove: false,
                timeout: 24,
              },
            },
            {
              id: 'end',
              type: 'end',
              name: 'End',
              position: { x: 500, y: 100 },
              config: {},
            },
          ],
          connections: [
            {
              id: 'conn1',
              source: 'start',
              target: 'approval',
            },
            {
              id: 'conn2',
              source: 'approval',
              target: 'end',
            },
          ],
        },
        metadata: {
          version: '1.0.0',
          author: 'System',
          category: 'approval',
          tags: ['approval', 'simple', 'basic'],
          complexity: 'simple',
          estimatedSetupTime: 5,
          requiredPermissions: ['issues:view'],
          compatibleProjects: ['software', 'general'],
          lastUpdated: new Date(),
        },
        status: WorkflowTemplateStatus.PUBLISHED,
        isPublic: true,
        usageCount: 0,
        rating: 4.5,
        reviewCount: 0,
        tags: ['approval', 'simple', 'basic'],
        icon: 'check-circle',
        color: '#10B981',
        createdBy: 'system',
        creator: {} as User,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
      {
        id: 'system-bug-triage',
        name: 'Bug Triage Workflow',
        description: 'Automated bug triage and assignment workflow',
        category: 'development',
        templateDefinition: {
          nodes: [
            {
              id: 'start',
              type: 'start',
              name: 'Bug Reported',
              position: { x: 100, y: 100 },
              config: {},
            },
            {
              id: 'triage',
              type: 'decision',
              name: 'Triage Decision',
              position: { x: 300, y: 100 },
              config: {
                condition: 'context.priority === "high"',
              },
            },
            {
              id: 'assign',
              type: 'action',
              name: 'Assign to Developer',
              position: { x: 500, y: 50 },
              config: {
                action: 'assign_user',
                config: {},
              },
            },
            {
              id: 'notify',
              type: 'action',
              name: 'Notify Team',
              position: { x: 500, y: 150 },
              config: {
                action: 'send_notification',
                config: {},
              },
            },
            {
              id: 'end',
              type: 'end',
              name: 'End',
              position: { x: 700, y: 100 },
              config: {},
            },
          ],
          connections: [
            {
              id: 'conn1',
              source: 'start',
              target: 'triage',
            },
            {
              id: 'conn2',
              source: 'triage',
              target: 'assign',
              condition: 'context.priority === "high"',
            },
            {
              id: 'conn3',
              source: 'triage',
              target: 'notify',
              condition: 'context.priority !== "high"',
            },
            {
              id: 'conn4',
              source: 'assign',
              target: 'end',
            },
            {
              id: 'conn5',
              source: 'notify',
              target: 'end',
            },
          ],
        },
        metadata: {
          version: '1.0.0',
          author: 'System',
          category: 'development',
          tags: ['bug', 'triage', 'automation'],
          complexity: 'moderate',
          estimatedSetupTime: 15,
          requiredPermissions: ['issues:view', 'issues:edit'],
          compatibleProjects: ['software', 'development'],
          lastUpdated: new Date(),
        },
        status: WorkflowTemplateStatus.PUBLISHED,
        isPublic: true,
        usageCount: 0,
        rating: 4.8,
        reviewCount: 0,
        tags: ['bug', 'triage', 'automation'],
        icon: 'bug-ant',
        color: '#EF4444',
        createdBy: 'system',
        creator: {} as User,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    ] as WorkflowTemplate[];
  }

  async deleteTemplate(templateId: string, userId: string): Promise<void> {
    const template = await this.templateRepo.findOne({
      where: { id: templateId, createdBy: userId },
    });

    if (!template) {
      throw new NotFoundException('Template not found');
    }

    await this.templateRepo.remove(template);
  }

  async duplicateTemplate(
    templateId: string,
    userId: string,
    newName: string,
  ): Promise<WorkflowTemplate> {
    const originalTemplate = await this.getTemplateById(templateId);

    const duplicatedTemplate = this.templateRepo.create({
      name: newName,
      description: originalTemplate.description,
      category: originalTemplate.category,
      templateDefinition: originalTemplate.templateDefinition,
      metadata: {
        ...originalTemplate.metadata,
        version: '1.0.0',
        author: 'User',
        lastUpdated: new Date(),
      },
      status: WorkflowTemplateStatus.DRAFT,
      isPublic: false,
      usageCount: 0,
      rating: undefined,
      reviewCount: 0,
      tags: originalTemplate.tags,
      icon: originalTemplate.icon,
      color: originalTemplate.color,
      instructions: originalTemplate.instructions,
      requirements: originalTemplate.requirements,
      createdBy: userId,
    });

    return this.templateRepo.save(duplicatedTemplate);
  }
}
