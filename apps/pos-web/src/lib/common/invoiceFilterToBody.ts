/**
 * Maps the per-column filter state used by `PosDataTableFilterCell`
 * (`FilterOperatorEnum` + raw value) into the v2 search body filter shapes
 * (`StringFilter` / `CompareFilter`). Empty values map to `undefined` so the
 * filter key is omitted from the request entirely.
 */
import { FilterOperatorEnum } from "@erp/pos/constants/checkout.constant";
import type { ColumnFilterState } from "@erp/pos/interfaces/column-filter.interface";
import type { CompareFilter, StringFilter } from "@erp/pos/dtos/invoice.dto";

const STRING_OP: Partial<Record<FilterOperatorEnum, StringFilter["operator"]>> = {
  [FilterOperatorEnum.CONTAINS]: "*",
  [FilterOperatorEnum.EQUALS]: "=",
  [FilterOperatorEnum.STARTS_WITH]: "+",
  [FilterOperatorEnum.ENDS_WITH]: "-",
  [FilterOperatorEnum.NOT_CONTAINS]: "!",
};

const COMPARE_OP: Partial<Record<FilterOperatorEnum, CompareFilter["operator"]>> = {
  [FilterOperatorEnum.EQUALS]: "=",
  [FilterOperatorEnum.LESS_THAN]: "<",
  [FilterOperatorEnum.LESS_THAN_OR_EQUAL]: "<=",
  [FilterOperatorEnum.GREATER_THAN]: ">",
  [FilterOperatorEnum.GREATER_THAN_OR_EQUAL]: ">=",
};

/** Parse a user-typed numeric string ("1.000.000" / "1,000") → number. */
function parseNumeric(raw: string): number | null {
  const cleaned = raw.replace(/[.,\s]/g, "");
  if (!cleaned) return null;
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : null;
}

/** Build a `StringFilter` from a raw value + operator (default CONTAINS). */
export function toStringFilter(
  value: string,
  operator: FilterOperatorEnum = FilterOperatorEnum.CONTAINS,
): StringFilter | undefined {
  const v = value.trim();
  const op = STRING_OP[operator];
  if (!v || !op) return undefined;
  return { operator: op, value: v };
}

/** Build a `CompareFilter` from a raw value + operator (default ≤). */
export function toCompareFilter(
  value: string,
  operator: FilterOperatorEnum = FilterOperatorEnum.LESS_THAN_OR_EQUAL,
): CompareFilter | undefined {
  const op = COMPARE_OP[operator];
  const n = parseNumeric(value);
  if (n === null || !op) return undefined;
  return { operator: op, value: n };
}

/** `ColumnFilterState` (operator + value) → `StringFilter`. */
export function columnToStringFilter(
  state?: ColumnFilterState,
): StringFilter | undefined {
  if (!state) return undefined;
  return toStringFilter(state.value, state.operator);
}

/** `ColumnFilterState` (operator + value) → `CompareFilter`. */
export function columnToCompareFilter(
  state?: ColumnFilterState,
): CompareFilter | undefined {
  if (!state) return undefined;
  return toCompareFilter(state.value, state.operator);
}
