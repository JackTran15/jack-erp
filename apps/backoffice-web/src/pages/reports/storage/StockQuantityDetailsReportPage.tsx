import { useMemo } from "react";
import {
  StorageReportShell,
  resolveLabel,
  type FilterField,
} from "./_shared";
import type { TableColumn } from "../../../components/table/BaseDataTable";
import { generateMockStock, type MockStockSku } from "./_shared/mock";

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

interface ExpandedRow extends MockStockSku {
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

export function StockQuantityDetailsReportPage() {
  const filterFields: FilterField[] = [
    { key: "warehouse", label: "Kho", type: "select", options: WAREHOUSE_OPTIONS },
    { key: "group", label: "Nhóm hàng hóa", type: "select", options: GROUP_OPTIONS },
    { key: "stat", label: "Thống kê theo", type: "select", options: STAT_OPTIONS },
    { key: "unit", label: "Đơn vị tính", type: "select", options: UNIT_OPTIONS },
    { key: "period", label: "Kỳ báo cáo", type: "period" },
  ];

  const rows = useMemo<ExpandedRow[]>(
    () =>
      generateMockStock().map((r, i) => ({
        ...r,
        inPurchase: i % 3 === 0 ? r.inQty : 0,
        inTransfer: i % 5 === 0 ? r.inQty : 0,
        inReturn: 0,
        inWh: 0,
        inAdjust: 0,
        inOther: 0,
        outSale: r.outQty,
        outTransfer: 0,
        outPurchaseReturn: 0,
        outWh: 0,
        outAdjust: 0,
        outVoid: 0,
        outOther: 0,
      })),
    [],
  );

  const num = "text-right tabular-nums";
  const inGrp = "Nhập trong kỳ";
  const outGrp = "Xuất trong kỳ";
  const columns: TableColumn<ExpandedRow>[] = [
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
    <StorageReportShell<ExpandedRow>
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
      emptyLabel="Không có dữ liệu chi tiết."
      getRowKey={(r, i) => `${r.sku}-${r.warehouseCode}-${i}`}
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
