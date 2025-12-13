// src/workflows/services/workflow-transitions.service.ts
import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, IsNull } from 'typeorm';
import { WorkflowTransition } from '../entities/workflow-transition.entity';
import { WorkflowStatusesService } from './workflow-statuses.service';
import { Issue } from '../../issues/entities/issue.entity';

export interface TransitionCheckResult {
  allowed: boolean;
  reason?: string;
  transitionName?: string;
  requiresComment?: boolean;
}

export interface CreateTransitionDto {
  projectId: string;
  fromStatusId?: string | null;
  toStatusId: string;
  name: string;
  description?: string;
  allowedRoles?: string[];
  conditions?: WorkflowTransition['conditions'];
  position?: number;
}

@Injectable()
export class WorkflowTransitionsService {
  constructor(
    @InjectRepository(WorkflowTransition)
    private readonly repo: Repository<WorkflowTransition>,
    private readonly statusesService: WorkflowStatusesService,
  ) {}

  /**
   * Check if a status transition is allowed for a given issue and user role.
   *
   * Logic:
   * 1. If no transition rules exist for this project, allow all transitions (default open)
   * 2. If rules exist, look for a matching rule (from current status OR from any status)
   * 3. Check role permissions and conditions
   */
  async isTransitionAllowed(
    projectId: string,
    currentStatusName: string,
    targetStatusName: string,
    userRole: string,
    issue?: Issue,
  ): Promise<TransitionCheckResult> {
    // Get status entities
    const currentStatus = await this.statusesService.findByProjectAndName(
      projectId,
      currentStatusName,
    );
    const targetStatus = await this.statusesService.findByProjectAndName(
      projectId,
      targetStatusName,
    );

    // If target status doesn't exist in workflow, it's invalid
    if (!targetStatus) {
      // Allow transition if using legacy string statuses (no workflow configured)
      const allStatuses = await this.statusesService.findByProject(projectId);
      if (allStatuses.length === 0) {
        // No workflow configured, allow all transitions
        return { allowed: true };
      }
      return {
        allowed: false,
        reason: `Status "${targetStatusName}" is not defined for this project`,
      };
    }

    // Find applicable transition rules
    const transitions = await this.repo.find({
      where: [
        // Specific transition from current status to target
        {
          projectId,
          fromStatusId: currentStatus?.id,
          toStatusId: targetStatus.id,
          isActive: true,
        },
        // Wildcard transition (from any status to target)
        {
          projectId,
          fromStatusId: IsNull(),
          toStatusId: targetStatus.id,
          isActive: true,
        },
      ],
      order: { position: 'ASC' },
    });

    // If no transition rules defined for this project at all, allow all (default open)
    const totalRules = await this.repo.count({
      where: { projectId, isActive: true },
    });
    if (totalRules === 0) {
      return { allowed: true };
    }

    // If rules exist but none match this transition, it's not allowed
    if (transitions.length === 0) {
      return {
        allowed: false,
        reason: `No transition defined from "${currentStatusName}" to "${targetStatusName}"`,
      };
    }

    // Use the first matching transition (most specific)
    const transition = transitions[0];

    // Check role permissions
    if (
      transition.allowedRoles?.length &&
      !transition.allowedRoles.includes(userRole)
    ) {
      return {
        allowed: false,
        reason: `Only ${transition.allowedRoles.join(' or ')} can ${transition.name.toLowerCase()} `,
      };
    }

    // Check conditions
    if (transition.conditions && issue) {
      // Check required fields
      if (transition.conditions.requiredFields?.length) {
        for (const field of transition.conditions.requiredFields) {
          const value = issue[field as keyof Issue];
          if (value === undefined || value === null || value === '') {
            return {
              allowed: false,
              reason: `Field "${field}" must be filled before ${transition.name.toLowerCase()} `,
            };
          }
        }
      }

      // Check minimum story points
      if (
        transition.conditions.minStoryPoints !== undefined &&
        (issue.storyPoints || 0) < transition.conditions.minStoryPoints
      ) {
        return {
          allowed: false,
          reason: `Issue must have at least ${transition.conditions.minStoryPoints} story points`,
        };
      }

      // noBlockers check would require loading issue links - implement if needed
    }

    return {
      allowed: true,
      transitionName: transition.name,
      requiresComment: transition.conditions?.requireComment,
    };
  }

