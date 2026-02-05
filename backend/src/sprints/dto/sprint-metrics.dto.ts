// src/sprints/dto/sprint-metrics.dto.ts
import { ApiProperty } from '@nestjs/swagger';

/**
 * STRICT RETURN TYPES for Sprint Metrics Endpoints
 * 
 * Classes (not interfaces) for Swagger/OpenAPI visibility.
 * All floating-point values rounded to 2 decimal places.
 */

// ============================================
// BURNDOWN
// ============================================

export class BurndownSnapshotDto {
    @ApiProperty({ description: 'Snapshot date (YYYY-MM-DD format)' })
    date: string;

    @ApiProperty({ description: 'Total story points at this point' })
    totalPoints: number;

    @ApiProperty({ description: 'Completed story points' })
    completedPoints: number;

    @ApiProperty({ description: 'Remaining story points' })
    remainingPoints: number;

    @ApiProperty({ description: 'Total issue count' })
    totalIssues: number;

    @ApiProperty({ description: 'Completed issue count' })
    completedIssues: number;
}

export class SprintSummaryDto {
    @ApiProperty({ description: 'Sprint UUID' })
    id: string;

    @ApiProperty({ description: 'Sprint name' })
    name: string;

    @ApiProperty({ description: 'Sprint start date (ISO string)' })
    startDate: string;

    @ApiProperty({ description: 'Sprint end date (ISO string)' })
    endDate: string;

    @ApiProperty({ description: 'Sprint status', enum: ['PLANNING', 'ACTIVE', 'COMPLETED'] })
    status: string;
}

export class BurndownResponseDto {
    @ApiProperty({ type: SprintSummaryDto })
    sprint: SprintSummaryDto;

    @ApiProperty({ type: [BurndownSnapshotDto], description: 'Daily snapshots' })
    snapshots: BurndownSnapshotDto[];

    @ApiProperty({ description: 'Ideal burn rate (points per day)', example: 5.5 })
    idealBurnRate: number;

    @ApiProperty({ description: 'Initial scope in story points' })
    initialScope: number;

    @ApiProperty({ description: 'Total sprint duration in days' })
    totalDays: number;
}

// ============================================
// BURNUP
// ============================================

export class BurnupSnapshotDto {
    @ApiProperty({ description: 'Snapshot date (YYYY-MM-DD format)' })
    date: string;

    @ApiProperty({ description: 'Completed story points' })
    completedPoints: number;

    @ApiProperty({ description: 'Total scope (can increase due to scope creep)' })
    totalScope: number;

    @ApiProperty({ description: 'Remaining story points' })
    remainingPoints: number;
}

export class BurnupResponseDto {
    @ApiProperty({ type: SprintSummaryDto })
    sprint: SprintSummaryDto;

    @ApiProperty({ type: [BurnupSnapshotDto], description: 'Daily snapshots' })
    snapshots: BurnupSnapshotDto[];

    @ApiProperty({ description: 'Initial scope at sprint start' })
    initialScope: number;

    @ApiProperty({ description: 'Current total scope' })
    currentScope: number;

    @ApiProperty({ description: 'Scope creep (current - initial)' })
    scopeCreep: number;

    @ApiProperty({ description: 'Scope creep as percentage', example: 15.5 })
    scopeCreepPercentage: number;
}

// ============================================
// VELOCITY
// ============================================

export class VelocityPointDto {
    @ApiProperty({ description: 'Sprint UUID' })
    sprintId: string;

    @ApiProperty({ description: 'Sprint name' })
    sprintName: string;

    @ApiProperty({ description: 'Completed story points in this sprint' })
    completedPoints: number;

    @ApiProperty({ description: 'Total committed points in this sprint' })
    totalPoints: number;
}

export class VelocityResponseDto {
    @ApiProperty({ type: [VelocityPointDto], description: 'Last 5 sprints velocity data' })
    history: VelocityPointDto[];

    @ApiProperty({ description: 'Average velocity across sprints', example: 25.5 })
    average: number;

    @ApiProperty({
        description: 'Velocity trend based on recent history',
        enum: ['stable', 'increasing', 'decreasing'],
    })
    trend: 'stable' | 'increasing' | 'decreasing';
}
