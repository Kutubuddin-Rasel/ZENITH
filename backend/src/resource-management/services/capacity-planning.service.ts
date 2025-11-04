import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, Between } from 'typeorm';
import { UserCapacity } from '../entities/user-capacity.entity';
import { ResourceAllocation } from '../entities/resource-allocation.entity';
import { ResourceConflict } from '../entities/resource-conflict.entity';

export interface DateRange {
  startDate: Date;
  endDate: Date;
}

export interface TeamCapacityView {
  teamId: string;
  teamName: string;
  totalCapacity: number;
  totalAllocated: number;
  utilizationPercentage: number;
  members: UserCapacity[];
  conflicts: ResourceConflict[];
}

export interface CapacityMetrics {
  userId: string;
  date: Date;
  availableHours: number;
  allocatedHours: number;
  utilizationPercentage: number;
  isOverallocated: boolean;
  conflicts: ResourceConflict[];
}

export interface CapacityBottleneck {
  userId: string;
  userName: string;
  date: Date;
  allocationPercentage: number;
  conflictingProjects: string[];
  severity: string;
  recommendedAction: string;
}

export interface CapacityReport {
  period: DateRange;
  totalUsers: number;
  averageUtilization: number;
  overallocatedUsers: number;
  bottlenecks: CapacityBottleneck[];
  recommendations: string[];
}

export interface CapacityReportParams {
  startDate: Date;
  endDate: Date;
  teamId?: string;
  projectId?: string;
  includeConflicts?: boolean;
}

@Injectable()
export class CapacityPlanningService {
  constructor(
    @InjectRepository(UserCapacity)
    private userCapacityRepo: Repository<UserCapacity>,
    @InjectRepository(ResourceAllocation)
    private allocationRepo: Repository<ResourceAllocation>,
    @InjectRepository(ResourceConflict)
    private conflictRepo: Repository<ResourceConflict>,
  ) {}

  async getUserCapacity(
    userId: string,
    startDate: Date,
    endDate: Date,
  ): Promise<UserCapacity[]> {
    return this.userCapacityRepo.find({
      where: {
        user: { id: userId },
        date: Between(startDate, endDate),
      },
      relations: ['user', 'allocations'],
      order: { date: 'ASC' },
    });
  }

  async getTeamCapacity(
    teamId: string,
    dateRange: DateRange,
  ): Promise<TeamCapacityView> {
    // This would need to be implemented based on your team structure
    // For now, returning a placeholder structure
    const members = await this.userCapacityRepo.find({
      where: {
        date: Between(dateRange.startDate, dateRange.endDate),
      },
      relations: ['user', 'allocations'],
    });

    const conflicts = await this.conflictRepo.find({
      where: {
        conflictDate: Between(dateRange.startDate, dateRange.endDate),
        status: 'active',
      },
      relations: ['user'],
    });

    const totalCapacity = members.reduce(
      (sum, member) => sum + member.availableHours,
      0,
    );
    const totalAllocated = members.reduce(
      (sum, member) => sum + member.allocatedHours,
      0,
    );
    const utilizationPercentage =
      totalCapacity > 0 ? (totalAllocated / totalCapacity) * 100 : 0;

    return {
      teamId,
      teamName: 'Team', // This would come from team lookup
      totalCapacity,
      totalAllocated,
      utilizationPercentage,
      members,
      conflicts,
    };
  }

  async calculateCapacityUtilization(
    userId: string,
    date: Date,
  ): Promise<CapacityMetrics> {
    const capacity = await this.userCapacityRepo.findOne({
      where: {
        user: { id: userId },
        date,
      },
      relations: ['allocations'],
    });

    if (!capacity) {
      // Create default capacity if none exists
      const newCapacity = this.userCapacityRepo.create({
        user: { id: userId } as any,
        date,
        availableHours: 8.0,
        allocatedHours: 0,
        isWorkingDay: true,
      });
      await this.userCapacityRepo.save(newCapacity);
      return {
        userId,
        date,
        availableHours: 8.0,
        allocatedHours: 0,
        utilizationPercentage: 0,
        isOverallocated: false,
        conflicts: [],
      };
    }

    const conflicts = await this.conflictRepo.find({
      where: {
        user: { id: userId },
        conflictDate: date,
        status: 'active',
      },
    });

    return {
      userId,
      date,
      availableHours: capacity.availableHours,
      allocatedHours: capacity.allocatedHours,
      utilizationPercentage: capacity.capacityPercentage,
      isOverallocated: capacity.capacityPercentage > 100,
      conflicts,
    };
  }

