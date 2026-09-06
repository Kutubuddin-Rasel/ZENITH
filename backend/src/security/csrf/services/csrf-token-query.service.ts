import { Inject, Injectable, Logger } from '@nestjs/common';
import { HASHER_TOKEN, Hasher } from '../../../encryption';
import { CSRF_TOKEN_REPOSITORY_TOKEN } from '../constants/csrf.tokens';
import {
  ICsrfTokenQuery,
  ICsrfTokenRepository,
} from '../interfaces/csrf.interfaces';

/**
 * CQRS read surface for CSRF token verification.
 *
 * FAIL-CLOSED: any missing input, missing stored token, or comparison
 * error returns `false`. Never throws — the caller (guard) translates
 * `false` into a `ForbiddenException` with the appropriate failure
 * reason for forensics.
 *
 * TIMING-SAFE: comparison is delegated to `Hasher.timingSafeEqual`,
 * which length-checks then runs `crypto.timingSafeEqual` on equal-
 * length buffers — defeats the same side channel `verifyIntegrity`
 * defeats for HMACs.
 */
@Injectable()
export class CsrfTokenQueryService extends ICsrfTokenQuery {
  private readonly logger = new Logger(CsrfTokenQueryService.name);

  constructor(
    @Inject(CSRF_TOKEN_REPOSITORY_TOKEN)
    private readonly repository: ICsrfTokenRepository,
    @Inject(HASHER_TOKEN) private readonly hasher: Hasher,
  ) {
    super();
  }

  async validateToken(userId: string, providedToken: string): Promise<boolean> {
    if (!providedToken || !userId) {
      return false;
    }

    const storedToken = await this.repository.get(userId);
    if (!storedToken) {
      this.logger.debug(
        `CSRF validation failed: no stored token for user ${userId.substring(0, 8)}...`,
      );
      return false;
    }

    return this.hasher.timingSafeEqual(storedToken, providedToken);
  }
}