  /**
   * Get all available transitions from a given status for a user.
   * Used to populate "Move to" dropdown in UI.
   */
  async getAvailableTransitions(
    projectId: string,
    currentStatusName: string,
    userRole: string,
  ): Promise<Array<{ toStatusName: string; transitionName: string }>> {
    const currentStatus = await this.statusesService.findByProjectAndName(
      projectId,
      currentStatusName,
    );

    const transitions = await this.repo.find({
      where: [
        { projectId, fromStatusId: currentStatus?.id, isActive: true },
        { projectId, fromStatusId: IsNull(), isActive: true },
      ],
      relations: ['toStatus'],
      order: { position: 'ASC' },
    });

    // Filter by role and deduplicate
    const result: Array<{ toStatusName: string; transitionName: string }> = [];
    const seenStatuses = new Set<string>();

    for (const t of transitions) {
      if (t.allowedRoles?.length && !t.allowedRoles.includes(userRole)) {
        continue;
      }
      if (!seenStatuses.has(t.toStatus.name)) {
        seenStatuses.add(t.toStatus.name);
        result.push({
          toStatusName: t.toStatus.name,
          transitionName: t.name,
        });
      }
    }

    return result;
  }

  /**
   * Create a new transition rule.
   */
  async create(dto: CreateTransitionDto): Promise<WorkflowTransition> {
    // Validate target status exists
    const targetStatus = await this.statusesService.findById(dto.toStatusId);
    if (!targetStatus) {
      throw new NotFoundException(
        `Target status not found: ${dto.toStatusId} `,
      );
    }

    // Validate from status if provided
    if (dto.fromStatusId) {
      const fromStatus = await this.statusesService.findById(dto.fromStatusId);
      if (!fromStatus) {
        throw new NotFoundException(
          `From status not found: ${dto.fromStatusId} `,
        );
      }
    }

    const transition = this.repo.create({
      projectId: dto.projectId,
      fromStatusId: dto.fromStatusId || null,
      toStatusId: dto.toStatusId,
      name: dto.name,
      description: dto.description,
      allowedRoles: dto.allowedRoles,
      conditions: dto.conditions,
      position: dto.position ?? 0,
      isActive: true,
    });

    return this.repo.save(transition);
  }

  /**
   * Create default transition rules for a project.
   * By default, we only restrict "Done" to QA/PROJECT_LEAD.
   */
  async createDefaultRules(projectId: string): Promise<void> {
    const statuses = await this.statusesService.findByProject(projectId);
    const doneStatus = statuses.find((s) => s.category?.key === 'done');

    if (doneStatus) {
      await this.create({
        projectId,
        fromStatusId: null, // from any
        toStatusId: doneStatus.id,
        name: 'Mark as Done',
        description: 'Complete this issue',
        allowedRoles: ['PROJECT_LEAD', 'QA'],
      });
    }
  }

  /**
   * Get all transition rules for a project.
   */
  async findByProject(projectId: string): Promise<WorkflowTransition[]> {
    return this.repo.find({
      where: { projectId },
      relations: ['fromStatus', 'toStatus'],
      order: { position: 'ASC' },
    });
  }

  /**
   * Update a transition rule.
   */
  async update(
    id: string,
    updates: Partial<
      Pick<
        WorkflowTransition,
        | 'name'
        | 'description'
        | 'allowedRoles'
        | 'conditions'
        | 'isActive'
        | 'position'
      >
    >,
  ): Promise<WorkflowTransition> {
    const transition = await this.repo.findOneBy({ id });
    if (!transition) {
      throw new NotFoundException(`Transition not found: ${id} `);
    }

    Object.assign(transition, updates);
    return this.repo.save(transition);
  }

  /**
   * Delete a transition rule.
   */
  async delete(id: string): Promise<void> {
    const result = await this.repo.delete(id);
    if (result.affected === 0) {
      throw new NotFoundException(`Transition not found: ${id} `);
    }
  }
}
