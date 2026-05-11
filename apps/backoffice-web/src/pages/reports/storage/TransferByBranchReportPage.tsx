import { useMemo } from "react";
import { formatMoneyInteger } from "@erp/ui";
import {
  StorageReportShell,
  resolveLabel,
  type FilterField,
} from "./_shared";
import type { TableColumn } from "../../../components/table/BaseDataTable";

const SOURCE_STORE_OPTIONS = [
  { value: "MTCANTHO", label: "Giày MT Cần Thơ" },
];
const TARGET_STORE_OPTIONS = [
  { value: "MTCANTHO", label: "Giày MT Cần Thơ" },
  { value: "MTDANANG", label: "Giày MT Đà Nẵng" },
];
const GROUP_OPTIONS = [
  { value: "__all__", label: "Tất cả nhóm" },
  { value: "Giày nam", label: "Giày nam" },
  { value: "Giày nữ", label: "Giày nữ" },
  { value: "Sandal nữ", label: "Sandal nữ" },
];
const STAT_OPTIONS = [
  { value: "item", label: "Hàng hóa" },
  { value: "parent", label: "Mẫu mã" },
];
const UNIT_OPTIONS = [
  { value: "__all__", label: "Tất cả ĐVT" },
  { value: "Đôi", label: "Đôi" },
];

interface TransferByBranchRow {
  sku: string;
  name: string;
  parentSku: string;
  parentName: string;
  color: string;
  size: string;
  unit: string;
  group: string;
  brand: string;
  targetBranch: string;
  outQty: number;
  outAvgPrice: number;
  outValue: number;
  inQty: number;
  inAvgPrice: number;
  inValue: number;
}

const MOCK_ROWS: TransferByBranchRow[] = [
  {
    sku: "ABA2950-D-40",
    name: "Giày nam ABA2950-D-40",
    parentSku: "ABA2950",
    parentName: "ABA2950",
    color: "Đen",
    size: "40",
    unit: "Đôi",
    group: "Giày nam",
    brand: "Giày MT",
    targetBranch: "Giày MT Đà Nẵng",
    outQty: 3,
    outAvgPrice: 340_000,
    outValue: 1_020_000,
    inQty: 0,
    inAvgPrice: 0,
    inValue: 0,
  },
  {
    sku: "ABA3026-N-40",
    name: "Giày nam ABA3026-N-40",
    parentSku: "ABA3026",
    parentName: "ABA3026",
    color: "Nâu",
    size: "40",
    unit: "Đôi",
    group: "Giày nam",
    brand: "Giày MT",
    targetBranch: "Giày MT Đà Nẵng",
    outQty: 2,
    outAvgPrice: 340_000,
    outValue: 680_000,
    inQty: 0,
    inAvgPrice: 0,
    inValue: 0,
  },
  {
    sku: "MY63652-D-37",
    name: "Sandal nữ MY63652-D-37",
    parentSku: "MY63652",
    parentName: "MY63652",
    color: "Đen",
    size: "37",
    unit: "Đôi",
    group: "Sandal nữ",
    brand: "Giày MT",
    targetBranch: "Giày MT Đà Nẵng",
    outQty: 4,
    outAvgPrice: 340_000,
    outValue: 1_360_000,
    inQty: 0,
    inAvgPrice: 0,
    inValue: 0,
  },
];

export function TransferByBranchReportPage() {
  const filterFields: FilterField[] = [
    { key: "sourceStore", label: "Cửa hàng xuất", type: "select", options: SOURCE_STORE_OPTIONS },
    {
      key: "targetStore",
      label: "Cửa hàng nhận",
      type: "radio-scope",
      allLabel: "Tất cả",
      scopeLabel: "Chọn cửa hàng",
      options: TARGET_STORE_OPTIONS,
    },
    { key: "group", label: "Nhóm hàng hóa", type: "select", options: GROUP_OPTIONS },
    { key: "stat", label: "Thống kê theo", type: "select", options: STAT_OPTIONS },
    { key: "unit", label: "Đơn vị tính", type: "select", options: UNIT_OPTIONS },
    { key: "period", label: "Kỳ báo cáo", type: "period" },
  ];

  const num = "text-right tabular-nums";
  const columns: TableColumn<TransferByBranchRow>[] = [
    { key: "sku", label: "Mã SKU", width: 140, render: (r) => r.sku },
    { key: "name", label: "Tên hàng hóa", width: 220, render: (r) => r.name },
    { key: "parentSku", label: "Mã SKU mẫu mã", width: 140, render: (r) => r.parentSku },
    { key: "parentName", label: "Tên Mẫu mã", width: 150, render: (r) => r.parentName },
    { key: "color", label: "Màu sắc", width: 100, render: (r) => r.color },
    { key: "size", label: "Size", width: 80, render: (r) => r.size },
    { key: "unit", label: "Đơn vị tính", width: 110, render: (r) => r.unit },
    { key: "group", label: "Nhóm hàng hóa", width: 140, render: (r) => r.group },
    { key: "brand", label: "Thương hiệu", width: 120, render: (r) => r.brand },
    { key: "targetBranch", label: "Cửa hàng nhận điều chuyển", width: 220, render: (r) => r.targetBranch },
    { key: "outQty",      label: "Số lượng xuất",        width: 130, headerClassName: "text-right", className: num, render: (r) => r.outQty },
    { key: "outAvgPrice", label: "Đơn giá xuất trung bình", width: 160, headerClassName: "text-right", className: num, render: (r) => formatMoneyInteger(r.outAvgPrice) },
    { key: "outValue",    label: "Giá trị xuất",         width: 140, headerClassName: "text-right", className: num, render: (r) => formatMoneyInteger(r.outValue) },
    { key: "inQty",       label: "Số lượng nhập",        width: 130, headerClassName: "text-right", className: num, render: (r) => r.inQty },
    { key: "inAvgPrice",  label: "Đơn giá nhập trung bình", width: 160, headerClassName: "text-right", className: num, render: (r) => formatMoneyInteger(r.inAvgPrice) },
    { key: "inValue",     label: "Giá trị nhập",         width: 140, headerClassName: "text-right", className: num, render: (r) => formatMoneyInteger(r.inValue) },
  ];

  const rows = useMemo(() => MOCK_ROWS, []);

  return (
    <StorageReportShell<TransferByBranchRow>
      title="Tổng hợp hàng hóa điều chuyển theo cửa hàng"
      storageKey="reports/storage/transfer-by-branch"
      filterFields={filterFields}
      buildSubtitle={(values) => [
        { label: "Cửa hàng xuất", value: resolveLabel(filterFields[0]!, values) },
        { label: "Cửa hàng nhận", value: resolveLabel(filterFields[1]!, values) },
        { label: "Nhóm hàng hóa", value: resolveLabel(filterFields[2]!, values) },
        { label: "Thống kê theo", value: resolveLabel(filterFields[3]!, values) },
      ]}
      columns={columns}
      rows={rows}
      emptyLabel="Không có dữ liệu điều chuyển theo cửa hàng."
      getRowKey={(r) => r.sku}
      columnSummary={(rs) => {
        const sum = rs.reduce(
          (a, r) => ({
            oq: a.oq + r.outQty,
            ov: a.ov + r.outValue,
            iq: a.iq + r.inQty,
            iv: a.iv + r.inValue,
          }),
          { oq: 0, ov: 0, iq: 0, iv: 0 },
        );
        return {
          outQty: sum.oq,
          outValue: formatMoneyInteger(sum.ov),
          inQty: sum.iq,
          inValue: formatMoneyInteger(sum.iv),
        };
      }}
    />
  );
}
