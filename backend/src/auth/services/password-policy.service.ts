/**
 * Password Policy Service — NIST 800-63B + zxcvbn Entropy Analysis
 *
 * ARCHITECTURE:
 * This service is Layer 1 of the 3-layer password validation pipeline:
 *
 *   1. PasswordPolicyService  → Local entropy analysis  (~5ms)
 *   2. PasswordBreachService  → HIBP API breach check   (~50ms)
 *   3. PasswordService         → Argon2id hashing        (~200ms)
 *
 * Ordered by cost: cheapest first. If Layer 1 rejects, we never hit the
 * network (Layer 2) or the CPU-intensive hash (Layer 3).
 *
 * NIST 800-63B COMPLIANCE:
 * - Minimum 12 characters (entropy-based security)
 * - Maximum 128 characters (DoS prevention via hash computation)
 * - Entropy scoring via zxcvbn (rejects "password123!" despite meeting complexity rules)
 * - User input dictionary (penalizes passwords containing user's email/name)
 * - NO mandatory complexity rules (NIST explicitly discourages uppercase/symbol requirements)
 *   → We keep the complexity regex in RegisterDto for defense-in-depth, but
 *     this service is the primary gate.
 *
 * LIBRARY: @zxcvbn-ts/core (TypeScript-native, actively maintained, updated dictionaries)
 *   - Replaces the abandoned `zxcvbn` (last updated 2017)
 *   - Initialized once at module bootstrap via onModuleInit
 *
 * GRACEFUL FAILURE:
 * If zxcvbn fails to evaluate (e.g., memory pressure, corrupt dictionary),
 * we fall back to length-only validation with a warning log.
 * This is "fail open" — same pattern as PasswordBreachService.
 *
 * @see PasswordBreachService for Layer 2 (HIBP breach check)
 * @see PasswordService for Layer 3 (Argon2id hashing)
 */

import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { zxcvbn, zxcvbnOptions } from '@zxcvbn-ts/core';
import * as zxcvbnCommonPackage from '@zxcvbn-ts/language-common';
import * as zxcvbnEnPackage from '@zxcvbn-ts/language-en';

// =============================================================================
// CONSTANTS
// =============================================================================

/** Minimum password length per NIST 800-63B */
const MIN_PASSWORD_LENGTH = 12;

/** Maximum password length (DoS prevention — Argon2id is expensive on large inputs) */
const MAX_PASSWORD_LENGTH = 128;

/**
 * Minimum zxcvbn score required.
 *
 * zxcvbn scores:
 *   0 = too guessable (risky password)
 *   1 = very guessable (protection from throttled online attacks)
 *   2 = somewhat guessable (protection from unthrottled online attacks)
 *   3 = safely unguessable (moderate protection from offline slow-hash attacks)
 *   4 = very unguessable (strong protection from offline slow-hash attacks)
 *
 * Score 3 is the sweet spot: blocks weak passwords without frustrating users
 * who use reasonable passphrases.
 */
const MIN_ZXCVBN_SCORE = 3;

// =============================================================================
// RESULT INTERFACE
// =============================================================================

/** zxcvbn score is always 0-4 */
export type ZxcvbnScore = 0 | 1 | 2 | 3 | 4;

/**
 * Result of password policy validation.
 * Returned to callers for both programmatic checks and user-facing feedback.
 */
export interface PasswordPolicyResult {
  /** Whether the password meets all policy requirements */
  readonly isAcceptable: boolean;

  /** zxcvbn entropy score (0-4). -1 if evaluation failed. */
  readonly score: ZxcvbnScore | -1;

  /** User-facing feedback messages (suggestions + warnings from zxcvbn) */
  readonly feedback: ReadonlyArray<string>;

  /** Human-readable estimated crack time (e.g., "centuries") */
  readonly estimatedCrackTime: string;
}

// =============================================================================
// SERVICE
// =============================================================================

@Injectable()
export class PasswordPolicyService implements OnModuleInit {
  private readonly logger = new Logger(PasswordPolicyService.name);
  private initialized = false;

