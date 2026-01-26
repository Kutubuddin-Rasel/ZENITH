import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import { tap } from 'rxjs/operators';
import { Request, Response } from 'express';
import { performance } from 'perf_hooks';
import { MetricsService, HttpMetricLabels } from '../services/metrics.service';

/**
 * Request type with route property for extracting route templates.
 * Express adds route.path after route matching.
 * We use Omit to avoid conflict with Express's existing route property.
 */
type RequestWithRoute = Omit<Request, 'route'> & {
  route?: {
    path?: string;
  };
  path: string;
  url: string;
  method: string;
};

/**
 * Timing Interceptor (Phase 4 - Performance Module Remediation)
 *
 * PURPOSE:
 * Captures request timing with high-precision (performance.now()),
 * adds X-Response-Time header, and records metrics to Prometheus.
 *
 * OBSERVABILITY STRATEGY:
 * - Uses route template (/users/:id) NOT raw URL (/users/123)
 * - This prevents cardinality explosion in Prometheus
 * - Falls back to 'UNKNOWN_ROUTE' for 404s or unmatched routes
 *
 * TIMING PRECISION:
 * - Uses performance.now() (microsecond precision)
 * - Date.now() only has millisecond precision, insufficient for fast APIs
 *
 * METRICS RECORDED:
 * - http_requests_total (counter by method, route, status)
 * - http_request_duration_seconds (histogram by method, route)
 * - http_errors_total (counter for 4xx/5xx)
 *
 * HEADER ADDED:
 * - X-Response-Time: 12.34ms
 */
@Injectable()
export class TimingInterceptor implements NestInterceptor<unknown, unknown> {
  constructor(private readonly metricsService: MetricsService) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    // Only process HTTP requests
    if (context.getType() !== 'http') {
      return next.handle();
    }

    const httpContext = context.switchToHttp();
    const request = httpContext.getRequest<RequestWithRoute>();
    const response = httpContext.getResponse<Response>();

    // Capture start time with high precision
    const startTime = performance.now();

    // Extract method and route template BEFORE the handler executes
    const method = request.method;

    return next.handle().pipe(
      tap({
        // On successful response (or error that was handled)
        next: () => {
          this.recordTiming(request, response, method, startTime);
        },
        // On error that bubbles up
        error: () => {
          this.recordTiming(request, response, method, startTime);
        },
      }),
    );
  }

  /**
   * Record timing metrics and set response header.
   *
   * CARDINALITY DEFENSE:
   * Uses route template (e.g., /users/:id) instead of raw URL (/users/123).
   * This is critical to prevent Prometheus from creating infinite time series.
   *
   * If route is undefined (404, unmatched routes), falls back to 'UNKNOWN_ROUTE'.
   */
  private recordTiming(
    request: RequestWithRoute,
    response: Response,
    method: string,
    startTime: number,
  ): void {
    // Calculate duration in seconds (Prometheus standard)
    const durationMs = performance.now() - startTime;
    const durationSeconds = durationMs / 1000;

    // Format duration for header (human-readable milliseconds)
    const formattedDuration = `${durationMs.toFixed(2)}ms`;

    // Set X-Response-Time header
    // Note: Must check if headers are already sent (streaming responses)
    if (!response.headersSent) {
      response.setHeader('X-Response-Time', formattedDuration);
    }

    // CRITICAL: Use route template, NOT raw URL
    // This prevents cardinality explosion in Prometheus
    const routeTemplate = this.extractRouteTemplate(request);

    // Get status code (may be 0 if response hasn't been sent yet)
    const statusCode = response.statusCode.toString();

    // Create typed labels
    const labels: HttpMetricLabels = {
      method,
      route: routeTemplate,
      status: statusCode,
    };

    // Record metrics
    this.metricsService.recordHttpRequest(labels, durationSeconds);
  }

  /**
   * Extract the route template to prevent cardinality explosion.
   *
   * PROBLEM:
   * Raw URLs like /users/123, /users/456, /users/789 would create
   * infinite unique label values, crashing Prometheus.
   *
   * SOLUTION:
   * Use the route template: /users/:id
   * All those requests map to ONE metric series.
   *
   * FALLBACK HIERARCHY:
   * 1. Express route.path (e.g., /users/:id)
   * 2. NestJS handler path metadata (if available)
   * 3. Base path from URL (e.g., /health, /metrics - endpoints without params)
   * 4. 'UNKNOWN_ROUTE' (for 404s, static files, etc.)
   */
  private extractRouteTemplate(request: RequestWithRoute): string {
    // 1. Try Express route.path (populated after route matching)
    if (request.route?.path) {
      return request.route.path;
    }

    // 2. For routes without parameters, the base path is safe
    // Check if URL appears to have no dynamic segments
    const urlPath = request.path || request.url.split('?')[0];

    // Simple heuristic: if path has only lowercase letters, numbers, hyphens
    // and doesn't contain what looks like a UUID or numeric ID, use it
    const pathSegments = urlPath.split('/').filter(Boolean);
    const hasLikelyParameter = pathSegments.some((segment) => {
      // UUID pattern
      if (
        /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
          segment,
        )
      ) {
        return true;
      }
      // Numeric ID
      if (/^\d+$/.test(segment)) {
        return true;
      }
      // Long alphanumeric (likely ID)
      if (/^[a-zA-Z0-9]{20,}$/.test(segment)) {
        return true;
      }
      return false;
    });

    if (!hasLikelyParameter && urlPath.length < 100) {
      return urlPath;
    }

    // 3. Normalize path by replacing likely IDs with placeholders
    const normalizedPath = urlPath
      .split('/')
      .map((segment) => {
        // UUID
        if (
          /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
            segment,
          )
        ) {
          return ':id';
        }
        // Numeric ID
        if (/^\d+$/.test(segment)) {
          return ':id';
        }
        // Long alphanumeric
        if (/^[a-zA-Z0-9]{20,}$/.test(segment)) {
          return ':id';
        }
        return segment;
      })
      .join('/');

    return normalizedPath || 'UNKNOWN_ROUTE';
  }
}
