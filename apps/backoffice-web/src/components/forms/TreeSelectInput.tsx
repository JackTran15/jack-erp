import {
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
} from "react";
import { Input, ScrollArea } from "@erp/ui";
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
}: TreeSelectInputProps) {
  const fallbackId = useId();
  const id = inputId ?? fallbackId;

  const wrapRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [inputText, setInputText] = useState("");
  const [loading, setLoading] = useState(false);
  const [allItems, setAllItems] = useState<RawItem[]>([]);
  const [loaded, setLoaded] = useState(false);

  // Reset when entityKey changes so stale data from a previous entity isn't shown
  useEffect(() => {
    setLoaded(false);
    setAllItems([]);
    setInputText("");
  }, [entityKey]);

  // Load all items once per entityKey
  const loadItems = useCallback(async () => {
    if (loaded) return;
    setLoading(true);
    try {
      const res = await requireErpData(
        await erpApi.GET<PaginatedResponse<Record<string, unknown>>>(
          "/admin/entities/{entityKey}/records",
          { params: { path: { entityKey }, query: { page: 1, pageSize: 100 } } },
        ),
      );
      const items = res.data.map((r) => ({
        id: String(r.id ?? ""),
        code: String(r.code ?? ""),
        name: String(r.name ?? ""),
        parentGroupId: r.parentGroupId ? String(r.parentGroupId) : undefined,
        isActive: r.isActive !== false,
      }));
      setAllItems(items);
      setLoaded(true);
    } catch {
      // silently fail — dropdown stays empty
    } finally {
      setLoading(false);
    }
  }, [entityKey, loaded]);

  // Sync display text when value changes externally (edit prefill)
  useEffect(() => {
    if (!value) {
      setInputText("");
      return;
    }
    if (allItems.length === 0) return;
    const found = allItems.find((i) => i.id === value);
    if (found) setInputText(`${found.code} · ${found.name}`);
  }, [value, allItems]);

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
      void loadItems();
    }
  };

  const tree = buildTree(allItems, excludeId);
  const flat = flatten(tree);

  const query = inputText.trim();
  const displayNodes: (TreeNode & { isFiltered?: boolean })[] =
    query.length >= 1
      ? flat.filter((n) => matchesSearch(n, query)).map((n) => ({ ...n, isFiltered: true }))
      : flat;

  const handleSelect = (node: TreeNode) => {
    onChange(node.id);
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
            if (!loaded) void loadItems();
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
          {loading && !loaded ? (
            <div className="px-3 py-2 text-sm text-muted-foreground">Đang tải…</div>
          ) : displayNodes.length === 0 ? (
            <div className="px-3 py-2 text-sm text-muted-foreground">
              {query ? "Không tìm thấy." : "Không có nhóm nào."}
            </div>
          ) : (
            <ScrollArea className="max-h-64">
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
                      {node.isFiltered ? "" : indentPrefix(node.depth)}
                    </span>
                    <span className="text-xs text-muted-foreground">{node.code}</span>
                    {" · "}
                    <span>{node.name}</span>
                  </li>
                ))}
              </ul>
            </ScrollArea>
          )}
        </div>
      )}
    </div>
  );
}
