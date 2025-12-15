/**
 * Project Creation Orchestrator
 *
 * Coordinates the atomic creation of a project with template configuration.
 * Uses QueryRunner for transaction management - if ANY step fails, ALL changes rollback.
 *
 * This is the single entry point for project creation with templates.
 * Controllers should use this orchestrator, NOT call individual services.
 */

import { Injectable, Logger, Inject, forwardRef } from '@nestjs/common';
import { DataSource, QueryRunner } from 'typeorm';
import { Project } from '../../projects/entities/project.entity';
import { ProjectMembersService } from '../../membership/project-members/project-members.service';
import { ProjectRole } from '../../membership/enums/project-role.enum';
import { TemplateApplicationService } from '../services/template-application.service';
import { WizardDtoMapper } from '../mappers/wizard-dto.mapper';
import { CreateProjectFromWizardDto } from '../dto/wizard-input.dto';
// ValidatedWizardData imported internally by WizardDtoMapper

/**
 * Result of project creation
 */
export interface ProjectCreationResult {
  project: Project;
  templateApplied: boolean;
  statusesCreated: number;
  boardsCreated: number;
  sprintsCreated: number;
}

/**
 * Exception thrown when project creation fails
 */
export class ProjectCreationFailedException extends Error {
  constructor(
    message: string,
    public readonly cause?: Error,
  ) {
    super(message);
    this.name = 'ProjectCreationFailedException';
  }
}

@Injectable()
export class ProjectCreationOrchestrator {
  private readonly logger = new Logger(ProjectCreationOrchestrator.name);

  constructor(
    private readonly dataSource: DataSource,
    private readonly membershipService: ProjectMembersService,
    @Inject(forwardRef(() => TemplateApplicationService))
    private readonly templateApplicationService: TemplateApplicationService,
    private readonly wizardDtoMapper: WizardDtoMapper,
  ) {}

  /**
   * Create a project with template in a single atomic transaction
   *
   * If ANY step fails, the ENTIRE transaction is rolled back.
   * This guarantees data consistency - no orphaned projects without templates.
   *
   * @param dto - Validated wizard input
   * @param userId - Creating user's ID
   * @param organizationId - Organization context
   * @returns Complete project with template applied
   * @throws ProjectCreationFailedException if any step fails
   */
  async createProjectWithTemplate(
    dto: CreateProjectFromWizardDto,
    userId: string,
    organizationId?: string,
  ): Promise<ProjectCreationResult> {
    // 1. Validate and transform input
    const validatedData = this.wizardDtoMapper.toValidatedWizardData(dto);

    // 2. Generate project key if not provided
    const projectKey =
      validatedData.projectKey ||
      this.generateProjectKey(validatedData.projectName);

    // 3. Create QueryRunner for transaction
    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    this.logger.log(
      `Starting atomic project creation for "${validatedData.projectName}"`,
    );

    try {
      // Step 1: Create project entity
      const project = queryRunner.manager.create(Project, {
        name: validatedData.projectName,
        key: projectKey,
        description: validatedData.description || undefined,
        organizationId: organizationId || undefined,
      });

      const savedProject = await queryRunner.manager.save(Project, project);
      this.logger.debug(`Created project entity: ${savedProject.id}`);

      // Step 2: Assign project lead
      await this.addMemberTransactional(
        queryRunner,
        savedProject.id,
        userId,
        ProjectRole.PROJECT_LEAD,
      );
      this.logger.debug(`Assigned project lead: ${userId}`);

      // Step 3: Apply template (if provided)
      let templateApplied = false;
      let statusesCreated = 0;
      let boardsCreated = 0;
      let sprintsCreated = 0;

      if (validatedData.templateId) {
        const result =
          await this.templateApplicationService.applyTemplateTransactional(
            queryRunner.manager,
            savedProject.id,
            validatedData.templateId,
            userId,
          );

        templateApplied = true;
        statusesCreated = result.statusesCreated;
        boardsCreated = result.boardsCreated;
        sprintsCreated = result.sprintsCreated;
        this.logger.debug(`Applied template: ${validatedData.templateId}`);
      }

      // Step 4: Commit transaction
      await queryRunner.commitTransaction();
      this.logger.log(
        `Project "${savedProject.name}" created successfully with ID: ${savedProject.id}`,
      );

      return {
        project: savedProject,
        templateApplied,
        statusesCreated,
        boardsCreated,
        sprintsCreated,
      };
    } catch (error) {
      // ROLLBACK everything on failure
      await queryRunner.rollbackTransaction();
      this.logger.error(
        `Project creation failed, transaction rolled back`,
        error,
      );

      // Re-throw with context
      if (error instanceof ProjectCreationFailedException) {
        throw error;
      }

      throw new ProjectCreationFailedException(
        `Failed to create project "${validatedData.projectName}": ${error instanceof Error ? error.message : 'Unknown error'}`,
        error instanceof Error ? error : undefined,
      );
    } finally {
      // Always release the query runner
      await queryRunner.release();
    }
  }

  /**
   * Add member within transaction
   */
  private async addMemberTransactional(
    queryRunner: QueryRunner,
    projectId: string,
    userId: string,
    role: ProjectRole,
  ): Promise<void> {
    // Use the membership service with the transaction manager
    // For now, we'll directly insert - can be refactored to use service method
    await queryRunner.manager.query(
      `INSERT INTO project_members ("projectId", "userId", "roleName", "createdAt", "updatedAt")
       VALUES ($1, $2, $3, NOW(), NOW())
       ON CONFLICT ("projectId", "userId") DO NOTHING`,
      [projectId, userId, role],
    );
  }

  /**
   * Generate a unique project key from name
   */
  private generateProjectKey(name: string): string {
    return name
      .toUpperCase()
      .replace(/[^A-Z]/g, '')
      .slice(0, 5)
      .padEnd(2, 'X');
  }
}
