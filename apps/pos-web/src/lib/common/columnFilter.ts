import { FilterOperatorEnum } from "@erp/pos/constants/checkout.constant";
import { parseViDate } from "@erp/pos/lib/common/dateTime";
import type { ColumnFilterState } from "@erp/pos/interfaces/column-filter.interface";

/**
 * Operator-aware predicates for per-column table filters. Pure functions — no
 * React, no http. Each returns `true` when the typed value is empty or cannot
 * be parsed, so an empty / malformed cell acts as a no-op filter.
 */

export function matchesTextFilter(
  haystack: string,
  filter: ColumnFilterState,
): boolean {
  const needle = filter.value.trim().toLowerCase();
  if (!needle) return true;
  const hay = haystack.toLowerCase();
  switch (filter.operator) {
    case FilterOperatorEnum.CONTAINS:
      return hay.includes(needle);
    case FilterOperatorEnum.EQUALS:
      return hay === needle;
    case FilterOperatorEnum.STARTS_WITH:
      return hay.startsWith(needle);
    case FilterOperatorEnum.ENDS_WITH:
      return hay.endsWith(needle);
    case FilterOperatorEnum.NOT_CONTAINS:
      return !hay.includes(needle);
    default:
      return true;
  }
}

export function matchesNumberFilter(
  value: number,
  filter: ColumnFilterState,
): boolean {
  const trimmed = filter.value.trim();
  if (!trimmed) return true;
  const target = Number.parseFloat(trimmed.replace(/[.,\s]/g, ""));
  if (!Number.isFinite(target)) return true;
  switch (filter.operator) {
    case FilterOperatorEnum.EQUALS:
      return value === target;
    case FilterOperatorEnum.LESS_THAN:
      return value < target;
    case FilterOperatorEnum.LESS_THAN_OR_EQUAL:
      return value <= target;
    case FilterOperatorEnum.GREATER_THAN:
      return value > target;
    case FilterOperatorEnum.GREATER_THAN_OR_EQUAL:
      return value >= target;
    default:
      return true;
  }
}

/** Day-granularity key `yyyymmdd` for date-only comparisons. */
function toDayInt(d: Date): number {
  return d.getFullYear() * 10000 + (d.getMonth() + 1) * 100 + d.getDate();
}

export function matchesDateFilter(
  value: Date,
  filter: ColumnFilterState,
): boolean {
  if (!filter.value.trim()) return true;
  const target = parseViDate(filter.value);
  if (!target) return true;
  const a = toDayInt(value);
  const b = toDayInt(target);
  switch (filter.operator) {
    case FilterOperatorEnum.EQUALS:
      return a === b;
    case FilterOperatorEnum.LESS_THAN:
      return a < b;
    case FilterOperatorEnum.LESS_THAN_OR_EQUAL:
      return a <= b;
    case FilterOperatorEnum.GREATER_THAN:
      return a > b;
    case FilterOperatorEnum.GREATER_THAN_OR_EQUAL:
      return a >= b;
    default:
      return true;
  }
}
