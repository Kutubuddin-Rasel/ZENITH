import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { UserCapacity } from './entities/user-capacity.entity';
import { ResourceAllocation } from './entities/resource-allocation.entity';
import { SkillMatrix } from './entities/skill-matrix.entity';
import { ResourceConflict } from './entities/resource-conflict.entity';
import { ResourceForecast } from './entities/resource-forecast.entity';
import { Project } from '../projects/entities/project.entity';
import { User } from '../users/entities/user.entity';
import { CapacityPlanningService } from './services/capacity-planning.service';
import { ResourceAllocationService } from './services/resource-allocation.service';
import { ResourceAnalyticsService } from './services/resource-analytics.service';
import { ResourceOptimizationAI } from './services/resource-optimization-ai.service';
import { SkillMatchingService } from './services/skill-matching.service';
import { CapacityPlanningController } from './controllers/capacity-planning.controller';
import { ResourceAllocationController } from './controllers/resource-allocation.controller';
import { ResourceAnalyticsController } from './controllers/resource-analytics.controller';
import { SkillMatchingController } from './controllers/skill-matching.controller';
import { ProjectsModule } from '../projects/projects.module';
import { UsersModule } from '../users/users.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      UserCapacity,
      ResourceAllocation,
      SkillMatrix,
      ResourceConflict,
      ResourceForecast,
      Project,
      User,
    ]),
    ProjectsModule,
    UsersModule,
  ],
  controllers: [
    CapacityPlanningController,
    ResourceAllocationController,
    ResourceAnalyticsController,
    SkillMatchingController,
  ],
  providers: [
    CapacityPlanningService,
    ResourceAllocationService,
    ResourceAnalyticsService,
    ResourceOptimizationAI,
    SkillMatchingService,
  ],
  exports: [
    CapacityPlanningService,
    ResourceAllocationService,
    ResourceAnalyticsService,
    ResourceOptimizationAI,
    SkillMatchingService,
  ],
})
export class ResourceManagementModule {}
