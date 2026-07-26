import { toIsoDate } from './date-format.util';

describe('toIsoDate', () => {
  it('returns undefined for undefined/null', () => {
    expect(toIsoDate(undefined)).toBeUndefined();
    expect(toIsoDate(null)).toBeUndefined();
  });

  it('passes a raw TypeORM date-column string through unchanged', () => {
    // toSummary() reads `date`-column values straight off a TypeORM entity,
    // which TypeORM returns as a plain 'YYYY-MM-DD' string — already the
    // exact wire format, so no Date getters are ever applied to it.
    expect(toIsoDate('2026-01-01')).toBe('2026-01-01');
  });

  it('formats a local-midnight Date via local getters, not UTC (regression: previously off by one day in UTC+ timezones)', () => {
    // A real Date sourced from promotion.mapper.ts's toDomainDate() (local
    // components) or a timestamptz column. `.toISOString().slice(0, 10)`
    // would shift this to '2025-12-31' in a UTC+7 environment.
    expect(toIsoDate(new Date(2026, 0, 1))).toBe('2026-01-01');
    expect(toIsoDate(new Date(2026, 11, 31))).toBe('2026-12-31');
  });
});
