import {
  Controller,
  Post,
  Body,
  UseGuards,
  UsePipes,
  ValidationPipe,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { TelemetryService } from './telemetry.service';
import { ApiKeyGuard } from '../api-keys/guards/api-key.guard';
import { HeartbeatDto } from './dto/heartbeat.dto';

// =============================================================================
// TELEMETRY CONTROLLER
// =============================================================================

/**
 * High-frequency telemetry ingestion endpoint.
 *
 * SECURITY LAYERS:
 * 1. ApiKeyGuard — authenticates the calling client
 * 2. Global ThrottlerGuard — enforces 100 req/min global limit (Redis-backed)
 * 3. @Throttle() — tightens to 60 req/min for heartbeat specifically
 * 4. ValidationPipe — strips unknown fields, rejects malformed UUIDs
 * 5. HeartbeatDto — @IsUUID('4') on all 3 fields
 */
@Controller('telemetry')
@UseGuards(ApiKeyGuard)
export class TelemetryController {
  constructor(private readonly telemetryService: TelemetryService) {}

  @Post('beat')
  @HttpCode(HttpStatus.ACCEPTED)
  @Throttle({ default: { limit: 60, ttl: 60000 } })
  @UsePipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      forbidUnknownValues: true,
    }),
  )
  async handleHeartbeat(@Body() dto: HeartbeatDto): Promise<{ status: string }> {
    return this.telemetryService.ingestHeartbeat(dto);
  }
}
