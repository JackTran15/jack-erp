import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { AppModal, Button, cn, Input } from "@erp/ui";
import { Loader2, Search } from "lucide-react";
import type { LookupSearchResult } from "./LookupField";
import { PaginationControls } from "../table/PaginationControls";
import { resolveLookupPaginationTotal } from "../table/pagination.dto";

export interface LookupSearchColumn<T> {
  key: string;
  label: string;
  className?: string;
  render: (item: T) => ReactNode;
}

export interface LookupSearchModalProps<T> {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSelect: (item: T) => void;
  search: (
    query: string,
    page: number,
    pageSize?: number,
  ) => Promise<LookupSearchResult<T>>;
  itemKey: (item: T) => string;
  columns: Array<LookupSearchColumn<T>>;
  /** Modal title — defaults to "Chọn hàng hóa". */
  title?: string;
  /** Search input placeholder. */
  searchPlaceholder?: string;
  /** Empty state text. */
  emptyLabel?: string;
  /** Debounce delay for the search input (ms). Default 300. */
  searchDebounceMs?: number;
  /** Initial page size. Must be one of `pageSizeOptions`. Default 25. */
  initialPageSize?: number;
  /** Allowed page sizes for the selector. Default [10, 25, 50, 100]. */
  pageSizeOptions?: number[];
  /** Extra controls before the search field (e.g. type filter). */
  toolbarExtra?: ReactNode;
  /** Confirm button label. Default "Chọn". */
  confirmLabel?: string;
  /** Cancel button label. Default "Hủy bỏ". */
  cancelLabel?: string;
}

interface CacheEntry<T> {
  items: T[];
  hasMore: boolean;
  total: number | null;
}

const DEFAULT_PAGE_SIZE_OPTIONS = [10, 25, 50, 100];

/**
 *
 * Features:
 * - Search input with debounce (default 300ms)
 * - Page size selector (default 10/25/50/100)
 * - First / Prev / Next / Last navigation + "Trang X / N" indicator
 * - Reload button (busts the cache for the current view)
 * - Per-(query, pageSize, page) cache so flipping back/forth doesn't refetch
 * - Total record counter when API returns it
 * - Double-click row to confirm, or single-click + "Chọn"
 */
