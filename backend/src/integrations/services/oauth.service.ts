import { Injectable, BadRequestException, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { IntegrationType } from '../entities/integration.entity';
import { AppConfig } from '../../config/app.config';

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
 *
 * Enterprise Features:
 * - Redirect URIs are dynamically constructed from API_BASE_URL
 * - Explicit overrides available via *_REDIRECT_URI env vars
 * - Single source of truth for all OAuth configuration
 * - Proper error handling with actionable messages
 */
@Injectable()
export class OAuthService {
  private readonly logger = new Logger(OAuthService.name);
  private readonly apiBaseUrl: string;

  constructor(private configService: ConfigService) {
    // Get API base URL from typed configuration
    const appConfig = this.configService.get<AppConfig>('app');
    this.apiBaseUrl = appConfig?.apiBaseUrl || 'http://localhost:3000';
  }

  /**
   * Builds the default redirect URI for an integration type.
   * Uses API_BASE_URL from configuration.
   */
  private buildDefaultRedirectUri(integrationType: string): string {
    return `${this.apiBaseUrl}/api/integrations/oauth/${integrationType.toLowerCase()}/callback`;
  }

  /**
   * Gets the redirect URI for an integration.
   * Priority: Explicit env var > Dynamic from API_BASE_URL
   */
  private getRedirectUri(type: IntegrationType): string {
    const envVarMap: Record<IntegrationType, string> = {
      [IntegrationType.GITHUB]: 'GITHUB_REDIRECT_URI',
      [IntegrationType.SLACK]: 'SLACK_REDIRECT_URI',
      [IntegrationType.JIRA]: 'JIRA_REDIRECT_URI',
      [IntegrationType.GOOGLE_WORKSPACE]: 'GOOGLE_REDIRECT_URI',
      [IntegrationType.MICROSOFT_TEAMS]: 'MICROSOFT_REDIRECT_URI',
      [IntegrationType.TRELLO]: 'TRELLO_REDIRECT_URI',
    };

    const envVar = envVarMap[type];
    const explicitUri = envVar
      ? this.configService.get<string>(envVar)
      : undefined;

    if (explicitUri) {
      return explicitUri;
    }

    // Build from API_BASE_URL
    const typeNameMap: Record<IntegrationType, string> = {
      [IntegrationType.GITHUB]: 'github',
      [IntegrationType.SLACK]: 'slack',
      [IntegrationType.JIRA]: 'jira',
      [IntegrationType.GOOGLE_WORKSPACE]: 'google',
      [IntegrationType.MICROSOFT_TEAMS]: 'microsoft',
      [IntegrationType.TRELLO]: 'trello',
    };

    return this.buildDefaultRedirectUri(typeNameMap[type] || type);
  }

  /**
   * Gets OAuth configuration for a given integration type.
   * Configuration is loaded from environment variables with dynamic redirect URIs.
   */
  getOAuthConfig(type: IntegrationType): OAuthConfig {
    switch (type) {
      case IntegrationType.GITHUB:
        return {
          clientId: this.getRequiredEnv('GITHUB_CLIENT_ID'),
          clientSecret: this.getRequiredEnv('GITHUB_CLIENT_SECRET'),
          redirectUri: this.getRedirectUri(IntegrationType.GITHUB),
          authorizeUrl: 'https://github.com/login/oauth/authorize',
          tokenUrl: 'https://github.com/login/oauth/access_token',
          scopes: ['repo', 'read:user', 'user:email'],
        };

      case IntegrationType.SLACK:
        return {
          clientId: this.getRequiredEnv('SLACK_CLIENT_ID'),
          clientSecret: this.getRequiredEnv('SLACK_CLIENT_SECRET'),
          redirectUri: this.getRedirectUri(IntegrationType.SLACK),
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
          redirectUri: this.getRedirectUri(IntegrationType.JIRA),
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
          redirectUri: this.getRedirectUri(IntegrationType.GOOGLE_WORKSPACE),
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
          redirectUri: this.getRedirectUri(IntegrationType.MICROSOFT_TEAMS),
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
   * Returns empty string during initialization to allow lazy validation.
   */
  private getRequiredEnv(key: string): string {
    const value = this.configService.get<string>(key);

    if (!value) {
      // Log warning but don't throw during configuration loading
      // The actual error will be thrown when OAuth flow is initiated
      this.logger.warn(
        `Missing OAuth configuration: ${key}. ` +
          `OAuth flow for this integration will fail until configured.`,
      );
      return '';
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
