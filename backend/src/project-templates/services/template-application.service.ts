/**
 * TemplateApplicationService
 *
 * Unified service for applying template configurations to projects.
 * Used by all 3 project creation flows:
 *   1. AI Smart Setup
 *   2. 8-Question Wizard
 *   3. Direct Create with templateId
 *
 * This service ensures consistent template application across all flows.
 */

import {
  Injectable,
  Logger,
  NotFoundException,
  Inject,
  forwardRef,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource, EntityManager } from 'typeorm';
import { Project } from '../../projects/entities/project.entity';
import {
  ProjectTemplate,
  ProjectMethodology,
} from '../entities/project-template.entity';
import { WorkflowStatusesService } from '../../workflows/services/workflow-statuses.service';
import { BoardsService } from '../../boards/boards.service';
import { SprintsService } from '../../sprints/sprints.service';
import { CreateBoardDto } from '../../boards/dto/create-board.dto';
import { BoardType } from '../../boards/entities/board.entity';

/**
 * Template config structure (from ProjectTemplate)
 */
interface TemplateConfig {
  defaultSprintDuration?: number;
  defaultIssueTypes?: string[];
  defaultPriorities?: string[];
  defaultStatuses?: string[];
  suggestedRoles?: Array<{
    role: string;
    description: string;
    permissions?: string[];
  }>;
  workflowStages?: Array<{
    name: string;
    description?: string;
    order?: number;
    isDefault?: boolean;
  }>;
  defaultBoards?: Array<{
    name: string;
    type: 'kanban' | 'scrum';
    columns: Array<{
      name: string;
      status?: string;
      order: number;
    }>;
  }>;
  defaultMilestones?: Array<{
    name: string;
    description?: string;
    estimatedDuration?: number;
    order?: number;
  }>;
  smartDefaults?: {
    autoAssignIssues?: boolean;
    suggestDueDates?: boolean;
    enableTimeTracking?: boolean;
    enableStoryPoints?: boolean;
    defaultStoryPointScale?: number[];
  };
}

/**
 * Options for template application
 */
export interface TemplateApplicationOptions {
  skipStatuses?: boolean;
  skipBoards?: boolean;
  skipMilestones?: boolean;
}

/**
 * Result of template application for transactional method
 */
export interface TemplateApplicationResult {
  statusesCreated: number;
  boardsCreated: number;
  sprintsCreated: number;
}

@Injectable()
export class TemplateApplicationService {
  private readonly logger = new Logger(TemplateApplicationService.name);

  constructor(
    @InjectRepository(Project)
    private readonly projectRepo: Repository<Project>,
    @InjectRepository(ProjectTemplate)
    private readonly templateRepo: Repository<ProjectTemplate>,
    private readonly workflowStatusesService: WorkflowStatusesService,
    @Inject(forwardRef(() => BoardsService))
    private readonly boardsService: BoardsService,
    @Inject(forwardRef(() => SprintsService))
    private readonly sprintsService: SprintsService,
    private readonly dataSource: DataSource,
  ) {}

  /**
   * Apply template within an existing transaction (used by orchestrator)
   *
   * This method is designed to be called from ProjectCreationOrchestrator
   * with an existing EntityManager from a QueryRunner transaction.
   *
   * IMPORTANT: This method THROWS on failure (doesn't swallow errors)
   * The orchestrator handles the rollback.
   */
  async applyTemplateTransactional(
    manager: EntityManager,
    projectId: string,
    templateId: string,
    userId: string,
  ): Promise<TemplateApplicationResult> {
    const template = await manager.findOne(ProjectTemplate, {
      where: { id: templateId, isActive: true },
    });

    if (!template) {
      throw new NotFoundException(
        `Template ${templateId} not found or inactive`,
      );
    }

    const config = template.templateConfig as TemplateConfig;
    if (!config) {
      throw new Error(`Template ${templateId} has no configuration`);
    }

    this.logger.log(
      `Applying template "${template.name}" to project ${projectId} (transactional)`,
    );

    // 1. Store template config on project (using manager)
    await manager.update(Project, projectId, {
      templateId: template.id,
      templateConfig: {
        defaultSprintDuration: config?.defaultSprintDuration || 14,
        defaultIssueTypes: config?.defaultIssueTypes || [
          'Task',
          'Bug',
          'Story',
        ],
        defaultPriorities: config?.defaultPriorities || [
          'Low',
          'Medium',
          'High',
          'Critical',
        ],
        defaultStatuses: config?.defaultStatuses || [
          'To Do',
          'In Progress',
          'Done',
        ],
        suggestedRoles:
          config?.suggestedRoles?.map((r) => ({
            role: r.role,
            description: r.description,
          })) || [],
        smartDefaults: config?.smartDefaults || {
          enableTimeTracking: false,
          enableStoryPoints: false,
          defaultStoryPointScale: [1, 2, 3, 5, 8, 13],
        },
      },
    });

    // 2. Create workflow statuses
    const statusMap = await this.createWorkflowStatuses(projectId, config);
    const statusesCreated = statusMap.size;

    // 3. Create boards
    const boardsCreated = await this.createBoardsCount(
      projectId,
      userId,
      config,
      statusMap,
    );

    // 4. Create milestones/sprints
    const sprintsCreated = await this.createMilestonesCount(
      projectId,
      userId,
      config,
      template.methodology,
    );

    // 5. Increment template usage (using manager)
    template.usageCount = (template.usageCount || 0) + 1;
    await manager.save(ProjectTemplate, template);

    this.logger.log(
      `Template "${template.name}" applied: ${statusesCreated} statuses, ${boardsCreated} boards, ${sprintsCreated} sprints`,
    );

    return { statusesCreated, boardsCreated, sprintsCreated };
  }