export function LookupSearchModal<T>({
  open,
  onOpenChange,
  onSelect,
  search,
  itemKey,
  columns,
  title,
  searchPlaceholder,
  emptyLabel,
  searchDebounceMs = 300,
  initialPageSize = 25,
  pageSizeOptions = DEFAULT_PAGE_SIZE_OPTIONS,
  toolbarExtra,
  confirmLabel = "Chọn",
  cancelLabel = "Hủy bỏ",
}: LookupSearchModalProps<T>) {
  const [pageSize, setPageSize] = useState(initialPageSize);
  const [page, setPage] = useState(1);
  const [items, setItems] = useState<T[]>([]);
  const [total, setTotal] = useState<number | null>(null);
  const [hasMore, setHasMore] = useState(false);
  const [searchInput, setSearchInput] = useState("");
  const [committedQuery, setCommittedQuery] = useState("");
  const [loading, setLoading] = useState(false);
  const [selectedKey, setSelectedKey] = useState<string | null>(null);

  const cacheRef = useRef<Map<string, CacheEntry<T>>>(new Map());
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const initialLoadRef = useRef(false);
  const reqIdRef = useRef(0);

  const paginationMeta = useMemo(
    () =>
      resolveLookupPaginationTotal(total, hasMore, page, pageSize, items.length),
    [total, hasMore, page, pageSize, items.length],
  );

  const buildKey = useCallback(
    (q: string, p: number, ps: number) => `${q}${ps}${p}`,
    [],
  );

  const loadPage = useCallback(
    async (
      nextPage: number,
      query: string,
      ps: number,
      opts?: { force?: boolean },
    ) => {
      const key = buildKey(query, nextPage, ps);
      const cached = !opts?.force ? cacheRef.current.get(key) : undefined;
      if (cached) {
        setItems(cached.items);
        setHasMore(cached.hasMore);
        setTotal(cached.total);
        setPage(nextPage);
        setSelectedKey(null);
        return;
      }

      const reqId = ++reqIdRef.current;
      setLoading(true);
      try {
        const raw = await search(query, nextPage, ps);
        if (reqId !== reqIdRef.current) return; // a newer request superseded us
        const list = Array.isArray(raw) ? raw : raw.items;
        const more = Array.isArray(raw) ? false : Boolean(raw.hasMore);
        const t = Array.isArray(raw) ? null : raw.total ?? null;
        cacheRef.current.set(key, { items: list, hasMore: more, total: t });
        setItems(list);
        setHasMore(more);
        setTotal(t);
        setPage(nextPage);
        setSelectedKey(null);
      } catch {
        if (reqId === reqIdRef.current) {
          setItems([]);
          setHasMore(false);
          setTotal(null);
        }
      } finally {
        if (reqId === reqIdRef.current) setLoading(false);
      }
    },
    [search, buildKey],
  );

  // Initial load + reset on close
  useEffect(() => {
    if (!open) {
      setItems([]);
      setHasMore(false);
      setTotal(null);
      setSearchInput("");
      setCommittedQuery("");
      setSelectedKey(null);
      setPage(1);
      setPageSize(initialPageSize);
      cacheRef.current.clear();
      initialLoadRef.current = false;
      if (debounceRef.current) {
        clearTimeout(debounceRef.current);
        debounceRef.current = null;
      }
      return;
    }
    if (initialLoadRef.current) return;
    initialLoadRef.current = true;
    void loadPage(1, "", initialPageSize);
  }, [open, initialPageSize, loadPage]);

  useEffect(() => {
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, []);

  const handleSearchInputChange = (value: string) => {
    setSearchInput(value);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      const q = value.trim();
      setCommittedQuery(q);
      void loadPage(1, q, pageSize);
    }, searchDebounceMs);
  };

  const commitSearchNow = () => {
    if (debounceRef.current) {
      clearTimeout(debounceRef.current);
      debounceRef.current = null;
    }
    const q = searchInput.trim();
    setCommittedQuery(q);
    void loadPage(1, q, pageSize);
  };

  const handlePageSizeChange = (next: number) => {
    if (next === pageSize) return;
    cacheRef.current.clear();
    setPageSize(next);
    void loadPage(1, committedQuery, next, { force: true });
  };

  const handleReload = () => {
    cacheRef.current.clear();
    void loadPage(page, committedQuery, pageSize, { force: true });
  };

  const selectedItem = selectedKey
    ? items.find((it) => itemKey(it) === selectedKey) ?? null
    : null;

  const handleConfirm = () => {
    if (!selectedItem) return;
    onSelect(selectedItem);
    onOpenChange(false);
  };

  return (
    <AppModal
      open={open}
      onOpenChange={onOpenChange}
      title={title ?? "Chọn hàng hóa"}
      defaultWidth={1040}
      defaultHeight={660}
      showFooter={false}
    >
      <div className="flex h-full flex-col">
        {/* Top toolbar: search */}
        <div className="flex shrink-0 items-center gap-3 border-b px-3 py-2">
          {toolbarExtra}
          <Input
            className="flex-1"
            placeholder={searchPlaceholder ?? "Nhập mã hoặc tên hàng hóa"}
            value={searchInput}
            onChange={(e) => handleSearchInputChange(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                commitSearchNow();
              }
            }}
            autoFocus
          />
          <Button type="button" onClick={commitSearchNow} className="gap-1.5">
            <Search className="h-4 w-4" />
            Tìm kiếm
          </Button>
        </div>

        {/* Table */}
        <div className="relative min-h-0 flex-1 overflow-auto">
          <table className="w-full border-collapse text-sm">
            <thead className="sticky top-0 z-10 bg-muted text-left [&_th]:bg-muted">
              <tr>
                {columns.map((col) => (
                  <th
                    key={col.key}
                    className={cn(
                      "border-b px-3 py-2 text-xs font-medium text-muted-foreground",
                      col.className,
                    )}
                  >
                    {col.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {items.map((item) => {
                const k = itemKey(item);
                const isSelected = k === selectedKey;
                return (
                  <tr
                    key={k}
                    className={cn(
                      "cursor-pointer border-b",
                      isSelected ? "bg-primary/10" : "hover:bg-muted/40",
                    )}
                    onClick={() => setSelectedKey(k)}
                    onDoubleClick={() => {
                      onSelect(item);
                      onOpenChange(false);
                    }}
                  >
                    {columns.map((col) => (
                      <td key={col.key} className={cn("px-3 py-2", col.className)}>
                        {col.render(item)}
                      </td>
                    ))}
                  </tr>
                );
              })}
              {!loading && items.length === 0 ? (
                <tr>
                  <td
                    className="px-3 py-10 text-center text-sm text-muted-foreground"
                    colSpan={columns.length}
                  >
                    {emptyLabel ?? "Không có dữ liệu."}
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>

          {loading ? (
            <div className="pointer-events-none absolute inset-x-0 top-10 flex items-center justify-center">
              <div className="flex items-center gap-2 rounded-md border bg-background px-3 py-1.5 text-sm text-muted-foreground shadow-sm">
                <Loader2 className="h-4 w-4 animate-spin" />
                Đang tải…
              </div>
            </div>
          ) : null}
        </div>

        <PaginationControls
          className="shrink-0 bg-muted/40"
          page={page}
          pageSize={pageSize}
          total={paginationMeta.total}
          totalEstimated={paginationMeta.estimated}
          hasMore={hasMore}
          pageItemCount={items.length}
          disabled={loading}
          pageSizeOptions={pageSizeOptions}
          onPageChange={(p) => void loadPage(p, committedQuery, pageSize)}
          onPageSizeChange={handlePageSizeChange}
          onRefresh={handleReload}
        />

        <div className="flex shrink-0 justify-end gap-2 border-t bg-muted/40 px-3 py-2">
          <Button
            type="button"
            variant="outline"
            onClick={() => onOpenChange(false)}
          >
            {cancelLabel}
          </Button>
          <Button
            type="button"
            disabled={!selectedItem}
            onClick={handleConfirm}
          >
            {confirmLabel}
          </Button>
        </div>
      </div>
    </AppModal>
  );
}