  /**
   * Initialize zxcvbn dictionaries once at module startup.
   *
   * This loads English and common password dictionaries into memory.
   * Runs once per pod lifecycle — not per request.
   */
  onModuleInit(): void {
    try {
      zxcvbnOptions.setOptions({
        translations: zxcvbnEnPackage.translations,
        graphs: zxcvbnCommonPackage.adjacencyGraphs,
        dictionary: {
          ...zxcvbnCommonPackage.dictionary,
          ...zxcvbnEnPackage.dictionary,
        },
      });

      this.initialized = true;
      this.logger.log(
        'Password policy engine initialized (zxcvbn-ts with en + common dictionaries)',
      );
    } catch (error) {
      const errMsg = error instanceof Error ? error.message : String(error);
      this.logger.error(
        `Failed to initialize zxcvbn dictionaries: ${errMsg}. Falling back to length-only validation.`,
      );
    }
  }

  // ===========================================================================
  // PUBLIC API
  // ===========================================================================

  /**
   * Validate a password against NIST 800-63B policy + zxcvbn entropy analysis.
   *
   * @param password - The plaintext password to validate
   * @param userInputs - Optional array of user-specific strings to penalize
   *   (e.g., [email, name]). zxcvbn uses these as a custom dictionary to
   *   reject passwords like "john.doe@company.com" or "JohnDoe2024".
   *
   * @returns PasswordPolicyResult with score, feedback, and acceptability
   */
  validate(
    password: string,
    userInputs: ReadonlyArray<string> = [],
  ): PasswordPolicyResult {
    // ----- Gate 1: Length checks (cheapest, always runs) -----
    if (password.length < MIN_PASSWORD_LENGTH) {
      return {
        isAcceptable: false,
        score: 0,
        feedback: [
          `Password must be at least ${MIN_PASSWORD_LENGTH} characters long.`,
        ],
        estimatedCrackTime: 'instant',
      };
    }

    if (password.length > MAX_PASSWORD_LENGTH) {
      return {
        isAcceptable: false,
        score: 0,
        feedback: [
          `Password must be no more than ${MAX_PASSWORD_LENGTH} characters long.`,
        ],
        estimatedCrackTime: 'N/A',
      };
    }

    // ----- Gate 2: zxcvbn entropy analysis -----
    if (!this.initialized) {
      // Fallback: zxcvbn not available — accept on length alone with warning
      this.logger.warn(
        'zxcvbn not initialized — accepting password based on length only',
      );
      return {
        isAcceptable: true,
        score: -1,
        feedback: ['Password strength analysis unavailable.'],
        estimatedCrackTime: 'unknown',
      };
    }

    try {
      const result = zxcvbn(password, [...userInputs]);
      const score = result.score as ZxcvbnScore;

      // Collect user-facing feedback
      const feedback: string[] = [];
      if (result.feedback.warning) {
        feedback.push(result.feedback.warning);
      }
      if (result.feedback.suggestions) {
        feedback.push(...result.feedback.suggestions);
      }

      // If score is below threshold, add our own guidance
      if (score < MIN_ZXCVBN_SCORE) {
        feedback.push(
          `Password strength score: ${score}/4. A minimum of ${MIN_ZXCVBN_SCORE}/4 is required. Try a longer passphrase or avoid common patterns.`,
        );
      }

      const crackTimeDisplay =
        result.crackTimesDisplay?.offlineSlowHashing1e4PerSecond ?? 'unknown';

      return {
        isAcceptable: score >= MIN_ZXCVBN_SCORE,
        score,
        feedback,
        estimatedCrackTime: String(crackTimeDisplay),
      };
    } catch (error) {
      // Graceful fallback: zxcvbn evaluation failed
      const errMsg = error instanceof Error ? error.message : String(error);
      this.logger.error(
        `zxcvbn evaluation failed: ${errMsg}. Accepting password based on length only.`,
      );

      return {
        isAcceptable: true,
        score: -1,
        feedback: ['Password strength analysis temporarily unavailable.'],
        estimatedCrackTime: 'unknown',
      };
    }
  }
}
