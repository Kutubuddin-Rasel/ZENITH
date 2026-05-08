/**
 * Login History Service — Records and Queries Login Attempts
 *
 * ARCHITECTURE:
 * This service follows the Single Responsibility Principle:
 * - AuthService handles authentication logic
 * - LoginHistoryService handles persistence of login attempts
 *
 * FIRE-AND-FORGET RECORDING:
 * recordAttempt() is designed to NEVER throw. Login history is observability
 * data — if we can't record it, the login flow must not be affected.
 * Errors are logged, not propagated.
 *
 * QUERY PATTERN:
 * getHistory() returns paginated results ordered by timestamp DESC.
 * The (userId, timestamp) composite index ensures O(log n) lookups.
 *
 * @see LoginHistory entity for the schema
 * @see AuthService.validateUser() for the recording integration point
 */

import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import {
  LoginHistory,
  LoginFailureReason,
} from './entities/login-history.entity';

// =============================================================================
// INPUT INTERFACE (not a DTO — this is service-internal, not HTTP-facing)
// =============================================================================

/**
 * Parameters for recording a login attempt.
 * All fields are explicitly typed — no Partial<> or loose objects.
 */
export interface RecordLoginAttemptParams {
  readonly userId: string;
  readonly ipAddress: string;
  readonly userAgent: string | null;
  readonly deviceFingerprint: string | null;
  readonly success: boolean;
  readonly failureReason: LoginFailureReason | null;
  readonly organizationId: string | null;
}

// =============================================================================
// RESPONSE INTERFACE (user-facing login history)
// =============================================================================

/**
 * Shape returned to the frontend for "/users/me/login-history".
 * Excludes internal fields (id, userId) — only what the user needs.
 */
export interface LoginHistoryEntry {
  readonly ipAddress: string;
  readonly userAgent: string | null;
  readonly deviceFingerprint: string | null;
  readonly timestamp: Date;
  readonly success: boolean;
  readonly failureReason: LoginFailureReason | null;
}

// =============================================================================
// CONSTANTS
// =============================================================================

/** Default page size for login history queries */
const DEFAULT_HISTORY_LIMIT = 20;

/** Maximum page size to prevent abusive queries */
const MAX_HISTORY_LIMIT = 100;

// =============================================================================
// SERVICE
// =============================================================================

@Injectable()
export class LoginHistoryService {
  private readonly logger = new Logger(LoginHistoryService.name);

  constructor(
    @InjectRepository(LoginHistory)
    private readonly loginHistoryRepo: Repository<LoginHistory>,
  ) {}

  // ===========================================================================
  // RECORD LOGIN ATTEMPT (Fire-and-Forget)
  // ===========================================================================

  /**
   * Record a login attempt to the database.
   *
   * CRITICAL: This method NEVER throws. Login flow must not break
   * because we couldn't write observability data.
   *
   * @param params - Strongly typed login attempt data
   */
  async recordAttempt(params: RecordLoginAttemptParams): Promise<void> {
    try {
      const entry = this.loginHistoryRepo.create({
        userId: params.userId,
        ipAddress: params.ipAddress,
        userAgent: params.userAgent,
        deviceFingerprint: params.deviceFingerprint,
        success: params.success,
        failureReason: params.failureReason,
        organizationId: params.organizationId,
      });

      await this.loginHistoryRepo.save(entry);
    } catch (error) {
      // Fire-and-forget: log the error but never propagate
      const errMsg = error instanceof Error ? error.message : String(error);
      this.logger.error(
        `Failed to record login attempt for user ${params.userId}: ${errMsg}`,
      );
    }
  }

  // ===========================================================================
  // QUERY LOGIN HISTORY (User-Facing)
  // ===========================================================================

  /**
   * Get paginated login history for a specific user.
   *
   * Returns most recent entries first (timestamp DESC).
   * Uses the IDX_login_history_user_timestamp composite index.
   *
   * @param userId - UUID of the user
   * @param limit - Number of entries to return (max 100)
   * @returns Array of LoginHistoryEntry (frontend-safe shape)
   */
  async getHistory(
    userId: string,
    limit: number = DEFAULT_HISTORY_LIMIT,
  ): Promise<ReadonlyArray<LoginHistoryEntry>> {
    const clampedLimit = Math.min(Math.max(1, limit), MAX_HISTORY_LIMIT);

    const entries = await this.loginHistoryRepo.find({
      where: { userId },
      order: { timestamp: 'DESC' },
      take: clampedLimit,
      select: [
        'ipAddress',
        'userAgent',
        'deviceFingerprint',
        'timestamp',
        'success',
        'failureReason',
      ],
    });

    return entries;
  }
}
