import { Controller, Get, Post, Body, UseGuards } from '@nestjs/common';
import { WorkflowDesignerService } from '../services/workflow-designer.service';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { PermissionsGuard } from '../../core/auth/guards/permissions.guard';
import { RequirePermission } from '../../auth/decorators/require-permission.decorator';
import { WorkflowDefinition } from '../entities/workflow.entity';

@Controller('api/workflow-designer')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class WorkflowDesignerController {
  constructor(private workflowDesignerService: WorkflowDesignerService) {}

  @Get('node-types')
  @RequirePermission('projects:view')
  getNodeTypes() {
    const nodeTypes = this.workflowDesignerService.getAvailableNodeTypes();

    return {
      success: true,
      data: nodeTypes,
    };
  }

  @Get('node-types/:nodeTypeId')
  @RequirePermission('projects:view')
  getNodeType(@Body('nodeTypeId') nodeTypeId: string) {
    const nodeType = this.workflowDesignerService.getNodeTypeById(nodeTypeId);

    if (!nodeType) {
      return {
        success: false,
        error: 'Node type not found',
      };
    }

    return {
      success: true,
      data: nodeType,
    };
  }

  @Post('validate')
  @RequirePermission('projects:edit')
  validateWorkflow(@Body() body: { definition: WorkflowDefinition }) {
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

  @Post('simulate')
  @RequirePermission('projects:edit')
  async simulateWorkflow(
    @Body()
    body: {
      definition: WorkflowDefinition;
      testData?: Record<string, unknown>;
    },
  ) {
    try {
      const result = await this.workflowDesignerService.simulateWorkflow(
        body.definition,
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

  @Post('generate-code')
  @RequirePermission('projects:edit')
  generateWorkflowCode(@Body() body: { definition: WorkflowDefinition }) {
    try {
      const code = this.workflowDesignerService.generateWorkflowCode(
        body.definition,
      );

      return {
        success: true,
        data: { code },
      };
    } catch (error: unknown) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }
}
