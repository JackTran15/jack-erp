import { DateWindow } from './date-window';

// Local-constructor dates (year, monthIndex, day) — avoids the UTC-parsing
// pitfall of ISO date strings, so these assertions hold regardless of the
// host machine's timezone.
function d(year: number, month: number, day: number): Date {
  return new Date(year, month - 1, day);
}

describe('DateWindow', () => {
  it('is always open when both bounds are null (BR-003)', () => {
    const window = DateWindow.of(undefined, undefined);
    expect(window.contains(d(2020, 1, 1))).toBe(true);
    expect(window.contains(d(2099, 12, 31))).toBe(true);
  });

  it('start null = unbounded start', () => {
    const window = DateWindow.of(undefined, d(2026, 6, 30));
    expect(window.contains(d(2000, 1, 1))).toBe(true);
    expect(window.contains(d(2026, 6, 30))).toBe(true);
    expect(window.contains(d(2026, 7, 1))).toBe(false);
  });

  it('end null = unbounded end', () => {
    const window = DateWindow.of(d(2026, 6, 1), undefined);
    expect(window.contains(d(2026, 5, 31))).toBe(false);
    expect(window.contains(d(2026, 6, 1))).toBe(true);
    expect(window.contains(d(2099, 1, 1))).toBe(true);
  });

  it('is inclusive of both bounds when both are set', () => {
    const window = DateWindow.of(d(2026, 6, 1), d(2026, 6, 30));
    expect(window.contains(d(2026, 6, 1))).toBe(true);
    expect(window.contains(d(2026, 6, 30))).toBe(true);
    expect(window.contains(d(2026, 5, 31))).toBe(false);
    expect(window.contains(d(2026, 7, 1))).toBe(false);
  });

  it('compares by calendar day only, ignoring time-of-day', () => {
    const window = DateWindow.of(d(2026, 6, 1), d(2026, 6, 1));
    const lateInTheDay = new Date(2026, 5, 1, 23, 59, 59);
    expect(window.contains(lateInTheDay)).toBe(true);
  });
});