  /**
   * Create boards and return count
   */
  private async createBoardsCount(
    projectId: string,
    userId: string,
    config: TemplateConfig,
    statusMap: Map<string, string>,
  ): Promise<number> {
    let count = 0;
    await this.createBoards(projectId, userId, config, statusMap);
    count = config.defaultBoards?.length || 1; // Default board counts as 1
    return count;
  }

  /**
   * Create milestones and return count
   */
  private async createMilestonesCount(
    projectId: string,
    userId: string,
    config: TemplateConfig,
    methodology: ProjectMethodology,
  ): Promise<number> {
    await this.createMilestones(projectId, userId, config, methodology);
    if (
      methodology === ProjectMethodology.AGILE ||
      methodology === ProjectMethodology.SCRUM
    ) {
      return (
        config.defaultMilestones?.filter((m) => (m.estimatedDuration || 14) > 0)
          .length || 1
      );
    }
    return 0;
  }

  /**
   * Apply a template to a project - unified method for all creation flows
   *
   * This is the ONLY method that should be called to apply templates.
   * It handles:
   *   1. Storing templateConfig on project
   *   2. Creating workflow statuses
   *   3. Creating boards with status references
   *   4. Creating all milestones/sprints
   *   5. Configuring project settings
   *
   * @param projectId - The project to apply the template to
   * @param templateId - The template to apply
   * @param userId - The user applying the template (for ownership)
   * @param options - Optional flags to skip certain items
   */
  async applyTemplate(
    projectId: string,
    templateId: string,
    userId: string,
    options?: TemplateApplicationOptions,
  ): Promise<void> {
    const template = await this.templateRepo.findOne({
      where: { id: templateId, isActive: true },
    });

    if (!template) {
      this.logger.warn(`Template ${templateId} not found or inactive`);
      return;
    }

    const config = template.templateConfig as TemplateConfig;
    if (!config) {
      this.logger.warn(`Template ${templateId} has no configuration`);
      return;
    }

    this.logger.log(
      `Applying template "${template.name}" to project ${projectId}`,
    );

    try {
      // 1. Store template config on project
      await this.storeTemplateConfig(projectId, template);

      // 2. Create workflow statuses (must be first - boards depend on these)
      let statusMap = new Map<string, string>();
      if (!options?.skipStatuses) {
        statusMap = await this.createWorkflowStatuses(projectId, config);
        this.logger.log(`Created ${statusMap.size} workflow statuses`);
      }

      // 2.5. Validate template config (fail-fast for mismatches)
      this.validateTemplateConfig(config, statusMap);

      // 3. Create boards with status references
      if (!options?.skipBoards) {
        await this.createBoards(projectId, userId, config, statusMap);
      }

      // 4. Create all milestones/sprints
      if (!options?.skipMilestones) {
        await this.createMilestones(
          projectId,
          userId,
          config,
          template.methodology,
        );
      }

      // 5. Increment template usage count
      template.usageCount = (template.usageCount || 0) + 1;
      await this.templateRepo.save(template);

      this.logger.log(
        `Template "${template.name}" applied successfully to project ${projectId}`,
      );
    } catch (error) {
      this.logger.error(
        `Failed to apply template ${templateId} to project ${projectId}`,
        error,
      );
      // Don't throw - template application failure shouldn't block project creation
    }
  }

