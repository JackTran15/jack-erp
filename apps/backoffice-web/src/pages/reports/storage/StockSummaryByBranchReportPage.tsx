import { useMemo, useState } from "react";
import {
  formatMoneyInteger,
  resolvePeriodRange,
  type PeriodValue,
} from "@erp/ui";
import {
  StorageReportShell,
  buildApiFilters,
  toColumnFilterPayload,
  resolveLabel,
  type FilterField,
  type FilterValues,
} from "./_shared";
import type { TableColumn } from "../../../components/table/BaseDataTable";
import { DEFAULT_PAGINATION } from "../../../components/table/pagination.dto";
import type { ReportColumnFilterPayload } from "../../../api/inventory-reports";
import { useStockSummaryByBranchReport } from "../../../hooks/use-inventory-reports";
import type { StockPeriodRow } from "../../../api/inventory-reports";
import { useBranches } from "../../../hooks/iam/useBranches";
import { useReportCategories } from "../../../hooks/use-report-filter-options";

interface ViewRow {
  itemId: string;
  branchId: string;
  sku: string;
  name: string;
  parentSku: string;
  parentName: string;
  color: string;
  size: string;
  unit: string;
  group: string;
  brand: string;
  branchCode: string;
  branch: string;
  openingQty: number;
  openingValue: number;
  inQty: number;
  inValue: number;
  outQty: number;
  outValue: number;
}

function mapApiRow(row: StockPeriodRow): ViewRow {
  return {
    itemId: row.itemId,
    branchId: row.branchId ?? "",
    sku: row.sku,
    name: row.itemName,
    parentSku: row.parentSku ?? "",
    parentName: row.parentName ?? "",
    color: row.color ?? "",
    size: row.size ?? "",
    unit: row.unit,
    group: row.categoryName ?? "",
    brand: row.brand ?? "",
    branchCode: row.branchCode ?? "",
    branch: row.branchName ?? "",
    openingQty: row.openingQty,
    openingValue: row.openingValue,
    inQty: row.inQty,
    inValue: row.inValue,
    outQty: row.outQty,
    outValue: row.outValue,
  };
}

/** Cột phải lọc theo giá trị số. */
const NUMERIC_COLUMNS = new Set([
  "openingQty",
  "openingValue",
  "inQty",
  "inValue",
  "outQty",
  "outValue",
  "endingQty",
  "endingValue",
]);

const COLUMN_KEY_MAP = {
  endingQty: "closingQty",
  endingValue: "closingValue",
};

