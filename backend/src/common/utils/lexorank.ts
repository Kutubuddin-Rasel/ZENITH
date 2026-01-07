/**
 * Lexorank Utility Functions
 *
 * Lexorank is a string-based ranking system that allows O(1) insertion
 * between any two items. Used by Jira, Trello, and Linear for drag & drop.
 *
 * Format: <bucket>|<rank>: (e.g., "0|hzzzzz:")
 * - bucket: 0, 1, or 2 (for rebalancing)
 * - rank: base-36 string that determines order
 * - suffix ":" is a separator for future extensions
 */

// Character set for lexorank (base-36)
const CHARS = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ';
const BASE = CHARS.length; // 36
const MID_CHAR = CHARS[Math.floor(BASE / 2)]; // 'I' (character 18)

/**
 * Calculate midpoint between two lexorank strings
 * Used for inserting an item between two existing items
 *
 * @example
 * calculateMidpoint("0|aaaaab:", "0|aaaaac:") -> "0|aaaaabI:"
 */
export function calculateMidpoint(before: string, after: string): string {
  // Extract rank parts (remove bucket prefix "0|" and suffix ":")
  const rankBefore = before.slice(2, -1);
  const rankAfter = after.slice(2, -1);

  // Pad to same length with '0' (lowest char)
  const maxLen = Math.max(rankBefore.length, rankAfter.length);
  const padded1 = rankBefore.padEnd(maxLen, '0');
  const padded2 = rankAfter.padEnd(maxLen, '0');

  // Find first differing character and calculate midpoint
  let result = '';
  for (let i = 0; i < maxLen; i++) {
    const c1 = CHARS.indexOf(padded1[i]);
    const c2 = CHARS.indexOf(padded2[i]);

    if (c1 === c2) {
      result += CHARS[c1];
      continue;
    }

    // Calculate midpoint between different characters
    const mid = Math.floor((c1 + c2) / 2);
    if (mid !== c1) {
      // There's room between chars - use midpoint
      result += CHARS[mid];
      return `0|${result}:`;
    }

    // No room (adjacent chars) - need to extend the string
    result += CHARS[c1];
    result += MID_CHAR;
    return `0|${result}:`;
  }

  // If we get here, strings are equal - append midpoint char
  return `0|${result}${MID_CHAR}:`;
}

/**
 * Generate rank before the first item in a list
 * Used when inserting at the beginning
 *
 * @example
 * generateRankBefore("0|aaaaaa:") -> "0|9zzzzz:" (before 'a' comes '9')
 */
export function generateRankBefore(first: string): string {
  const rank = first.slice(2, -1);
  const firstChar = rank[0];
  const idx = CHARS.indexOf(firstChar);

  if (idx > 0) {
    // Use character before the first char
    return `0|${CHARS[idx - 1]}${rank.slice(1)}:`;
  }

  // Already at '0' - prepend another '0' to extend
  return `0|0${rank}:`;
}

/**
 * Generate rank after the last item in a list
 * Used when inserting at the end
 *
 * @example
 * generateRankAfter("0|zzzzzz:") -> "0|zzzzzzI:"
 */
export function generateRankAfter(last: string): string {
  const rank = last.slice(2, -1);
  return `0|${rank}${MID_CHAR}:`;
}

/**
 * Generate a default rank for an empty list or first item
 */
export function generateDefaultRank(): string {
  return '0|hzzzzz:'; // Middle of alphabet for good distribution
}

/**
 * Convert a position number to a lexorank string
 * Used during migration to convert backlogOrder to lexorank
 *
 * @example
 * numberToLexorank(0)  -> "0|000000:"
 * numberToLexorank(1)  -> "0|000001:"
 * numberToLexorank(36) -> "0|000010:"
 */
export function numberToLexorank(num: number): string {
  let result = '';
  let n = num;

  // Generate 6-character base-36 representation
  for (let i = 0; i < 6; i++) {
    result = CHARS[n % BASE] + result;
    n = Math.floor(n / BASE);
  }

  return `0|${result}:`;
}

/**
 * Check if rebalancing is needed (string too long)
 * This is rare - approximately 1 in 10,000 operations
 */
export function needsRebalancing(rank: string): boolean {
  // If rank part (between | and :) exceeds 20 chars, suggest rebalance
  const rankPart = rank.slice(2, -1);
  return rankPart.length > 20;
}
