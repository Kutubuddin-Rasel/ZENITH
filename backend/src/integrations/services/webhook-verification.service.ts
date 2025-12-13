import { Injectable, Logger, UnauthorizedException } from '@nestjs/common';
import * as crypto from 'crypto';

/**
 * Service for verifying webhook signatures from third-party integrations.
 *
 * Prevents attackers from sending fake webhooks by validating HMAC signatures.
 * Uses timing-safe comparison to prevent timing attacks.
 */
@Injectable()
export class WebhookVerificationService {
  private readonly logger = new Logger(WebhookVerificationService.name);

  /**
   * Verifies GitHub webhook signature.
   *
   * GitHub uses HMAC-SHA256 and sends signature in X-Hub-Signature-256 header.
   * Format: "sha256=<hex-digest>"
   *
   * @param payload - Raw request body as string
   * @param signature - X-Hub-Signature-256 header value
   * @param secret - Webhook secret configured in GitHub
   * @returns true if signature is valid
   *
   * @see https://docs.github.com/en/webhooks/using-webhooks/validating-webhook-deliveries
   */
  verifyGitHubSignature(
    payload: string,
    signature: string,
    secret: string,
  ): boolean {
    if (!signature || !secret || !payload) {
      this.logger.warn(
        'Missing signature, secret, or payload for GitHub webhook',
      );
      return false;
    }

    // GitHub signature format: "sha256=<hex-digest>"
    if (!signature.startsWith('sha256=')) {
      this.logger.warn(
        'Invalid GitHub signature format (missing sha256= prefix)',
      );
      return false;
    }

    try {
      // Compute expected signature
      const hmac = crypto.createHmac('sha256', secret);
      const expectedSignature = 'sha256=' + hmac.update(payload).digest('hex');

      // Timing-safe comparison to prevent timing attacks
      const isValid = crypto.timingSafeEqual(
        Buffer.from(signature),
        Buffer.from(expectedSignature),
      );

      if (!isValid) {
        this.logger.warn('GitHub webhook signature verification failed');
      }

      return isValid;
    } catch (error) {
      this.logger.error('Error verifying GitHub signature:', error);
      return false;
    }
  }

  /**
   * Verifies Slack webhook signature.
   *
   * Slack uses HMAC-SHA256 with timestamp to prevent replay attacks.
   * Signature is sent in X-Slack-Signature header.
   * Timestamp is sent in X-Slack-Request-Timestamp header.
   *
   * @param body - Raw request body as string
   * @param timestamp - X-Slack-Request-Timestamp header value
   * @param signature - X-Slack-Signature header value
   * @param signingSecret - Slack signing secret
   * @returns true if signature is valid
   *
   * @see https://api.slack.com/authentication/verifying-requests-from-slack
   */
  verifySlackSignature(
    body: string,
    timestamp: string,
    signature: string,
    signingSecret: string,
  ): boolean {
    if (!signature || !signingSecret || !body || !timestamp) {
      this.logger.warn(
        'Missing signature, secret, body, or timestamp for Slack webhook',
      );
      return false;
    }

    // Slack signature format: "v0=<hex-digest>"
    if (!signature.startsWith('v0=')) {
      this.logger.warn('Invalid Slack signature format (missing v0= prefix)');
      return false;
    }

    try {
      // Reject old requests (replay attack protection)
      // Slack recommends rejecting requests older than 5 minutes
      const requestTimestamp = parseInt(timestamp, 10);
      const currentTimestamp = Math.floor(Date.now() / 1000);

      if (Math.abs(currentTimestamp - requestTimestamp) > 300) {
        this.logger.warn(
          `Slack webhook timestamp too old. Current: ${currentTimestamp}, Request: ${requestTimestamp}`,
        );
        return false; // Older than 5 minutes
      }

      // Slack signature basestring: "v0:{timestamp}:{body}"
      const sigBasestring = `v0:${timestamp}:${body}`;

      // Compute expected signature
      const expectedSignature =
        'v0=' +
        crypto
          .createHmac('sha256', signingSecret)
          .update(sigBasestring)
          .digest('hex');

      // Timing-safe comparison
      const isValid = crypto.timingSafeEqual(
        Buffer.from(signature),
        Buffer.from(expectedSignature),
      );

      if (!isValid) {
        this.logger.warn('Slack webhook signature verification failed');
      }

      return isValid;
    } catch (error) {
      this.logger.error('Error verifying Slack signature:', error);
      return false;
    }
  }

  /**
   * Verifies Jira webhook signature.
   *
   * Jira uses a simple webhook secret that you configure.
   * The secret is sent in a custom header or as a query parameter.
   *
   * @param providedSecret - Secret from webhook request
   * @param configuredSecret - Secret configured in Jira webhook settings
   * @returns true if secrets match
   */
  verifyJiraWebhook(providedSecret: string, configuredSecret: string): boolean {
    if (!providedSecret || !configuredSecret) {
      this.logger.warn('Missing secret for Jira webhook');
      return false;
    }

    try {
      // Timing-safe comparison
      const isValid = crypto.timingSafeEqual(
        Buffer.from(providedSecret),
        Buffer.from(configuredSecret),
      );

      if (!isValid) {
        this.logger.warn('Jira webhook secret verification failed');
      }

      return isValid;
    } catch (error) {
      this.logger.error('Error verifying Jira webhook:', error);
      return false;
    }
  }

  /**
   * Verifies Trello webhook signature.
   *
   * Trello uses HMAC-SHA1 with the webhook callback URL + request body.
   * Signature is sent in X-Trello-Webhook header as base64.
   *
   * @param body - Raw request body as string
   * @param callbackUrl - Your webhook callback URL
   * @param signature - X-Trello-Webhook header value (base64)
   * @param secret - Trello webhook secret
   * @returns true if signature is valid
   *
   * @see https://developer.atlassian.com/cloud/trello/guides/rest-api/webhooks/
   */
  verifyTrelloSignature(
    body: string,
    callbackUrl: string,
    signature: string,
    secret: string,
  ): boolean {
    if (!signature || !secret || !body || !callbackUrl) {
      this.logger.warn(
        'Missing signature, secret, body, or callback URL for Trello webhook',
      );
      return false;
    }

    try {
      // Trello uses: HMAC-SHA1(body + callbackUrl, secret)
      const content = body + callbackUrl;
      const expectedSignature = crypto
        .createHmac('sha1', secret)
        .update(content)
        .digest('base64');

      // Timing-safe comparison
      const isValid = crypto.timingSafeEqual(
        Buffer.from(signature),
        Buffer.from(expectedSignature),
      );

      if (!isValid) {
        this.logger.warn('Trello webhook signature verification failed');
      }

      return isValid;
    } catch (error) {
      this.logger.error('Error verifying Trello signature:', error);
      return false;
    }
  }

  /**
   * Throws UnauthorizedException if signature verification fails.
   * Helper method for controllers.
   */
  requireValidSignature(isValid: boolean, provider: string): void {
    if (!isValid) {
      throw new UnauthorizedException(
        `Invalid ${provider} webhook signature. ` +
          'This could indicate a forged webhook or misconfigured secret.',
      );
    }
  }
}
