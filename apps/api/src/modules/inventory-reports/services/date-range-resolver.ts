import { BadRequestException } from '@nestjs/common';

export type PeriodPreset =
  | 'today'
  | 'this_week'
  | 'last_week'
  | 'this_month'
  | 'last_month'
  | 'this_quarter'
  | 'this_year'
  | 'custom';

export interface ResolvedPeriod {
  /** Inclusive lower bound — start of day UTC. */
  startDate: Date;
  /** Exclusive upper bound — start of day UTC of the day AFTER the period end. */
  endDate: Date;
}

export interface ResolvePeriodInput {
  preset?: PeriodPreset;
  /** ISO date `yyyy-MM-dd` — required when `preset = 'custom'`. */
  startDate?: string;
  /** ISO date `yyyy-MM-dd` — required when `preset = 'custom'`. */
  endDate?: string;
  /** Injectable clock; defaults to `new Date()`. */
  now?: Date;
}

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

/** Start of UTC day of the given Date. */
function startOfUtcDay(d: Date): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
}

/** Add `days` UTC days. */
function addUtcDays(d: Date, days: number): Date {
  return new Date(Date.UTC(
    d.getUTCFullYear(),
    d.getUTCMonth(),
    d.getUTCDate() + days,
  ));
}

/** Parse `yyyy-MM-dd` into UTC start-of-day. Throws on invalid input. */
function parseIsoDateUtc(value: string, field: string): Date {
  if (!ISO_DATE.test(value)) {
    throw new BadRequestException(
      `${field} phải có định dạng yyyy-MM-dd, nhận được: ${value}`,
    );
  }
  const [y, m, d] = value.split('-').map((n) => Number.parseInt(n, 10));
  const date = new Date(Date.UTC(y, m - 1, d));
  if (
    date.getUTCFullYear() !== y ||
    date.getUTCMonth() !== m - 1 ||
    date.getUTCDate() !== d
  ) {
    throw new BadRequestException(`${field} không hợp lệ: ${value}`);
  }
  return date;
}

/** Resolve a period preset (or custom range) into UTC start/end boundaries. */
export function resolvePeriod(input: ResolvePeriodInput): ResolvedPeriod {
  const now = input.now ?? new Date();
  const today = startOfUtcDay(now);

  // If no preset and no dates, default to this_month.
  // If user passed startDate+endDate without preset, treat as custom.
  let preset: PeriodPreset;
  if (input.preset) {
    preset = input.preset;
  } else if (input.startDate || input.endDate) {
    preset = 'custom';
  } else {
    preset = 'this_month';
  }

  switch (preset) {
    case 'today': {
      return { startDate: today, endDate: addUtcDays(today, 1) };
    }

    case 'this_week': {
      // ISO week starts Monday. getUTCDay(): Sunday=0..Saturday=6.
      const dow = today.getUTCDay();
      const daysSinceMonday = (dow + 6) % 7; // Mon=0, Sun=6
      const monday = addUtcDays(today, -daysSinceMonday);
      return { startDate: monday, endDate: addUtcDays(monday, 7) };
    }

    case 'last_week': {
      const dow = today.getUTCDay();
      const daysSinceMonday = (dow + 6) % 7;
      const thisMonday = addUtcDays(today, -daysSinceMonday);
      const lastMonday = addUtcDays(thisMonday, -7);
      return { startDate: lastMonday, endDate: thisMonday };
    }

    case 'this_month': {
      const start = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), 1));
      const end = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth() + 1, 1));
      return { startDate: start, endDate: end };
    }

    case 'last_month': {
      const start = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth() - 1, 1));
      const end = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), 1));
      return { startDate: start, endDate: end };
    }

    case 'this_quarter': {
      const m = today.getUTCMonth();
      const quarterStartMonth = Math.floor(m / 3) * 3;
      const start = new Date(Date.UTC(today.getUTCFullYear(), quarterStartMonth, 1));
      const end = new Date(Date.UTC(today.getUTCFullYear(), quarterStartMonth + 3, 1));
      return { startDate: start, endDate: end };
    }

    case 'this_year': {
      const start = new Date(Date.UTC(today.getUTCFullYear(), 0, 1));
      const end = new Date(Date.UTC(today.getUTCFullYear() + 1, 0, 1));
      return { startDate: start, endDate: end };
    }

    case 'custom': {
      if (!input.startDate || !input.endDate) {
        throw new BadRequestException(
          'startDate và endDate là bắt buộc khi preset = custom',
        );
      }
      const startInclusive = parseIsoDateUtc(input.startDate, 'startDate');
      const endInclusive = parseIsoDateUtc(input.endDate, 'endDate');
      if (startInclusive.getTime() > endInclusive.getTime()) {
        throw new BadRequestException(
          'startDate không được lớn hơn endDate',
        );
      }
      // endDate is inclusive in user terms → convert to exclusive next-day boundary.
      return {
        startDate: startInclusive,
        endDate: addUtcDays(endInclusive, 1),
      };
    }

    default: {
      // Exhaustiveness guard — should be unreachable.
      const _exhaustive: never = preset;
      throw new BadRequestException(`preset không hỗ trợ: ${_exhaustive}`);
    }
  }
}
