import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ScheduleModule } from '@nestjs/schedule';
import { MembershipModule } from '../membership/membership.module';

// Entities
import { Workflow } from './entities/workflow.entity';
import { AutomationRule } from './entities/automation-rule.entity';
import { WorkflowExecution } from './entities/workflow-execution.entity';
import { WorkflowTemplate } from './entities/workflow-template.entity';
import { WorkflowCategory } from './entities/workflow-category.entity';
import { WorkflowStatus } from './entities/workflow-status.entity';
import { WorkflowTransition } from './entities/workflow-transition.entity';

// Services
import { WorkflowEngineService } from './services/workflow-engine.service';
import { AutomationRulesService } from './services/automation-rules.service';
import { WorkflowDesignerService } from './services/workflow-designer.service';
import { WorkflowTemplateService } from './services/workflow-template.service';
import { WorkflowAnalyticsService } from './services/workflow-analytics.service';
import { WorkflowCategoriesService } from './services/workflow-categories.service';
import { WorkflowStatusesService } from './services/workflow-statuses.service';
import { WorkflowTransitionsService } from './services/workflow-transitions.service';

// Controllers
import { WorkflowsController } from './controllers/workflows.controller';
import { AutomationRulesController } from './controllers/automation-rules.controller';
import { WorkflowDesignerController } from './controllers/workflow-designer.controller';
import { WorkflowTemplatesController } from './controllers/workflow-templates.controller';
import { WorkflowAnalyticsController } from './controllers/workflow-analytics.controller';

// SOLID Refactor (boards Step 2): capability-owner side of the
// `WorkflowLookupPort` inversion. The port is declared in
// `boards/ports/workflow-lookup.port.ts` (consumer-owned); this module binds
// the TypeORM-backed adapter so `BoardOrderingService.moveIssue` (Step 3) can
// resolve a `WorkflowStatus` without reaching across the workflows aggregate
// boundary via `dataSource.getRepository(WorkflowStatus)` (DIP CRITICAL).
// Sealed-barrel consumption (Step 4): `WorkflowLookupPort` is part
// of the public surface that `boards/index.ts` re-exports. Deep
// imports into `boards/ports/*` are banned by `no-restricted-imports`.
import { WorkflowLookupPort } from '../boards';
import { WorkflowLookupAdapter } from './adapters/workflow-lookup.adapter';

// SOLID Refactor (issues Step 2b): capability-owner side of the issues →
// workflows inversion. Both ports are issues-owned (declared in
// `issues/ports/workflow-lookup.port.ts`); WorkflowsModule (imported by
// `issues.module`) binds the adapters and re-exports the tokens — the same
// pattern it already uses for boards' `WorkflowLookupPort`.
import {
  WorkflowStatusLookupPort,
  WorkflowTransitionPolicyPort,
} from '../issues';
import { WorkflowStatusLookupAdapter } from './adapters/workflow-status-lookup.adapter';
import { WorkflowTransitionPolicyAdapter } from './adapters/workflow-transition-policy.adapter';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      Workflow,
      AutomationRule,
      WorkflowExecution,
      WorkflowTemplate,
      WorkflowCategory,
      WorkflowStatus,
      WorkflowTransition,
    ]),
    ScheduleModule.forRoot(),
    MembershipModule,
  ],
  providers: [
    WorkflowEngineService,
    AutomationRulesService,
    WorkflowDesignerService,
    WorkflowTemplateService,
    WorkflowAnalyticsService,
    WorkflowCategoriesService,
    WorkflowStatusesService,
    WorkflowTransitionsService,
    { provide: WorkflowLookupPort, useClass: WorkflowLookupAdapter },
    {
      provide: WorkflowStatusLookupPort,
      useClass: WorkflowStatusLookupAdapter,
    },
    {
      provide: WorkflowTransitionPolicyPort,
      useClass: WorkflowTransitionPolicyAdapter,
    },
  ],
  controllers: [
    WorkflowsController,
    AutomationRulesController,
    WorkflowDesignerController,
    WorkflowTemplatesController,
    WorkflowAnalyticsController,
  ],
  exports: [
    WorkflowEngineService,
    AutomationRulesService,
    WorkflowDesignerService,
    WorkflowTemplateService,
    WorkflowAnalyticsService,
    WorkflowCategoriesService,
    WorkflowStatusesService,
    WorkflowTransitionsService,
    WorkflowLookupPort,
    WorkflowStatusLookupPort,
    WorkflowTransitionPolicyPort,
    TypeOrmModule,
  ],
})
export class WorkflowsModule {}
