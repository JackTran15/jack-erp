import {
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
  type UIEvent,
} from "react";
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
  onSelectItem?: (item: RawItem) => void;
}

// ─── Tree helpers ────────────────────────────────────────────────────────────

function buildTree(items: RawItem[], excludeId?: string): TreeNode[] {
  // Collect descendant IDs to exclude (the edited node + all its subtree)
  const excluded = new Set<string>();
  if (excludeId) {
    const addDescendants = (id: string) => {
      excluded.add(id);
      items.filter((i) => i.parentGroupId === id).forEach((c) => addDescendants(c.id));
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

function filterTree(nodes: TreeNode[], q: string, ancestorMatched = false): TreeNode[] {
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
  onSelectItem,
}: TreeSelectInputProps) {
  const fallbackId = useId();
  const id = inputId ?? fallbackId;

  const wrapRef = useRef<HTMLDivElement>(null);
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

  useEffect(() => {
    allItemsRef.current = allItems;
  }, [allItems]);

  // Reset when entityKey changes so stale data from a previous entity isn't shown
  useEffect(() => {
    setPaging({ page: 0, total: 0, loaded: 0, query: "" });
    setAllItems([]);
    setInputText("");
  }, [entityKey]);

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
      const map = new Map([...existing, ...items].map((item) => [item.id, item]));
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

  const loadPage = useCallback(async (
    pageToLoad: number,
    queryToLoad: string,
    replace: boolean,
  ) => {
    const seq = ++requestSeqRef.current;
    setLoading(true);
    try {
      const params: { page: number; pageSize: number; search?: string } = {
        page: pageToLoad,
        pageSize: PAGE_SIZE,
      };
      if (queryToLoad) params.search = queryToLoad;

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
  }, [entityKey, hydrateParents]);

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
      setInputText("");
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

  // Close on outside click
  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  const handleFocus = () => {
    if (!disabled) {
      setOpen(true);
    }
  };

  const tree = buildTree(allItems, excludeId);
  const displayTree = query.length >= 1 ? filterTree(tree, query) : tree;
  const displayNodes = flatten(displayTree);
  const hasMore = paging.query === query && paging.loaded < paging.total;

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
    setInputText("");
  };

  const showDropdown = open;

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
          type="search"
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
          className="pr-7"
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

      {showDropdown && (
        <div className="absolute z-50 mt-1 w-full rounded-md border bg-background shadow-md">
          {loading && paging.page === 0 ? (
            <div className="px-3 py-2 text-sm text-muted-foreground">Đang tải…</div>
          ) : displayNodes.length === 0 ? (
            <div className="px-3 py-2 text-sm text-muted-foreground">
              {query ? "Không tìm thấy." : "Không có nhóm nào."}
            </div>
          ) : (
            <div
              className="h-64 overflow-y-auto overscroll-contain"
              onScroll={handleDropdownScroll}
            >
              <ul role="listbox" className="py-1">
                {displayNodes.map((node) => (
                  <li
                    key={node.id}
                    role="option"
                    aria-selected={node.id === value}
                    className={[
                      "cursor-pointer px-3 py-1.5 text-sm",
                      node.id === value ? "bg-primary/10 font-medium" : "hover:bg-muted",
                    ].join(" ")}
                    onMouseDown={(e) => {
                      e.preventDefault();
                      handleSelect(node);
                    }}
                  >
                    <span className="whitespace-pre font-mono text-xs text-muted-foreground">
                      {indentPrefix(node.depth)}
                    </span>
                    <span className="text-xs text-muted-foreground">{node.code}</span>
                    {" · "}
                    <span>{node.name}</span>
                  </li>
                ))}
                {loading || hasMore ? (
                  <li className="px-3 py-2 text-xs text-muted-foreground">
                    {loading ? "Đang tải thêm…" : "Cuộn xuống để tải thêm"}
                  </li>
                ) : null}
              </ul>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