  async identifyCapacityBottlenecks(
    projectId: string,
  ): Promise<CapacityBottleneck[]> {
    const allocations = await this.allocationRepo.find({
      where: {
        project: { id: projectId },
      },
      relations: ['user'],
    });

    const bottlenecks: CapacityBottleneck[] = [];

    for (const allocation of allocations) {
      const capacity = await this.calculateCapacityUtilization(
        allocation.user.id,
        allocation.startDate,
      );

      if (capacity.isOverallocated) {
        const conflictingProjects = await this.getAllocationProjects(
          allocation.user.id,
          allocation.startDate,
        );

        bottlenecks.push({
          userId: allocation.user.id,
          userName: allocation.user.name || 'Unknown',
          date: allocation.startDate,
          allocationPercentage: capacity.utilizationPercentage,
          conflictingProjects,
          severity: capacity.utilizationPercentage > 150 ? 'critical' : 'high',
          recommendedAction: 'Reduce allocation or add resources',
        });
      }
    }

    return bottlenecks;
  }

  async generateCapacityReport(
    params: CapacityReportParams,
  ): Promise<CapacityReport> {
    const capacities = await this.userCapacityRepo.find({
      where: {
        date: Between(params.startDate, params.endDate),
      },
      relations: ['user', 'allocations'],
    });

    const totalUsers = new Set(capacities.map((c) => c.user.id)).size;
    const averageUtilization =
      capacities.length > 0
        ? capacities.reduce((sum, c) => sum + c.capacityPercentage, 0) /
          capacities.length
        : 0;

    const overallocatedUsers = capacities.filter(
      (c) => c.capacityPercentage > 100,
    ).length;

    const bottlenecks = await this.identifyCapacityBottlenecks(
      params.projectId || '',
    );

    const recommendations = this.generateRecommendations(
      averageUtilization,
      overallocatedUsers,
      bottlenecks,
    );

    return {
      period: {
        startDate: params.startDate,
        endDate: params.endDate,
      },
      totalUsers,
      averageUtilization,
      overallocatedUsers,
      bottlenecks,
      recommendations,
    };
  }

  private async getAllocationProjects(
    userId: string,
    date: Date,
  ): Promise<string[]> {
    const allocations = await this.allocationRepo.find({
      where: {
        user: { id: userId },
        startDate: Between(
          new Date(date.getTime() - 7 * 24 * 60 * 60 * 1000),
          date,
        ),
        endDate: Between(
          date,
          new Date(date.getTime() + 7 * 24 * 60 * 60 * 1000),
        ),
      },
      relations: ['project'],
    });

    return allocations.map((a) => a.project.name);
  }

  private generateRecommendations(
    averageUtilization: number,
    overallocatedUsers: number,
    bottlenecks: CapacityBottleneck[],
  ): string[] {
    const recommendations: string[] = [];

    if (averageUtilization > 90) {
      recommendations.push(
        'Consider hiring additional team members to reduce overall utilization',
      );
    }

    if (overallocatedUsers > 0) {
      recommendations.push(
        `${overallocatedUsers} team members are overallocated - review their workload`,
      );
    }

    if (bottlenecks.length > 0) {
      recommendations.push(
        `${bottlenecks.length} capacity bottlenecks detected - consider resource reallocation`,
      );
    }

    if (averageUtilization < 60) {
      recommendations.push(
        'Low utilization detected - consider taking on additional projects or reducing team size',
      );
    }

    return recommendations;
  }
}
