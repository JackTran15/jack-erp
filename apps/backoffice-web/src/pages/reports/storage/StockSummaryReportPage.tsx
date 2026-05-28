import { useMemo, useState } from "react";
import {
  formatMoneyInteger,
  resolvePeriodRange,
  type PeriodValue,
} from "@erp/ui";
import {
  StorageReportShell,
  buildApiFilters,
  resolveLabel,
  type FilterField,
  type FilterValues,
} from "./_shared";
import type { TableColumn } from "../../../components/table/BaseDataTable";
import { useStockSummaryReport } from "../../../hooks/use-inventory-reports";
import type { StockPeriodRow } from "../../../api/inventory-reports";

const STORE_OPTIONS = [
  { value: "MTCANTHO", label: "Giày MT Cần Thơ" },
  { value: "MTDANANG", label: "Giày MT Đà Nẵng" },
];
const WAREHOUSE_OPTIONS = [
  { value: "__all__", label: "Tất cả kho" },
  { value: "MTCANTHO", label: "SHOWROOM CẦN THƠ" },
  { value: "MTDANANG", label: "SHOWROOM ĐÀ NẴNG" },
];
const GROUP_OPTIONS = [
  { value: "__all__", label: "Tất cả nhóm" },
  { value: "Giày nam", label: "Giày nam" },
  { value: "Giày nữ", label: "Giày nữ" },
  { value: "Sandal nữ", label: "Sandal nữ" },
  { value: "Dép nữ", label: "Dép nữ" },
  { value: "Dép nam", label: "Dép nam" },
];
const STAT_OPTIONS = [
  { value: "item", label: "Hàng hóa" },
  { value: "parent", label: "Mẫu mã" },
  { value: "group", label: "Nhóm hàng hóa" },
];
const UNIT_OPTIONS = [
  { value: "__all__", label: "Tất cả ĐVT" },
  { value: "Đôi", label: "Đôi" },
];

/** Row shape consumed by the existing column definitions. */
interface ViewRow {
  itemId: string;
  sku: string;
  name: string;
  unit: string;
  group: string;
  parentSku: string;
  parentName: string;
  brand: string;
  color: string;
  size: string;
  positionCode: string;
  positionName: string;
  branchCode: string;
  branch: string;
  supplier: string;
  warehouseCode: string;
  openingQty: number;
  openingValue: number;
  inQty: number;
  inValue: number;
  outQty: number;
  outValue: number;
  transferOutQty: number;
  transferOutValue: number;
  incomingQty: number;
  incomingValue: number;
}

function mapApiRow(row: StockPeriodRow): ViewRow {
  return {
    itemId: row.itemId,
    sku: row.sku,
    name: row.itemName,
    unit: row.unit,
    group: row.categoryName ?? "",
    // Parent SKU / brand / color / size / supplier are not denormalized into
    // the period-snapshot rows yet — leave empty until the backend joins them.
    parentSku: row.parentSku ?? "",
    parentName: row.parentName ?? "",
    brand: "",
    color: "",
    size: "",
    positionCode: row.locationCode ?? "",
    positionName: row.locationName ?? "",
    branchCode: row.branchCode ?? "",
    branch: row.branchName ?? "",
    supplier: "",
    warehouseCode: row.locationCode ?? row.branchCode ?? "",
    openingQty: row.openingQty,
    openingValue: row.openingValue,
    inQty: row.inQty,
    inValue: row.inValue,
    outQty: row.outQty,
    outValue: row.outValue,
    transferOutQty: 0,
    transferOutValue: 0,
    incomingQty: 0,
    incomingValue: 0,
  };
}

