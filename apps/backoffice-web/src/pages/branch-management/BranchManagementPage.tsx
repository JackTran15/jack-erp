import { useCallback, useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { PageToolbar } from "@erp/ui";
import { Pencil, Plus, RefreshCw, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { BaseDataTable } from "../../components/table/BaseDataTable";
import type { TableColumn } from "../../components/table/BaseDataTable";
import { PaginationControls } from "../../components/table/PaginationControls";
import type { ColumnFilter } from "../../components/table/pagination.dto";
import { erpApi, requireErpData, requireErpSuccess } from "../../lib/erp-api";
import { getUserFacingApiErrorMessage } from "../../lib/user-facing-api-error";
import { useAuth } from "../../hooks/useAuth";
import { useInvalidateBranches } from "../../hooks/iam/useBranches";
import { BranchFormDialog } from "./BranchFormDialog";
import { BRANCH_STATUS_VI, type BranchRow } from "./branch-rows";

interface BranchListResponse {
  data: BranchRow[];
  total: number;
}

/**
 * Hand-built rather than `CrudListPage` (ADR-08). The store lifecycle needs a
 * status column with its own vocabulary, a filter that opens on the operating
 * stores, and an edit dialog with a confirmation — each of which would have
 * become another per-entity branch inside shared CRUD components that already
 * carry 60+ of them.
 *
 * Shape follows `ItemLocationDetailsPage`: local filter state, one query that
 * sends those filters to the entity's own endpoint, `BaseDataTable` for render.
 */
export function BranchManagementPage() {
  const { refresh } = useAuth();
  const invalidateBranches = useInvalidateBranches();

  // Opens on the operating stores. "Tất cả" (empty value) is what makes a
  // suspended store reachable again, so this is a default, never a restriction.
  const [filters, setFilters] = useState<Record<string, ColumnFilter>>({
    status: { mode: "equals", value: "ACTIVE" },
  });
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<BranchRow | null>(null);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    setPage(1);
    setSelectedId(null);
  }, [filters]);

  const statusFilter = filters.status?.value?.trim() ?? "";

  const query = useQuery({
    queryKey: ["branch-management", page, pageSize, statusFilter],
    queryFn: async () => {
      const params: Record<string, string | number> = { page, pageSize };
      // No status picked means "Tất cả", which needs the escape hatch — the
      // endpoint hides non-operating branches by default for every picker.
      if (statusFilter) params.status = statusFilter;
      else params.includeInactive = "true";
      return requireErpData(
        await erpApi.GET<BranchListResponse>("/branches", { params: { query: params } }),
      );
    },
  });

  const rows = query.data?.data ?? [];
  const total = query.data?.total ?? 0;
  const selected = rows.find((r) => r.id === selectedId) ?? null;

  const reload = useCallback(() => {
    void query.refetch();
  }, [query]);

  const handleSaved = useCallback(() => {
    void query.refetch();
    // The active branch may have just vanished from the user's own list.
    void refresh();
    invalidateBranches();
  }, [query, refresh, invalidateBranches]);

  const handleDelete = async () => {
    if (!selected) return;
    setDeleting(true);
    try {
      // Deletion stays on the generic CRUD route: BranchCrudService.remove is
      // where the ~35-table dependency scan lives, and it has no counterpart
      // under /branches.
      requireErpSuccess(
        await erpApi.DELETE(`/admin/entities/branches/records/${selected.id}`),
      );
      toast.success("Đã xoá cửa hàng.");
      setSelectedId(null);
      handleSaved();
    } catch (err) {
      toast.error(getUserFacingApiErrorMessage(err));
    } finally {
      setDeleting(false);
    }
  };

  const columns = useMemo<TableColumn<BranchRow>[]>(
    () => [
      { key: "name", label: "Tên", render: (r) => r.name, width: 320 },
      { key: "code", label: "Mã cửa hàng", render: (r) => r.code || "—", width: 180 },
      { key: "address", label: "Địa chỉ", render: (r) => r.address || "—" },
      {
        key: "status",
        label: "Trạng thái",
        width: 200,
        filterKind: "select",
        filterOptions: [
          { value: "ACTIVE", label: BRANCH_STATUS_VI.ACTIVE },
          { value: "SUSPENDED", label: BRANCH_STATUS_VI.SUSPENDED },
          { value: "ARCHIVED", label: BRANCH_STATUS_VI.ARCHIVED },
        ],
        render: (r) => BRANCH_STATUS_VI[r.status] ?? r.status,
      },
    ],
    [],
  );

  const toolbarItems = useMemo(
    () => [
      {
        id: "create",
        label: "Thêm mới",
        icon: Plus,
        onClick: () => { setEditing(null); setDialogOpen(true); },
      },
      {
        id: "edit",
        label: "Sửa",
        icon: Pencil,
        disabled: !selected,
        onClick: () => { if (selected) { setEditing(selected); setDialogOpen(true); } },
      },
      {
        id: "delete",
        label: "Xóa",
        icon: Trash2,
        disabled: !selected || deleting,
        onClick: () => void handleDelete(),
      },
      { id: "reload", label: "Nạp", icon: RefreshCw, onClick: reload, disabled: query.isFetching },
    ],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [selected, deleting, query.isFetching, reload],
  );

  return (
    <div className="flex h-full flex-col">
      <div className="px-4 pt-3">
        <p className="text-xs text-muted-foreground">Danh mục / Cửa hàng</p>
        <h1 className="text-xl font-semibold">Cửa hàng</h1>
      </div>

      <PageToolbar items={toolbarItems} tone="primary" className="m-2 rounded-md" />

      <div className="min-h-0 flex-1 px-2">
        <BaseDataTable
          columns={columns}
          rows={rows}
          loading={query.isFetching}
          emptyLabel="Không có cửa hàng nào phù hợp với bộ lọc."
          getRowKey={(r) => r.id}
          leadingColumn={{
            width: 44,
            header: null,
            cell: (row) => (
              <input
                type="checkbox"
                aria-label={`Chọn ${row.name}`}
                className="h-5 w-5 cursor-pointer rounded border-2 border-input accent-primary"
                checked={selectedId === row.id}
                onChange={(e) => setSelectedId(e.target.checked ? row.id : null)}
              />
            ),
          }}
          columnFilterControl={{
            filters,
            onModeChange: (key, mode) =>
              setFilters((p) => ({ ...p, [key]: { mode, value: p[key]?.value ?? "" } })),
            onValueChange: (key, value) =>
              setFilters((p) => ({ ...p, [key]: { mode: p[key]?.mode ?? "equals", value } })),
          }}
        />
      </div>

      <PaginationControls
        page={page}
        pageSize={pageSize}
        total={total}
        onPageChange={setPage}
        onPageSizeChange={(n: number) => { setPageSize(n); setPage(1); }}
        onRefresh={reload}
      />

      <BranchFormDialog
        open={dialogOpen}
        branch={editing}
        onClose={() => setDialogOpen(false)}
        onSaved={handleSaved}
      />
    </div>
  );
}
