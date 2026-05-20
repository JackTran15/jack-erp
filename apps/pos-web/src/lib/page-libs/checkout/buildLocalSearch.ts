import type { SearchSuggestion } from "@erp/pos/components/common/PosSearchPopover/PosSearchPopover";

/**
 * Build an async suggestion adapter over a static in-memory list, for use with
 * {@link PosSearchPopover}. Filtering is a case-insensitive substring match on
 * `getLabel`; the Promise wrapper keeps the signature compatible with the
 * popover's async `search` contract (no network involved).
 */
export function buildLocalSearch<T>(
  items: ReadonlyArray<T>,
  getLabel: (item: T) => string,
) {
  return async (q: string): Promise<SearchSuggestion<T>[]> => {
    const lower = q.trim().toLowerCase();
    const matched = lower
      ? items.filter((item) => getLabel(item).toLowerCase().includes(lower))
      : items;
    return matched.map((item) => ({ item }));
  };
}
