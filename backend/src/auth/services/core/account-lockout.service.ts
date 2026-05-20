import { Inject, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ClsService } from 'nestjs-cls';
import { v4 as uuidv4 } from 'uuid';

import {
  CACHE_COUNTER_TOKEN,
  CACHE_STORE_TOKEN,
} from '../../../cache/constants/cache.tokens';
import {
  ICacheCounter,
  ICacheStore,
} from '../../../cache/interfaces/cache.interfaces';
import { AuditLogsService } from '../../../audit/audit-logs.service';
import { AuthConfig } from '../../../config/auth.config';
import { IAccountLockoutPolicy } from '../../interfaces/core.interfaces';

const LOCKOUT_KEY = (userId: string) => `lockout:${userId}`;
const LOCKOUT_COUNT_KEY = (userId: string) => `lockout_count:${userId}`;
const NAMESPACE = 'auth';
// Reset window for the exponential-backoff multiplier (24h).
const LOCKOUT_COUNT_TTL_SECONDS = 86400;

/**
 * Step 3 — Account lockout policy extracted from the legacy `AuthService`.
 *
 * Implements {@link IAccountLockoutPolicy}. Backed by Redis counters with
 * exponential backoff on repeat offenders.
 */
@Injectable()
export class AccountLockoutService implements IAccountLockoutPolicy {
  constructor(
    private readonly configService: ConfigService,
    @Inject(CACHE_COUNTER_TOKEN) private readonly cacheCounter: ICacheCounter,
    @Inject(CACHE_STORE_TOKEN) private readonly cacheStore: ICacheStore,
    private readonly auditLogsService: AuditLogsService,
    private readonly cls: ClsService,
  ) {}

  async isLocked(userId: string): Promise<boolean> {
    const attempts = await this.cacheStore.get<number>(LOCKOUT_KEY(userId), {
      namespace: NAMESPACE,
    });
    return (attempts || 0) >= this.getMaxAttempts();
  }

  async recordFailure(userId: string): Promise<number> {
    const lockoutCount =
      (await this.cacheStore.get<number>(LOCKOUT_COUNT_KEY(userId), {
        namespace: NAMESPACE,
      })) || 0;

    const ttl = this.getLockoutTtlForCount(lockoutCount);
    const attempts = await this.cacheCounter.incr(LOCKOUT_KEY(userId), {
      ttl,
      namespace: NAMESPACE,
    });

    if (attempts >= this.getMaxAttempts()) {
      await this.cacheCounter.incr(LOCKOUT_COUNT_KEY(userId), {
        ttl: LOCKOUT_COUNT_TTL_SECONDS,
        namespace: NAMESPACE,
      });
    }

    return attempts;
  }

  async clear(userId: string): Promise<void> {
    // Note: `lockout_count` is intentionally NOT cleared — repeat offenders
    // get progressively longer lockouts until the 24h window expires.
    await this.cacheStore.del(LOCKOUT_KEY(userId), { namespace: NAMESPACE });
  }

  async unlock(userId: string, adminUserId: string): Promise<void> {
    await this.clear(userId);
    // Manual admin unlock resets the backoff counter as well.
    await this.cacheStore.del(LOCKOUT_COUNT_KEY(userId), {
      namespace: NAMESPACE,
    });

    await this.auditLogsService.log({
      event_uuid: uuidv4(),
      timestamp: new Date(),
      tenant_id: 'system',
      actor_id: adminUserId,
      resource_type: 'User',
      resource_id: userId,
      action_type: 'UPDATE',
      action: 'ACCOUNT_UNLOCKED',
      metadata: {
        reason: 'Manual unlock by admin',
        unlockedBy: adminUserId,
        requestId: this.cls.get<string>('requestId'),
      },
    });
  }

  getMaxAttempts(): number {
    const authConfig = this.configService.get<AuthConfig>('auth');
    return authConfig?.lockout?.maxAttempts || 5;
  }

  /** Base lockout TTL (zero prior lockouts). */
  getLockoutTtlSeconds(): number {
    return this.getLockoutTtlForCount(0);
  }

  /** Exponential-backoff lockout TTL for `count` prior lockouts. */
  private getLockoutTtlForCount(count: number): number {
    const authConfig = this.configService.get<AuthConfig>('auth');
    const initialSeconds = authConfig?.lockout?.initialLockoutSeconds || 900;
    const multiplier = authConfig?.lockout?.backoffMultiplier || 2;
    const maxSeconds = authConfig?.lockout?.maxLockoutSeconds || 3600;

    const calculatedTtl = Math.floor(
      initialSeconds * Math.pow(multiplier, count),
    );
    return Math.min(calculatedTtl, maxSeconds);
  }
}
