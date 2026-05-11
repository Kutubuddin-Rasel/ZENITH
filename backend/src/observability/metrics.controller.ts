import { Controller, Get, Inject, Res } from '@nestjs/common';
import { Response } from 'express';
import { Public } from '../auth/decorators/public.decorator';
import { PROMETHEUS_REGISTRY_TOKEN } from '../common/constants/metrics.tokens';
import type { IPrometheusRegistry } from '../common/interfaces/metrics.interfaces';

/**
 * MetricsController
 *
 * SRP: Serves the SINGLE `/metrics` (Prometheus text) and `/metrics/json`
 * (debug) endpoints for the entire application. Marked `@Public()` so
 * Prometheus ServiceMonitor scrapes can succeed without JWT.
 *
 * DIP: Injects the `IPrometheusRegistry` token rather than a concrete
 * registry/service class. Step 3 SRP-decomposed the legacy metrics
 * facade so the registry surface is now an isolated provider.
 */
@Controller('metrics')
export class MetricsController {
  constructor(
    @Inject(PROMETHEUS_REGISTRY_TOKEN)
    private readonly registry: IPrometheusRegistry,
  ) {}

  @Public()
  @Get()
  async getMetrics(@Res() res: Response): Promise<void> {
    res.set('Content-Type', this.registry.getMetricsContentType());
    res.send(await this.registry.getMetrics());
  }

  @Public()
  @Get('json')
  async getMetricsJSON(): Promise<unknown> {
    return this.registry.getMetricsJSON();
  }
}
