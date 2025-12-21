import {
  Controller,
  Get,
  Query,
  Param,
  Res,
  UseGuards,
  Request,
  Session,
  BadRequestException,
  UnauthorizedException,
  Logger,
} from '@nestjs/common';
import { Response } from 'express';
import { ConfigService } from '@nestjs/config';
import { OAuthService } from '../services/oauth.service';
import { IntegrationService } from '../services/integration.service';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { IntegrationType } from '../entities/integration.entity';
import { generateHexToken } from '../../common/utils/token.util';

interface AuthenticatedRequest {
  user: {
    id: string;
    organizationId?: string;
    email: string;
  };
}

interface SessionData {
  oauthState?: string;
  oauthType?: IntegrationType;
  userId?: string;
  organizationId?: string;
}

/**
 * Controller handling OAuth 2.0 authorization flows for third-party integrations.
 *
 * Flow:
 * 1. User clicks "Connect" in frontend
 * 2. Frontend redirects to /authorize
 * 3. User is redirected to third-party (GitHub, Slack, etc.)
 * 4. User grants permissions
 * 5. Third-party redirects to /callback with code
 * 6. We exchange code for tokens, encrypt, and store
 * 7. Redirect user back to frontend with success
 */
@Controller('api/integrations/oauth')
export class OAuthController {
  private readonly logger = new Logger(OAuthController.name);

  constructor(
    private oauthService: OAuthService,
    private integrationService: IntegrationService,
    private configService: ConfigService,
  ) { }

  /**
   * Initiates OAuth flow by redirecting to third-party authorization page.
   *
   * @param type - Integration type (github, slack, etc.)
   * @param req - Authenticated request
   * @param session - Express session for CSRF protection
   * @param res - Response to redirect
   */
  @Get(':type/authorize')
  @UseGuards(JwtAuthGuard)
  initiateOAuth(
    @Param('type') typeParam: string,
    @Request() req: AuthenticatedRequest,
    @Session() session: SessionData,
    @Res() res: Response,
  ) {
    // Convert string to IntegrationType enum (enum values are lowercase)
    const type = typeParam.toLowerCase() as IntegrationType;

    if (!Object.values(IntegrationType).includes(type)) {
      throw new BadRequestException(`Invalid integration type: ${typeParam}`);
    }

    this.logger.log(
      `Initiating OAuth for ${type} (user: ${req.user.id}, org: ${req.user.organizationId})`,
    );

    // Generate random state for CSRF protection (stored in session)
    const state = generateHexToken(64); // 64 hex chars for CSRF state

    // Store state and user info in session (10 minute TTL)
    session.oauthState = state;
    session.oauthType = type;
    session.userId = req.user.id;

    if (!req.user.organizationId) {
      throw new BadRequestException(
        'Organization context required for OAuth. Please re-authenticate.',
      );
    }
    session.organizationId = req.user.organizationId;

    // Build authorization URL
    const authorizeUrl = this.oauthService.buildAuthorizeUrl(type, state);

    this.logger.log(`Redirecting to OAuth provider: ${type}`);

    // Redirect user to third-party authorization page
    res.redirect(authorizeUrl);
  }

