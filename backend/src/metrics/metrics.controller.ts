/**
 * Metrics Controller — `/metrics` Prometheus Scrape Endpoint
 *
 * SECURITY:
 * Marked @Public() because Prometheus ServiceMonitor cannot send JWT.
 * Protected at K8s network level (internal-only ServiceMonitor).
 *
 * The endpoint returns the prom-client default registry contents
 * as text/plain in Prometheus exposition format.
 *
 * ZERO `any` TOLERANCE.
 */

import { Controller, Get, Header } from '@nestjs/common';
import * as promClient from 'prom-client';
import { Public } from '../core/auth/decorators/public.decorator';

@Controller('metrics')
export class MetricsController {
  /**
   * Prometheus scrape endpoint.
   *
   * Returns all registered metrics in Prometheus exposition format.
   * Content-Type set to what Prometheus expects for scraping.
   */
  @Public()
  @Get()
  @Header('Content-Type', promClient.register.contentType)
  async getMetrics(): Promise<string> {
    return promClient.register.metrics();
  }
}
