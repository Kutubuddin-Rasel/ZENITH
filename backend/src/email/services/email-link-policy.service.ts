// src/email/services/email-link-policy.service.ts
import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  isAllowedLink,
  resolveAllowedLinkDomains,
} from '../utils/link-policy.util';

/**
 * Enforces the outbound-link allowlist at composition time.
 *
 * Thin wrapper over the pure helpers in `utils/link-policy.util.ts` — its whole
 * job is to own the two environment reads (`ALLOWED_EMAIL_LINK_DOMAINS`,
 * `NODE_ENV`) in ONE place so the composers cannot drift onto different
 * policies, and so the policy itself stays unit-testable as pure functions.
 *
 * Domains are resolved once at construction: this runs on every email job, and
 * the allowlist cannot change without a restart anyway.
 */
@Injectable()
export class EmailLinkPolicy {
  private readonly logger = new Logger(EmailLinkPolicy.name);
  private readonly allowedDomains: readonly string[];
  private readonly requireHttps: boolean;

  constructor(private readonly configService: ConfigService) {
    this.allowedDomains = resolveAllowedLinkDomains(
      this.configService.get<string>('ALLOWED_EMAIL_LINK_DOMAINS'),
    );
    this.requireHttps = process.env.NODE_ENV === 'production';

    this.logger.log(
      `Outbound email links restricted to: ${this.allowedDomains.join(', ')}` +
        `${this.requireHttps ? ' (HTTPS required)' : ''}`,
    );
  }

  /**
   * @returns the URL unchanged when it passes policy.
   * @throws Error when it does not — the throw aborts the job, and BullMQ
   *   retries it. Retries will fail identically (the policy is deterministic),
   *   so the job lands in the failed set rather than delivering a bad link.
   *   Failing loudly beats emailing a link to an unvetted domain.
   */
  assertAllowed(url: string): string {
    if (!isAllowedLink(url, this.allowedDomains, this.requireHttps)) {
      // Do not log the URL itself — it carries invite/recovery tokens.
      this.logger.error('Email blocked — link failed outbound domain policy');
      throw new Error('Invalid link domain');
    }
    return url;
  }
}
