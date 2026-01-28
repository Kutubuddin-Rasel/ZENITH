import { Transform, TransformFnParams } from 'class-transformer';
import sanitizeHtml from 'sanitize-html';

/**
 * =============================================================================
 * SAFE TRANSFORM DECORATORS (Phase 2 - Lint Remediation)
 * =============================================================================
 *
 * These decorators replace raw @Transform() usage with type-safe alternatives.
 *
 * PROBLEM:
 * The class-transformer `@Transform` decorator types `value` as `any`:
 *   @Transform(({ value }) => value.trim())  // ESLint: no-unsafe-return
 *
 * SOLUTION:
 * These decorators explicitly type the input and return, eliminating unsafe returns.
 * They also provide semantic meaning, making code more readable.
 *
 * USAGE:
 *   Before: @Transform(({ value }) => typeof value === 'string' ? value.trim() : value)
 *   After:  @TrimString()
 */

// =============================================================================
// TYPE DEFINITIONS
// =============================================================================

/**
 * Type-safe transform function that accepts unknown and returns a specific type.
 * This eliminates the `any` type from the transform pipeline.
 */
type SafeTransformFn<T> = (params: {
  value: unknown;
  key: string;
  obj: unknown;
}) => T;

/**
 * Helper to create a type-safe transform decorator.
 * Wraps class-transformer's Transform but with explicit typing.
 */
function createSafeTransform<T>(fn: SafeTransformFn<T>): PropertyDecorator {
  return Transform((params: TransformFnParams) => {
    // Explicitly type the params we pass to the function
    return fn({
      value: params.value as unknown,
      key: params.key,
      obj: params.obj as unknown,
    });
  });
}

// =============================================================================
// STRING TRANSFORM DECORATORS
// =============================================================================

/**
 * Trims whitespace from string values.
 * Non-string values are passed through unchanged.
 *
 * @example
 * class CreateUserDto {
 *   @TrimString()
 *   @IsString()
 *   name: string;
 * }
 *
 * // Input: "  John Doe  " => Output: "John Doe"
 */
export function TrimString(): PropertyDecorator {
  return createSafeTransform<unknown>((params) => {
    const { value } = params;
    if (typeof value === 'string') {
      return value.trim();
    }
    return value;
  });
}

/**
 * Converts string values to lowercase.
 * Non-string values are passed through unchanged.
 *
 * @example
 * class SessionQueryDto {
 *   @ToLowerCase()
 *   @IsEnum(SessionStatus)
 *   status?: SessionStatus;
 * }
 *
 * // Input: "ACTIVE" => Output: "active"
 */
export function ToLowerCase(): PropertyDecorator {
  return createSafeTransform<unknown>((params) => {
    const { value } = params;
    if (typeof value === 'string') {
      return value.toLowerCase();
    }
    return value;
  });
}

/**
 * Converts string values to uppercase.
 * Non-string values are passed through unchanged.
 *
 * @example
 * class CreateRuleDto {
 *   @ToUpperCase()
 *   @IsCountryCode()
 *   country?: string;
 * }
 *
 * // Input: "us" => Output: "US"
 */
export function ToUpperCase(): PropertyDecorator {
  return createSafeTransform<unknown>((params) => {
    const { value } = params;
    if (typeof value === 'string') {
      return value.toUpperCase();
    }
    return value;
  });
}

/**
 * Trims and converts string values to uppercase.
 * Combines trim and uppercase in a single decorator.
 *
 * @example
 * class CreateRuleDto {
 *   @TrimAndUpperCase()
 *   @IsCountryCode()
 *   country?: string;
 * }
 *
 * // Input: "  us  " => Output: "US"
 */
export function TrimAndUpperCase(): PropertyDecorator {
  return createSafeTransform<unknown>((params) => {
    const { value } = params;
    if (typeof value === 'string') {
      return value.trim().toUpperCase();
    }
    return value;
  });
}

/**
 * Trims and converts string values to lowercase.
 * Combines trim and lowercase in a single decorator.
 *
 * @example
 * class SessionQueryDto {
 *   @TrimAndLowerCase()
 *   @IsEnum(SessionStatus)
 *   status?: SessionStatus;
 * }
 *
 * // Input: "  ACTIVE  " => Output: "active"
 */
