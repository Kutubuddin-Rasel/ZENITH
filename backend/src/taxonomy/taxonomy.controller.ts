// src/taxonomy/taxonomy.controller.ts
import {
  Controller,
  Post,
  Get,
  Patch,
  Delete,
  Param,
  Body,
  Query,
  UseGuards,
  Request,
} from '@nestjs/common';
import { TaxonomyService } from './taxonomy.service';
import { CreateLabelDto } from './dto/create-label.dto';
import { UpdateLabelDto } from './dto/update-label.dto';
import { AssignLabelDto } from './dto/assign-label.dto';
import { UnassignLabelDto } from './dto/unassign-label.dto';
import { AssignComponentDto } from './dto/assign-component.dto';
import { UnassignComponentDto } from './dto/unassign-component.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { PermissionsGuard } from '../core/auth/guards/permissions.guard';
import { RequirePermission } from '../auth/decorators/require-permission.decorator';
import { StatefulCsrfGuard } from '../security/csrf/csrf.guard';
import { UpdateComponentDto } from './dto/update-component.dto';
import { CreateComponentDto } from './dto/create-component.dto';
import { PaginationQueryDto, PaginatedResult } from './dto/pagination-query.dto';
import { JwtRequestUser } from '../auth/types/jwt-request-user.interface';
import { Label } from './entities/label.entity';
import { Component } from './entities/component.entity';

@Controller('projects/:projectId')
@UseGuards(JwtAuthGuard, StatefulCsrfGuard, PermissionsGuard)
export class TaxonomyController {
  constructor(private svc: TaxonomyService) { }

  // — Labels —

  @RequirePermission('labels:create')
  @Post('labels')
  async createLabel(
    @Param('projectId') projectId: string,
    @Body() dto: CreateLabelDto,
    @Request() req: { user: JwtRequestUser },
  ) {
    return this.svc.createLabel(projectId, req.user.userId, dto);
  }

  @RequirePermission('labels:view')
  @Get('labels')
  async listLabels(
    @Param('projectId') projectId: string,
    @Query() query: PaginationQueryDto,
    @Request() req: { user: JwtRequestUser },
  ): Promise<PaginatedResult<Label>> {
    return this.svc.listLabels(projectId, req.user.userId, query.page, query.limit, query.search);
  }

  @RequirePermission('labels:update')
  @Patch('labels/:labelId')
  async updateLabel(
    @Param('projectId') projectId: string,
    @Param('labelId') labelId: string,
    @Body() dto: UpdateLabelDto,
    @Request() req: { user: JwtRequestUser },
  ) {
    return this.svc.updateLabel(projectId, labelId, req.user.userId, dto);
  }

  @RequirePermission('labels:delete')
  @Delete('labels/:labelId')
  async removeLabel(
    @Param('projectId') projectId: string,
    @Param('labelId') labelId: string,
    @Request() req: { user: JwtRequestUser },
  ) {
    await this.svc.removeLabel(projectId, labelId, req.user.userId);
    return { message: 'Label deleted' };
  }

  @RequirePermission('labels:update')
  @Post('issues/:issueId/labels')
  async assignLabel(
    @Param('projectId') projectId: string,
    @Param('issueId') issueId: string,
    @Body() dto: AssignLabelDto,
    @Request() req: { user: JwtRequestUser },
  ) {
    return this.svc.assignLabel(projectId, issueId, req.user.userId, dto);
  }

  @RequirePermission('labels:update')
  @Delete('issues/:issueId/labels')
  async unassignLabel(
    @Param('projectId') projectId: string,
    @Param('issueId') issueId: string,
    @Body() dto: UnassignLabelDto,
    @Request() req: { user: JwtRequestUser },
  ) {
    await this.svc.unassignLabel(projectId, issueId, req.user.userId, dto);
    return { message: 'Label unassigned' };
  }

  // — Components —

  @RequirePermission('components:create')
  @Post('components')
  async createComponent(
    @Param('projectId') projectId: string,
    @Body() dto: CreateComponentDto,
    @Request() req: { user: JwtRequestUser },
  ) {
    return this.svc.createComponent(projectId, req.user.userId, dto);
  }

  @RequirePermission('components:view')
  @Get('components')
  async listComponents(
    @Param('projectId') projectId: string,
    @Query() query: PaginationQueryDto,
    @Request() req: { user: JwtRequestUser },
  ): Promise<PaginatedResult<Component>> {
    return this.svc.listComponents(projectId, req.user.userId, query.page, query.limit, query.search);
  }

  @RequirePermission('components:update')
  @Patch('components/:componentId')
  async updateComponent(
    @Param('projectId') projectId: string,
    @Param('componentId') componentId: string,
    @Body() dto: UpdateComponentDto,
    @Request() req: { user: JwtRequestUser },
  ) {
    return this.svc.updateComponent(
      projectId,
      componentId,
      req.user.userId,
      dto,
    );
  }

  @RequirePermission('components:delete')
  @Delete('components/:componentId')
  async removeComponent(
    @Param('projectId') projectId: string,
    @Param('componentId') componentId: string,
    @Request() req: { user: JwtRequestUser },
  ) {
    await this.svc.removeComponent(projectId, componentId, req.user.userId);
    return { message: 'Component deleted' };
  }

  @RequirePermission('components:update')
  @Post('issues/:issueId/components')
  async assignComponent(
    @Param('projectId') projectId: string,
    @Param('issueId') issueId: string,
    @Body() dto: AssignComponentDto,
    @Request() req: { user: JwtRequestUser },
  ) {
    return this.svc.assignComponent(projectId, issueId, req.user.userId, dto);
  }

  @RequirePermission('components:update')
  @Delete('issues/:issueId/components')
  async unassignComponent(
    @Param('projectId') projectId: string,
    @Param('issueId') issueId: string,
    @Body() dto: UnassignComponentDto,
    @Request() req: { user: JwtRequestUser },
  ) {
    await this.svc.unassignComponent(projectId, issueId, req.user.userId, dto);
    return { message: 'Component unassigned' };
  }
}
