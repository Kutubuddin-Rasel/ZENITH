import {
  Controller,
  Get,
  Inject,
  Logger,
  Request,
  UseGuards,
} from '@nestjs/common';
import { Request as ExpressRequest } from 'express';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import {
  CSRF_REQUEST_CONTEXT_TOKEN,
  CSRF_TOKEN_COMMAND_TOKEN,
} from './constants/csrf.tokens';
import {
  ICsrfRequestContext,
  ICsrfTokenCommand,
} from './interfaces/csrf.interfaces';

/**
 * CSRF Token Controller
 *
 * GET /auth/csrf-token — issues (or refreshes) the user's CSRF token.
 *
 * SECURITY:
 *  1. Requires `JwtAuthGuard` at the front door — no anonymous tokens.
 *  2. Reuses `ICsrfRequestContext` for userId resolution so the
 *     extraction logic is byte-identical to the guard (legacy version
 *     used `req.user?.userId` only, missing the `id` / `sub` fallback —
 *     unifying via the port closes that subtle drift).
 *  3. `ICsrfTokenCommand` enforces defense-in-depth: if a future
 *     developer removes `JwtAuthGuard`, the command service still
 *     refuses to mint a token without a valid userId.
 */
@Controller('auth')
export class CsrfController {
  private readonly logger = new Logger(CsrfController.name);

  constructor(
    @Inject(CSRF_TOKEN_COMMAND_TOKEN)
    private readonly tokenCommand: ICsrfTokenCommand,
    @Inject(CSRF_REQUEST_CONTEXT_TOKEN)
    private readonly requestContext: ICsrfRequestContext,
  ) {}

  @UseGuards(JwtAuthGuard)
  @Get('csrf-token')
  async getCsrfToken(
    @Request() req: ExpressRequest,
  ): Promise<{ csrfToken: string }> {
    const { userId } = this.requestContext.extract(req);
    if (!userId) {
      this.logger.error(
        'SECURITY ANOMALY: getCsrfToken called without userId despite JwtAuthGuard',
      );
      throw new Error('User context required for CSRF token generation');
    }
    const csrfToken = await this.tokenCommand.generateToken(userId);
    return { csrfToken };
  }
}
