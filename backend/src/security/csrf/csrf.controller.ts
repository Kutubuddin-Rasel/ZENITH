import { Controller, Get, Request, UseGuards, Logger } from '@nestjs/common';
import { CsrfService } from './csrf.service';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';

/**
 * CSRF Token Controller
 *
 * SECURITY NOTES:
 * 1. This endpoint REQUIRES authentication (JwtAuthGuard)
 * 2. CSRF tokens are only needed for authenticated state-changing operations
 * 3. POST /login does NOT need CSRF (uses LocalStrategy, not vulnerable)
 *
 * The login flow is:
 * 1. User submits credentials → POST /auth/login (no CSRF needed)
 * 2. Server returns JWT → User is now authenticated
 * 3. Frontend calls GET /auth/csrf-token (requires JWT)
 * 4. Frontend uses CSRF token for sensitive operations (change-password, etc.)
 */
@Controller('auth')
export class CsrfController {
  private readonly logger = new Logger(CsrfController.name);

  constructor(private readonly csrfService: CsrfService) {}

  /**
   * Get CSRF token for the authenticated user
   *
   * Multi-tab safe: returns existing token if valid
   *
   * SECURITY:
   * - Requires JwtAuthGuard (Controller level - front door)
   * - Service also validates user context (defense in depth)
   */
  @UseGuards(JwtAuthGuard)
  @Get('csrf-token')
  async getCsrfToken(
    @Request() req: { user?: { userId?: string } },
  ): Promise<{ csrfToken: string }> {
    // Defense in depth: Don't rely solely on guard
    const userId = req.user?.userId;

    if (!userId) {
      // This should never happen if JwtAuthGuard works correctly
      // But we log it as a security anomaly if it does
      this.logger.error(
        'SECURITY ANOMALY: getCsrfToken called without userId despite JwtAuthGuard',
      );
      throw new Error('User context required for CSRF token generation');
    }

    const token = await this.csrfService.generateToken(userId);
    return { csrfToken: token };
  }
}
