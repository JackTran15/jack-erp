import {
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  type UIEvent,
} from "react";
import { createPortal } from "react-dom";
import { Input } from "@erp/ui";
import { erpApi, requireErpData } from "../../lib/erp-api";
import type { PaginatedResponse } from "@erp/shared-interfaces";

interface RawItem {
  id: string;
  code: string;
  name: string;
  parentGroupId?: string;
  isActive?: boolean;
}

interface TreeNode extends RawItem {
  children: TreeNode[];
  depth: number;
}

interface PagingState {
  page: number;
  total: number;
  loaded: number;
  query: string;
}

/** Where the portaled list sits. `top` when it opens below the input, `bottom` when it flips above. */
interface PopoverRect {
  top?: number;
  bottom?: number;
  left: number;
  width: number;
  maxHeight: number;
}

export interface TreeSelectInputProps {
  /** The selected item's UUID (empty string = nothing selected). */
  value: string;
  onChange: (id: string) => void;
  /** Generic CRUD entity key to fetch items from. */
  entityKey: string;
  /** Exclude this ID and all its descendants (used when editing a node). */
  excludeId?: string;
  placeholder?: string;
  label?: string;
  required?: boolean;
  error?: string;
  disabled?: boolean;
  inputId?: string;
  /** Extra classes for the text input (e.g. "h-9 text-xs" in dense filter rows). */
  inputClassName?: string;
  /** Render a pinned "all/none" option at the top that selects the empty value. */
  allOptionLabel?: string;
  onSelectItem?: (item: RawItem) => void;
  /**
   * Extra `filters` for the records query (keys must be in the entity's
   * `filterDefinitions`), e.g. `{ direction: "OUT" }` so a Mục chi only
   * offers Mục chi parents. Parent hydration is by id and ignores them.
   */
  filters?: Record<string, unknown>;
}

// ─── Tree helpers ────────────────────────────────────────────────────────────

function buildTree(items: RawItem[], excludeId?: string): TreeNode[] {
  // Collect descendant IDs to exclude (the edited node + all its subtree)
  const excluded = new Set<string>();
  if (excludeId) {
    const addDescendants = (id: string) => {
      excluded.add(id);
      items
        .filter((i) => i.parentGroupId === id)
        .forEach((c) => addDescendants(c.id));
    };
    addDescendants(excludeId);
  }

  const filtered = items.filter((i) => !excluded.has(i.id));
  const map = new Map<string, TreeNode>();
  filtered.forEach((i) => map.set(i.id, { ...i, children: [], depth: 0 }));

  const roots: TreeNode[] = [];
  map.forEach((node) => {
    const parent = node.parentGroupId ? map.get(node.parentGroupId) : undefined;
    if (parent) {
      parent.children.push(node);
    } else {
      roots.push(node);
    }
  });

  const assignDepth = (nodes: TreeNode[], depth: number) => {
    nodes.forEach((n) => {
      n.depth = depth;
      assignDepth(n.children, depth + 1);
    });
  };
  assignDepth(roots, 0);
  return roots;
}

function flatten(nodes: TreeNode[]): TreeNode[] {
  const result: TreeNode[] = [];
  const walk = (ns: TreeNode[]) => {
    ns.forEach((n) => {
      result.push(n);
      walk(n.children);
    });
  };
  walk(nodes);
  return result;
}

function filterTree(
  nodes: TreeNode[],
  q: string,
  ancestorMatched = false,
): TreeNode[] {
  return nodes.flatMap((node) => {
    const selfMatched = matchesSearch(node, q);
    const includeDescendants = ancestorMatched || selfMatched;
    const children = includeDescendants
      ? node.children.map((child) => ({
          ...child,
          children: filterTree(child.children, q, true),
        }))
      : filterTree(node.children, q, false);

    if (!selfMatched && children.length === 0 && !ancestorMatched) return [];
    return [{ ...node, children }];
  });
}

function matchesSearch(node: TreeNode, q: string): boolean {
  const lower = q.toLowerCase();
  return (
    node.name.toLowerCase().includes(lower) ||
    node.code.toLowerCase().includes(lower)
  );
}

function indentPrefix(depth: number): string {
  if (depth === 0) return "";
  return "  ".repeat(depth * 2) + "— ";
}

function mapRecord(r: Record<string, unknown>): RawItem {
  return {
    id: String(r.id ?? ""),
    code: String(r.code ?? ""),
    name: String(r.name ?? ""),
    parentGroupId: r.parentGroupId ? String(r.parentGroupId) : undefined,
    isActive: r.isActive !== false,
  };
}

function mergeItems(current: RawItem[], next: RawItem[]): RawItem[] {
  const map = new Map(current.map((item) => [item.id, item]));
  for (const item of next) {
    if (item.id) map.set(item.id, item);
  }
  return [...map.values()];
}

