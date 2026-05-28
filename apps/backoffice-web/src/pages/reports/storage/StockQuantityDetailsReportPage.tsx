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
import { useStockQuantityDetailsReport } from "../../../hooks/use-inventory-reports";
import type { StockPeriodRow } from "../../../api/inventory-reports";

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
];
const UNIT_OPTIONS = [
  { value: "__all__", label: "Tất cả ĐVT" },
  { value: "Đôi", label: "Đôi" },
];

interface ViewRow {
  itemId: string;
  sku: string;
  name: string;
  parentSku: string;
  parentName: string;
  color: string;
  size: string;
  unit: string;
  group: string;
  brand: string;
  openingQty: number;
  inQty: number;
  outQty: number;
  inPurchase: number;
  inTransfer: number;
  inReturn: number;
  inWh: number;
  inAdjust: number;
  inOther: number;
  outSale: number;
  outTransfer: number;
  outPurchaseReturn: number;
  outWh: number;
  outAdjust: number;
  outVoid: number;
  outOther: number;
}

function mapApiRow(row: StockPeriodRow): ViewRow {
  return {
    itemId: row.itemId,
    sku: row.sku,
    name: row.itemName,
    parentSku: row.parentSku ?? "",
    parentName: row.parentName ?? "",
    color: "",
    size: "",
    unit: row.unit,
    group: row.categoryName ?? "",
    brand: "",
    openingQty: row.openingQty,
    inQty: row.inQty,
    outQty: row.outQty,
    inPurchase: row.inQtyPurchase ?? 0,
    inTransfer: row.inQtyTransferIn ?? 0,
    inReturn: row.inQtyReturn ?? 0,
    inWh: 0,
    inAdjust: row.inQtyAdjustIn ?? 0,
    inOther: 0,
    outSale: row.outQtySale ?? 0,
    outTransfer: row.outQtyTransferOut ?? 0,
    outPurchaseReturn: 0,
    outWh: 0,
    outAdjust: row.outQtyAdjustOut ?? 0,
    outVoid: 0,
    outOther: 0,
  };
}

export function StockQuantityDetailsReportPage() {
  const filterFields: FilterField[] = [
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
        categoryFieldKey: "group",
      }),
    [filterValues, period],
  );

  const { data, isLoading } = useStockQuantityDetailsReport(apiFilters);
  const rows = useMemo<ViewRow[]>(
    () => (data?.data ?? []).map(mapApiRow),
    [data],
  );

  const num = "text-right tabular-nums";
  const inGrp = "Nhập trong kỳ";
  const outGrp = "Xuất trong kỳ";
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
    { key: "openingQty", label: "Tồn đầu kỳ", width: 110, headerClassName: "text-right", className: num, render: (r) => r.openingQty },
    { key: "inTotal",    group: inGrp, label: "Tổng",         width: 100, headerClassName: "text-right", className: num, render: (r) => r.inQty },
    { key: "inPurchase", group: inGrp, label: "Mua hàng",     width: 110, headerClassName: "text-right", className: num, render: (r) => r.inPurchase },
    { key: "inTransfer", group: inGrp, label: "Điều chuyển",  width: 120, headerClassName: "text-right", className: num, render: (r) => r.inTransfer },
    { key: "inReturn",   group: inGrp, label: "Hàng trả lại", width: 120, headerClassName: "text-right", className: num, render: (r) => r.inReturn },
    { key: "inWh",       group: inGrp, label: "Chuyển kho",   width: 110, headerClassName: "text-right", className: num, render: (r) => r.inWh },
    { key: "inAdjust",   group: inGrp, label: "Kiểm kê",      width: 110, headerClassName: "text-right", className: num, render: (r) => r.inAdjust },
    { key: "inOther",    group: inGrp, label: "Khác",         width: 100, headerClassName: "text-right", className: num, render: (r) => r.inOther },
    { key: "outTotal",          group: outGrp, label: "Tổng",            width: 100, headerClassName: "text-right", className: num, render: (r) => r.outQty },
    { key: "outSale",           group: outGrp, label: "Bán hàng",        width: 110, headerClassName: "text-right", className: num, render: (r) => r.outSale },
    { key: "outTransfer",       group: outGrp, label: "Điều chuyển",     width: 120, headerClassName: "text-right", className: num, render: (r) => r.outTransfer },
    { key: "outPurchaseReturn", group: outGrp, label: "Trả lại hàng mua", width: 140, headerClassName: "text-right", className: num, render: (r) => r.outPurchaseReturn },
    { key: "outWh",             group: outGrp, label: "Chuyển kho",      width: 110, headerClassName: "text-right", className: num, render: (r) => r.outWh },
    { key: "outAdjust",         group: outGrp, label: "Kiểm kê",         width: 110, headerClassName: "text-right", className: num, render: (r) => r.outAdjust },
    { key: "outVoid",           group: outGrp, label: "Hủy hàng",        width: 110, headerClassName: "text-right", className: num, render: (r) => r.outVoid },
    { key: "outOther",          group: outGrp, label: "Khác",            width: 100, headerClassName: "text-right", className: num, render: (r) => r.outOther },
    { key: "endingQty", label: "Tồn cuối kỳ", width: 120, headerClassName: "text-right", className: num, render: (r) => r.openingQty + r.inQty - r.outQty },
  ];

  return (
    <StorageReportShell<ViewRow>
      title="Chi tiết số lượng nhập xuất tồn kho"
      storageKey="reports/storage/stock-quantity-details"
      filterFields={filterFields}
      buildSubtitle={(values) => [
        { label: "Kho", value: resolveLabel(filterFields[0]!, values) },
        { label: "Nhóm hàng hóa", value: resolveLabel(filterFields[1]!, values) },
        { label: "Thống kê theo", value: resolveLabel(filterFields[2]!, values) },
        { label: "Đơn vị tính", value: resolveLabel(filterFields[3]!, values) },
      ]}
      columns={columns}
      rows={rows}
      loading={isLoading}
      emptyLabel="Không có dữ liệu chi tiết."
      getRowKey={(r, i) => `${r.itemId}-${i}`}
      initialPeriod={period}
      onApply={(next, nextPeriod) => {
        setFilterValues(next);
        setPeriod(nextPeriod);
      }}
      columnSummary={(rs) => {
        const sum = rs.reduce(
          (a, r) => ({
            o: a.o + r.openingQty,
            inT: a.inT + r.inQty,
            inP: a.inP + r.inPurchase,
            inTr: a.inTr + r.inTransfer,
            outT: a.outT + r.outQty,
            outS: a.outS + r.outSale,
          }),
          { o: 0, inT: 0, inP: 0, inTr: 0, outT: 0, outS: 0 },
        );
        return {
          openingQty: sum.o,
          inTotal: sum.inT,
          inPurchase: sum.inP,
          inTransfer: sum.inTr,
          outTotal: sum.outT,
          outSale: sum.outS,
          endingQty: sum.o + sum.inT - sum.outT,
        };
      }}
    />
  );
}
