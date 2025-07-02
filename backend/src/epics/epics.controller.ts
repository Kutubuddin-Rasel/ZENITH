// src/epics/epics.controller.ts
import {
  Controller,
  Post,
  Get,
  Patch,
  Delete,
  Param,
  Body,
  UseGuards,
  Request,
} from '@nestjs/common';
import { EpicsService } from './epics.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { PermissionsGuard } from '../auth/guards/permissions.guard';
import { RequirePermission } from '../auth/decorators/require-permission.decorator';
import { CreateEpicDto } from './dto/create-epic.dto';
import { UpdateEpicDto } from './dto/update-epic.dto';
import { CreateStoryDto } from './dto/create-story.dto';
import { UpdateStoryDto } from './dto/update-story.dto';
import { JwtRequestUser } from '../auth/types/jwt-request-user.interface';

@Controller('projects/:projectId/epics')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class EpicsController {
  constructor(private svc: EpicsService) {}

  // Epics
  @RequirePermission('epics:create')
  @Post()
  async createEpic(
    @Param('projectId') projectId: string,
    @Body() dto: CreateEpicDto,
    @Request() req: { user: JwtRequestUser },
  ) {
    return this.svc.createEpic(projectId, req.user.userId, dto);
  }

  @RequirePermission('epics:view')
  @Get()
  async listEpics(
    @Param('projectId') projectId: string,
    @Request() req: { user: JwtRequestUser },
  ) {
    return this.svc.listEpics(projectId, req.user.userId);
  }

  @RequirePermission('epics:view')
  @Get(':epicId')
  async getEpic(
    @Param('projectId') projectId: string,
    @Param('epicId') epicId: string,
    @Request() req: { user: JwtRequestUser },
  ) {
    return this.svc.getEpic(projectId, epicId, req.user.userId);
  }

  @RequirePermission('epics:update')
  @Patch(':epicId')
  async updateEpic(
    @Param('projectId') projectId: string,
    @Param('epicId') epicId: string,
    @Body() dto: UpdateEpicDto,
    @Request() req: { user: JwtRequestUser },
  ) {
    return this.svc.updateEpic(projectId, epicId, req.user.userId, dto);
  }

  @RequirePermission('epics:delete')
  @Delete(':epicId')
  async deleteEpic(
    @Param('projectId') projectId: string,
    @Param('epicId') epicId: string,
    @Request() req: { user: JwtRequestUser },
  ) {
    await this.svc.deleteEpic(projectId, epicId, req.user.userId);
    return { message: 'Epic deleted' };
  }

  // Stories
  @RequirePermission('stories:create')
  @Post(':epicId/stories')
  async createStory(
    @Param('projectId') projectId: string,
    @Param('epicId') epicId: string,
    @Body() dto: CreateStoryDto,
    @Request() req: { user: JwtRequestUser },
  ) {
    return this.svc.createStory(projectId, epicId, req.user.userId, dto);
  }

  @RequirePermission('stories:view')
  @Get(':epicId/stories')
  async listStories(
    @Param('projectId') projectId: string,
    @Param('epicId') epicId: string,
    @Request() req: { user: JwtRequestUser },
  ) {
    return this.svc.listStories(projectId, epicId, req.user.userId);
  }

  @RequirePermission('stories:view')
  @Get(':epicId/stories/:storyId')
  async getStory(
    @Param('projectId') projectId: string,
    @Param('epicId') epicId: string,
    @Param('storyId') storyId: string,
    @Request() req: { user: JwtRequestUser },
  ) {
    return this.svc.getStory(projectId, epicId, storyId, req.user.userId);
  }

  @RequirePermission('stories:update')
  @Patch(':epicId/stories/:storyId')
  async updateStory(
    @Param('projectId') projectId: string,
    @Param('epicId') epicId: string,
    @Param('storyId') storyId: string,
    @Body() dto: UpdateStoryDto,
    @Request() req: { user: JwtRequestUser },
  ) {
    return this.svc.updateStory(
      projectId,
      epicId,
      storyId,
      req.user.userId,
      dto,
    );
  }

  @RequirePermission('stories:delete')
  @Delete(':epicId/stories/:storyId')
  async deleteStory(
    @Param('projectId') projectId: string,
    @Param('epicId') epicId: string,
    @Param('storyId') storyId: string,
    @Request() req: { user: JwtRequestUser },
  ) {
    await this.svc.deleteStory(projectId, epicId, storyId, req.user.userId);
    return { message: 'Story deleted' };
  }
}
