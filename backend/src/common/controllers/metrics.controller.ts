import { Controller, Get } from '@nestjs/common';
import { MetricsService } from '../services/metrics.service';

/**
 * Controller to expose Prometheus metrics.
 *
 * Endpoints:
 * - GET /metrics - Prometheus format (for scraping)
 * - GET /metrics/json - JSON format (for debugging)
 */
@Controller('metrics')
export class MetricsController {
  constructor(private metricsService: MetricsService) {}

  /**
   * Returns metrics in Prometheus text format.
   * This is the endpoint that Prometheus scrapes.
   */
  @Get()
  async getMetrics(): Promise<string> {
    return this.metricsService.getMetrics();
  }

  /**
   * Returns metrics in JSON format for debugging.
   */
  @Get('json')
  async getMetricsJSON(): Promise<any> {
    return this.metricsService.getMetricsJSON();
  }
}
