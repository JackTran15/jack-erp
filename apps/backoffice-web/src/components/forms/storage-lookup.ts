/**
 * Shared bits for the "Chọn kho" LookupField pickers: a 2-column layout
 * (Mã kho / Tên kho) and a client-side filter that matches either column.
 */

export interface StorageLookupOption {
  id: string;
  /** Mã kho (WHxxxxxx). Older records backfilled by migration may still be blank. */
  code?: string;
  name: string;
}

export const STORAGE_LOOKUP_COLUMNS = [
  {
    key: "code",
    label: "Mã kho",
    className: "w-[120px] font-mono",
    render: (s: StorageLookupOption) => s.code ?? "—",
  },
  { key: "name", label: "Tên kho", render: (s: StorageLookupOption) => s.name },
];

/** True when the storage matches `query` (already lower-cased) by code or name. */
export function matchesStorageQuery(
  storage: StorageLookupOption,
  query: string,
): boolean {
  if (!query) return true;
  return (
    storage.name.toLowerCase().includes(query) ||
    (storage.code ?? "").toLowerCase().includes(query)
  );
}

/**
 * Builds a LookupField `search` fn over an already-loaded storage list —
 * the list is small enough (one page of 200 covers every real org) that
 * filtering client-side beats a request per keystroke.
 */
export function makeStorageSearch<T extends StorageLookupOption>(
  storages: T[],
  defaultPageSize = 8,
) {
  return async (query: string, page: number, pageSize?: number) => {
    const q = query.trim().toLowerCase();
    const filtered = storages.filter((s) => matchesStorageQuery(s, q));
    const size = pageSize ?? defaultPageSize;
    const start = (page - 1) * size;
    return {
      items: filtered.slice(start, start + size),
      hasMore: start + size < filtered.length,
      total: filtered.length,
    };
  };
}
