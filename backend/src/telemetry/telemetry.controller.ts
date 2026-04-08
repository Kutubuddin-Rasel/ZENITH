import {
  Controller,
  Post,
  Get,
  Body,
  Query,
  Req,
  UseGuards,
  UsePipes,
  ValidationPipe,
  HttpCode,
  HttpStatus,
  ForbiddenException,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { TelemetryService } from './telemetry.service';
import { TelemetryAnalyticsService } from './telemetry-analytics.service';
import { ApiKeyGuard } from '../api-keys/guards/api-key.guard';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { HeartbeatDto } from './dto/heartbeat.dto';
import {
  TelemetryAnalyticsQueryDto,
  TelemetryAnalyticsResponse,
} from './dto/telemetry-analytics.dto';

// =============================================================================
// REQUEST TYPES
// =============================================================================

/**
 * Shape of the request after ApiKeyGuard attaches user context.
 * ApiKeyGuard does: request.user = keyRecord.user
 * The User entity has organizationId?: string.
 */
interface ApiKeyAuthenticatedRequest {
  user: {
    id: string;
    organizationId?: string;
  };
}

/**
 * Shape of the request after JwtAuthGuard attaches user context.
 */
interface JwtAuthenticatedRequest {
  user: {
    id: string;
    organizationId?: string;
  };
}

// =============================================================================
// TELEMETRY CONTROLLER
// =============================================================================

/**
 * High-frequency telemetry ingestion and analytics endpoint.
 *
 * SECURITY LAYERS (heartbeat):
 * 1. ApiKeyGuard — authenticates the calling client
 * 2. Global ThrottlerGuard — enforces 100 req/min global limit (Redis-backed)
 * 3. @Throttle() — tightens to 60 req/min for heartbeat specifically
 * 4. ValidationPipe — strips unknown fields, rejects malformed UUIDs
 * 5. HeartbeatDto — @IsUUID('4') on all 3 fields
 *
 * SECURITY LAYERS (analytics):
 * 1. JwtAuthGuard — authenticates via JWT
 * 2. organizationId extracted from JWT user context
 */
@Controller('telemetry')
export class TelemetryController {
  constructor(
    private readonly telemetryService: TelemetryService,
    private readonly analyticsService: TelemetryAnalyticsService,
  ) {}

  // ===========================================================================
  // HEARTBEAT INGESTION (API Key protected)
  // ===========================================================================

  @Post('beat')
  @UseGuards(ApiKeyGuard)
  @HttpCode(HttpStatus.ACCEPTED)
  @Throttle({ default: { limit: 60, ttl: 60000 } })
  @UsePipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      forbidUnknownValues: true,
    }),
  )
  async handleHeartbeat(
    @Body() dto: HeartbeatDto,
    @Req() req: ApiKeyAuthenticatedRequest,
  ): Promise<{ status: string }> {
    const organizationId = req.user.organizationId;
    if (!organizationId) {
      throw new ForbiddenException(
        'API key user has no organization. Heartbeat requires tenant context.',
      );
    }

    return this.telemetryService.ingestHeartbeat(dto, organizationId);
  }

  // ===========================================================================
  // ANALYTICS ENDPOINT (JWT protected)
  // ===========================================================================

  @Get('analytics')
  @UseGuards(JwtAuthGuard)
  @UsePipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  )
  async getAnalytics(
    @Query() query: TelemetryAnalyticsQueryDto,
    @Req() req: JwtAuthenticatedRequest,
  ): Promise<TelemetryAnalyticsResponse> {
    const organizationId = req.user.organizationId;
    if (!organizationId) {
      throw new ForbiddenException(
        'User has no organization. Analytics requires tenant context.',
      );
    }

    return this.analyticsService.getAnalytics(organizationId, query);
  }
}
