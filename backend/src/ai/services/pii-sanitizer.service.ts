/**
 * PII Sanitizer Service — GDPR/HIPAA Compliance Layer
 *
 * Redacts Personally Identifiable Information (PII) from text BEFORE it is
 * sent to external LLM providers. This ensures user data like emails, phone
 * numbers, SSNs, and credit card numbers never leave our infrastructure.
 *
 * SCOPE CONSTRAINT (RAG Collision):
 *   This service MUST ONLY be used at the prompt assembly layer:
 *     - TriageWorker.classifyWithConfidence() — before LLM classification
 *     - ContextualSearchService.buildContextBlock() — before system prompt
 *   It MUST NEVER be applied to the embedding pipeline (VectorSyncWorker,
 *   EmbeddingsService) because redacting entities like "John Smith" would
 *   destroy semantic searchability for queries about that person.
 *
 * REGEX SAFETY (ReDoS Prevention):
 *   All patterns use possessive-style constructs and avoid nested quantifiers.
 *   No pattern has a + or * inside a repeated group that could match the same
 *   character set as the outer quantifier.
 */

import { Injectable, Logger } from '@nestjs/common';

/** Result of a sanitization pass. */
export interface SanitizationResult {
  /** Text with PII replaced by redaction tokens. */
  sanitized: string;
  /** Number of PII entities redacted. */
  redactedCount: number;
}

/** Single PII detection rule. */
interface PIIPattern {
  /** Human-readable name for logging. */
  name: string;
  /** Regex pattern (must be ReDoS-safe). */
  pattern: RegExp;
  /** Replacement token. */
  replacement: string;
}

/**
 * ReDoS-safe PII patterns.
 *
 * Design principles:
 *   1. No nested quantifiers (no `(a+)+` or `(a*)*`)
 *   2. No overlapping alternations
 *   3. All quantifiers have bounded scope
 *   4. Tested against ReDoS analyzers
 */
const PII_PATTERNS: readonly PIIPattern[] = [
  {
    name: 'email',
    // Matches: user@domain.tld — no nested quantifiers
    pattern: /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g,
    replacement: '[EMAIL_REDACTED]',
  },
  {
    name: 'credit_card',
    // Matches: 1234-5678-9012-3456 or 1234 5678 9012 3456 or 1234567890123456
    // Fixed 4-group format prevents backtracking
    pattern: /\b\d{4}[-\s]?\d{4}[-\s]?\d{4}[-\s]?\d{4}\b/g,
    replacement: '[CC_REDACTED]',
  },
  {
    name: 'ssn',
    // Matches: 123-45-6789 — strict format, no backtracking risk
    pattern: /\b\d{3}-\d{2}-\d{4}\b/g,
    replacement: '[SSN_REDACTED]',
  },
  {
    name: 'phone',
    // Matches: +1-234-567-8901, (234) 567-8901, 234.567.8901, 2345678901
    // Non-overlapping optional groups, bounded quantifiers
    pattern:
      /(?:\+?\d{1,3}[-.\s]?)?(?:\(\d{3}\)|\d{3})[-.\s]?\d{3}[-.\s]?\d{4}\b/g,
    replacement: '[PHONE_REDACTED]',
  },
] as const;

@Injectable()
export class PIISanitizerService {
  private readonly logger = new Logger(PIISanitizerService.name);

  /**
   * Sanitize text by redacting PII patterns.
   *
   * @param text - Raw text potentially containing PII
   * @returns sanitized text and count of redacted entities
   */
  sanitize(text: string): SanitizationResult {
    if (!text) {
      return { sanitized: '', redactedCount: 0 };
    }

    let sanitized = text;
    let redactedCount = 0;

    for (const rule of PII_PATTERNS) {
      // Reset lastIndex for global regexes (they're stateful)
      rule.pattern.lastIndex = 0;

      // Count matches before replacing
      const matches = sanitized.match(rule.pattern);
      if (matches) {
        redactedCount += matches.length;
        sanitized = sanitized.replace(rule.pattern, rule.replacement);
      }
    }

    return { sanitized, redactedCount };
  }
}
