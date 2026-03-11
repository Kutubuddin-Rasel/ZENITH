/**
 * HTTP Metrics Middleware — Global Request Telemetry
 *
 * ARCHITECTURE:
 * NestJS middleware that captures per-request telemetry:
 * 1. Starts a high-resolution timer on request entry
 * 2. Listens to `res.on('finish')` for response completion
 * 3. Extracts standardized route + status code
 * 4. Observes duration histogram + increments counter
 *
 * ROUTE STANDARDIZATION:
 * Uses `req.route?.path` to get the NestJS route template
 * (e.g., `/api/projects/:projectId`) instead of raw URL
 * (`/api/projects/abc-123`) which would cause cardinality explosion.
 *
 * PERFORMANCE:
 * - `process.hrtime()` for nanosecond-precision timing (no Date overhead)
 * - `res.on('finish')` is a native Node.js listener, zero middleware overhead
 * - Metric observation is O(1) — bucket binary search + counter increment
 *
 * ZERO `any` TOLERANCE.
 */

import { Injectable, NestMiddleware } from '@nestjs/common';
import { Request, Response, NextFunction } from 'express';
import { httpRequestsCounter, httpDurationHistogram } from './http-metrics.providers';

// ---------------------------------------------------------------------------
// Middleware
// ---------------------------------------------------------------------------

@Injectable()
export class HttpMetricsMiddleware implements NestMiddleware {
  use(req: Request, res: Response, next: NextFunction): void {
    // Start high-resolution timer
    const startHrTime = process.hrtime.bigint();

    // Listen for response completion — fires AFTER headers + body are flushed
    res.on('finish', () => {
      // Calculate duration in seconds (nanoseconds → seconds)
      const durationNs = process.hrtime.bigint() - startHrTime;
      const durationSec = Number(durationNs) / 1e9;

      // Extract standardized route template
      // req.route?.path = NestJS matched template (e.g., '/api/projects/:projectId')
      // Fallback to 'UNKNOWN' for 404s / unmatched routes
      const routeObj = (req as unknown as Record<string, unknown>).route as
        | { path: string }
        | undefined;
      const route = routeObj?.path ?? 'UNKNOWN';
      const method = req.method;
      const statusCode = String(res.statusCode);

      // Observe duration histogram
      httpDurationHistogram.observe(
        { method, route, status_code: statusCode },
        durationSec,
      );

      // Increment total request counter
      httpRequestsCounter.inc(
        { method, route, status_code: statusCode },
      );
    });

    next();
  }
}
