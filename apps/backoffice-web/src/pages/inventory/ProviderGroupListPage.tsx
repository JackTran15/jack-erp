import { useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Minus, Plus, RefreshCw } from "lucide-react";
import type { ToolbarItem } from "@erp/ui";
import { AdminPageShell } from "../../components/layout/AdminPageShell";
import { TableActionHeader } from "../../components/layout/TableActionHeader";
import { CrudRecordDialog } from "../../components/crud/CrudRecordDialog";
import { ActiveStatusBadge } from "../../components/status/StatusBadge";
import { erpApi, requireErpData, requireErpSuccess } from "../../lib/erp-api";
import type { PaginatedResponse } from "@erp/shared-interfaces";

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

// ─── Tree helpers ─────────────────────────────────────────────────────────────

function buildTree(rows: GroupRow[]): TreeNode[] {
  const map = new Map<string, TreeNode>();
  rows.forEach((r) => map.set(r.id, { ...r, children: [], depth: 0 }));
  const roots: TreeNode[] = [];
  map.forEach((node) => {
    const parent = node.parentGroupId ? map.get(node.parentGroupId) : undefined;
    if (parent) parent.children.push(node);
    else roots.push(node);
  });
  const setDepth = (nodes: TreeNode[], d: number) =>
    nodes.forEach((n) => {
      n.depth = d;
      setDepth(n.children, d + 1);
    });
  setDepth(roots, 0);
  return roots;
}

function flattenVisible(nodes: TreeNode[], expanded: Set<string>): TreeNode[] {
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
    ns.forEach((n) => {
      ids.push(n.id);
      walk(n.children);
    });
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
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  // Dialog state
  const [dialogOpen, setDialogOpen] = useState(false);
  const [dialogRecordId, setDialogRecordId] = useState<string | null>(null);
  const openCreate = () => {
    setDialogRecordId(null);
    setDialogOpen(true);
  };
  const openEdit = (id: string) => {
    setDialogRecordId(id);
    setDialogOpen(true);
  };

  // Fetch flat list of all groups
  const { data, isLoading, refetch } = useQuery({
    queryKey: ["crud", "provider-groups", "records-tree"],
    queryFn: async () =>
      requireErpData(
        await erpApi.GET<PaginatedResponse<Record<string, unknown>>>(
          "/admin/entities/{entityKey}/records",
          {
            params: {
              path: { entityKey: "provider-groups" },
              query: { page: 1, pageSize: 100 },
            },
          },
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

  const filteredRows = useMemo(
    () =>
      statusFilter === STATUS_ALL
        ? allRows
        : allRows.filter((r) =>
            statusFilter === STATUS_ACTIVE ? r.isActive : !r.isActive,
          ),
    [allRows, statusFilter],
  );

  const tree = useMemo(() => buildTree(filteredRows), [filteredRows]);
  const allIds = useMemo(() => collectAllIds(tree), [tree]);

  // Auto-expand all on first load — use a ref to avoid state mutation during render
  const didAutoExpand = useRef(false);
  useEffect(() => {
    if (!didAutoExpand.current && allIds.length > 0) {
      setExpanded(new Set(allIds));
      didAutoExpand.current = true;
    }
  }, [allIds]);

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
                <div className="flex flex-col gap-1">
                  <span>Trạng thái</span>
                  <select
                    className="w-full rounded border border-input bg-background px-1 py-0.5 text-xs font-normal"
                    value={statusFilter}
                    onChange={(e) => setStatusFilter(e.target.value)}
                  >
                    <option value={STATUS_ALL}>Tất cả</option>
                    <option value={STATUS_ACTIVE}>Đang theo dõi</option>
                    <option value={STATUS_INACTIVE}>Ngừng theo dõi</option>
                  </select>
                </div>
              </th>
            </tr>
          </thead>
          <tbody>
            {isLoading && (
              <tr>
                <td
                  colSpan={4}
                  className="px-3 py-4 text-center text-muted-foreground"
                >
                  Đang tải…
                </td>
              </tr>
            )}
            {!isLoading && visibleNodes.length === 0 && (
              <tr>
                <td
                  colSpan={4}
                  className="px-3 py-4 text-center text-muted-foreground"
                >
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
                    <ActiveStatusBadge
                      active={node.isActive}
                      activeLabel={statusLabel(true)}
                      inactiveLabel={statusLabel(false)}
                    />
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
