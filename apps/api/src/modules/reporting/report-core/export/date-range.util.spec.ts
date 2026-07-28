import { splitIntoWindows } from './date-range.util';

const iso = (d?: Date) => d?.toISOString();

describe('splitIntoWindows', () => {
  it('splits a range into equal half-open windows, newest first', () => {
    const windows = splitIntoWindows('2026-01-01T00:00:00.000Z', '2026-01-31T23:59:59.999Z', 4);

    expect(windows).toHaveLength(4);
    expect(iso(windows[0].from)).toBe('2026-01-24T06:00:00.000Z');
    expect(iso(windows[0].to)).toBe('2026-02-01T00:00:00.000Z');
    expect(iso(windows[3].from)).toBe('2026-01-01T00:00:00.000Z');
    expect(iso(windows[3].to)).toBe('2026-01-08T18:00:00.000Z');
  });

  it('tiles without gaps or overlap', () => {
    const windows = splitIntoWindows('2026-03-01', '2026-03-31', 7);

    // Ordered newest -> oldest, so each window starts exactly where the next
    // one ends. Any drift here means a row is exported twice or not at all.
    for (let i = 0; i < windows.length - 1; i++) {
      expect(iso(windows[i].from)).toBe(iso(windows[i + 1].to));
    }
  });

  it('covers the inclusive end of the caller range', () => {
    const to = new Date('2026-01-31T23:59:59.999Z');
    const windows = splitIntoWindows('2026-01-01T00:00:00.000Z', to, 3);

    // Half-open windows would drop the final millisecond without the +1.
    expect(windows[0].to!.getTime()).toBe(to.getTime() + 1);
  });

  it('keeps the outer edges exactly as given, despite rounding', () => {
    const from = new Date('2026-01-01T00:00:00.123Z');
    const to = new Date('2026-01-09T11:22:33.777Z');
    const windows = splitIntoWindows(from, to, 5);

    expect(windows[windows.length - 1].from!.getTime()).toBe(from.getTime());
    expect(windows[0].to!.getTime()).toBe(to.getTime() + 1);
  });

  it('returns one open window when a bound is missing', () => {
    expect(splitIntoWindows(undefined, '2026-01-31', 5)).toEqual([
      { from: undefined, to: new Date('2026-01-31') },
    ]);
    expect(splitIntoWindows('2026-01-01', null, 5)).toEqual([
      { from: new Date('2026-01-01'), to: undefined },
    ]);
    expect(splitIntoWindows(undefined, undefined, 5)).toEqual([
      { from: undefined, to: undefined },
    ]);
  });

  it('does not divide an inverted or unparseable range', () => {
    expect(splitIntoWindows('2026-01-31', '2026-01-01', 4)).toHaveLength(1);
    expect(splitIntoWindows('not a date', '2026-01-01', 4)).toHaveLength(1);
  });

  it('treats a count below one as one window', () => {
    expect(splitIntoWindows('2026-01-01', '2026-01-31', 0)).toHaveLength(1);
    expect(splitIntoWindows('2026-01-01', '2026-01-31', -3)).toHaveLength(1);
  });
});
