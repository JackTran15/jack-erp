import {
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  type KeyboardEvent,
  type ReactNode,
  type UIEvent,
} from "react";
import { createPortal } from "react-dom";
import { ChevronDown, Plus, Search, X } from "lucide-react";
import {
  cn,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  Input,
} from "@erp/ui";
import { LookupSearchModal } from "./LookupSearchModal";

/**
 * Result a `search` call may return.
 * - Bare `T[]` ⇒ single page, no pagination metadata.
 * - `{ items, hasMore }` ⇒ enables infinite scroll in the popover.
 * - `{ items, hasMore, total }` ⇒ also enables jump-to-last-page in the search modal.
 */
export type LookupSearchResult<T> =
  | T[]
  | { items: T[]; hasMore?: boolean; total?: number };

export interface LookupFieldProps<T> {
  inputId?: string;
  /** Display label currently shown in the input (label of the selected item or free text). */
  value: string;
  onValueChange: (value: string) => void;
  /** Called when user picks a suggestion. */
  onSelect: (item: T) => void;
  /**
   * Search query → results. Called with "" when dropdown opens via icon/focus.
   * Return either `T[]` (single page) or `{ items, hasMore, total? }` to
   * enable infinite scroll on the dropdown and full pagination in the search
   * modal. The `page` argument starts at 1 and increments as the user scrolls.
   * `pageSize` is optional — passed by the search modal when the user changes
   * the page-size selector; if omitted, callers should use their default.
   */
  search: (
    query: string,
    page: number,
    pageSize?: number,
  ) => Promise<LookupSearchResult<T>>;
  itemKey: (item: T) => string;
  renderItem: (item: T) => ReactNode;
  renderMeta?: (item: T) => ReactNode;
  /** Column headers for the dropdown table. Optional. */
  columns?: Array<{ key: string; label: string; className?: string; render: (item: T) => ReactNode }>;
  placeholder?: string;
  disabled?: boolean;
  /** Provide to render the trailing `+` button that opens a quick-create dialog. */
  onCreateNew?: () => void;
  /** When provided, the `+` button opens a dropdown menu instead of calling onCreateNew directly. */
  createMenuItems?: Array<{ label: string; onClick: () => void }>;
  debounceMs?: number;
  /** Cap on items for non-paginated `search`. Ignored when search returns `{ items, hasMore }`. */
  maxSuggestions?: number;
  className?: string;
  /** Extra classes for the underlying `<input>` itself (e.g. to match a smaller filter-bar size). */
  inputClassName?: string;
  /** Extra classes for the suggestions popover. */
  dropdownClassName?: string;
  /** Force the suggestions popover to be at least this many px wide. */
  dropdownMinWidth?: number;
  /**
   * When true, portal the popover into `document.body` instead of the enclosing
   * `[role="dialog"]`. Use this when the dropdown sits inside a container that
   * clips overflow (e.g. line-item grids inside DocumentFormDialog), so the
   * popover can overflow past the dialog edges.
   *
   * Requires the host dialog to ignore outside-clicks on `[data-lookup-popover]`
   * (see `AppModal`). If your dialog dismisses on outside click without that
   * guard, leave this off.
   */
  portalToBody?: boolean;
  /**
   * When true, clicking the trailing search icon opens a full
   * search modal instead of the inline dropdown. The dropdown is still
   * available via typing or the chevron.
   */
  enableSearchModal?: boolean;
  /** Title shown in the search modal header. */
  searchModalTitle?: string;
  /** Placeholder shown in the search modal's search input. */
  searchModalPlaceholder?: string;
  /** When set, the trailing search button calls this instead of opening the inline list or default modal. */
  onSearchButtonClick?: () => void;
  /** Hide the trailing search button entirely, leaving only the chevron (open-list) affordance. */
  hideSearchButton?: boolean;
}

interface PopoverRect {
  top: number;
  left: number;
  width: number;
  maxHeight: number;
}

const POPOVER_GAP = 4;
const POPOVER_VIEWPORT_MARGIN = 8;
const POPOVER_MAX_HEIGHT = 240;
const POPOVER_MIN_HEIGHT = 140;
const SCROLL_LOAD_THRESHOLD = 80;

