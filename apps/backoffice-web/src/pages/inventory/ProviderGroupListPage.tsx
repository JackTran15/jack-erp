import { useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Minus, Plus, RefreshCw } from "lucide-react";
import { Input, type ToolbarItem } from "@erp/ui";
import { AdminPageShell } from "../../components/layout/AdminPageShell";
import { TableActionHeader } from "../../components/layout/TableActionHeader";
import { CrudRecordDialog } from "../../components/crud/CrudRecordDialog";
import { columnToStringFilter } from "../../components/crud/crudV2Search";
import { ColumnFilterModeDropdown } from "../../components/table/ColumnFilterModeControl";
import {
  DEFAULT_COLUMN_FILTER_MODE,
  type ColumnFilter,
  type ColumnFilterMode,
} from "../../components/table/pagination.dto";
import { useDebouncedValue } from "../../lib/use-debounced-value";
import { erpApi, requireErpData, requireErpSuccess } from "../../lib/erp-api";

// ─── Types ────────────────────────────────────────────────────────────────────

interface GroupRow {
  id: string;
  code: string;
  name: string;
  description?: string;
  isActive: boolean;
  parentGroupId?: string;
}

interface TreeNode extends GroupRow {
  children: TreeNode[];
  depth: number;
}

interface ProviderGroupSearchResponse {
  data: GroupRow[];
  total: number;
  page: number;
  limit: number;
}

const FILTER_KEYS = ["code", "name", "description"] as const;
type FilterKey = (typeof FILTER_KEYS)[number];

function emptyColumnFilters(): Record<FilterKey, ColumnFilter> {
  return FILTER_KEYS.reduce(
    (acc, key) => {
      acc[key] = { mode: DEFAULT_COLUMN_FILTER_MODE, value: "" };
      return acc;
    },
    {} as Record<FilterKey, ColumnFilter>,
  );
}

// ─── Tree helpers ─────────────────────────────────────────────────────────────

function buildTree(rows: GroupRow[]): TreeNode[] {
  const map = new Map<string, TreeNode>();
  rows.forEach((r) =>
    map.set(r.id, { ...r, children: [], depth: 0 }),
  );
  const roots: TreeNode[] = [];
  map.forEach((node) => {
    const parent = node.parentGroupId ? map.get(node.parentGroupId) : undefined;
    if (parent) parent.children.push(node);
    else roots.push(node);
  });
  const setDepth = (nodes: TreeNode[], d: number) =>
    nodes.forEach((n) => { n.depth = d; setDepth(n.children, d + 1); });
  setDepth(roots, 0);
  return roots;
}

function flattenVisible(
  nodes: TreeNode[],
  expanded: Set<string>,
): TreeNode[] {
  const result: TreeNode[] = [];
  const walk = (ns: TreeNode[]) => {
    ns.forEach((n) => {
      result.push(n);
      if (n.children.length > 0 && expanded.has(n.id)) walk(n.children);
    });
  };
  walk(nodes);
  return result;
}

function collectAllIds(nodes: TreeNode[]): string[] {
  const ids: string[] = [];
  const walk = (ns: TreeNode[]) =>
    ns.forEach((n) => { ids.push(n.id); walk(n.children); });
  walk(nodes);
  return ids;
}

// ─── Status helpers ───────────────────────────────────────────────────────────

const STATUS_ALL = "";
const STATUS_ACTIVE = "true";
const STATUS_INACTIVE = "false";

function statusLabel(isActive: boolean) {
  return isActive ? "Đang theo dõi" : "Ngừng theo dõi";
}

// ─── Component ────────────────────────────────────────────────────────────────

