/**
 * ISO-8601 week-of-year identifier.
 *
 * Extracted from `ScheduledReportsCronService` (Step 3) for two reasons:
 *  1. SRP — date math is a pure function, not a cron responsibility.
 *  2. Testability — the deterministic BullMQ dedup job-id
 *     (`scheduled-report:{proj}:{year}-W{week}:{fmt}`) hinges on this being
 *     correct at year boundaries, so it must be unit-tested in isolation.
 *
 * The legacy implementation used
 * `Math.ceil((dayOfYear + jan1.getDay()) / 7)` keyed to the *calendar* year —
 * which is NOT ISO-8601 and drifts at the turn of the year (e.g. 2021-01-01
 * belongs to ISO week 53 of 2020, not week 1 of 2021). That miscount produced
 * two different job-ids for the same logical week, defeating deduplication.
 *
 * This is the canonical ISO-8601 algorithm (the "Thursday rule"): the week-year
 * of a date is the year that owns the Thursday of that date's week, and week 1
 * is the week containing the first Thursday of January. All arithmetic is in
 * UTC so the result never shifts with the host timezone or DST.
 */
export function getISOWeekIdentifier(date: Date = new Date()): string {
  // Normalise to a UTC midnight anchor — strips local time / DST.
  const anchor = new Date(
    Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()),
  );

  // ISO weekday: Monday = 1 … Sunday = 7 (JS Sunday = 0 → 7).
  const isoWeekday = anchor.getUTCDay() || 7;

  // Shift the anchor to the Thursday of its week; that Thursday's year is the
  // ISO week-year, and the week index is measured from that year's Jan 1.
  anchor.setUTCDate(anchor.getUTCDate() + 4 - isoWeekday);

  const isoYear = anchor.getUTCFullYear();
  const yearStart = new Date(Date.UTC(isoYear, 0, 1));
  const dayOfYear = (anchor.getTime() - yearStart.getTime()) / 86_400_000; // ms/day
  const weekNumber = Math.ceil((dayOfYear + 1) / 7);

  return `${isoYear}-W${String(weekNumber).padStart(2, '0')}`;
}
