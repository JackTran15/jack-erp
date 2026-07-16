import { useCallback, useMemo, useState } from "react";
import { toast } from "sonner";
import {
  DocumentListShell,
  PageToolbar,
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
import { VouchersTable } from "./VouchersTable/VouchersTable";
import { MOCK_VOUCHER_ROWS } from "./_mock/mock-vouchers";
import type { VoucherRow } from "./vouchers.types";

/** Cột số dùng toán tử ≤ (number-range). */
const NUMERIC_KEYS = new Set<string>([
  "faceValue",
  "totalQuantity",
  "totalVoucherValue",
  "totalAppliedValue",
]);

function numericValueFor(row: VoucherRow, key: string): number {
  switch (key) {
    case "faceValue":
      return row.faceValue;
    case "totalQuantity":
      return row.totalQuantity;
    case "totalVoucherValue":
      return row.totalVoucherValue;
    case "totalAppliedValue":
      return row.totalAppliedValue;
    default:
      return 0;
  }
}

/** Chuỗi so sánh của một dòng theo cột text/date/select. */
function textComparableFor(row: VoucherRow, key: string): string {
  switch (key) {
    case "issuer":
      return row.issuer;
    case "code":
      return row.code;
    case "startDate":
      return row.startDate ?? "";
    case "endDate":
      return row.endDate ?? "";
    case "description":
      return row.description ?? "";
    case "status":
      return row.status;
    default:
      return "";
  }
}

export function VouchersPage() {
  const [pagination, setPagination] = useState(DEFAULT_PAGINATION);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [columnFilters, setColumnFilters] = useState<
    Record<string, ColumnFilter>
  >({});
  const [sortBy, setSortBy] = useState<string | undefined>(undefined);
  const [sortOrder, setSortOrder] = useState<"asc" | "desc">("asc");

  const filteredRows = useMemo(() => {
    const rows = MOCK_VOUCHER_ROWS.filter((row) =>
      Object.entries(columnFilters).every(([key, filter]) => {
        if (!filter?.value) return true;
        if (NUMERIC_KEYS.has(key)) {
          // Toán tử ≤: giữ dòng có giá trị ≤ số nhập vào.
          const limit = Number(filter.value);
          if (Number.isNaN(limit)) return true;
          return numericValueFor(row, key) <= limit;
        }
        return applyColumnFilter(textComparableFor(row, key), filter);
      }),
    );

    if (!sortBy) return rows;
    const dir = sortOrder === "asc" ? 1 : -1;
    return [...rows].sort((a, b) => {
      if (NUMERIC_KEYS.has(sortBy)) {
        return (numericValueFor(a, sortBy) - numericValueFor(b, sortBy)) * dir;
      }
      return (
        textComparableFor(a, sortBy).localeCompare(
          textComparableFor(b, sortBy),
          "vi",
        ) * dir
      );
    });
  }, [columnFilters, sortBy, sortOrder]);

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

  const handleRefresh = useCallback(() => {
    setSelectedIds(new Set());
    toast.info("Đã nạp lại danh sách.");
  }, []);

  const openEdit = useCallback((row: VoucherRow) => {
    toast.info(`Sửa voucher: ${row.code}`);
  }, []);

  const toolbarItems = useMemo<ToolbarItem[]>(
    () => [
      {
        ...TOOLBAR_REGISTRY.create,
        onClick: () => toast.info("Thêm mới voucher."),
      },
      { id: "sep-1", type: "separator" },
      {
        ...TOOLBAR_REGISTRY.duplicate,
        disabled: selectedCount !== 1,
        onClick: () => toast.info("Nhân bản voucher đã chọn."),
      },
      {
        ...TOOLBAR_REGISTRY.edit,
        disabled: selectedCount !== 1,
        onClick: () => toast.info("Sửa voucher đã chọn."),
      },
      {
        ...TOOLBAR_REGISTRY.delete,
        disabled: selectedCount === 0,
        onClick: () => toast.info(`Xóa ${selectedCount} voucher đã chọn.`),
      },
      { id: "sep-2", type: "separator" },
      { ...TOOLBAR_REGISTRY.refresh, onClick: handleRefresh },
    ],
    [selectedCount, handleRefresh],
  );

  return (
    <DocumentListShell
      title="Thẻ voucher"
      toolbar={<PageToolbar items={toolbarItems} tone="primary" />}
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
        <VouchersTable
          rows={pagedRows}
          loading={false}
          selectedIds={selectedIds}
          allSelected={allSelected}
          onToggleAll={handleToggleAll}
          onToggleRow={handleToggleRow}
          onOpenVoucher={openEdit}
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
