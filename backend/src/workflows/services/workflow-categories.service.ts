// src/workflows/services/workflow-categories.service.ts
import { Injectable, OnModuleInit } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { WorkflowCategory } from '../entities/workflow-category.entity';

/**
 * Default workflow categories - these are the fixed meta-states for cross-project reporting.
 * These categories are seeded on application startup.
 */
const DEFAULT_CATEGORIES = [
  { key: 'backlog', displayName: 'Backlog', colorHex: '#6b7280', position: 0 },
  { key: 'todo', displayName: 'To Do', colorHex: '#3b82f6', position: 1 },
  {
    key: 'in_progress',
    displayName: 'In Progress',
    colorHex: '#f59e0b',
    position: 2,
  },
  { key: 'done', displayName: 'Done', colorHex: '#22c55e', position: 3 },
  {
    key: 'canceled',
    displayName: 'Canceled',
    colorHex: '#ef4444',
    position: 4,
  },
];

@Injectable()
export class WorkflowCategoriesService implements OnModuleInit {
  constructor(
    @InjectRepository(WorkflowCategory)
    private readonly categoryRepo: Repository<WorkflowCategory>,
  ) {}

  /**
   * Seed default categories on application startup
   */
  async onModuleInit(): Promise<void> {
    await this.seedDefaultCategories();
  }

  /**
   * Seeds the default workflow categories if they don't exist.
   * Uses upsert to handle existing categories gracefully.
   */
  async seedDefaultCategories(): Promise<void> {
    for (const cat of DEFAULT_CATEGORIES) {
      const existing = await this.categoryRepo.findOne({
        where: { key: cat.key },
      });
      if (!existing) {
        await this.categoryRepo.save({
          key: cat.key,
          displayName: cat.displayName,
          colorHex: cat.colorHex,
          position: cat.position,
          isSystem: true,
        });
      }
    }
  }

  /**
   * Get all workflow categories ordered by position
   */
  async findAll(): Promise<WorkflowCategory[]> {
    return this.categoryRepo.find({
      order: { position: 'ASC' },
    });
  }

  /**
   * Find a category by its key
   */
  async findByKey(key: string): Promise<WorkflowCategory | null> {
    return this.categoryRepo.findOne({ where: { key } });
  }

  /**
   * Find a category by its ID
   */
  async findById(id: string): Promise<WorkflowCategory | null> {
    return this.categoryRepo.findOne({ where: { id } });
  }

  /**
   * Maps an old IssueStatus enum value to a category key.
   * This is used for backward compatibility during migration.
   */
  getCategoryKeyForLegacyStatus(status: string): string {
    const statusMap: Record<string, string> = {
      Backlog: 'backlog',
      'To Do': 'todo',
      'Selected for Development': 'todo',
      'In Progress': 'in_progress',
      'In Review': 'in_progress',
      Blocked: 'in_progress',
      'Ready for QA': 'in_progress',
      Testing: 'in_progress',
      Done: 'done',
      Closed: 'done',
      Reopened: 'todo',
      'On Hold': 'backlog',
    };
    return statusMap[status] || 'todo';
  }
}
