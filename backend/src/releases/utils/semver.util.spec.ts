// src/releases/utils/semver.util.spec.ts
import {
  parseVersion,
  compareVersions,
  bumpVersion,
  formatVersion,
  maxVersionName,
} from './semver.util';

describe('semver.util', () => {
  describe('parseVersion', () => {
    it('parses a plain semver', () => {
      expect(parseVersion('1.2.3')).toEqual({ major: 1, minor: 2, patch: 3 });
    });

    it('parses a v-prefixed semver', () => {
      expect(parseVersion('v10.0.5')).toEqual({
        major: 10,
        minor: 0,
        patch: 5,
      });
    });

    it('captures the prerelease tag without the leading dash', () => {
      expect(parseVersion('v1.2.3-beta.1')).toEqual({
        major: 1,
        minor: 2,
        patch: 3,
        prerelease: 'beta.1',
      });
    });

    it('returns null for non-semver strings', () => {
      expect(parseVersion('latest')).toBeNull();
      expect(parseVersion('1.2')).toBeNull();
      expect(parseVersion('v1.2.3.4')).toBeNull();
      expect(parseVersion('')).toBeNull();
    });
  });

  describe('compareVersions (ascending, prerelease-agnostic)', () => {
    const sv = (s: string) => parseVersion(s)!;

    it('orders by major then minor then patch', () => {
      expect(compareVersions(sv('1.0.0'), sv('2.0.0'))).toBeLessThan(0);
      expect(compareVersions(sv('1.2.0'), sv('1.1.9'))).toBeGreaterThan(0);
      expect(compareVersions(sv('1.1.1'), sv('1.1.2'))).toBeLessThan(0);
    });

    it('treats equal core versions as equal regardless of prerelease', () => {
      expect(compareVersions(sv('1.0.0-rc.1'), sv('1.0.0'))).toBe(0);
    });
  });

  describe('bumpVersion', () => {
    const base = { major: 1, minor: 2, patch: 3 };

    it('bumps major and resets minor/patch', () => {
      expect(bumpVersion(base, 'major')).toEqual({
        major: 2,
        minor: 0,
        patch: 0,
      });
    });

    it('bumps minor and resets patch', () => {
      expect(bumpVersion(base, 'minor')).toEqual({
        major: 1,
        minor: 3,
        patch: 0,
      });
    });

    it('bumps patch only', () => {
      expect(bumpVersion(base, 'patch')).toEqual({
        major: 1,
        minor: 2,
        patch: 4,
      });
    });

    it('does not mutate the input', () => {
      bumpVersion(base, 'major');
      expect(base).toEqual({ major: 1, minor: 2, patch: 3 });
    });
  });

  describe('formatVersion', () => {
    it('renders v-prefixed core version, dropping prerelease', () => {
      expect(formatVersion({ major: 1, minor: 2, patch: 3 })).toBe('v1.2.3');
      expect(
        formatVersion({ major: 1, minor: 0, patch: 0, prerelease: 'beta' }),
      ).toBe('v1.0.0');
    });
  });

  describe('maxVersionName (O(n) single-pass)', () => {
    it('returns the original name string of the highest version', () => {
      expect(maxVersionName(['v1.0.0', 'v1.2.0', 'v1.1.5'])).toBe('v1.2.0');
    });

    it('ignores unparseable entries', () => {
      expect(maxVersionName(['latest', 'v2.0.0', 'nightly'])).toBe('v2.0.0');
    });

    it('returns null when no parseable versions exist', () => {
      expect(maxVersionName(['latest', 'nightly'])).toBeNull();
      expect(maxVersionName([])).toBeNull();
    });

    it('preserves the exact original string (incl. non-v form)', () => {
      expect(maxVersionName(['1.0.0', '0.9.9'])).toBe('1.0.0');
    });
  });
});
