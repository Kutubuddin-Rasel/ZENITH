import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Body,
  Param,
  Query,
  UseGuards,
  Request,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { WorkflowEngineService } from '../services/workflow-engine.service';
import { WorkflowDesignerService } from '../services/workflow-designer.service';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { PermissionsGuard } from '../../core/auth/guards/permissions.guard';
import { RequirePermission } from '../../auth/decorators/require-permission.decorator';
import { StatefulCsrfGuard, RequireCsrf } from '../../security/csrf/csrf.guard';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Workflow } from '../entities/workflow.entity';
import { WorkflowExecution } from '../entities/workflow-execution.entity';
import { WorkflowDefinition } from '../entities/workflow.entity';
import { ExecutionContext } from '../entities/workflow-execution.entity';
import { CreateWorkflowDto, UpdateWorkflowDto } from '../dto';
import { UserThrottlerGuard, WorkflowThrottle } from '../guards/user-throttler.guard';

@Controller('api/workflows')
@UseGuards(JwtAuthGuard, StatefulCsrfGuard, PermissionsGuard, UserThrottlerGuard)
export class WorkflowsController {
  constructor(
    private workflowEngineService: WorkflowEngineService,
    private workflowDesignerService: WorkflowDesignerService,
    @InjectRepository(Workflow)
    private workflowRepo: Repository<Workflow>,
    @InjectRepository(WorkflowExecution)
    private executionRepo: Repository<WorkflowExecution>,
  ) { }

  @Post()
  @RequirePermission('projects:edit')
  async createWorkflow(
    @Request() req: { user: { id: string } },
    @Body() dto: CreateWorkflowDto,
  ) {
    const workflow = this.workflowRepo.create({
      projectId: dto.projectId,
      createdBy: req.user.id,
      name: dto.name,
      description: dto.description,
      definition: dto.definition as unknown as WorkflowDefinition,
      tags: dto.tags,
      category: dto.category,
      icon: dto.icon,
      color: dto.color,
    });

    const savedWorkflow = await this.workflowRepo.save(workflow);

    return {
      success: true,
      data: savedWorkflow,
    };
  }

  @Get()
  @RequirePermission('projects:view')
  async getWorkflows(
    @Request() req: { user: { id: string } },
    @Query('projectId') projectId?: string,
    @Query('category') category?: string,
    @Query('search') search?: string,
    @Query('limit') limit?: number,
    @Query('offset') offset?: number,
  ) {
    const query = this.workflowRepo.createQueryBuilder('workflow');

    if (projectId) {
      query.andWhere('workflow.projectId = :projectId', { projectId });
    }

    if (category) {
      query.andWhere('workflow.category = :category', { category });
    }

    if (search) {
      query.andWhere(
        '(workflow.name ILIKE :search OR workflow.description ILIKE :search)',
        { search: `%${search}%` },
      );
    }

    const [workflows, total] = await query
      .orderBy('workflow.createdAt', 'DESC')
      .take(limit || 50)
      .skip(offset || 0)
      .getManyAndCount();

    return {
      success: true,
      data: workflows,
      total,
    };
  }

  @Get(':id')
  @RequirePermission('projects:view')
  async getWorkflow(@Param('id') id: string) {
    const workflow = await this.workflowRepo.findOne({
      where: { id },
    });

    if (!workflow) {
      return {
        success: false,
        error: 'Workflow not found',
      };
    }

    return {
      success: true,
      data: workflow,
    };
  }

  @Put(':id')
  @RequirePermission('projects:edit')
  async updateWorkflow(
    @Param('id') id: string,
    @Request() req: { user: { id: string } },
    @Body() dto: UpdateWorkflowDto,
  ) {
    const workflow = await this.workflowRepo.findOne({
      where: { id, createdBy: req.user.id },
    });

    if (!workflow) {
      return {
        success: false,
        error: 'Workflow not found',
      };
    }

    // Apply validated DTO fields
    if (dto.name !== undefined) workflow.name = dto.name;
    if (dto.description !== undefined) workflow.description = dto.description;
    if (dto.definition !== undefined) workflow.definition = dto.definition as unknown as WorkflowDefinition;
    if (dto.tags !== undefined) workflow.tags = dto.tags;
    if (dto.category !== undefined) workflow.category = dto.category;
    if (dto.icon !== undefined) workflow.icon = dto.icon;
    if (dto.color !== undefined) workflow.color = dto.color;
    if (dto.isActive !== undefined) workflow.isActive = dto.isActive;

    const updatedWorkflow = await this.workflowRepo.save(workflow);

    return {
      success: true,
      data: updatedWorkflow,
    };
  }

