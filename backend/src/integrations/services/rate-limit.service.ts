import { Injectable, Logger } from '@nestjs/common';

interface RetryOptions {
  maxRetries?: number;
  initialDelayMs?: number;
  maxDelayMs?: number;
  retryableStatusCodes?: number[];
}

interface AxiosOrNetworkError {
  status?: number;
  statusCode?: number;
  code?: string;
  response?: {
    status?: number;
    statusCode?: number;
    headers?: Record<string, string>;
  };
  headers?: Record<string, string>;
  message?: string;
}

/**
 * Service for handling rate limits and implementing retry logic with exponential backoff.
 *
 * Provides utilities to handle API rate limits gracefully and retry failed requests.
 */
@Injectable()
export class RateLimitService {
  private readonly logger = new Logger(RateLimitService.name);

  /**
   * Executes a function with automatic retry on rate limit errors.
   *
   * Implements exponential backoff:
   * - Retry 1: 1 second
   * - Retry 2: 2 seconds
   * - Retry 3: 4 seconds
   *
   * @param fn - Function to execute
   * @param options - Retry configuration
   * @returns Result of the function
   *
   * @example
   * const data = await rateLimitService.executeWithRetry(async () => {
   *   return await fetch('https://api.github.com/repos/...');
   * });
   */
  async executeWithRetry<T>(
    fn: () => Promise<T>,
    options: RetryOptions = {},
  ): Promise<T> {
    const {
      maxRetries = 3,
      initialDelayMs = 1000,
      maxDelayMs = 30000,
      retryableStatusCodes = [429, 500, 502, 503, 504],
    } = options;

    let lastError: Error | null = null;

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        return await fn();
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));

        // Check if error is retryable
        const isRetryable = this.isRetryableError(error, retryableStatusCodes);

        // If this was the last attempt or error is not retryable, throw
        if (attempt === maxRetries || !isRetryable) {
          throw lastError;
        }

        // Calculate delay with exponential backoff
        const delay = Math.min(
          initialDelayMs * Math.pow(2, attempt),
          maxDelayMs,
        );

        // Check if we have a Retry-After header
        const retryAfter = this.getRetryAfterDelay(error);
        const actualDelay = retryAfter || delay;

        this.logger.warn(
          `Request failed (attempt ${attempt + 1}/${maxRetries + 1}), retrying in ${actualDelay}ms...`,
          lastError.message,
        );

        // Wait before retry
        await this.delay(actualDelay);
      }
    }

    // This should never be reached, but TypeScript requires it
    throw lastError || new Error('Unknown error in retry logic');
  }

  /**
   * Checks if an error is retryable based on status code.
   */
  private isRetryableError(
    error: unknown,
    retryableStatusCodes: number[],
  ): boolean {
    if (error && typeof error === 'object') {
      const err = error as AxiosOrNetworkError;

      // Check various status code locations
      const statusCode =
        err.status ||
        err.statusCode ||
        err.response?.status ||
        err.response?.statusCode;

      if (statusCode && retryableStatusCodes.includes(statusCode)) {
        return true;
      }

      // Check for ECONNRESET, ETIMEDOUT, etc.
      if (err.code === 'ECONNRESET' || err.code === 'ETIMEDOUT') {
        return true;
      }
    }

    return false;
  }

  /**
   * Extracts Retry-After header value from error.
   *
   * GitHub, Slack, and others send this header when rate limited.
   * Can be either seconds (number) or HTTP date.
   */
  private getRetryAfterDelay(error: unknown): number | null {
    if (error && typeof error === 'object') {
      const err = error as AxiosOrNetworkError;
      const retryAfter =
        err.response?.headers?.['retry-after'] || err.headers?.['retry-after'];

      if (retryAfter) {
        // If it's a number (seconds)
        const seconds = parseInt(retryAfter, 10);
        if (!isNaN(seconds)) {
          return seconds * 1000; // Convert to milliseconds
        }

        // If it's an HTTP date
        try {
          const date = new Date(retryAfter);
          const now = new Date();
          const delay = date.getTime() - now.getTime();
          if (delay > 0) {
            return delay;
          }
        } catch {
          // If parsing fails, ignore
        }
      }
    }

    return null;
  }

  /**
   * Delays execution for the specified number of milliseconds.
   */
  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  /**
   * Parses rate limit information from response headers.
   *
   * Common header patterns:
   * - GitHub: X-RateLimit-Remaining, X-RateLimit-Reset
   * - Slack: Retry-After
   * - Generic: RateLimit-Remaining, RateLimit-Reset
   */
  parseRateLimitHeaders(headers: Record<string, string>): {
    remaining: number | null;
    limit: number | null;
    resetAt: Date | null;
  } {
    // Try GitHub format
    const ghRemaining = headers['x-ratelimit-remaining'];
    const ghLimit = headers['x-ratelimit-limit'];
    const ghReset = headers['x-ratelimit-reset'];

    if (ghRemaining !== undefined) {
      return {
        remaining: parseInt(ghRemaining, 10),
        limit: ghLimit ? parseInt(ghLimit, 10) : null,
        resetAt: ghReset ? new Date(parseInt(ghReset, 10) * 1000) : null,
      };
    }

    // Try generic format
    const remaining = headers['ratelimit-remaining'];
    const limit = headers['ratelimit-limit'];
    const reset = headers['ratelimit-reset'];

    if (remaining !== undefined) {
      return {
        remaining: parseInt(remaining, 10),
        limit: limit ? parseInt(limit, 10) : null,
        resetAt: reset ? new Date(parseInt(reset, 10) * 1000) : null,
      };
    }

    return {
      remaining: null,
      limit: null,
      resetAt: null,
    };
  }

  /**
   * Checks if we're approaching rate limit and should slow down.
   *
   * @param headers - Response headers
   * @param threshold - Percentage threshold (0-1), default 0.1 (10% remaining)
   * @returns true if we should slow down
   */
  shouldSlowDown(
    headers: Record<string, string>,
    threshold: number = 0.1,
  ): boolean {
    const { remaining, limit } = this.parseRateLimitHeaders(headers);

    if (remaining !== null && limit !== null && limit > 0) {
      const percentRemaining = remaining / limit;
      return percentRemaining < threshold;
    }

    return false;
  }

  /**
   * Waits if we're approaching rate limit.
   *
   * This is a proactive approach to avoid hitting rate limits.
   */
  async waitIfApproachingLimit(
    headers: Record<string, string>,
    threshold: number = 0.1,
    delayMs: number = 1000,
  ): Promise<void> {
    if (this.shouldSlowDown(headers, threshold)) {
      const { remaining, limit, resetAt } = this.parseRateLimitHeaders(headers);

      this.logger.warn(
        `Approaching rate limit (${remaining}/${limit} remaining), waiting ${delayMs}ms...`,
      );

      if (resetAt) {
        const timeUntilReset = resetAt.getTime() - Date.now();
        this.logger.log(
          `Rate limit resets in ${Math.ceil(timeUntilReset / 1000)}s`,
        );
      }

      await this.delay(delayMs);
    }
  }
}
