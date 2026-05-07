// src/revisions/revisions.controller.ts
import {
  Controller,
  ForbiddenException,
  Get,
  Post,
  Param,
  Query,
  UseGuards,
  Request,
  ParseIntPipe,
  DefaultValuePipe,
} from '@nestjs/common';
import { RevisionsService } from './revisions.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { PermissionsGuard } from '../core/auth/guards/permissions.guard';
import { RequirePermission } from '../auth/decorators/require-permission.decorator';
import { StatefulCsrfGuard, RequireCsrf } from '../security/csrf/csrf.guard';
import { JwtAuthenticatedRequest } from '../auth/interface/jwt-authenticated-request.interface';
import { EntityType, Revision } from './entities/revision.entity';
import { ObjectLiteral } from 'typeorm';
import { RevisionDiff } from './services/diff.service';
import { ComparisonResponseDto } from './dto/comparison.dto';

/**
 * RevisionsController
 *
 * SECURITY:
 * - JWT-authenticated, permission-gated.
 * - Mutations (rollback) require CSRF via StatefulCsrfGuard + @RequireCsrf().
 * - Every read/write is tenant-isolated: orgId is pulled from req.user
 *   and verified against the entity's owning organization in the service layer.
 */
@Controller('revisions/:entityType/:entityId')
@UseGuards(JwtAuthGuard, StatefulCsrfGuard, PermissionsGuard)
export class RevisionsController {
  constructor(private revSvc: RevisionsService) {}

  private requireOrgId(req: JwtAuthenticatedRequest): string {
    const orgId = req.user.organizationId;
    if (!orgId) {
      throw new ForbiddenException('No organization context on token');
    }
    return orgId;
  }

  // List all revisions for an entity
  @RequirePermission('revisions:view')
  @Get()
  async getRevisions(
    @Param('entityType') entityType: EntityType,
    @Param('entityId') entityId: string,
    @Request() req: JwtAuthenticatedRequest,
  ): Promise<Revision[]> {
    return this.revSvc.list(entityType, entityId, this.requireOrgId(req));
  }

  // Activity history with human-readable diffs
  @RequirePermission('revisions:view')
  @Get('history')
  async getHistory(
    @Param('entityType') entityType: EntityType,
    @Param('entityId') entityId: string,
    @Query('limit', new DefaultValuePipe(20), ParseIntPipe) limit: number,
    @Request() req: JwtAuthenticatedRequest,
  ): Promise<RevisionDiff[]> {
    return this.revSvc.getHistory(
      entityType,
      entityId,
      this.requireOrgId(req),
      limit,
    );
  }

  // Compare two revisions of the same entity (older → newer)
  @RequirePermission('revisions:view')
  @Get('compare/:revisionA/:revisionB')
  async compare(
    @Param('entityType') entityType: EntityType,
    @Param('entityId') entityId: string,
    @Param('revisionA') revisionA: string,
    @Param('revisionB') revisionB: string,
    @Request() req: JwtAuthenticatedRequest,
  ): Promise<ComparisonResponseDto> {
    return this.revSvc.compareRevisions(
      entityType,
      entityId,
      revisionA,
      revisionB,
      this.requireOrgId(req),
    );
  }

  // Fetch a single revision
  @RequirePermission('revisions:view')
  @Get(':revisionId')
  async getRevision(
    @Param('entityType') entityType: EntityType,
    @Param('entityId') entityId: string,
    @Param('revisionId') revisionId: string,
    @Request() req: JwtAuthenticatedRequest,
  ): Promise<Revision> {
    return this.revSvc.getRevision(
      entityType,
      entityId,
      revisionId,
      this.requireOrgId(req),
    );
  }

  // Rollback the entity to a specific revision (destructive — CSRF protected)
  @RequireCsrf()
  @RequirePermission('revisions:update')
  @Post(':revisionId/rollback')
  async rollback(
    @Param('entityType') entityType: EntityType,
    @Param('entityId') entityId: string,
    @Param('revisionId') revisionId: string,
    @Request() req: JwtAuthenticatedRequest,
  ): Promise<ObjectLiteral> {
    return this.revSvc.rollback(
      entityType,
      entityId,
      revisionId,
      this.requireOrgId(req),
    );
  }
}