  /**
   * Store template config on the project entity
   */
  private async storeTemplateConfig(
    projectId: string,
    template: ProjectTemplate,
  ): Promise<void> {
    const config = template.templateConfig as TemplateConfig;

    await this.projectRepo.update(projectId, {
      templateId: template.id,
      templateConfig: {
        defaultSprintDuration: config?.defaultSprintDuration || 14,
        defaultIssueTypes: config?.defaultIssueTypes || [
          'Task',
          'Bug',
          'Story',
        ],
        defaultPriorities: config?.defaultPriorities || [
          'Low',
          'Medium',
          'High',
          'Critical',
        ],
        defaultStatuses: config?.defaultStatuses || [
          'To Do',
          'In Progress',
          'Done',
        ],
        suggestedRoles:
          config?.suggestedRoles?.map((r) => ({
            role: r.role,
            description: r.description,
          })) || [],
        smartDefaults: config?.smartDefaults || {
          enableTimeTracking: false,
          enableStoryPoints: false,
          defaultStoryPointScale: [1, 2, 3, 5, 8, 13],
        },
      },
    });
  }

  /**
   * Create workflow statuses for the project based on template config
   * Returns a map of status name -> status ID for board column creation
   */
  private async createWorkflowStatuses(
    projectId: string,
    config: TemplateConfig,
  ): Promise<Map<string, string>> {
    // Prefer workflowStages if defined, otherwise use defaultStatuses
    let statusConfigs: Array<{
      name: string;
      categoryKey: string;
      position: number;
    }>;

    if (config.workflowStages?.length) {
      statusConfigs = config.workflowStages.map((stage, index) => ({
        name: stage.name,
        categoryKey: this.mapStageToCategoryKey(stage.name),
        position: stage.order ?? index,
      }));
    } else if (config.defaultStatuses?.length) {
      statusConfigs = config.defaultStatuses.map((name, index) => ({
        name,
        categoryKey: this.mapStageToCategoryKey(name),
        position: index,
      }));
    } else {
      // Default Linear-style statuses
      statusConfigs = [
        { name: 'Backlog', categoryKey: 'backlog', position: 0 },
        { name: 'To Do', categoryKey: 'todo', position: 1 },
        { name: 'In Progress', categoryKey: 'in_progress', position: 2 },
        { name: 'Done', categoryKey: 'done', position: 3 },
      ];
    }

    return this.workflowStatusesService.createDefaultStatusesForProject(
      projectId,
      statusConfigs,
    );
  }

  /**
   * Map a status/stage name to a workflow category key
   */
  private mapStageToCategoryKey(stageName: string): string {
    const lowerName = stageName.toLowerCase();

    if (lowerName.includes('backlog') || lowerName.includes('planning')) {
      return 'backlog';
    }
    if (
      lowerName.includes('done') ||
      lowerName.includes('complete') ||
      lowerName.includes('closed')
    ) {
      return 'done';
    }
    if (
      lowerName.includes('cancel') ||
      lowerName.includes('reject') ||
      lowerName.includes("won't")
    ) {
      return 'canceled';
    }
    if (
      lowerName.includes('todo') ||
      lowerName.includes('to do') ||
      lowerName.includes('ready')
    ) {
      return 'todo';
    }
    // Default to in_progress for everything else (review, testing, in progress, etc.)
    return 'in_progress';
  }

  /**
   * Validate template config for consistency
   * Warns (fail-fast) when board columns reference statuses that don't exist
   */
  private validateTemplateConfig(
    config: TemplateConfig,
    statusMap: Map<string, string>,
  ): void {
    if (!config.defaultBoards?.length) {
      return; // Default boards are handled separately
    }

    const availableStatuses = Array.from(statusMap.keys());

    for (const board of config.defaultBoards) {
      for (const col of board.columns) {
        const statusName = col.status || col.name;
        if (!statusMap.has(statusName)) {
          this.logger.warn(
            `[TEMPLATE VALIDATION] Board "${board.name}" column "${col.name}" ` +
              `references status "${statusName}" which was not created. ` +
              `Available statuses: [${availableStatuses.join(', ')}]. ` +
              `This will result in null statusId!`,
          );
        }
      }
    }
  }