  /**
   * Handles OAuth callback after user grants permissions.
   * Exchanges authorization code for tokens and creates integration.
   *
   * @param type - Integration type
   * @param code - Authorization code from OAuth provider
   * @param state - CSRF protection token
   * @param session - Express session
   * @param res - Response to redirect
   */
  @Get(':type/callback')
  async handleOAuthCallback(
    @Param('type') typeParam: string,
    @Query('code') code: string,
    @Query('state') state: string,
    @Session() session: SessionData,
    @Res() res: Response,
    @Query('error') error?: string,
    @Query('error_description') errorDescription?: string,
  ) {
    const frontendUrl =
      this.configService.get<string>('FRONTEND_URL') || 'http://localhost:3001';

    // Check for OAuth errors (user denied access, etc.)
    if (error) {
      this.logger.error(
        `OAuth error: ${error} - ${errorDescription || 'No description'}`,
      );
      return res.redirect(
        `${frontendUrl}/integrations?error=${encodeURIComponent(error)}&message=${encodeURIComponent(errorDescription || 'OAuth failed')}`,
      );
    }

    // Validate required parameters
    if (!code || !state) {
      throw new BadRequestException('Missing code or state parameter');
    }

    // Convert string to IntegrationType enum (enum values are lowercase)
    const type = typeParam.toLowerCase() as IntegrationType;

    if (!Object.values(IntegrationType).includes(type)) {
      throw new BadRequestException(`Invalid integration type: ${typeParam}`);
    }

    // Verify state to prevent CSRF attacks
    if (!session.oauthState || session.oauthState !== state) {
      this.logger.error(
        `OAuth state mismatch. Expected: ${session.oauthState}, Received: ${state}`,
      );
      throw new UnauthorizedException(
        'Invalid OAuth state. Possible CSRF attack. Please try again.',
      );
    }

    // Verify integration type matches session
    if (session.oauthType !== type) {
      throw new UnauthorizedException('OAuth type mismatch');
    }

    // Get user info from session
    const userId = session.userId;
    const organizationId = session.organizationId;

    if (!organizationId) {
      throw new UnauthorizedException(
        'Organization session expired. Please try again.',
      );
    }

    if (!userId) {
      throw new UnauthorizedException(
        'User session expired. Please try again.',
      );
    }

    this.logger.log(
      `Processing OAuth callback for ${type} (user: ${userId}, org: ${organizationId})`,
    );

    try {
      // Exchange authorization code for tokens
      const tokens = await this.oauthService.exchangeCodeForTokens(type, code);

      // Calculate token expiration
      const expiresAt = tokens.expires_in
        ? new Date(Date.now() + tokens.expires_in * 1000)
        : new Date(Date.now() + 3600 * 1000); // Default 1 hour

      // Create integration with encrypted tokens
      const integration = await this.integrationService.createIntegration({
        name: `${type.charAt(0)}${type.slice(1).toLowerCase()} Integration`,
        type,
        config: {
          syncSettings: {
            enabled: true,
            frequency: 'daily',
            batchSize: 100,
          },
          notifications: {
            enabled: true,
            channels: [],
            events: [],
          },
        },
        authConfig: {
          type: 'oauth',
          accessToken: tokens.access_token, // Will be encrypted by service
          refreshToken: tokens.refresh_token,
          expiresAt,
          scopes: tokens.scope?.split(' ') || [],
        },
        organizationId,
      });

      // Clear session data
      delete session.oauthState;
      delete session.oauthType;
      delete session.userId;
      delete session.organizationId;

      this.logger.log(
        `Successfully created integration ${integration.id} for ${type}`,
      );

      // Redirect back to frontend with success
      res.redirect(
        `${frontendUrl}/integrations?success=true&id=${integration.id}&type=${type}`,
      );
    } catch (error) {
      this.logger.error('OAuth callback error:', error);

      const errorMessage =
        error instanceof Error ? error.message : 'Unknown error';

      res.redirect(
        `${frontendUrl}/integrations?error=oauth_failed&message=${encodeURIComponent(errorMessage)}`,
      );
    }
  }

  /**
   * Manually tests OAuth configuration for an integration type.
   * Useful for debugging OAuth setup.
   *
   * @param type - Integration type to test
   */
  @Get(':type/test-config')
  @UseGuards(JwtAuthGuard)
  testOAuthConfig(@Param('type') typeParam: string) {
    const type = typeParam.toUpperCase() as IntegrationType;

    try {
      const config = this.oauthService.getOAuthConfig(type);

      return {
        type,
        configured: true,
        hasClientId: !!config.clientId,
        hasClientSecret: !!config.clientSecret,
        redirectUri: config.redirectUri,
        authorizeUrl: config.authorizeUrl,
        scopes: config.scopes,
      };
    } catch (error) {
      return {
        type,
        configured: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }
}