export function TrimAndLowerCase(): PropertyDecorator {
  return createSafeTransform<unknown>((params) => {
    const { value } = params;
    if (typeof value === 'string') {
      return value.trim().toLowerCase();
    }
    return value;
  });
}

// =============================================================================
// ARRAY TRANSFORM DECORATORS
// =============================================================================

/**
 * Ensures value is always an array.
 * - Arrays are passed through unchanged
 * - Non-array values are wrapped in an array
 * - null/undefined become empty array
 *
 * @example
 * class CreateRuleDto {
 *   @ToArray()
 *   @IsString({ each: true })
 *   tags?: string[];
 * }
 *
 * // Input: "tag1" => Output: ["tag1"]
 * // Input: ["tag1", "tag2"] => Output: ["tag1", "tag2"]
 */
export function ToArray(): PropertyDecorator {
  return createSafeTransform<unknown[]>((params) => {
    const { value } = params;
    if (value === null || value === undefined) {
      return [];
    }
    if (Array.isArray(value)) {
      return value;
    }
    return [value];
  });
}

// =============================================================================
// VALIDATION HELPERS (for @ValidateIf issues)
// =============================================================================

/**
 * Type-safe interface for objects with an ipType property.
 * Used with @ValidateIf to avoid `any` type access.
 */
export interface HasIPType {
  ipType?: string;
}

/**
 * Type guard for objects with ipType property.
 */
export function hasIPType(obj: unknown): obj is HasIPType {
  return typeof obj === 'object' && obj !== null && 'ipType' in obj;
}

/**
 * Safely access ipType from an object.
 * Returns undefined if the property doesn't exist.
 *
 * @example
 * @ValidateIf((o) => getIPType(o) !== IPType.CIDR)
 */
export function getIPType(obj: unknown): string | undefined {
  if (hasIPType(obj)) {
    return obj.ipType;
  }
  return undefined;
}

// =============================================================================
// HTML SANITIZATION DECORATORS (Phase 5 - XSS Prevention)
// =============================================================================

/**
 * Configuration options for HTML sanitization.
 * Allows customization of allowed tags and attributes.
 */
export interface SanitizeHtmlOptions {
  /** HTML tags to allow (default: safe Markdown-compatible set) */
  allowedTags?: string[];
  /** Attributes to allow per tag (default: href on anchor only) */
  allowedAttributes?: Record<string, string[]>;
}

/**
 * Default sanitization policy for rich text fields.
 * Allows Markdown-compatible formatting while blocking XSS vectors.
 *
 * ALLOWED: b, i, em, strong, a, p, br, ul, ol, li, code, pre
 * BLOCKED: script, iframe, object, style, on* events
 */
const DEFAULT_SANITIZE_OPTIONS: sanitizeHtml.IOptions = {
  allowedTags: ['b', 'i', 'em', 'strong', 'a', 'p', 'br', 'ul', 'ol', 'li', 'code', 'pre'],
  allowedAttributes: {
    a: ['href'],
  },
  // Explicitly disallow common XSS vectors
  disallowedTagsMode: 'discard',
};

/**
 * Sanitizes HTML content to prevent XSS attacks.
 * Uses sanitize-html library with a strict allowlist policy.
 *
 * SECURITY: This decorator strips dangerous HTML tags (script, iframe, etc.)
 * and event handlers (onclick, onerror, etc.) from string inputs.
 *
 * @param options - Optional custom sanitization configuration
 *
 * @example
 * class CreateProjectDto {
 *   @SanitizeHtml()
 *   @IsString()
 *   @IsOptional()
 *   description?: string;
 * }
 *
 * // Input: "<script>alert('xss')</script><p>Hello</p>"
 * // Output: "<p>Hello</p>"
 */
export function SanitizeHtml(options?: SanitizeHtmlOptions): PropertyDecorator {
  const sanitizeOptions: sanitizeHtml.IOptions = {
    ...DEFAULT_SANITIZE_OPTIONS,
    ...(options?.allowedTags && { allowedTags: options.allowedTags }),
    ...(options?.allowedAttributes && { allowedAttributes: options.allowedAttributes }),
  };

  return createSafeTransform<unknown>((params) => {
    const { value } = params;

    // Handle null/undefined gracefully
    if (value === null || value === undefined) {
      return value;
    }

    // Only sanitize strings
    if (typeof value === 'string') {
      return sanitizeHtml(value, sanitizeOptions);
    }

    return value;
  });
}

