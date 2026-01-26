// src/revisions/revisions.controller.ts
import {
  Controller,
  Get,
  Post,
  Param,
  UseGuards,
  Request,
} from '@nestjs/common';
import { RevisionsService } from './revisions.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { PermissionsGuard } from '../core/auth/guards/permissions.guard';
import { RequirePermission } from '../auth/decorators/require-permission.decorator';
import { EntityType } from './entities/revision.entity';

@Controller('revisions/:entityType/:entityId')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class RevisionsController {
  constructor(private revSvc: RevisionsService) {}

  // List all revisions for an entity
  @RequirePermission('revisions:view')
  @Get()
  async getRevisions(
    @Param('entityType') entityType: EntityType,
    @Param('entityId') entityId: string,
  ): Promise<unknown> {
    // Optionally: check membership or global admin rights here
    return this.revSvc.list(entityType, entityId);
  }

  // Rollback the entity to a specific revision
  @RequirePermission('revisions:update')
  @Post(':revisionId/rollback')
  async rollback(
    @Param('entityType') entityType: EntityType,
    @Param('entityId') entityId: string,
    @Param('revisionId') revisionId: string,
  ) {
    return this.revSvc.rollback(entityType, entityId, revisionId);
  }
}
