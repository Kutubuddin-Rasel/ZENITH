import { registerAs } from '@nestjs/config';

/**
 * Integration Configuration
 *
 * Settings for external service integrations (OAuth providers, APIs, etc.)
 */
export const integrationConfig = registerAs('integration', () => ({
  /**
   * Common timeout settings
   */
  timeout: {
    /**
     * Default API call timeout in milliseconds
     */
    default: parseInt(process.env.INTEGRATION_TIMEOUT_MS || '30000', 10),

    /**
     * AI API calls (may take longer)
     */
    ai: parseInt(process.env.AI_API_TIMEOUT_MS || '60000', 10),

    /**
     * OAuth flow timeout
     */
    oauth: parseInt(process.env.OAUTH_TIMEOUT_MS || '30000', 10),
  },

  /**
   * Circuit breaker configuration
   * Prevents cascading failures when external services are down
   */
  circuitBreaker: {
    /**
     * Number of failures before opening circuit
     */
    failureThreshold: parseInt(
      process.env.CIRCUIT_BREAKER_FAILURE_THRESHOLD || '5',
      10,
    ),

    /**
     * Time in ms before attempting to close circuit
     */
    resetTimeout: parseInt(process.env.CIRCUIT_BREAKER_RESET_MS || '30000', 10),

    /**
     * Window in ms for counting failures
     */
    windowMs: parseInt(process.env.CIRCUIT_BREAKER_WINDOW_MS || '60000', 10),
  },

  /**
   * GitHub Integration
   */
  github: {
    appId: process.env.GITHUB_APP_ID || '',
    privateKey: process.env.GITHUB_PRIVATE_KEY || '',
    webhookSecret: process.env.GITHUB_WEBHOOK_SECRET || '',
    clientId: process.env.GITHUB_CLIENT_ID || '',
    clientSecret: process.env.GITHUB_CLIENT_SECRET || '',
  },

  /**
   * Slack Integration
   */
  slack: {
    clientId: process.env.SLACK_CLIENT_ID || '',
    clientSecret: process.env.SLACK_CLIENT_SECRET || '',
    signingSecret: process.env.SLACK_SIGNING_SECRET || '',
    botToken: process.env.SLACK_BOT_TOKEN || '',
  },

  /**
   * Jira Integration
   */
  jira: {
    clientId: process.env.JIRA_CLIENT_ID || '',
    clientSecret: process.env.JIRA_CLIENT_SECRET || '',
  },

  /**
   * Google Integration
   */
  google: {
    clientId: process.env.GOOGLE_CLIENT_ID || '',
    clientSecret: process.env.GOOGLE_CLIENT_SECRET || '',
  },

  /**
   * Microsoft Integration
   */
  microsoft: {
    clientId: process.env.MICROSOFT_CLIENT_ID || '',
    clientSecret: process.env.MICROSOFT_CLIENT_SECRET || '',
    tenantId: process.env.MICROSOFT_TENANT_ID || '',
  },

  /**
   * AI Providers
   */
  ai: {
    openai: {
      apiKey: process.env.OPENAI_API_KEY || '',
      model: process.env.OPENAI_MODEL || 'gpt-4',
    },
    gemini: {
      apiKey: process.env.GEMINI_API_KEY || '',
      model: process.env.GEMINI_MODEL || 'gemini-pro',
    },
    groq: {
      apiKey: process.env.GROQ_API_KEY || '',
    },
  },
}));

export type IntegrationConfig = ReturnType<typeof integrationConfig>;
