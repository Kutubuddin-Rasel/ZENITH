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
  Inject,
  NotFoundException,
} from '@nestjs/common';
import { Request } from 'express';
import {
  API_KEY_COMMAND_TOKEN,
  API_KEY_QUERY_TOKEN,
} from './constants/api-keys.tokens';
import { CreateApiKeyDto } from './dto/create-api-key.dto';
import {
  ActorContext,
  IApiKeyCommand,
  IApiKeyQuery,
} from './interfaces/api-keys.interfaces';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';

/**
 * API Keys Controller
 *
 * Depends ONLY on the ISP tokens `API_KEY_COMMAND_TOKEN` and
 * `API_KEY_QUERY_TOKEN` — never on a concrete service class. The
 * concrete bindings live in `api-keys.module.ts` and can be swapped
 * (e.g., for a CQRS in-memory test harness) without touching the
 * controller.
 */
@Controller('api-keys')
@UseGuards(JwtAuthGuard)
export class ApiKeysController {
  constructor(
    @Inject(API_KEY_COMMAND_TOKEN)
    private readonly commands: IApiKeyCommand,
    @Inject(API_KEY_QUERY_TOKEN)
    private readonly queries: IApiKeyQuery,
  ) {}

  private getActorContext(req: Request): ActorContext {
    const user = req.user as
      | { id: string; organizationId?: string }
      | undefined;
    return {
      userId: user?.id || 'unknown',
      organizationId: user?.organizationId,
      ipAddress: this.getClientIp(req),
      userAgent: req.headers['user-agent'] || undefined,
      sessionId: req.headers['x-session-id'] as string | undefined,
    };
  }

  private getClientIp(req: Request): string {
    const forwardedFor = req.headers['x-forwarded-for'];
    if (forwardedFor) {
      const ips = Array.isArray(forwardedFor)
        ? forwardedFor[0]
        : forwardedFor.split(',')[0];
      return ips.trim();
    }
    return req.socket?.remoteAddress || req.ip || 'unknown';
  }

  @Post()
  async create(@Req() req: Request, @Body() createApiKeyDto: CreateApiKeyDto) {
    const actor = this.getActorContext(req);
    const result = await this.commands.create(actor, createApiKeyDto);

    return {
      key: result.plainKey,
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

  @Get()
  findAll(@Req() req: Request) {
    const user = req.user as { id: string };
    return this.queries.findAllForUser(user.id);
  }

  @Get(':id')
  async findOne(@Req() req: Request, @Param('id') id: string) {
    const user = req.user as { id: string };
    const summary = await this.queries.findOneForUser(id, user.id);
    if (!summary) {
      throw new NotFoundException('API key not found');
    }
    return summary;
  }

  @Delete(':id')
  async revoke(
    @Req() req: Request,
    @Param('id') id: string,
    @Query('reason') reason?: string,
  ) {
    const actor = this.getActorContext(req);
    await this.commands.revoke(actor, id, reason);
    return { message: 'API key revoked successfully' };
  }

  @Patch(':id')
  async update(
    @Req() req: Request,
    @Param('id') id: string,
    @Body() updates: { name?: string; scopes?: string[] },
  ) {
    const actor = this.getActorContext(req);
    return this.commands.update(actor, id, updates);
  }

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

    const result = await this.commands.rotate(actor, {
      id,
      gracePeriodHours,
    });
    const effectiveGrace = gracePeriodHours ?? 24;

    return {
      newKey: {
        key: result.plainKey,
        id: result.newKey.id,
        keyPrefix: result.newKey.keyPrefix,
        name: result.newKey.name,
      },
      oldKeyRevocation: {
        keyId: result.oldKeyRevocation.id,
        revokedAt: result.oldKeyRevocation.revokedAt,
        gracePeriodHours: effectiveGrace,
      },
      message: `Key rotated successfully. Old key will be revoked in ${effectiveGrace} hours.`,
    };
  }
}
