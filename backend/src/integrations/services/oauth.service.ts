import { Injectable, BadRequestException, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { IntegrationType } from '../entities/integration.entity';

export interface OAuthConfig {
  clientId: string;
  clientSecret: string;
  redirectUri: string;
  authorizeUrl: string;
  tokenUrl: string;
  scopes: string[];
}

export interface OAuthTokens {
  access_token: string;
  refresh_token?: string;
  expires_in?: number;
  scope?: string;
  token_type?: string;
}

/**
 * Service for managing OAuth 2.0 flows for third-party integrations.
 * Handles authorization URL generation, token exchange, and token refresh.
 */
@Injectable()
export class OAuthService {
  private readonly logger = new Logger(OAuthService.name);

  constructor(private configService: ConfigService) {}

  /**
   * Gets OAuth configuration for a given integration type.
   * Configuration is loaded from environment variables.
   */
  getOAuthConfig(type: IntegrationType): OAuthConfig {
    switch (type) {
      case IntegrationType.GITHUB:
        return {
          clientId: this.getRequiredEnv('GITHUB_CLIENT_ID'),
          clientSecret: this.getRequiredEnv('GITHUB_CLIENT_SECRET'),
          redirectUri:
            this.getRequiredEnv('GITHUB_REDIRECT_URI') ||
            'http://localhost:3000/api/integrations/oauth/github/callback',
          authorizeUrl: 'https://github.com/login/oauth/authorize',
          tokenUrl: 'https://github.com/login/oauth/access_token',
          scopes: ['repo', 'read:user', 'user:email'],
        };

      case IntegrationType.SLACK:
        return {
          clientId: this.getRequiredEnv('SLACK_CLIENT_ID'),
          clientSecret: this.getRequiredEnv('SLACK_CLIENT_SECRET'),
          redirectUri:
            this.getRequiredEnv('SLACK_REDIRECT_URI') ||
            'http://localhost:3000/api/integrations/oauth/slack/callback',
          authorizeUrl: 'https://slack.com/oauth/v2/authorize',
          tokenUrl: 'https://slack.com/api/oauth.v2.access',
          scopes: [
            'channels:history',
            'channels:read',
            'chat:write',
            'commands',
            'users:read',
          ],
        };

      case IntegrationType.JIRA:
        return {
          clientId: this.getRequiredEnv('JIRA_CLIENT_ID'),
          clientSecret: this.getRequiredEnv('JIRA_CLIENT_SECRET'),
          redirectUri:
            this.getRequiredEnv('JIRA_REDIRECT_URI') ||
            'http://localhost:3000/api/integrations/oauth/jira/callback',
          authorizeUrl: 'https://auth.atlassian.com/authorize',
          tokenUrl: 'https://auth.atlassian.com/oauth/token',
          scopes: [
            'read:jira-work',
            'write:jira-work',
            'read:jira-user',
            'offline_access',
          ],
        };

      case IntegrationType.GOOGLE_WORKSPACE:
        return {
          clientId: this.getRequiredEnv('GOOGLE_CLIENT_ID'),
          clientSecret: this.getRequiredEnv('GOOGLE_CLIENT_SECRET'),
          redirectUri:
            this.getRequiredEnv('GOOGLE_REDIRECT_URI') ||
            'http://localhost:3000/api/integrations/oauth/google/callback',
          authorizeUrl: 'https://accounts.google.com/o/oauth2/v2/auth',
          tokenUrl: 'https://oauth2.googleapis.com/token',
          scopes: [
            'https://www.googleapis.com/auth/calendar',
            'https://www.googleapis.com/auth/drive.readonly',
            'https://www.googleapis.com/auth/gmail.send',
          ],
        };

      case IntegrationType.MICROSOFT_TEAMS:
        return {
          clientId: this.getRequiredEnv('MICROSOFT_CLIENT_ID'),
          clientSecret: this.getRequiredEnv('MICROSOFT_CLIENT_SECRET'),
          redirectUri:
            this.getRequiredEnv('MICROSOFT_REDIRECT_URI') ||
            'http://localhost:3000/api/integrations/oauth/microsoft/callback',
          authorizeUrl:
            'https://login.microsoftonline.com/common/oauth2/v2.0/authorize',
          tokenUrl:
            'https://login.microsoftonline.com/common/oauth2/v2.0/token',
          scopes: [
            'https://graph.microsoft.com/Channel.ReadBasic.All',
            'https://graph.microsoft.com/Chat.Read',
            'https://graph.microsoft.com/OnlineMeetings.ReadWrite',
          ],
        };

      case IntegrationType.TRELLO:
        // Trello uses API key + token authentication, not OAuth 2.0
        // Users should connect via the manual API key flow
        throw new BadRequestException(
          `Trello uses API key authentication, not OAuth. ` +
            `Please connect using your Trello API key and token. ` +
            `See: https://trello.com/power-ups/admin for API credentials.`,
        );

      default:
        throw new BadRequestException(
          `OAuth not supported for integration type: ${String(type)}`,
        );
    }
  }

  /**
   * Builds the authorization URL for OAuth flow.
   * User should be redirected to this URL to grant permissions.
   */
  buildAuthorizeUrl(type: IntegrationType, state: string): string {
    const config = this.getOAuthConfig(type);

    const params = new URLSearchParams({
      client_id: config.clientId,
      redirect_uri: config.redirectUri,
      scope: config.scopes.join(' '),
      state,
      response_type: 'code',
    });

    // GitHub-specific: add access_type for offline access (refresh token)
    if (type === IntegrationType.GITHUB) {
      // GitHub always provides refresh tokens, no special param needed
    }

    // Google-specific: add access_type for offline access (refresh token)
    if (type === IntegrationType.GOOGLE_WORKSPACE) {
      params.append('access_type', 'offline');
      params.append('prompt', 'consent');
    }

    // Jira-specific: add audience
    if (type === IntegrationType.JIRA) {
      params.append('audience', 'api.atlassian.com');
      params.append('prompt', 'consent');
    }

    return `${config.authorizeUrl}?${params.toString()}`;
  }

  /**
   * Exchanges authorization code for access and refresh tokens.
   * Called in the OAuth callback after user grants permissions.
   */
  async exchangeCodeForTokens(
    type: IntegrationType,
    code: string,
  ): Promise<OAuthTokens> {
    const config = this.getOAuthConfig(type);

    try {
      const response = await fetch(config.tokenUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          Accept: 'application/json',
        },
        body: new URLSearchParams({
          client_id: config.clientId,
          client_secret: config.clientSecret,
          code,
          redirect_uri: config.redirectUri,
          grant_type: 'authorization_code',
        }).toString(),
      });

      if (!response.ok) {
        const errorText = await response.text();
        this.logger.error(
          `Token exchange failed for ${type}: ${response.status} - ${errorText}`,
        );
        throw new BadRequestException(
          `Failed to exchange authorization code: ${response.status}`,
        );
      }

      const tokens = (await response.json()) as OAuthTokens;

      this.logger.log(`Successfully exchanged code for tokens: ${type}`);

      return tokens;
    } catch (error) {
      this.logger.error(`Error exchanging code for tokens (${type}):`, error);
      throw new BadRequestException(
        `OAuth token exchange failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
      );
    }
  }

  /**
   * Refreshes an access token using a refresh token.
   * Used when access token expires.
   */
  async refreshAccessToken(
    type: IntegrationType,
    refreshToken: string,
  ): Promise<OAuthTokens> {
    const config = this.getOAuthConfig(type);

    try {
      const response = await fetch(config.tokenUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          Accept: 'application/json',
        },
        body: new URLSearchParams({
          client_id: config.clientId,
          client_secret: config.clientSecret,
          refresh_token: refreshToken,
          grant_type: 'refresh_token',
        }).toString(),
      });

      if (!response.ok) {
        const errorText = await response.text();
        this.logger.error(
          `Token refresh failed for ${type}: ${response.status} - ${errorText}`,
        );
        throw new BadRequestException(
          `Failed to refresh access token: ${response.status}`,
        );
      }

      const tokens = (await response.json()) as OAuthTokens;

      this.logger.log(`Successfully refreshed access token: ${type}`);

      return tokens;
    } catch (error) {
      this.logger.error(`Error refreshing access token (${type}):`, error);
      throw new BadRequestException(
        `OAuth token refresh failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
      );
    }
  }

  /**
   * Gets required environment variable or throws error.
   */
  private getRequiredEnv(key: string): string {
    const value = this.configService.get<string>(key);

    if (!value) {
      throw new Error(
        `Missing required environment variable: ${key}. ` +
          `Please configure OAuth credentials in your .env file. ` +
          `See INTEGRATION_ENV_SETUP.md for details.`,
      );
    }

    return value;
  }

  /**
   * Validates OAuth state parameter to prevent CSRF attacks.
   */
  validateState(receivedState: string, expectedState: string): boolean {
    return receivedState === expectedState;
  }
}
