import { TimeWindow, TimeOfDay } from './time-window';

function t(hours: number, minutes: number): TimeOfDay {
  return { hours, minutes };
}

describe('TimeWindow', () => {
  it('is always open when both bounds are missing', () => {
    const window = TimeWindow.of(undefined, undefined);
    expect(window.contains(t(0, 0))).toBe(true);
    expect(window.contains(t(23, 59))).toBe(true);
  });

  describe('same-day window (18:00-21:00)', () => {
    const window = TimeWindow.of(t(18, 0), t(21, 0));

    it.each([
      ['before start (15:00)', t(15, 0), false],
      ['at start (18:00)', t(18, 0), true],
      ['inside (19:30)', t(19, 30), true],
      ['at end (21:00)', t(21, 0), true],
      ['after end (21:01)', t(21, 1), false],
    ])('%s -> %s', (_label, at, expected) => {
      expect(window.contains(at as TimeOfDay)).toBe(expected);
    });
  });

  // QA #7: a programme with only a start time used to run 24/7, so one set to
  // 18:00 discounted a 09:00 sale. Each bound now constrains on its own.
  describe('start only (18:00, no end) — from then until end of day', () => {
    const window = TimeWindow.of(t(18, 0), undefined);

    it.each([
      ['09:00 (the QA case)', t(9, 0), false],
      ['17:59 (just before start)', t(17, 59), false],
      ['18:00 (at start)', t(18, 0), true],
      ['19:00 (after start)', t(19, 0), true],
      ['23:59 (end of day)', t(23, 59), true],
      ['00:00 (next day, before start)', t(0, 0), false],
    ])('%s -> %s', (_label, at, expected) => {
      expect(window.contains(at as TimeOfDay)).toBe(expected);
    });
  });

  describe('end only (12:00, no start) — from start of day until then', () => {
    const window = TimeWindow.of(undefined, t(12, 0));

    it.each([
      ['00:00 (start of day)', t(0, 0), true],
      ['09:00', t(9, 0), true],
      ['12:00 (at end)', t(12, 0), true],
      ['12:01 (just after end)', t(12, 1), false],
      ['14:00', t(14, 0), false],
    ])('%s -> %s', (_label, at, expected) => {
      expect(window.contains(at as TimeOfDay)).toBe(expected);
    });
  });

  describe('overnight window spanning midnight (22:00-02:00)', () => {
    const window = TimeWindow.of(t(22, 0), t(2, 0));

    it.each([
      ['23:30', t(23, 30), true],
      ['01:00', t(1, 0), true],
      ['22:00 (start)', t(22, 0), true],
      ['02:00 (end)', t(2, 0), true],
      ['12:00 (outside)', t(12, 0), false],
      ['02:01 (just after end)', t(2, 1), false],
      ['21:59 (just before start)', t(21, 59), false],
    ])('%s -> %s', (_label, at, expected) => {
      expect(window.contains(at as TimeOfDay)).toBe(expected);
    });
  });
});
