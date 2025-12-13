import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ResourceAllocation } from '../entities/resource-allocation.entity';
import { UserCapacity } from '../entities/user-capacity.entity';
import { ResourceConflict } from '../entities/resource-conflict.entity';
import { SkillMatrix } from '../entities/skill-matrix.entity';

export interface OptimizationResult {
  success: boolean;
  optimizedAllocations: ResourceAllocation[];
  conflictsResolved: number;
  efficiencyImprovement: number;
  recommendations: string[];
}

export interface ResourceSuggestion {
  userId: string;
  userName: string;
  skillMatch: number;
  availability: number;
  cost: number;
  confidence: number;
  reasons: string[];
}

export interface WorkloadBalanceResult {
  teamId: string;
  beforeBalance: Record<string, number>;
  afterBalance: Record<string, number>;
  improvements: string[];
  recommendations: string[];
}

export interface CostEstimate {
  totalCost: number;
  dailyCost: number;
  hourlyCost: number;
  breakdown: {
    baseCost: number;
    overtimeCost: number;
    skillPremium: number;
  };
}

export interface ResourceAllocationDto {
  userId: string;
  projectId: string;
  taskId?: string;
  allocationPercentage: number;
  startDate: Date;
  endDate: Date;
  roleInProject: string;
  billingRate?: number;
  skillRequirements?: Record<string, unknown>;
}

@Injectable()
export class ResourceAllocationService {
  constructor(
    @InjectRepository(ResourceAllocation)
    private allocationRepo: Repository<ResourceAllocation>,
    @InjectRepository(UserCapacity)
    private capacityRepo: Repository<UserCapacity>,
    @InjectRepository(ResourceConflict)
    private conflictRepo: Repository<ResourceConflict>,
    @InjectRepository(SkillMatrix)
    private skillRepo: Repository<SkillMatrix>,
  ) {}

  async optimizeResourceAllocation(
    projectId: string,
  ): Promise<OptimizationResult> {
    const allocations = await this.allocationRepo.find({
      where: { project: { id: projectId } },
      relations: ['user', 'project', 'task'],
    });

    const conflicts = await this.detectAllocationConflicts(
      allocations.map((a) => a.user.id),
    );

    const optimizedAllocations = this.performOptimization(allocations);
    const conflictsResolved = this.resolveConflicts(conflicts);

    const efficiencyImprovement = this.calculateEfficiencyImprovement();

    const recommendations = this.generateOptimizationRecommendations(
      optimizedAllocations,
      conflictsResolved,
    );

    return {
      success: true,
      optimizedAllocations,
      conflictsResolved,
      efficiencyImprovement,
      recommendations,
    };
  }

  suggestResourceAssignment(): ResourceSuggestion[] {
    // This would integrate with task requirements and skill matching
    // For now, returning a placeholder structure
    const suggestions: ResourceSuggestion[] = [];

    // In a real implementation, this would:
    // 1. Get task requirements and skills needed
    // 2. Find users with matching skills
    // 3. Check availability
    // 4. Calculate cost and confidence scores
    // 5. Rank suggestions

    return suggestions;
  }

  async detectAllocationConflicts(
    userIds: string[],
  ): Promise<ResourceConflict[]> {
    const conflicts: ResourceConflict[] = [];

    for (const userId of userIds) {
      const allocations = await this.allocationRepo.find({
        where: { user: { id: userId } },
        relations: ['user', 'project'],
      });

      const conflictMap = new Map<string, ResourceAllocation[]>();

      for (const allocation of allocations) {
        const dateKey = allocation.startDate.toISOString().split('T')[0];
        if (!conflictMap.has(dateKey)) {
          conflictMap.set(dateKey, []);
        }
        conflictMap.get(dateKey)?.push(allocation);
      }

      for (const [date, dayAllocations] of conflictMap) {
        const totalPercentage = dayAllocations.reduce(
          (sum, a) => sum + a.allocationPercentage,
          0,
        );

        if (totalPercentage > 100) {
          const conflict = this.conflictRepo.create({
            user: { id: userId } as Record<string, unknown>,
            conflictDate: new Date(date),
            totalAllocationPercentage: totalPercentage,
            conflictingAllocations: dayAllocations.map((a) => ({
              id: a.id,
              projectId: a.project.id,
              projectName: a.project.name,
              allocationPercentage: a.allocationPercentage,
            })) as unknown as Record<string, unknown>,
            severity: totalPercentage > 150 ? 'critical' : 'high',
            status: 'active',
          });

          conflicts.push(conflict);
        }
      }
    }

    if (conflicts.length > 0) {
      await this.conflictRepo.save(conflicts);
    }

    return conflicts;
  }

