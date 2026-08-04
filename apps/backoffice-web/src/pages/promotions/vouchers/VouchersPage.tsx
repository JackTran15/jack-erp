import { useCallback, useMemo, useState } from "react";
import { toast } from "sonner";
import { X } from "lucide-react";
import {
  Badge,
  DocumentListShell,
  PageToolbar,
  type ToolbarItem,
} from "@erp/ui";
import { TOOLBAR_REGISTRY } from "../../../constants/toolbar-actions";
import { PaginationControls } from "../../../components/table/PaginationControls";
import { ConfirmActionModal } from "../../../components/table/ConfirmActionModal";
import {
  DEFAULT_COLUMN_FILTER_MODE,
  DEFAULT_PAGINATION,
  type ColumnFilter,
  type ColumnFilterMode,
} from "../../../components/table/pagination.dto";
import { useDebouncedValue } from "../../../lib/use-debounced-value";
import { VouchersTable } from "./VouchersTable/VouchersTable";
import {
  VoucherFormDialog,
  type VoucherFormMode,
} from "./VoucherFormDialog/VoucherFormDialog";
import { buildVoucherChips, buildVoucherFilters } from "./vouchers-filter";
import {
  useDeactivateVoucher,
  useVouchersQuery,
  type VoucherSummaryRow,
} from "../api/use-vouchers";