const PAGE_SIZE = 8;

const POPOVER_GAP = 4;
const POPOVER_VIEWPORT_MARGIN = 8;
const POPOVER_MAX_HEIGHT = 320;
const POPOVER_MIN_HEIGHT = 140;

// ─── Component ───────────────────────────────────────────────────────────────

export function TreeSelectInput({
  value,
  onChange,
  entityKey,
  excludeId,
  placeholder = "Chọn…",
  label,
  required,
  error,
  disabled,
  inputId,
  inputClassName,
  allOptionLabel,
  onSelectItem,
  filters,
}: TreeSelectInputProps) {
  const fallbackId = useId();
  const id = inputId ?? fallbackId;
  // Serialised once so the effects below re-run on content, not identity.
  const filtersJson =
    filters && Object.keys(filters).length ? JSON.stringify(filters) : undefined;

  const wrapRef = useRef<HTMLDivElement>(null);
  const popoverRef = useRef<HTMLDivElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const requestSeqRef = useRef(0);
  const allItemsRef = useRef<RawItem[]>([]);
  const [open, setOpen] = useState(false);
  const [inputText, setInputText] = useState("");
  const [loading, setLoading] = useState(false);
  const [allItems, setAllItems] = useState<RawItem[]>([]);
  const [paging, setPaging] = useState<PagingState>({
    page: 0,
    total: 0,
    loaded: 0,
    query: "",
  });
  const [rect, setRect] = useState<PopoverRect | null>(null);
  const [portalTarget, setPortalTarget] = useState<HTMLElement | null>(null);

  useEffect(() => {
    allItemsRef.current = allItems;
  }, [allItems]);

  // Reset when entityKey changes so stale data from a previous entity isn't shown
  useEffect(() => {
    setPaging({ page: 0, total: 0, loaded: 0, query: "" });
    setAllItems([]);
    setInputText(allOptionLabel ?? "");
  }, [entityKey, allOptionLabel]);

  const fetchRecord = useCallback(
    async (recordId: string): Promise<RawItem | null> => {
      try {
        const record = await requireErpData(
          await erpApi.GET<Record<string, unknown>>(
            "/admin/entities/{entityKey}/records/{id}",
            { params: { path: { entityKey, id: recordId } } },
          ),
        );
        return mapRecord(record);
      } catch {
        return null;
      }
    },
    [entityKey],
  );

  const hydrateParents = useCallback(
    async (items: RawItem[], existing: RawItem[]): Promise<RawItem[]> => {
      const map = new Map(
        [...existing, ...items].map((item) => [item.id, item]),
      );
      const parents: RawItem[] = [];

      for (const item of items) {
        let parentId = item.parentGroupId;
        const visited = new Set<string>();
        while (parentId && !map.has(parentId) && !visited.has(parentId)) {
          visited.add(parentId);
          const parent = await fetchRecord(parentId);
          if (!parent) break;
          parents.push(parent);
          map.set(parent.id, parent);
          parentId = parent.parentGroupId;
        }
      }

      return parents;
    },
    [fetchRecord],
  );

  const loadPage = useCallback(
    async (pageToLoad: number, queryToLoad: string, replace: boolean) => {
      const seq = ++requestSeqRef.current;
      setLoading(true);
      try {
        const params: {
          page: number;
          pageSize: number;
          search?: string;
          filters?: string;
        } = {
          page: pageToLoad,
          pageSize: PAGE_SIZE,
        };
        if (queryToLoad) params.search = queryToLoad;
        if (filtersJson) params.filters = filtersJson;

        const res = await requireErpData(
          await erpApi.GET<PaginatedResponse<Record<string, unknown>>>(
            "/admin/entities/{entityKey}/records",
            { params: { path: { entityKey }, query: params } },
          ),
        );
        if (seq !== requestSeqRef.current) return;

        const pageItems = res.data.map(mapRecord);
        const baseItems = replace ? [] : allItemsRef.current;
        const parentItems = await hydrateParents(pageItems, baseItems);
        if (seq !== requestSeqRef.current) return;

        setAllItems((prev) =>
          mergeItems(replace ? [] : prev, [...parentItems, ...pageItems]),
        );
        setPaging((prev) => ({
          page: pageToLoad,
          total: res.total,
          loaded: replace ? res.data.length : prev.loaded + res.data.length,
          query: queryToLoad,
        }));
      } catch {
        // silently fail — dropdown stays empty
      } finally {
        if (seq === requestSeqRef.current) setLoading(false);
      }
    },
    [entityKey, filtersJson, hydrateParents],
  );

  const query = inputText.trim();

  useEffect(() => {
    if (!open || disabled) return;
    setAllItems([]);
    setPaging({ page: 0, total: 0, loaded: 0, query });
    const t = window.setTimeout(() => {
      void loadPage(1, query, true);
    }, 180);
    return () => window.clearTimeout(t);
  }, [disabled, loadPage, open, query]);

  // Sync display text when value changes externally (edit prefill)
  useEffect(() => {
    if (!value) {
      setInputText(allOptionLabel ?? "");
      return;
    }
    const found = allItemsRef.current.find((i) => i.id === value);
    if (found) {
      setInputText(`${found.code} · ${found.name}`);
      return;
    }
    void (async () => {
      const item = await fetchRecord(value);
      if (!item) return;
      const parents = await hydrateParents([item], allItemsRef.current);
      setAllItems((prev) => mergeItems(prev, [...parents, item]));
      setInputText(`${item.code} · ${item.name}`);
    })();
  }, [fetchRecord, hydrateParents, value]);

  // Close on outside click. The list is portaled out of `wrapRef`, so it has
  // to be checked separately — otherwise picking an option would count as an
  // outside click and its `setInputText` below would overwrite the selection.
  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      const target = e.target as Node;
      if (wrapRef.current?.contains(target)) return;
      if (popoverRef.current?.contains(target)) return;
      setOpen(false);
      if (!value) setInputText(allOptionLabel ?? "");
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open, value, allOptionLabel]);

  // The list is rendered through a portal as a `position: fixed` box measured
  // from the input, so no ancestor `overflow` or `contain: paint` (AppModal,
  // Radix PopoverContent) can clip it. Same mechanism as LookupField.
  useLayoutEffect(() => {
    if (!open) {
      setRect(null);
      setPortalTarget(null);
      return;
    }
    const wrapEl = wrapRef.current;
    if (!wrapEl) return;
    const dialog = wrapEl.closest('[role="dialog"]') as HTMLElement | null;
    const target = dialog ?? document.body;
    setPortalTarget(target);

    // A host that paints-contains or clips (AppModal's DialogContent) also
    // clips the portaled list, so the room to open into is the host's box,
    // not the viewport. Radix PopoverContent neither contains nor clips.
    const hostClips = (() => {
      if (target === document.body) return false;
      const cs = getComputedStyle(target);
      return /paint|content|strict/.test(cs.contain) || cs.overflowY !== "visible";
    })();

    const measure = () => {
      const r = wrapEl.getBoundingClientRect();
      // Containing block of a `position: fixed` child when the host has
      // `contain: layout` or a transform — coordinates are relative to it.
      const host = target === document.body ? null : target.getBoundingClientRect();
      const boundTop = host && hostClips ? Math.max(0, host.top) : 0;
      const boundBottom =
        host && hostClips
          ? Math.min(window.innerHeight, host.bottom)
          : window.innerHeight;
      const availableBelow = boundBottom - r.bottom - POPOVER_VIEWPORT_MARGIN;
      const availableAbove = r.top - boundTop - POPOVER_VIEWPORT_MARGIN;
      // Prefer below; flip above when the full box does not fit below but
      // there is more room above (the usual case for a field low in a dialog).
      const placeBelow =
        availableBelow >= POPOVER_MAX_HEIGHT || availableBelow >= availableAbove;
      const maxHeight = Math.min(
        POPOVER_MAX_HEIGHT,
        Math.max(
          POPOVER_MIN_HEIGHT,
          placeBelow ? availableBelow : availableAbove,
        ),
      );
      const left = r.left - (host?.left ?? 0);
      if (placeBelow) {
        setRect({
          top: r.bottom + POPOVER_GAP - (host?.top ?? 0),
          left,
          width: r.width,
          maxHeight,
        });
      } else {
        // Anchor by `bottom` so a list shorter than `maxHeight` still hugs the input.
        const hostBottom = host ? host.bottom : window.innerHeight;
        setRect({
          bottom: hostBottom - (r.top - POPOVER_GAP),
          left,
          width: r.width,
          maxHeight,
        });
      }
    };
    measure();

    // Capture phase so a scrolling modal body re-anchors the list; the list's
    // own scroll is skipped, it moves nothing.
    const onScroll = (e: Event) => {
      if (popoverRef.current?.contains(e.target as Node)) return;
      measure();
    };
    window.addEventListener("scroll", onScroll, true);
    window.addEventListener("resize", measure);
    return () => {
      window.removeEventListener("scroll", onScroll, true);
      window.removeEventListener("resize", measure);
    };
  }, [open]);

  const handleFocus = () => {
    if (!disabled) {
      // inputText may hold the "all" display label rather than a real search
      // query — clear it so opening the dropdown loads the full tree instead
      // of searching for a category literally named e.g. "Tất cả nhóm".
      if (!value) setInputText("");
      setOpen(true);
    }
  };

  const tree = buildTree(allItems, excludeId);
  const displayTree = query.length >= 1 ? filterTree(tree, query) : tree;
  const displayNodes = flatten(displayTree);
  const hasMore = paging.query === query && paging.loaded < paging.total;

  // A page of PAGE_SIZE rows may not overflow the box, in which case
  // `onScroll` never fires; keep fetching until it does or the server runs out.
  useEffect(() => {
    if (!open || loading || !hasMore) return;
    const el = scrollRef.current;
    if (!el || el.scrollHeight <= el.clientHeight + 1) {
      void loadPage(paging.page + 1, query, false);
    }
  }, [open, loading, hasMore, allItems.length, loadPage, paging.page, query]);

  const handleDropdownScroll = (event: UIEvent<HTMLDivElement>) => {
    const target = event.currentTarget;
    const nearBottom =
      target.scrollTop + target.clientHeight >= target.scrollHeight - 24;
    if (!nearBottom || loading || !hasMore) return;
    void loadPage(paging.page + 1, query, false);
  };

  const handleSelect = (node: TreeNode) => {
    onChange(node.id);
    onSelectItem?.(node);
    setInputText(`${node.code} · ${node.name}`);
    setOpen(false);
  };

  const handleClear = () => {
    onChange("");
    setInputText(allOptionLabel ?? "");
  };

  const popover =
    open && rect && portalTarget
      ? createPortal(
          <div
            ref={popoverRef}
            data-lookup-popover=""
            style={{
              position: "fixed",
              top: rect.top,
              bottom: rect.bottom,
              left: rect.left,
              width: rect.width,
              zIndex: 70,
              pointerEvents: "auto",
            }}
            className="overflow-hidden rounded-md border bg-background shadow-md"
          >
            {loading && paging.page === 0 ? (
              <div className="px-3 py-2 text-sm text-muted-foreground">
                Đang tải…
              </div>
            ) : displayNodes.length === 0 && !allOptionLabel ? (
              <div className="px-3 py-2 text-sm text-muted-foreground">
                {query ? "Không tìm thấy." : "Không có nhóm nào."}
              </div>
            ) : (
              <div
                ref={scrollRef}
                className="overflow-y-auto overscroll-contain"
                style={{ maxHeight: rect.maxHeight }}
                onScroll={handleDropdownScroll}
              >
                <ul role="listbox" className="py-1">
                  {allOptionLabel ? (
                    <li
                      role="option"
                      aria-selected={!value}
                      className={[
                        "cursor-pointer px-3 py-1.5 text-sm",
                        !value ? "bg-primary/10" : "hover:bg-muted",
                      ].join(" ")}
                      onMouseDown={(e) => {
                        e.preventDefault();
                        handleClear();
                        setOpen(false);
                      }}
                    >
                      {allOptionLabel}
                    </li>
                  ) : null}
                  {displayNodes.map((node) => (
                    <li
                      key={node.id}
                      role="option"
                      aria-selected={node.id === value}
                      className={[
                        "cursor-pointer px-3 py-1.5 text-sm",
                        node.id === value
                          ? "bg-primary/10 font-medium"
                          : "hover:bg-muted",
                      ].join(" ")}
                      onMouseDown={(e) => {
                        e.preventDefault();
                        handleSelect(node);
                      }}
                    >
                      <span className="whitespace-pre font-mono text-xs text-muted-foreground">
                        {indentPrefix(node.depth)}
                      </span>
                      <span className="text-xs text-muted-foreground">
                        {node.code}
                      </span>
                      {" · "}
                      <span>{node.name}</span>
                    </li>
                  ))}
                  {loading || hasMore ? (
                    <li className="px-3 py-2 text-xs text-muted-foreground">
                      {loading ? "Đang tải thêm…" : ""}
                    </li>
                  ) : null}
                </ul>
              </div>
            )}
          </div>,
          portalTarget,
        )
      : null;

  return (
    <div className="relative" ref={wrapRef}>
      {label && (
        <label htmlFor={id} className="mb-1 block text-sm font-medium">
          {label}
          {required && <span className="ml-0.5 text-destructive">*</span>}
        </label>
      )}

      <div className="relative flex items-center">
        <Input
          id={id}
          type="text"
          value={inputText}
          placeholder={placeholder}
          disabled={disabled}
          required={required}
          aria-invalid={error ? true : undefined}
          autoComplete="off"
          onChange={(e) => {
            setInputText(e.target.value);
            if (!open) setOpen(true);
            if (e.target.value === "") onChange("");
          }}
          onFocus={handleFocus}
          className={["pr-7", inputClassName].filter(Boolean).join(" ")}
        />
        {value && !disabled && (
          <button
            type="button"
            onClick={handleClear}
            className="absolute right-2 text-muted-foreground hover:text-foreground"
            tabIndex={-1}
            aria-label="Xoá lựa chọn"
          >
            ×
          </button>
        )}
      </div>

      {popover}
    </div>
  );
}