export function StockSummaryByBranchReportPage() {
  const { data: branches } = useBranches();
  const { options: groupOptions } = useReportCategories();

  const storeOptions = useMemo(
    () => (branches ?? []).map((b) => ({ value: b.id, label: b.name })),
    [branches],
  );

  const filterFields = useMemo<FilterField[]>(
    () => [
      {
        key: "store",
        label: "Cửa hàng",
        type: "radio-scope",
        allLabel: "Tất cả",
        scopeLabel: "Theo nhóm cửa hàng",
        options: storeOptions,
        placeholder: "Chọn cửa hàng",
      },
      { key: "group", label: "Nhóm hàng hóa", type: "select", options: groupOptions },
      { key: "period", label: "Kỳ báo cáo", type: "period" },
    ],
    [storeOptions, groupOptions],
  );

  const [filterValues, setFilterValues] = useState<FilterValues>({});
  const [period, setPeriod] = useState<PeriodValue>(() => ({
    preset: "this_month",
    ...resolvePeriodRange("this_month"),
  }));

  const [gridQuery, setGridQuery] = useState<{
    page: number;
    pageSize: number;
    columnFilters: Record<string, ReportColumnFilterPayload>;
  }>({
    page: 1,
    pageSize: DEFAULT_PAGINATION.pageSize,
    columnFilters: {},
  });

  const apiFilters = useMemo(
    () => ({
      ...buildApiFilters(filterValues, period, {
        storeFieldKey: "store",
        categoryFieldKey: "group",
      }),
      page: gridQuery.page,
      pageSize: gridQuery.pageSize,
      columnFilters: gridQuery.columnFilters,
    }),
    [filterValues, period, gridQuery],
  );

  const { data, isLoading } = useStockSummaryByBranchReport(apiFilters);
  const rows = useMemo<ViewRow[]>(
    () => (data?.data ?? []).map(mapApiRow),
    [data],
  );

  const num = "text-right tabular-nums";
  const columns: TableColumn<ViewRow>[] = [
    { key: "sku", label: "Mã SKU", width: 140, render: (r) => r.sku },
    { key: "name", label: "Tên hàng hóa", width: 220, render: (r) => r.name },
    { key: "parentSku", label: "Mã SKU mẫu mã", width: 140, render: (r) => r.parentSku },
    { key: "parentName", label: "Tên Mẫu mã", width: 150, render: (r) => r.parentName },
    { key: "color", label: "Màu sắc", width: 100, render: (r) => r.color },
    { key: "size", label: "Size", width: 80, render: (r) => r.size },
    { key: "unit", label: "Đơn vị tính", width: 110, render: (r) => r.unit },
    { key: "group", label: "Nhóm hàng hóa", width: 140, render: (r) => r.group },
    { key: "brand", label: "Thương hiệu", width: 120, render: (r) => r.brand },
    { key: "branchCode", label: "Mã cửa hàng", width: 130, render: (r) => r.branchCode },
    { key: "branch", label: "Tên cửa hàng", width: 180, render: (r) => r.branch },
    { key: "openingQty",   group: "Tồn đầu kỳ",   label: "Số lượng", width: 110, headerClassName: "text-right", className: num, render: (r) => r.openingQty },
    { key: "openingValue", group: "Tồn đầu kỳ",   label: "Giá trị",  width: 130, headerClassName: "text-right", className: num, render: (r) => formatMoneyInteger(r.openingValue) },
    { key: "inQty",        group: "Nhập trong kỳ", label: "Số lượng", width: 110, headerClassName: "text-right", className: num, render: (r) => r.inQty },
    { key: "inValue",      group: "Nhập trong kỳ", label: "Giá trị",  width: 130, headerClassName: "text-right", className: num, render: (r) => formatMoneyInteger(r.inValue) },
    { key: "outQty",       group: "Xuất trong kỳ", label: "Số lượng", width: 110, headerClassName: "text-right", className: num, render: (r) => r.outQty },
    { key: "outValue",     group: "Xuất trong kỳ", label: "Giá trị",  width: 130, headerClassName: "text-right", className: num, render: (r) => formatMoneyInteger(r.outValue) },
    { key: "endingQty",    group: "Tồn cuối kỳ",   label: "Số lượng", width: 110, headerClassName: "text-right", className: num, render: (r) => r.openingQty + r.inQty - r.outQty },
    { key: "endingValue",  group: "Tồn cuối kỳ",   label: "Giá trị",  width: 140, headerClassName: "text-right", className: num, render: (r) => formatMoneyInteger(r.openingValue + r.inValue - r.outValue) },
  ];

  return (
    <StorageReportShell<ViewRow>
      title="Tổng hợp nhập xuất tồn kho theo cửa hàng"
      storageKey="reports/storage/stock-summary-by-branch"
      filterFields={filterFields}
      buildSubtitle={(values) => [
        { label: "Cửa hàng", value: resolveLabel(filterFields[0]!, values) },
        { label: "Nhóm hàng hóa", value: resolveLabel(filterFields[1]!, values) },
      ]}
      columns={columns}
      rows={rows}
      loading={isLoading}
      emptyLabel="Không có dữ liệu."
      getRowKey={(r, i) => `${r.itemId}-${r.branchId}-${i}`}
      initialPeriod={period}
      total={data?.total ?? 0}
      totals={data?.totals}
      onQueryChange={({ page, pageSize, columnFilters }) =>
        setGridQuery({
          page,
          pageSize,
          columnFilters: toColumnFilterPayload(
            columnFilters,
            NUMERIC_COLUMNS,
            COLUMN_KEY_MAP,
          ),
        })
      }
      onApply={(next, nextPeriod) => {
        setGridQuery((prev) => ({ ...prev, page: 1 }));
        setFilterValues(next);
        setPeriod(nextPeriod);
      }}
      // Tổng của toàn tập kết quả lọc, do server tính — không phải tổng trang.
      columnSummary={(_rows, totals) => {
        if (!totals) return {};
        const opening = totals.openingQty ?? 0;
        const openingValue = totals.openingValue ?? 0;
        const inQty = totals.inQty ?? 0;
        const inValue = totals.inValue ?? 0;
        const outQty = totals.outQty ?? 0;
        const outValue = totals.outValue ?? 0;
        return {
          openingQty: opening,
          openingValue: formatMoneyInteger(openingValue),
          inQty,
          inValue: formatMoneyInteger(inValue),
          outQty,
          outValue: formatMoneyInteger(outValue),
          // Cột dẫn xuất: suy từ primitive.
          endingQty: opening + inQty - outQty,
          endingValue: formatMoneyInteger(openingValue + inValue - outValue),
        };
      }}
    />
  );
}
