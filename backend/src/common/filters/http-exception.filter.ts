import {
  ExceptionFilter,
  Catch,
  ArgumentsHost,
  HttpException,
  HttpStatus,
  Logger,
  PayloadTooLargeException,
} from '@nestjs/common';
import { Request, Response } from 'express';
import { ClsService } from 'nestjs-cls';

// =============================================================================
// API ERROR RESPONSE INTERFACE (Phase 4 - Common Module Remediation)
// Strict typing ensures consistent error format across all endpoints
// =============================================================================

/**
 * Standardized error response structure.
 *
 * SECURITY: This interface is constructed manually in the filter.
 * By NOT spreading exception objects, we prevent accidental leakage
 * of internal properties like `stack`, `cause`, or database errors.
 */
export interface ApiErrorResponse {
  /** HTTP status code */
  statusCode: number;

  /** Human-readable error type (e.g., "Bad Request", "Unauthorized") */
  error: string;

  /** Error message(s) - string for single, array for validation errors */
  message: string | string[];

  /** ISO timestamp of when error occurred */
  timestamp: string;

  /** Request path that triggered the error */
  path: string;

  /** HTTP method (GET, POST, etc.) */
  method: string;

  /** Correlation ID for distributed tracing */
  requestId?: string;
}

/**
 * Map of HTTP status codes to human-readable error names
 */
const HTTP_ERROR_NAMES: Record<number, string> = {
  400: 'Bad Request',
  401: 'Unauthorized',
  403: 'Forbidden',
  404: 'Not Found',
  405: 'Method Not Allowed',
  409: 'Conflict',
  413: 'Payload Too Large',
  422: 'Unprocessable Entity',
  429: 'Too Many Requests',
  500: 'Internal Server Error',
  502: 'Bad Gateway',
  503: 'Service Unavailable',
  504: 'Gateway Timeout',
};

@Catch()
export class HttpExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(HttpExceptionFilter.name);

  constructor(private readonly cls?: ClsService) {}

  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();

    // Determine HTTP status code
    const status =
      exception instanceof HttpException
        ? exception.getStatus()
        : HttpStatus.INTERNAL_SERVER_ERROR;

    // ==========================================================================
    // NORMALIZATION: exception.getResponse() returns string | object
    // We must normalize to consistent message format
    // ==========================================================================
    const normalizedMessage = this.normalizeMessage(exception, status);

    // ==========================================================================
    // SECURITY: Log 413 Payload Too Large for DoS monitoring
    // ==========================================================================
    if (
      (status as HttpStatus) === HttpStatus.PAYLOAD_TOO_LARGE ||
      exception instanceof PayloadTooLargeException
    ) {
      const clientIp = this.extractClientIp(request);
      const endpoint = `${request.method} ${request.originalUrl || request.url}`;
      const contentLength = request.headers['content-length'] || 'unknown';

      this.logger.warn(
        `[SECURITY] PayloadTooLarge rejected: ` +
          `IP=${clientIp}, Endpoint=${endpoint}, Content-Length=${contentLength}`,
      );
    }

    // Log 5xx errors with full details (but not to client)
    if (status >= 500) {
      this.logger.error(
        `Internal Error: ${request.method} ${request.url}`,
        exception instanceof Error ? exception.stack : String(exception),
      );
    }

    // ==========================================================================
    // CONSTRUCT RESPONSE (Phase 4 - Common Module Remediation)
    // Manually construct - NO SPREAD to prevent info leakage
    // ==========================================================================
    const errorResponse: ApiErrorResponse = {
      statusCode: status,
      error: HTTP_ERROR_NAMES[status] || 'Error',
      message: normalizedMessage,
      timestamp: new Date().toISOString(),
      path: request.url || request.originalUrl || '/',
      method: request.method,
      requestId: this.cls?.get('requestId'),
    };

    response.status(status).json(errorResponse);
  }

  /**
   * Normalizes exception response to consistent message format.
   *
   * Handles:
   * - HttpException with string message
   * - HttpException with object response (class-validator style)
   * - Generic errors (returns sanitized message in production)
   *
   * SECURITY: Never returns internal error details to client
   */
  private normalizeMessage(
    exception: unknown,
    status: number,
  ): string | string[] {
    // Handle HttpException
    if (exception instanceof HttpException) {
      const response = exception.getResponse();

      // Case 1: String response (e.g., throw new BadRequestException('Invalid'))
      if (typeof response === 'string') {
        return response;
      }

      // Case 2: Object response (e.g., class-validator or custom object)
      if (typeof response === 'object' && response !== null) {
        const responseObj = response as Record<string, unknown>;

        // Extract message field (handles both string and string[])
        if ('message' in responseObj) {
          const msg = responseObj.message;

          // Already an array (class-validator style)
          if (Array.isArray(msg)) {
            return msg.map((m) => String(m));
          }

          // Single string message
          if (typeof msg === 'string') {
            return msg;
          }
        }

        // Fallback: use exception message
        return exception.message;
      }

      return exception.message;
    }

    // ==========================================================================
    // SECURITY: Generic errors - sanitize in production
    // Never expose internal error messages to clients
    // ==========================================================================
    if (status >= 500) {
      return 'An internal error occurred. Please try again later.';
    }

    // For non-HTTP exceptions with 4xx status, use generic message
    return 'An error occurred';
  }

  /**
   * Extract client IP from request, handling proxies.
   * Checks X-Forwarded-For (trusted proxy) and falls back to socket address.
   */
  private extractClientIp(request: Request): string {
    const xForwardedFor = request.headers['x-forwarded-for'];
    if (xForwardedFor) {
      // X-Forwarded-For can be comma-separated list; first is client
      const ips = Array.isArray(xForwardedFor)
        ? xForwardedFor[0]
        : xForwardedFor.split(',')[0];
      return ips.trim();
    }

    return request.ip || request.socket?.remoteAddress || 'unknown';
  }
}
