import { Controller, Get, Res } from '@nestjs/common';
import { Response } from 'express';
import { MetricsService } from '../services/metrics.service';
import { Public } from '../../auth/decorators/public.decorator';

/**
 * Controller to expose Prometheus metrics.
 *
 * This is the SINGLE /metrics endpoint for the entire application.
 * Must be public (no auth) for Prometheus to scrape.
 *
 * Endpoints:
 * - GET /metrics - Prometheus text format (for scraping)
 * - GET /metrics/json - JSON format (for debugging)
 */
@Controller('metrics')
export class MetricsController {
  constructor(private readonly metricsService: MetricsService) { }

  /**
   * Returns metrics in Prometheus text format.
   * This is the endpoint that Prometheus scrapes.
   *
   * IMPORTANT: Must set proper Content-Type for Prometheus to parse correctly.
   */
  @Public()
  @Get()
  async getMetrics(@Res() res: Response): Promise<void> {
    res.set('Content-Type', this.metricsService.getMetricsContentType());
    res.send(await this.metricsService.getMetrics());
  }

  /**
   * Returns metrics in JSON format for debugging.
   * Useful for inspecting metric values during development.
   */
  @Public()
  @Get('json')
  async getMetricsJSON(): Promise<unknown> {
    return this.metricsService.getMetricsJSON();
  }
}
