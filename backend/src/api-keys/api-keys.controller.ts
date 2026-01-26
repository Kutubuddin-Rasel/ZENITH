import {
  Controller,
  Post,
  Get,
  Delete,
  Patch,
  Body,
  Param,
  UseGuards,
  Req,
  Query,
} from '@nestjs/common';
import { Request } from 'express';
import { ApiKeysService, ActorContext } from './api-keys.service';
import { CreateApiKeyDto } from './dto/create-api-key.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';

/**
 * API Keys Controller
 *
 * Manages the lifecycle of API keys with full audit trail support.
 * All mutation endpoints extract ActorContext (IP, User Agent) for PCI-DSS compliance.
 */
@Controller('api-keys')
@UseGuards(JwtAuthGuard)
export class ApiKeysController {
  constructor(private readonly apiKeysService: ApiKeysService) {}

  /**
   * Extract actor context from request for audit logging.
   * This ensures all mutations are traceable to WHO, FROM WHERE.
   */
  private getActorContext(req: Request): ActorContext {
    const user = req.user as { id: string } | undefined;

    return {
      userId: user?.id || 'unknown',
      ipAddress: this.getClientIp(req),
      userAgent: req.headers['user-agent'] || undefined,
      sessionId: req.headers['x-session-id'] as string | undefined,
    };
  }

  /**
   * Extract client IP from request.
   * Uses X-Forwarded-For if available (for proxied requests).
   */
  private getClientIp(req: Request): string {
    const forwardedFor = req.headers['x-forwarded-for'];
    if (forwardedFor) {
      // Take the first (client) IP from the chain
      const ips = Array.isArray(forwardedFor)
        ? forwardedFor[0]
        : forwardedFor.split(',')[0];
      return ips.trim();
    }
    return req.socket?.remoteAddress || req.ip || 'unknown';
  }

  /**
   * Create a new API key
   *
   * POST /api-keys
   */
  @Post()
  async create(@Req() req: Request, @Body() createApiKeyDto: CreateApiKeyDto) {
    const actor = this.getActorContext(req);
    const result = await this.apiKeysService.create(actor, createApiKeyDto);

    // Return the plain key (only shown once) and the API key entity
    return {
      key: result.key,
      apiKey: {
        id: result.apiKey.id,
        name: result.apiKey.name,
        keyPrefix: result.apiKey.keyPrefix,
        scopes: result.apiKey.scopes,
        projectId: result.apiKey.projectId,
        expiresAt: result.apiKey.expiresAt,
        createdAt: result.apiKey.createdAt,
      },
    };
  }

  /**
   * List all API keys for the current user
   *
   * GET /api-keys
   */
  @Get()
  findAll(@Req() req: Request) {
    const user = req.user as { id: string };
    return this.apiKeysService.findAll(user.id);
  }

  /**
   * Revoke (delete) an API key
   *
   * DELETE /api-keys/:id
   */
  @Delete(':id')
  async revoke(
    @Req() req: Request,
    @Param('id') id: string,
    @Query('reason') reason?: string,
  ) {
    const actor = this.getActorContext(req);
    await this.apiKeysService.revoke(actor, id, reason);
    return { message: 'API key revoked successfully' };
  }

  /**
   * Update API key metadata (name, scopes)
   *
   * PATCH /api-keys/:id
   */
  @Patch(':id')
  async update(
    @Req() req: Request,
    @Param('id') id: string,
    @Body() updates: { name?: string; scopes?: string[] },
  ) {
    const actor = this.getActorContext(req);
    return this.apiKeysService.update(actor, id, updates);
  }

  /**
   * Rotate an API key (zero-downtime migration)
   *
   * Creates a new key with identical settings, schedules old key for revocation.
   *
   * POST /api-keys/:id/rotate
   *
   * Query params:
   * - gracePeriodHours: Hours before old key expires (default: 24)
   */
  @Post(':id/rotate')
  async rotate(
    @Req() req: Request,
    @Param('id') id: string,
    @Query('gracePeriodHours') gracePeriodHoursStr?: string,
  ) {
    const actor = this.getActorContext(req);
    const gracePeriodHours = gracePeriodHoursStr
      ? parseInt(gracePeriodHoursStr, 10)
      : undefined;

    const result = await this.apiKeysService.rotateKey(
      actor,
      id,
      gracePeriodHours,
    );

    return {
      newKey: {
        key: result.newKey.key, // Only shown once!
        id: result.newKey.id,
        keyPrefix: result.newKey.keyPrefix,
        name: result.newKey.name,
      },
      oldKeyRevocation: {
        keyId: result.oldKeyRevocation.keyId,
        keyPrefix: result.oldKeyRevocation.keyPrefix,
        revokedAt: result.oldKeyRevocation.revokedAt,
        gracePeriodHours: result.oldKeyRevocation.gracePeriodHours,
      },
      message: result.message,
    };
  }
}
