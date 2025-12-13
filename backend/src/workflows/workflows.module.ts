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
    TypeOrmModule,
  ],
})
export class WorkflowsModule { }

