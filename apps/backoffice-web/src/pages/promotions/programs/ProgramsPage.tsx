import { useCallback, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { X } from "lucide-react";
import {
  Badge,
  DocumentListShell,
  PageToolbar,
  PeriodFilter,
  resolvePeriodRange,
  type PeriodValue,
  type ToolbarItem,
} from "@erp/ui";
import type { PromotionProgramSummary } from "@erp/shared-interfaces";
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
import { ProgramsTable } from "./ProgramsTable/ProgramsTable";
import { ADD_NEW_TYPE_OPTIONS } from "./programs.constants";
import { buildFilterChips, buildPromotionFilters } from "./programs-filter";
import { useDeletePromotion, usePromotionsQuery } from "../api/use-promotions";

export function ProgramsPage() {
  const navigate = useNavigate();
  const [period, setPeriod] = useState<PeriodValue>(() => ({
    preset: "this_year",
    ...resolvePeriodRange("this_year"),
  }));
  const [appliedPeriod, setAppliedPeriod] = useState(period);
  const [pagination, setPagination] = useState(DEFAULT_PAGINATION);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [columnFilters, setColumnFilters] = useState<
    Record<string, ColumnFilter>
  >({});
  /** FR-004 — mặc định chỉ xem chương trình đang theo dõi; xóa được bằng 1 click. */
  const [trackingOnly, setTrackingOnly] = useState(true);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);

  // Lọc chạy ở server, nên gõ từng ký tự mà gọi ngay là mỗi ký tự một request.
  // Chip vẫn đọc `columnFilters` tức thời để giao diện phản hồi ngay; chỉ truy vấn
  // mới chờ người dùng ngừng gõ.
  const debouncedColumnFilters = useDebouncedValue(columnFilters, 300);

  const filters = useMemo(
    () => buildPromotionFilters(debouncedColumnFilters, appliedPeriod, trackingOnly),
    [debouncedColumnFilters, appliedPeriod, trackingOnly],
  );

  const deletePromotion = useDeletePromotion();

  const { data, isFetching, refetch } = usePromotionsQuery(
    pagination.page,
    pagination.pageSize,
    filters,
  );

  const rows = data?.data ?? [];
  const total = data?.total ?? 0;
  const chips = useMemo(
    () => buildFilterChips(columnFilters, trackingOnly),
    [columnFilters, trackingOnly],
  );

  const allSelected = rows.length > 0 && rows.every((row) => selectedIds.has(row.id));
  const selectedCount = selectedIds.size;

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

  const clearAllChips = useCallback(() => {
    setTrackingOnly(false);
    setColumnFilters({});
    setPagination((p) => ({ ...p, page: 1 }));
  }, []);

  const handleApply = useCallback(() => {
    setAppliedPeriod(period);
    setPagination((p) => ({ ...p, page: 1 }));
  }, [period]);

  const handleRefresh = useCallback(() => {
    setSelectedIds(new Set());
    void refetch();
  }, [refetch]);

  /** FR-009 — xóa mềm, hỏi xác nhận trước, danh sách tự làm mới sau. */
  const confirmDelete = useCallback(async () => {
    const ids = [...selectedIds];
    if (ids.length === 0) return;
    setDeleteConfirmOpen(false);

    try {
      // Tuần tự, không Promise.all: lỗi ở dòng thứ 3 thì 2 dòng đầu vẫn đã xóa,
      // và người dùng cần biết chính xác dừng ở đâu.
      for (const id of ids) await deletePromotion.mutateAsync(id);
      setSelectedIds(new Set());
      toast.success(`Đã xóa ${ids.length} chương trình.`);
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Xóa chương trình thất bại.",
      );
    }
  }, [selectedIds, deletePromotion]);

  const openEdit = useCallback(
    (row: PromotionProgramSummary) => {
      navigate(`/promotions/programs/${row.id}/edit`);
    },
    [navigate],
  );

  const toolbarItems = useMemo<ToolbarItem[]>(
    () => [
      {
        ...TOOLBAR_REGISTRY.create,
        onClick: () => {},
        options: ADD_NEW_TYPE_OPTIONS.map((opt) => ({
          id: opt.value,
          label: opt.label,
          onClick: () => navigate(`/promotions/programs/new?type=${opt.value}`),
        })),
      },
      { id: "sep-1", type: "separator" },
      {
        ...TOOLBAR_REGISTRY.duplicate,
        disabled: selectedCount !== 1,
        // FR-008 — mở form Thêm mới đã điền sẵn; chưa ghi gì cho tới khi bấm Lưu.
        onClick: () => {
          const id = [...selectedIds][0];
          if (id) navigate(`/promotions/programs/new?duplicateFrom=${id}`);
        },
      },
      {
        ...TOOLBAR_REGISTRY.edit,
        disabled: selectedCount !== 1,
        onClick: () => {
          const id = [...selectedIds][0];
          if (id) navigate(`/promotions/programs/${id}/edit`);
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
    [selectedCount, selectedIds, handleRefresh, navigate],
  );

  return (
    <DocumentListShell
      title="Chương trình khuyến mãi"
      toolbar={<PageToolbar items={toolbarItems} tone="primary" />}
      filters={
        <div className="flex flex-wrap items-center gap-3">
          <PeriodFilter
            value={period}
            onChange={setPeriod}
            onApply={handleApply}
          />
          {chips.length > 0 ? (
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
              {chips.length >= 2 ? (
                <button
                  type="button"
                  className="text-xs text-muted-foreground underline-offset-2 hover:underline"
                  onClick={clearAllChips}
                >
                  Xóa tất cả
                </button>
              ) : null}
            </div>
          ) : null}
        </div>
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
          title="Xóa chương trình khuyến mại"
          message={
            selectedCount === 1
              ? "Chương trình đã chọn sẽ bị xóa khỏi danh sách. Tiếp tục?"
              : `${selectedCount} chương trình đã chọn sẽ bị xóa khỏi danh sách. Tiếp tục?`
          }
          confirmLabel="Xóa"
          loading={deletePromotion.isPending}
          onConfirm={() => void confirmDelete()}
          onCancel={() => setDeleteConfirmOpen(false)}
        />
      ) : null}

      <div className="flex min-h-0 flex-1 flex-col p-4">
        <ProgramsTable
          rows={rows}
          loading={isFetching}
          selectedIds={selectedIds}
          allSelected={allSelected}
          onToggleAll={handleToggleAll}
          onToggleRow={handleToggleRow}
          onOpenProgram={openEdit}
          columnFilters={columnFilters}
          onFilterModeChange={handleFilterModeChange}
          onFilterValueChange={handleFilterValueChange}
        />
      </div>
    </DocumentListShell>
  );
}
