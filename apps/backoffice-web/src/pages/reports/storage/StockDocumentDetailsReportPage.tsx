import { useMemo } from "react";
import { formatMoneyInteger } from "@erp/ui";
import {
  StorageReportShell,
  resolveLabel,
  type FilterField,
} from "./_shared";
import type { TableColumn } from "../../../components/table/BaseDataTable";
import { generateMockStockDocs, type MockStockDocLine } from "./_shared/mock";

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
const DOC_TYPE_OPTIONS = [
  { value: "__all__", label: "Tất cả" },
  { value: "PNK", label: "Phiếu nhập kho mua hàng" },
  { value: "PXK", label: "Phiếu xuất kho bán hàng" },
];

export function StockDocumentDetailsReportPage() {
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

  const rows = useMemo(() => generateMockStockDocs(), []);

  const num = "text-right tabular-nums";
  const fmt = (v: number) => (v ? formatMoneyInteger(v) : "");
  const columns: TableColumn<MockStockDocLine>[] = [
    { key: "date", label: "Ngày chứng từ", width: 140, render: (r) => r.date, filterKind: "date" },
    { key: "documentType", label: "Loại chứng từ", width: 200, render: (r) => r.documentType, filterKind: "select", filterOptions: DOC_TYPE_OPTIONS.slice(1).map((o) => ({ value: o.label, label: o.label })) },
    { key: "warehouse", label: "Kho", width: 180, render: (r) => r.warehouse },
    { key: "documentNumber", label: "Số chứng từ", width: 130, render: (r) => <span className="text-primary">{r.documentNumber}</span> },
    { key: "reference", label: "Tham chiếu", width: 120, render: (r) => r.reference },
    { key: "sku", label: "Mã SKU", width: 140, render: (r) => r.sku },
    { key: "name", label: "Tên hàng hóa", width: 220, render: (r) => r.name },
    { key: "unit", label: "Đơn vị tính", width: 110, render: (r) => r.unit },
    { key: "notes", label: "Ghi chú hàng hóa", width: 160, render: (r) => r.notes },
    { key: "group", label: "Nhóm hàng hóa", width: 140, render: (r) => r.group },
    { key: "parentSku", label: "SKU mẫu mã", width: 130, render: (r) => r.parentSku },
    { key: "parentName", label: "Tên mẫu mã", width: 130, render: (r) => r.parentName },
    { key: "color", label: "Màu sắc", width: 100, render: (r) => r.color },
    { key: "size", label: "Size", width: 80, render: (r) => r.size },
    { key: "inQty",       group: "Nhập kho", label: "Số lượng", width: 110, headerClassName: "text-right", className: num, render: (r) => r.inQty || "" },
    { key: "inUnitPrice", group: "Nhập kho", label: "Đơn giá",  width: 120, headerClassName: "text-right", className: num, render: (r) => fmt(r.inUnitPrice) },
    { key: "inValue",     group: "Nhập kho", label: "Giá trị",  width: 130, headerClassName: "text-right", className: num, render: (r) => fmt(r.inValue) },
    { key: "inSalePrice", group: "Nhập kho", label: "Giá bán",  width: 120, headerClassName: "text-right", className: num, render: (r) => fmt(r.inSalePrice) },
    { key: "outQty",       group: "Xuất kho", label: "Số lượng", width: 110, headerClassName: "text-right", className: num, render: (r) => r.outQty || "" },
    { key: "outUnitPrice", group: "Xuất kho", label: "Đơn giá",  width: 120, headerClassName: "text-right", className: num, render: (r) => fmt(r.outUnitPrice) },
    { key: "outValue",     group: "Xuất kho", label: "Giá trị",  width: 130, headerClassName: "text-right", className: num, render: (r) => fmt(r.outValue) },
    { key: "outSalePrice", group: "Xuất kho", label: "Giá bán",  width: 120, headerClassName: "text-right", className: num, render: (r) => fmt(r.outSalePrice) },
    { key: "customer", label: "Đối tượng", width: 160, render: (r) => r.customer },
    { key: "branchCode", label: "Mã cửa hàng", width: 130, render: (r) => r.branchCode },
    { key: "branchName", label: "Tên cửa hàng", width: 180, render: (r) => r.branchName },
    { key: "receiverBranchCode", label: "Mã cửa hàng nhận", width: 160, render: (r) => r.receiverBranchCode },
    { key: "receiverBranchName", label: "Tên cửa hàng nhận", width: 180, render: (r) => r.receiverBranchName },
  ];

  return (
    <StorageReportShell<MockStockDocLine>
      title="Bảng kê chi tiết phiếu nhập xuất kho"
      storageKey="reports/storage/stock-document-details"
      filterFields={filterFields}
      buildSubtitle={(values) => [
        { label: "Cửa hàng", value: resolveLabel(filterFields[0]!, values) },
        { label: "Nhóm hàng hóa", value: resolveLabel(filterFields[1]!, values) },
      ]}
      columns={columns}
      rows={rows}
      emptyLabel="Không có chứng từ trong kỳ."
      getRowKey={(r, i) => `${r.documentNumber}-${r.sku}-${i}`}
      columnSummary={(rs) => {
        const sum = rs.reduce(
          (a, r) => ({
            iq: a.iq + r.inQty,
            iv: a.iv + r.inValue,
            oq: a.oq + r.outQty,
            ov: a.ov + r.outValue,
          }),
          { iq: 0, iv: 0, oq: 0, ov: 0 },
        );
        return {
          inQty: sum.iq,
          inValue: sum.iv ? formatMoneyInteger(sum.iv) : "",
          outQty: sum.oq,
          outValue: sum.ov ? formatMoneyInteger(sum.ov) : "",
        };
      }}
    />
  );
}
