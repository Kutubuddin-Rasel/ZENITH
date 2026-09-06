// src/email/utils/link-policy.util.ts
//
// ============================================================================
// OUTBOUND LINK POLICY — pure functions, no DI, no I/O.
//
// Lifted out of `EmailProcessor`'s private methods. The logic is unchanged; the
// only difference is that the environment reads (`ALLOWED_EMAIL_LINK_DOMAINS`,
// `NODE_ENV`) are now the CALLER's job, which is what makes this testable.
//
// THREAT MODEL: every link we email is attacker-influenced somewhere upstream
// (an invite link derives from FRONTEND_URL, a recovery link from a token
// service). If any of those were ever poisoned, we would be sending our users a
// phishing link signed with our sending domain's reputation. The allowlist is
// the last gate before that leaves the building.
// ============================================================================

/** Domains permitted when `ALLOWED_EMAIL_LINK_DOMAINS` is unset. */
export const DEFAULT_ALLOWED_LINK_DOMAINS: readonly string[] = [
  'localhost',
  '127.0.0.1',
];

/**
 * Parses the `ALLOWED_EMAIL_LINK_DOMAINS` config value.
 *
 * @param configured Comma-separated domain list, or undefined.
 * @returns Trimmed domains, or the dev-safe defaults when unset/blank.
 */
export function resolveAllowedLinkDomains(
  configured: string | undefined,
): readonly string[] {
  if (!configured) return DEFAULT_ALLOWED_LINK_DOMAINS;

  const domains = configured
    .split(',')
    .map((d) => d.trim())
    .filter((d) => d.length > 0);

  return domains.length > 0 ? domains : DEFAULT_ALLOWED_LINK_DOMAINS;
}

/**
 * Whether `url` may be embedded in an outgoing email.
 *
 * A URL passes when it parses, its hostname matches an allowed domain exactly
 * or as a subdomain of one, and — when `requireHttps` — it is served over TLS.
 *
 * @param url            Candidate URL.
 * @param allowedDomains Output of {@link resolveAllowedLinkDomains}.
 * @param requireHttps   Pass `true` in production; plain HTTP is tolerated in
 *                       dev so `http://localhost:3000` links still work.
 */
export function isAllowedLink(
  url: string,
  allowedDomains: readonly string[],
  requireHttps: boolean,
): boolean {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return false;
  }

  const hostAllowed = allowedDomains.some(
    (domain) =>
      parsed.hostname === domain || parsed.hostname.endsWith(`.${domain}`),
  );
  if (!hostAllowed) return false;

  return !requireHttps || parsed.protocol === 'https:';
}
