import { Module } from '@nestjs/common';
import { CommonObservabilityModule } from '../common/submodules/observability.module';
import { MetricsController } from './metrics.controller';

/**
 * ObservabilityModule — Top-level HTTP exposure for Prometheus.
 *
 * Owns the `/metrics` and `/metrics/json` route handlers, which inject
 * the `IPrometheusRegistry` token bound by `CommonObservabilityModule`.
 *
 * The infrastructure providers (recorders, registry, performance reader)
 * live in `common/submodules/observability.module.ts`; this module is
 * intentionally tiny — its single responsibility is HTTP exposure.
 */
@Module({
  imports: [CommonObservabilityModule],
  controllers: [MetricsController],
})
export class ObservabilityModule {}
