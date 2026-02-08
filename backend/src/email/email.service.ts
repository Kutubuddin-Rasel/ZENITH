import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Resend } from 'resend';

// =============================================================================
// HTML ESCAPE UTILITY
// Using inline implementation to avoid module resolution issues with escape-html
// Based on OWASP recommendations for HTML entity encoding
// =============================================================================

/**
 * Escapes HTML special characters to prevent XSS and HTML injection attacks.
 * Converts: & < > " ' to their corresponding HTML entities.
 */
function escapeHtml(input: string): string {
  return input
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

// ============================================================================
// TYPE DEFINITIONS
// ============================================================================

/** Error response structure from Resend API */
interface ResendError {
  message: string;
  name?: string;
}

/** Success response structure from Resend API */
interface ResendResponse {
  data: { id: string } | null;
  error: ResendError | null;
}

// ============================================================================
// EMAIL SERVICE - Phase 1 Remediation: HTML Injection Prevention
// ============================================================================

/**
 * EmailService handles all outbound email communications.
 *
 * SECURITY NOTES:
 * - ALL user-provided content MUST be sanitized via `sanitize()` before HTML interpolation
 * - URLs must be validated against allowed domains before use in href attributes
 * - This prevents HTML/CSS injection attacks that could create phishing content
 *
 * @see OWASP XSS Prevention Cheat Sheet
 */
@Injectable()
export class EmailService {
  private resend: Resend | null = null;
  private readonly logger = new Logger(EmailService.name);
  private readonly fromEmail: string;

  constructor(private configService: ConfigService) {
    const apiKey = this.configService.get<string>('RESEND_API_KEY');
    if (apiKey) {
      this.resend = new Resend(apiKey);
    } else {
      this.logger.warn(
        'RESEND_API_KEY is not defined. Emails will be logged to console only.',
      );
    }
    this.fromEmail =
      this.configService.get<string>('EMAIL_FROM') || 'onboarding@resend.dev';
  }

  // ==========================================================================
  // SECURITY: HTML SANITIZATION
  // ==========================================================================

  /**
   * Sanitizes user-provided input to prevent HTML/CSS injection.
   *
   * Encodes special HTML characters:
   * - `<` → `&lt;`   (prevents tag opening)
   * - `>` → `&gt;`   (prevents tag closing)
   * - `&` → `&amp;`  (prevents entity injection)
   * - `"` → `&quot;` (prevents attribute breakout)
   * - `'` → `&#39;`  (prevents attribute breakout)
   *
   * @param input - The untrusted user input to sanitize
   * @returns Sanitized string safe for HTML interpolation, empty string for null/undefined
   *
   * @example
   * sanitize('<script>alert("xss")</script>')
   * // Returns: '&lt;script&gt;alert(&quot;xss&quot;)&lt;/script&gt;'
   */
  private sanitize(input: string | null | undefined): string {
    if (input === null || input === undefined) {
      return '';
    }
    return escapeHtml(String(input));
  }

  /**
   * Validates that a URL belongs to an allowed domain.
   * Prevents attackers from injecting arbitrary URLs in href attributes.
   *
   * @param url - The URL to validate
   * @param allowedDomains - List of permitted hostnames
   * @returns The original URL if valid, empty string otherwise
   */
  private validateUrl(url: string, allowedDomains: string[]): string {
    try {
      const parsed = new URL(url);
      const isAllowed = allowedDomains.some(
        (domain) =>
          parsed.hostname === domain || parsed.hostname.endsWith(`.${domain}`),
      );

      if (!isAllowed) {
        this.logger.warn(
          `URL validation failed: ${parsed.hostname} not in allowed domains`,
        );
        return '';
      }

      // Only allow https in production
      if (
        process.env.NODE_ENV === 'production' &&
        parsed.protocol !== 'https:'
      ) {
        this.logger.warn(`URL validation failed: non-HTTPS URL in production`);
        return '';
      }

      return url;
    } catch {
      this.logger.warn(`URL validation failed: invalid URL format`);
      return '';
    }
  }

  // ==========================================================================
  // EMAIL SENDING METHODS
  // ==========================================================================

  /**
   * Sends an organization invitation email.
   *
   * SECURITY: All user-provided content is sanitized before HTML interpolation
   * to prevent HTML/CSS injection attacks (phishing, fake buttons, etc.)
   *
   * @param to - Recipient email address
   * @param inviteLink - The invitation acceptance URL (must be from allowed domain)
   * @param inviterName - Name of the person sending the invite (user-controlled, sanitized)
   * @param orgName - Organization name (user-controlled, sanitized)
   */
  async sendInvitationEmail(
    to: string,
    inviteLink: string,
    inviterName: string,
    orgName: string,
  ): Promise<void> {
    // ========================================================================
    // SECURITY: Sanitize ALL user-provided content before HTML interpolation
    // ========================================================================
    const safeInviterName = this.sanitize(inviterName);
    const safeOrgName = this.sanitize(orgName);
    const safeToDisplay = this.sanitize(to); // For logging only

    // Validate invite link is from our domain
    const allowedDomains = this.getAllowedLinkDomains();
    const safeInviteLink = this.validateUrl(inviteLink, allowedDomains);

    if (!safeInviteLink) {
      this.logger.error(
        `Invitation email blocked: invalid invite link for ${safeToDisplay}`,
      );
      throw new Error('Invalid invitation link domain');
    }

    // Sanitize the invite link for display text (visible in email)
    const safeInviteLinkDisplay = this.sanitize(inviteLink);

    // ========================================================================
    // Email composition with sanitized content
    // ========================================================================

    if (!this.resend) {
      this.logger.log(
        `[MOCK EMAIL] To: ${safeToDisplay}, Link: ${safeInviteLinkDisplay}`,
      );
      return;
    }

    try {
      const response = (await this.resend.emails.send({
        from: this.fromEmail,
        to: [to],
        // Subject also uses sanitized orgName to prevent header injection
        subject: `You've been invited to join ${safeOrgName} on Zenith`,
        html: this.buildInvitationHtml(
          safeInviterName,
          safeOrgName,
          safeInviteLink,
          safeInviteLinkDisplay,
        ),
      })) as ResendResponse;

      const { data, error } = response;

      if (error) {
        this.logger.error(
          `Failed to send email to ${safeToDisplay}: ${error.message}`,
        );
        // Fallback to console log in dev/testing if email fails
        if (process.env.NODE_ENV !== 'production') {
          this.logger.log(
            `[FALLBACK EMAIL LOG] To: ${safeToDisplay}, Link: ${safeInviteLinkDisplay}`,
          );
        }
        throw new Error(error.message);
      }

      if (data) {
        this.logger.log(`Email sent to ${safeToDisplay}, ID: ${data.id}`);
      }
    } catch (err) {
      const error = err as Error;
      this.logger.error(`Error sending email: ${error.message}`);
      // Fallback to console log in dev/testing if email fails
      if (process.env.NODE_ENV !== 'production') {
        this.logger.log(
          `[FALLBACK EMAIL LOG] To: ${safeToDisplay}, Link: ${safeInviteLinkDisplay}`,
        );
      }
    }
  }

  // ==========================================================================
  // PRIVATE HELPERS
  // ==========================================================================

  /**
   * Builds the HTML body for invitation emails.
   * All parameters MUST be pre-sanitized before calling this method.
   *
   * @param safeInviterName - Sanitized inviter name
   * @param safeOrgName - Sanitized organization name
   * @param safeInviteLink - Validated invite link URL
   * @param safeInviteLinkDisplay - Sanitized invite link for display
   */
  private buildInvitationHtml(
    safeInviterName: string,
    safeOrgName: string,
    safeInviteLink: string,
    safeInviteLinkDisplay: string,
  ): string {
    return `
      <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto;">
        <h2>You've been invited!</h2>
        <p><strong>${safeInviterName}</strong> has invited you to join <strong>${safeOrgName}</strong> on Zenith.</p>
        <p>Click the button below to accept the invitation:</p>
        <a href="${safeInviteLink}" style="display: inline-block; background-color: #2563eb; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; font-weight: bold;">Accept Invitation</a>
        <p style="margin-top: 24px; font-size: 14px; color: #666;">
          Or copy and paste this link into your browser:<br>
          <a href="${safeInviteLink}">${safeInviteLinkDisplay}</a>
        </p>
      </div>
    `;
  }

  /**
   * Returns the list of allowed domains for invitation links.
   * Links to other domains will be rejected to prevent phishing.
   */
  private getAllowedLinkDomains(): string[] {
    const configuredDomains = this.configService.get<string>(
      'ALLOWED_EMAIL_LINK_DOMAINS',
    );

    if (configuredDomains) {
      return configuredDomains.split(',').map((d) => d.trim());
    }

    // Default allowed domains (development + common deployment patterns)
    return [
      'localhost',
      '127.0.0.1',
      // Add your production domain here, e.g., 'zenith.app', 'app.zenith.com'
    ];
  }
}