  /**
   * Create boards with columns linked to workflow statuses
   */
  private async createBoards(
    projectId: string,
    userId: string,
    config: TemplateConfig,
    statusMap: Map<string, string>,
  ): Promise<void> {
    if (!config.defaultBoards?.length) {
      // Create a default board if none defined - MUST link to statusMap
      const defaultColumns = [
        { name: 'Backlog', order: 0, statusId: statusMap.get('Backlog') },
        { name: 'To Do', order: 1, statusId: statusMap.get('To Do') },
        {
          name: 'In Progress',
          order: 2,
          statusId: statusMap.get('In Progress'),
        },
        { name: 'Done', order: 3, statusId: statusMap.get('Done') },
      ];

      try {
        const defaultBoardDto: CreateBoardDto = {
          name: 'Main Board',
          type: BoardType.KANBAN,
          description: 'Default project board',
          columns: defaultColumns,
        };
        await this.boardsService.create(projectId, userId, defaultBoardDto);
        this.logger.log('Created default board');
      } catch (error) {
        this.logger.warn('Failed to create default board', error);
      }
      return;
    }

    for (const boardConfig of config.defaultBoards) {
      const columns = boardConfig.columns.map((col) => ({
        name: col.name,
        order: col.order,
        // Link to status if available
        statusId: statusMap.get(col.status || col.name),
      }));

      try {
        const configBoardDto: CreateBoardDto = {
          name: boardConfig.name,
          type: boardConfig.type as BoardType,
          description: `${boardConfig.type.charAt(0).toUpperCase() + boardConfig.type.slice(1)} board`,
          columns,
        };
        await this.boardsService.create(projectId, userId, configBoardDto);
        this.logger.log(`Created board "${boardConfig.name}"`);
      } catch (error) {
        this.logger.warn(`Failed to create board "${boardConfig.name}"`, error);
      }
    }
  }

  /**
   * Create all milestones from template (not just the first one)
   * For Agile/Scrum: Creates as Sprints
   * For Waterfall: Creates as project phases (stored in templateConfig for now)
   */
  private async createMilestones(
    projectId: string,
    userId: string,
    config: TemplateConfig,
    methodology: ProjectMethodology,
  ): Promise<void> {
    if (!config.defaultMilestones?.length) {
      // Create a default first sprint for Agile/Scrum
      if (
        methodology === ProjectMethodology.AGILE ||
        methodology === ProjectMethodology.SCRUM
      ) {
        const duration = config.defaultSprintDuration || 14;
        const startDate = new Date();
        const endDate = new Date(
          startDate.getTime() + duration * 24 * 60 * 60 * 1000,
        );

        try {
          await this.sprintsService.create(projectId, userId, {
            name: 'Sprint 1',
            startDate: startDate.toISOString().split('T')[0],
            endDate: endDate.toISOString().split('T')[0],
            goal: 'Initial sprint',
          });
          this.logger.log('Created default Sprint 1');
        } catch (error) {
          this.logger.warn('Failed to create default sprint', error);
        }
      }
      return;
    }

    // For Agile/Scrum, create ALL milestones as Sprints
    if (
      methodology === ProjectMethodology.AGILE ||
      methodology === ProjectMethodology.SCRUM
    ) {
      let currentDate = new Date();

      for (const milestone of config.defaultMilestones) {
        const startDate = new Date(currentDate);
        const durationDays =
          milestone.estimatedDuration || config.defaultSprintDuration || 14;

        // Skip milestones with 0 duration (like "Release" markers)
        if (durationDays === 0) {
          continue;
        }

        const endDate = new Date(
          startDate.getTime() + durationDays * 24 * 60 * 60 * 1000,
        );

        try {
          await this.sprintsService.create(projectId, userId, {
            name: milestone.name,
            startDate: startDate.toISOString().split('T')[0],
            endDate: endDate.toISOString().split('T')[0],
            goal: milestone.description || milestone.name,
          });
          this.logger.log(`Created sprint "${milestone.name}"`);
        } catch (error) {
          this.logger.warn(
            `Failed to create sprint "${milestone.name}"`,
            error,
          );
        }

        // Move start date forward for next milestone
        currentDate = endDate;
      }
    }
    // For Waterfall/Custom, milestones are stored in templateConfig
    // A dedicated MilestonesService could be added in the future
  }

  /**
   * Get a template by ID (for use by other services)
   */
  async getTemplateById(templateId: string): Promise<ProjectTemplate | null> {
    return this.templateRepo.findOne({
      where: { id: templateId, isActive: true },
    });
  }
}