export function LookupField<T>({
  inputId,
  value,
  onValueChange,
  onSelect,
  search,
  itemKey,
  renderItem,
  renderMeta,
  columns,
  placeholder,
  disabled,
  onCreateNew,
  createMenuItems,
  debounceMs = 250,
  maxSuggestions = 50,
  className,
  inputClassName,
  dropdownClassName,
  dropdownMinWidth,
  portalToBody,
  enableSearchModal,
  searchModalTitle,
  searchModalPlaceholder,
  onSearchButtonClick,
  hideSearchButton,
}: LookupFieldProps<T>) {
  const fallbackId = useId();
  const resolvedId = inputId ?? fallbackId;
  const listboxId = `${resolvedId}-listbox`;

  const wrapRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const popoverRef = useRef<HTMLDivElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const queryRef = useRef("");
  const pageRef = useRef(1);
  const loadingMoreRef = useRef(false);
  const lastSearchRef = useRef<{ query: string; ts: number }>({ query: "\0", ts: 0 });
  // Monotonic counter so a slow response for an older query can never overwrite
  // a newer one. Without it, auto-highlighting the first row would silently
  // point at a stale result set.
  const searchSeqRef = useRef(0);
  // Chrome reports isComposing=false on the very keydown that ends a
  // composition, so the flag alone is not enough — the other components in this
  // repo (single-select, tags-input) OR it with a compositionstart ref.
  const isComposingRef = useRef(false);
  // True between a keystroke and the arrival of that query's results: the list
  // on screen still belongs to the previous query, so Enter must not pick from it.
  const staleRef = useRef(false);
  const optionRefs = useRef<(HTMLElement | null)[]>([]);
  // Query the currently displayed list belongs to, and a mirror of that list —
  // both readable synchronously, unlike state, right after an await.
  const listQueryRef = useRef<string | null>(null);
  const suggestionsRef = useRef<T[]>([]);

  const [suggestions, setSuggestions] = useState<T[]>([]);
  const [open, setOpen] = useState(false);
  const [highlightIdx, setHighlightIdx] = useState(-1);
  const [stale, setStale] = useState(false);
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const [rect, setRect] = useState<PopoverRect | null>(null);
  const [portalTarget, setPortalTarget] = useState<HTMLElement | null>(null);
  const [searchModalOpen, setSearchModalOpen] = useState(false);

  const normalize = useCallback(
    (raw: LookupSearchResult<T>): { items: T[]; hasMore: boolean } => {
      if (Array.isArray(raw)) {
        const capped = raw.slice(0, maxSuggestions);
        return { items: capped, hasMore: false };
      }
      return { items: raw.items, hasMore: Boolean(raw.hasMore) };
    },
    [maxSuggestions],
  );

  /**
   * Runs the query and returns the resulting page, so callers that must act on
   * the result immediately (Enter pressed before the debounce fired) can use the
   * returned items directly instead of waiting for a re-render.
   *
   * Returns `null` when the call was superseded by a newer query — the caller
   * must then do nothing, because another run owns the state now.
   */
  const runSearchCore = useCallback(
    async (q: string, force = false): Promise<T[] | null> => {
      const now = Date.now();
      if (
        !force &&
        lastSearchRef.current.query === q &&
        now - lastSearchRef.current.ts < 300
      ) {
        // The visible list is already the one for `q`. Re-arm the highlight in
        // case the caller (handleClear, openAndLoad) just cleared it, otherwise
        // it stays stuck at -1 and Enter does nothing.
        if (listQueryRef.current === q && suggestionsRef.current.length > 0) {
          setHighlightIdx(0);
          staleRef.current = false;
          setStale(false);
          return suggestionsRef.current;
        }
        return null;
      }
      lastSearchRef.current = { query: q, ts: now };
      queryRef.current = q;
      pageRef.current = 1;
      const seq = ++searchSeqRef.current;
      setLoading(true);
      try {
        const raw = await search(q, 1);
        // A newer query started while this one was in flight — drop the result.
        if (seq !== searchSeqRef.current) return null;
        const { items, hasMore: more } = normalize(raw);
        setSuggestions(items);
        suggestionsRef.current = items;
        listQueryRef.current = q;
        setHasMore(more);
        // Results are now current: highlight the first row so Enter picks it
        // without the user having to press ArrowDown first.
        setHighlightIdx(items.length > 0 ? 0 : -1);
        staleRef.current = false;
        setStale(false);
        if (scrollRef.current) scrollRef.current.scrollTop = 0;
        return items;
      } catch {
        if (seq !== searchSeqRef.current) return null;
        setSuggestions([]);
        suggestionsRef.current = [];
        listQueryRef.current = q;
        setHasMore(false);
        setHighlightIdx(-1);
        staleRef.current = false;
        setStale(false);
        return [];
      } finally {
        if (seq === searchSeqRef.current) setLoading(false);
      }
    },
    [search, normalize],
  );

  const runSearch = useCallback(
    async (q: string) => {
      await runSearchCore(q);
    },
    [runSearchCore],
  );

  const loadMore = useCallback(async () => {
    if (loadingMoreRef.current || !hasMore) return;
    loadingMoreRef.current = true;
    setLoadingMore(true);
    const nextPage = pageRef.current + 1;
    const seq = searchSeqRef.current;
    try {
      const raw = await search(queryRef.current, nextPage);
      // A new query started while this page was in flight — merging it now
      // would splice the old query's rows into the current list.
      if (seq !== searchSeqRef.current) return;
      const { items, hasMore: more } = normalize(raw);
      pageRef.current = nextPage;
      setSuggestions((prev) => {
        const existing = new Set(prev.map((it) => itemKey(it)));
        const merged = prev.slice();
        for (const it of items) {
          if (!existing.has(itemKey(it))) merged.push(it);
        }
        suggestionsRef.current = merged;
        return merged;
      });
      setHasMore(more);
    } catch {
      setHasMore(false);
    } finally {
      loadingMoreRef.current = false;
      setLoadingMore(false);
    }
  }, [hasMore, search, normalize, itemKey]);

  const handleChange = useCallback(
    (val: string) => {
      onValueChange(val);
      // The visible list still belongs to the previous query. Drop the
      // highlight until fresh results land so Enter can't pick a stale row.
      setHighlightIdx(-1);
      staleRef.current = true;
      setStale(true);
      setOpen(true);
      if (debounceRef.current) clearTimeout(debounceRef.current);
      debounceRef.current = setTimeout(() => {
        void runSearch(val.trim());
      }, debounceMs);
    },
    [onValueChange, runSearch, debounceMs],
  );

  useEffect(() => {
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, []);

  // Auto-fill: when the first page fits entirely without scrolling and the
  // server says there's more, fetch the next page so the user can actually
  // scroll to see additional items. The hasMore + loadingMoreRef guards
  // prevent runaway fetching once content exceeds the viewport.
  useEffect(() => {
    if (!open || loading || !hasMore || loadingMoreRef.current) return;
    const el = scrollRef.current;
    if (!el) return;
    if (el.scrollHeight <= el.clientHeight + 1) {
      void loadMore();
    }
  }, [open, loading, hasMore, suggestions, loadMore]);

  useEffect(() => {
    if (!open) return;
    function handleClickOutside(e: MouseEvent) {
      const target = e.target as Node;
      if (wrapRef.current && wrapRef.current.contains(target)) return;
      if (popoverRef.current && popoverRef.current.contains(target)) return;
      setOpen(false);
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [open]);

  useLayoutEffect(() => {
    if (!open) {
      setRect(null);
      setPortalTarget(null);
      return;
    }
    const wrapEl = wrapRef.current;
    if (!wrapEl) return;
    const dialog = portalToBody
      ? null
      : (wrapEl.closest('[role="dialog"]') as HTMLElement | null);
    const target = dialog ?? document.body;
    setPortalTarget(target);

    const measure = () => {
      const r = wrapEl.getBoundingClientRect();
      const availableBelow = window.innerHeight - r.bottom - POPOVER_VIEWPORT_MARGIN;
      const availableAbove = r.top - POPOVER_VIEWPORT_MARGIN;
      const placeBelow =
        availableBelow >= POPOVER_MIN_HEIGHT || availableBelow >= availableAbove;
      const maxHeight = Math.min(
        POPOVER_MAX_HEIGHT,
        Math.max(POPOVER_MIN_HEIGHT, placeBelow ? availableBelow : availableAbove),
      );
      const viewportTop = placeBelow
        ? r.bottom + POPOVER_GAP
        : r.top - POPOVER_GAP - maxHeight;

      // When the popover is portaled into the dialog content (which has
      // `contain: layout paint`), it becomes the containing block for our
      // `position: fixed` popover — so we have to express coords relative to it
      // rather than the viewport.
      if (target !== document.body) {
        const tr = target.getBoundingClientRect();
        setRect({
          top: viewportTop - tr.top,
          left: r.left - tr.left,
          width: r.width,
          maxHeight,
        });
      } else {
        setRect({
          top: viewportTop,
          left: r.left,
          width: r.width,
          maxHeight,
        });
      }
    };
    measure();

    const onScroll = () => measure();
    const onResize = () => measure();
    window.addEventListener("scroll", onScroll, true);
    window.addEventListener("resize", onResize);
    return () => {
      window.removeEventListener("scroll", onScroll, true);
      window.removeEventListener("resize", onResize);
    };
  }, [open, portalToBody]);

  const openAndLoad = useCallback(() => {
    if (disabled) return;
    setOpen(true);
    void runSearch(value.trim());
    inputRef.current?.focus();
  }, [disabled, runSearch, value]);

  const handleClear = useCallback(() => {
    if (disabled) return;
    onValueChange("");
    setHighlightIdx(-1);
    setOpen(true);
    void runSearch("");
    inputRef.current?.focus();
  }, [disabled, onValueChange, runSearch]);

  const selectItem = useCallback(
    (item: T) => {
      onSelect(item);
      setOpen(false);
      setSuggestions([]);
      suggestionsRef.current = [];
      listQueryRef.current = null;
      setHighlightIdx(-1);
      staleRef.current = false;
      setStale(false);
      setHasMore(false);
    },
    [onSelect],
  );

  const handleKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (!open) {
      if (e.key === "ArrowDown" || e.key === "Enter") {
        e.preventDefault();
        openAndLoad();
      }
      return;
    }

    // Escape is handled before the empty-list guard below, otherwise it is
    // swallowed while "Không có dữ liệu." is showing. stopPropagation keeps it
    // from bubbling to the Radix dialog, which would close the whole voucher.
    if (e.key === "Escape") {
      e.preventDefault();
      e.stopPropagation();
      setOpen(false);
      return;
    }

    if (e.key === "Enter") {
      // Vietnamese IME: this Enter confirms the composition, it must not pick
      // an option.
      if (isComposingRef.current || e.nativeEvent.isComposing) return;
      e.preventDefault();

      // Typed and hit Enter before the debounce fired: the list on screen is
      // the previous query's. Run the new query now and take its first row
      // rather than selecting whatever happens to be displayed.
      if (staleRef.current || loading) {
        if (debounceRef.current) clearTimeout(debounceRef.current);
        void runSearchCore(value.trim(), true).then((items) => {
          if (items && items.length > 0) selectItem(items[0]!);
        });
        return;
      }

      if (highlightIdx >= 0 && highlightIdx < suggestions.length) {
        selectItem(suggestions[highlightIdx]!);
      }
      return;
    }

    if (suggestions.length === 0) return;
    switch (e.key) {
      case "ArrowDown":
        e.preventDefault();
        setHighlightIdx((i) => (i + 1) % suggestions.length);
        break;
      case "ArrowUp":
        e.preventDefault();
        setHighlightIdx((i) => (i <= 0 ? suggestions.length - 1 : i - 1));
        break;
      case "Home":
        e.preventDefault();
        setHighlightIdx(0);
        break;
      case "End":
        e.preventDefault();
        setHighlightIdx(suggestions.length - 1);
        break;
    }
  };

  const handleScroll = useCallback(
    (e: UIEvent<HTMLDivElement>) => {
      if (!hasMore || loadingMoreRef.current) return;
      const el = e.currentTarget;
      const remaining = el.scrollHeight - el.scrollTop - el.clientHeight;
      if (remaining < SCROLL_LOAD_THRESHOLD) {
        void loadMore();
      }
    },
    [hasMore, loadMore],
  );

  // Keep the highlighted row visible while arrowing through the list.
  // `block: "nearest"` leaves the scroll alone when the row is already visible,
  // so the popover doesn't jump on every keystroke.
  useEffect(() => {
    if (!open || highlightIdx < 0) return;
    optionRefs.current[highlightIdx]?.scrollIntoView({ block: "nearest" });
  }, [highlightIdx, open, suggestions]);

  const hasSuggestions = suggestions.length > 0;

  const popover =
    open && rect && portalTarget
      ? createPortal(
          <div
            ref={popoverRef}
            data-lookup-popover=""
            style={{
              position: "fixed",
              top: rect.top,
              left: rect.left,
              minWidth: Math.max(rect.width, dropdownMinWidth ?? 0),
              zIndex: 70,
              pointerEvents: "auto",
            }}
            className={cn(
              "overflow-hidden rounded-md border bg-popover text-popover-foreground shadow-md",
              dropdownClassName,
            )}
          >
            {loading ? (
              <div className="px-3 py-2 text-sm text-muted-foreground">Đang tải…</div>
            ) : hasSuggestions ? (
              <div
                ref={scrollRef}
                onScroll={handleScroll}
                className={cn(
                  // Dimmed while the query that produced it is out of date.
                  stale && "opacity-50",
                  "overflow-y-auto overscroll-contain [scrollbar-gutter:stable] [&::-webkit-scrollbar]:w-2 [&::-webkit-scrollbar-track]:bg-muted/40 [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-muted-foreground/40",
                )}
                style={{ maxHeight: rect.maxHeight }}
              >
                {columns && columns.length > 0 ? (
                  <table id={listboxId} role="listbox" className="w-full border-collapse text-sm">
                    <thead className="sticky top-0 z-10 bg-muted text-left [&_th]:bg-muted">
                      <tr>
                        {columns.map((col) => (
                          <th
                            key={col.key}
                            className={cn(
                              "border-b px-3 py-1.5 text-xs font-medium text-muted-foreground",
                              col.className,
                            )}
                          >
                            {col.label}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {suggestions.map((item, idx) => (
                        <tr
                          key={itemKey(item)}
                          ref={(el) => {
                            optionRefs.current[idx] = el;
                          }}
                          id={`${listboxId}-${idx}`}
                          role="option"
                          aria-selected={idx === highlightIdx}
                          className={cn(
                            "cursor-pointer scroll-mt-8",
                            idx === highlightIdx
                              ? "bg-accent font-medium text-accent-foreground [&>td:first-child]:shadow-[inset_3px_0_0_0_hsl(var(--ring))]"
                              : "hover:bg-muted/60",
                          )}
                          onMouseDown={(e) => {
                            e.preventDefault();
                            selectItem(item);
                          }}
                          onMouseEnter={() => setHighlightIdx(idx)}
                        >
                          {columns.map((col) => (
                            <td key={col.key} className={cn("px-3 py-1.5", col.className)}>
                              {col.render(item)}
                            </td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                ) : (
                  <ul id={listboxId} role="listbox" className="min-w-[280px] py-1">
                    {suggestions.map((item, idx) => (
                      <li
                        key={itemKey(item)}
                        ref={(el) => {
                          optionRefs.current[idx] = el;
                        }}
                        id={`${listboxId}-${idx}`}
                        role="option"
                        aria-selected={idx === highlightIdx}
                        className={cn(
                          "cursor-pointer px-3 py-2 text-sm",
                          idx === highlightIdx
                            ? "bg-accent font-medium text-accent-foreground shadow-[inset_3px_0_0_0_hsl(var(--ring))]"
                            : "bg-popover hover:bg-muted/60",
                        )}
                        onMouseDown={(e) => {
                          e.preventDefault();
                          selectItem(item);
                        }}
                        onMouseEnter={() => setHighlightIdx(idx)}
                      >
                        <div className="font-medium">{renderItem(item)}</div>
                        {renderMeta ? (
                          <div className="text-xs text-muted-foreground">{renderMeta(item)}</div>
                        ) : null}
                      </li>
                    ))}
                  </ul>
                )}
                {loadingMore ? (
                  <div className="border-t px-3 py-2 text-center text-xs text-muted-foreground">
                    Đang tải thêm…
                  </div>
                ) : null}
              </div>
            ) : (
              <div className="px-3 py-2 text-sm text-muted-foreground">Không có dữ liệu.</div>
            )}
          </div>,
          portalTarget,
        )
      : null;

  return (
    <div
      className={cn("relative flex items-stretch", className)}
      ref={wrapRef}
      data-dropdown-open={open ? "true" : undefined}
    >
      <div className="relative flex flex-1 items-stretch">
        <Input
          ref={inputRef}
          id={resolvedId}
          type="text"
          value={value}
          onChange={(e) => handleChange(e.target.value)}
          onFocus={() => {
            if (!disabled) {
              setOpen(true);
              void runSearch(value.trim());
            }
          }}
          onKeyDown={handleKeyDown}
          onCompositionStart={() => {
            isComposingRef.current = true;
          }}
          onCompositionEnd={() => {
            isComposingRef.current = false;
          }}
          placeholder={placeholder}
          disabled={disabled}
          role="combobox"
          aria-expanded={open && hasSuggestions}
          aria-autocomplete="list"
          aria-controls={listboxId}
          aria-activedescendant={
            open && highlightIdx >= 0 ? `${listboxId}-${highlightIdx}` : undefined
          }
          className={cn(
            hideSearchButton ? undefined : "rounded-r-none",
            value ? "pr-14" : "pr-8",
            inputClassName,
          )}
        />
        {value && !disabled ? (
          <button
            type="button"
            aria-label="Xoá lựa chọn"
            tabIndex={-1}
            onClick={handleClear}
            className="absolute right-7 top-1/2 -translate-y-1/2 rounded p-1 text-muted-foreground hover:text-foreground"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        ) : null}
        <button
          type="button"
          aria-label="Mở danh sách"
          tabIndex={-1}
          disabled={disabled}
          onClick={openAndLoad}
          className="absolute right-1 top-1/2 -translate-y-1/2 rounded p-1 text-muted-foreground hover:text-foreground disabled:opacity-50"
        >
          <ChevronDown className="h-4 w-4" />
        </button>
      </div>
      {hideSearchButton ? null : (
        <button
          type="button"
          aria-label="Tìm kiếm"
          disabled={disabled}
          onClick={() => {
            if (onSearchButtonClick) {
              setOpen(false);
              onSearchButtonClick();
              return;
            }
            if (enableSearchModal) {
              setOpen(false);
              setSearchModalOpen(true);
            } else {
              openAndLoad();
            }
          }}
          className="-ml-px flex items-center justify-center border border-input bg-background px-2 text-muted-foreground hover:bg-accent disabled:opacity-50"
        >
          <Search className="h-4 w-4" />
        </button>
      )}
      {createMenuItems && createMenuItems.length > 0 ? (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              type="button"
              aria-label="Thêm mới"
              disabled={disabled}
              onClick={() => setOpen(false)}
              className="-ml-px flex items-center justify-center rounded-r-md border border-input bg-background px-2 text-primary hover:bg-accent disabled:opacity-50"
            >
              <Plus className="h-4 w-4" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start">
            {createMenuItems.map((item) => (
              <DropdownMenuItem key={item.label} onClick={item.onClick}>
                {item.label}
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
      ) : onCreateNew ? (
        <button
          type="button"
          aria-label="Thêm mới"
          disabled={disabled}
          onClick={() => {
            setOpen(false);
            onCreateNew();
          }}
          className="-ml-px flex items-center justify-center rounded-r-md border border-input bg-background px-2 text-primary hover:bg-accent disabled:opacity-50"
        >
          <Plus className="h-4 w-4" />
        </button>
      ) : null}
      {popover}
      {/*
        Mounted only while open. A closed LookupSearchModal still costs a full
        AppModal (Radix Dialog root + portal + a centering pass that reads
        window dimensions), and line-item grids mount one LookupField per
        lookup cell — thousands of dead dialogs on a large document. Its own
        close effect already wipes all state, so unmounting is equivalent to
        closing.
      */}
      {enableSearchModal && searchModalOpen ? (
        <LookupSearchModal
          open
          onOpenChange={setSearchModalOpen}
          onSelect={(item) => selectItem(item)}
          search={search}
          itemKey={itemKey}
          columns={
            columns && columns.length > 0
              ? columns
              : [
                  {
                    key: "label",
                    label: "Tên",
                    render: (item: T) => renderItem(item),
                  },
                ]
          }
          title={searchModalTitle}
          searchPlaceholder={searchModalPlaceholder}
        />
      ) : null}
    </div>
  );
}
