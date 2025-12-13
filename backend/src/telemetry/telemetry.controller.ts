import { Controller, Post, Body, UseGuards } from '@nestjs/common';
import { TelemetryService } from './telemetry.service';
import { ApiKeyGuard } from '../api-keys/guards/api-key.guard';

@Controller('telemetry')
@UseGuards(ApiKeyGuard)
export class TelemetryController {
  constructor(private readonly telemetryService: TelemetryService) {}

  // TODO: Add API Key Guard
  @Post('beat')
  async handleHeartbeat(@Body() body: any) {
    return this.telemetryService.ingestHeartbeat(body);
  }
}
