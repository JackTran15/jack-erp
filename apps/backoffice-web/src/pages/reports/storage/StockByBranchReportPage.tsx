import { useMemo } from "react";
import {
  StorageReportShell,
  resolveLabel,
  type FilterField,
} from "./_shared";
import type { TableColumn } from "../../../components/table/BaseDataTable";
import { generateMockStock, type MockStockSku } from "./_shared/mock";

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

const BRANCH_COLUMNS: { code: string; name: string }[] = [
  { code: "MTCANTHO", name: "Giày MT Cần Thơ" },
  { code: "CT", name: "CT" },
];

interface StockByBranchRow {
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

/**
 * Aggregate the mock per-branch stock into one row per SKU with branch-level
 * column totals.
 */
function aggregateByBranch(rows: MockStockSku[]): StockByBranchRow[] {
  const map = new Map<string, StockByBranchRow>();
  for (const r of rows) {
    const ending = r.openingQty + r.inQty - r.outQty;
    let entry = map.get(r.sku);
    if (!entry) {
      entry = {
        sku: r.sku,
        name: r.name,
        parentSku: r.parentSku,
        parentName: r.parentName,
        color: r.color,
        size: r.size,
        unit: r.unit,
        group: r.group,
        brand: r.brand,
        total: 0,
        perBranch: {},
      };
      map.set(r.sku, entry);
    }
    entry.total += ending;
    entry.perBranch[r.branchCode] = (entry.perBranch[r.branchCode] ?? 0) + ending;
  }
  return Array.from(map.values());
}

export function StockByBranchReportPage() {
  const filterFields: FilterField[] = [
    { key: "group", label: "Nhóm hàng hóa", type: "select", options: GROUP_OPTIONS },
    { key: "brand", label: "Thương hiệu", type: "select", options: BRAND_OPTIONS },
    { key: "stat", label: "Thống kê theo", type: "select", options: STAT_OPTIONS },
    { key: "unit", label: "Đơn vị tính", type: "select", options: UNIT_OPTIONS },
    { key: "period", label: "Kỳ báo cáo", type: "period" },
  ];

  const rows = useMemo(() => aggregateByBranch(generateMockStock()), []);

  const num = "text-right tabular-nums";
  const columns: TableColumn<StockByBranchRow>[] = [
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
    ...BRANCH_COLUMNS.map<TableColumn<StockByBranchRow>>((b) => ({
      key: `branch_${b.code}`,
      label: b.code,
      width: 130,
      headerClassName: "text-right",
      className: num,
      render: (r) => r.perBranch[b.code] ?? 0,
    })),
  ];

  return (
    <StorageReportShell<StockByBranchRow>
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
      emptyLabel="Không có dữ liệu tồn kho theo cửa hàng."
      getRowKey={(r) => r.sku}
      columnSummary={(rs) => {
        const totals: Record<string, number> = {
          total: rs.reduce((s, r) => s + r.total, 0),
        };
        for (const b of BRANCH_COLUMNS) {
          totals[`branch_${b.code}`] = rs.reduce(
            (s, r) => s + (r.perBranch[b.code] ?? 0),
            0,
          );
        }
        return totals;
      }}
    />
  );
}