  @Delete(':id')
  @RequirePermission('projects:edit')
  async deleteWorkflow(
    @Param('id') id: string,
    @Request() req: { user: { id: string } },
  ) {
    const workflow = await this.workflowRepo.findOne({
      where: { id, createdBy: req.user.id },
    });

    if (!workflow) {
      return {
        success: false,
        error: 'Workflow not found',
      };
    }

    await this.workflowRepo.remove(workflow);

    return {
      success: true,
      message: 'Workflow deleted successfully',
    };
  }

  @Post(':id/execute')
  @HttpCode(HttpStatus.OK)
  @RequirePermission('projects:edit')
  @WorkflowThrottle({ limit: 10, ttl: 60 }) // 10 executions per minute
  async executeWorkflow(
    @Param('id') id: string,
    @Body()
    body: {
      context: ExecutionContext;
    },
  ) {
    try {
      const execution = await this.workflowEngineService.executeWorkflow(
        id,
        body.context,
      );

      return {
        success: true,
        data: execution,
      };
    } catch (error: unknown) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  @Get(':id/executions')
  @RequirePermission('projects:view')
  async getWorkflowExecutions(
    @Param('id') id: string,
    @Query('limit') limit?: number,
    @Query('offset') offset?: number,
  ) {
    const executions = await this.workflowEngineService.getWorkflowExecutions(
      id,
      limit || 50,
      offset || 0,
    );

    return {
      success: true,
      data: executions,
    };
  }

  @Get('executions/:executionId')
  @RequirePermission('projects:view')
  async getExecution(@Param('executionId') executionId: string) {
    try {
      const execution =
        await this.workflowEngineService.getExecutionById(executionId);

      return {
        success: true,
        data: execution,
      };
    } catch (error: unknown) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  @Post('executions/:executionId/cancel')
  @RequirePermission('projects:edit')
  async cancelExecution(@Param('executionId') executionId: string) {
    try {
      await this.workflowEngineService.cancelExecution(executionId);

      return {
        success: true,
        message: 'Execution cancelled successfully',
      };
    } catch (error: unknown) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  @Post('executions/:executionId/retry')
  @RequirePermission('projects:edit')
  @WorkflowThrottle({ limit: 5, ttl: 60 }) // 5 retries per minute
  async retryExecution(@Param('executionId') executionId: string) {
    try {
      const execution =
        await this.workflowEngineService.retryExecution(executionId);

      return {
        success: true,
        data: execution,
      };
    } catch (error: unknown) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  @Post(':id/test')
  @RequirePermission('projects:edit')
  async testWorkflow(
    @Param('id') id: string,
    @Body()
    body: {
      testData?: Record<string, unknown>;
    },
  ) {
    const workflow = await this.workflowRepo.findOne({
      where: { id },
    });

    if (!workflow) {
      return {
        success: false,
        error: 'Workflow not found',
      };
    }

    try {
      const result = await this.workflowDesignerService.simulateWorkflow(
        workflow.definition,
        body.testData || {},
      );

      return {
        success: true,
        data: result,
      };
    } catch (error: unknown) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  @Post(':id/validate')
  @RequirePermission('projects:edit')
  validateWorkflow(
    @Param('id') id: string,
    @Body()
    body: {
      definition: WorkflowDefinition;
    },
  ) {
    try {
      const validation = this.workflowDesignerService.validateWorkflow(
        body.definition,
      );

      return {
        success: true,
        data: validation,
      };
    } catch (error: unknown) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  @Get('categories')
  @RequirePermission('projects:view')
  async getCategories() {
    const categories = await this.workflowRepo
      .createQueryBuilder('workflow')
      .select('DISTINCT workflow.category', 'category')
      .where('workflow.category IS NOT NULL')
      .getRawMany();

    return {
      success: true,
      data: (categories as Array<{ category: string }>).map(
        (row) => row.category,
      ),
    };
  }
}
