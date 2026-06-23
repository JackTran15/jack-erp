import { columnToStringFilter } from "../../components/crud/crudV2Search";
import type { ColumnFilter } from "../../components/table/pagination.dto";

export type DateRangeFilter = {
  from?: string;
  to?: string;
};

export function columnToCompareFilter(
  filter?: ColumnFilter,
): { operator: "=" | "<" | "<=" | ">" | ">="; value: string } | undefined {
  const value = filter?.value?.trim();
  if (!value || !Number.isFinite(Number(value))) return undefined;
  return { operator: "<=", value };
}

export function columnToDateRangeFilter(
  filter?: ColumnFilter,
): DateRangeFilter | undefined {
  const from = filter?.from?.trim();
  const to = filter?.to?.trim();
  if (!from && !to) return undefined;
  return {
    ...(from ? { from } : {}),
    ...(to ? { to } : {}),
  };
}

export function intersectDateRanges(
  ...ranges: Array<DateRangeFilter | undefined>
): DateRangeFilter | undefined {
  const from = ranges
    .map((range) => range?.from)
    .filter((value): value is string => Boolean(value))
    .sort()
    .at(-1);
  const to = ranges
    .map((range) => range?.to)
    .filter((value): value is string => Boolean(value))
    .sort()
    .at(0);

  if (!from && !to) return undefined;
  return {
    ...(from ? { from } : {}),
    ...(to ? { to } : {}),
  };
}

export { columnToStringFilter };
