import { useMemo } from "react";
import { formatMoneyInteger } from "@erp/ui";
import {
  StorageReportShell,
  resolveLabel,
  type FilterField,
} from "./_shared";
import type { TableColumn } from "../../../components/table/BaseDataTable";
import { generateMockStock, type MockStockSku } from "./_shared/mock";

const STORE_OPTIONS = [
  { value: "MTCANTHO", label: "Giày MT Cần Thơ" },
  { value: "MTDANANG", label: "Giày MT Đà Nẵng" },
];
const GROUP_OPTIONS = [
  { value: "__all__", label: "Tất cả nhóm" },
  { value: "Giày nam", label: "Giày nam" },
  { value: "Giày nữ", label: "Giày nữ" },
  { value: "Sandal nữ", label: "Sandal nữ" },
  { value: "Dép nữ", label: "Dép nữ" },
  { value: "Dép nam", label: "Dép nam" },
];

export function StockSummaryByBranchReportPage() {
  const filterFields: FilterField[] = [
    {
      key: "store",
      label: "Cửa hàng",
      type: "radio-scope",
      allLabel: "Tất cả",
      scopeLabel: "Theo nhóm cửa hàng",
      options: STORE_OPTIONS,
    },
    { key: "group", label: "Nhóm hàng hóa", type: "select", options: GROUP_OPTIONS },
    { key: "period", label: "Kỳ báo cáo", type: "period" },
  ];

  const rows = useMemo(() => generateMockStock(), []);

  const num = "text-right tabular-nums";
  const columns: TableColumn<MockStockSku>[] = [
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
    <StorageReportShell<MockStockSku>
      title="Tổng hợp nhập xuất tồn kho theo cửa hàng"
      storageKey="reports/storage/stock-summary-by-branch"
      filterFields={filterFields}
      buildSubtitle={(values) => [
        { label: "Cửa hàng", value: resolveLabel(filterFields[0]!, values) },
        { label: "Nhóm hàng hóa", value: resolveLabel(filterFields[1]!, values) },
      ]}
      columns={columns}
      rows={rows}
      emptyLabel="Không có dữ liệu."
      getRowKey={(r, i) => `${r.sku}-${r.branchCode}-${i}`}
      columnSummary={(rs) => {
        const sum = rs.reduce(
          (a, r) => ({
            o: a.o + r.openingQty,
            ov: a.ov + r.openingValue,
            i: a.i + r.inQty,
            iv: a.iv + r.inValue,
            x: a.x + r.outQty,
            xv: a.xv + r.outValue,
          }),
          { o: 0, ov: 0, i: 0, iv: 0, x: 0, xv: 0 },
        );
        return {
          openingQty: sum.o,
          openingValue: formatMoneyInteger(sum.ov),
          inQty: sum.i,
          inValue: formatMoneyInteger(sum.iv),
          outQty: sum.x,
          outValue: formatMoneyInteger(sum.xv),
          endingQty: sum.o + sum.i - sum.x,
          endingValue: formatMoneyInteger(sum.ov + sum.iv - sum.xv),
        };
      }}
    />
  );
}
