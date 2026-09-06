// src/email/utils/subject-line.util.ts

/**
 * Sanitises interpolated text for use in an email Subject header.
 *
 * ⚠️ DELIBERATE BEHAVIOUR CHANGE from the `escapeSubject` this replaces.
 *
 * The old helper HTML-escaped the subject (`&` → `&amp;`, `<` → `&lt;`, …).
 * That was wrong in both directions:
 *
 *   - It escaped the wrong context. A subject is a plain-text header in a JSON
 *     API payload, never parsed as HTML — so an org literally named "Barnes &
 *     Noble" was delivered to inboxes as "Barnes &amp; Noble". Visible mojibake
 *     on every affected email.
 *   - It missed the actual threat. The real subject-line attack is HEADER
 *     INJECTION: a CR or LF in interpolated text can terminate the header and
 *     append attacker-controlled ones (Bcc:, Content-Type:). HTML entities do
 *     nothing about that; the old function passed newlines straight through.
 *
 * So this drops the control characters that can break out of a header and
 * leaves ordinary punctuation alone. Handlebars still auto-escapes the HTML
 * BODY — that context genuinely needs it; this one never did.
 *
 * Also collapses whitespace runs and trims: a tab or doubled space in a subject
 * renders inconsistently across clients.
 *
 * Implemented as a code-point scan rather than a regex character class so the
 * control range stays readable in source — a `/[\x00-\x1F]/` literal puts
 * invisible bytes in the file.
 */
export function sanitizeSubject(input: string): string {
  let out = '';

  for (const char of input) {
    const code = char.codePointAt(0) ?? 0;

    // CR / LF — the header-injection vector. Fold to a space rather than drop,
    // so "Line one\nLine two" stays two words instead of becoming "oneLine".
    if (code === 0x0a || code === 0x0d) {
      out += ' ';
      continue;
    }

    // Remaining C0 controls and DEL: never legal in a header, never intended.
    if (code < 0x20 || code === 0x7f) continue;

    out += char;
  }

  return out.replace(/\s{2,}/g, ' ').trim();
}
