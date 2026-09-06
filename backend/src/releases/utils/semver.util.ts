// src/releases/utils/semver.util.ts
//
// Pure, side-effect-free semver helpers extracted from the `ReleasesService`
// god class. No `this`, no I/O — trivially unit-testable (see spec). The
// ordering is intentionally prerelease-agnostic to preserve the exact behaviour
// of the legacy `getLatestVersion`/`suggestNextVersion` paths.

export interface SemVer {
  major: number;
  minor: number;
  patch: number;
  prerelease?: string;
}

export type BumpType = 'major' | 'minor' | 'patch';

const SEMVER_RE = /^v?(\d+)\.(\d+)\.(\d+)(-[a-zA-Z0-9.]+)?$/;

/** Parse a semver string (optionally `v`-prefixed). Returns null if invalid. */
export function parseVersion(version: string): SemVer | null {
  const match = version.match(SEMVER_RE);
  if (!match) return null;
  return {
    major: parseInt(match[1], 10),
    minor: parseInt(match[2], 10),
    patch: parseInt(match[3], 10),
    prerelease: match[4]?.substring(1), // strip leading dash
  };
}

/**
 * Ascending comparator over the core (major, minor, patch) triple. Prerelease
 * is deliberately ignored — matching the legacy sort, which ranked only the
 * core version. Returns <0 if a<b, >0 if a>b, 0 if core-equal.
 */
export function compareVersions(a: SemVer, b: SemVer): number {
  if (a.major !== b.major) return a.major - b.major;
  if (a.minor !== b.minor) return a.minor - b.minor;
  return a.patch - b.patch;
}

/** Return a NEW SemVer bumped by the given type (input is not mutated). */
export function bumpVersion(version: SemVer, bump: BumpType): SemVer {
  switch (bump) {
    case 'major':
      return { major: version.major + 1, minor: 0, patch: 0 };
    case 'minor':
      return { major: version.major, minor: version.minor + 1, patch: 0 };
    case 'patch':
      return {
        major: version.major,
        minor: version.minor,
        patch: version.patch + 1,
      };
  }
}

/** Render the canonical `v<major>.<minor>.<patch>` (drops prerelease). */
export function formatVersion(version: SemVer): string {
  return `v${version.major}.${version.minor}.${version.patch}`;
}

/**
 * Single-pass O(n) max over a list of release names. Unparseable entries are
 * skipped. Returns the ORIGINAL name string of the highest version (preserving
 * its exact form, `v`-prefixed or not), or null if none parse.
 *
 * Replaces the god class's `.map().filter().sort()` (O(n log n) + a full extra
 * `findAll()`); pairs with the repository's projected `findVersionNames`.
 */
export function maxVersionName(names: string[]): string | null {
  let bestName: string | null = null;
  let bestParsed: SemVer | null = null;
  for (const name of names) {
    const parsed = parseVersion(name);
    if (!parsed) continue;
    if (bestParsed === null || compareVersions(parsed, bestParsed) > 0) {
      bestParsed = parsed;
      bestName = name;
    }
  }
  return bestName;
}
