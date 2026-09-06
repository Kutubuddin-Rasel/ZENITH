import {
  Inject,
  Injectable,
  InternalServerErrorException,
  Logger,
} from '@nestjs/common';
import { SECURE_RANDOM_TOKEN, SecureRandom } from '../../../encryption';
import {
  CSRF_CONFIG_TOKEN,
  CSRF_TOKEN_REPOSITORY_TOKEN,
} from '../constants/csrf.tokens';
import {
  ICsrfConfig,
  ICsrfTokenCommand,
  ICsrfTokenRepository,
} from '../interfaces/csrf.interfaces';

/**
 * CQRS write surface for CSRF token lifecycle.
 *
 * MULTI-TAB SAFE: repeat calls within TTL return the existing token with
 * the TTL refreshed — required so multiple browser tabs share one token
 * and an active session never sees a token expire mid-flow.
 *
 * DEFENSE IN DEPTH: rejects empty / whitespace `userId` even if upstream
 * auth guard is bypassed. If a future developer removes the JwtAuthGuard
 * from the controller, this service still refuses to mint anonymous
 * tokens.
 *
 * Crypto is fully inverted via `SecureRandom`; no `node:crypto` import.
 */
@Injectable()
export class CsrfTokenCommandService extends ICsrfTokenCommand {
  private readonly logger = new Logger(CsrfTokenCommandService.name);

  constructor(
    @Inject(CSRF_TOKEN_REPOSITORY_TOKEN)
    private readonly repository: ICsrfTokenRepository,
    @Inject(SECURE_RANDOM_TOKEN)
    private readonly secureRandom: SecureRandom,
    @Inject(CSRF_CONFIG_TOKEN) private readonly config: ICsrfConfig,
  ) {
    super();
  }

  async generateToken(userId: string): Promise<string> {
    this.assertUserContext(userId);

    const existing = await this.repository.get(userId);
    if (existing) {
      // Refresh TTL on access — keeps multi-tab sessions alive.
      await this.repository.set(userId, existing, this.config.tokenTtlSeconds);
      return existing;
    }

    // 32 bytes = 256 bits of entropy, hex-encoded.
    const token = this.secureRandom.generateSecureRandom(32);
    await this.repository.set(userId, token, this.config.tokenTtlSeconds);

    this.logger.debug(
      `CSRF token generated for user ${userId.substring(0, 8)}...`,
    );
    return token;
  }

  async invalidateToken(userId: string): Promise<void> {
    if (!userId) {
      return;
    }
    await this.repository.delete(userId);
    this.logger.debug(
      `CSRF token invalidated for user ${userId.substring(0, 8)}...`,
    );
  }

  private assertUserContext(userId: string): void {
    if (!userId || typeof userId !== 'string' || userId.trim() === '') {
      this.logger.error(
        'SECURITY: CSRF token generation attempted without valid userId',
      );
      throw new InternalServerErrorException(
        'CSRF Token generation requires authenticated user context',
      );
    }
  }
}
