import { getISOWeekIdentifier } from './iso-week.util';

/**
 * ISO-8601 week-of-year — the correctness the BullMQ dedup job-id depends on.
 * The cases below are exactly the year-boundary situations the legacy
 * `Math.ceil((dayOfYear + jan1.getDay()) / 7)` got wrong.
 */
describe('getISOWeekIdentifier', () => {
  const cases: ReadonlyArray<readonly [string, string]> = [
    // 2026-01-01 is a Thursday → unambiguously week 1 of its own year.
    ['2026-01-01', '2026-W01'],
    // 2021-01-01 is a Friday → belongs to ISO week 53 of 2020 (week-year rolls back).
    ['2021-01-01', '2020-W53'],
    // 2020-12-31 is a Thursday → last week of 2020.
    ['2020-12-31', '2020-W53'],
    // 2024-12-30 is a Monday whose Thursday (2025-01-02) is in 2025 → week 1 of 2025.
    ['2024-12-30', '2025-W01'],
    // 2023-01-01 is a Sunday → tail of ISO week 52 of 2022.
    ['2023-01-01', '2022-W52'],
    // Mid-year sanity check.
    ['2026-06-03', '2026-W23'],
  ];

  it.each(cases)('maps %s → %s', (input, expected) => {
    // Anchor at UTC noon so the local-midnight normalisation cannot drift.
    const date = new Date(`${input}T12:00:00Z`);
    expect(getISOWeekIdentifier(date)).toBe(expected);
  });

  it('defaults to the current date without throwing', () => {
    expect(getISOWeekIdentifier()).toMatch(/^\d{4}-W\d{2}$/);
  });
});