export function VouchersPage() {
  const [pagination, setPagination] = useState(DEFAULT_PAGINATION);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [columnFilters, setColumnFilters] = useState<
    Record<string, ColumnFilter>
  >({});
  /** Cùng chuẩn FR-004 với màn CTKM: mặc định chỉ xem thẻ đang theo dõi. */
  const [trackingOnly, setTrackingOnly] = useState(true);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [formMode, setFormMode] = useState<VoucherFormMode | undefined>(
    undefined,
  );

  // Lọc chạy ở server — gõ từng ký tự mà gọi ngay là mỗi ký tự một request.
  const debouncedFilters = useDebouncedValue(columnFilters, 300);

  const filters = useMemo(
    () => buildVoucherFilters(debouncedFilters, trackingOnly),
    [debouncedFilters, trackingOnly],
  );

  const deactivateVoucher = useDeactivateVoucher();
  const { data, isFetching, refetch } = useVouchersQuery(
    pagination.page,
    pagination.pageSize,
    filters,
  );

  const rows = data?.data ?? [];
  const total = data?.total ?? 0;
  const summary = data?.summary;
  const chips = useMemo(
    () => buildVoucherChips(columnFilters, trackingOnly),
    [columnFilters, trackingOnly],
  );

  const allSelected =
    rows.length > 0 && rows.every((row) => selectedIds.has(row.id));
  const selectedCount = selectedIds.size;
  const selectedRow = useMemo(
    () => rows.find((row) => selectedIds.has(row.id)),
    [rows, selectedIds],
  );

  const handleToggleAll = useCallback(
    (checked: boolean) => {
      setSelectedIds(checked ? new Set(rows.map((row) => row.id)) : new Set());
    },
    [rows],
  );

  const handleToggleRow = useCallback((id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const handleFilterModeChange = useCallback(
    (key: string, mode: ColumnFilterMode) => {
      setColumnFilters((prev) => ({
        ...prev,
        [key]: { ...prev[key], mode, value: prev[key]?.value ?? "" },
      }));
      setPagination((p) => ({ ...p, page: 1 }));
    },
    [],
  );

  const handleFilterValueChange = useCallback((key: string, value: string) => {
    setColumnFilters((prev) => ({
      ...prev,
      [key]: {
        ...prev[key],
        mode: prev[key]?.mode ?? DEFAULT_COLUMN_FILTER_MODE,
        value,
      },
    }));
    setPagination((p) => ({ ...p, page: 1 }));
  }, []);

  const clearChip = useCallback((id: string) => {
    setPagination((p) => ({ ...p, page: 1 }));
    if (id === "trackingOnly") {
      setTrackingOnly(false);
      return;
    }
    setColumnFilters((prev) => {
      const next = { ...prev };
      delete next[id];
      return next;
    });
  }, []);

  const handleRefresh = useCallback(() => {
    setSelectedIds(new Set());
    void refetch();
  }, [refetch]);

  /**
   * `DELETE /v2/vouchers/:id` là `VoucherService.deactivate` — chuyển sang
   * "Ngừng theo dõi", **không** xóa cứng. Nhãn và câu xác nhận nói đúng việc đó
   * thay vì dùng chữ "Xóa" cho một hành động không xóa.
   */
  const confirmDeactivate = useCallback(async () => {
    const ids = [...selectedIds];
    if (ids.length === 0) return;
    setDeleteConfirmOpen(false);
    try {
      for (const id of ids) await deactivateVoucher.mutateAsync(id);
      setSelectedIds(new Set());
      toast.success(`Đã ngừng theo dõi ${ids.length} voucher.`);
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Ngừng theo dõi thất bại.",
      );
    }
  }, [selectedIds, deactivateVoucher]);

  const openEdit = useCallback((row: VoucherSummaryRow) => {
    setFormMode({ kind: "edit", source: row });
  }, []);

  const toolbarItems = useMemo<ToolbarItem[]>(
    () => [
      {
        ...TOOLBAR_REGISTRY.create,
        onClick: () => setFormMode({ kind: "create" }),
      },
      { id: "sep-1", type: "separator" },
      {
        ...TOOLBAR_REGISTRY.duplicate,
        disabled: selectedCount !== 1,
        onClick: () => {
          if (selectedRow)
            setFormMode({ kind: "duplicate", source: selectedRow });
        },
      },
      {
        ...TOOLBAR_REGISTRY.edit,
        disabled: selectedCount !== 1,
        onClick: () => {
          if (selectedRow) setFormMode({ kind: "edit", source: selectedRow });
        },
      },
      {
        ...TOOLBAR_REGISTRY.delete,
        disabled: selectedCount === 0,
        onClick: () => setDeleteConfirmOpen(true),
      },
      { id: "sep-2", type: "separator" },
      { ...TOOLBAR_REGISTRY.refresh, onClick: handleRefresh },
    ],
    [selectedCount, selectedRow, handleRefresh],
  );

  return (
    <DocumentListShell
      title="Thẻ voucher"
      toolbar={<PageToolbar items={toolbarItems} tone="primary" />}
      filters={
        chips.length > 0 ? (
          <div className="flex flex-wrap items-center gap-1.5">
            {chips.map((chip) => (
              <Badge
                key={chip.id}
                variant="secondary"
                className="gap-1 py-1 pl-2 pr-1"
              >
                {chip.label}
                <button
                  type="button"
                  aria-label={`Xóa lọc ${chip.label}`}
                  className="rounded-sm p-0.5 hover:bg-background/60"
                  onClick={() => clearChip(chip.id)}
                >
                  <X className="h-3 w-3" />
                </button>
              </Badge>
            ))}
          </div>
        ) : undefined
      }
      pagination={
        <PaginationControls
          page={pagination.page}
          pageSize={pagination.pageSize}
          total={total}
          onPageChange={(p) => setPagination((prev) => ({ ...prev, page: p }))}
          onPageSizeChange={(s) =>
            setPagination((prev) => ({ ...prev, page: 1, pageSize: s }))
          }
          onRefresh={handleRefresh}
        />
      }
    >
      {deleteConfirmOpen ? (
        <ConfirmActionModal
          title="Ngừng theo dõi voucher"
          message={
            selectedCount === 1
              ? "Voucher đã chọn sẽ chuyển sang trạng thái Ngừng theo dõi. Tiếp tục?"
              : `${selectedCount} voucher đã chọn sẽ chuyển sang trạng thái Ngừng theo dõi. Tiếp tục?`
          }
          confirmLabel="Ngừng theo dõi"
          loading={deactivateVoucher.isPending}
          onConfirm={() => void confirmDeactivate()}
          onCancel={() => setDeleteConfirmOpen(false)}
        />
      ) : null}

      {formMode ? (
        <VoucherFormDialog
          mode={formMode}
          onClose={() => setFormMode(undefined)}
          onSaved={() => {
            setFormMode(undefined);
            setSelectedIds(new Set());
          }}
        />
      ) : null}

      <div className="flex min-h-0 flex-1 flex-col p-4">
        <VouchersTable
          rows={rows}
          loading={isFetching}
          summary={summary}
          selectedIds={selectedIds}
          allSelected={allSelected}
          onToggleAll={handleToggleAll}
          onToggleRow={handleToggleRow}
          onOpenVoucher={openEdit}
          columnFilters={columnFilters}
          onFilterModeChange={handleFilterModeChange}
          onFilterValueChange={handleFilterValueChange}
        />
      </div>
    </DocumentListShell>
  );
}