export function ProviderGroupListPage() {
  const qc = useQueryClient();

  const [selected, setSelected] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<string>(STATUS_ALL);
  const [columnFilters, setColumnFilters] =
    useState<Record<FilterKey, ColumnFilter>>(emptyColumnFilters);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const debouncedFilters = useDebouncedValue(columnFilters, 300);
  const searchBody = useMemo(
    () => ({
      code: columnToStringFilter(debouncedFilters.code),
      name: columnToStringFilter(debouncedFilters.name),
      description: columnToStringFilter(debouncedFilters.description),
      isActive:
        statusFilter === STATUS_ACTIVE
          ? true
          : statusFilter === STATUS_INACTIVE
            ? false
            : undefined,
    }),
    [debouncedFilters, statusFilter],
  );

  // Dialog state
  const [dialogOpen, setDialogOpen] = useState(false);
  const [dialogRecordId, setDialogRecordId] = useState<string | null>(null);
  const openCreate = () => { setDialogRecordId(null); setDialogOpen(true); };
  const openEdit = (id: string) => { setDialogRecordId(id); setDialogOpen(true); };

  // The search endpoint returns matching groups plus their ancestors so the
  // existing tree can be rendered without loading/filtering the whole dataset.
  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ["crud", "provider-groups", "search-tree", searchBody],
    queryFn: async () =>
      requireErpData(
        await erpApi.POST<ProviderGroupSearchResponse>(
          "/v2/provider-groups/search",
          { body: searchBody },
        ),
      ),
  });

  const allRows: GroupRow[] = useMemo(
    () =>
      (data?.data ?? []).map((r) => ({
        id: String(r.id ?? ""),
        code: String(r.code ?? ""),
        name: String(r.name ?? ""),
        description: r.description ? String(r.description) : undefined,
        isActive: r.isActive !== false,
        parentGroupId: r.parentGroupId ? String(r.parentGroupId) : undefined,
      })),
    [data],
  );

  const tree = useMemo(() => buildTree(allRows), [allRows]);
  const allIds = useMemo(() => collectAllIds(tree), [tree]);
  const hasActiveFilter =
    statusFilter !== STATUS_ALL ||
    FILTER_KEYS.some((key) => columnFilters[key].value.trim().length > 0);

  // Auto-expand all on first load — use a ref to avoid state mutation during render
  const didAutoExpand = useRef(false);
  useEffect(() => {
    if ((!didAutoExpand.current || hasActiveFilter) && allIds.length > 0) {
      setExpanded(new Set(allIds));
      didAutoExpand.current = true;
    }
  }, [allIds, hasActiveFilter]);

  const visibleNodes = useMemo(
    () => flattenVisible(tree, expanded),
    [tree, expanded],
  );

  // Mutations
  const deleteMutation = useMutation({
    mutationFn: async (id: string) =>
      requireErpSuccess(
        await erpApi.DELETE("/admin/entities/{entityKey}/records/{id}", {
          params: { path: { entityKey: "provider-groups", id } },
        }),
      ),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["crud", "provider-groups"] });
      setSelected(null);
    },
  });

  // Toggle expand/collapse for a node
  const toggle = (id: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const expandAll = () => setExpanded(new Set(allIds));
  const collapseAll = () => setExpanded(new Set());

  const handleDelete = () => {
    if (!selected) return;
    if (!confirm("Xoá nhóm nhà cung cấp này?")) return;
    deleteMutation.mutate(selected);
  };

  const handleModeChange = (key: FilterKey, mode: ColumnFilterMode) => {
    setColumnFilters((prev) => ({
      ...prev,
      [key]: { ...prev[key], mode },
    }));
    setSelected(null);
  };

  const handleValueChange = (key: FilterKey, value: string) => {
    setColumnFilters((prev) => ({
      ...prev,
      [key]: { ...prev[key], value },
    }));
    setSelected(null);
  };

  const toolbar: ToolbarItem[] = [
    {
      id: "new",
      label: "Thêm mới",
      onClick: openCreate,
    },
    { id: "sep1", type: "separator" },
    {
      id: "edit",
      label: "Sửa",
      disabled: !selected,
      onClick: () => selected && openEdit(selected),
    },
    {
      id: "delete",
      label: "Xóa",
      variant: "danger",
      disabled: !selected,
      onClick: handleDelete,
    },
    { id: "sep2", type: "separator" },
    {
      id: "refresh",
      label: "Nạp",
      icon: RefreshCw,
      onClick: () => void refetch(),
    },
    { id: "sep3", type: "separator" },
    {
      id: "expand",
      label: "Mở rộng",
      onClick: expandAll,
    },
    {
      id: "collapse",
      label: "Thu gọn",
      onClick: collapseAll,
    },
  ];

  return (
    <AdminPageShell>
      <TableActionHeader
        breadcrumbs={[
          { label: "Danh mục", to: "#" },
          { label: "Nhóm nhà cung cấp" },
        ]}
        items={toolbar}
      />

      <div className="mt-0 flex-1 overflow-auto">
        {isError && (
          <p className="border-b border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive">
            Không tải được danh sách nhóm nhà cung cấp.
          </p>
        )}
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr className="border-b bg-background">
              <th className="px-3 py-2 text-left font-medium text-foreground">
                Mã nhóm NCC
              </th>
              <th className="px-3 py-2 text-left font-medium text-foreground">
                Tên nhóm NCC
              </th>
              <th className="px-3 py-2 text-left font-medium text-foreground">
                Mô tả
              </th>
              <th className="w-44 px-3 py-2 text-left font-medium text-foreground">
                Trạng thái
              </th>
            </tr>
            <tr className="border-b bg-background">
              {FILTER_KEYS.map((key) => (
                <th key={key} className="px-2 py-1">
                  <div className="flex items-center gap-1">
                    <ColumnFilterModeDropdown
                      fieldLabel={
                        key === "code"
                          ? "Mã nhóm NCC"
                          : key === "name"
                            ? "Tên nhóm NCC"
                            : "Mô tả"
                      }
                      value={columnFilters[key].mode}
                      onChange={(mode) => handleModeChange(key, mode)}
                    />
                    <Input
                      className="h-8 min-w-0 flex-1 text-xs font-normal"
                      placeholder="Giá trị..."
                      value={columnFilters[key].value}
                      onChange={(event) =>
                        handleValueChange(key, event.target.value)
                      }
                    />
                  </div>
                </th>
              ))}
              <th className="px-2 py-1">
                <select
                  className="h-8 w-full rounded border border-input bg-background px-2 text-xs font-normal"
                  value={statusFilter}
                  onChange={(event) => {
                    setStatusFilter(event.target.value);
                    setSelected(null);
                  }}
                  aria-label="Lọc Trạng thái"
                >
                  <option value={STATUS_ALL}>Tất cả</option>
                  <option value={STATUS_ACTIVE}>Đang theo dõi</option>
                  <option value={STATUS_INACTIVE}>Ngừng theo dõi</option>
                </select>
              </th>
            </tr>
          </thead>
          <tbody>
            {isLoading && (
              <tr>
                <td colSpan={4} className="px-3 py-4 text-center text-muted-foreground">
                  Đang tải…
                </td>
              </tr>
            )}
            {!isLoading && visibleNodes.length === 0 && (
              <tr>
                <td colSpan={4} className="px-3 py-4 text-center text-muted-foreground">
                  Không có dữ liệu.
                </td>
              </tr>
            )}
            {visibleNodes.map((node) => {
              const hasChildren = node.children.length > 0;
              const isExpanded = expanded.has(node.id);
              const isSelected = selected === node.id;
              const indent = node.depth * 20;

              return (
                <tr
                  key={node.id}
                  onClick={() => setSelected(isSelected ? null : node.id)}
                  className={[
                    "cursor-pointer border-b transition-colors",
                    isSelected
                      ? "bg-primary/10"
                      : hasChildren
                        ? "bg-muted/40 hover:bg-muted/60"
                        : "hover:bg-muted/30",
                  ].join(" ")}
                >
                  {/* Code column with expand toggle + indentation */}
                  <td className="px-3 py-2">
                    <div
                      className="flex items-center gap-1"
                      style={{ paddingLeft: `${indent}px` }}
                    >
                      {hasChildren ? (
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            toggle(node.id);
                          }}
                          className="flex h-4 w-4 shrink-0 items-center justify-center rounded text-muted-foreground hover:text-foreground"
                          aria-label={isExpanded ? "Thu gọn" : "Mở rộng"}
                        >
                          {isExpanded ? (
                            <Minus className="h-3 w-3" />
                          ) : (
                            <Plus className="h-3 w-3" />
                          )}
                        </button>
                      ) : (
                        <span className="w-4 shrink-0" />
                      )}
                      <span className={hasChildren ? "font-semibold" : ""}>
                        {node.code}
                      </span>
                    </div>
                  </td>

                  {/* Name */}
                  <td className="px-3 py-2">
                    <span className={hasChildren ? "font-semibold" : ""}>
                      {node.name}
                    </span>
                  </td>

                  {/* Description */}
                  <td className="px-3 py-2 text-muted-foreground">
                    {node.description ?? ""}
                  </td>

                  {/* Status */}
                  <td className="px-3 py-2">
                    <span className={hasChildren ? "font-semibold" : ""}>
                      {statusLabel(node.isActive)}
                    </span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <CrudRecordDialog
        entityKey="provider-groups"
        recordId={dialogRecordId}
        open={dialogOpen}
        onClose={() => setDialogOpen(false)}
        onSuccess={() => {
          void qc.invalidateQueries({ queryKey: ["crud", "provider-groups"] });
          setSelected(null);
        }}
      />
    </AdminPageShell>
  );
}
