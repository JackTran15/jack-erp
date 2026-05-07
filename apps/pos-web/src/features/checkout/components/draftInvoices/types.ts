/**
 * Date-range filter options shown in the dropdown of `DraftInvoicesDialog`.
 * Order matches the spec (12 entries, default "ALL").
 */
export type DateRangeOption =
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

export interface DateRangeChoice {
  value: DateRangeOption;
  label: string;
}

export const DATE_RANGE_CHOICES: ReadonlyArray<DateRangeChoice> = [
  { value: "ALL", label: "Toàn bộ" },
  { value: "TODAY", label: "Hôm nay" },
  { value: "YESTERDAY", label: "Hôm qua" },
  { value: "LAST_7_DAYS", label: "7 ngày gần đây" },
  { value: "LAST_14_DAYS", label: "14 ngày gần đây" },
  { value: "THIS_WEEK", label: "Tuần này" },
  { value: "LAST_WEEK", label: "Tuần trước" },
  { value: "THIS_MONTH", label: "Tháng này" },
  { value: "LAST_MONTH", label: "Tháng trước" },
  { value: "THREE_MONTHS_AGO", label: "Ba tháng trước" },
  { value: "SIX_MONTHS_AGO", label: "Sáu tháng trước" },
  { value: "OTHER", label: "Khác" },
];

/** Build a CSS clip-path with a zigzag tooth pattern at the bottom edge. */
export function buildZigzagClipPath(teeth = 30, toothHeight = 6): string {
  const baseY = `calc(100% - ${toothHeight}px)`;
  const peakY = "100%";
  const points: string[] = ["0 0", "100% 0", `100% ${baseY}`];
  // Walk right → left along the bottom, alternating peak / valley.
  const totalSegments = teeth * 2;
  for (let i = 1; i < totalSegments; i++) {
    const xPct = (1 - i / totalSegments) * 100;
    const isPeak = i % 2 === 1;
    points.push(`${xPct.toFixed(2)}% ${isPeak ? peakY : baseY}`);
  }
  points.push(`0 ${baseY}`);
  return `polygon(${points.join(", ")})`;
}

/** Filter helper used internally by the dialog when its filter is uncontrolled. */
export function isInDateRange(
  d: Date,
  opt: DateRangeOption,
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