export function StockSummaryReportPage() {
  const filterFields: FilterField[] = [
    {
      key: "store",
      label: "Cửa hàng",
      type: "radio-scope",
      allLabel: "Tất cả",
      scopeLabel: "Theo nhóm cửa hàng",
      options: STORE_OPTIONS,
      placeholder: "Chọn cửa hàng",
    },
    { key: "warehouse", label: "Kho", type: "select", options: WAREHOUSE_OPTIONS },
    { key: "group", label: "Nhóm hàng hóa", type: "select", options: GROUP_OPTIONS },
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
        storeFieldKey: "store",
        categoryFieldKey: "group",
      }),
    [filterValues, period],
  );

  const { data, isLoading } = useStockSummaryReport(apiFilters);
  const rows = useMemo<ViewRow[]>(
    () => (data?.data ?? []).map(mapApiRow),
    [data],
  );

  const num = "text-right tabular-nums";
  const columns: TableColumn<ViewRow>[] = [
    { key: "image", label: "Ảnh hàng hóa", width: 110, filterKind: "none", render: () => (
        <div className="flex h-10 w-10 items-center justify-center rounded bg-muted text-xs text-muted-foreground">📦</div>
      ) },
    { key: "name", label: "Tên hàng hóa", width: 240, render: (r) => r.name },
    { key: "parentSku", label: "Mã SKU mẫu mã", width: 140, render: (r) => r.parentSku },
    { key: "parentName", label: "Tên Mẫu mã", width: 160, render: (r) => r.parentName },
    { key: "color", label: "Màu sắc", width: 100, render: (r) => r.color },
    { key: "size", label: "Size", width: 80, render: (r) => r.size },
    { key: "unit", label: "Đơn vị tính", width: 110, render: (r) => r.unit, filterKind: "select", filterOptions: UNIT_OPTIONS.slice(1) },
    { key: "group", label: "Nhóm hàng hóa", width: 140, render: (r) => r.group },
    { key: "brand", label: "Thương hiệu", width: 120, render: (r) => r.brand },
    { key: "sku", label: "Mã SKU", width: 140, render: (r) => r.sku },
    { key: "positionCode", label: "Mã vị trí", width: 110, render: (r) => r.positionCode },
    { key: "positionName", label: "Tên vị trí", width: 110, render: (r) => r.positionName },
    { key: "openingQty",   group: "Tồn đầu kỳ",   label: "Số lượng", width: 110, headerClassName: "text-right", className: num, render: (r) => r.openingQty },
    { key: "openingValue", group: "Tồn đầu kỳ",   label: "Giá trị",  width: 130, headerClassName: "text-right", className: num, render: (r) => formatMoneyInteger(r.openingValue) },
    { key: "inQty",        group: "Nhập trong kỳ", label: "Số lượng", width: 110, headerClassName: "text-right", className: num, render: (r) => r.inQty },
    { key: "inValue",      group: "Nhập trong kỳ", label: "Giá trị",  width: 130, headerClassName: "text-right", className: num, render: (r) => formatMoneyInteger(r.inValue) },
    { key: "outQty",       group: "Xuất trong kỳ", label: "Số lượng", width: 110, headerClassName: "text-right", className: num, render: (r) => r.outQty },
    { key: "outValue",     group: "Xuất trong kỳ", label: "Giá trị",  width: 130, headerClassName: "text-right", className: num, render: (r) => formatMoneyInteger(r.outValue) },
    { key: "endingQty",    group: "Tồn cuối kỳ",   label: "Số lượng", width: 110, headerClassName: "text-right", className: num, render: (r) => r.openingQty + r.inQty - r.outQty },
    { key: "endingValue",  group: "Tồn cuối kỳ",   label: "Giá trị",  width: 140, headerClassName: "text-right", className: num, render: (r) => formatMoneyInteger(r.openingValue + r.inValue - r.outValue) },
    { key: "transferOutQty",   group: "Đang chuyển đi", label: "Số lượng", width: 110, headerClassName: "text-right", className: num, render: (r) => r.transferOutQty },
    { key: "transferOutValue", group: "Đang chuyển đi", label: "Giá trị",  width: 130, headerClassName: "text-right", className: num, render: (r) => formatMoneyInteger(r.transferOutValue) },
    { key: "incomingQty",   group: "Sắp nhận về", label: "Số lượng", width: 110, headerClassName: "text-right", className: num, render: (r) => r.incomingQty },
    { key: "incomingValue", group: "Sắp nhận về", label: "Giá trị",  width: 130, headerClassName: "text-right", className: num, render: (r) => formatMoneyInteger(r.incomingValue) },
    { key: "supplier", label: "Nhà cung cấp", width: 160, render: (r) => r.supplier },
  ];

  return (
    <StorageReportShell<ViewRow>
      title="Tổng hợp nhập xuất tồn kho"
      storageKey="reports/storage/stock-summary"
      filterFields={filterFields}
      buildSubtitle={(values) => [
        { label: "Cửa hàng", value: resolveLabel(filterFields[0]!, values) },
        { label: "Kho", value: resolveLabel(filterFields[1]!, values) },
        { label: "Nhóm hàng hóa", value: resolveLabel(filterFields[2]!, values) },
        { label: "Thống kê theo", value: resolveLabel(filterFields[3]!, values) },
      ]}
      columns={columns}
      rows={rows}
      loading={isLoading}
      emptyLabel="Không có dữ liệu cho khoảng thời gian này."
      getRowKey={(r, i) => `${r.itemId}-${r.warehouseCode}-${i}`}
      initialPeriod={period}
      onApply={(next, nextPeriod) => {
        setFilterValues(next);
        setPeriod(nextPeriod);
      }}
      columnSummary={(rs) => {
        const sum = rs.reduce(
          (a, r) => ({
            o: a.o + r.openingQty,
            ov: a.ov + r.openingValue,
            i: a.i + r.inQty,
            iv: a.iv + r.inValue,
            x: a.x + r.outQty,
            xv: a.xv + r.outValue,
            t: a.t + r.transferOutQty,
            tv: a.tv + r.transferOutValue,
            ic: a.ic + r.incomingQty,
            icv: a.icv + r.incomingValue,
          }),
          { o: 0, ov: 0, i: 0, iv: 0, x: 0, xv: 0, t: 0, tv: 0, ic: 0, icv: 0 },
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
          transferOutQty: sum.t,
          transferOutValue: formatMoneyInteger(sum.tv),
          incomingQty: sum.ic,
          incomingValue: formatMoneyInteger(sum.icv),
        };
      }}
    />
  );
}
