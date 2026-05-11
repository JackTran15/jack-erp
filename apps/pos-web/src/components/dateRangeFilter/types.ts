/**
 * Discrete date-range filter options shown in the {@link DateRangeFilter}
 * dropdown. Order matches the spec (12 entries, default "ALL").
 */
export type DateRangeFilterOption =
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

export interface DateRangeFilterChoice {
  value: DateRangeFilterOption;
  label: string;
}
