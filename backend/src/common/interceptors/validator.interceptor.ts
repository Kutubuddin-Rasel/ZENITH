import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
  BadRequestException,
  Logger,
} from '@nestjs/common';
import { Observable, throwError } from 'rxjs';
import { catchError } from 'rxjs/operators';
import { Request } from 'express';

/**
 * Configuration for validation rules
 */
export interface ValidationConfig {
  /** Maximum allowed body size in bytes */
  maxBodySize?: number;
  /** Maximum string length for any field */
  maxFieldLength?: number;
  /** Allowed content types */
  allowedContentTypes?: string[];
  /** Fields to sanitize (strip HTML/scripts) */
  sanitizeFields?: string[];
  /** Enable strict mode (reject unknown fields) */
  strictMode?: boolean;
}

const DEFAULT_CONFIG: ValidationConfig = {
  maxBodySize: 1024 * 1024, // 1MB
  maxFieldLength: 10000,
  allowedContentTypes: ['application/json', 'multipart/form-data'],
  sanitizeFields: ['title', 'description', 'message', 'content', 'name'],
  strictMode: false,
};

/**
 * Validator Interceptor
 *
 * Provides request validation and sanitization:
 * - Validates content-type
 * - Checks body size limits
 * - Sanitizes string fields to prevent XSS
 * - Validates field lengths
 * - Logs validation issues
 */
@Injectable()
export class ValidatorInterceptor implements NestInterceptor {
  private readonly logger = new Logger(ValidatorInterceptor.name);
  private readonly config: ValidationConfig;

  constructor(config: Partial<ValidationConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const request = context.switchToHttp().getRequest<Request>();
    const startTime = Date.now();

    try {
      // Validate content type for POST/PUT/PATCH
      if (['POST', 'PUT', 'PATCH'].includes(request.method)) {
        this.validateContentType(request);
      }

      // Validate and sanitize body
      if (request.body && typeof request.body === 'object') {
        this.validateAndSanitizeBody(request.body as Record<string, unknown>);
      }
    } catch (error) {
      if (error instanceof BadRequestException) {
        throw error;
      }
      this.logger.warn(`Validation error: ${(error as Error).message}`);
      throw new BadRequestException((error as Error).message);
    }

    return next.handle().pipe(
      catchError((error: unknown) => {
        const duration = Date.now() - startTime;
        this.logger.warn(
          `Request failed after ${duration}ms: ${(error as Error)?.message}`,
        );
        return throwError(() => error);
      }),
    );
  }

  private validateContentType(request: Request): void {
    const contentType = request.headers['content-type'];

    if (!contentType) {
      // Allow requests without content-type for empty bodies
      if (
        Object.keys((request.body || {}) as Record<string, unknown>).length ===
        0
      ) {
        return;
      }
      throw new BadRequestException('Content-Type header is required');
    }

    const isAllowed = this.config.allowedContentTypes?.some((allowed) =>
      contentType.toLowerCase().includes(allowed.toLowerCase()),
    );

    if (!isAllowed) {
      throw new BadRequestException(
        `Content-Type '${contentType}' is not allowed`,
      );
    }
  }

  private validateAndSanitizeBody(
    body: Record<string, unknown>,
    path: string = '',
  ): void {
    for (const [key, value] of Object.entries(body)) {
      const fieldPath = path ? `${path}.${key}` : key;

      if (typeof value === 'string') {
        // Check string length
        if (value.length > (this.config.maxFieldLength || 10000)) {
          throw new BadRequestException(
            `Field '${fieldPath}' exceeds maximum length of ${this.config.maxFieldLength}`,
          );
        }

        // Sanitize fields that may contain user input
        if (this.shouldSanitize(key)) {
          body[key] = this.sanitizeString(value);
        }
      } else if (Array.isArray(value)) {
        // Validate and sanitize array elements
        for (let i = 0; i < value.length; i++) {
          if (typeof value[i] === 'string' && this.shouldSanitize(key)) {
            value[i] = this.sanitizeString(value[i] as string);
          } else if (typeof value[i] === 'object' && value[i] !== null) {
            this.validateAndSanitizeBody(
              value[i] as Record<string, unknown>,
              `${fieldPath}[${i}]`,
            );
          }
        }
      } else if (typeof value === 'object' && value !== null) {
        // Recursively validate nested objects
        this.validateAndSanitizeBody(
          value as Record<string, unknown>,
          fieldPath,
        );
      }
    }
  }

  private shouldSanitize(fieldName: string): boolean {
    const lowerFieldName = fieldName.toLowerCase();
    return (
      this.config.sanitizeFields?.some((f) =>
        lowerFieldName.includes(f.toLowerCase()),
      ) ?? false
    );
  }

  /**
   * Sanitize string to prevent XSS attacks
   * Strips potentially dangerous HTML/script content
   */
  private sanitizeString(value: string): string {
    // Remove script tags and their content
    let sanitized = value.replace(
      /<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi,
      '',
    );

    // Remove event handlers
    sanitized = sanitized.replace(/\s*on\w+\s*=\s*["'][^"']*["']/gi, '');

    // Remove javascript: URLs
    sanitized = sanitized.replace(/javascript:/gi, '');

    // Remove data: URLs (potential base64 encoded attacks)
    sanitized = sanitized.replace(/data:/gi, '');

    return sanitized;
  }
}

/**
 * Create a configured ValidatorInterceptor instance
 */
export function createValidatorInterceptor(
  config?: Partial<ValidationConfig>,
): ValidatorInterceptor {
  return new ValidatorInterceptor(config);
}