  balanceWorkload(teamId: string): WorkloadBalanceResult {
    // This would implement workload balancing algorithms
    // For now, returning a placeholder structure
    return {
      teamId,
      beforeBalance: {},
      afterBalance: {},
      improvements: [],
      recommendations: [],
    };
  }

  estimateResourceCost(allocation: ResourceAllocationDto): CostEstimate {
    const days = Math.ceil(
      (allocation.endDate.getTime() - allocation.startDate.getTime()) /
        (1000 * 60 * 60 * 24),
    );

    const hoursPerDay = (allocation.allocationPercentage / 100) * 8;
    const totalHours = days * hoursPerDay;
    const billingRate = allocation.billingRate || 0;

    const baseCost = totalHours * billingRate;
    const overtimeHours = Math.max(0, totalHours - days * 8);
    const overtimeCost = overtimeHours * billingRate * 1.5;

    // Skill premium calculation (simplified)
    const skillPremium = this.calculateSkillPremium(
      allocation.skillRequirements,
    );

    const totalCost = baseCost + overtimeCost + skillPremium;
    const dailyCost = totalCost / days;
    const hourlyCost = totalCost / totalHours;

    return {
      totalCost,
      dailyCost,
      hourlyCost,
      breakdown: {
        baseCost,
        overtimeCost,
        skillPremium,
      },
    };
  }

  private performOptimization(
    allocations: ResourceAllocation[],
  ): ResourceAllocation[] {
    // This would implement the actual optimization algorithm
    // For now, returning the original allocations
    return allocations;
  }

  private resolveConflicts(conflicts: ResourceConflict[]): number {
    let resolved = 0;

    for (const conflict of conflicts) {
      // Implement conflict resolution logic
      // This could involve:
      // 1. Automatic reallocation
      // 2. Notifying managers
      // 3. Suggesting alternatives
      conflict.status = 'resolved';
      conflict.resolvedAt = new Date();
      resolved++;
    }

    if (conflicts.length > 0) {
      void this.conflictRepo.save(conflicts);
    }

    return resolved;
  }

  private calculateEfficiencyImprovement(): number {
    // Calculate efficiency improvement percentage
    // This would compare utilization, conflicts, etc.
    return 0; // Placeholder
  }

  private generateOptimizationRecommendations(
    allocations: ResourceAllocation[],
    conflictsResolved: number,
  ): string[] {
    const recommendations: string[] = [];

    if (conflictsResolved > 0) {
      recommendations.push(
        `Resolved ${conflictsResolved} allocation conflicts`,
      );
    }

    const avgAllocation =
      allocations.reduce((sum, a) => sum + a.allocationPercentage, 0) /
      allocations.length;

    if (avgAllocation > 80) {
      recommendations.push(
        'Consider reducing allocation percentages to prevent burnout',
      );
    }

    if (avgAllocation < 40) {
      recommendations.push(
        'Consider increasing allocation percentages for better utilization',
      );
    }

    return recommendations;
  }

  private calculateSkillPremium(
    skillRequirements?: Record<string, unknown>,
  ): number {
    if (!skillRequirements) return 0;

    // Simplified skill premium calculation
    const skillCount = Object.keys(skillRequirements).length;
    return skillCount * 10; // $10 per required skill
  }
}
