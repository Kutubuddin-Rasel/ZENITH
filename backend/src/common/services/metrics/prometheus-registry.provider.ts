import { Injectable, OnModuleInit } from '@nestjs/common';
import { Registry, register, collectDefaultMetrics } from 'prom-client';
import type { IPrometheusRegistry } from '../../interfaces/metrics.interfaces';

/**
 * PrometheusRegistryProvider
 *
 * SRP: Owns the global prom-client registry, runs `collectDefaultMetrics`
 * once at module init, and exposes the text/JSON serialization surface.
 * All recorder providers (HTTP, cache, DB pool, integration, breaker)
 * register their metrics on the same global registry — this provider does
 * NOT own those instruments.
 *
 * Implements `IPrometheusRegistry` for `MetricsController`.
 */
@Injectable()
export class PrometheusRegistryProvider
  implements IPrometheusRegistry, OnModuleInit
{
  private readonly registry: Registry = register;
  private defaultsCollected = false;

  onModuleInit(): void {
    if (this.defaultsCollected) return;
    collectDefaultMetrics({ register: this.registry, prefix: '' });
    this.defaultsCollected = true;
  }

  getMetrics(): Promise<string> {
    return this.registry.metrics();
  }

  async getMetricsJSON(): Promise<object[]> {
    return this.registry.getMetricsAsJSON();
  }

  getMetricsContentType(): string {
    return this.registry.contentType;
  }
}
