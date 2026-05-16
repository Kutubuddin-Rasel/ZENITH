import { Injectable, NestMiddleware, Logger } from '@nestjs/common';
import { Request, Response, NextFunction } from 'express';
import { ClsService } from 'nestjs-cls';
import { randomUUID } from 'crypto';

/**
 * CorrelationMiddleware - Request ID tracking for distributed tracing.
 *
 * SECURITY (Phase 3 - Common Module Remediation):
 * - Validates incoming x-request-id against strict regex
 * - Prevents: Log Injection, Buffer Overflow/DoS, Control Character Injection
 * - Invalid IDs are discarded and replaced with fresh UUIDs
 */
@Injectable()
export class CorrelationMiddleware implements NestMiddleware {
  private readonly logger = new Logger(CorrelationMiddleware.name);

  // ==========================================================================
  // SECURITY VALIDATION (Phase 3 - Common Module Remediation)
  // ==========================================================================
  // Regex: Only alphanumeric and hyphens, max 64 chars
  // - Allows: UUIDs (550e8400-e29b-41d4-a716-446655440000)
  // - Allows: Trace IDs from cloud providers (abc123-def456)
  // - Blocks: Newlines (\n, \r), control chars, HTML tags, special chars
  // - Prevents: Log Injection, DoS via huge strings
  private readonly VALID_REQUEST_ID_REGEX = /^[a-zA-Z0-9-]{1,64}$/;

  constructor(private readonly cls: ClsService) {}

  use(req: Request, res: Response, next: NextFunction) {
    // Extract incoming request ID (handle string[] edge case)
    const incomingId = this.extractRequestId(req);

    // Validate and sanitize
    const requestId = this.validateRequestId(incomingId);

    // Store in CLS for automatic propagation to all services
    this.cls.set('requestId', requestId);
    this.cls.set('method', req.method);
    this.cls.set('path', req.url);

    // Echo back for client debugging
    res.setHeader('X-Request-ID', requestId);

    next();
  }

  /**
   * Extracts request ID from header, handling string[] edge case.
   * Express can return headers as string | string[] | undefined.
   */
  private extractRequestId(req: Request): string | undefined {
    const header = req.headers['x-request-id'];

    if (!header) {
      return undefined;
    }

    // Handle array case - take first value
    if (Array.isArray(header)) {
      return header[0];
    }

    return header;
  }

  /**
   * Validates the request ID against security constraints.
   *
   * SECURITY: Uses "Discard and Replace" pattern.
   * - Invalid IDs are silently replaced with fresh UUIDs
   * - Request never fails (maintains interoperability)
   * - Security warning logged WITHOUT the payload (prevents log injection)
   *
   * @param incomingId - Raw ID from client
   * @returns Validated ID or fresh UUID
   */
  private validateRequestId(incomingId: string | undefined): string {
    // Missing ID -> Generate fresh
    if (!incomingId) {
      return randomUUID();
    }

    // Test against regex (alphanumeric + hyphens, max 64 chars)
    if (this.VALID_REQUEST_ID_REGEX.test(incomingId)) {
      return incomingId;
    }

    // =======================================================================
    // SECURITY WARNING - Invalid ID received
    // DO NOT log the actual payload - it may contain injection attempts
    // =======================================================================
    this.logger.warn(
      `Invalid X-Request-ID format received. ` +
        `Length: ${incomingId.length}, ` +
        `Contains special chars: ${this.hasSpecialChars(incomingId)}. ` +
        `Generated replacement UUID.`,
    );

    return randomUUID();
  }

  /**
   * Safely checks for special characters without logging the payload.
   *
   * Uses the Unicode `Cc` property to cover ALL C0/C1 control codes
   * (including \n, \r, NUL, DEL) without embedding raw control bytes in
   * the source — satisfies ESLint `no-control-regex` and is stronger
   * than the previous `\x00-\x1f` literal range.
   */
  private hasSpecialChars(value: string): boolean {
    return /[<>{}|\\^`]|\p{Cc}/u.test(value);
  }
}
