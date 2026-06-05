import { useMemo, useState } from "react";
import { resolvePeriodRange, type PeriodValue } from "@erp/ui";
import {
  StorageReportShell,
  buildApiFilters,
  resolveLabel,
  type FilterField,
  type FilterValues,
} from "./_shared";
import type { TableColumn } from "../../../components/table/BaseDataTable";
import { useStockByBranchReport } from "../../../hooks/use-inventory-reports";
import type {
  StockByBranchBranchHeader,
  StockByBranchRow as ApiStockByBranchRow,
} from "../../../api/inventory-reports";

const GROUP_OPTIONS = [
  { value: "__all__", label: "Tất cả nhóm" },
  { value: "Giày nam", label: "Giày nam" },
  { value: "Giày nữ", label: "Giày nữ" },
  { value: "Sandal nữ", label: "Sandal nữ" },
  { value: "Dép nữ", label: "Dép nữ" },
  { value: "Dép nam", label: "Dép nam" },
];
const BRAND_OPTIONS = [
  { value: "__all__", label: "Tất cả" },
  { value: "MT", label: "Giày MT" },
];
const STAT_OPTIONS = [
  { value: "item", label: "Hàng hóa" },
  { value: "parent", label: "Mẫu mã" },
];
const UNIT_OPTIONS = [
  { value: "__all__", label: "Tất cả ĐVT" },
  { value: "Đôi", label: "Đôi" },
];

interface ViewRow {
  sku: string;
  name: string;
  parentSku: string;
  parentName: string;
  color: string;
  size: string;
  unit: string;
  group: string;
  brand: string;
  total: number;
  perBranch: Record<string, number>;
}

function mapApiRow(row: ApiStockByBranchRow): ViewRow {
  const perBranch: Record<string, number> = {};
  for (const [branchId, value] of Object.entries(row.perBranch)) {
    perBranch[branchId] = value.qty;
  }
  return {
    sku: row.sku,
    name: row.name,
    parentSku: row.parentSku ?? "",
    parentName: row.parentName ?? "",
    color: "",
    size: "",
    unit: row.unit,
    group: row.categoryName ?? "",
    brand: "",
    total: row.totalQty,
    perBranch,
  };
}

export function StockByBranchReportPage() {
  const filterFields: FilterField[] = [
    { key: "group", label: "Nhóm hàng hóa", type: "select", options: GROUP_OPTIONS },
    { key: "brand", label: "Thương hiệu", type: "select", options: BRAND_OPTIONS },
    { key: "stat", label: "Thống kê theo", type: "select", options: STAT_OPTIONS },
    { key: "unit", label: "Đơn vị tính", type: "select", options: UNIT_OPTIONS },
    { key: "period", label: "Kỳ báo cáo", type: "period" },
  ];

  const [filterValues, setFilterValues] = useState<FilterValues>({});
  const [period, setPeriod] = useState<PeriodValue>(() => ({
    preset: "this_month",
    ...resolvePeriodRange("this_month"),
  }));

  const apiFilters = useMemo(
    () =>
      buildApiFilters(filterValues, period, {
        categoryFieldKey: "group",
      }),
    [filterValues, period],
  );

  const { data, isLoading } = useStockByBranchReport(apiFilters);
  const branches: StockByBranchBranchHeader[] = useMemo(
    () => data?.branches ?? [],
    [data],
  );
  const rows = useMemo<ViewRow[]>(
    () => (data?.data ?? []).map(mapApiRow),
    [data],
  );

  const num = "text-right tabular-nums";
  const columns: TableColumn<ViewRow>[] = useMemo(
    () => [
      { key: "sku", label: "Mã SKU", width: 140, render: (r) => r.sku },
      { key: "name", label: "Tên hàng hóa", width: 220, render: (r) => r.name },
      { key: "parentSku", label: "Mã SKU mẫu mã", width: 140, render: (r) => r.parentSku },
      { key: "parentName", label: "Tên Mẫu mã", width: 150, render: (r) => r.parentName },
      { key: "color", label: "Màu sắc", width: 100, render: (r) => r.color },
      { key: "size", label: "Size", width: 80, render: (r) => r.size },
      { key: "unit", label: "Đơn vị tính", width: 110, render: (r) => r.unit },
      { key: "group", label: "Nhóm hàng hóa", width: 140, render: (r) => r.group },
      { key: "brand", label: "Thương hiệu", width: 120, render: (r) => r.brand },
      {
        key: "total",
        label: "Tồn cuối kỳ",
        width: 120,
        headerClassName: "text-right",
        className: num,
        render: (r) => r.total,
      },
      ...branches.map<TableColumn<ViewRow>>((b) => ({
        key: `branch_${b.id}`,
        label: b.code ?? b.name,
        width: 130,
        headerClassName: "text-right",
        className: num,
        render: (r) => r.perBranch[b.id] ?? 0,
      })),
    ],
    [branches],
  );

  return (
    <StorageReportShell<ViewRow>
      title="Số lượng tồn kho theo cửa hàng"
      storageKey="reports/storage/stock-by-branch"
      filterFields={filterFields}
      buildSubtitle={(values) => [
        { label: "Nhóm hàng hóa", value: resolveLabel(filterFields[0]!, values) },
        { label: "Thương hiệu", value: resolveLabel(filterFields[1]!, values) },
        { label: "Thống kê theo", value: resolveLabel(filterFields[2]!, values) },
        { label: "Đơn vị tính", value: resolveLabel(filterFields[3]!, values) },
      ]}
      columns={columns}
      rows={rows}
      loading={isLoading}
      emptyLabel="Không có dữ liệu tồn kho theo cửa hàng."
      getRowKey={(r) => r.sku}
      initialPeriod={period}
      onApply={(next, nextPeriod) => {
        setFilterValues(next);
        setPeriod(nextPeriod);
      }}
      columnSummary={(rs) => {
        const totals: Record<string, number> = {
          total: rs.reduce((s, r) => s + r.total, 0),
        };
        for (const b of branches) {
          totals[`branch_${b.id}`] = rs.reduce(
            (s, r) => s + (r.perBranch[b.id] ?? 0),
            0,
          );
        }
        return totals;
      }}
    />
  );
}
