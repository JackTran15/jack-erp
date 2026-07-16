import { useCallback, useMemo, useState } from "react";
import { toast } from "sonner";
import {
  DocumentListShell,
  PageToolbar,
  PeriodFilter,
  resolvePeriodRange,
  type PeriodValue,
  type ToolbarItem,
} from "@erp/ui";
import { TOOLBAR_REGISTRY } from "../../../constants/toolbar-actions";
import { PaginationControls } from "../../../components/table/PaginationControls";
import {
  DEFAULT_COLUMN_FILTER_MODE,
  DEFAULT_PAGINATION,
  applyColumnFilter,
  type ColumnFilter,
  type ColumnFilterMode,
} from "../../../components/table/pagination.dto";
import { ProgramsTable } from "./ProgramsTable/ProgramsTable";
import { ADD_NEW_TYPE_OPTIONS } from "./programs.constants";
import { MOCK_PROGRAM_ROWS } from "./_mock/mock-programs";
import type { PromotionProgramRow } from "./programs.types";

/** Chuỗi so sánh của một dòng theo từng cột (dùng cho lọc & sắp xếp). */
function comparableFor(row: PromotionProgramRow, key: string): string {
  switch (key) {
    case "name":
      return row.name;
    case "startDate":
      return row.startDate ?? "";
    case "endDate":
      return row.endDate ?? "";
    case "applyTo":
      return row.applyTo;
    case "form":
      return row.form;
    case "description":
      return row.description ?? "";
    case "status":
      return row.status;
    default:
      return "";
  }
}

export function ProgramsPage() {
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
  const [sortBy, setSortBy] = useState<string | undefined>(undefined);
  const [sortOrder, setSortOrder] = useState<"asc" | "desc">("asc");

  const filteredRows = useMemo(() => {
    const rows = MOCK_PROGRAM_ROWS.filter((row) => {
      // Lọc theo khoảng kỳ: giữ dòng chưa có ngày bắt đầu, hoặc rơi vào khoảng.
      if (
        row.startDate &&
        (row.startDate < appliedPeriod.from || row.startDate > appliedPeriod.to)
      ) {
        return false;
      }
      // Lọc từng cột (inline column filter).
      return Object.entries(columnFilters).every(([key, filter]) => {
        if (!filter?.value) return true;
        return applyColumnFilter(comparableFor(row, key), filter);
      });
    });

    if (!sortBy) return rows;
    const dir = sortOrder === "asc" ? 1 : -1;
    return [...rows].sort(
      (a, b) =>
        comparableFor(a, sortBy).localeCompare(comparableFor(b, sortBy), "vi") *
        dir,
    );
  }, [appliedPeriod, columnFilters, sortBy, sortOrder]);

  const pagedRows = useMemo(() => {
    const start = (pagination.page - 1) * pagination.pageSize;
    return filteredRows.slice(start, start + pagination.pageSize);
  }, [filteredRows, pagination]);

  const allSelected =
    filteredRows.length > 0 &&
    filteredRows.every((row) => selectedIds.has(row.id));
  const selectedCount = selectedIds.size;

  const handleToggleAll = useCallback(
    (checked: boolean) => {
      setSelectedIds(
        checked ? new Set(filteredRows.map((row) => row.id)) : new Set(),
      );
    },
    [filteredRows],
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

  const handleSort = useCallback((key: string) => {
    setSortBy((prevKey) => {
      if (prevKey === key) {
        setSortOrder((o) => (o === "asc" ? "desc" : "asc"));
        return key;
      }
      setSortOrder("asc");
      return key;
    });
  }, []);

  const handleApply = useCallback(() => {
    setAppliedPeriod(period);
    setPagination((p) => ({ ...p, page: 1 }));
  }, [period]);

  const handleRefresh = useCallback(() => {
    setSelectedIds(new Set());
    toast.info("Đã nạp lại danh sách.");
  }, []);

  const openEdit = useCallback((row: PromotionProgramRow) => {
    toast.info(`Sửa chương trình: ${row.name}`);
  }, []);

  const toolbarItems = useMemo<ToolbarItem[]>(
    () => [
      {
        ...TOOLBAR_REGISTRY.create,
        onClick: () => {},
        options: ADD_NEW_TYPE_OPTIONS.map((opt) => ({
          id: opt.value,
          label: opt.label,
          onClick: () => toast.info(`Thêm mới: ${opt.label}`),
        })),
      },
      { id: "sep-1", type: "separator" },
      {
        ...TOOLBAR_REGISTRY.duplicate,
        disabled: selectedCount !== 1,
        onClick: () => toast.info("Nhân bản chương trình đã chọn."),
      },
      {
        ...TOOLBAR_REGISTRY.edit,
        disabled: selectedCount !== 1,
        onClick: () => toast.info("Sửa chương trình đã chọn."),
      },
      {
        ...TOOLBAR_REGISTRY.delete,
        disabled: selectedCount === 0,
        onClick: () => toast.info(`Xóa ${selectedCount} chương trình đã chọn.`),
      },
      { id: "sep-2", type: "separator" },
      { ...TOOLBAR_REGISTRY.refresh, onClick: handleRefresh },
    ],
    [selectedCount, handleRefresh],
  );

  return (
    <DocumentListShell
      title="Chương trình khuyến mãi"
      toolbar={<PageToolbar items={toolbarItems} tone="primary" />}
      filters={
        <PeriodFilter
          value={period}
          onChange={setPeriod}
          onApply={handleApply}
        />
      }
      pagination={
        <PaginationControls
          page={pagination.page}
          pageSize={pagination.pageSize}
          total={filteredRows.length}
          onPageChange={(p) => setPagination((prev) => ({ ...prev, page: p }))}
          onPageSizeChange={(s) =>
            setPagination((prev) => ({ ...prev, page: 1, pageSize: s }))
          }
          onRefresh={handleRefresh}
        />
      }
    >
      <div className="flex min-h-0 flex-1 flex-col p-4">
        <ProgramsTable
          rows={pagedRows}
          loading={false}
          selectedIds={selectedIds}
          allSelected={allSelected}
          onToggleAll={handleToggleAll}
          onToggleRow={handleToggleRow}
          onOpenProgram={openEdit}
          columnFilters={columnFilters}
          onFilterModeChange={handleFilterModeChange}
          onFilterValueChange={handleFilterValueChange}
          sortBy={sortBy}
          sortOrder={sortOrder}
          onSort={handleSort}
        />
      </div>
    </DocumentListShell>
  );
}
