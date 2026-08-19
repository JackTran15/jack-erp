import { useMemo, useState } from "react";
import {
  DEFAULT_COLUMN_FILTER_MODE,
  type ColumnCompareOp,
  type ColumnFilter,
  type ColumnFilterMode,
} from "./pagination.dto";

interface Options {
  /** Called whenever a filter changes — typically to reset the page to 1. */
  onChange?: () => void;
}

/**
 * Per-column filter state plus the `columnFilterControl` shape `BaseDataTable`
 * expects. The page-level grids build this inline; dialogs that carry their own
 * filter row use this instead of repeating it.
 */
export function useColumnFilters<K extends string>(
  keys: readonly K[],
  { onChange }: Options = {},
) {
  const [filters, setFilters] = useState<Record<K, ColumnFilter>>(() =>
    keys.reduce(
      (acc, key) => {
        acc[key] = { mode: DEFAULT_COLUMN_FILTER_MODE, value: "" };
        return acc;
      },
      {} as Record<K, ColumnFilter>,
    ),
  );

  const control = useMemo(
    () => ({
      filters: filters as Record<string, ColumnFilter>,
      onModeChange: (key: string, mode: ColumnFilterMode) => {
        onChange?.();
        setFilters((previous) => ({
          ...previous,
          [key as K]: { ...previous[key as K], mode },
        }));
      },
      onValueChange: (key: string, value: string) => {
        onChange?.();
        setFilters((previous) => ({
          ...previous,
          [key as K]: { ...previous[key as K], value },
        }));
      },
      onCompareOpChange: (key: string, compareOp: ColumnCompareOp) => {
        onChange?.();
        setFilters((previous) => ({
          ...previous,
          [key as K]: { ...previous[key as K], compareOp },
        }));
      },
    }),
    [filters, onChange],
  );

  return { filters, control };
}
