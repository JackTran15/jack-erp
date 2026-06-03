function toLocalDateStr(d: Date): string {
  const yyyy = d.getFullYear();
  const mm   = String(d.getMonth() + 1).padStart(2, "0");
  const dd   = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

/**
 * Converts a discrete date-range option to `{ from?, to? }` ISO date strings
 * suitable for the v2 search API (DateRangeFilterDto).
 * `ALL` and `OTHER` return `{}` (no date restriction).
 */
export function dateRangeToISO(
  opt: PosDateRangeFilterOption,
  now: Date = new Date(),
): { from?: string; to?: string } {
  if (opt === "ALL" || opt === "OTHER") return {};

  const startOf = (d: Date) => {
    const c = new Date(d);
    c.setHours(0, 0, 0, 0);
    return c;
  };
  const today = startOf(now);

  switch (opt) {
    case "TODAY":
      return { from: toLocalDateStr(today), to: toLocalDateStr(today) };

    case "YESTERDAY": {
      const y = new Date(today);
      y.setDate(y.getDate() - 1);
      return { from: toLocalDateStr(y), to: toLocalDateStr(y) };
    }

    case "LAST_7_DAYS": {
      const from = new Date(today);
      from.setDate(from.getDate() - 6);
      return { from: toLocalDateStr(from) };
    }

    case "LAST_14_DAYS": {
      const from = new Date(today);
      from.setDate(from.getDate() - 13);
      return { from: toLocalDateStr(from) };
    }

    case "THIS_WEEK": {
      const from = new Date(today);
      const day = (from.getDay() + 6) % 7;
      from.setDate(from.getDate() - day);
      return { from: toLocalDateStr(from) };
    }

    case "LAST_WEEK": {
      const from = new Date(today);
      const day = (from.getDay() + 6) % 7;
      from.setDate(from.getDate() - day - 7);
      const to = new Date(from);
      to.setDate(to.getDate() + 6);
      return { from: toLocalDateStr(from), to: toLocalDateStr(to) };
    }

    case "THIS_MONTH": {
      const from = new Date(today.getFullYear(), today.getMonth(), 1);
      return { from: toLocalDateStr(from) };
    }

    case "LAST_MONTH": {
      const from = new Date(today.getFullYear(), today.getMonth() - 1, 1);
      const to   = new Date(today.getFullYear(), today.getMonth(), 0);
      return { from: toLocalDateStr(from), to: toLocalDateStr(to) };
    }

    case "THREE_MONTHS_AGO": {
      const from = new Date(today);
      from.setMonth(from.getMonth() - 3);
      return { from: toLocalDateStr(from) };
    }

    case "SIX_MONTHS_AGO": {
      const from = new Date(today);
      from.setMonth(from.getMonth() - 6);
      return { from: toLocalDateStr(from) };
    }

    default:
      return {};
  }
}

/**
 * Discrete date-range filter options shown in the
 * {@link PosDateRangeFilter} dropdown. Order matches the spec (12 entries,
 * default "ALL").
 */
export type PosDateRangeFilterOption =
  | "ALL"
  | "TODAY"
  | "YESTERDAY"
  | "LAST_7_DAYS"
  | "LAST_14_DAYS"
  | "THIS_WEEK"
  | "LAST_WEEK"
  | "THIS_MONTH"
  | "LAST_MONTH"
  | "THREE_MONTHS_AGO"
  | "SIX_MONTHS_AGO"
  | "OTHER";

export interface PosDateRangeFilterChoice {
  value: PosDateRangeFilterOption;
  label: string;
}

/**
 * Returns whether `d` falls within the discrete window described by `opt`.
 * "ALL" and "OTHER" are treated as inclusive (callers wire a custom
 * date-picker for "OTHER" if/when needed).
 */
export function isInDateRange(
  d: Date,
  opt: PosDateRangeFilterOption,
  now: Date = new Date(),
): boolean {
  if (opt === "ALL" || opt === "OTHER") return true;
  const startOf = (date: Date) => {
    const c = new Date(date);
    c.setHours(0, 0, 0, 0);
    return c;
  };
  const today = startOf(now);
  const dayOf = startOf(d);
  switch (opt) {
    case "TODAY":
      return dayOf.getTime() === today.getTime();
    case "YESTERDAY": {
      const y = new Date(today);
      y.setDate(y.getDate() - 1);
      return dayOf.getTime() === y.getTime();
    }
    case "LAST_7_DAYS": {
      const start = new Date(today);
      start.setDate(start.getDate() - 6);
      return dayOf >= start;
    }
    case "LAST_14_DAYS": {
      const start = new Date(today);
      start.setDate(start.getDate() - 13);
      return dayOf >= start;
    }
    case "THIS_WEEK": {
      const start = new Date(today);
      // Treat Monday as start-of-week (Vietnamese convention).
      const day = (start.getDay() + 6) % 7;
      start.setDate(start.getDate() - day);
      return dayOf >= start;
    }
    case "LAST_WEEK": {
      const start = new Date(today);
      const day = (start.getDay() + 6) % 7;
      start.setDate(start.getDate() - day - 7);
      const end = new Date(start);
      end.setDate(end.getDate() + 7);
      return dayOf >= start && dayOf < end;
    }
    case "THIS_MONTH": {
      const start = new Date(today.getFullYear(), today.getMonth(), 1);
      return dayOf >= start;
    }
    case "LAST_MONTH": {
      const start = new Date(today.getFullYear(), today.getMonth() - 1, 1);
      const end = new Date(today.getFullYear(), today.getMonth(), 1);
      return dayOf >= start && dayOf < end;
    }
    case "THREE_MONTHS_AGO": {
      const start = new Date(today);
      start.setMonth(start.getMonth() - 3);
      return dayOf >= start;
    }
    case "SIX_MONTHS_AGO": {
      const start = new Date(today);
      start.setMonth(start.getMonth() - 6);
      return dayOf >= start;
    }
    default:
      return true;
  }
}
