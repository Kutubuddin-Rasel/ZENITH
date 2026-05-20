/**
 * Parse a duration string (e.g. `'15m'`, `'7d'`, `'1h'`) into seconds.
 *
 * Required for `@nestjs/jwt` v11 which expects `expiresIn` as a number
 * (seconds) and for lockout-policy configuration.
 *
 * Supported units:
 *   - `s` seconds  (`'30s'` → 30)
 *   - `m` minutes  (`'15m'` → 900)
 *   - `h` hours    (`'1h'`  → 3600)
 *   - `d` days     (`'7d'`  → 604800)
 *
 * Falls back to `900` (15m) when the input cannot be parsed.
 */
export function parseDurationToSeconds(duration: string): number {
  const match = duration.match(/^(\d+)(s|m|h|d)$/i);
  if (!match) {
    const num = parseInt(duration, 10);
    return isNaN(num) ? 900 : num;
  }

  const value = parseInt(match[1], 10);
  const unit = match[2].toLowerCase();

  switch (unit) {
    case 's':
      return value;
    case 'm':
      return value * 60;
    case 'h':
      return value * 60 * 60;
    case 'd':
      return value * 60 * 60 * 24;
    default:
      return 900;
  }
}
