// src/custom-fields/custom-fields.controller.ts
import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
  UseGuards,
  Put,
  Request,
  ParseUUIDPipe,
} from '@nestjs/common';
import { CustomFieldsService } from './custom-fields.service';
import { CreateCustomFieldDto } from './dto/create-custom-field.dto';
import { UpdateCustomFieldDto } from './dto/update-custom-field.dto';
import { UpdateIssueFieldValuesDto } from './dto/update-issue-field-values.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { PermissionsGuard } from '../core/auth/guards/permissions.guard';
import { RequirePermission } from '../auth/decorators/require-permission.decorator';
import { JwtRequestUser } from '../auth/types/jwt-request-user.interface';

/**
 * CustomFieldsController - Manages custom field schema definitions
 *
 * Security:
 * - ABAC layer with granular permissions (Phase 1)
 * - IDOR protection via service-level role validation (Phase 2)
 * - Tenant isolation via organizationId in all queries (Phase 3)
 */
@Controller()
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class CustomFieldsController {
  constructor(private readonly customFieldsService: CustomFieldsService) { }

  /**
   * Extract user context for tenant-scoped operations
   */
  private getUserContext(user: JwtRequestUser) {
    return {
      userId: user.userId,
      organizationId: user.organizationId ?? '',
    };
  }

  /**
   * Create a new custom field definition for a project
   */
  @RequirePermission('custom-fields:create')
  @Post('projects/:projectId/custom-fields')
  create(
    @Param('projectId') projectId: string,
    @Body() createCustomFieldDto: CreateCustomFieldDto,
    @Request() req: { user: JwtRequestUser },
  ) {
    createCustomFieldDto.projectId = projectId;
    return this.customFieldsService.createDefinition(
      this.getUserContext(req.user),
      createCustomFieldDto,
    );
  }

  /**
   * List all custom field definitions for a project
   */
  @RequirePermission('custom-fields:view')
  @Get('projects/:projectId/custom-fields')
  findAll(
    @Param('projectId') projectId: string,
    @Request() req: { user: JwtRequestUser },
  ) {
    return this.customFieldsService.findAllDefinitions(
      this.getUserContext(req.user),
      projectId,
    );
  }

  /**
   * Get a single custom field definition
   */
  @RequirePermission('custom-fields:view')
  @Get('custom-fields/:id')
  findOne(
    @Param('id') id: string,
    @Request() req: { user: JwtRequestUser },
  ) {
    return this.customFieldsService.findOneDefinition(
      this.getUserContext(req.user),
      id,
    );
  }

  /**
   * Update a custom field definition
   */
  @RequirePermission('custom-fields:update')
  @Patch('custom-fields/:id')
  update(
    @Param('id') id: string,
    @Body() updateCustomFieldDto: UpdateCustomFieldDto,
    @Request() req: { user: JwtRequestUser },
  ) {
    return this.customFieldsService.updateDefinition(
      this.getUserContext(req.user),
      id,
      updateCustomFieldDto,
    );
  }

  /**
   * Delete a custom field definition
   */
  @RequirePermission('custom-fields:delete')
  @Delete('custom-fields/:id')
  remove(
    @Param('id') id: string,
    @Request() req: { user: JwtRequestUser },
  ) {
    return this.customFieldsService.removeDefinition(
      this.getUserContext(req.user),
      id,
    );
  }

  /**
   * Get custom field values for an issue
   */
  @RequirePermission('custom-fields:view')
  @Get('projects/:projectId/issues/:issueId/custom-fields')
  getIssueValues(
    @Param('projectId') projectId: string,
    @Param('issueId') issueId: string,
    @Request() req: { user: JwtRequestUser },
  ) {
    return this.customFieldsService.getValuesForIssue(
      this.getUserContext(req.user),
      issueId,
      projectId,
    );
  }

  /**
   * Update custom field values for an issue
   * Phase 4: Strict DTO validation with nested validation
   */
  @RequirePermission('custom-fields:update')
  @Put('projects/:projectId/issues/:issueId/custom-fields')
  updateIssueValues(
    @Param('projectId', ParseUUIDPipe) projectId: string,
    @Param('issueId', ParseUUIDPipe) issueId: string,
    @Body() dto: UpdateIssueFieldValuesDto,
    @Request() req: { user: JwtRequestUser },
  ) {
    // Transform DTO updates to service format
    const values = dto.updates.map((update) => ({
      fieldId: update.fieldId,
      value: update.value,
    }));

    return this.customFieldsService.updateValuesForIssue(
      this.getUserContext(req.user),
      issueId,
      projectId,
      values,
    );
  }
}
