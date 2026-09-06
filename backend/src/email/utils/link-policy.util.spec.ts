import {
  DEFAULT_ALLOWED_LINK_DOMAINS,
  isAllowedLink,
  resolveAllowedLinkDomains,
} from './link-policy.util';

/**
 * These assertions previously had no home: the logic lived in private methods
 * on `EmailProcessor`, which could not be instantiated without a Resend client.
 * Extracting it to pure functions is what made this file possible.
 */
describe('link-policy.util', () => {
  describe('resolveAllowedLinkDomains', () => {
    it('falls back to the dev defaults when unset', () => {
      expect(resolveAllowedLinkDomains(undefined)).toEqual(
        DEFAULT_ALLOWED_LINK_DOMAINS,
      );
    });

    it('falls back when the value is blank or only separators', () => {
      expect(resolveAllowedLinkDomains('')).toEqual(
        DEFAULT_ALLOWED_LINK_DOMAINS,
      );
      expect(resolveAllowedLinkDomains(' , , ')).toEqual(
        DEFAULT_ALLOWED_LINK_DOMAINS,
      );
    });

    it('splits and trims a comma-separated list', () => {
      expect(resolveAllowedLinkDomains('zenith.dev, app.zenith.dev')).toEqual([
        'zenith.dev',
        'app.zenith.dev',
      ]);
    });
  });

  describe('isAllowedLink', () => {
    const allowed = ['zenith.dev'];

    it('accepts an exact host match', () => {
      expect(
        isAllowedLink('https://zenith.dev/invite/abc', allowed, true),
      ).toBe(true);
    });

    it('accepts a subdomain of an allowed domain', () => {
      expect(
        isAllowedLink('https://app.zenith.dev/invite/abc', allowed, true),
      ).toBe(true);
    });

    it('rejects an unrelated host', () => {
      expect(isAllowedLink('https://evil.com/invite', allowed, true)).toBe(
        false,
      );
    });

    it('rejects a look-alike suffix that is not a subdomain', () => {
      // The guard is `endsWith('.zenith.dev')`, so "notzenith.dev" must fail —
      // this is the classic allowlist bypass and the reason for the dot.
      expect(isAllowedLink('https://notzenith.dev/x', allowed, true)).toBe(
        false,
      );
    });

    it('rejects plain HTTP when HTTPS is required', () => {
      expect(isAllowedLink('http://zenith.dev/x', allowed, true)).toBe(false);
    });

    it('permits plain HTTP when HTTPS is not required (dev)', () => {
      expect(
        isAllowedLink('http://localhost:3000/x', ['localhost'], false),
      ).toBe(true);
    });

    it('rejects a malformed URL instead of throwing', () => {
      expect(isAllowedLink('not-a-url', allowed, false)).toBe(false);
      expect(isAllowedLink('', allowed, false)).toBe(false);
    });

    it('rejects a javascript: URL even on an allowed-looking host', () => {
      expect(isAllowedLink('javascript:alert(1)', allowed, false)).toBe(false);
    });
  });
});
