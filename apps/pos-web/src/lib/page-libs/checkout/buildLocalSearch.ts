import type { PosSelectSearchSuggestion } from "@erp/pos/components/common/PosSelectSearch/PosSelectSearch";

export function buildLocalSearch<T>(
  items: ReadonlyArray<T>,
  getLabel: (item: T) => string,
) {
  return (q: string): ReadonlyArray<PosSelectSearchSuggestion<T>> => {
    const lower = q.trim().toLowerCase();
    const matched = lower
      ? items.filter((item) => getLabel(item).toLowerCase().includes(lower))
      : items;
    return matched.map((item) => ({ item }));
  };
}
