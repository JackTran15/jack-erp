import { TimePartition } from './export.types';

/**
 * Split `[from, to]` into `count` equal windows, ordered newest → oldest.
 *
 * Windows are half-open `[from, to)` so they tile without overlap — a row on a
 * boundary belongs to exactly one of them. The newest window's `to` is the
 * original `to` plus a millisecond, so the caller's inclusive end is covered
 * without any window overlapping its neighbour.
 *
 * A missing bound means the range is open-ended and cannot be divided: one
 * window comes back, and keyset pagination carries the export on its own.
 */
export function splitIntoWindows(
  from: Date | string | number | undefined | null,
  to: Date | string | number | undefined | null,
  count: number,
): TimePartition[] {
  if (from == null || to == null) {
    return [
      {
        from: from == null ? undefined : new Date(from),
        to: to == null ? undefined : new Date(to),
      },
    ];
  }

  const fromMs = new Date(from).getTime();
  const toMs = new Date(to).getTime();
  const windows = Math.max(1, Math.floor(count));

  // An unparseable or inverted range is the caller's problem to report, not
  // this function's to guess at: hand back the range as one window.
  if (!Number.isFinite(fromMs) || !Number.isFinite(toMs) || toMs < fromMs) {
    return [{ from: new Date(from), to: new Date(to) }];
  }

  const endMs = toMs + 1;
  const spanMs = endMs - fromMs;

  const boundaries: number[] = [];
  for (let i = 0; i <= windows; i++) {
    boundaries.push(Math.round(fromMs + (spanMs * i) / windows));
  }
  // Rounding must never move the outer edges — those are the caller's range.
  boundaries[0] = fromMs;
  boundaries[windows] = endMs;

  const result: TimePartition[] = [];
  for (let i = windows - 1; i >= 0; i--) {
    result.push({ from: new Date(boundaries[i]), to: new Date(boundaries[i + 1]) });
  }
  return result;
}
