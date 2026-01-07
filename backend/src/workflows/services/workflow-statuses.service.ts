// src/workflows/services/workflow-statuses.service.ts
import {
  Injectable,
  NotFoundException,
  BadRequestException,
  Logger,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { WorkflowStatus } from '../entities/workflow-status.entity';
import { WorkflowCategoriesService } from './workflow-categories.service';

export interface CreateWorkflowStatusDto {
  projectId: string;
  categoryKey: string; // e.g., 'backlog', 'todo', 'in_progress', 'done', 'canceled'
  name: string;
  description?: string;
  colorHex?: string;
  position?: number;
  isDefault?: boolean;
}

@Injectable()
export class WorkflowStatusesService {
  private readonly logger = new Logger(WorkflowStatusesService.name);

  constructor(
    @InjectRepository(WorkflowStatus)
    private readonly statusRepo: Repository<WorkflowStatus>,
    private readonly categoriesService: WorkflowCategoriesService,
  ) {}

  /**
   * Create a new workflow status for a project
   */
  async create(dto: CreateWorkflowStatusDto): Promise<WorkflowStatus> {
    let category = await this.categoriesService.findByKey(dto.categoryKey);

    // If category not found, try seeding defaults first (race condition protection)
    if (!category) {
      this.logger.warn(
        `Category "${dto.categoryKey}" not found, seeding defaults...`,
      );
      await this.categoriesService.seedDefaultCategories();
      category = await this.categoriesService.findByKey(dto.categoryKey);
    }

    if (!category) {
      throw new BadRequestException(`Invalid category key: ${dto.categoryKey}`);
    }

    // Check if status name already exists in project
    const existing = await this.statusRepo.findOne({
      where: { projectId: dto.projectId, name: dto.name },
    });
    if (existing) {
      // Return existing status instead of throwing error (idempotent)
      this.logger.debug(
        `Status "${dto.name}" already exists in project ${dto.projectId}, returning existing`,
      );
      return existing;
    }

    const status = this.statusRepo.create({
      projectId: dto.projectId,
      categoryId: category.id,
      name: dto.name,
      description: dto.description,
      colorHex: dto.colorHex || category.colorHex,
      position: dto.position ?? 0,
      isDefault: dto.isDefault ?? false,
    });

    return this.statusRepo.save(status);
  }

  /**
   * Create default statuses for a new project based on a template configuration.
   * Returns a map of status names to their IDs for use in board column creation.
   */
  async createDefaultStatusesForProject(
    projectId: string,
    statusConfigs: Array<{
      name: string;
      categoryKey: string;
      position: number;
    }>,
  ): Promise<Map<string, string>> {
    const statusMap = new Map<string, string>();

    for (let i = 0; i < statusConfigs.length; i++) {
      const config = statusConfigs[i];
      const status = await this.create({
        projectId,
        categoryKey: config.categoryKey,
        name: config.name,
        position: config.position ?? i,
        isDefault: i === 0, // First status is default
      });
      statusMap.set(config.name, status.id);
    }

    return statusMap;
  }

  /**
   * Get all statuses for a project, ordered by position
   */
  async findByProject(projectId: string): Promise<WorkflowStatus[]> {
    return this.statusRepo.find({
      where: { projectId },
      relations: ['category'],
      order: { position: 'ASC' },
    });
  }

  /**
   * Find a status by ID
   */
  async findById(id: string): Promise<WorkflowStatus | null> {
    return this.statusRepo.findOne({
      where: { id },
      relations: ['category'],
    });
  }

  /**
   * Find a status by project and name
   */
  async findByProjectAndName(
    projectId: string,
    name: string,
  ): Promise<WorkflowStatus | null> {
    return this.statusRepo.findOne({
      where: { projectId, name },
      relations: ['category'],
    });
  }

  /**
   * Get the default status for a project (used when creating new issues)
   */
  async getDefaultStatus(projectId: string): Promise<WorkflowStatus | null> {
    return this.statusRepo.findOne({
      where: { projectId, isDefault: true },
      relations: ['category'],
    });
  }

  /**
   * Update a status
   */
  async update(
    id: string,
    updates: Partial<
      Pick<
        WorkflowStatus,
        'name' | 'description' | 'colorHex' | 'position' | 'isDefault'
      >
    >,
  ): Promise<WorkflowStatus> {
    const status = await this.findById(id);
    if (!status) {
      throw new NotFoundException(`Status not found: ${id}`);
    }

    Object.assign(status, updates);
    return this.statusRepo.save(status);
  }

  /**
   * Delete a status (will fail if issues are using it)
   */
  async delete(id: string): Promise<void> {
    const result = await this.statusRepo.delete(id);
    if (result.affected === 0) {
      throw new NotFoundException(`Status not found: ${id}`);
    }
  }

  /**
   * Validate that a status ID belongs to a specific project
   */
  async validateStatusForProject(
    statusId: string,
    projectId: string,
  ): Promise<WorkflowStatus> {
    const status = await this.findById(statusId);
    if (!status) {
      throw new NotFoundException(`Status not found: ${statusId}`);
    }
    if (status.projectId !== projectId) {
      throw new BadRequestException(`Status does not belong to this project`);
    }
    return status;
  }
}
